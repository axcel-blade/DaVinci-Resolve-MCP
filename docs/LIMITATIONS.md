# Limitations

Honest list of what this project cannot do, or does only approximately. Tools in these areas say so in their description (`Not scriptable: …`) and in their results.

## Verification

The bridge and the most-used ops passed a live run against DaVinci Resolve Studio 21.2 on Windows 11 ([TEST_REPORT.md](TEST_REPORT.md)).
Not every one of the 342 tools has been exercised live, the macOS and Linux paths (install detection, installers, `scripts/diagnostics.sh`)
have not been run on real machines, and Resolve 18.5–20 and the free edition are expected to work but are not tested: Resolve 20/21
methods are probed first and report `unsupported` when missing. **ChatGPT** connectivity is unverified; the HTTP transport was tested
locally only. Failures surface as `OPERATION_FAILED` with the API method that refused; they are never reported as success.

## Not available to scripting (tools return `UNSUPPORTED`)

| Feature | Alternative offered |
|---|---|
| Creating or deleting color nodes (`color_create_node`, `color_delete_node`) | LUTs, CDL, `color_apply_look`, or stills / PowerGrades |
| Power windows and tracking (`color_create_power_window`, `color_track_window`) | `color_magic_mask` (Studio), or the Color page |
| Editing subtitle items (`subtitle_add`, `subtitle_edit`, `subtitle_delete`, `subtitle_set_timing`, `subtitle_set_style`) | Edit an SRT and re-import it (`subtitle_generate`, `subtitle_import`) |
| Audio fade handles and voice-over recording (`audio_set_fade`, `audio_voiceover_record`) | An audio cross-fade via `transition_add`; Fairlight's Voiceover tool or `ai_generate_voiceover` |
| Speaker detection (`ai_detect_speakers`) | Transcribe, then split by speaker manually |
| Proxy / optimized media generation (`media_generate_proxy`, `media_generate_optimized`) | Media pool → Generate Proxy Media; `media_link_proxy` links existing proxies |
| Pausing a render (`render_pause`) | `render_cancel`, then re-queue |

## Approximations

| Tool | What it actually does |
|---|---|
| `audio_set_eq`, `audio_set_compressor`, `audio_set_limiter`, `audio_set_reverb`, `audio_set_delay`, `audio_noise_reduction` | Insert the Fairlight plugin on the clip (Resolve 21+); its parameters are not scriptable, and the result warns |
| `speed_ramp_create`, `speed_retime_curve`, `speed_reverse` | Fusion TimeStretcher on the clip; the item's length on the timeline does not change |
| ResolveFX parameters | Not scriptable: use `engine: "fusion"` effects, whose inputs are scriptable |
| `color_match_shots` | Shot Match is not scriptable: copies the reference grade (`mode: "copy"`) or runs Auto Color on each target (`mode: "auto"`, Resolve 21+) |

## Studio-only

Transcription, auto subtitles (`CreateSubtitlesFromAudio`), auto-sync audio, Magic Mask, Smart Reframe and stabilisation need DaVinci Resolve Studio.

## AI features

Resolve's own AI tools are used where the API exposes them (IntelliSearch analysis, transcription, voice isolation). `ai_transcribe_audio`,
`ai_generate_subtitles` and `ai_generate_voiceover` use an **OpenAI-compatible provider** only when `AI_PROVIDER` and `AI_API_KEY` are set;
this has not been exercised against the live service. `ai_analyze_footage`, `ai_create_editing_plan` and the other planners are
rule-based over measured metadata (FFmpeg, clip properties), not vision models.

## Other

- Resolve must be running with **Preferences > System > General > External scripting using: Local**. `RESOLVE_AUTO_LAUNCH=true` starts it on first use.
- Calls are serialised through one Python worker; a call that exceeds `RESOLVE_TIMEOUT_MS` restarts the worker.
- A background job already running inside Resolve cannot be cancelled with `cancel_job`; stop renders with `render_cancel`.
- A modal dialog open in DaVinci Resolve blocks every call until it is closed (`TIMEOUT`).
- Results tagged `source: "mock"` come from the in-memory test adapter and say nothing about real Resolve behaviour.
- The server never drives Resolve's UI (no clicks or keystrokes): features without an API are reported, not simulated.
