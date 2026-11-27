# Test Report

Generated 2026-11-26T19:23:16.399Z by `pnpm test:report`.

## Environment

- OS: Microsoft Windows 11 Pro
- DaVinci Resolve: 21.2.0.5
- Node: v26.3.1
- Python: Python 3.14.6
- FFmpeg: ffmpeg version 9.0.2-full_build-www.gyan.dev Copyright (c) 2000-2026 the FFmpeg developers

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| Unit + integration | 44 | 0 | 0 |
| Live DaVinci Resolve | 31 | 0 | 0 |

## Unit + integration

| Test | Result |
|---|---|
| MCP server › advertises tools with input and output schemas | passed |
| MCP server › lists resources and prompts | passed |
| MCP server › resolve_get_status works without crashing whether or not Resolve is present | passed |
| MCP server › a Resolve operation without Resolve returns a real error, never fake success | passed |
| MCP server › rejects invalid input with VALIDATION_ERROR | passed |
| MCP server › requires confirmation for destructive tools | passed |
| MCP server › blocks writes outside allowed folders | passed |
| MCP server › workflow dry run lists steps without touching Resolve | passed |
| MCP server › server-side planners and presets work offline | passed |
| Python bridge › reports unknown ops and recovers after a worker timeout | passed |
| Python bridge › reports a missing Python executable clearly | passed |
| stdio MCP client compatibility › initializes, lists tools and calls one over stdio | passed |
| config › has safe defaults | passed |
| config › reads env and argv | passed |
| config › refuses a public HTTP bind without auth | passed |
| PathPolicy › requires absolute paths and blocks device namespaces / NUL | passed |
| PathPolicy › allows writes only under allowed roots | passed |
| PathPolicy › never overwrites without overwrite: true | passed |
| PathPolicy › checks existence on read | passed |
| PathPolicy › restricts reads when ALLOWED_READ_PATHS is set | passed |
| python helpers › timecode.py matches the TypeScript implementation | passed |
| python helpers › lut_generator writes a valid identity .cube | passed |
| python helpers › monochrome look produces equal channels | passed |
| python helpers › worker registers every op the TypeScript side calls | passed |
| tool registry › registers every module with unique, well-formed names | passed |
| tool registry › every tool has a description and a strict object schema | passed |
| tool registry › destructive tools require confirm | passed |
| tool registry › validates input before touching Resolve | passed |
| tool registry › unsupported tools report honestly | passed |
| tool registry › toCallResult never reports ok for partial results | passed |
| tool registry › rejects duplicate tool names | passed |
| tool registry › maps node errors to tool error codes | passed |
| planner › scores good takes above junk | passed |
| planner › builds a plan that fills the target with integer frame ranges | passed |
| planner › reports when there is not enough material | passed |
| planner › computes keep ranges around silences | passed |
| planner › suggests looks from genre and stats | passed |
| timecode › round-trips non-drop timecode at common rates | passed |
| timecode › formats 01:00:00:00 at 24 fps as frame 86400 | passed |
| timecode › handles 29.97 drop-frame correctly | passed |
| timecode › handles 59.94 drop-frame | passed |
| timecode › rejects invalid input | passed |
| timecode › converts seconds without float drift | passed |
| timecode › toFrames accepts frames, seconds and timecode | passed |

## Live DaVinci Resolve

| Test | Result |
|---|---|
| E2E YouTube workflow (live) › builds and renders a verified MP4 | passed |
| DaVinci Resolve live › 1 detect Resolve | passed |
| DaVinci Resolve live › 2 connect to Resolve | passed |
| DaVinci Resolve live › 3 read version | passed |
| DaVinci Resolve live › 4 create a project | passed |
| DaVinci Resolve live › 5 save project | passed |
| DaVinci Resolve live › 6 import video | passed |
| DaVinci Resolve live › 7 import audio | passed |
| DaVinci Resolve live › 8 import image | passed |
| DaVinci Resolve live › 9 create timeline | passed |
| DaVinci Resolve live › 10 add video clips | passed |
| DaVinci Resolve live › 11 edit clip properties | passed |
| DaVinci Resolve live › 12 create a title (overlay, no ripple) | passed |
| DaVinci Resolve live › 13 apply an available transition | passed |
| DaVinci Resolve live › 14 color adjustment | passed |
| DaVinci Resolve live › 15 basic Fusion composition | passed |
| DaVinci Resolve live › 15b export EDL and back up project | passed |
| DaVinci Resolve live › 16 configure audio | passed |
| DaVinci Resolve live › 17 configure a render | passed |
| DaVinci Resolve live › 18+19 render a test video and verify the output | passed |
| Resolve 21 native features (live) › effect list + apply ResolveFX | passed |
| Resolve 21 native features (live) › native trim (no re-placement) | passed |
| Resolve 21 native features (live) › native move | passed |
| Resolve 21 native features (live) › native clip speed | passed |
| Resolve 21 native features (live) › transition between clips | passed |
| Resolve 21 native features (live) › audio volume / pan properties | passed |
| Resolve 21 native features (live) › audio loudness analysis (Resolve) | passed |
| Resolve 21 native features (live) › audio normalization (YouTube) | passed |
| Resolve 21 native features (live) › dialogue cleanup (voice isolation + leveler) | passed |
| Resolve 21 native features (live) › paste attributes | passed |
| Resolve 21 native features (live) › photo album import, crop, grade, export | passed |

## Unsupported in the tested Resolve version

- none recorded

## Known limitations

See [SUPPORTED_FEATURES.md](SUPPORTED_FEATURES.md) for every feature that the scripting API does not expose and the alternative each tool offers.
