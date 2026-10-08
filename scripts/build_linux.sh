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
uv run --directory "$repo_root" --group desktop python "$repo_root/scripts/check_update_package.py" "$repo_root/dist/Wydatki"
echo "Gotowy program: $repo_root/dist/Wydatki"
