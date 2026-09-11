$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Build failed: $LASTEXITCODE" } }
pnpm --dir frontend install --frozen-lockfile
Check-Exit
pnpm --dir frontend build
Check-Exit
$FrontendDist = (Resolve-Path 'frontend/dist').Path
uv run --with pyinstaller python -m PyInstaller --noconfirm --clean --windowed --onedir --name Wydatki --specpath build --paths src --add-data "${FrontendDist};frontend/dist" --collect-submodules uvicorn scripts/desktop_launcher.py
Check-Exit
$smoke = Start-Process -FilePath dist/Wydatki/Wydatki.exe -ArgumentList '--smoke-test' -PassThru -Wait
if ($smoke.ExitCode -ne 0) { throw "Packaged application smoke test failed: $($smoke.ExitCode)" }
Copy-Item docs/WINDOWS.txt dist/Wydatki/START.txt
Compress-Archive -Path dist/Wydatki -DestinationPath dist/Wydatki-Windows.zip -Force
