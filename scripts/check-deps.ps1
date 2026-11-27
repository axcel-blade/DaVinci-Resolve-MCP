<# Checks Node.js, pnpm, Python, lockfile, installed dependencies and the DaVinci Resolve scripting install. Exit code 0 when everything is present. #>
. "$PSScriptRoot\common.ps1"
$ok = $true
Write-Step 'Runtime'
if (-not (Test-Node)) { $ok = $false }
if (-not (Test-Pnpm)) { $ok = $false }
if (-not (Test-Python)) { $ok = $false }

Write-Step 'Project files'
foreach ($f in @('package.json', 'pnpm-lock.yaml', 'tsconfig.json')) {
  if (Test-Path (Join-Path $ProjectRoot $f)) { Write-Ok $f } else { Write-Fail "$f missing"; $ok = $false }
}
foreach ($f in @('package-lock.json', 'yarn.lock')) {
  if (Test-Path (Join-Path $ProjectRoot $f)) { Write-Warn2 "$f found - this project uses pnpm only; delete it." }
}
if (Test-Path (Join-Path $ProjectRoot 'node_modules\@modelcontextprotocol\sdk')) { Write-Ok 'node_modules installed' }
else { Write-Fail 'Dependencies not installed - run: pnpm install'; $ok = $false }
if (Test-Path (Join-Path $ProjectRoot 'dist\index.js')) { Write-Ok 'dist\index.js built' } else { Write-Warn2 'Not built yet - run: pnpm build' }

Write-Step 'DaVinci Resolve'
$r = Find-Resolve
if ($r) {
  Write-Ok "Installed at $($r.InstallDir) (version $($r.Version))"
  if (Test-Path $r.FusionScript) { Write-Ok "fusionscript.dll: $($r.FusionScript)" } else { Write-Fail "fusionscript.dll missing ($($r.FusionScript))"; $ok = $false }
  if (Test-Path $r.FuScript) { Write-Ok "fuscript.exe: $($r.FuScript)" } else { Write-Warn2 'fuscript.exe not found (Lua helpers unavailable)' }
  if (Test-Path $r.Modules) { Write-Ok "Scripting modules: $($r.Modules)" } else { Write-Fail "Scripting modules missing: $($r.Modules)"; $ok = $false }
  if ($r.Docs) { $r.Docs | ForEach-Object { Write-Ok "Docs: $_" } } else { Write-Warn2 "Scripting README not found under $($r.ScriptApi)" }
} else { Write-Fail 'DaVinci Resolve not found. Install it, or set RESOLVE_INSTALL_DIR in .env.'; $ok = $false }
Write-Host "  Preferences > System > General > 'External scripting using' must be 'Local' (this script does not change it)."

if ($ok) { exit 0 } else { exit 1 }
