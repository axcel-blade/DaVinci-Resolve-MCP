# DaVinci Resolve MCP

[![CI](https://github.com/axcel-blade/DaVinci-Resolve-MCP/actions/workflows/ci.yml/badge.svg)](https://github.com/axcel-blade/DaVinci-Resolve-MCP/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/axcel-blade/DaVinci-Resolve-MCP?sort=semver)](https://github.com/axcel-blade/DaVinci-Resolve-MCP/releases/latest)
[![License: MIT](https://img.shields.io/github/license/axcel-blade/DaVinci-Resolve-MCP)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](package.json)
[![MCP](https://img.shields.io/badge/MCP-server-6E56CF)](https://modelcontextprotocol.io)
[![Installer](https://github.com/axcel-blade/DaVinci-Resolve-MCP/actions/workflows/installer.yml/badge.svg)](https://github.com/axcel-blade/DaVinci-Resolve-MCP/actions/workflows/installer.yml)
[![Docker](https://github.com/axcel-blade/DaVinci-Resolve-MCP/actions/workflows/docker.yml/badge.svg)](https://github.com/axcel-blade/DaVinci-Resolve-MCP/actions/workflows/docker.yml)
[![Docs](https://img.shields.io/badge/docs-site-31A8FF)](https://axcel-blade.github.io/DaVinci-Resolve-MCP/)

An MCP server that lets AI assistants (Claude Desktop, ChatGPT, any MCP client) work in **DaVinci Resolve**:
projects, media pool, timelines, editing, effects, speed, titles, subtitles, Fusion, color, Fairlight audio,
the Photo page and rendering. Its design engine turns natural-language briefs (YouTube videos, social cuts,
commercials, documentaries, cinematic pieces) into **real Resolve projects, timelines and render jobs**, and its
workflow engine plans and runs multi-step edits with a dry run first.

```
AI client (Claude Desktop: stdio · ChatGPT: HTTPS)
        │  MCP
        ▼
MCP server ── 342 tools, 10 resources, 10 prompts, background jobs, validation, auth
        │
        ▼
Design + workflow engines ── footage analysis → edit plan → dry run → workflow steps; presets, looks, export targets
        │
        ▼
ResolveBridge ── allowlisted ops · serial queue · timeouts · typed errors
        │  Python worker: resolve-scripts/resolve_worker.py → DaVinciResolveScript / fusionscript
        │  Lua helpers:   resolve-scripts/fusion_helpers.lua → fuscript
        ▼
DaVinci Resolve ── official scripting API ops (resolve-scripts/*.py)
```

- **Nothing to install inside DaVinci Resolve:** there is no plugin or panel. Each call runs one allowlisted Python op through the official scripting API.
- **Clear about its sources:** every result says whether DaVinci Resolve, the mock adapter or the server produced it. Features DaVinci Resolve does not expose to scripts (color node graphs, power windows and trackers, editing subtitle items, Fairlight mixer and fades, proxy generation…) return `unsupported` with an alternative rather than a fake result.
- **Non-destructive defaults:** new timelines, versions, nodes and render jobs instead of overwriting work; a project backup before anything destructive.
- **Safe:** Zod validation, an op allowlist with no way to run arbitrary scripts, a path sandbox, no silent overwrites, and `confirm: true` for destructive operations.

## Status

| Area | State |
|---|---|
| MCP server (stdio + Streamable HTTP), 342 tools, 10 resources, 10 prompts, background jobs | Implemented and covered by automated tests (62 Vitest unit, integration and security tests, using the mock adapter) |
| Design engine (planner, 10 cinematic looks, 14 export presets) and YouTube / social / advertisement / documentary / cinematic workflows | Implemented and covered by automated tests |
| Bridge (queue, timeouts, allowlist, error mapping, Python worker, Lua helpers, install detection) | Implemented; Windows verified with DaVinci Resolve |
| Scripting operations in a real DaVinci Resolve | `pnpm test:live` passed 31 live tests (including an end-to-end render) against DaVinci Resolve Studio 21.2 on Windows 11; see [docs/TEST_REPORT.md](docs/TEST_REPORT.md) |
| macOS / Linux | Implemented; not yet run on a Mac |
| ChatGPT remote connection | Transport implemented and tested locally; not verified against ChatGPT |

See [docs/LIMITATIONS.md](docs/LIMITATIONS.md) for details.

## Quick start

Requirements: **Windows 10/11 or macOS 12+**, Node.js 20+, pnpm (via Corepack), 64-bit Python 3, and DaVinci Resolve 18.5 or later
(21 recommended; some features need Studio). Optional: FFmpeg for media analysis and render verification.

### One-line install

This installs the latest release and registers it with every MCP client it finds: Claude Desktop, Claude Code,
Cursor, Windsurf, VS Code (Copilot), Cline, Roo Code, Gemini CLI and Codex. Existing configs are merged and backed up first.
To skip client registration, pass `-NoClients` / `--no-clients` or set `RESOLVE_MCP_CONFIGURE_CLIENTS=0`.
Read the scripts before running them:
[install.ps1](installers/windows/install.ps1), [install.sh](installers/macos/install.sh).

```powershell
irm https://axcel-blade.github.io/DaVinci-Resolve-MCP/install.ps1 | iex
```

```bash
curl -fsSL https://axcel-blade.github.io/DaVinci-Resolve-MCP/install.sh | bash
```

Settings are in [docs/CONFIGURATION.md](docs/CONFIGURATION.md). To build from source instead, follow the steps for your platform below.

### Windows (from source)

```powershell
corepack enable
pnpm install
pnpm build
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -ConfigureClaude
powershell -ExecutionPolicy Bypass -File scripts\diagnostics.ps1
```

### macOS (from source)

```bash
corepack enable
pnpm install
pnpm build
chmod +x scripts/*.sh
./scripts/install.sh --configure-claude
./scripts/diagnostics.sh
```

In DaVinci Resolve, set **Preferences → System → General → External scripting using** to **Local**, then restart it.

Start DaVinci Resolve, fully quit and reopen your AI client, then ask: *"Check the DaVinci Resolve status, then create a 4K project
called Coastline, import D:\Footage and build a 60-second YouTube edit with a teal and orange grade. Show me the plan first."*

ChatGPT needs a remote HTTPS endpoint; see [INSTALLATION.md](docs/INSTALLATION.md).

## Commands

| Command | Purpose |
|---|---|
| `pnpm install` | Install dependencies (pnpm only; no npm or yarn lockfiles) |
| `pnpm dev` | Run from source with reload |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Start over stdio. Use `pnpm start:http` for HTTP (`http://127.0.0.1:3334/mcp`) |
| `pnpm test` | Automated tests (mock adapter; DaVinci Resolve not needed) |
| `pnpm test:live` | Integration run against the real DaVinci Resolve (its own `MCP_LIVE_TEST_*` projects; never opens yours) |
| `pnpm test:unit` / `test:integration` / `test:security` | One automated suite only |
| `pnpm lint` / `pnpm typecheck` | Static checks |
| `pnpm docs:tools` | Regenerate [docs/TOOLS.md](docs/TOOLS.md) from the tool registry |
| `node scripts/pack-release.mjs` | Build the release package the installers download |
| `pnpm --dir site dev` | Run the docs site locally (renders `docs/*.md`) |
| `docker compose -f site/docker-compose.yml up --build -d` | Serve the docs site in Docker (nginx) at http://localhost:8080 (set `SITE_PORT` to change the port); use `docker-compose.dev.yml` for hot reload |

## Documentation

- **Docs site: https://axcel-blade.github.io/DaVinci-Resolve-MCP/**
- [Installation (Windows & macOS)](docs/INSTALLATION.md) · [Configuration](docs/CONFIGURATION.md) · [Connecting clients](docs/CLIENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Supported features](docs/SUPPORTED_FEATURES.md) · [API reference](docs/API_REFERENCE.md) (results, errors, jobs, resources, prompts)
- [Tool reference](docs/TOOLS.md) (generated)
- [Security](docs/SECURITY.md) · [Testing](docs/TESTING.md) · [Test report](docs/TEST_REPORT.md) · [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Development & extension guide](docs/DEVELOPMENT.md) · [Known limitations](docs/LIMITATIONS.md)
- [Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [Security policy](SECURITY.md) · [Support](SUPPORT.md) · [Changelog](CHANGELOG.md)

## License

MIT; see [LICENSE](LICENSE). This project is not affiliated with Blackmagic Design. DaVinci Resolve is a trademark of Blackmagic Design Pty. Ltd.
