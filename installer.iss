; ============================================================
;  ReelScript - Inno Setup Installer Script
;  Produces: ReelScript_Setup.exe
;
;  Requirements:
;    - Inno Setup 6.x (https://jrsoftware.org/isinfo.php)
;    - Run build.bat first to produce dist\reelscript.exe
;
;  To compile:
;    Open this file in the Inno Setup Compiler and click Build,
;    or run: ISCC.exe installer.iss
; ============================================================

#define AppName        "ReelScript"
#define AppVersion     "4.4.3"
#define AppPublisher   "XenoHead"
#define AppURL         "https://github.com/XENOHEAD/reelscript"
#define AppExeName     "ReelScript.exe"
#define AppDescription "Professional Screenplay Editor"

[Setup]
; Basic identity
AppId={{A3F1C2D4-7E8B-4F2A-9C1D-5B6E7F8A9B0C}
AppName={#AppName}
AppVersion={#AppVersion}
AppMutex=ReelScriptMutex
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}/issues
AppUpdatesURL={#AppURL}/releases

; Installation target
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes

; Output
OutputDir=dist
OutputBaseFilename=ReelScript_Setup
SetupIconFile=movie-icon.ico
WizardStyle=modern

; Compression
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes

; Privileges — request admin so we can write to Program Files
; and register file associations system-wide
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog

; Minimum Windows version (Windows 10)
MinVersion=10.0

; Uninstaller
UninstallDisplayName={#AppName} {#AppVersion}
UninstallDisplayIcon={app}\{#AppExeName}

; Misc
ShowLanguageDialog=no
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon";    Description: "Create a &desktop shortcut";              GroupDescription: "Additional shortcuts:"; Flags: checkedonce
Name: "startmenuicon";  Description: "Create a &Start Menu shortcut";           GroupDescription: "Additional shortcuts:"; Flags: checkedonce

[Files]
; Main executable (built by PyInstaller via build.bat)
Source: "dist\reelscript.exe"; DestDir: "{app}"; DestName: "{#AppExeName}"; Flags: ignoreversion

; App icon (for file association thumbnails)
Source: "movie-icon.ico";      DestDir: "{app}"; Flags: ignoreversion
Source: "movie-icon.png";      DestDir: "{app}"; Flags: ignoreversion

; Version manifest (update checker reads this)
Source: "version.json";        DestDir: "{app}"; Flags: ignoreversion

; Documentation
Source: "ReelScript_Manual.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "manual.html";           DestDir: "{app}"; Flags: ignoreversion
Source: "writers_guide.html";    DestDir: "{app}"; Flags: ignoreversion
Source: "writer_guide_hero.png"; DestDir: "{app}"; Flags: ignoreversion
Source: "writer_guide_blueprint.png"; DestDir: "{app}"; Flags: ignoreversion
Source: "screenshot.png";            DestDir: "{app}"; Flags: ignoreversion
Source: "ai_assistant.png";      DestDir: "{app}"; Flags: ignoreversion
Source: "collaboration.png";     DestDir: "{app}"; Flags: ignoreversion
Source: "backups_sync.png";      DestDir: "{app}"; Flags: ignoreversion
Source: "xenohead_logo.png";     DestDir: "{app}"; Flags: ignoreversion

; Sample project (optional — ships with the installer)
Source: "SampleProject.rsp"; DestDir: "{userdocs}\ReelScript\Samples"; Flags: ignoreversion skipifsourcedoesntexist

[Dirs]
; Create the user's backup/settings folder on install
Name: "{userdocs}\ReelScript"

[Icons]
; Start Menu
Name: "{group}\{#AppName}";      Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\movie-icon.ico"; Comment: "{#AppDescription}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"

; Desktop
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\movie-icon.ico"; Comment: "{#AppDescription}"; Tasks: desktopicon

[Registry]
; ── .rsp file association ──────────────────────────────────
Root: HKLM; Subkey: "Software\Classes\.rsp";                     ValueType: string; ValueName: ""; ValueData: "ReelScriptProject"; Flags: uninsdeletevalue
Root: HKLM; Subkey: "Software\Classes\.rsp";                     ValueType: string; ValueName: "Content Type"; ValueData: "application/x-reelscript"; Flags: uninsdeletevalue
Root: HKLM; Subkey: "Software\Classes\ReelScriptProject";        ValueType: string; ValueName: ""; ValueData: "ReelScript Project"; Flags: uninsdeletekey
Root: HKLM; Subkey: "Software\Classes\ReelScriptProject\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#AppExeName},0"
Root: HKLM; Subkey: "Software\Classes\ReelScriptProject\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" ""%1"""

; ── .ksp legacy file association ───────────────────────────
Root: HKLM; Subkey: "Software\Classes\.ksp";                     ValueType: string; ValueName: ""; ValueData: "ReelScriptProject"; Flags: uninsdeletevalue

; ── App registration (Add/Remove Programs extras) ──────────
Root: HKLM; Subkey: "Software\{#AppPublisher}\{#AppName}"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletekey
Root: HKLM; Subkey: "Software\{#AppPublisher}\{#AppName}"; ValueType: string; ValueName: "Version";     ValueData: "{#AppVersion}"

[Run]
; Offer to launch ReelScript after install
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName} now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Nothing extra needed — Inno handles registry + files automatically

[Code]
// Notify Windows that file associations changed so Explorer refreshes icons
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    RegWriteStringValue(HKEY_LOCAL_MACHINE,
      'Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.rsp',
      'Application', '{app}\{#AppExeName}');
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    // Optionally prompt to keep user data
    if MsgBox('Would you like to delete your ReelScript settings and backups?' + #13#10 +
              '(' + ExpandConstant('{userdocs}\ReelScript') + ')',
              mbConfirmation, MB_YESNO) = IDYES then
    begin
      DelTree(ExpandConstant('{userdocs}\ReelScript'), True, True, True);
    end;
  end;
end;
