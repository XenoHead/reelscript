@echo off
echo ==========================================
echo Installing ReelScript 1.0...
echo ==========================================
echo.

:: 1. Create the Directory
echo Creating installation folder at C:\ReelScript...
if not exist "C:\ReelScript" mkdir "C:\ReelScript"

:: 2. Copy the Executable
echo Copying ReelScript.exe to installation folder...
if exist "%~dp0dist\ReelScript.exe" (
    copy /Y "%~dp0dist\ReelScript.exe" "C:\ReelScript\ReelScript.exe"
) else if exist "%~dp0ReelScript.exe" (
    copy /Y "%~dp0ReelScript.exe" "C:\ReelScript\ReelScript.exe"
) else (
    echo ERROR: Could not find ReelScript.exe! Please make sure it is in the same folder as this installer.
    pause
    exit /b
)

:: 2b. Copy the Sample Project
echo Copying SampleProject.rsp to installation folder...
if exist "%~dp0SampleProject.rsp" (
    copy /Y "%~dp0SampleProject.rsp" "C:\ReelScript\SampleProject.rsp"
)

:: 3. Set the Environment Variable (Persistent for User)
echo Setting up the AI Assistant API Key...
:: Removed hardcoded leaked key. The user will set this inside the app from the Customize menu.

:: 4. Create Desktop Shortcut using VBScript
echo Creating Desktop shortcut...
set VBS_SCRIPT="%TEMP%\create_shortcut.vbs"
echo Set oWS = WScript.CreateObject("WScript.Shell") > %VBS_SCRIPT%
echo sLinkFile = "%USERPROFILE%\Desktop\ReelScript.lnk" >> %VBS_SCRIPT%
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> %VBS_SCRIPT%
echo oLink.TargetPath = "C:\ReelScript\ReelScript.exe" >> %VBS_SCRIPT%
echo oLink.WorkingDirectory = "C:\ReelScript" >> %VBS_SCRIPT%
echo oLink.Description = "ReelScript Pro Screenplay Editor" >> %VBS_SCRIPT%
echo oLink.IconLocation = "C:\ReelScript\ReelScript.exe, 0" >> %VBS_SCRIPT%
echo oLink.Save >> %VBS_SCRIPT%

cscript /nologo %VBS_SCRIPT%
del %VBS_SCRIPT%

:: 5. Associate File Extensions (.rsp and .ksp)
echo Associating project files with ReelScript...
:: Step 1: Define the file type and link it to the executable program
ftype ReelScriptProject="C:\ReelScript\ReelScript.exe" "%%1"

:: Step 2: Associate the file extensions with that newly defined file type
assoc .rsp=ReelScriptProject
assoc .ksp=ReelScriptProject

echo.
echo ==========================================
echo Installation Complete!
echo ReelScript has been installed to C:\ReelScript
echo and a shortcut was placed on the Desktop.
echo ==========================================
pause