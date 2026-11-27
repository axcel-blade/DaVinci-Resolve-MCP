#!/usr/bin/env bash
# macOS / Linux diagnostics for the DaVinci Resolve MCP server.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Node / pnpm / Python ==="
node -v
command -v pnpm >/dev/null && pnpm -v || echo "pnpm not on PATH (enable with: corepack enable)"
command -v python3 >/dev/null && python3 --version || echo "python3 not on PATH (set RESOLVE_PYTHON in .env)"

echo
echo "=== DaVinci Resolve install ==="
if [[ "$(uname)" == "Darwin" ]]; then
  APP="/Applications/DaVinci Resolve/DaVinci Resolve.app"
  API="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting"
  LIB="$APP/Contents/Libraries/Fusion/fusionscript.so"
else
  APP="/opt/resolve"
  API="/opt/resolve/Developer/Scripting"
  LIB="/opt/resolve/libs/Fusion/fusionscript.so"
fi
[[ -e "$APP" ]] && echo "  app: $APP" || echo "  not found at $APP (set RESOLVE_INSTALL_DIR)"
[[ -d "$API/Modules" ]] && echo "  scripting modules: $API/Modules" || echo "  scripting modules missing: $API/Modules"
[[ -f "$LIB" ]] && echo "  fusionscript: $LIB" || echo "  fusionscript missing: $LIB"

echo
echo "=== Running? ==="
if pgrep -x "Resolve" >/dev/null 2>&1 || pgrep -if "DaVinci Resolve" >/dev/null 2>&1; then
  echo "  DaVinci Resolve is running"
else
  echo "  DaVinci Resolve is not running (RESOLVE_AUTO_LAUNCH=true launches it on first tool call)"
fi
echo "  Preferences > System > General > 'External scripting using' must be 'Local'."

echo
echo "=== MCP build ==="
if [[ -f "$ROOT/dist/index.js" ]]; then
  echo "  dist/index.js present: $(node "$ROOT/dist/index.js" --version)"
else
  echo "  dist/index.js missing — run: pnpm build"
fi
