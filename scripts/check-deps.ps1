# Detect DaVinci Resolve, its version, scripting modules and documentation.
#   powershell -ExecutionPolicy Bypass -File scripts\check-deps.ps1
. "$PSScriptRoot\common.ps1"

Write-Step "DaVinci Resolve installation"
$r = Find-Resolve
if (-not $r) {
  Write-Bad "DaVinci Resolve not found. Install it, or set RESOLVE_INSTALL_DIR in .env to your installation folder."
  exit 1
}
Write-Ok "Installed at $($r.InstallDir) (version $($r.Version))"
if (Test-Path $r.FusionScript) { Write-Ok "fusionscript.dll: $($r.FusionScript)" } else { Write-Bad "fusionscript.dll missing ($($r.FusionScript))" }
if (Test-Path $r.FuScript) { Write-Ok "fuscript.exe: $($r.FuScript)" } else { Write-Warn2 "fuscript.exe not found (Lua helpers unavailable)" }
if (Test-Path $r.Modules) { Write-Ok "Scripting modules: $($r.Modules)" } else { Write-Bad "Scripting modules missing: $($r.Modules)" }
if ($r.Docs) { $r.Docs | ForEach-Object { Write-Ok "Docs: $_" } } else { Write-Warn2 "Scripting README not found under $($r.ScriptApi)" }

Write-Step "Running state"
if (Get-Process -Name Resolve -ErrorAction SilentlyContinue) { Write-Ok "Resolve is running" } else { Write-Warn2 "Resolve is not running (start it, or call the resolve_launch tool)" }

Write-Step "External scripting preference"
Write-Host "  Resolve > Preferences > System > General > 'External scripting using' must be 'Local'."
Write-Host "  (Stored in Resolve's preferences; this script does not change it.)"
$r
