#!/usr/bin/env bash
# Read-only status probe through the Python bridge (macOS / Linux): Python -> fusionscript -> running Resolve.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="${RESOLVE_PYTHON:-python3}"
echo '{"id":"1","op":"app.status","params":{}}' | "$PY" -u "$ROOT/resolve-scripts/resolve_worker.py" | head -2
echo
echo "connected:false? Start DaVinci Resolve and set Preferences > System > General > External scripting using: Local."
