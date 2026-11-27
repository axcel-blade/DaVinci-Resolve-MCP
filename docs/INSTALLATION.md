# Installation (Windows 10 / 11)

## 1. Prerequisites

| Requirement | Check | Install |
|---|---|---|
| DaVinci Resolve 18.5+ (21 recommended) | `scripts\check-deps.ps1` | blackmagicdesign.com |
| Node.js 20+ LTS | `node -v` | nodejs.org |
| pnpm | `pnpm -v` | `corepack enable pnpm` |
| 64-bit Python 3.6+ | `python -c "import struct;print(struct.calcsize('P')*8)"` → 64 | python.org (tick *Add to PATH*) |
| FFmpeg (optional) | `ffmpeg -version` | `winget install Gyan.FFmpeg` |

Some features need **DaVinci Resolve Studio** (auto subtitles, transcription, Magic Mask, Smart Reframe, IntelliSearch, AI Speech Generator). The tools report `unsupported` on the free version instead of failing silently.

## 2. Enable external scripting in Resolve

1. Open DaVinci Resolve.
2. **DaVinci Resolve → Preferences → System → General**.
3. Set **External scripting using** to **Local**.
4. Save and restart Resolve.

`Local` only accepts connections from this machine. Do not choose *Network* unless you understand the exposure.

## 3. Automated setup

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

The script:

1. checks Node.js, 2. pnpm (enables it via Corepack if missing), 3. 64-bit Python,
4. detects Resolve via `RESOLVE_INSTALL_DIR`, the Windows uninstall registry, then common paths,
5. reads the installed version, 6. locates `fusionscript.dll` and the scripting `Modules` folder,
7. locates the scripting docs (`README.md` / `DaVinciResolveScript.pyi` on 21, `README.txt` on older),
8. writes `.env` (`Set-ResolveDotEnv` in `scripts\common.ps1`),
9. `pnpm install`, 10. `pnpm build`, 11. loads the Python bridge, 12. tests the live connection.

It does not modify Windows Firewall, execution policy, or any security setting.

`-SkipConnectionTest` skips step 12 when Resolve is not running.

## 4. Manual setup

```powershell
pnpm install
```

```powershell
pnpm build
```

```powershell
Copy-Item .env.example .env
```

Edit `.env` if Resolve is in a custom location:

```
RESOLVE_INSTALL_DIR=E:\Apps\DaVinci Resolve
RESOLVE_SCRIPT_LIB=E:\Apps\DaVinci Resolve\fusionscript.dll
RESOLVE_SCRIPT_API=C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting
RESOLVE_PYTHON=C:\Python312\python.exe
```

Optionally persist the scripting variables for your user (useful for other scripts):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -SetUserEnvironment
```

## 5. Verify

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-bridge.ps1
```

Expected: `Connected to DaVinci Resolve Studio 21.x`.

## 6. Connect a client

- Claude Desktop / Claude Code: [CLIENTS.md](CLIENTS.md#claude-desktop-and-claude-code)
- ChatGPT: [CLIENTS.md](CLIENTS.md#chatgpt)

## Files the server writes

| Where | What |
|---|---|
| `output\` | exports, renders, scopes stills, transcripts, voiceovers (configurable) |
| `output\backups\` | `.drp` project backups |
| `output\luts\` | generated `.cube` looks |
| `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\LUT\MCP\` | copies of applied LUTs (Resolve 21 only loads LUTs from its LUT folders) |
| `logs\` | server log and operation log |
