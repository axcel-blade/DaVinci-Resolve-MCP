# Architecture

```
MCP client (Claude, ChatGPT, Cursor, …)
   │  stdio  or  Streamable HTTP (src/transport/http.ts)
   ▼
McpServer (src/server.ts)
   ├─ ToolRegistry (src/mcp/tools/common.ts)strict Zod schemas, confirm/background args, audit, result envelope
   │    └─ src/mcp/tools/*.ts       one file per Resolve area; workflow-* tools compose them
   ├─ JobManager (src/jobs/)             background: true → jobId; get_job / wait_for_job
   ├─ resources / prompts
   └─ ResolveBridge (src/resolve/bridge/bridge.ts)
        ├─ PythonBridge → resolve-scripts/resolve_worker.py (JSON lines over stdio, one call at a time)
        │                    └─ DaVinciResolveScript → running DaVinci Resolve
        ├─ LuaBridge   → fuscript + resolve-scripts/fusion_helpers.lua (Fusion helpers)
        └─ MockResolve (RESOLVE_ADAPTER=mock)           in-memory stand-in for tests/CI
```

## Request flow

1. The client calls a tool. `ToolRegistry` validates the arguments (`.strict()` Zod object), enforces `confirm: true` for destructive tools, and starts a background job when `background: true` is passed to a long tool.
2. The module handler checks paths with `PathPolicy`, optionally backs up the project, and calls `ctx.bridge.call(op, params)`.
3. `ResolveBridge` routes to the mock or to the Python worker. The worker dispatches the registered op (`@op("project.create")` etc.) against the Resolve scripting API and returns `{ ok, data | error }`.
4. The result is wrapped as `{ ok, tool, source, status, message, data, warnings, error? }`. `source` is `resolve`, `mock` or `server` (pure computation such as planners and job tools).

## Layout

| Path | Contents |
|---|---|
| `src/index.ts` | Entry point: `.env`, config, logger, transport, graceful shutdown |
| `src/config/` | Environment configuration and constants |
| `src/resolve/bridge/` | Resolve install detection (`detect.ts`), Python/Lua adapters, mock adapter, `bridge.ts` |
| `src/mcp/tools/` | Registry and helpers (`common.ts`), tool files per area, `workflow-*.ts`, `jobs.ts`, `index.ts` |
| `src/mcp/resources/`, `src/mcp/prompts/` | MCP resources and prompt templates |
| `src/design-engine/` | Planner, presets, workflow engine with dry-run plans |
| `src/transport/` | Streamable HTTP transport |
| `src/utils/` | Path sandbox, backups, audit log, errors, logger, timecode, FFmpeg probe, AI provider |
| `src/jobs/` | Background job manager |
| `resolve-scripts/` | Python operations run by the worker, and Fusion Lua helpers run through `fuscript` |
| `installers/`, `scripts/` | One-line installers, release packing, diagnostics, setup |
| `site/` | Astro docs site built from `docs/*.md` |
| `tests/` | `unit/`, `integration/`, `security/` (no Resolve needed), `e2e/` (real Resolve) |
