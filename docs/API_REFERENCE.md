# API reference

How an MCP client talks to this server: transports, result and error formats, background jobs, resources and
prompts. The full list of tools with their parameters is generated into [TOOLS.md](TOOLS.md)
(`node scripts/gen-docs.mjs` after `pnpm build`).

## Transports

| Transport | Start | Use |
|---|---|---|
| stdio (default) | `node dist/index.js` | Local clients: Claude Desktop, Claude Code, Cursor, VS Code, ... ([CLIENTS.md](CLIENTS.md)) |
| Streamable HTTP | `node dist/index.js --transport http` | Remote clients at `/mcp` (or `/mcp/<MCP_SECRET_PATH>`), default `127.0.0.1:3334`; see [CLIENTS.md](CLIENTS.md#chatgpt) |

Server capabilities: `tools`, `resources`, `prompts`, `logging`. All tool inputs are strict Zod schemas published
as JSON Schema in `tools/list`; unknown keys are rejected.

## Conventions

- **Time**: frames are integers; absolute timeline frames include the timeline start (usually `01:00:00:00`). See [TIMECODE.md](TIMECODE.md).
- **Timeline items**: `itemId` (from `timeline_get_clips`) or `trackType` + `trackIndex` + `itemIndex` (1-based, clips only).
- **Target**: tools act on the open project and its current timeline unless a `timeline` name/id is given.
- **Files**: write paths must be inside `ALLOWED_WRITE_PATHS`; reads can be limited with `ALLOWED_READ_PATHS`. Existing files
  are not overwritten unless `overwrite: true`.
- **Destructive tools** (annotation `destructiveHint: true`) refuse to run without `confirm: true`. Clients should ask the user first.

## Result envelope

Every tool returns the same JSON, both as text content and as `structuredContent`:

```json
{
  "ok": true,
  "tool": "project_create",
  "source": "resolve",
  "status": "ok",
  "message": "Project 'Demo' created and opened.",
  "data": { "name": "Demo", "settingsApplied": {} },
  "warnings": []
}
```

| Field | Meaning |
|---|---|
| `ok` | `true` only when DaVinci Resolve (or the server, for pure computations) confirmed the operation |
| `source` | `resolve` (real application), `mock` (`RESOLVE_ADAPTER=mock`), `server` (planners, job tools) |
| `status` | `ok`, `partial`, `unsupported`, `error`, `confirmation_required` |
| `error` | On failure: `{ code, message, details?, hint? }` |

Common error codes: `VALIDATION_ERROR`, `CONFIRMATION_REQUIRED`, `RESOLVE_NOT_RUNNING`, `SCRIPTING_UNAVAILABLE`, `NO_PROJECT`,
`NO_TIMELINE`, `NOT_FOUND`, `PATH_NOT_ALLOWED`, `FILE_EXISTS`, `UNSUPPORTED`, `TIMEOUT` (see `src/utils/errors.ts`).

## Background jobs

Renders (`render_start`, `render_export_timeline`, `render_export_clip`, `render_export_batch`) and every `workflow_*` tool accept
`background: true`. The call returns at once:

```json
{ "ok": true, "data": { "jobId": "3f9c2a1b", "state": "queued", "queuedJobs": 1 } }
```

| Tool | Use |
|---|---|
| `wait_for_job { jobId, timeoutSeconds }` | Wait up to 55 s, then return the job (call again if still running) |
| `get_job { jobId }` | Current state; includes the tool's result once `succeeded` |
| `list_jobs` | Recent jobs, newest first |
| `cancel_job { jobId }` | Cancel a queued job (a running Resolve call cannot be interrupted; use `render_cancel` for renders) |

Jobs run one at a time in submission order; the last 50 finished jobs are kept in memory.

## Resources

`resolve://status`, `resolve://capabilities`, `resolve://project/current`, `resolve://project/settings`,
`resolve://timeline/current`, `resolve://media`, `resolve://effects`, `resolve://render/queue`,
`resolve://presets/export`, `resolve://operations`.

## Prompts

`create_cinematic_video`, `create_youtube_video`, `create_commercial`, `create_documentary`, `create_social_media_video`,
`apply_cinematic_grading`, `create_fusion_animation`, `clean_dialogue_audio`, `generate_subtitles`, `export_professional_master`.

## Workflow examples

`examples/*.workflow.json` hold ready-made arguments for the workflow tools (all with `dryRun: true`).
