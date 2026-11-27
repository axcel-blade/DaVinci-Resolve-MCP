# Changelog

## Unreleased

### Changed
- Restructured to match the Photoshop-MCP architecture: `src/mcp/tools/common.ts` is now `registry.ts`, shared argument schemas moved to `src/mcp/tools/args.ts` and `src/schemas/`, and `src/shared.ts` re-exports cross-cutting pieces.
- `ResolveBridge` now runs every call through a `BridgeAdapter` (Python worker or mock), refuses ops not in the `BRIDGE_OPS` allowlist (`UNKNOWN_OP`) before Resolve is contacted, serialises calls in an `OperationQueue` (`BRIDGE_BUSY` when full), and keeps an operation history.

### Added
- `mcp_bridge_status` tool: adapter, queue depth, running op and recent bridge operations.
- `tests/helpers.ts`, `tests/setup.ts` and `tests/unit/bridge.test.ts` (allowlist kept in sync with `resolve-scripts`).
- Pages workflow enables GitHub Pages automatically; build emits source maps.
- `scripts/gen-tool-docs.ts` (with `src/utils/zod-json.ts`) generates `docs/TOOLS.md` from source, with status, kind, JSON input schema and an example per tool; `pnpm docs:tools` runs it.

### Fixed
- The server name and version are read from `package.json` instead of being hardcoded, so `--version` and the MCP server info match the release (the Release workflow's version check failed for 1.1.0).

### Removed
- Files with no Photoshop-MCP counterpart: `docs/EXAMPLES.md`, `docs/TIMECODE.md`, the `examples/` folder (also dropped from the release package) and the old `scripts/gen-docs.mjs` generator.

### Changed (docs and tooling layout)
- README, docs, site, `.env.example`, PowerShell/shell scripts, installers and GitHub templates now follow the Photoshop-MCP layout and wording, with DaVinci Resolve content. `SUPPORTED_FEATURES.md` opens with a per-module summary; the detailed API matrix follows it. ChatGPT setup moved from `CLIENTS.md` to `INSTALLATION.md` §6.
- Scripts share `Test-Python`, `Find-Resolve` and `Set-ResolveDotEnv` from `scripts/common.ps1`; `install.ps1` gains `-ConfigureClaude`; `launch.ps1` takes `-Http -Port -BindHost`; `check-deps.ps1` exits non-zero when something is missing.

## 1.0.0 — 2026-11-27

### Added
- Initial release: 337 tools across application, projects, media, timeline, editing, effects, speed, titles, subtitles, Fusion, color, audio, AI, photo and rendering, plus YouTube, social, documentary, cinematic and advertisement workflows. Python scripting bridge, path sandbox, confirmations and backups for destructive tools, stdio and HTTP transports.
- Background jobs: renders (`render_start`, `render_export_timeline`, `render_export_clip`, `render_export_batch`) and all `workflow_*` tools accept `background: true` and return a `jobId` at once; collect results with `get_job`, `wait_for_job`, `list_jobs`, `cancel_job`.
- Mock adapter (`RESOLVE_ADAPTER=mock`): an in-memory stand-in for DaVinci Resolve used by tests, CI and the installer smoke test. Every tool result now states its `source` (`resolve`, `mock` or `server`).
- One-line installers for Windows (`installers/windows/install.ps1`) and macOS (`installers/macos/install.sh`) that download a release, verify its checksum and register the server with Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Gemini CLI and Codex.
- Release tooling: `scripts/pack-release.mjs`, `scripts/smoke-install.mjs`, diagnostics scripts.
- GitHub workflows (CI, Release, CD, Installer, Pages, Docker), issue/PR/discussion templates, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`.
- Astro docs site (`site/`) built from `docs/*.md`, serving the installers.
- ESLint (`pnpm lint`).

### Changed
- `docs/MCP_TOOLS.md` → `docs/TOOLS.md`, `docs/API_SUPPORT.md` → `docs/SUPPORTED_FEATURES.md`, `scripts/gen-tool-docs.mjs` → `scripts/gen-docs.mjs`.
