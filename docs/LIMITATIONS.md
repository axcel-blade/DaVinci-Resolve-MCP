# Known limitations

## Unverified

- Operations are verified against **DaVinci Resolve Studio 21.2 on Windows 11** only (see [TEST_REPORT.md](TEST_REPORT.md)).
  Resolve 18.5–20 and the free edition are expected to work; Resolve 20/21 methods are probed first and report `unsupported` when missing.
- macOS and Linux paths are implemented (install detection, installers, `scripts/diagnostics.sh`) but not tested on real machines.
- **ChatGPT** connectivity is unverified; the HTTP transport was tested locally only.

## Not scriptable in Resolve (tools report `unsupported` with a manual alternative)

| Tools | Reason |
|---|---|
| `color_create_node`, `color_delete_node`, `color_create_power_window`, `color_track_window` | The scripting API cannot build node graphs, windows or trackers. Use LUTs, CDL, `color_apply_look`, or stills/PowerGrades. |
| `subtitle_add`, `subtitle_edit`, `subtitle_delete`, `subtitle_set_timing`, `subtitle_set_style` | Subtitle items cannot be edited by script. Generate/import an SRT instead (`subtitle_generate`, `subtitle_import`). |
| `audio_set_fade`, `audio_voiceover_record`, `ai_detect_speakers` | Fairlight fades, recording and speaker detection are not exposed. |
| `media_generate_proxy`, `media_generate_optimized`, `render_pause` | No API for proxy/optimized generation or pausing a render. |
| Fairlight mixer, EQ, dynamics, plugin parameters | Not exposed; `audio_*` tools report this as a warning. |

## Studio-only

Transcription, auto subtitles (`CreateSubtitlesFromAudio`), auto-sync audio, Smart Reframe and stabilisation need DaVinci Resolve Studio.

## By design / platform

- Resolve must be running with **Preferences > System > General > External scripting using: Local**. `RESOLVE_AUTO_LAUNCH=true` starts it on first use.
- Calls are serialised through one Python worker; a call that exceeds `RESOLVE_TIMEOUT_MS` restarts the worker.
- A background job already running inside Resolve cannot be cancelled with `cancel_job`; stop renders with `render_cancel`.
- Results tagged `source: "mock"` come from the in-memory test adapter and say nothing about real Resolve behaviour.
- The server never drives Resolve's UI (no clicks or keystrokes): features without an API are reported, not simulated.
