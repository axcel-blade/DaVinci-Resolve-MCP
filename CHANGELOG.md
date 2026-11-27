# Changelog

## Unreleased

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
