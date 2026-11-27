# End-to-end connection test: Python -> fusionscript -> running Resolve, through the same bridge the MCP server uses.
#   powershell -ExecutionPolicy Bypass -File scripts\test-bridge.ps1
. "$PSScriptRoot\common.ps1"

$py = Get-PythonCommand
if (-not $py) { Write-Bad "Python not found. Install 64-bit Python 3 or set RESOLVE_PYTHON."; exit 1 }
$r = Find-Resolve
if ($r -and -not $env:RESOLVE_SCRIPT_LIB) { $env:RESOLVE_SCRIPT_LIB = $r.FusionScript }

Write-Step "Bridge status (resolve-scripts\resolve_worker.py)"
$req = '{"id":"1","op":"app.status","params":{}}'
$out = $req | & $py -u (Join-Path $Script:Root "resolve-scripts\resolve_worker.py")
$resp = ($out | Select-Object -Last 1) | ConvertFrom-Json
$status = $resp.result
if ($status.connected) {
  Write-Ok "Connected to $($status.product) $($status.version)"
  Write-Ok "Project: $($status.project)  Timeline: $($status.timeline)  Page: $($status.page)"
  exit 0
}
Write-Bad "Not connected: $($status.error.code) - $($status.error.message)"
Write-Host "Checklist:"
Write-Host "  1. DaVinci Resolve is running."
Write-Host "  2. Preferences > System > General > External scripting using = Local (restart Resolve after changing)."
Write-Host "  3. Python is 64-bit:  $py -c `"import struct;print(struct.calcsize('P')*8)`""
Write-Host "  4. scripts\check-deps.ps1 shows fusionscript.dll and the Modules folder."
exit 2
