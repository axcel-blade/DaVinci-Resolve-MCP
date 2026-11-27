# Configuration

Settings come from environment variables. At startup the server loads `.env` next to `package.json`; variables already set (for example in the MCP client's `env` block) take precedence.

## Transport

| Variable | Default | Description |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` (also `--transport http`) |
| `MCP_HTTP_HOST` | `127.0.0.1` | Bind address. Non-loopback requires `MCP_AUTH_TOKEN` or `MCP_SECRET_PATH` (startup fails otherwise) |
| `MCP_HTTP_PORT` | `3334` | |
| `MCP_AUTH_TOKEN` | – | Bearer token for `/mcp` (generate: `scripts\new-token.ps1`) |
| `MCP_SECRET_PATH` | – | Serve at `/mcp/<secret>` for clients without header support |
| `MCP_TOOL_CATEGORIES` | all | Comma list to expose a subset, e.g. `application,projects,media,timeline,editing,rendering` (helps clients with tool-count limits) |

Health check: `GET /healthz`.

## DaVinci Resolve

| Variable | Default | Description |
|---|---|---|
| `RESOLVE_INSTALL_DIR` | auto | Folder with `Resolve.exe` |
| `RESOLVE_SCRIPT_API` | `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting` | |
| `RESOLVE_SCRIPT_LIB` | `<install>\fusionscript.dll` | |
| `RESOLVE_PYTHON` | `python` | 64-bit Python for the bridge |
| `RESOLVE_TIMEOUT_MS` | `60000` | Per-call timeout (long calls such as renders/transcription use their own limits) |
| `RESOLVE_RENDER_TIMEOUT_MS` | `14400000` | Max wait for a render |
| `RESOLVE_AUTO_LAUNCH` | `false` | Start Resolve automatically when a tool needs it |

## Files and safety

| Variable | Default | Description |
|---|---|---|
| `OUTPUT_DIR` | `output` | Default export location |
| `BACKUP_DIR` | `output/backups` | `.drp` backups |
| `LUT_DIR` | `output/luts` | Generated LUTs |
| `ALLOWED_WRITE_PATHS` | output dirs + Videos, Documents, Desktop, TEMP | `;`-separated. Writes elsewhere are refused |
| `ALLOWED_READ_PATHS` | any | `;`-separated. Restricts imports when set |
| `REQUIRE_CONFIRMATION` | `true` | Destructive tools need `confirm: true` |
| `BACKUP_BEFORE_DESTRUCTIVE` | `true` | Export `.drp` before deleting a project (deletion aborts if the backup fails) |

## Optional AI provider

Used only by tools/engines named `provider` (transcription, TTS). Resolve's own AI features never need it.

| Variable | Default | |
|---|---|---|
| `AI_PROVIDER` | `none` | `openai` = any OpenAI-compatible API |
| `AI_BASE_URL` | `https://api.openai.com/v1` | |
| `AI_API_KEY` | – | Read from env only, never logged or returned |
| `AI_TRANSCRIPTION_MODEL` | `whisper-1` | |
| `AI_TTS_MODEL` / `AI_TTS_VOICE` | `tts-1` / `alloy` | |

## Optional FFmpeg

`FFMPEG_PATH`, `FFPROBE_PATH` (default `ffmpeg` / `ffprobe` on PATH). Without them, analysis tools return `unsupported` and render verification checks existence and size only.

## Logging

`LOG_LEVEL` (`debug|info|warn|error`), `LOG_DIR` (`logs`). Logs go to stderr (stdout carries the MCP protocol) and to `logs\mcp-YYYY-MM-DD.log`; every tool call is appended to `logs\operations-YYYY-MM-DD.jsonl` with secrets redacted.
