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
uv sync --group desktop --frozen
Check-Exit
uv run --group desktop --with pyinstaller python -m PyInstaller --noconfirm --clean --windowed --onefile --name Wydatki --specpath build --paths src --icon $IconIco --add-data "${FrontendDist};frontend/dist" --add-data "${IconIco};assets" --add-data "${IconPng};assets" --collect-submodules uvicorn scripts/desktop_launcher.py
Check-Exit
$smoke = Start-Process -FilePath dist/Wydatki.exe -ArgumentList '--smoke-test' -PassThru -Wait
if ($smoke.ExitCode -ne 0) { throw "Packaged application smoke test failed: $($smoke.ExitCode)" }
Copy-Item docs/WINDOWS.txt dist/START.txt -Force
Compress-Archive -Path @('dist/Wydatki.exe', 'dist/START.txt') -DestinationPath dist/Wydatki-Windows.zip -Force
