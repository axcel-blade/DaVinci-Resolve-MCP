# Start the MCP server.
#   powershell -ExecutionPolicy Bypass -File scripts\launch.ps1            # stdio (for local clients)
#   powershell -ExecutionPolicy Bypass -File scripts\launch.ps1 -Http      # Streamable HTTP on MCP_HTTP_HOST:MCP_HTTP_PORT
param([switch]$Http, [switch]$Dev)
. "$PSScriptRoot\common.ps1"
Set-Location $Script:Root
if (-not (Test-Path "dist\index.js") -and -not $Dev) { pnpm build | Out-Host }
$args2 = @()
if ($Http) { $args2 += "--transport", "http" }
if ($Dev) { pnpm exec tsx src/index.ts @args2 } else { node dist/index.js @args2 }
