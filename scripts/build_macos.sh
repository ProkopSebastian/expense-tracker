#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
frontend_dist="$repo_root/frontend/dist"
icon_icns="$repo_root/scripts/assets/app.icns"
icon_png="$repo_root/scripts/assets/app.png"
build_options=(--noconfirm)
if [[ -n "${MACOS_CODESIGN_IDENTITY:-}" ]]; then
  build_options+=(--codesign-identity "$MACOS_CODESIGN_IDENTITY")
fi

pnpm --dir "$repo_root/frontend" install --frozen-lockfile
pnpm --dir "$repo_root/frontend" build

# --windowed on macOS produces an .app bundle; one-file bundles are deprecated there.
uv run --directory "$repo_root" --group desktop --with pyinstaller python -m PyInstaller \
  "${build_options[@]}" \
  --clean \
  --windowed \
  --name Wydatki \
  --osx-bundle-identifier pl.wydatki.app \
  --specpath "$repo_root/build" \
  --paths "$repo_root/src" \
  --icon "$icon_icns" \
  --add-data "$frontend_dist:frontend/dist" \
  --add-data "$icon_png:assets" \
  --copy-metadata expense-tracker \
  --collect-submodules uvicorn \
  "$repo_root/scripts/desktop_launcher.py"

"$repo_root/dist/Wydatki.app/Contents/MacOS/Wydatki" --smoke-test
package_dir="$repo_root/dist/Wydatki-macOS"
rm -rf "$package_dir"
mkdir -p "$package_dir"
ditto "$repo_root/dist/Wydatki.app" "$package_dir/Wydatki.app"
install -m 644 "$repo_root/docs/MACOS.txt" "$package_dir/README.txt"
install -m 644 "$repo_root/CHANGELOG.md" "$package_dir/CHANGES.txt"
ditto -c -k --keepParent "$package_dir" "$repo_root/dist/Wydatki-macOS.zip"
if [[ -n "${MACOS_NOTARY_PROFILE:-}" ]]; then
  if [[ -z "${MACOS_CODESIGN_IDENTITY:-}" ]]; then
    echo "Notarization requires MACOS_CODESIGN_IDENTITY." >&2
    exit 1
  fi
  xcrun notarytool submit "$repo_root/dist/Wydatki-macOS.zip" --keychain-profile "$MACOS_NOTARY_PROFILE" --wait
  xcrun stapler staple "$package_dir/Wydatki.app"
  rm "$repo_root/dist/Wydatki-macOS.zip"
  ditto -c -k --keepParent "$package_dir" "$repo_root/dist/Wydatki-macOS.zip"
fi
uv run --directory "$repo_root" --group desktop python "$repo_root/scripts/check_update_package.py" \
  "$repo_root/dist/Wydatki.app" --archive "$repo_root/dist/Wydatki-macOS.zip"
echo "Gotowa paczka wydaniowa: $repo_root/dist/Wydatki-macOS.zip"
