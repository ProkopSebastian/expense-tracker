#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
pid_file="$(pwd)/.expense-tracker.pid"

if [[ ! -f "$pid_file" ]]; then
  echo 'Aplikacja nie jest uruchomiona przez start.sh.'
  exit 0
fi

server_pid="$(<"$pid_file")"
if [[ ! "$server_pid" =~ ^[0-9]+$ ]]; then
  echo 'Plik procesu jest nieprawidłowy. Usuń .expense-tracker.pid i spróbuj ponownie.' >&2
  exit 1
fi

if ! kill -0 "$server_pid" 2>/dev/null; then
  rm -f -- "$pid_file"
  echo 'Aplikacja była już zatrzymana.'
  exit 0
fi

command_line="$(ps -p "$server_pid" -o args= 2>/dev/null || true)"
if [[ "$command_line" != *"uvicorn expense_tracker.api:app"* ]]; then
  echo "Nie zatrzymuję procesu $server_pid, bo nie wygląda jak ta aplikacja." >&2
  exit 1
fi

kill "$server_pid"
for _ in {1..50}; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    rm -f -- "$pid_file"
    echo 'Aplikacja została zatrzymana.'
    exit 0
  fi
  sleep 0.1
done

echo 'Aplikacja nadal się zamyka. Spróbuj ponownie za chwilę.' >&2
exit 1
