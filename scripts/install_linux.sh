#!/usr/bin/env bash
set -euo pipefail

package_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
binary="$package_dir/Wydatki"
icon="$package_dir/wydatki.png"
install_home="${WYDATKI_INSTALL_HOME:-$HOME}"
bin_dir="$install_home/.local/bin"
data_home="${XDG_DATA_HOME:-$install_home/.local/share}"
applications_dir="$data_home/applications"
icons_dir="$data_home/icons/hicolor/256x256/apps"

if [[ ! -f "$binary" || ! -f "$icon" ]]; then
  echo "Uruchom ten skrypt z rozpakowanej paczki Wydatki." >&2
  exit 1
fi

install -d -m 755 "$bin_dir" "$applications_dir" "$icons_dir"
install -m 755 "$binary" "$bin_dir/Wydatki"
install -m 644 "$icon" "$icons_dir/wydatki.png"

cat > "$applications_dir/wydatki.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Wydatki
Comment=Lokalna analiza wydatków
Exec=$bin_dir/Wydatki
Icon=wydatki
Terminal=false
Categories=Office;Finance;
StartupWMClass=Wydatki
EOF

command -v update-desktop-database >/dev/null 2>&1 && timeout 5 update-desktop-database "$applications_dir" || true
echo "Zainstalowano Wydatki. Znajdziesz je w menu aplikacji."
