# API Reference

## MCP surface

- **Tools:** 342 — full per-tool reference with input schemas in [TOOLS.md](TOOLS.md) (`pnpm docs:tools` regenerates it).
- **Transports:** stdio (`node dist/index.js`) for local clients; Streamable HTTP (`node dist/index.js --transport http`) at `/mcp` (or `/mcp/<MCP_SECRET_PATH>`), default `127.0.0.1:3334` ([INSTALLATION.md §6](INSTALLATION.md#6-chatgpt-remote-https)). Server capabilities: `tools`, `resources`, `prompts`, `logging`.
- **Result envelope** (text content and `structuredContent`): `{ ok, tool, source: "resolve"|"mock"|"server", status, message, data, warnings }`; errors add `error: { code, message, details?, hint? }` with `isError: true`. `status` is `ok`, `partial`, `unsupported`, `error` or `confirmation_required`; `ok` is `true` only when DaVinci Resolve (or the server, for pure computations) confirmed the operation.
- **Conventions:** frames are integers; absolute timeline frames include the timeline start (usually `01:00:00:00`). Timeline items: `itemId` (from `timeline_get_clips`, preferred) or `trackType` + `trackIndex` + `itemIndex` (1-based, clips only). Tools act on the open project and its current timeline unless a `timeline` name/id is given. Colors are hex. Write paths must be inside `ALLOWED_WRITE_PATHS`; existing files are not overwritten without `overwrite: true`; destructive tools need `confirm: true`.
- **Error codes:** `VALIDATION_ERROR`, `CONFIRMATION_REQUIRED`, `RESOLVE_NOT_INSTALLED`, `RESOLVE_NOT_RUNNING`, `SCRIPTING_UNAVAILABLE`, `PYTHON_NOT_FOUND`, `NO_PROJECT`, `NO_TIMELINE`, `NOT_FOUND`, `AMBIGUOUS`, `ALREADY_EXISTS`, `PATH_NOT_ALLOWED`, `FILE_EXISTS`, `OPERATION_FAILED`, `UNSUPPORTED`, `TIMEOUT`, `BRIDGE_BUSY`, `BRIDGE_CRASHED`, `UNKNOWN_OP`, `RENDER_FAILED`, `PROVIDER_NOT_CONFIGURED`, `PROVIDER_ERROR` (see `src/utils/errors.ts`).

### Resources

| URI | Content |
|---|---|
| `resolve://status` | Installation, connection, open project / timeline / page |
| `resolve://capabilities` | Scripting methods this Resolve build exposes (live) |
| `resolve://project/current` | Current project summary (live) |
| `resolve://project/settings` | All project settings (live) |
| `resolve://timeline/current` | Current timeline info, tracks and items (live) |
| `resolve://media` | Bins and clips in the media pool (live) |
| `resolve://effects` | Fusion effects applicable through this server and look presets |
| `resolve://render/queue` | Render jobs and status (live) |
| `resolve://presets/export` | Delivery presets |
| `resolve://operations` | Recent tool calls (operation log) |

### Prompts

`create_cinematic_video`, `create_youtube_video`, `create_commercial`, `create_documentary`, `create_social_media_video`, `apply_cinematic_grading`, `create_fusion_animation`, `clean_dialogue_audio`, `generate_subtitles`, `export_professional_master` — each a step-by-step tool plan ending with the verification rules.

## Background jobs

Renders (`render_start`, `render_export_timeline`, `render_export_clip`, `render_export_batch`) and every `workflow_*` tool accept `background: true`. The call returns at once:

```json
{ "ok": true, "data": { "jobId": "3f9c2a1b", "state": "queued", "queuedJobs": 1 } }
```

- `wait_for_job { jobId, timeoutSeconds }` waits up to 55 s, then returns the job (call again if still running).
- `get_job { jobId }` returns the current state, and the tool's result once `succeeded`.
- `list_jobs` lists recent jobs, newest first. `cancel_job { jobId }` cancels a queued job (a running Resolve call cannot be interrupted; use `render_cancel` for renders).
- Jobs run one at a time in submission order; the last 50 finished jobs are kept in memory.

## Workflows

```json
{
  "name": "workflow_create_youtube_video",
  "arguments": { "footageFolder": "D:\\Footage\\Coastline", "projectName": "Coastline", "title": "Coastline", "targetSeconds": 60, "look": "teal_orange", "dryRun": true }
}
```

- `workflow_create_youtube_video`, `workflow_create_social_content`, `workflow_create_advertisement`, `workflow_create_documentary` and `workflow_create_cinematic_video` plan an edit and run it step by step.
- `dryRun: true` returns the steps without touching Resolve. Required steps abort the workflow on failure; optional steps record a warning and continue.
- The report lists `stepsCompleted`, `stepsFailed`, `stepsSkipped`, `warnings` and `filesCreated`.

## Bridge (server ⇄ DaVinci Resolve)

There is no network protocol. The server starts one Python worker and talks to it in JSON lines over stdio:

| Direction | Line |
|---|---|
| Ready | `{"id": null, "ok": true, "result": {"ready": true, "python": "3.12.4", "ops": 199}}` |
| Request | `{"id": "7", "op": "timeline.create", "params": {"name": "Shorts", "settings": {}}}` |
| Success | `{"id": "7", "ok": true, "result": {"name": "Shorts"}}` |
| Failure | `{"id": "7", "ok": false, "error": {"code": "OPERATION_FAILED", "message": "…", "details": {}}}` |

The worker loads `DaVinciResolveScript` (via `RESOLVE_SCRIPT_API` / `RESOLVE_SCRIPT_LIB`) and dispatches by op name only. Fusion Lua helpers run through `fuscript -l lua resolve-scripts/fusion_helpers.lua <helper> <json>`.

### Bridge ops

The complete list lives in `src/resolve/bridge/commands.ts` (`BRIDGE_OPS`, 199 entries): `app.*` (status, version, info, capabilities, pages, system info, quit), `project.*` (create, open, save, close, delete, rename, list, settings, presets, import, export), `media.*` (import, bins, list, search, metadata, relink, proxies, markers, flags, colors, transcribe, auto-sync), `timeline.*` (create, open, tracks, clips, settings, markers, compound / Fusion clips, import, export, scene cuts), `edit.*` (append, insert, replace, move, trim, delete, properties, link, generators, stabilize, Smart Reframe), `effect.*`, `fx.*`, `transition.*`, `speed.*`, `title.*`, `subtitle.*`, `fusion.*` (comps, nodes, inputs, keyframes, expressions, render), `color.*` (nodes, CDL, LUTs, versions, groups, Magic Mask, stills), `audio.*`, `photo.*`, `ai.*` and `render.*`.

## Embedding the server

```ts
import { loadConfig } from "./src/config/index.js";
import { createAppContext, createServer } from "./src/server.js";
const config = loadConfig();
const app = createAppContext(config);      // or createAppContext(config, new ResolveBridge(config, new MockResolve()))
const server = createServer(app);          // McpServer; connect any SDK transport
```

`app.registry.invoke(name, args, toolContext(app))` invokes a validated tool in-process.
