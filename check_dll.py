import sys
from PyInstaller.utils.cliutils.archive_viewer import get_archive
arch = get_archive('dist/ReelScript.exe')
for name in arch.toc.keys():
    if 'python312.dll' in name.lower():
        print("FOUND DLL:", name)
print("DONE")
