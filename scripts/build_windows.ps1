$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Build failed: $LASTEXITCODE" } }
pnpm --dir frontend install --frozen-lockfile
Check-Exit
pnpm --dir frontend build
Check-Exit
$FrontendDist = (Resolve-Path 'frontend/dist').Path
$IconIco = (Resolve-Path 'scripts/assets/app.ico').Path
$IconPng = (Resolve-Path 'scripts/assets/app.png').Path
$VersionInfo = (Resolve-Path 'scripts/windows_version_info.txt').Path
uv sync --group desktop --frozen
Check-Exit
uv run --group desktop --with pyinstaller python -m PyInstaller --noconfirm --clean --windowed --onefile --name Wydatki --specpath build --paths src --icon $IconIco --version-file $VersionInfo --add-data "${FrontendDist};frontend/dist" --add-data "${IconIco};assets" --add-data "${IconPng};assets" --collect-submodules uvicorn scripts/desktop_launcher.py
Check-Exit
$BuiltVersion = (Get-Item dist/Wydatki.exe).VersionInfo.FileVersion
if ($BuiltVersion -ne '0.1.3.0') { throw "Unexpected EXE version: $BuiltVersion" }
$smoke = Start-Process -FilePath dist/Wydatki.exe -ArgumentList '--smoke-test' -PassThru -Wait
if ($smoke.ExitCode -ne 0) { throw "Packaged application smoke test failed: $($smoke.ExitCode)" }
Copy-Item docs/WINDOWS.txt dist/START.txt -Force
Compress-Archive -Path @('dist/Wydatki.exe', 'dist/START.txt') -DestinationPath dist/Wydatki-Windows.zip -Force
