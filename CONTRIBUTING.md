# Contributing

Thanks for helping improve DaVinci Resolve MCP.

## Ground rules

- **pnpm only.** Never commit `package-lock.json` or `yarn.lock`.
- **Never fake success.** A tool may only report success when DaVinci Resolve (or the server, for pure computations) actually did the work. Label mock results and unverified behaviour.
- **No arbitrary execution.** New capabilities must be allowlisted operations with strict Zod schemas — never a tool that runs client-supplied Python, Lua or shell commands.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

```powershell
corepack enable
pnpm install
pnpm build
pnpm test
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the layout and how to add Python operations, tools and workflows.

## Before opening a pull request

```powershell
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm docs:tools             # if you changed tools
```

If you touched `resolve-scripts/` or the bridge, also run `scripts\integration-test.ps1` against a real DaVinci Resolve and paste the summary from `output/live-test/live-report.json` into the PR. If you could not run it, say so — the PR will be labelled *unverified in DaVinci Resolve*.

## Branches and commits

- Branch from `develop` (`feature/...`, `fix/...`, `docs/...`); PRs target `develop`. `main` holds releases.
- Keep commits focused; describe *why* in the message.
- Update `CHANGELOG.md` under an "Unreleased" heading for user-visible changes.

## Releasing (maintainers)

1. Merge `develop` into `main` with everything for the release listed under `## Unreleased` in `CHANGELOG.md`.
2. Run **Actions → Release → Run workflow** on `main` with the version (e.g. `1.1.0`). Tick *dry run* first to preview.
   It bumps `package.json`, dates the changelog, runs all checks, commits, tags `vX.Y.Z` and creates the GitHub Release.
3. **CD** then builds `davinci-resolve-mcp-X.Y.Z.zip` (+ `.sha256`), test-installs it, attaches it to the release and
   refreshes the docs site. The one-line installers pick it up as the latest release.
4. Merge `main` back into `develop`.

One-time setup: Settings → Pages → Source = **GitHub Actions**. If `main` is branch-protected, add a `RELEASE_TOKEN`
secret (fine-grained PAT with *contents* and *actions* write) so the workflow can push the version commit and tag.

## Reporting bugs and requesting features

Use the issue templates. For security problems, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
