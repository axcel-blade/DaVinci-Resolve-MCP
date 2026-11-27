# Shared helpers for the project's PowerShell scripts. Dot-source: . "$PSScriptRoot\common.ps1"
$ErrorActionPreference = 'Stop'
$Script:ProjectRoot = Split-Path -Parent $PSScriptRoot

function Write-Step([string]$msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg) { Write-Host "  [ok] $msg" -ForegroundColor Green }
function Write-Warn2([string]$msg) { Write-Host "  [warn] $msg" -ForegroundColor Yellow }
function Write-Fail([string]$msg) { Write-Host "  [fail] $msg" -ForegroundColor Red }

function Test-Node {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { Write-Fail 'Node.js not found. Install Node.js 20 LTS or newer from https://nodejs.org/'; return $false }
  $v = (& node -v).TrimStart('v')
  if ([int]($v.Split('.')[0]) -lt 20) { Write-Fail "Node.js $v found; version 20 or newer is required."; return $false }
  Write-Ok "Node.js $v"
  return $true
}

function Test-Pnpm {
  $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  if (-not $pnpm) {
    Write-Fail 'pnpm not found.'
    Write-Host '    Install it with Corepack (bundled with Node.js):' -ForegroundColor Yellow
    Write-Host '      corepack enable' -ForegroundColor Yellow
    Write-Host '      corepack prepare pnpm@10.34.9 --activate' -ForegroundColor Yellow
    Write-Host '    or see https://pnpm.io/installation' -ForegroundColor Yellow
    return $false
  }
  Write-Ok "pnpm $(& pnpm -v)"
  return $true
}

function Invoke-Pnpm([string[]]$PnpmArgs) {
  Push-Location $Script:ProjectRoot
  try {
    & pnpm @PnpmArgs
    if ($LASTEXITCODE -ne 0) { throw "pnpm $($PnpmArgs -join ' ') failed with exit code $LASTEXITCODE" }
  } finally { Pop-Location }
}

function Get-DotEnv {
  $file = Join-Path $Script:ProjectRoot '.env'
  $vals = @{}
  if (Test-Path $file) {
    foreach ($line in Get-Content $file) {
      if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $vals[$Matches[1]] = $Matches[2].Trim('"').Trim("'") }
    }
  }
  return $vals
}

function Get-PythonCommand {
  $envVals = Get-DotEnv
  foreach ($p in @($env:RESOLVE_PYTHON, $envVals.RESOLVE_PYTHON, 'python', 'py')) {
    if (-not $p) { continue }
    $c = Get-Command $p -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
  }
  return $null
}

function Test-Python {
  $py = Get-PythonCommand
  if (-not $py) { Write-Fail 'Python not found. Install 64-bit Python 3 from https://python.org (tick "Add to PATH") or set RESOLVE_PYTHON.'; return $null }
  $bits = & $py -c "import struct,sys;print(struct.calcsize('P')*8, sys.version.split()[0])"
  if ($bits -notmatch '^64') { Write-Fail "Python $bits ($py): DaVinci Resolve needs 64-bit Python."; return $null }
  Write-Ok "Python $bits ($py)"
  return $py
}

<# Finds DaVinci Resolve without assuming one directory: RESOLVE_INSTALL_DIR, the registry, then common paths. #>
function Find-Resolve {
  $envVals = Get-DotEnv
  $candidates = @()
  if ($env:RESOLVE_INSTALL_DIR) { $candidates += $env:RESOLVE_INSTALL_DIR }
  if ($envVals.RESOLVE_INSTALL_DIR) { $candidates += $envVals.RESOLVE_INSTALL_DIR }
  foreach ($key in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*') {
    Get-ItemProperty $key -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'DaVinci Resolve*' -and $_.InstallLocation } | ForEach-Object { $candidates += $_.InstallLocation }
  }
  $candidates += "$env:ProgramFiles\Blackmagic Design\DaVinci Resolve", 'D:\Program Files\Blackmagic Design\DaVinci Resolve'
  foreach ($dir in $candidates | Select-Object -Unique) {
    $exe = Join-Path $dir 'Resolve.exe'
    if (-not (Test-Path $exe)) { continue }
    $api = if ($env:RESOLVE_SCRIPT_API) { $env:RESOLVE_SCRIPT_API } else { Join-Path $env:ProgramData 'Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting' }
    return [pscustomobject]@{
      InstallDir   = $dir
      Executable   = $exe
      Version      = (Get-Item $exe).VersionInfo.ProductVersion
      FusionScript = (Join-Path $dir 'fusionscript.dll')
      FuScript     = (Join-Path $dir 'fuscript.exe')
      ScriptApi    = $api
      Modules      = (Join-Path $api 'Modules')
      Docs         = @((Join-Path $api 'README.md'), (Join-Path $api 'README.txt'), (Join-Path $api 'DaVinciResolveScript.pyi')) | Where-Object { Test-Path $_ }
    }
  }
  return $null
}

<# Writes the Resolve scripting paths into .env (user scope only; never touches system security settings). #>
function Set-ResolveDotEnv([switch]$SetUserEnvironment) {
  $r = Find-Resolve
  if (-not $r) { Write-Fail 'DaVinci Resolve not found; set RESOLVE_INSTALL_DIR in .env first.'; return }
  $envFile = Join-Path $Script:ProjectRoot '.env'
  if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $Script:ProjectRoot '.env.example') $envFile; Write-Ok 'Created .env from .env.example' }

  $values = [ordered]@{ RESOLVE_INSTALL_DIR = $r.InstallDir; RESOLVE_SCRIPT_API = $r.ScriptApi; RESOLVE_SCRIPT_LIB = $r.FusionScript }
  $py = Get-PythonCommand
  if ($py) { $values.RESOLVE_PYTHON = $py }

  $lines = Get-Content $envFile
  foreach ($k in $values.Keys) {
    $found = $false
    $lines = $lines | ForEach-Object { if ($_ -match "^\s*$k\s*=") { $found = $true; "$k=$($values[$k])" } else { $_ } }
    if (-not $found) { $lines += "$k=$($values[$k])" }
    Write-Ok "$k=$($values[$k])"
  }
  Set-Content -Path $envFile -Value $lines -Encoding utf8

  if ($SetUserEnvironment) {
    foreach ($k in 'RESOLVE_SCRIPT_API', 'RESOLVE_SCRIPT_LIB') { [Environment]::SetEnvironmentVariable($k, $values[$k], 'User') }
    $pp = [Environment]::GetEnvironmentVariable('PYTHONPATH', 'User')
    if (-not $pp -or $pp -notlike "*$($r.Modules)*") { [Environment]::SetEnvironmentVariable('PYTHONPATH', (@($pp, $r.Modules) | Where-Object { $_ }) -join ';', 'User') }
    Write-Ok 'User environment variables set (open a new terminal to pick them up).'
  }
}
