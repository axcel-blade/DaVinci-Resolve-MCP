# DaVinci Resolve MCP

[![CI](https://github.com/axcel-blade/DaVinci-Resolve-MCP/actions/workflows/ci.yml/badge.svg)](https://github.com/axcel-blade/DaVinci-Resolve-MCP/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/axcel-blade/DaVinci-Resolve-MCP?sort=semver)](https://github.com/axcel-blade/DaVinci-Resolve-MCP/releases/latest)
[![License: MIT](https://img.shields.io/github/license/axcel-blade/DaVinci-Resolve-MCP)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](package.json)
[![MCP](https://img.shields.io/badge/MCP-server-6E56CF)](https://modelcontextprotocol.io)
[![Installer](https://github.com/axcel-blade/DaVinci-Resolve-MCP/actions/workflows/installer.yml/badge.svg)](https://github.com/axcel-blade/DaVinci-Resolve-MCP/actions/workflows/installer.yml)
[![Docs](https://img.shields.io/badge/docs-site-D9570D)](https://axcel-blade.github.io/DaVinci-Resolve-MCP/)

An MCP server that lets AI assistants (Claude Desktop, ChatGPT) edit in **DaVinci Resolve**: it turns
natural-language requests — YouTube videos, social cuts, commercials, documentaries and cinematic pieces — into
real Resolve projects, timelines, grades, mixes and renders through the official scripting API, inspects the
result and verifies the exported file.

```
AI client (Claude Desktop: stdio · ChatGPT: HTTPS)
        │  MCP
        ▼
MCP server ── 341 tools, 10 resources, 10 prompts, background jobs, validation, auth
        │
        ▼
Design engine ── footage analysis → edit plan → workflow steps (dry-run first); presets, looks, export targets
        │
        ▼
Resolve bridge ── registered ops · serial worker · timeouts · typed errors · mock adapter for tests
        │  Python worker (resolve-scripts/resolve_worker.py) → DaVinciResolveScript / fusionscript
        │  Lua helpers  (resolve-scripts/fusion_helpers.lua) → fuscript
        ▼
DaVinci Resolve ── projects, media pool, timelines, Fusion, color, Fairlight, Photo, Deliver
```

## Status

| Area | State |
|---|---|
| MCP server (stdio + Streamable HTTP), 341 tools, 10 resources, 10 prompts, background jobs | Implemented, covered by automated tests (mock adapter) |
| Tools: application, projects, media, timeline, editing, effects, speed, titles, subtitles, Fusion, color, Fairlight audio, AI, Photo page, rendering | Implemented; features the API does not expose report `unsupported` with an alternative ([docs/SUPPORTED_FEATURES.md](docs/SUPPORTED_FEATURES.md)) |
| Design engine (planner, 10 cinematic looks, 14 export presets, YouTube / social / advertisement / documentary / cinematic workflows) | Implemented, covered by automated tests |
| Bridge (Python worker, timeouts, auto-restart, install detection, Lua/Fusion helpers, mock adapter) | Implemented; Windows verified with Resolve; macOS/Linux detection added, untested |
| Operations inside a real DaVinci Resolve | Verified against Resolve Studio 21.2 on Windows 11 with `pnpm test:live` (31 live tests incl. an end-to-end render); see [docs/TEST_REPORT.md](docs/TEST_REPORT.md) |
| ChatGPT remote connection | Transport implemented and tested locally; not verified against ChatGPT |

See [docs/LIMITATIONS.md](docs/LIMITATIONS.md) for details.

## Quick start

Requirements: **Windows 10/11 or macOS**, Node.js 20+, pnpm (via Corepack), 64-bit Python 3, DaVinci Resolve 18.5 or later
(21 recommended; some features need Studio). Optional: FFmpeg for media analysis and render verification.

In Resolve, enable **Preferences → System → General → External scripting using: Local**, then restart Resolve.

### One-line install

Installs the latest release and registers it with every MCP client it finds: Claude Desktop, Claude Code,
Cursor, Windsurf, VS Code (Copilot), Cline, Roo Code, Gemini CLI and Codex. Existing configs are merged with
a backup; pass `-NoClients` / `--no-clients` (or set `RESOLVE_MCP_CONFIGURE_CLIENTS=0`) to skip this.
Read the scripts first:
[install.ps1](installers/windows/install.ps1), [install.sh](installers/macos/install.sh).

```powershell
irm https://axcel-blade.github.io/DaVinci-Resolve-MCP/install.ps1 | iex
```

```bash
curl -fsSL https://axcel-blade.github.io/DaVinci-Resolve-MCP/install.sh | bash
```

Settings: [docs/CONFIGURATION.md](docs/CONFIGURATION.md). To build from source instead:

### Windows (from source)

```powershell
corepack enable
pnpm install
pnpm build
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
powershell -ExecutionPolicy Bypass -File scripts\diagnostics.ps1
```

`install.ps1` checks Node/pnpm/Python, detects Resolve, writes `.env`, builds, validates the Python bridge and tests the
live connection. Add `-SetUserEnvironment` to also set the Resolve scripting variables for your user.

### macOS (from source)

```bash
corepack enable
pnpm install
pnpm build
chmod +x scripts/*.sh
./scripts/install.sh --configure-claude
./scripts/diagnostics.sh
```

Fully quit and reopen your AI client, then ask: *"Check DaVinci Resolve status, then create a 4K project called Coastline,
import D:\Footage and build a 60-second YouTube edit with a teal and orange grade. Show me the plan first."*

## Commands

| Command | Purpose |
|---|---|
| `pnpm install` | Install dependencies (pnpm only — no npm/yarn lockfiles) |
| `pnpm dev` | Run from source with reload |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Start (stdio). `pnpm start:http` for HTTP (`http://127.0.0.1:3334/mcp`) |
| `pnpm test` | Automated unit, integration and security tests (mock adapter, no Resolve needed) |
| `pnpm test:unit` / `test:integration` / `test:security` | One suite only |
| `pnpm test:live` | End-to-end suite (`tests/e2e`) against the running Resolve; uses its own `MCP_LIVE_TEST_*` / `MCP_E2E_*` projects and never opens yours |
| `pnpm test:report` | Run all suites and write [docs/TEST_REPORT.md](docs/TEST_REPORT.md) |
| `pnpm lint` / `pnpm typecheck` | Static checks |
| `powershell -File scripts\build.ps1` | Full quality gate: typecheck, lint, build, tests |
| `powershell -File scripts\integration-test.ps1` | Bridge check, then the live suite |
| `powershell -File scripts\test-bridge.ps1` · `./scripts/test-bridge.sh` | Read-only Resolve connection probe |
| `node scripts/gen-docs.mjs` | Regenerate [docs/TOOLS.md](docs/TOOLS.md) after `pnpm build` |
| `node scripts/pack-release.mjs` | Build the release package (`release/davinci-resolve-mcp-X.Y.Z.zip`) the installers download |
| `node scripts/smoke-install.mjs` | Smoke-test a build with the mock adapter |
| `pnpm --dir site dev` | Run the docs site locally (renders `docs/*.md`) |
| `docker compose -f site/docker-compose.yml up --build -d` | Docs site in Docker (nginx) at http://localhost:8080 (`SITE_PORT` to change); `docker-compose.dev.yml` for hot reload on :4321 |

## Documentation

- **Docs site: https://axcel-blade.github.io/DaVinci-Resolve-MCP/**
- [Installation (Windows & macOS)](docs/INSTALLATION.md) — pnpm, Python, Resolve, Claude Desktop, ChatGPT · [Configuration](docs/CONFIGURATION.md) · [Connecting clients](docs/CLIENTS.md) (Claude Desktop, Claude Code, ChatGPT, ...)
- [Architecture](docs/ARCHITECTURE.md)
- [Supported features](docs/SUPPORTED_FEATURES.md) · [API reference](docs/API_REFERENCE.md) (results, errors, jobs, resources, prompts)
- [Tool reference](docs/TOOLS.md) (generated) · [Example prompts](docs/EXAMPLES.md) · [Workflow examples](examples/)
- [Frames and timecode](docs/TIMECODE.md)
- [Security](docs/SECURITY.md) · [Testing](docs/TESTING.md) · [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Development & extension guide](docs/DEVELOPMENT.md) · [Known limitations](docs/LIMITATIONS.md)
- [Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [Security policy](SECURITY.md) · [Support](SUPPORT.md)

## License

MIT — see [LICENSE](LICENSE).

DaVinci Resolve is a trademark of Blackmagic Design. This project is not affiliated with or endorsed by Blackmagic Design.
