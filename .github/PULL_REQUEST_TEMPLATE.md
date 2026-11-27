## Summary

<!-- What does this change and why? Link issues: Closes #... -->

## Type

- [ ] Bug fix
- [ ] New tool / operation
- [ ] Workflows / planner
- [ ] Docs
- [ ] Other:

## Checks

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm build`
- [ ] `pnpm test`
- [ ] `pnpm docs:tools` (if tools changed)
- [ ] `CHANGELOG.md` updated
- [ ] No `package-lock.json` / `yarn.lock`

## DaVinci Resolve verification

- [ ] Ran `scripts\integration-test.ps1` on DaVinci Resolve version: ____ — result: ____
- [ ] Not run (explain why). This PR is **unverified in DaVinci Resolve**.

## Security

- [ ] No new way to run arbitrary Python/Lua/shell commands
- [ ] New file paths go through `PathPolicy`
- [ ] Destructive actions require `confirm: true`
