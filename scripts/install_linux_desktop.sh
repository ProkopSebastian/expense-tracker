#!/usr/bin/env bash
# Adds a "Wydatki" entry to the desktop app menu (GNOME/KDE/etc.) that runs
# this checkout's launch_desktop.sh. Safe to re-run after moving the repo.
set -euo pipefail
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
chmod +x "$repo_root/scripts/launch_desktop.sh"

apps_dir="$HOME/.local/share/applications"
mkdir -p "$apps_dir"
entry="$apps_dir/wydatki.desktop"

cat > "$entry" <<EOF
[Desktop Entry]
Type=Application
Name=Wydatki
Comment=Lokalna analiza wydatkow
Exec=$repo_root/scripts/launch_desktop.sh
Icon=$repo_root/scripts/assets/app.png
Terminal=false
Categories=Office;Finance;
StartupWMClass=Wydatki
EOF

command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$apps_dir" || true
echo "Zainstalowano skrót: $entry"
echo "Wydatki powinny pojawić się w menu aplikacji (może być potrzebne wylogowanie/ponowne zalogowanie)."
