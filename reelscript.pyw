import webview
import os
import json
import subprocess
import sys
from datetime import datetime

if len(sys.argv) > 2 and sys.argv[1] == '--run-dialog':
    exec(sys.argv[2])
    sys.exit(0)

# Ensure the script's directory is in the Python path to find local modules like 'editor.py'
if getattr(sys, 'frozen', False):
    current_dir = sys._MEIPASS
else:
    current_dir = os.path.dirname(os.path.abspath(__file__))

if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

import editor  # type: ignore

def run_dialog_script(script):
    import tempfile
    fd, temp_path = tempfile.mkstemp(suffix='.txt')
    os.close(fd)
    
    safe_script = f"""
import sys
def print(*args, **kwargs):
    with open(r'''{temp_path}''', 'w', encoding='utf-8') as _temp_f:
        _temp_f.write(" ".join(str(a) for a in args))
""" + script

    python_exe = sys.executable
    if hasattr(sys, 'frozen'):
        cmd = [python_exe, '--run-dialog', safe_script]
    else:
        if python_exe.endswith('pythonw.exe'):
            python_exe = python_exe.replace('pythonw.exe', 'python.exe')
        cmd = [python_exe, '-c', safe_script]
        
    creationflags = 0
    if os.name == 'nt':
        creationflags = 0x08000000  # CREATE_NO_WINDOW
        
    try:
        subprocess.check_call(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags
        )
        with open(temp_path, 'r', encoding='utf-8') as f:
            result = f.read().strip()
        os.remove(temp_path)
        return result if result and result != "None" and result != "" else None
    except Exception:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except: pass
        return None

active_window = None

class BackendAPI:
    def __init__(self):
        # Determine the directory where the program is running from
        if getattr(sys, 'frozen', False):
            run_dir = os.path.dirname(sys.executable)
        else:
            run_dir = os.path.dirname(os.path.abspath(__file__))

        # Check if we can write to run_dir (portable mode)
        use_portable = False
        try:
            test_file = os.path.join(run_dir, ".write_test")
            with open(test_file, "w") as f:
                pass
            os.remove(test_file)
            use_portable = True
        except (IOError, OSError, PermissionError):
            use_portable = False

        if use_portable:
            self.app_data_dir = run_dir
            self.backup_dir = os.path.join(run_dir, "Backups")
            self.settings_file = os.path.join(run_dir, "settings.json")
        else:
            self.app_data_dir = os.path.join(os.path.expanduser("~"), "Documents", "ReelScript")
            self.backup_dir = os.path.join(self.app_data_dir, "Backups")
            self.settings_file = os.path.join(self.backup_dir, "settings.json")

        self.save_directory = ""
        self.mindmap_data = {}
        
        if not os.path.exists(self.backup_dir):
            try:
                os.makedirs(self.backup_dir)
            except Exception:
                pass

        # Migrate existing settings to portable if they exist
        legacy_settings_file = os.path.join(os.path.expanduser("~"), "Documents", "ReelScript", "Backups", "settings.json")
        if use_portable and not os.path.exists(self.settings_file) and os.path.exists(legacy_settings_file):
            try:
                import shutil
                shutil.copy2(legacy_settings_file, self.settings_file)
            except Exception:
                pass
            
        self.personal_dict = set()
        self.spell = None
        
    def load_settings(self):
        settings = {}
        if os.path.exists(self.settings_file):
            try:
                with open(self.settings_file, "r") as f:
                    settings = json.load(f)
            except Exception:
                pass
        if settings.get("geminiApiKey"):
            os.environ["GEMINI_API_KEY"] = settings.get("geminiApiKey")
        return settings

    def save_settings(self, settings):
        try:
            with open(self.settings_file, "w") as f:
                json.dump(settings, f, indent=4)
            if settings.get("geminiApiKey"):
                os.environ["GEMINI_API_KEY"] = settings.get("geminiApiKey")
            return True
        except Exception as e:
            return False

    def set_api_key(self, api_key):
        os.environ["GEMINI_API_KEY"] = api_key
        return True

    def _safe_save_dialog(self, default_name, ext, filetypes):
        safe_name = "".join(c for c in default_name if c not in r'\/:*?"<>|')
        ft_str = str(filetypes)
        script = f"""
import tkinter as tk
from tkinter import filedialog
root = tk.Tk()
root.withdraw()
root.attributes('-topmost', True)
file = filedialog.asksaveasfilename(
    parent=root, 
    title="Export Screenplay",
    initialfile="{safe_name}",
    defaultextension="{ext}",
    filetypes={ft_str}
)
print(file)
"""
        return run_dialog_script(script)

    def save_project_dialog(self, content, project_name="Untitled Project"):
        safe_name = "".join(c for c in project_name if c not in r'\/:*?"<>|')
        script = f"""
import tkinter as tk
from tkinter import filedialog
root = tk.Tk()
root.withdraw()
root.attributes('-topmost', True)
file = filedialog.asksaveasfilename(
parent=root,
title="Save Project As",
initialfile="{safe_name}.rsp",
defaultextension=".rsp",
filetypes=[('ReelScript Project', '*.rsp'), ('Legacy KindredScript Project', '*.ksp')]
)
print(file)
"""
        filepath = run_dialog_script(script)
        if filepath and filepath != "None":
            try:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(content)
                return filepath
            except Exception as e:
                return f"Error: {str(e)}"
        return None

    def is_cloud_path(self, filepath):
        if not filepath:
            return False
        lower_path = filepath.lower()
        cloud_keywords = [
            "google drive", "gdrive", "onedrive", "dropbox", 
            "boxsync", "icloud", "my drive", "shared drives", "google-drive"
        ]
        if any(kw in lower_path for kw in cloud_keywords):
            return True
        return False

    def save_project(self, content, filepath):
        try:
            if self.is_cloud_path(filepath):
                return "Error: Saving directly to Google Drive/Cloud folders is disabled to protect shared project files. Please save to a local folder, then use the Share feature to copy it to the cloud."
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
            return filepath
        except Exception as e:
            return f"Error: {str(e)}"
    def open_project_dialog(self):
        script = """
import tkinter as tk
from tkinter import filedialog
root = tk.Tk()
root.withdraw()
root.attributes('-topmost', True)
file = filedialog.askopenfilename(
    parent=root, 
    title="Open Project",
    filetypes=[('ReelScript Project', '*.rsp'), ('Legacy KindredScript Project', '*.ksp'), ('All Files', '*.*')]
)
print(file)
"""
        filepath = run_dialog_script(script)
        if filepath and filepath != "None" and os.path.exists(filepath):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    return {'filepath': filepath, 'data': f.read()}
            except Exception as e:
                return {'error': str(e)}
        return None

    def open_recent_project(self, filepath):
        if filepath and os.path.exists(filepath):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    return {'filepath': filepath, 'data': f.read()}
            except Exception as e:
                return {'error': 'File not found.'}
        return {'error': 'File not found.'}

    def choose_directory(self):
        script = """
import tkinter as tk
from tkinter import filedialog
root = tk.Tk()
root.withdraw()
root.attributes('-topmost', True)
folder = filedialog.askdirectory(parent=root, title="Select Backup Folder")
print(folder)
"""
        return run_dialog_script(script)

    def get_default_local_dir(self):
        return self.app_data_dir

    def open_file_dialog(self):
        script = """
import tkinter as tk
from tkinter import filedialog
root = tk.Tk()
root.withdraw()
root.attributes('-topmost', True)
file = filedialog.askopenfilename(
    parent=root, 
    title="Import Screenplay",
    filetypes=[('Supported Documents', '*.txt *.html *.pdf *.fountain *.fdx'), ('All Files', '*.*')]
)
print(file)
"""
        filepath = run_dialog_script(script)
        if filepath and os.path.exists(filepath):
            ext = filepath.split('.')[-1].lower()
            try:
                import base64
                with open(filepath, 'rb') as f:
                    return {'ext': ext, 'data': base64.b64encode(f.read()).decode('utf-8')}
            except Exception as e:
                return {'error': str(e)}
        return None

    def open_url(self, url):
        import webbrowser
        webbrowser.open(url)
        return True

    def open_manual(self):
        try:
            import pathlib
            # First look in current_dir (where the resources reside)
            manual_path = os.path.join(current_dir, "manual.html")
            if os.path.exists(manual_path):
                import webview
                webview.create_window('ReelScript Manual', url=pathlib.Path(manual_path).as_uri(), js_api=self, width=1024, height=768, text_select=True)
                return True
                
            # Fallback to run directory
            if getattr(sys, 'frozen', False):
                run_dir = os.path.dirname(sys.executable)
            else:
                run_dir = os.path.dirname(os.path.abspath(__file__))
            manual_path = os.path.join(run_dir, "manual.html")
            if os.path.exists(manual_path):
                import webview
                webview.create_window('ReelScript Manual', url=pathlib.Path(manual_path).as_uri(), js_api=self, width=1024, height=768, text_select=True)
                return True
        except Exception:
            pass
        return False

    def open_writers_guide(self):
        try:
            import pathlib
            if getattr(sys, 'frozen', False):
                run_dir = os.path.dirname(sys.executable)
            else:
                run_dir = os.path.dirname(os.path.abspath(__file__))
            
            # 1. Try relative to executable (installer puts it here)
            guide_path = os.path.join(run_dir, "writers_guide.html")
            if os.path.exists(guide_path):
                import webview
                webview.create_window("Screenplay Writer's Guide", url=pathlib.Path(guide_path).as_uri(), js_api=self, width=1024, height=768, text_select=True)
                return True
                
            # 2. Try MEIPASS (one-file execution without installer)
            if hasattr(sys, '_MEIPASS'):
                guide_path = os.path.join(sys._MEIPASS, "writers_guide.html")
                if os.path.exists(guide_path):
                    import webview
                    webview.create_window("Screenplay Writer's Guide", url=pathlib.Path(guide_path).as_uri(), js_api=self, width=1024, height=768, text_select=True)
                    return True
                    
            # 3. Fallback to current_dir
            guide_path = os.path.join(current_dir, "writers_guide.html")
            if os.path.exists(guide_path):
                import webview
                webview.create_window("Screenplay Writer's Guide", url=pathlib.Path(guide_path).as_uri(), js_api=self, width=1024, height=768, text_select=True)
                return True
                
        except Exception as e:
            print(f"Error opening writer's guide: {e}")
        return False

    def _enforce_backup_limit(self, directory, prefix, max_backups):
        if not directory or not os.path.exists(directory) or max_backups <= 0:
            return
        try:
            files = []
            for f in os.listdir(directory):
                if f.startswith(prefix) and f.endswith(".html"):
                    full_path = os.path.join(directory, f)
                    if os.path.isfile(full_path):
                        files.append((full_path, os.path.getmtime(full_path)))
            files.sort(key=lambda x: x[1])
            if len(files) > max_backups:
                for i in range(len(files) - max_backups):
                    os.remove(files[i][0])
        except Exception:
            pass

    def save_backup(self, content, cloud_path=None, local_path=None, project_name="AutoBackup", max_backups=5):
        """This is called directly from JavaScript, bypassing web browser security."""
        try:
            messages = []
            
            project_name = project_name or "AutoBackup"
            safe_name = "".join(c for c in project_name if c not in r'\/:*?"<>|')
            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            filename = f"{safe_name}_Backup_{timestamp}.html"
            prefix = f"{safe_name}_Backup_"
            
            # Local Backup
            actual_local = self.backup_dir
            if local_path and os.path.exists(local_path):
                actual_local = local_path
                
            try:
                project_local_dir = os.path.join(actual_local, safe_name)
                if not os.path.exists(project_local_dir):
                    os.makedirs(project_local_dir)
                    
                local_filepath = os.path.join(project_local_dir, filename)
                with open(local_filepath, "w", encoding="utf-8") as f:
                    f.write(content)
                self._enforce_backup_limit(project_local_dir, prefix, max_backups)
                messages.append("Local")
            except Exception:
                pass
                    
            # Cloud Backup
            if cloud_path and os.path.exists(cloud_path):
                try:
                    project_cloud_dir = os.path.join(cloud_path, safe_name)
                    if not os.path.exists(project_cloud_dir):
                        os.makedirs(project_cloud_dir)
                        
                    cloud_filepath = os.path.join(project_cloud_dir, filename)
                    with open(cloud_filepath, "w", encoding="utf-8") as f:
                        f.write(content)
                    self._enforce_backup_limit(project_cloud_dir, prefix, max_backups)
                    messages.append("Cloud")
                except Exception:
                    pass

            if messages:
                return f"Natively Backed Up: {' & '.join(messages)}"
            return "Backup Failed or No Paths Found"
        except Exception as e:
            return f"Error: {str(e)}"

    def export_pdf(self, lines, project_name="Screenplay", export_config=None):
        if export_config is None:
            export_config = {}
            
        """Opens a native save dialog and generates a formatted PDF."""
        filepath = self._safe_save_dialog(f'{project_name}.pdf', '.pdf', [('PDF Files', '*.pdf')])
        if not filepath:
            return "Export cancelled."
        
        try:
            import fpdf
        except ImportError:
            return "Missing library. Please run: pip install fpdf"
            
        try:
            show_numbers = export_config.get("showPageNumbers", False)
            start_page = export_config.get("startPageNumber", 2)
            title_lines = export_config.get("titleLines", [])

            class ScreenplayPDF(fpdf.FPDF):
                def __init__(self, show_page_numbers=False, start_page=2):
                    super().__init__(unit='in', format='Letter')
                    self.show_page_numbers = show_page_numbers
                    self.current_script_page = start_page
                    self.in_title_page = True

                def header(self):
                    if not self.in_title_page and self.show_page_numbers:
                        self.set_font("Courier", size=12)
                        self.set_xy(7.0, 0.5)
                        self.cell(w=0.5, h=0.16, text=f"{self.current_script_page}.", align='R')  # type: ignore
                        self.current_script_page += 1
                    self.set_margins(left=1.5, top=1.0, right=1.0)
                    self.set_xy(1.5, 1.0)

            pdf = ScreenplayPDF(show_page_numbers=show_numbers, start_page=start_page)
            pdf.set_margins(left=1.5, top=1.0, right=1.0)
            pdf.set_auto_page_break(auto=True, margin=1.0)
            
            def hex_to_rgb(h_color):
                try:
                    h_color = h_color.lstrip('#')
                    return tuple(int(h_color[i:i+2], 16) for i in (0, 2, 4))
                except:
                    return (0, 0, 0)

            def sanitize_text(t):
                t = t.replace('\u2018', "'").replace('\u2019', "'")
                t = t.replace('\u201c', '"').replace('\u201d', '"')
                t = t.replace('\u2013', '-').replace('\u2014', '--')
                t = t.replace('\u2026', '...')
                return t.encode('latin-1', 'replace').decode('latin-1')

            if title_lines:
                pdf.add_page()
                pdf.set_font("Courier", size=12)
                
                # Vertical centering logic
                total_lines = len(title_lines)
                if total_lines > 0:
                    # If user manually added blank lines at the top, trust their spacing
                    first_line_text = title_lines[0].get('text', '').replace('\u200b', '').strip()
                    if first_line_text != '':
                        start_y = max(1.0, (11.0 - (total_lines * 0.16)) / 2.0)
                    else:
                        start_y = 1.0 
                    pdf.set_y(start_y)
                
                for line in title_lines:
                    text = line.get('text', '').replace('\u200b', '').strip()
                    text = sanitize_text(text)
                    align_char = line.get('align', 'C')
                    
                    if not text:
                        pdf.ln(0.16)
                    else:
                        pdf.set_x(1.5)
                    pdf.multi_cell(w=5.5, h=0.16, text=text, align=align_char)  # type: ignore

            pdf.in_title_page = False
            pdf.add_page()
            pdf.set_font("Courier", size=12)
            
            last_type = None

            for line in lines:
                ltype = line.get('type', 'action')
                text = line.get('text', '').replace('\u200b', '').strip()
                
                text = sanitize_text(text)

                if ltype == 'page-break':
                    pdf.add_page()
                    last_type = None
                    continue

                if not text:
                    # Ignore empty editor lines to enforce strict standard screenplay spacing mathematically
                    continue

                # Smart vertical formatting: 1 blank line before everything except Dialogue & Parentheticals
                needs_space = False
                if last_type is not None:
                    if ltype not in ['dialogue', 'parenthetical']:
                        needs_space = True
                        
                if needs_space and pdf.get_y() > 1.1:
                    pdf.ln(0.16)

                current_y = pdf.get_y()
                if line.get('revision', False):
                    rev_color = line.get('revColor', '#ef4444')
                    r_val, g_val, b_val = hex_to_rgb(rev_color)
                    
                    pdf.set_font("Courier", style='B', size=12)
                    pdf.set_text_color(r_val, g_val, b_val)
                    pdf.set_xy(7.6, current_y)
                    pdf.cell(w=0.2, h=0.16, text="*")  # type: ignore
                    pdf.set_y(current_y) # reset Y so the main line prints correctly
                    pdf.set_text_color(0, 0, 0)
                    pdf.set_font("Courier", style='', size=12)

                if ltype == 'scene-heading':
                    pdf.set_x(1.5); pdf.multi_cell(w=6.0, h=0.16, text=text.upper())  # type: ignore
                elif ltype == 'character':
                    pdf.set_x(3.5); pdf.multi_cell(w=4.0, h=0.16, text=text.upper())  # type: ignore
                elif ltype == 'parenthetical':
                    text = text.replace('(', '').replace(')', '')
                    pdf.set_x(3.1); pdf.multi_cell(w=2.5, h=0.16, text=f"({text})")  # type: ignore
                elif ltype == 'dialogue':
                    pdf.set_x(2.5); pdf.multi_cell(w=3.5, h=0.16, text=text)  # type: ignore
                elif ltype == 'transition':
                    pdf.set_x(5.5); pdf.multi_cell(w=2.0, h=0.16, text=text.upper())  # type: ignore
                else: # Action, Shot, etc.
                    pdf.set_x(1.5); pdf.multi_cell(w=6.0, h=0.16, text=text)  # type: ignore
                
                last_type = ltype

            pdf.output(filepath)
            return f"Exported to: {filepath}"
        except Exception as e:
            return f"Export Error: {str(e)}"

    def export_fdx(self, lines, project_name="Screenplay", export_config=None):
        if export_config is None:
            export_config = {}
            
        """Opens a native save dialog and generates a Final Draft (.fdx) file."""
        filepath = self._safe_save_dialog(f'{project_name}.fdx', '.fdx', [('Final Draft Files', '*.fdx')])
        if not filepath:
            return "Export cancelled."
            
        try:
            import xml.etree.ElementTree as ET
            root = ET.Element("FinalDraft", DocumentType="Script", Template="No", Version="1")
            content = ET.SubElement(root, "Content")
            type_map = {'scene-heading': 'Scene Heading', 'action': 'Action', 'character': 'Character', 'parenthetical': 'Parenthetical', 'dialogue': 'Dialogue', 'transition': 'Transition', 'shot': 'Shot'}
            
            for line in lines:
                ltype = line.get('type', 'action')
                text = line.get('text', '').replace('\u200b', '').strip()
                
                if ltype == 'page-break':
                    p = ET.SubElement(content, "Paragraph", Type="Action")
                    p.set("PageBreak", "Yes")
                    ET.SubElement(p, "Text").text = ""
                    continue

                if not text:
                    continue
                    
                if ltype == 'parenthetical': text = f"({text.replace('(', '').replace(')', '')})"
                elif ltype in ['scene-heading', 'character', 'transition']: text = text.upper()
                
                ET.SubElement(ET.SubElement(content, "Paragraph", Type=type_map.get(ltype, 'Action')), "Text").text = text
                
            xmlstr = ET.tostring(root, encoding='utf-8', method='xml')
            with open(filepath, 'wb') as f:
                f.write(b'<?xml version="1.0" encoding="UTF-8"?>\n' + xmlstr)
            return f"Exported to: {filepath}"
        except Exception as e:
            return f"Export Error: {str(e)}"

    def export_writersduet(self, lines, project_name="Screenplay", export_config=None):
        if export_config is None:
            export_config = {}
            
        """Opens a native save dialog and generates a WriterDuet-compatible Fountain file."""
        filepath = self._safe_save_dialog(f'{project_name}.fountain', '.fountain', [('WriterDuet/Fountain Files', '*.fountain')])
        if not filepath:
            return "Export cancelled."
            
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                for line in lines:
                    ltype = line.get('type', 'action')
                    text = line.get('text', '').replace('\u200b', '').strip()
                    
                    if not text: 
                        continue
                        
                    if ltype == 'page-break': f.write('===\n\n')
                    elif ltype == 'scene-heading': f.write(text.upper() + '\n\n')
                    elif ltype == 'character': f.write(text.upper() + '\n')
                    elif ltype == 'parenthetical': f.write(f"({text.replace('(', '').replace(')', '')})\n")
                    elif ltype == 'dialogue': f.write(text + '\n\n')
                    elif ltype == 'transition': f.write('> ' + text.upper() + '\n\n')
                    else: f.write(text + '\n\n')
            return f"Exported to: {filepath}"
        except Exception as e:
            return f"Export Error: {str(e)}"

    def get_spell_suggestions(self, word):
        try:
            from spellchecker import SpellChecker  # type: ignore
            from spellchecker import SpellChecker  # type: ignore
        except ImportError:
            return {"error": "Please run: pip install pyspellchecker"}
            
        if self.spell is None:
            self.spell = SpellChecker()
            dict_path = os.path.join(self.backup_dir, "personal_dict.txt")
            if os.path.exists(dict_path):
                with open(dict_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        w = line.strip().lower()
                        if w:
                            self.personal_dict.add(w)
            self.spell.word_frequency.load_words(list(self.personal_dict))

        import re
        word_clean = re.sub(r'[^\w\s]', '', word.lower())
        if not word_clean:
            return {"misspelled": False, "suggestions": []}

        if word_clean in self.personal_dict or word_clean in self.spell:
            return {"misspelled": False, "suggestions": []}
            
        candidates = self.spell.candidates(word_clean)
        cand_list = []
        if candidates:
            cand_list = list(candidates)[:5]
            if word[0].isupper():
                cand_list = [c.capitalize() for c in cand_list]
        return {"misspelled": True, "suggestions": cand_list}

    def check_document_spelling(self, text):
        try:
            from spellchecker import SpellChecker
        except ImportError:
            return {"error": "Please run: pip install pyspellchecker"}
            
        if self.spell is None:
            self.spell = SpellChecker()
            dict_path = os.path.join(self.backup_dir, "personal_dict.txt")
            if os.path.exists(dict_path):
                with open(dict_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        w = line.strip().lower()
                        if w: self.personal_dict.add(w)
            self.spell.word_frequency.load_words(list(self.personal_dict))

        import re

        # Helper to check if a word is at the start of a sentence
        def is_start_of_sentence(t, index):
            preceding = t[:index].rstrip(" \t")
            if not preceding:
                return True
            if preceding[-1] in {'\n', '\r'}:
                return True
            # Strip quotes/brackets to find punctuation
            preceding = preceding.rstrip(" \t\n\r\"'()[]{}“”‘’")
            if not preceding:
                return True
            if preceding[-1] in {'.', '?', '!'}:
                return True
            return False

        # Helper to strip contraction suffixes
        def strip_contraction(w):
            # Strip common suffixes: 's, 're, 'll, 'd, 've, 'm, n't
            w_base = re.sub(r"'(s|re|ll|d|ve|m|S|RE|LL|D|VE|M)$", "", w)
            w_base = re.sub(r"n't$", "", w_base, flags=re.IGNORECASE)
            return w_base.rstrip("'")

        screenplay_abbreviations = {
            "int", "ext", "cont", "vo", "os", "pov", "cgi", "vfx", "sfx", "bg", "fg", 
            "cont'd", "mos", "oc", "est", "fade", "cut", "transition", "montage", "scene"
        }

        ignore_set = {
            # Common English contractions
            "i'm", "we're", "you're", "they're", "he's", "she's", "it's", "we've", "i've", "you've", "they've",
            "i'd", "you'd", "he'd", "she'd", "we'd", "they'd", "i'll", "you'll", "he'll", "she'll", "we'll", "they'll",
            "isn't", "aren't", "wasn't", "weren't", "haven't", "hasn't", "hadn't", "don't", "doesn't", "didn't",
            "won't", "wouldn't", "shan't", "shouldn't", "can't", "cannot", "couldn't", "mustn't", "let's",
            "who's", "what's", "here's", "there's", "where's", "when's", "why's", "how's", "that's", "how'd", "what'd"
        }

        # Build dynamic proper names / characters set
        proper_names_found = set()

        # 1. From mindmap data
        if isinstance(self.mindmap_data, dict):
            for char in self.mindmap_data.get("characters", []):
                if isinstance(char, dict) and "name" in char:
                    proper_names_found.add(char["name"].lower())
            for scene in self.mindmap_data.get("scenes", []):
                if isinstance(scene, dict) and "characters" in scene:
                    for char_name in scene.get("characters", []):
                        if isinstance(char_name, str):
                            proper_names_found.add(char_name.lower())

        # 2. From all-caps lines in text (indicates character headings, sluglines)
        for line in text.splitlines():
            line_stripped = line.strip()
            if len(line_stripped) > 1 and line_stripped.isupper():
                # Extract words from the uppercase line
                for part in re.findall(r"\b[a-zA-Z\']+\b", line_stripped):
                    proper_names_found.add(part.lower())

        # 3. First pass: Find capitalized words not at start of sentence that are not in the dictionary
        matches = list(re.finditer(r"\b[a-zA-Z\']+\b", text))
        for m in matches:
            w = m.group(0)
            if len(w) >= 2 and w[0].isupper() and not w.isupper():
                if not is_start_of_sentence(text, m.start()):
                    w_base = strip_contraction(w)
                    w_lower = w_base.lower()
                    if w_lower not in self.personal_dict and w_lower not in screenplay_abbreviations and w_lower not in self.spell:
                        proper_names_found.add(w_lower)

        # Second pass: Determine which words are misspelled
        misspelled = []
        seen_words = set()

        for m in matches:
            w = m.group(0)
            w_lower = w.lower()

            if w_lower in seen_words:
                continue
            seen_words.add(w_lower)

            # Heuristic 1: Skip single letter words
            if len(w) <= 1:
                continue

            # Heuristic 2: Skip screenplay abbreviations and common contractions
            if w_lower in screenplay_abbreviations or w_lower in ignore_set or w_lower in self.personal_dict:
                continue

            # Heuristic 3: Skip all-caps words (character names, sluglines, transitions)
            if len(w) >= 2 and w.isupper():
                continue

            # Heuristic 4: Apply contraction stripping
            w_base = strip_contraction(w)
            w_base_lower = w_base.lower()

            if w_base_lower in screenplay_abbreviations or w_base_lower in ignore_set or w_base_lower in self.personal_dict or w_base_lower in self.spell or w_base.isupper():
                continue

            # Heuristic 5: Proper names ignore list
            if w_base_lower in proper_names_found:
                continue

            # Heuristic 6: Capitalized word not at the start of a sentence is a proper name
            if len(w) >= 2 and w[0].isupper() and not w.isupper():
                if not is_start_of_sentence(text, m.start()):
                    continue

            # Check if misspelled
            if w_base_lower not in self.spell:
                sugg = self.get_spell_suggestions(w_base).get("suggestions", [])
                if w[0].isupper() and sugg:
                    sugg = [s.capitalize() for s in sugg]
                misspelled.append({"word": w, "suggestions": sugg})

        return {"error": None, "misspelled": misspelled}

    def add_to_dictionary(self, word):
        import re
        word_clean = re.sub(r'[^\w\s]', '', word.lower())
        if not word_clean:
            return "Invalid word"
            
        dict_path = os.path.join(self.backup_dir, "personal_dict.txt")
        with open(dict_path, 'a', encoding='utf-8') as f:
            f.write(word_clean + "\n")
            
        if self.spell is not None:
            self.personal_dict.add(word_clean)
            self.spell.word_frequency.load_words([word_clean])
            
        return f"Added '{word}' to dictionary."

    def export_ai_report(self, content, project_name="Untitled Project"):
        filepath = self._safe_save_dialog(f'{project_name}_AI_Report.txt', '.txt', [('Text Files', '*.txt')])
        if not filepath:
            return "Export cancelled."
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            
            # Auto-open in Notepad
            import subprocess
            subprocess.Popen(['notepad.exe', filepath])

            return f"Exported to: {filepath}"
        except Exception as e:
            return f"Export Error: {str(e)}"
            
    def set_mindmap_data(self, data):
        self.mindmap_data = data
        return "OK"
        
    def get_mindmap_data(self):
        return self.mindmap_data
        
    def open_ai_report_window(self, html_content, project_name):
        full_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>AI Report: {project_name}</title>
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    background: #12181f;
                    color: #e2e8f0;
                    padding: 20px;
                    line-height: 1.6;
                    font-size: 13px;
                    user-select: text;
                }}
                a {{ color: #3b82f6; text-decoration: underline; cursor: pointer; }}
                .header-bar {{ display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 1px solid #36424e; padding-bottom: 10px; }}
                button {{ background: #1b8adb; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; }}
                button:hover {{ background: #1472ba; }}
            </style>
            <script>
                function scrollToLine(line) {{
                    window.pywebview.api.scroll_main_window_to_line(line);
                }}
                async function exportReport() {{
                    const textContent = document.getElementById('report-content').innerText;
                    const res = await window.pywebview.api.export_ai_report(textContent, "{project_name}");
                    if (!res.includes('cancelled')) alert(res);
                }}
            </script>
        </head>
        <body>
            <div class="header-bar">
                <strong>🤖 AI Script Analysis</strong>
                <button onclick="exportReport()">💾 Export to Notepad</button>
            </div>
            <div id="report-content">{html_content}</div>
        </body>
        </html>
        """
        webview.create_window(f"AI Report: {project_name}", html=full_html, js_api=self, width=650, height=800)
        return "OK"

    def scroll_main_window_to_line(self, line):
        if webview.windows:
            webview.windows[0].evaluate_js(f"if (typeof scrollToLine === 'function') scrollToLine({line});")
        return "OK"
        
        
    def open_mindmap_window(self):
        try:
            mindmap_html = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mindmap.html')
            self._mindmap_window = webview.create_window('Mind Map & Corkboard', url=mindmap_html, js_api=self, width=1024, height=768)
            return "OK"
        except Exception as e:
            return f"Error: {str(e)}"

    def request_mindmap_rescan(self, sync_type, sync_id):
        global active_window
        import json
        if active_window:
            try:
                active_window.evaluate_js(f"if(window.rescanMindmapCard) window.rescanMindmapCard({json.dumps(sync_type)}, {json.dumps(sync_id)});")
            except Exception:
                pass
        return "OK"
        
    def update_mindmap_card_content(self, sync_type, sync_id, title_text, body_html):
        global active_window
        import json
        if active_window:
            try:
                active_window.evaluate_js(f"if(window.updateMindmapCardContent) window.updateMindmapCardContent({json.dumps(sync_type)}, {json.dumps(sync_id)}, {json.dumps(title_text)}, {json.dumps(body_html)});")
            except Exception:
                pass
        return "OK"

    def create_mindmap_group(self, group_type, group_name):
        global active_window
        import json
        if active_window:
            try:
                active_window.evaluate_js(f"if(window.createMindmapGroup) window.createMindmapGroup({json.dumps(group_type)}, {json.dumps(group_name)});")
            except Exception:
                pass
        return "OK"

    def assign_card_to_group(self, sync_type, sync_id, group_id):
        global active_window
        import json
        if active_window:
            try:
                active_window.evaluate_js(f"if(window.assignCardToGroup) window.assignCardToGroup({json.dumps(sync_type)}, {json.dumps(sync_id)}, {json.dumps(group_id)});")
            except Exception:
                pass
        return "OK"

    def toggle_group_collapse(self, group_type, group_id, is_collapsed):
        global active_window
        import json
        if active_window:
            try:
                active_window.evaluate_js(f"if(window.toggleGroupCollapse) window.toggleGroupCollapse({json.dumps(group_type)}, {json.dumps(group_id)}, {json.dumps(is_collapsed)});")
            except Exception:
                pass
        return "OK"

    def notify_mindmap_updated(self):
        if hasattr(self, '_mindmap_window') and self._mindmap_window:
            try:
                self._mindmap_window.evaluate_js("if(window.refreshMindmap) window.refreshMindmap();")
            except Exception:
                pass
        return "OK"
            
    def update_mindmap_note(self, scene_id, note_content):
        global active_window
        import json
        escaped_content = json.dumps(note_content)
        if active_window:
            try:
                active_window.evaluate_js(f"if(window.updateMindmapNote) window.updateMindmapNote('{scene_id}', {escaped_content});")
            except Exception:
                pass
        return "OK"

    def update_character_note(self, char_name, note_content):
        global active_window
        import json
        escaped_content = json.dumps(note_content)
        if active_window:
            try:
                active_window.evaluate_js(f"if(window.updateCharacterNote) window.updateCharacterNote({json.dumps(char_name)}, {escaped_content});")
            except Exception:
                pass
        return "OK"

    def get_local_copy_if_cloud(self, current_file, local_dir, project_name):
        if not current_file or not local_dir or not project_name:
            return None
        try:
            norm_current = os.path.normpath(current_file).lower()
            norm_local_dir = os.path.normpath(local_dir).lower()
            if norm_current.startswith(norm_local_dir):
                return None
            
            safe_name = "".join(c for c in project_name if c not in r'\/:*?"<>|')
            local_path = os.path.join(local_dir, f"{safe_name}.rsp")
            if os.path.exists(local_path):
                with open(local_path, "r", encoding="utf-8") as f:
                    return {
                        "filepath": local_path,
                        "data": f.read()
                    }
        except Exception:
            pass
        return None

    def load_latest_cloud(self, cloud_dir, project_name):
        if not cloud_dir or not os.path.exists(cloud_dir):
            return {"error": "Cloud directory not found or not configured. Please set it in 'Manage Backups'."}
        
        safe_name = "".join(c for c in project_name if c not in r'\/:*?"<>|')
        project_cloud_dir = os.path.join(cloud_dir, safe_name)
        target_path = os.path.join(project_cloud_dir, f"{safe_name}.rsp")
        
        if os.path.exists(target_path):
            try:
                with open(target_path, "r", encoding="utf-8") as f:
                    return {'filepath': target_path, 'data': f.read()}
            except Exception as e:
                return {'error': f"Error reading file: {str(e)}"}
        else:
            return {'not_found': True, 'message': f"No file named '{safe_name}.rsp' was found in the cloud directory.\n\nChecked Path: {project_cloud_dir}"}

    def save_latest_cloud(self, cloud_dir, project_name, content):
        if not cloud_dir or not os.path.exists(cloud_dir):
            return {"error": "Cloud directory not found or not configured. Please set it in 'Manage Backups'."}
        
        safe_name = "".join(c for c in project_name if c not in r'\/:*?"<>|')
        project_cloud_dir = os.path.join(cloud_dir, safe_name)
        
        try:
            if not os.path.exists(project_cloud_dir):
                os.makedirs(project_cloud_dir)
                
            target_path = os.path.join(project_cloud_dir, f"{safe_name}.rsp")
            
            if os.path.exists(target_path):
                timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
                backup_name = f"{safe_name}_{timestamp}.rsp"
                backup_path = os.path.join(cloud_dir, backup_name)
                os.rename(target_path, os.path.join(project_cloud_dir, backup_name))
            
            with open(target_path, "w", encoding="utf-8") as f:
                f.write(content)
            return {'success': True, 'filepath': target_path}
        except Exception as e:
            return {'error': f"Error saving file: {str(e)}"}

    def create_project_folder(self, cloud_dir, project_name):
        if not cloud_dir or not os.path.exists(cloud_dir):
            return {"error": "Cloud directory not found or not configured."}
        
        safe_name = "".join(c for c in project_name if c not in r'\/:*?"<>|')
        project_cloud_dir = os.path.join(cloud_dir, safe_name)
        
        try:
            if not os.path.exists(project_cloud_dir):
                os.makedirs(project_cloud_dir)
            return {"success": True, "path": project_cloud_dir}
        except Exception as e:
            return {"error": str(e)}


    # Default version info bundled with the app (used for first-install seeding)
    DEFAULT_VERSION = {
        "version": "4.7.8",
        "last_updated": "2026-06-04",
        "changelog": [
            "Added prompt confirmation before overwriting with cloud version."
        ]
    }

    def get_version_info(self):
        version_file = os.path.join(current_dir, "version.json")
        if os.path.exists(version_file):
            try:
                with open(version_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        # First install: version.json missing — seed it from the bundled default
        try:
            with open(version_file, "w", encoding="utf-8") as f:
                json.dump(self.DEFAULT_VERSION, f, indent=4)
        except Exception:
            pass
        return self.DEFAULT_VERSION

    def check_for_github_updates(self):
        """Fetch version.json from GitHub and compare against local version."""
        import time
        GITHUB_VERSION_URL = f"https://raw.githubusercontent.com/XENOHEAD/reelscript/main/version.json?t={int(time.time())}"
        try:
            import urllib.request
            local_info = self.get_version_info()
            local_ver = local_info.get("version", "0.0.0")

            with urllib.request.urlopen(GITHUB_VERSION_URL, timeout=8) as resp:
                remote_info = json.loads(resp.read().decode("utf-8"))

            remote_ver = remote_info.get("version", "0.0.0")

            def parse_version(v_str):
                try:
                    return tuple(int(x) for x in str(v_str).split("."))
                except Exception:
                    return (0, 0, 0)

            if parse_version(remote_ver) > parse_version(local_ver):
                return {
                    "update_available": True,
                    "local_version": local_ver,
                    "remote_version": remote_ver,
                    "changelog": remote_info.get("changelog", []),
                    "last_updated": remote_info.get("last_updated", "")
                }
            else:
                return {
                    "update_available": False,
                    "local_version": local_ver,
                    "remote_version": remote_ver
                }
        except Exception as e:
            return {"error": str(e)}

    def download_and_install_github_update(self):
        """Open the GitHub releases page for the user to download the update."""
        try:
            import webbrowser
            DOWNLOAD_PAGE = "https://github.com/XENOHEAD/reelscript/releases/latest"
            webbrowser.open(DOWNLOAD_PAGE)
            return {"status": "started"}
        except Exception as e:
            return {"error": str(e)}

    def check_for_updates(self, cloud_dir):
        if not cloud_dir or not os.path.exists(cloud_dir):
            return {"update_available": False}
        
        cloud_version_file = os.path.join(cloud_dir, "version.json")
        if not os.path.exists(cloud_version_file):
            return {"update_available": False}
            
        try:
            # Load local version
            local_info = self.get_version_info()
            local_ver = local_info.get("version", "2.5")
            
            # Load cloud version
            with open(cloud_version_file, "r", encoding="utf-8") as f:
                cloud_info = json.load(f)
                cloud_ver = cloud_info.get("version", "2.5")
                
            # Helper to parse version strings for accurate numeric comparison
            def parse_version(v_str):
                try:
                    return tuple(int(x) for x in v_str.split("."))
                except:
                    return (0, 0, 0)
                    
            if parse_version(cloud_ver) > parse_version(local_ver):
                return {
                    "update_available": True,
                    "local_version": local_ver,
                    "cloud_version": cloud_ver,
                    "changelog": cloud_info.get("changelog", [])
                }
        except Exception:
            pass
            
        return {"update_available": False}

    def install_cloud_update(self, cloud_dir):
        if not cloud_dir or not os.path.exists(cloud_dir):
            return {"error": "Cloud directory not found."}
            
        cloud_exe = os.path.join(cloud_dir, "reelscript.exe")
        if not os.path.exists(cloud_exe):
            cloud_exe_alt = os.path.join(cloud_dir, "ReelScript.exe")
            if os.path.exists(cloud_exe_alt):
                cloud_exe = cloud_exe_alt
            else:
                return {"error": "No executable found in cloud directory to update from."}
                
        # If running as source code
        if not getattr(sys, 'frozen', False):
            try:
                local_version_file = os.path.join(current_dir, "version.json")
                cloud_version_file = os.path.join(cloud_dir, "version.json")
                import shutil
                shutil.copy2(cloud_version_file, local_version_file)
                
                # Automatically restart the source code process!
                import subprocess
                subprocess.Popen([sys.executable, sys.argv[0]] + sys.argv[1:])
                return {"success": True, "source_mode": True}
            except Exception as e:
                return {"error": f"Failed to update version.json: {str(e)}"}
                
        # If running as compiled exe
        current_exe = sys.executable
        
        try:
            # Create a temporary batch file installer
            import tempfile
            import shutil
            temp_dir = tempfile.gettempdir()
            bat_path = os.path.join(temp_dir, "reelscript_updater.bat")
            
            with open(bat_path, "w") as f:
                f.write(f"""@echo off
title ReelScript Updater
echo Waiting for ReelScript to close...
timeout /t 2 /nobreak > NUL
echo Copying latest executable from cloud...
copy /y "{cloud_exe}" "{current_exe}"
if errorlevel 1 (
    echo.
    echo ERROR: Failed to replace executable.
    echo Please make sure the app is fully closed and try again.
    pause
    exit
)
echo Copying latest version database...
copy /y "{os.path.join(cloud_dir, "version.json")}" "{os.path.join(os.path.dirname(current_exe), "version.json")}"
echo.
echo ReelScript updated successfully!
echo Restarting...
start "" "{current_exe}"
del "%~f0"
""")
            
            # Execute the batch file detached
            import subprocess
            if os.name == 'nt':
                # Spawn cmd.exe to run this batch file detached!
                subprocess.Popen(["cmd.exe", "/c", bat_path], creationflags=0x00000008) # DETACHED_PROCESS
                
            return {"success": True, "installer_spawned": True}
        except Exception as e:
            return {"error": f"Failed to launch update installer: {str(e)}"}

    def toggle_always_on_top(self):
        global active_window
        if active_window:
            active_window.on_top = not active_window.on_top
            return active_window.on_top
        return False

    def exit_app(self):
        global active_window
        if active_window:
            try:
                active_window.destroy()
            except:
                import os
                os._exit(0)
        else:
            import os
            os._exit(0)

    def analyze_script(self, paragraphs):
        return editor.analyze_script_context(paragraphs)
        
    def get_ai_suggestions(self, selected_text):
        return editor.get_ai_suggestions(selected_text)

    def clear_format_logs(self):
        try:
            import json, os
            log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'format_tools_log.json')
            with open(log_path, 'w', encoding='utf-8') as f:
                json.dump([], f)
            return True
        except Exception as e:
            print("Error clearing format logs:", e)
            return False

    def get_format_logs(self):
        try:
            import json, os
            log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'format_tools_log.json')
            if os.path.exists(log_path):
                with open(log_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return []
        except Exception as e:
            print("Error reading format logs:", e)
            return []

    def log_tool_action(self, tool_name, changes):
        try:
            import json, datetime
            log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'format_tools_log.json')
            logs = []
            if os.path.exists(log_path):
                with open(log_path, 'r', encoding='utf-8') as f:
                    try:
                        logs = json.load(f)
                    except:
                        logs = []
                        
            now = datetime.datetime.now(datetime.timezone.utc)
            new_log = {
                "timestamp": now.isoformat() + "Z",
                "tool": tool_name,
                "changes": changes
            }
            logs.append(new_log)
            
            # Prune logs older than 3 days
            pruned_logs = []
            for log in logs:
                try:
                    log_time = datetime.datetime.fromisoformat(log.get("timestamp", "").replace("Z", ""))
                    if (now - log_time).days < 3:
                        pruned_logs.append(log)
                except Exception:
                    pass
                    
            with open(log_path, 'w', encoding='utf-8') as f:
                json.dump(pruned_logs, f, indent=4)
            return True
        except Exception as e:
            print(f"Logging error: {e}")
            return False

    def get_initial_file(self):
        if len(sys.argv) > 1 and sys.argv[1] != '--run-dialog':
            filepath = sys.argv[1]
            if os.path.exists(filepath) and filepath.lower().endswith(('.rsp', '.ksp')):
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        return {'filepath': filepath, 'data': f.read()}
                except Exception as e:
                    return {'error': str(e)}
        return None

if __name__ == '__main__':
    try:
        if os.name == 'nt':
            import ctypes
            # Create mutex so the Windows installer knows if the app is currently running
            kernel32 = ctypes.windll.kernel32
            _mutex = kernel32.CreateMutexW(None, False, "ReelScriptMutex")
            
        import traceback
        api = BackendAPI()
        
        if getattr(sys, 'frozen', False):
            current_dir = sys._MEIPASS
        else:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            
        html_path = os.path.join(current_dir, 'index.html')
        
        version_info = api.get_version_info()
        version_str = version_info.get("version", "2.5")
        
        active_window = webview.create_window(f'ReelScript {version_str}', url=html_path, js_api=api, width=1280, height=800)

        icon_filename = 'movie-icon.ico' if os.name == 'nt' else 'movie-icon.png'
        icon_path = os.path.join(current_dir, icon_filename)
        if os.name == 'nt' and os.path.exists(icon_path):
            webview.start(icon=icon_path, debug=False)
        else:
            webview.start(debug=False)
    except Exception as e:
        import traceback
        try:
            # Try to write to the user's Documents folder
            docs_dir = os.path.join(os.path.expanduser("~"), "Documents", "ReelScript")
            if not os.path.exists(docs_dir):
                os.makedirs(docs_dir)
            crash_file = os.path.join(docs_dir, "crash_log.txt")
            with open(crash_file, "a", encoding="utf-8") as f:
                f.write(f"\n--- Crash on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---\n")
                f.write(traceback.format_exc())
        except:
            # Fallback to current directory if Documents fails
            with open("reelscript_crash_log.txt", "a", encoding="utf-8") as f:
                f.write(f"\n--- Crash on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---\n")
                f.write(traceback.format_exc())
        
        # Also try to show an OS-level error message box
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, f"ReelScript encountered a fatal error and failed to start.\n\nA crash log has been saved to your Documents/ReelScript folder.\n\nError: {str(e)}", "ReelScript Error", 0x10)
        except:
            pass
        sys.exit(1)