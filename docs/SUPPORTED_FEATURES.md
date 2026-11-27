# API Support Matrix

What each feature area uses, and what is **tested** vs **implemented but not live-tested**.
Verified against **DaVinci Resolve Studio 21.2.0.5** on Windows 11 (see [TEST_REPORT.md](TEST_REPORT.md)).
Method names come from the installed `Support/Developer/Scripting/README.md` and `DaVinciResolveScript.pyi`; nothing else is called.
Every Resolve 20/21 method is probed before use, so older versions get `status: "unsupported"` instead of a crash.

Legend — **Level**: 1 = official Resolve scripting API, 2 = Fusion scripting, 3 = another documented integration (FFmpeg, files, OpenAI-compatible provider), 4 = controlled UI automation (not used anywhere), 5 = not supported.
**Tested**: ✅ live-tested on 21.2 · 🧪 unit/integration tested only · ⬜ implemented, not yet live-tested.

## Application & projects

| Feature | Level | Tested | Notes |
|---|---|---|---|
| Detect install / version / running / launch / quit | 1 + registry | ✅ | `resolve_launch` spawns Resolve.exe and waits for scripting |
| Capabilities probe | 1 | ✅ | `resolve_get_capabilities` lists which methods exist |
| Pages (get/set) | 1 | ✅ | `photo` page on 21+ |
| Create / open / save / close / rename / list projects | 1 | ✅ | |
| Delete project | 1 | ⬜ | Requires confirm; `.drp` backup first, aborts if backup fails |
| Save As / duplicate | 1 | ⬜ | No Save-As API: ExportProject → ImportProject under a new name |
| Backup / restore | 1 | ✅ backup | `.drp` export; restore via ImportProject / RestoreProject (`.dra`) |
| Project settings (resolution, fps, color science, audio) | 1 | ✅ | Each key read back after SetSetting |

## Media

| Feature | Level | Tested | Notes |
|---|---|---|---|
| Import files / folders / typed / image sequences | 1 | ✅ files | Stills import one-per-call so numbered images are not merged into a sequence (verified behaviour) |
| Bins, move, rename, metadata, flags, colors, markers | 1 | 🧪 | |
| Search (names, paths, metadata) | 1 | 🧪 | |
| Missing media / relink | 1 | ⬜ | |
| Duplicate detection | 3 | 🧪 | size+name or SHA-256 |
| Proxy **linking** | 1 | ⬜ | `LinkProxyMedia` |
| Proxy / optimized **generation** | 5 | — | Not scriptable; tool returns the manual steps |
| Clip rating | 1 (metadata) | ⬜ | Metadata write verified by readback; photo ratings use `SetRatings` |
| Auto-sync audio, transcription | 1 | ⬜ | Studio features |

## Timeline & editing

| Feature | Level | Tested | Notes |
|---|---|---|---|
| Create / delete / duplicate / rename / open / settings | 1 | ✅ create | |
| Tracks (add / delete / enable / lock / name) | 1 | ✅ add | |
| Append / place clips with source ranges and record frames | 1 | ✅ | `AppendToTimeline` clipInfo |
| **Trim** (head/tail), set in/out, set duration | 1 (21+) | ✅ | `SetLeftOffset`/`SetRightOffset`, same item id kept |
| **Move** / set position | 1 (21+) | ✅ | `Timeline.MoveItems`, fails rather than overwrite |
| **Clip speed**, freeze frame | 1 (21+) | ✅ speed | `SetSpeed` (length changes, ripple optional) |
| Reverse, speed ramps, time-remap curves | 2 | ⬜ | Fusion TimeStretcher; item length unchanged |
| Optical flow / retime process | 1 | ⬜ | item properties |
| Split | 1 (re-placement) | ⬜ | No split API: remove + re-append two ranges; needs confirm, adjustments not carried over |
| Delete clips, delete gaps (ripple) | 1 | ✅ gaps | |
| Paste attributes, copy/paste | 1 (21+) | ✅ | `CopyAttributes`; server-side clipboard for clip_copy/clip_paste |
| Transform / crop / opacity / composite / zoom / rotation | 1 | ✅ | `SetProperty` + readback |
| Compound / Fusion clips, nested sequence | 1 | ⬜ | |
| Export EDL / XML / FCPXML / AAF / OTIO / CSV | 1 | ✅ EDL | |
| Markers | 1 | 🧪 | |
| Stabilize / Smart Reframe | 1 | ⬜ | Studio |

## Effects, transitions, titles, subtitles

| Feature | Level | Tested | Notes |
|---|---|---|---|
| List installed effects | 1 (21+) | ✅ | `Resolve.GetEffectsList` (131 video / 29 audio on test machine) |
| Apply / remove / bypass ResolveFX, OFX, Fusion effects | 1 (21+) | ✅ | `AddEffect` / `DeleteEffects`. **ResolveFX parameters are not scriptable** |
| Fusion-node effects with scriptable parameters | 2 | ✅ (Blur node) | `engine: "fusion"` |
| **Transitions** add / list / remove / replace | 1 (21+) | ✅ | `AddTransition`; needs media handles at the edit |
| Transition parameters | 5 | — | Only type/duration/position/alignment |
| Titles (overlay Text+ in clip comp) | 2 | ✅ | Default `mode: "overlay"` — no ripple |
| Titles (Resolve insert) | 1 | ✅ behaviour | `InsertFusionTitleIntoTimeline` **ripple-inserts on V1** (verified), so `mode: "insert"` needs confirm |
| Lower thirds, intro, outro, credits, scroll, animations | 2 | ⬜ | Text+ keyframes |
| Subtitle tracks, SRT import, SRT export | 1 + file | ⬜ | Export built from subtitle items |
| Auto subtitles | 1 | ⬜ | `CreateSubtitlesFromAudio` (Studio); or provider transcription → SRT |
| Edit/retime/style individual captions | 5 | — | Edit as SRT and re-import, or Inspector |

## Fusion

| Feature | Level | Tested | Notes |
|---|---|---|---|
| Comp access, nodes, create/delete/connect, inputs | 2 | ✅ | Node types validated by `AddTool`, inputs by readback, connections by input id list |
| Text+, 3D text, backgrounds, merge, transform, masks, keyer, particles, camera, lights, 3D scene | 2 | ⬜ (Text+ ✅) | |
| Keyframes, expressions, animation presets | 2 | ✅ (title fade) | BezierSpline / XYPath modifiers |
| Declarative graph builder | 2 | ⬜ | `fusion_build_graph` |
| Macros/templates (.setting), .comp import/export | 2 | ⬜ | Multi-node macro save needs the Fusion page open |
| Fusion tool registry | 2 (Lua via fuscript) | ✅ | 620 tools listed |
| Comp render | 2 | ⬜ | Inside Resolve comps render with the timeline (Deliver) |

## Color

| Feature | Level | Tested | Notes |
|---|---|---|---|
| CDL (slope/offset/power/sat), read CDL | 1 | ✅ set | Lift/gamma/gain tools map onto CDL |
| LUT apply | 1 | ✅ | **Resolve 21 rejects LUT paths outside its LUT folders** (verified) → LUTs are staged into `…\Support\LUT\MCP` |
| Contrast / temperature / tint / exposure / 10 cinematic presets | 3 + 1 | ✅ preset | Generated 33³ `.cube` LUTs applied with SetLUT |
| Preserve previous grade | 1 | ✅ | New local version before each change (`color_version_load` to revert) |
| Copy grades, DRX, color groups, versions, Magic Mask, export LUT, stills | 1 | ⬜ | |
| Auto Color, node enable/label | 1 (21+) | ⬜ | |
| Add/delete nodes, wheels, curves, qualifiers, power windows, tracker, Shot Match | 5 | — | Not scriptable; tools return alternatives (DRX/PowerGrade, Fusion masks, CopyGrades, Auto Color) |
| Scopes | 3 | ⬜ | Exported still + FFmpeg signalstats |

## Fairlight / audio

| Feature | Level | Tested | Notes |
|---|---|---|---|
| Audio tracks, place/move/trim audio | 1 | ✅ | |
| Clip volume, pan, pitch | 1 (21+) | ✅ volume/pan | `AudioVolume`, `AudioPan`, `AudioPitch*` item properties |
| Voice Isolation, Dialogue Leveler | 1 (21+) | ✅ | item properties; track-level `SetVoiceIsolationState` |
| Loudness analysis | 1 (21+) / 3 | ✅ | `AnalyzeAudioLevels`; FFmpeg EBU R128 for files |
| Normalization / mastering to standards (YouTube, EBU R128, Netflix…) | 1 (21+) | ✅ | `NormalizeAudioLevel` |
| Insert Fairlight FX (EQ, dynamics, reverb, delay, de-esser…) | 1 (21+) | ⬜ | `AddEffect('audio', …)`; **plugin parameters not scriptable** |
| Fairlight presets | 1 | ⬜ | |
| Fades, bus routing, automation, voiceover recording | 5 | — | Use audio transitions for fades |
| Silence removal | 3 + 1 | ⬜ | FFmpeg silencedetect → cut list (review first) → re-placement |

## AI

| Feature | Level | Tested | Notes |
|---|---|---|---|
| Footage analysis, best-clip ranking, edit plans, rough cuts, highlights, social cuts, shot lists, transition/look suggestions | planner + 1 | ✅ rough cut (E2E) | Deterministic heuristics; plans are reviewable before anything is applied; rough cuts go on a NEW timeline |
| Scene detection | 1 / 3 | ⬜ | `DetectSceneCuts` (timeline) or FFmpeg (file) |
| IntelliSearch analysis | 1 (21+) | ⬜ | Analysis is scriptable; the search query is UI-only |
| Transcription | 1 / 3 | ⬜ | Resolve `TranscribeAudio`/`GetTranscription`, or provider (Whisper-compatible) |
| AI Speech Generator | 1 (21+) | ⬜ | `GenerateSpeech` (needs the Extra) or provider TTS |
| Speaker detection | 5 | — | |
| Magic Mask / Smart Reframe / Depth Map | 1 (mask, reframe) / 5 (depth) | ⬜ | |

## Photo page (Resolve 21+)

| Feature | Level | Tested | Notes |
|---|---|---|---|
| Albums: import, create, list, info | 1 | ✅ | |
| Crop / transform / any PhotoAlbumItem property | 1 | ✅ crop | `CropLockAspectRatio` must be off for asymmetric crops (handled) |
| CDL, LUT, looks, Auto Color, effects, ratings | 1 (+3 for looks) | ✅ look, rating | |
| Export | 1 | ✅ | `PhotoAlbumItem.ExportFrame` (jpg/png/tif, max dimension, quality) |
| RAW decode settings | 5 | — | |

## Rendering

| Feature | Level | Tested | Notes |
|---|---|---|---|
| Formats/codecs (validated against GetRenderCodecs) | 1 | ✅ | Presets never assume a codec name |
| Presets: YouTube 1080p/4K, TikTok, Reels, Stories, Feed, Facebook, Master, Archive, PNG/TIFF/EXR sequences, WAV, Custom | 1 | ✅ YouTube 1080p | |
| Queue, start, stop, status, remove, batch | 1 | ✅ | Progress via MCP progress notifications |
| Pause | 5 | — | Only start/stop exist |
| Output verification | 3 | ✅ | exists + size + ffprobe resolution/duration; never reports success without a file |
| Free-space check | 3 | 🧪 | refuses with < 512 MB free |

## Not used anywhere

Controlled UI automation (level 4) is **not used**: every tool either calls a documented API, a documented external tool, or reports `unsupported` with a manual alternative.
