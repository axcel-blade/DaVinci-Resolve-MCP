# Configuration

Settings are environment variables. The server loads `.env` from the project root at startup (copy `.env.example`); variables set in the MCP client's `env` block win.

| Variable | Default | Meaning |
|---|---|---|
| `RESOLVE_ADAPTER` | `python` | `python` (the official scripting API) or `mock` (in-memory, for tests and demos) |
| `RESOLVE_INSTALL_DIR` | auto | Folder with `Resolve.exe` |
| `RESOLVE_SCRIPT_API` | `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting` | Scripting folder containing `Modules` |
| `RESOLVE_SCRIPT_LIB` | `<install>\fusionscript.dll` | Scripting library loaded by the Python worker |
| `RESOLVE_PYTHON` | `python` | 64-bit Python for the bridge |
| `RESOLVE_TIMEOUT_MS` | `60000` | Timeout per bridge call (long calls such as transcription use their own limits) |
| `RESOLVE_RENDER_TIMEOUT_MS` | `14400000` | Max wait for a render |
| `RESOLVE_AUTO_LAUNCH` | `false` | Start DaVinci Resolve on the first call if it is not running (otherwise fail with `RESOLVE_NOT_RUNNING`) |
| `OUTPUT_DIR` | `output` | Default export location |
| `BACKUP_DIR` | `output/backups` | `.drp` backups |
| `LUT_DIR` | `output/luts` | Generated LUTs |
| `ALLOWED_WRITE_PATHS` | output folders + Videos, Documents, Desktop, TEMP | `;`-separated roots the server may write to; writes elsewhere are refused |
| `ALLOWED_READ_PATHS` | any | `;`-separated roots imports may read from, when set |
| `REQUIRE_CONFIRMATION` | `true` | Destructive tools need `confirm: true` |
| `BACKUP_BEFORE_DESTRUCTIVE` | `true` | Export a `.drp` before deleting a project (deletion aborts if the backup fails) |
| `FFMPEG_PATH` / `FFPROBE_PATH` | `ffmpeg` / `ffprobe` | Media analysis and render verification; without them, analysis tools return `unsupported` and verification checks existence and size only |
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` (also `--transport http`) |
| `MCP_HTTP_HOST` | `127.0.0.1` | HTTP bind address. Non-loopback requires `MCP_AUTH_TOKEN` or `MCP_SECRET_PATH` (startup fails otherwise) |
| `MCP_HTTP_PORT` | `3334` | HTTP port. Health check: `GET /healthz` |
| `MCP_AUTH_TOKEN` | – | Bearer token for `/mcp`. Required off-loopback unless `MCP_SECRET_PATH` is set |
| `MCP_SECRET_PATH` | – | Also serve at `/mcp/<secret>` for connector UIs that cannot send headers (≥ 24 URL-safe chars; `scripts\new-token.ps1`) |
| `MCP_TOOL_CATEGORIES` | all | Comma list to expose a subset, e.g. `application,projects,media,timeline,editing,rendering` (helps clients with tool-count limits) |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `LOG_DIR` | `logs` | JSON logs (`mcp-YYYY-MM-DD.log`) and the operation log (`operations-YYYY-MM-DD.jsonl`, secrets redacted); logs also go to stderr |
| `AI_PROVIDER` | `none` | `openai` = any OpenAI-compatible API, used only by provider-backed transcription and voice-over tools |
| `AI_BASE_URL` | `https://api.openai.com/v1` | Provider endpoint |
| `AI_API_KEY` | – | Read from env only, never logged or returned |
| `AI_TRANSCRIPTION_MODEL` | `whisper-1` | Transcription model |
| `AI_TTS_MODEL` / `AI_TTS_VOICE` | `tts-1` / `alloy` | Voice-over model and voice |

## Command-line flags

| Flag | Effect |
|---|---|
| `--transport http` | Streamable HTTP instead of stdio |
| `--version` | Print name and version |

## MCP clients the installers configure

`installers/windows/install.ps1` and `installers/macos/install.sh` merge a `davinci-resolve` server entry (with a backup) into
Claude Desktop, Cursor, Windsurf, VS Code, Cline, Roo Code and Gemini CLI configs, and register it with the Claude Code and Codex CLIs when they are on `PATH`.
The entry sets `RESOLVE_ADAPTER=python`. Set `RESOLVE_MCP_CONFIGURE_CLIENTS=0` (or `-NoClients` / `--no-clients`)
to only print the snippet. See [CLIENTS.md](CLIENTS.md) for manual setup.
