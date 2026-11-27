# Development

```powershell
corepack enable
pnpm install
pnpm dev            # tsx watch, stdio
pnpm build
pnpm lint
pnpm typecheck
pnpm test           # unit + integration, no Resolve needed
pnpm test:live      # against a running DaVinci Resolve (writes output/live-test/)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the layout.

## Adding an operation

1. Add a Python function in the matching `resolve-scripts/*_manager.py` and register it with `@op("area.name")`. Return plain JSON-serialisable data; raise the errors from `resolve-scripts/errors.py` for expected failures.
2. Define the tool in `src/mcp/tools/<area>.ts` with `reg.define({ name, category, description, input, handler })`:
   - `readOnly: true` for inspection, `destructive: true` for anything that deletes or discards work (adds `confirm`),
   - `background: true` for calls that can run for minutes (adds `background`),
   - write paths through `ctx.paths.write(...)`, read paths through `ctx.paths.read(...)`.
3. If Resolve's API cannot do it, use `reg.unsupported(...)` with the reason and a manual alternative — never fake success.
4. Add a mock handler in `src/resolve/bridge/mock-adapter.ts` if tests need realistic state.
5. Run `node scripts/gen-docs.mjs` after `pnpm build` to refresh `docs/TOOLS.md`, and add a `CHANGELOG.md` entry.

## Mock adapter

`RESOLVE_ADAPTER=mock` answers every call in memory and labels results `source: "mock"`. It is used by `tests/unit/jobs.test.ts` and `scripts/smoke-install.mjs`. It does not prove anything about real Resolve behaviour — run `pnpm test:live` for that.

## Release package

```powershell
pnpm build
node scripts/pack-release.mjs      # release/davinci-resolve-mcp-X.Y.Z.zip (+ .sha256)
```

Releases are cut from GitHub Actions (see [CONTRIBUTING.md](../CONTRIBUTING.md)).
