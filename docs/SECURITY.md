# Security

## Threat model

The server can create, modify and render projects and drive a desktop application. Inputs come from an AI model, which
may be influenced by untrusted content (prompt injection). Controls therefore assume tool arguments are hostile.

## Controls

| Control | Implementation |
|---|---|
| No arbitrary code | No tool accepts Python, Lua or shell code to execute. Every tool maps to a registered operation in `resolve-scripts/` (the worker dispatches by op name only); arguments travel as JSON, so they cannot become code. |
| Input validation | Every tool has a strict Zod schema (`.strict()`: unknown keys rejected; types, ranges, enums, lengths). |
| File sandbox | `PathPolicy` (`src/utils/paths.ts`) requires absolute local paths, rejects NUL bytes and device namespaces, and only allows writes (renders, exports, backups, LUTs) under `ALLOWED_WRITE_PATHS`. Reads can be limited with `ALLOWED_READ_PATHS`. |
| Overwrite protection | Existing files are not overwritten unless the call passes `overwrite: true`. |
| Destructive confirmation | Destructive tools return `CONFIRMATION_REQUIRED` unless `confirm: true`, carry `destructiveHint`, and back up the project first when `BACKUP_BEFORE_DESTRUCTIVE=true`. |
| Network exposure | HTTP binds to `127.0.0.1` by default. Binding elsewhere is refused without `MCP_AUTH_TOKEN` or `MCP_SECRET_PATH`. Tokens are compared in constant time. |
| Concurrency | Calls to Resolve are serialised through one Python worker; background jobs run one at a time. |
| Timeouts | Per-call timeout (`RESOLVE_TIMEOUT_MS`, renders `RESOLVE_RENDER_TIMEOUT_MS`) kills and restarts the worker. |
| Truthful results | `ok: true` only when Resolve confirmed the operation. Every result states its `source`; mock results are labelled `mock`. Unscriptable features report `unsupported` with an alternative. |
| Audit log | Every tool call is recorded in `logs/operations-*.jsonl`. Tokens and API keys are never logged. |
| Safe shutdown | SIGINT/SIGTERM wait (≤10 s) for the in-flight Resolve call before exiting. |

## Recommendations

- Keep `ALLOWED_WRITE_PATHS` narrow; never include a drive root.
- For ChatGPT or other remote clients, use HTTP with `MCP_AUTH_TOKEN` and stop the tunnel when idle.
- Rotate tokens with `scripts\new-token.ps1` if a URL or token leaks.
- Never commit `.env` (it may hold `AI_API_KEY`).

## Reporting

Open a private security advisory on the repository rather than a public issue. See [SECURITY.md](../SECURITY.md).
