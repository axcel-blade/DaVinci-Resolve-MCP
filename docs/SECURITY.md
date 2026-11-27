# Security

Driving DaVinci Resolve from an AI agent means an untrusted model chooses tool calls. The design limits what any call can do.

## Threats and controls

| Threat | Control |
|---|---|
| Arbitrary code execution in DaVinci Resolve | The bridge runs only the 199 allowlisted ops in `BRIDGE_OPS` (`src/resolve/bridge/commands.ts`); `ResolveBridge.call` refuses anything else with `UNKNOWN_OP` before the Python worker is contacted, and the worker dispatches by registered op name only (`resolve-scripts/ops.py`). Arguments travel as JSON, so client data is never evaluated as code, and there is no `eval` / raw-Python / raw-Lua tool. Lua runs only the bundled `fusion_helpers.lua` helpers. |
| Remote control of DaVinci Resolve | There is no listening socket added on the DaVinci Resolve side. The bridge is a local child process (`python resolve_worker.py` → `fusionscript`) started by the server; Resolve's own external scripting must be set to **Local**. |
| HTTP transport exposure | Loopback by default; non-loopback requires `MCP_AUTH_TOKEN` (bearer) or `MCP_SECRET_PATH` (≥ 24 chars). Tokens are compared in constant time. DNS-rebinding protection on loopback. Request size limit. |
| Path traversal / arbitrary file access | `PathPolicy` (`src/utils/paths.ts`): absolute local paths only; rejects NUL bytes, device namespaces and URLs; writes (renders, exports, backups, LUTs) must resolve inside `ALLOWED_WRITE_PATHS`; reads can be limited with `ALLOWED_READ_PATHS`. |
| Silent data loss | Never overwrites: `FILE_EXISTS` unless `overwrite: true`. Destructive operations (delete projects, timelines, tracks, clips, media, bins, render jobs, grade resets, quit) require `confirm: true`, carry `destructiveHint`, and back up the project first when `BACKUP_BEFORE_DESTRUCTIVE=true`. Grades are added as new versions; looks and workflows build new timelines. |
| Resource exhaustion | Bounded op queue (`BRIDGE_BUSY`), per-call timeouts (`RESOLVE_TIMEOUT_MS`, renders `RESOLVE_RENDER_TIMEOUT_MS`); a hung call's worker process is killed and restarted. |
| Fabricated success | Results are labelled by source (`resolve` / `mock` / `server`); only an `ok` result returned by the Resolve API counts as success (a `False`/`None` return becomes `OPERATION_FAILED`); renders are verified on disk. |
| Secret leakage | Logs and the audit log (`logs/operations-*.jsonl`) redact keys matching token / secret / password / api key / authorization. `AI_API_KEY` is read from the environment only and never returned by tools. |

## Guidance for operators

- Keep `ALLOWED_WRITE_PATHS` narrow (a dedicated work folder); never include a drive root.
- When tunnelling for ChatGPT, use a fresh `MCP_SECRET_PATH`, share the URL with no one, and stop the tunnel afterwards. Rotate tokens with `scripts\new-token.ps1`.
- Review destructive confirmations; MCP clients show the `destructiveHint` annotation.
- Never commit `.env` (it may hold `AI_API_KEY`).

## AI providers

External services are used **only** when you set their credentials, and only by tools whose name says so (`ai_transcribe_audio`, `ai_generate_subtitles`, `ai_generate_voiceover`, and `subtitle_generate` when it falls back to the provider). They upload the audio being transcribed, or the voice-over text, to that service.

| Provider | Variables | Endpoints |
|---|---|---|
| OpenAI-compatible API | `AI_PROVIDER=openai`, `AI_API_KEY`, `AI_BASE_URL` | `<AI_BASE_URL>/audio/transcriptions`, `<AI_BASE_URL>/audio/speech` |

The provider is inert until configured; it has **not** been exercised against the live services from this repository.

## Reporting

See [SECURITY.md](../SECURITY.md) in the repository root.
