#!/usr/bin/env bash
# Build the current React sources and serve the UI and API from the same origin.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if command -v mise >/dev/null 2>&1; then
  mise install
  mise run frontend-build
elif command -v pnpm >/dev/null 2>&1; then
  pnpm --dir frontend install --frozen-lockfile
  pnpm --dir frontend build
else
  echo 'Brakuje pnpm. Zainstaluj mise (zalecane, patrz przewodnik-narzedzia.md' >&2
  echo 'sekcja 8a) albo Node.js + pnpm ręcznie, a potem uruchom ponownie.' >&2
  exit 1
fi
pid_file="$(pwd)/.expense-tracker.pid"
if [[ -f "$pid_file" ]]; then
  previous_pid="$(<"$pid_file")"
  if [[ "$previous_pid" =~ ^[0-9]+$ ]] && kill -0 "$previous_pid" 2>/dev/null; then
    echo "Aplikacja już działa (PID $previous_pid). Zatrzymasz ją przez ./stop.sh" >&2
    exit 1
  fi
fi

server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -f -- "$pid_file"
}
trap cleanup EXIT INT TERM

uv run uvicorn expense_tracker.api:app --host 127.0.0.1 --port 8000 &
server_pid="$!"
printf '%s\n' "$server_pid" > "$pid_file"
echo 'Otwórz aplikację: http://127.0.0.1:8000/'
echo 'Zatrzymanie: Ctrl+C albo ./stop.sh (także gdy start.sh działa w tle)'
wait "$server_pid"
