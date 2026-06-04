 2: Compile with PyInstaller
echo [2/3] Building executable with PyInstaller...
echo       This may take 2-4 minutes. Please wait...
python -m PyInstaller --noconfirm --onefile --windowed ^
  --name "ReelScript" ^
  --icon "movie-icon.ico" ^
  --add-data "movie-icon.ico;." ^
  --add-data "movie-icon.png;." ^
  --add-data "index.html;." ^
  --add-data "styles.css;." ^
  --add-data "script.js;." ^
  --add-data "version.json;." ^
  --add-data "editor.PY;." ^
  --add-data "manual.html;." ^
  --add-data "writers_guide.html;." ^
  --add-data "writer_guide_hero.png;." ^
  --add-data "writer_guide_blueprint.png;." ^
  --add-data "xenohead_logo.png;." ^
  --add-data "mindmap.html;." ^
  --add-data "mindmap.css;." ^
  --add-data "mindmap.js;." ^
  --hidden-import webview ^
  --hidden-import fpdf ^
  --hidden-import fpdf2 ^
  --hidden-import spellchecker ^
  --hidden-import editor ^
  --hidden-import google.genai ^
  --hidden-import requests ^
  --hidden-import tkinter ^
  --hidden-import tkinter.filedialog ^
  reelscript.pyw
