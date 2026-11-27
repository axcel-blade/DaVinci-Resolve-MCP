<# Environment diagnostics: runtime, DaVinci Resolve install, scripting modules, Python, process, MCP client config, logs. #>
. "$PSScriptRoot\common.ps1"
$ErrorActionPreference = 'Continue'

Write-Step 'Runtime'
Test-Node | Out-Null; Test-Pnpm | Out-Null
Write-Ok "Windows: $([Environment]::OSVersion.VersionString), PowerShell $($PSVersionTable.PSVersion)"
Test-Python | Out-Null

Write-Step 'DaVinci Resolve installation'
$r = Find-Resolve
if ($r) {
  Write-Ok "Installed at $($r.InstallDir) (version $($r.Version))"
  if (Test-Path $r.FusionScript) { Write-Ok "fusionscript.dll: $($r.FusionScript)" } else { Write-Fail "fusionscript.dll missing ($($r.FusionScript))" }
  if (Test-Path $r.Modules) { Write-Ok "Scripting modules: $($r.Modules)" } else { Write-Fail "Scripting modules missing: $($r.Modules)" }
} else { Write-Fail 'DaVinci Resolve not found (set RESOLVE_INSTALL_DIR in .env for custom locations).' }

Write-Step 'Process'
$p = Get-Process -Name Resolve -ErrorAction SilentlyContinue
if ($p) { Write-Ok "Resolve running (PID $($p.Id -join ', '))" } else { Write-Warn2 'Resolve not running (it is launched on first tool call when RESOLVE_AUTO_LAUNCH=true)' }
Write-Host "  Preferences > System > General > 'External scripting using' must be 'Local'."

Write-Step 'MCP build'
if (Test-Path (Join-Path $ProjectRoot 'dist\index.js')) { Write-Ok 'dist\index.js present' } else { Write-Warn2 'dist\index.js missing - run: pnpm build' }

Write-Step 'Claude Desktop config'
$cfg = Join-Path $env:APPDATA 'Claude\claude_desktop_config.json'
if (Test-Path $cfg) {
  $json = Get-Content $cfg -Raw | ConvertFrom-Json
  $entry = $json.mcpServers.'davinci-resolve'
  if ($entry) { Write-Ok "davinci-resolve server configured: $($entry.args -join ' ')" } else { Write-Warn2 'claude_desktop_config.json has no "davinci-resolve" server entry' }
} else { Write-Warn2 "$cfg not found" }

Write-Step 'Logs'
$logs = Join-Path $ProjectRoot 'logs'
$latest = Get-ChildItem $logs -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne '.gitkeep' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latest) { Write-Ok "Latest log: $($latest.FullName)"; Get-Content $latest.FullName -Tail 5 } else { Write-Warn2 'No logs yet' }
