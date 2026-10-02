#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

pnpm --dir "$repo_root/frontend" install --frozen-lockfile
pnpm --dir "$repo_root/frontend" build

uv run --directory "$repo_root" --group desktop --with pyinstaller python -m PyInstaller \
  --noconfirm \
  --clean \
  "$repo_root/scripts/Wydatki-linux.spec"

"$repo_root/dist/Wydatki" --smoke-test
package_dir="$repo_root/dist/Wydatki-Linux-x86_64"
mkdir -p "$package_dir"
install -m 755 "$repo_root/dist/Wydatki" "$package_dir/Wydatki"
install -m 755 "$repo_root/scripts/install_linux.sh" "$package_dir/install.sh"
install -m 644 "$repo_root/scripts/assets/app.png" "$package_dir/wydatki.png"
install -m 644 "$repo_root/scripts/assets/app.svg" "$package_dir/wydatki.svg"
for size in 16 32 48 64; do
  install -m 644 "$repo_root/scripts/assets/app-$size.png" "$package_dir/wydatki-$size.png"
done
install -m 644 "$repo_root/docs/LINUX.txt" "$package_dir/README.txt"
install -m 644 "$repo_root/CHANGELOG.md" "$package_dir/CHANGES.txt"
tar -C "$repo_root/dist" -czf "$repo_root/dist/Wydatki-Linux-x86_64.tar.gz" "Wydatki-Linux-x86_64"
echo "Gotowa paczka wydaniowa: $repo_root/dist/Wydatki-Linux-x86_64.tar.gz"
