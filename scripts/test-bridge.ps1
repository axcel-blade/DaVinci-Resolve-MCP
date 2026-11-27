<#
  Bridge smoke test: runs the real resolve-scripts\resolve_worker.py with a read-only app.status request,
  the same path the MCP server uses (Python -> fusionscript -> running DaVinci Resolve). Creates nothing.
#>
. "$PSScriptRoot\common.ps1"
$py = Test-Python
if (-not $py) { exit 1 }
$r = Find-Resolve
if ($r -and -not $env:RESOLVE_SCRIPT_LIB) { $env:RESOLVE_SCRIPT_LIB = $r.FusionScript }

Write-Step 'Executing app.status in DaVinci Resolve via the Python bridge'
$sw = [Diagnostics.Stopwatch]::StartNew()
$out = '{"id":"1","op":"app.status","params":{}}' | & $py -u (Join-Path $ProjectRoot 'resolve-scripts\resolve_worker.py')
$sw.Stop()
$parsed = ($out | Select-Object -Last 1) | ConvertFrom-Json
$status = $parsed.result
if ($status.connected) {
  Write-Ok "Bridge OK in $($sw.ElapsedMilliseconds) ms: $($status.product) $($status.version), project: $($status.project), timeline: $($status.timeline), page: $($status.page)"
  exit 0
}
Write-Fail "$($status.error.code): $($status.error.message)"
Write-Host '  1. DaVinci Resolve is running.'
Write-Host '  2. Preferences > System > General > External scripting using = Local (restart Resolve after changing).'
Write-Host '  3. scripts\check-deps.ps1 shows fusionscript.dll and the Modules folder.'
exit 1
