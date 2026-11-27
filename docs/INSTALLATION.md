# Installation

## 1. Requirements

| Component | Version | Notes |
|---|---|---|
| Windows | 10 or 11 (x64) | Bridge uses the official scripting API (`fusionscript.dll`) through a Python worker |
| macOS | 12+ (Intel or Apple Silicon) | Same bridge (`fusionscript.so`); implemented, not yet run on a Mac |
| Node.js | 20 LTS or newer | `node -v` |
| pnpm | 10.x (pinned via `packageManager` in package.json) | Installed with Corepack |
| Python | 3.6+ **64-bit** | `python -c "import struct;print(struct.calcsize('P')*8)"` → `64`; python.org (tick *Add to PATH*) |
| DaVinci Resolve | 18.5 or later; tested with DaVinci Resolve Studio 21.2 | Some features need Studio (auto subtitles, transcription, Magic Mask, Smart Reframe, IntelliSearch); they report `unsupported` on the free version |
| FFmpeg | optional | Media analysis, loudness, silence/scene detection, render verification; `winget install Gyan.FFmpeg` |
| Claude Desktop | current | stdio transport |
| ChatGPT | plan with Developer Mode | remote HTTPS transport; see §6 |

Nothing is installed into DaVinci Resolve: no plugin, panel or extension.

## 2. One-line installer (release build)

Windows (PowerShell):

```powershell
irm https://axcel-blade.github.io/DaVinci-Resolve-MCP/install.ps1 | iex
```

macOS (Terminal):

```bash
curl -fsSL https://axcel-blade.github.io/DaVinci-Resolve-MCP/install.sh | bash
```

The installers download the latest release ZIP (built by `scripts/pack-release.mjs`), verify its SHA-256, install production
dependencies with pnpm into `%LOCALAPPDATA%\DaVinciResolveMCP` / `~/Library/Application Support/DaVinciResolveMCP`, and register the
server with your MCP clients (see [CONFIGURATION.md](CONFIGURATION.md#mcp-clients-the-installers-configure)). Read a script before piping it to a shell.

## 3. From source (pnpm only)

Do not run `npm install` or `yarn`; `scripts/check-deps.ps1` warns about their lockfiles and CI rejects them.

```powershell
corepack enable
```

```powershell
corepack prepare pnpm@10.34.9 --activate
```

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

`scripts\install.ps1` checks Node.js, pnpm and 64-bit Python, runs `pnpm install --frozen-lockfile` and `pnpm build`, detects
DaVinci Resolve (`RESOLVE_INSTALL_DIR`, the Windows uninstall registry, then common paths), writes its scripting paths to `.env`
(created from `.env.example`), loads the Python bridge, tests the live connection and prints the Claude Desktop snippet
(`-ConfigureClaude` writes it, with a backup). `-SkipConnectionTest` skips the live test when Resolve is not running;
`-SetUserEnvironment` also sets `RESOLVE_SCRIPT_API`, `RESOLVE_SCRIPT_LIB` and `PYTHONPATH` for your user. It does not modify
Windows Firewall, execution policy or any security setting. macOS: `./scripts/install.sh`. The server entry point is `dist\index.js`.

For a custom install location, set the paths in `.env`:

```
RESOLVE_INSTALL_DIR=E:\Apps\DaVinci Resolve
RESOLVE_SCRIPT_LIB=E:\Apps\DaVinci Resolve\fusionscript.dll
RESOLVE_SCRIPT_API=C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting
RESOLVE_PYTHON=C:\Python312\python.exe
```

## 4. DaVinci Resolve setup

### Windows

1. Install DaVinci Resolve (default path `C:\Program Files\Blackmagic Design\DaVinci Resolve\Resolve.exe`).
2. Open **DaVinci Resolve → Preferences → System → General**, set **External scripting using** to **Local**, save and restart Resolve.
   `Local` only accepts connections from this machine; do not choose *Network* unless you understand the exposure.
3. Verify: `powershell -ExecutionPolicy Bypass -File scripts\check-deps.ps1` shows the install, its version, `fusionscript.dll` and the scripting `Modules` folder.
4. Verify scripting end to end: `powershell -ExecutionPolicy Bypass -File scripts\test-bridge.ps1` runs the read-only `app.status` op inside DaVinci Resolve
   and prints the product, version, project, timeline and page.
5. Optional: `RESOLVE_AUTO_LAUNCH=true` starts DaVinci Resolve on the first call instead of failing with `RESOLVE_NOT_RUNNING`.

### macOS

1. Install DaVinci Resolve under `/Applications`.
2. Set **Preferences → System → General → External scripting using** to **Local** and restart Resolve.
3. Verify: `chmod +x scripts/*.sh && ./scripts/diagnostics.sh`, then `./scripts/test-bridge.sh`.

Close modal dialogs in DaVinci Resolve before using the tools: a modal dialog blocks script execution and causes `TIMEOUT`.

## 5. Claude Desktop (stdio)

Edit `%APPDATA%\Claude\claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "davinci-resolve": {
      "command": "node",
      "args": ["C:\\path\\to\\DaVinci-Resolve-MCP\\dist\\index.js"],
      "env": {
        "RESOLVE_PYTHON": "C:\\Python312\\python.exe",
        "ALLOWED_WRITE_PATHS": "D:\\Exports;C:\\Users\\you\\Videos"
      }
    }
  }
}
```

Fully quit Claude Desktop (tray icon → Quit) and reopen it. Other clients: [CLIENTS.md](CLIENTS.md).

## 6. ChatGPT (remote HTTPS)

ChatGPT does not launch local stdio servers; it connects to remote MCP servers over HTTPS (Streamable HTTP).

1. Generate a secret: `powershell -File scripts\new-token.ps1`.
2. Start the HTTP transport:

   ```powershell
   $env:MCP_TRANSPORT="http"; $env:MCP_SECRET_PATH="<secret>"; node dist\index.js
   ```

   It listens on `http://127.0.0.1:3334/mcp/<secret>` (or `/mcp` with `Authorization: Bearer $MCP_AUTH_TOKEN`). Local check: `http://127.0.0.1:3334/healthz` → `{"ok":true}`.
3. Expose it with an HTTPS tunnel you control, e.g. `cloudflared tunnel --url http://127.0.0.1:3334` or `ngrok http 3334`.
4. In ChatGPT (**Settings → Apps & Connectors → Advanced → Developer mode**), create a connector with URL `https://<tunnel-host>/mcp/<secret>`
   (or `https://<tunnel-host>/mcp` with bearer auth). Menu names depend on your plan and may change.

Treat the tunnel URL as a password: anyone with it can drive your DaVinci Resolve within the allowed folders. Stop the tunnel when done.
If ChatGPT limits the number of tools, set `MCP_TOOL_CATEGORIES` ([CONFIGURATION.md](CONFIGURATION.md)). Long renders can outlast
ChatGPT's wait: use `render_export_timeline { wait: false }`, then `render_get_status`.

## 7. Verify

In the MCP client: *"Call resolve_get_status."* Expect the adapter (`resolve`), DaVinci Resolve's version and the open project and timeline.
Without DaVinci Resolve: `RESOLVE_ADAPTER=mock node dist\index.js` (results are labelled `source: "mock"`).

Then try:

> Create a 4K 24 fps project called "Test", import C:\Users\you\Videos\clip.mp4, put it on a new timeline, add a teal-and-orange look and export it for YouTube 4K to my Videos folder.

Scripted live check: `pnpm test:live` ([TESTING.md](TESTING.md)). Problems: [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Files the server writes

| Where | What |
|---|---|
| `output\` | exports, renders, scopes stills, transcripts, voice-overs (configurable) |
| `output\backups\` | `.drp` project backups |
| `output\luts\` | generated `.cube` looks |
| `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\LUT\MCP\` | copies of applied LUTs (Resolve only loads LUTs from its LUT folders) |
| `logs\` | server log and operation log |
