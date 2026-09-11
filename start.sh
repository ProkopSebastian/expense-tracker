#!/usr/bin/env bash
# Build the current React sources and serve the UI and API from the same origin.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
runtime_root="${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies"
if ! command -v node >/dev/null 2>&1 && [[ -x "$runtime_root/node/bin/node" ]]; then
  export PATH="$runtime_root/node/bin:$PATH"
fi
if command -v pnpm >/dev/null 2>&1; then
  package_manager="$(command -v pnpm)"
elif [[ -x "$runtime_root/bin/fallback/pnpm" ]]; then
  package_manager="$runtime_root/bin/fallback/pnpm"
else
  echo 'Brakuje pnpm. Zainstaluj Node.js i pnpm, a potem uruchom ponownie.' >&2
  exit 1
fi
"$package_manager" --dir frontend install --frozen-lockfile
"$package_manager" --dir frontend build
echo 'Otwórz aplikację: http://127.0.0.1:8000/ (zatrzymanie: Ctrl+C)'
exec uv run uvicorn expense_tracker.api:app --host 127.0.0.1 --port 8000
