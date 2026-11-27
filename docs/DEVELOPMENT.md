# Development

```powershell
pnpm install
```

```powershell
pnpm dev
```

| Command | What |
|---|---|
| `pnpm dev` | `tsx watch` the server from source |
| `pnpm build` | `tsc -p tsconfig.build.json` → `dist/` |
| `pnpm start`, `start:http` | Run the built server (stdio, HTTP); `RESOLVE_ADAPTER=mock` for the mock adapter |
| `pnpm typecheck` | `tsc --noEmit` over `src/`, `tests/`, `scripts/` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest unit + integration + security suites (mock DaVinci Resolve) |
| `pnpm test:live` | Live DaVinci Resolve end to end ([TESTING.md](TESTING.md)) |
| `pnpm docs:tools` | Regenerate `docs/TOOLS.md` from the tool registry (`scripts/gen-tool-docs.ts`; CI fails if it is stale) |
| `node scripts/pack-release.mjs` | Release ZIP for the installers (`release/davinci-resolve-mcp-<version>.zip` + `.sha256`; run after `pnpm build`) |
| `node scripts/smoke-install.mjs` | Start an installed copy with the mock adapter, list tools, run one call |

Helper scripts (PowerShell, `scripts/`): `install.ps1`, `build.ps1`, `launch.ps1`, `check-deps.ps1`, `diagnostics.ps1`,
`test-bridge.ps1`, `integration-test.ps1`, `new-token.ps1`; macOS equivalents `install.sh`, `diagnostics.sh`, `test-bridge.sh`.

Single package: TypeScript in `src/` compiled with `tsc` (NodeNext, `.js` import suffixes) to `dist/`. Python in
`resolve-scripts/` runs as-is in the bridge worker and is not compiled. Use **pnpm** only.

## Layout

| Path | Contents |
|---|---|
| `src/mcp/tools/` | Tool modules (one per category), `registry.ts` and shared arguments (`args.ts`) |
| `src/resolve/bridge/` | `ResolveBridge`, adapters (Python, Lua, mock), op allowlist, serial queue, install detection |
| `src/design-engine/`, `src/schemas/` | Editing planner, presets and looks, workflow engine; shared Zod schemas |
| `src/jobs/` | Background jobs |
| `resolve-scripts/` | `resolve_worker.py` + `*_manager.py` op modules, `fusion_helpers.lua` |
| `installers/`, `site/` | One-line installers and the Astro docs site (renders `docs/*.md`) |

## Adding a tool

1. If DaVinci Resolve needs a new operation, implement it in the right `resolve-scripts/*_manager.py` module and register it with
   `@op("area.name")`. Return plain JSON-serialisable data, use `check()` on API return values and raise the errors from
   `resolve-scripts/errors.py` for expected failures. Add the op name to `BRIDGE_OPS` in `src/resolve/bridge/commands.ts`;
   `tests/unit/bridge.test.ts` fails if the allowlist and the Python registry differ. Add a handler to `MockResolve`
   (`src/resolve/bridge/mock-adapter.ts`) if tests need realistic state.
2. Define the tool in `src/mcp/tools/<category>.ts` with `reg.define({ name, category, description, input: { zod shape }, handler })`:
   `readOnly: true` for inspection, `destructive: true` for anything that deletes or discards work (adds `confirm`), `background: true`
   for calls that can run for minutes (adds `background`). Use `run()` for one op; write paths through `ctx.paths.write(...)`, read paths through `ctx.paths.read(...)`.
3. If a feature cannot be implemented, use `reg.unsupported(name, category, description, reason, alternative)` — never return a fake success.
4. Add a test in `tests/unit`, run `pnpm docs:tools`, and if it touches DaVinci Resolve, `pnpm test:live`.

## Debugging the bridge

- Every op is recorded (`mcp_bridge_status` shows the adapter, queue and recent ops with timing; `LOG_LEVEL=debug` logs `bridge ok` with `op` and `ms`, plus the worker's stderr).
- Run an op directly: `echo '{"id":"1","op":"app.status","params":{}}' | python -u resolve-scripts/resolve_worker.py`, or list the registered ops with `--list-ops`.
- Errors carry the API method and arguments in `error.details`.
- Method names come from Resolve's own `Support/Developer/Scripting/README.txt`; probe newer methods with `has()` / `require_method()` so older versions report `unsupported`.

## Conventions

- Strict TypeScript, Zod for every input, structured `McpToolError` codes.
- Logs go to stderr only (stdout is the stdio transport).
- Non-destructive first: new timelines, grade versions, render jobs; project backups before destructive changes.

Releases are cut from GitHub Actions (see [CONTRIBUTING.md](../CONTRIBUTING.md)).
