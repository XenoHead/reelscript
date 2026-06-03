@echo off
echo ==========================================
echo  ReelScript - Full Build + Package
echo ==========================================
echo.

:: Step 1: Install Python dependencies
echo [1/3] Installing Python dependencies...
python -m pip install pyinstaller fpdf fpdf2 pyspellchecker pywebview google-genai requests --quiet
if errorlevel 1 (
    echo ERROR: pip install failed. Make sure Python is installed and on PATH.
    pause
    exit /b 1
)

echo.

:: Step 2: Compile with PyInstaller
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

if errorlevel 1 (
    echo ERROR: PyInstaller build failed.
    pause
    exit /b 1
)

echo.

:: Step 3: Package with Inno Setup
echo [3/3] Creating installer with Inno Setup...

:: Try common Inno Setup install locations
set ISCC=""
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" set ISCC="C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if exist "C:\Program Files\Inno Setup 6\ISCC.exe"       set ISCC="C:\Program Files\Inno Setup 6\ISCC.exe"

if %ISCC%=="" (
    echo.
    echo WARNING: Inno Setup 6 not found. Skipping installer packaging.
    echo          Download it free from: https://jrsoftware.org/isdl.php
    echo          Then re-run this script to produce ReelScript_Setup.exe
    echo.
    echo [DONE] Executable only: dist\ReelScript.exe
    pause
    exit /b 0
)

%ISCC% installer.iss
if errorlevel 1 (
    echo ERROR: Inno Setup compilation failed.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo  Build Complete!
echo ==========================================
echo.
echo  Executable : dist\ReelScript.exe
echo  Installer  : dist\ReelScript_Setup.exe
echo.
echo  Upload ReelScript_Setup.exe to GitHub Releases.
echo ==========================================
pause
