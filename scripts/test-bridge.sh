#!/usr/bin/env bash
# Read-only app.status probe (same fields as the app.status op: product, version, project, timeline, page) through the Python bridge.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="${RESOLVE_PYTHON:-python3}"
WORKDIR="${TMPDIR:-/tmp}/davinci-resolve-mcp-test"
mkdir -p "$WORKDIR"
OUT="$WORKDIR/status.json"
rm -f "$OUT"

echo '{"id":"1","op":"app.status","params":{}}' | "$PY" -u "$ROOT/resolve-scripts/resolve_worker.py" | tail -1 >"$OUT"
echo "Result file: $OUT"
cat "$OUT"
echo
echo "connected:false? Start DaVinci Resolve and set Preferences > System > General > External scripting using: Local."
