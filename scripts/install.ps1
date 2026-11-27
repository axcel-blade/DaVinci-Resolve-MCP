# One-shot Windows setup for the DaVinci Resolve MCP server.
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1
# Checks Node/pnpm/Python/Resolve, writes .env, installs dependencies, builds, validates Python, tests the connection.
# It never changes Windows Firewall, execution policy or other security settings.
param([switch]$SkipConnectionTest, [switch]$SetUserEnvironment)
. "$PSScriptRoot\common.ps1"
Set-Location $Script:Root

Write-Step "1. Node.js"
$node = Get-CommandVersion node
if (-not $node) { Write-Bad "Node.js not found. Install the LTS from https://nodejs.org"; exit 1 }
$major = [int]($node.TrimStart("v").Split(".")[0])
if ($major -lt 20) { Write-Bad "Node $node is too old (need 20+)."; exit 1 }
Write-Ok "Node $node"

Write-Step "2. pnpm"
$pnpm = Get-CommandVersion pnpm
if (-not $pnpm) {
  Write-Warn2 "pnpm not found; enabling it through Corepack (ships with Node)."
  corepack enable pnpm
  $pnpm = Get-CommandVersion pnpm
  if (-not $pnpm) { Write-Bad "Could not enable pnpm. Run: npm install -g pnpm"; exit 1 }
}
Write-Ok "pnpm $pnpm"

Write-Step "3. Python"
$py = Get-PythonCommand
if (-not $py) { Write-Bad "Python not found. Install 64-bit Python 3 from https://python.org (check 'Add to PATH')."; exit 1 }
$bits = & $py -c "import struct,sys;print(struct.calcsize('P')*8, sys.version.split()[0])"
Write-Ok "Python $bits ($py)"
if ($bits -notmatch "^64") { Write-Bad "Resolve needs 64-bit Python."; exit 1 }

Write-Step "4-7. DaVinci Resolve, version, scripting modules and docs"
& "$PSScriptRoot\check-deps.ps1" | Out-Host

Write-Step "8. Environment (.env)"
Set-ResolveDotEnv -SetUserEnvironment:$SetUserEnvironment | Out-Host

Write-Step "9. Dependencies"
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { pnpm install }

Write-Step "10. Build"
pnpm build
if ($LASTEXITCODE -ne 0) { Write-Bad "Build failed."; exit 1 }
Write-Ok "Built dist\index.js"

Write-Step "11. Python bridge"
$ops = & $py (Join-Path $Script:Root "resolve-scripts\resolve_worker.py") --list-ops | ConvertFrom-Json
Write-Ok "$($ops.Count) bridge operations load"

Write-Step "Optional tools"
if (Get-CommandVersion ffmpeg -version) { Write-Ok "FFmpeg found (media analysis, loudness, silence detection, live tests)" } else { Write-Warn2 "FFmpeg not found: analysis tools that need it will report unsupported. winget install Gyan.FFmpeg" }

if (-not $SkipConnectionTest) {
  Write-Step "12. Resolve connection"
  & "$PSScriptRoot\test-bridge.ps1" | Out-Host
}

Write-Host ""
Write-Host "Setup complete. Claude Desktop config snippet:" -ForegroundColor Green
$entry = @{ mcpServers = @{ "davinci-resolve" = @{ command = (Get-Command node).Source; args = @((Join-Path $Script:Root "dist\index.js")) } } } | ConvertTo-Json -Depth 5
Write-Host $entry
