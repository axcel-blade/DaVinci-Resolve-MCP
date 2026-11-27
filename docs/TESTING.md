# Testing

| Suite | Command | Needs Resolve | What it covers |
|---|---|---|---|
| Unit | `pnpm test:unit` | no | timecode/frame math (incl. drop-frame), path policy, config, registry (names, strict schemas, confirmation gate, honest `unsupported`), planner, Python LUT/timecode helpers, every bridge op referenced by TypeScript exists in Python |
| Integration | `pnpm test:integration` | no | MCP server over in-memory transport (tools/resources/prompts, validation errors, confirmation, path refusal, workflow dry run), stdio client compatibility (spawns the real server like Claude Desktop), Python bridge timeout recovery and missing-Python errors |
| Live | `pnpm test:live` | **yes** | Real Resolve: detect, connect, version, project, save, import video/audio/image, timeline, clips, transforms, non-rippling title, transition, CDL + look, Fusion node, EDL export, backup, audio track/clip, render job, render + verify MP4 |
| Live (Resolve 21) | included in `test:live` | yes (21+) | ResolveFX apply/remove, native trim/move/speed, transition, audio volume/pan, loudness analysis, YouTube normalization, voice isolation + leveler, paste attributes, photo album import/crop/grade/rating/export |
| End-to-end | included in `test:live` | yes | `workflow_create_youtube_video`: new project → import → rough cut → title → look → music → render → verified MP4 (1920×1080, > 8 s) |
| Report | `pnpm test:report` | optional | Runs everything and writes [TEST_REPORT.md](TEST_REPORT.md) |

`pnpm test` runs unit + integration.

## Live test rules

- Live tests create dedicated projects named `MCP_LIVE_TEST_<ts>`, `MCP_V21_TEST_<ts>`, `MCP_E2E_<ts>` and never open your own projects.
- Test media is generated with FFmpeg into `output\live-test\` (FFmpeg required; without it live tests are skipped, not passed).
- Features the installed Resolve does not support are recorded as **unsupported** (reported as skipped) — never as passed.
- Each run writes `output\live-test\live-report.json` and `output\live-test\v21\v21-report.json`.
- Test projects are kept so you can inspect them. Set `RESOLVE_LIVE_CLEANUP=1` to delete the `MCP_LIVE_TEST_*` project after the run, or delete them in the Project Manager.

## Manual client testing

MCP Inspector over stdio:

```powershell
npx @modelcontextprotocol/inspector node dist\index.js
```
