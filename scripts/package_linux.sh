#!/usr/bin/env bash
# Wraps the binary from build_linux.sh into .deb and .rpm packages; needs fpm (gem install fpm)
# and, for the .rpm, the rpm tools.
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
assets="$repo_root/scripts/assets"
version="$(uv run --directory "$repo_root" python -c 'from expense_tracker.version import VERSION; print(VERSION)')"
stage="$repo_root/build/linux-package"

rm -rf "$stage"
install -D -m 755 "$repo_root/dist/Wydatki" "$stage/usr/bin/wydatki"
install -D -m 644 "$assets/app.png" "$stage/usr/share/icons/hicolor/256x256/apps/wydatki.png"
for size in 16 32 48 64; do
  install -D -m 644 "$assets/app-$size.png" "$stage/usr/share/icons/hicolor/${size}x${size}/apps/wydatki.png"
done
install -D -m 644 "$assets/app.svg" "$stage/usr/share/icons/hicolor/scalable/apps/wydatki.svg"
install -d "$stage/usr/share/applications"
cat > "$stage/usr/share/applications/wydatki.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Wydatki
Comment=Lokalna analiza wydatków
Exec=/usr/bin/wydatki
Icon=wydatki
Terminal=false
Categories=Office;Finance;
StartupWMClass=Wydatki
DESKTOP

common=(
  -s dir -C "$stage" -n wydatki -v "$version"
  --description "Lokalna analiza wydatków z wyciągów bankowych"
  --url "https://github.com/ProkopSebastian/expense-tracker"
  --maintainer "Sebastian Prokop"
)
fpm "${common[@]}" -t deb -a amd64 -p "$repo_root/dist/wydatki_${version}_amd64.deb" --force .
fpm "${common[@]}" -t rpm -a x86_64 -p "$repo_root/dist/wydatki-${version}-1.x86_64.rpm" --force .
echo "Gotowe paczki: dist/wydatki_${version}_amd64.deb, dist/wydatki-${version}-1.x86_64.rpm"
