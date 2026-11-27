# Testing

| Command | Needs DaVinci Resolve | What it covers |
|---|---|---|
| `pnpm typecheck` | no | `tsc --noEmit` over `src/`, `tests/`, `scripts/` |
| `pnpm lint` | no | ESLint (`temp/`, `site/`, `resolve-scripts/`, `dist/` ignored) |
| `pnpm test` | no | Vitest unit + integration + security suites against the mock adapter (10 files, 62 tests) |
| `pnpm test:unit` / `test:integration` / `test:security` | no | One of those suites only |
| `pnpm test:live` | **yes** | Live run against the installed DaVinci Resolve through the Python bridge (`tests/e2e`) |
| `pnpm test:report` | optional | Runs everything and writes [TEST_REPORT.md](TEST_REPORT.md) |

## Unit, integration and security suites

| File | Covers |
|---|---|
| `tests/unit/server.test.ts` | Server startup over an in-memory MCP transport with the mock adapter; tools registered with annotations; result envelope with `source`; resources and prompts |
| `tests/unit/bridge.test.ts` | `ResolveBridge`: refuses non-allowlisted ops, ordering and history, failures recorded with their code, queue limit; **every allowlisted op is registered in `resolve-scripts/`**; `mcp_bridge_status` |
| `tests/unit/registry-planner.test.ts` | Unique, well-formed tool names, strict schemas, confirmation gate, validation before Resolve is called, honest `unsupported`, error-code mapping; editing planner (take scoring, plans with integer frame ranges, silence keep-ranges, look suggestions) |
| `tests/unit/jobs.test.ts` | Background jobs: `background: true`, `get_job`, `wait_for_job`, `list_jobs`, `cancel_job` |
| `tests/unit/paths-config.test.ts` | Configuration defaults, env and argv, public HTTP bind refused without auth; path policy (absolute paths, device namespaces, NUL bytes, write roots, no overwrite, read restrictions) |
| `tests/unit/timecode.test.ts` | Frame and timecode math, including drop-frame |
| `tests/unit/python.test.ts` | Python helpers (`timecode.py` matches TypeScript, LUT generator writes valid `.cube` files) |
| `tests/integration/mcp-server.test.ts` | MCP server over in-memory transport with the real Python bridge: tool, resource and prompt listing; real errors (never fake success) without Resolve; validation errors, confirmation, path refusal; workflow dry run and offline planners; unknown ops, worker timeout recovery, missing-Python errors |
| `tests/integration/stdio-client.test.ts` | Spawns the real server over stdio like Claude Desktop does |
| `tests/security/security.test.ts` | Path sandbox escapes, unknown keys rejected, destructive confirmations, no tool accepts free-form code, HTTP bind and bearer-token checks |

These suites use `MockResolve` (in-memory application state). They verify the server, bridge, validation, security and
workflow logic — **not** that DaVinci Resolve executes the ops. Mock results are always labelled `source: "mock"`.

## Live integration test

```powershell
pnpm test:live
```

Runs `tests/e2e` against the running DaVinci Resolve. It creates dedicated projects named `MCP_LIVE_TEST_<ts>`, `MCP_V21_TEST_<ts>` and
`MCP_E2E_<ts>` and never opens your own projects. It checks detect, connect, version, project, save, import video / audio / image,
timeline, clips, transforms, non-rippling title, transition, CDL + look, Fusion node, EDL export, backup, audio track and clip, render
job, render + verified MP4; on Resolve 21 also ResolveFX, native trim / move / speed, audio volume / pan, loudness analysis, voice
isolation, paste attributes and the Photo page; and end to end `workflow_create_youtube_video` (new project → import → rough cut →
title → look → music → render → verified 1920×1080 MP4).

- Test media is generated with FFmpeg into `output\live-test\` (FFmpeg required; without it live tests are skipped, not passed).
- Features the installed Resolve does not support are recorded as **unsupported** (reported as skipped) — never as passed.
- Each run writes `output\live-test\live-report.json` and `output\live-test\v21\v21-report.json`.
- Test projects are kept so you can inspect them. Set `RESOLVE_LIVE_CLEANUP=1` to delete the `MCP_LIVE_TEST_*` project after the run.

`scripts\integration-test.ps1` wraps it with the `test-bridge.ps1` pre-check (exit code 2 = blocked: bridge unavailable).

Latest results: [TEST_REPORT.md](TEST_REPORT.md).

## PowerShell syntax check

CI parses every `.ps1` under `scripts/`, `resolve-scripts/` and `installers/windows/`:

```powershell
Get-ChildItem scripts, resolve-scripts, installers/windows -Filter *.ps1 | ForEach-Object { $e = $null; [System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$null, [ref]$e) | Out-Null; if ($e) { $_.FullName; $e } }
```

## Manual checks with an MCP client

1. `resolve_get_status` → adapter and DaVinci Resolve version shown.
2. "Create a project called Test, import a clip and build a timeline from it" → then `timeline_get_clips` and look at the result.
3. "Apply the teal and orange look to V1" → a new grade version is added; the previous version is kept.
4. "Render the timeline to output\test.mp4" twice → the second call returns `FILE_EXISTS`.

MCP Inspector over stdio:

```powershell
npx @modelcontextprotocol/inspector node dist\index.js
```
