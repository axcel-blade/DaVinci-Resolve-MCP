<#
  Live integration test against the running DaVinci Resolve (tests\e2e via `pnpm test:live`).
  Creates throwaway MCP_LIVE_TEST projects and renders into output\live-test\, then writes
  output\live-test\live-report.json. Exit codes: 0 passed, 1 failed, 2 blocked.
#>
. "$PSScriptRoot\common.ps1"
if (-not (Test-Pnpm)) { exit 1 }
Write-Step 'Bridge pre-check'
& (Join-Path $PSScriptRoot 'test-bridge.ps1')
if ($LASTEXITCODE -ne 0) { Write-Fail 'Resolve scripting unavailable; integration test would be blocked.'; exit 2 }
Write-Step 'Running live suite'
Push-Location $ProjectRoot
try { & pnpm test:live; $code = $LASTEXITCODE } finally { Pop-Location }
exit $code
