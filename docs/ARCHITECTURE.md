# Architecture

```
┌──────────────┐  stdio (Claude Desktop, Claude Code, Cursor, VS Code)   ┌──────────────── MCP server (Node, dist/index.js) ─────────────────┐
│ MCP client   │────────────────────────────────────────────────────────►│ transport/   stdio | Streamable HTTP (bearer / secret path)       │
│ Claude, GPT… │  HTTPS tunnel → Streamable HTTP (ChatGPT, remote)       │ mcp/tools/   342 tools → Zod validation → handlers                │
└──────────────┘                                                          │ design-engine/   footage → edit plans → workflow steps            │
                                                                          │ jobs/        background jobs                                      │
                                                                          │ resolve/bridge/  ResolveBridge: allowlist, serial queue,          │
                                                                          │              timeouts, op history, typed errors                   │
                                                                          └───────────────┬───────────────────────────────────────────────────┘
                                         Python worker: resolve-scripts/resolve_worker.py (JSON lines over stdio) ──► fusionscript
                                         Lua helpers:   fuscript resolve-scripts/fusion_helpers.lua
                                                                          ┌───────────────▼──────────── DaVinci Resolve (scripting API) ───────┐
                                                                          │ resolve-scripts/ops.py  @op registry, check(), accessors          │
                                                                          │ project / media / timeline / editing / fusion / color / audio /   │
                                                                          │ render / advanced managers (.py)                                  │
                                                                          │ → Resolve, ProjectManager, MediaPool, Timeline, Fusion comps      │
                                                                          └────────────────────────────────────────────────────────────────────┘
```

No plugin, panel or socket is added inside DaVinci Resolve. The bridge is one long-lived Python worker that the server starts and restarts.

## Layers

| Layer | Location | Responsibility |
|---|---|---|
| Transports | `src/index.ts`, `src/transport/http.ts` | stdio for local clients; Streamable HTTP (sessions, bearer / secret-path auth, DNS-rebinding protection) for remote clients. Both build the same `McpServer` from `src/server.ts`. |
| MCP layer | `src/mcp/tools/*`, `resources/`, `prompts/` | Tool registration with strict Zod schemas (`args.ts`, `src/schemas/`), path sandboxing, confirmation gates, audit log, structured results (`ok`, `tool`, `source`, `status`, `message`, `data`, `warnings`). |
| Design engine | `src/design-engine/*` | Footage analysis → editing plan (take scoring, integer frame ranges, silence keep-ranges, look suggestions); presets, looks and export targets; workflow engine with dry-run plans and required / optional steps. Pure TypeScript. |
| Jobs | `src/jobs/*` | `background: true` on long tools returns a `jobId`; jobs run one at a time in submission order. |
| Bridge | `src/resolve/bridge/bridge.ts`, `queue.ts`, `commands.ts`, `types.ts` | Op allowlist (`BRIDGE_OPS`, 199 ops), serial `OperationQueue`, timeouts, auto-launch, op history, error mapping. |
| Adapters | `python-adapter.ts`, `lua-adapter.ts`, `mock-adapter.ts`, `detect.ts` | Python worker (JSON lines, restarted on crash or timeout); bundled Fusion Lua helpers through `fuscript`; in-memory mock for tests. `detect.ts` finds the install, scripting library and running process. |
| Python ops | `resolve-scripts/*.py` | Op functions registered with `@op("area.name")`; `resolve_worker.py` dispatches by name and writes `{id, ok, result | error}`. |

## Request flow

1. The client calls e.g. `timeline_create { name: "Shorts", width: 1080, height: 1920 }`.
2. `ToolRegistry` validates (`.strict()` Zod object), enforces `confirm` for destructive tools and starts a background job when `background: true` is passed to a long tool. The handler sandboxes paths (`PathPolicy`), backs up the project before destructive changes, and calls `ctx.bridge.call("timeline.create", params)` (workflows run several tools in order).
3. The bridge checks `ALLOWED_OPS` and queues the call (the Resolve scripting API is not safe for concurrent use).
4. The Python adapter writes `{"id", "op", "params"}` as one JSON line to the worker. The worker runs the registered op against the scripting API; `check()` turns a `False` / `None` API return into `OPERATION_FAILED`, and newer methods are probed so older versions report `UNSUPPORTED`.
5. The worker answers `{ok: true, result}` or `{ok: false, error: {code, message, details}}`. Errors become a typed `McpToolError`; `ok: true` is the only path to success. A call that exceeds its timeout kills the worker; the next call starts a fresh one.
6. The tool returns JSON with `source: "resolve"` (or `"mock"` / `"server"`).

## Why a Python worker

- The official, documented scripting entry point is `DaVinciResolveScript` / `fusionscript` (Resolve's `Support/Developer/Scripting/README.txt`). It is available to Python and Lua; Python has the complete API.
- A long-lived worker keeps the `fusionscript` connection open, so calls cost milliseconds, not a process start.
- The worker is a child process: it can be killed on timeout without affecting the server or Resolve.
- `RESOLVE_ADAPTER=mock` replaces it with an in-memory stand-in for tests, CI and the installer smoke test.
- Nothing has to be installed into DaVinci Resolve; only *External scripting using: Local* must be enabled.

## Tool catalog layers

| Layer | Example | Notes |
|---|---|---|
| Primitive | `timeline_create` → `timeline.create` | One op. |
| Composite | `color_apply_look` | Several ops per clip (new version, CDL, LUT); `failed` items make the result `partial`. |
| Data-driven | `ai_remove_silence`, `ai_find_best_clips` | Reads measured data (FFmpeg, clip properties, transcripts) and computes edits server-side. |
| Workflow | `workflow_create_youtube_video` | Workflow engine plans steps; `dryRun: true` lists them without touching Resolve. |
| Unsupported / provider | `color_create_power_window`, `ai_transcribe_audio` | Throw `UNSUPPORTED` / `PROVIDER_NOT_CONFIGURED` with an alternative. |

## Verified vs. assessed

- *Verified*: anything read back from DaVinci Resolve (settings read back after `SetSetting`, `timeline_get_clips`, render files checked on disk with `render_verify_output`).
- *Visual assessment*: only the AI client can provide it, from stills exported with `clip_export_frame` or `color_grab_still`. If no image was produced, the tools say so.

## Key files

| File | Role |
|---|---|
| `src/server.ts` | Builds the context (bridge, paths, audit, registry, jobs) and the `McpServer` |
| `src/mcp/tools/registry.ts` | `ToolRegistry.define`, `unsupported`, result envelope, `run()` |
| `src/resolve/bridge/commands.ts` | The single list of allowlisted ops (unit test checks it matches the `@op` registry in `resolve-scripts/`) |
| `src/resolve/bridge/bridge.ts` | `ResolveBridge`: allowlist, queue, timeouts, auto-launch, op history |
| `resolve-scripts/ops.py` | `@op` registry, `check()`, `require_method()`, Resolve accessors |
| `resolve-scripts/resolve_worker.py` | JSON-lines worker loop and dispatcher |
