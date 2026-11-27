<#
  Live integration test against the running DaVinci Resolve. Runs the bridge pre-check (app.status),
  then `pnpm test:live` (tests/e2e), which creates throwaway MCP_LIVE_TEST projects, drives real ops end
  to end, renders into output\live-test\ and writes output\live-test\live-report.json.
  Exit codes: 0 passed, 1 failed, 2 blocked (bridge unavailable).
#>
. "$PSScriptRoot\common.ps1"
if (-not (Test-Pnpm)) { exit 1 }
Write-Step 'Bridge pre-check'
& (Join-Path $PSScriptRoot 'test-bridge.ps1')
if ($LASTEXITCODE -ne 0) { Write-Fail 'Bridge unavailable; integration test would be blocked.'; exit 2 }
Write-Step 'Running live suite'
Push-Location $ProjectRoot
try { & pnpm test:live; $code = $LASTEXITCODE } finally { Pop-Location }
exit $code
