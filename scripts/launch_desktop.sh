#!/usr/bin/env bash
# Runs the app in its own native window (pywebview), using the same
# database/data folder as start.sh -- just without a visible terminal
# or browser chrome.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
exec uv run --group desktop python scripts/desktop_launcher.py
