# MCP Tools

Generated from the tool registry by `pnpm docs:tools`. **341 tools** in 17 categories.

Every tool returns `{ ok, tool, status, message, data, warnings, error? }`. `ok` is true only when DaVinci Resolve confirmed the operation. `status` is one of ok, partial, unsupported, error, confirmation_required.

Timeline items are addressed by `itemId` (from `timeline_get_clips`) or `trackType` + `trackIndex` + `itemIndex` (1-based, clips only). Tools marked **destructive** need `confirm: true` after the user agreed.

## Contents

- [application](#application) (11)
- [meta](#meta) (6)
- [projects](#projects) (16)
- [media](#media) (38)
- [timeline](#timeline) (26)
- [editing](#editing) (37)
- [effects](#effects) (14)
- [speed](#speed) (8)
- [titles](#titles) (18)
- [subtitles](#subtitles) (10)
- [fusion](#fusion) (29)
- [color](#color) (37)
- [audio](#audio) (33)
- [ai](#ai) (18)
- [photo](#photo) (18)
- [rendering](#rendering) (17)
- [workflows](#workflows) (5)

## application

### `resolve_get_status` — read-only

Check whether DaVinci Resolve is installed and running, whether scripting is connected, and the open project/timeline/page. Call this first.

*Implementation:* Resolve scripting API

_No parameters._

### `resolve_check_scripting_connection` — read-only

Verify the scripting API connection end-to-end (Python bridge, fusionscript, Resolve) and report exactly which layer fails.

*Implementation:* Resolve scripting API

_No parameters._

### `resolve_launch`

Launch DaVinci Resolve if it is not running and wait (up to waitSeconds) for the scripting API to accept connections.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `wait` | boolean | no | `true` |  |
| `waitSeconds` | number | no | `180` |  |

### `resolve_close` — destructive

Quit DaVinci Resolve. Unsaved changes may be lost unless saveProject is true. DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `saveProject` | boolean | no | `true` |  |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `resolve_get_version` — read-only

Read the installed DaVinci Resolve product name and version.

*Implementation:* Resolve scripting API

_No parameters._

### `resolve_get_capabilities` — read-only

Probe which documented scripting methods this Resolve build exposes (per object), plus optional tools (ffmpeg, AI provider). Use to decide which tools will work.

*Implementation:* Resolve scripting API

_No parameters._

### `resolve_get_application_info` — read-only

Application info: product, version, current page, keyframe mode, database, Fusion availability.

*Implementation:* Resolve scripting API

_No parameters._

### `resolve_get_current_project` — read-only

Name/id of the open project and its current timeline (null when none).

*Implementation:* Resolve scripting API

_No parameters._

### `resolve_get_current_page` — read-only

The Resolve page currently shown (media, cut, edit, fusion, color, fairlight, deliver).

*Implementation:* Resolve scripting API

_No parameters._

### `resolve_set_current_page`

Switch Resolve to a page. 'photo' only exists in versions that have the Photo page.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | enum (media \| cut \| edit \| fusion \| color \| fairlight \| deliver \| photo) | yes |  |  |

### `resolve_get_system_info` — read-only

Host system info (OS, CPU, memory) and the scripting paths in use.

*Implementation:* Resolve scripting API

_No parameters._

## meta

### `get_job` — read-only

Status of a background job (queued | running | succeeded | failed | cancelled). When it has succeeded, also returns the tool's full result.

*Implementation:* Server-side planner / workflow

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `jobId` | string | yes |  | Id returned by a tool called with background: true |

### `wait_for_job` — read-only

Wait up to timeoutSeconds for a background job to finish, then return it as get_job does. If it is still running, call again; the job keeps going either way.

*Implementation:* Server-side planner / workflow

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `jobId` | string | yes |  | Id returned by a tool called with background: true |
| `timeoutSeconds` | number | no | `30` |  |

### `list_jobs` — read-only

List recent background jobs, newest first (results omitted; use get_job).

*Implementation:* Server-side planner / workflow

_No parameters._

### `cancel_job`

Cancel a queued background job. A job already running inside DaVinci Resolve cannot be interrupted; the result says so (use render_cancel for renders).

*Implementation:* Server-side planner / workflow

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `jobId` | string | yes |  | Id returned by a tool called with background: true |

### `mcp_list_tools` — read-only

List this server's tools by category with support level (api, fusion, integration, external, planner, unsupported). Use to discover the right tool.

*Implementation:* Resolve scripting API

_No parameters._

### `mcp_recent_operations` — read-only

The operation log: recent tool calls with outcome and duration (args redacted).

*Implementation:* Resolve scripting API

_No parameters._

## projects

### `project_create`

Create a new project in the current project-manager folder (and open it). Optionally set resolution, frame rate and color science, e.g. 4K 24 fps.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | yes |  |  |
| `width` | number | no |  |  |
| `height` | number | no |  |  |
| `frameRate` | enum (23.976 \| 24 \| 25 \| 29.97 \| 30 \| 47.952 \| 48 \| 50 \| 59.94 \| 60 \| 119.88 \| 120) | no |  | Timeline frame rate. Must be set before media is added to a timeline. |
| `playbackFrameRate` | enum (23.976 \| 24 \| 25 \| 29.97 \| 30 \| 47.952 \| 48 \| 50 \| 59.94 \| 60 \| 119.88 \| 120) | no |  |  |
| `colorScienceMode` | string | no |  | e.g. davinciYRGB, davinciYRGBColorManagedv2, acescct |
| `colorSpaceTimeline` | string | no |  |  |
| `colorSpaceOutput` | string | no |  |  |
| `raw` | record | no |  | Any other documented project setting key/value (see project_get_settings). |

### `project_open`

Open (load) an existing project by name from the current project-manager folder.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | yes |  |  |

### `project_save`

Save the current project.

*Implementation:* Resolve scripting API

_No parameters._

### `project_save_as`

Save the current project under a new name. Resolve has no direct Save-As API; this exports the project to a .drp and imports it under the new name, then optionally opens it.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `newName` | string | yes |  |  |
| `open` | boolean | no | `true` |  |

### `project_close`

Close the current project (saving first unless save=false).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `save` | boolean | no | `true` |  |

### `project_delete` — destructive

Delete a project from the database. A .drp backup is exported first (BACKUP_BEFORE_DESTRUCTIVE). The project must not be open. DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | yes |  |  |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `project_duplicate`

Duplicate a project (export to .drp then import under a new name). Does not open the copy.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `source` | string | no |  | Project to copy (default: current) |
| `newName` | string | yes |  |  |

### `project_rename`

Rename the current project.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `newName` | string | yes |  |  |

### `project_get_info` — read-only

Current project info: name, timelines, key settings, render job count.

*Implementation:* Resolve scripting API

_No parameters._

### `project_list` — read-only

List projects and folders in the current project-manager folder.

*Implementation:* Resolve scripting API

_No parameters._

### `project_get_settings` — read-only

Read project settings. Without keys returns all settings Resolve reports.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `keys` | array | no |  |  |

### `project_set_settings`

Set project settings (resolution, frame rate, color management, audio...). Each key is verified by reading it back. Frame rate cannot change once timelines contain media.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `width` | number | no |  |  |
| `height` | number | no |  |  |
| `frameRate` | enum (23.976 \| 24 \| 25 \| 29.97 \| 30 \| 47.952 \| 48 \| 50 \| 59.94 \| 60 \| 119.88 \| 120) | no |  | Timeline frame rate. Must be set before media is added to a timeline. |
| `playbackFrameRate` | enum (23.976 \| 24 \| 25 \| 29.97 \| 30 \| 47.952 \| 48 \| 50 \| 59.94 \| 60 \| 119.88 \| 120) | no |  |  |
| `colorScienceMode` | string | no |  | e.g. davinciYRGB, davinciYRGBColorManagedv2, acescct |
| `colorSpaceTimeline` | string | no |  |  |
| `colorSpaceOutput` | string | no |  |  |
| `raw` | record | no |  | Any other documented project setting key/value (see project_get_settings). |

### `project_get_timelines` — read-only

List the project's timelines with ids and frame ranges.

*Implementation:* Resolve scripting API

_No parameters._

### `project_backup`

Export a project (default: current) to a timestamped .drp in BACKUP_DIR (or a given folder under the allowed roots).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | no |  |  |
| `folder` | string | no |  | Absolute local file path |

### `project_list_backups` — read-only

List .drp backups in BACKUP_DIR (newest first).

*Implementation:* Resolve scripting API

_No parameters._

### `project_restore`

Restore a project from a .drp (import) or .dra (archive restore) under a new name. Never overwrites an existing project.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `path` | string | yes |  | Absolute local file path |
| `name` | string | yes |  | Name for the restored project (must not already exist) |

## media

### `media_import`

Import any supported media files (video, audio, stills, subtitles) into the media pool, optionally into a bin.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `paths` | array | yes |  |  |
| `bin` | string | no |  | Target bin path like 'Footage/Day1' (created if missing). Default: current bin. |

### `media_import_folder`

Import all supported media from a folder (recursive by default). organizeByType puts files into Video/Audio/Images bins.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `path` | string | yes |  | Absolute local file path |
| `recursive` | boolean | no | `true` |  |
| `types` | array | no |  |  |
| `organizeByType` | boolean | no | `false` |  |
| `bin` | string | no |  | Target bin path like 'Footage/Day1' (created if missing). Default: current bin. |

### `media_import_video`

Import video files (.mp4, .mov, .avi, .mxf, .mkv, .m4v, .mts, .m2ts, .braw, .r3d, .webm) into the media pool. Source files are never modified.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `paths` | array | yes |  |  |
| `bin` | string | no |  | Target bin path like 'Footage/Day1' (created if missing). Default: current bin. |

### `media_import_audio`

Import audio files (.wav, .mp3, .aif, .aiff, .flac, .m4a, .aac, .ogg) into the media pool. Source files are never modified.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `paths` | array | yes |  |  |
| `bin` | string | no |  | Target bin path like 'Footage/Day1' (created if missing). Default: current bin. |

### `media_import_image`

Import image files (.png, .jpg, .jpeg, .tif, .tiff, .exr, .dpx, .bmp, .tga, .psd, .heic, .webp, .cr2, .cr3, .nef, .arw, .dng) into the media pool. Source files are never modified.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `paths` | array | yes |  |  |
| `bin` | string | no |  | Target bin path like 'Footage/Day1' (created if missing). Default: current bin. |

### `media_import_sequence`

Import an image sequence as one clip. pattern uses printf-style frame numbering, e.g. C:\renders\shot_%04d.exr.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `pattern` | string | yes |  | Absolute local file path |
| `start` | number | yes |  |  |
| `end` | number | yes |  |  |
| `bin` | string | no |  | Target bin path like 'Footage/Day1' (created if missing). Default: current bin. |

### `media_list` — read-only

List clips in the media pool (all bins or one bin), optionally filtered by Resolve clip type (Video, Audio, Still, Timeline...).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `bin` | string | no |  |  |
| `type` | string | no |  |  |
| `limit` | number | no | `500` |  |

### `media_list_bins` — read-only

List all bins (folders) in the media pool with clip counts.

*Implementation:* Resolve scripting API

_No parameters._

### `media_search` — read-only

Search media pool clips by name, file path and metadata (keywords, comments, scene, shot...). Case-insensitive substring match.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string | yes |  |  |
| `fields` | array | no |  |  |

### `media_get_info` — read-only

All Resolve clip properties for a clip, whether the source file exists, mark in/out and markers.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |

### `media_get_metadata` — read-only

Clip metadata fields (and third-party metadata).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |

### `media_set_metadata`

Set clip metadata fields (e.g. Keywords, Comments, Description, Scene, Shot, Take). Each field is verified by readback.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |
| `metadata` | record | yes |  |  |

### `media_rename`

Rename a clip in the media pool (Clip Name property; the file on disk is untouched).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |
| `name` | string | yes |  |  |

### `media_move_to_bin`

Move clips to a bin (created if missing).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clips` | array | yes |  |  |
| `bin` | string | yes |  |  |
| `create` | boolean | no | `true` |  |

### `media_create_bin`

Create a bin (sub-folder) in the media pool, under parent (default: root).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | yes |  |  |
| `parent` | string | no |  |  |

### `media_delete` — destructive

Remove clips from the media pool. Files on disk are NOT deleted. Timeline uses of the clips go offline. DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clips` | array | yes |  |  |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `media_find_missing` — read-only

Find offline clips whose source files no longer exist.

*Implementation:* Resolve scripting API

_No parameters._

### `media_relink`

Relink clips to files in a folder (Resolve searches it for matching names). Without clips, relinks every offline clip.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `folder` | string | yes |  | Absolute local file path |
| `clips` | array | no |  |  |

### `media_get_duration` — read-only

Read a clip's duration from Resolve's clip properties.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |

### `media_get_resolution` — read-only

Read a clip's resolution from Resolve's clip properties.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |

### `media_get_frame_rate` — read-only

Read a clip's frame rate from Resolve's clip properties.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |

### `media_get_audio_channels` — read-only

Read a clip's audio channel count from Resolve's clip properties.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |

### `media_probe_file` — read-only

Technical analysis of a source file with ffprobe (codec, resolution, fps, audio layout, bitrate). Requires FFmpeg.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `path` | string | yes |  | Absolute local file path |

### `media_generate_proxy` — read-only

Generate proxy media for clips. (Not scriptable: the scripting API has no proxy-generation method.)

*Implementation:* Not scriptable (returns `unsupported` with an alternative)

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clips` | array | no |  |  |

### `media_generate_optimized` — read-only

Generate optimized media for clips. (Not scriptable: the scripting API has no optimized-media method.)

*Implementation:* Not scriptable (returns `unsupported` with an alternative)

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clips` | array | no |  |  |

### `media_link_proxy`

Attach an existing proxy file to a clip (MediaPoolItem.LinkProxyMedia). Use unlink: true to detach.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |
| `proxyPath` | string | no |  | Absolute local file path |
| `unlink` | boolean | no | `false` |  |

### `media_replace` — destructive

Replace a clip's source file with another file (MediaPoolItem.ReplaceClip). Every timeline use switches to the new file. DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |
| `path` | string | yes |  | Absolute local file path |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `media_set_clip_color`

Set (or clear with null) a clip's color label.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |
| `color` | nullable | yes |  |  |

### `media_set_clip_flag`

Add a flag to a clip, or clear flags (clear: true; color omitted clears all).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |
| `color` | enum (Blue \| Cyan \| Green \| Yellow \| Red \| Pink \| Purple \| Fuchsia \| Rose \| Lavender \| Sky \| Mint \| Lemon \| Sand \| Cocoa \| Cream) | no |  |  |
| `clear` | boolean | no | `false` |  |

### `media_set_clip_rating`

Rate a clip 0-5 stars by writing a 'Rating'-style metadata field (verified by readback). Also sets 'Good Take' for ratings >= 4.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |
| `rating` | number | yes |  |  |
| `field` | string | no | `"Rating"` |  |

### `media_add_marker`

Add a marker to a media pool clip at a source frame.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |
| `frame` | number | yes |  |  |
| `color` | enum (Blue \| Cyan \| Green \| Yellow \| Red \| Pink \| Purple \| Fuchsia \| Rose \| Lavender \| Sky \| Mint \| Lemon \| Sand \| Cocoa \| Cream) | no | `"Blue"` |  |
| `name` | string | no | `""` |  |
| `note` | string | no | `""` |  |
| `duration` | number | no | `1` |  |

### `media_set_mark_in_out`

Set a clip's mark in/out (source frames).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |
| `markIn` | number | yes |  |  |
| `markOut` | number | yes |  |  |
| `type` | enum (all \| video \| audio) | no | `"all"` |  |

### `media_get_selected` — read-only

Clips currently selected in the media pool.

*Implementation:* Resolve scripting API

_No parameters._

### `media_find_duplicates` — read-only

Find duplicate source files among media pool clips. 'quick' compares size+name, 'hash' compares SHA-256 (reads every file).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `method` | enum (quick \| hash) | no | `"quick"` |  |

### `media_organize_by_type`

Move every clip in the root bin into Video / Audio / Stills / Timelines bins based on Resolve's clip Type.

*Implementation:* Resolve scripting API

_No parameters._

### `media_auto_sync_audio`

Auto-sync separately recorded audio to video clips by waveform or timecode (MediaPool.AutoSyncAudio).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clips` | array | yes |  |  |
| `mode` | enum (waveform \| timecode) | no | `"waveform"` |  |
| `retainEmbeddedAudio` | boolean | no |  |  |

### `media_transcribe`

Transcribe a clip's audio with Resolve's built-in transcription (Studio; result is stored in Resolve).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |

### `media_storage_volumes` — read-only

Mounted volumes visible to Resolve's Media Storage.

*Implementation:* Resolve scripting API

_No parameters._

## timeline

### `timeline_create`

Create a timeline (empty, or from media pool clips in order) and make it current. Width/height/frameRate apply custom timeline settings (e.g. 1080x1920 vertical).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | yes |  |  |
| `clips` | array | no |  |  |
| `width` | number | no |  |  |
| `height` | number | no |  |  |
| `frameRate` | enum (23.976 \| 24 \| 25 \| 29.97 \| 30 \| 48 \| 50 \| 59.94 \| 60) | no |  |  |
| `raw` | record | no |  | Other timeline setting keys (see timeline_get_settings). |

### `timeline_delete` — destructive

Delete a timeline from the project. DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | yes |  |  |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `timeline_duplicate`

Duplicate a timeline (default: current).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | no |  | Timeline name or id (default: current timeline) |
| `newName` | string | no |  |  |

### `timeline_rename`

Rename a timeline (default: current).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | no |  | Timeline name or id (default: current timeline) |
| `newName` | string | yes |  |  |

### `timeline_open`

Make a timeline the current timeline.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | yes |  |  |

### `timeline_list` — read-only

List timelines in the project.

*Implementation:* Resolve scripting API

_No parameters._

### `timeline_get_info` — read-only

Timeline summary: frame range, duration (frames/seconds/timecode), fps, track counts, markers, playhead.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | no |  | Timeline name or id (default: current timeline) |

### `timeline_get_settings` — read-only

Read timeline settings (resolution, frame rate, custom settings flag...).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | no |  | Timeline name or id (default: current timeline) |
| `keys` | array | no |  |  |

### `timeline_set_settings`

Set timeline settings (enables custom timeline settings). Each key verified by readback.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | no |  | Timeline name or id (default: current timeline) |
| `width` | number | no |  |  |
| `height` | number | no |  |  |
| `frameRate` | enum (23.976 \| 24 \| 25 \| 29.97 \| 30 \| 48 \| 50 \| 59.94 \| 60) | no |  |  |
| `raw` | record | no |  | Other timeline setting keys (see timeline_get_settings). |

### `timeline_add_track`

Add a video, audio or subtitle track. Audio tracks take a channel format (mono, stereo, 5.1, 7.1, adaptive1..24).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `trackType` | enum (video \| audio \| subtitle) | yes |  |  |
| `audioType` | string | no | `"stereo"` |  |
| `name` | string | no |  |  |

### `timeline_delete_track` — destructive

Delete a track and everything on it. DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `trackType` | enum (video \| audio \| subtitle) | yes |  |  |
| `trackIndex` | number | yes |  |  |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `timeline_get_tracks` — read-only

List all tracks with name, sub-type, enabled/locked state and item counts.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |

### `timeline_set_track`

Enable/disable, lock/unlock or rename a track.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `trackType` | enum (video \| audio \| subtitle) | yes |  |  |
| `trackIndex` | number | yes |  |  |
| `enabled` | boolean | no |  |  |
| `locked` | boolean | no |  |  |
| `name` | string | no |  |  |

### `timeline_get_clips` — read-only

List timeline items with ids, type (video/audio/generator/transition), record start/end (frames), duration, source offsets and media pool clip id. itemIndex counts clips only. Use the ids to target edits.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `trackType` | enum (video \| audio \| subtitle) | no |  |  |
| `trackIndex` | number | no |  |  |
| `includeTransitions` | boolean | no | `true` |  |

### `timeline_get_duration` — read-only

Timeline duration in frames, seconds and timecode.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | no |  | Timeline name or id (default: current timeline) |

### `timeline_set_start_timecode`

Set the timeline start timecode, e.g. 01:00:00:00.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `timecode` | string | yes |  |  |

### `timeline_set_playhead`

Move the playhead to a timecode or absolute timeline frame (titles and generators insert at the playhead).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `timecode` | string | no |  |  |
| `frame` | number | no |  |  |

### `timeline_create_compound_clip`

Combine timeline items into a compound clip.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `items` | array | yes |  |  |
| `name` | string | no |  |  |
| `startTimecode` | string | no |  |  |

### `timeline_create_nested_sequence`

Nest timeline items as a sequence. In Resolve this is a compound clip (the API's nesting primitive).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `items` | array | yes |  |  |
| `name` | string | no |  |  |

### `timeline_create_fusion_clip`

Combine timeline items into a Fusion clip for compositing.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `items` | array | yes |  |  |

### `timeline_export_edl`

Export the timeline as an EDL (CMX 3600). The output path must be under an allowed write folder; existing files need overwrite: true.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `path` | string | yes |  | Absolute local file path |
| `format` | enum (edl \| edl_cdl \| edl_missing) | no | `"edl"` |  |
| `overwrite` | boolean | no | `false` |  |

### `timeline_export_xml`

Export the timeline as FCPXML / FCP 7 XML / DRT / OTIO / CSV / ALE. The output path must be under an allowed write folder; existing files need overwrite: true.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `path` | string | yes |  | Absolute local file path |
| `format` | enum (fcpxml \| fcp7xml \| drt \| otio \| csv \| ale) | no | `"fcpxml"` |  |
| `overwrite` | boolean | no | `false` |  |

### `timeline_export_aaf`

Export the timeline as an AAF. The output path must be under an allowed write folder; existing files need overwrite: true.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `path` | string | yes |  | Absolute local file path |
| `format` | enum (aaf_new \| aaf_existing) | no | `"aaf_new"` |  |
| `overwrite` | boolean | no | `false` |  |

### `timeline_import`

Import a timeline from AAF/EDL/XML/FCPXML/DRP/OTIO into the media pool.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `path` | string | yes |  | Absolute local file path |
| `name` | string | no |  |  |
| `importSourceClips` | boolean | no |  |  |

### `timeline_add_marker`

Add a marker on the timeline at a frame offset from the timeline start.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `frame` | number | yes |  |  |
| `color` | enum (Blue \| Cyan \| Green \| Yellow \| Red \| Pink \| Purple \| Fuchsia \| Rose \| Lavender \| Sky \| Mint \| Lemon \| Sand \| Cocoa \| Cream) | no | `"Blue"` |  |
| `name` | string | no | `""` |  |
| `note` | string | no | `""` |  |
| `duration` | number | no | `1` |  |

### `timeline_get_markers` — read-only

All timeline markers.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |

## editing

### `clip_append`

Append media pool clips to the end of the current timeline (in order), optionally with source ranges and target tracks.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `clips` | array | yes |  |  |

### `clip_add`

Place one media pool clip on the timeline at a given record frame and track (AppendToTimeline with recordFrame).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |
| `sourceStart` | number | no |  | First source frame (inclusive) |
| `sourceEnd` | number | no |  | Source frame after the last one (exclusive) |
| `trackIndex` | number | no |  |  |
| `recordFrame` | number | no |  | Absolute timeline frame where the clip starts |
| `mediaType` | enum (video \| audio) | no |  | Only video or only audio of the clip |

### `clip_insert`

Place a clip at a record frame on a track that is empty there. The API has no ripple insert: to make room, move later clips first (clip_move) or use an empty track.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |
| `sourceStart` | number | no |  | First source frame (inclusive) |
| `sourceEnd` | number | no |  | Source frame after the last one (exclusive) |
| `trackIndex` | number | no |  |  |
| `recordFrame` | number | yes |  |  |
| `mediaType` | enum (video \| audio) | no |  | Only video or only audio of the clip |

### `clip_overwrite` — destructive

Overwrite the timeline range [recordFrame, recordFrame+length) on a track with a clip: overlapping items on that track are removed first, then the clip is placed. DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |
| `sourceStart` | number | no |  | First source frame (inclusive) |
| `sourceEnd` | number | no |  | Source frame after the last one (exclusive) |
| `trackIndex` | number | no | `1` |  |
| `recordFrame` | number | yes |  |  |
| `mediaType` | enum (video \| audio) | no |  | Only video or only audio of the clip |
| `length` | number | yes |  |  |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `clip_replace` — destructive

Replace a timeline item with a different media pool clip at the same position and length. DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |
| `sourceStart` | number | no | `0` |  |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `clip_split` — destructive

Split a timeline item at an absolute timeline frame into two items. Implemented as a re-placement (remove item, append source range again) because the API has no direct trim/move/split: grades, effects and transforms on the original item are not carried over. DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `frame` | number | yes |  |  |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `clip_trim`

Trim frames from the head (trimStart) and/or tail (trimEnd) of a timeline item with native SetLeftOffset/SetRightOffset (Resolve 21+; linked audio follows). Negative values extend into handles. Does not ripple.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `trimStart` | number | no | `0` |  |
| `trimEnd` | number | no | `0` |  |
| `updateLinked` | boolean | no | `true` |  |
| `confirm` | boolean | no |  | Only needed on Resolve < 21, where this falls back to a destructive re-placement |

### `clip_move`

Move a timeline item to a new record frame and/or track with Timeline.MoveItems (Resolve 21+; linked items follow; fails instead of overwriting when the destination is occupied).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `recordFrame` | number | no |  |  |
| `toTrack` | number | no |  |  |
| `moveLinked` | boolean | no | `true` |  |
| `confirm` | boolean | no |  | Only needed on Resolve < 21, where this falls back to a destructive re-placement |

### `clip_set_position`

Set a timeline item's start frame (Timeline.MoveItems).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `recordFrame` | number | yes |  |  |
| `confirm` | boolean | no |  | Only needed on Resolve < 21, where this falls back to a destructive re-placement |

### `clip_set_in_out`

Change which source range a timeline item plays (source in inclusive, out exclusive) by setting its left/right offsets natively (Resolve 21+).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `sourceIn` | number | yes |  |  |
| `sourceOut` | number | yes |  |  |
| `confirm` | boolean | no |  | Only needed on Resolve < 21, where this falls back to a destructive re-placement |

### `clip_set_duration`

Set a timeline item's duration by moving its tail edit point within the available source media (native SetRightOffset).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `durationFrames` | number | yes |  |  |
| `confirm` | boolean | no |  | Only needed on Resolve < 21, where this falls back to a destructive re-placement |

### `clip_delete` — destructive

Delete timeline items (ripple optional). Media pool clips are not affected. DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `items` | array | yes |  |  |
| `ripple` | boolean | no | `false` |  |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `clip_duplicate`

Duplicate a timeline item's source range to another position/track (default: right after the original).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `recordFrame` | number | no |  |  |
| `toTrack` | number | no |  |  |

### `clip_copy`

Copy a timeline item to this server's clipboard (remembers it for clip_paste). Resolve's own clipboard is not scriptable.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |

### `clip_paste`

Paste the clip_copy item: mode 'clip' places a duplicate at recordFrame/toTrack; mode 'attributes' pastes its attributes (transform, crop, composite, retime, effects, grade...) onto target items like Edit > Paste Attributes (Resolve 21+).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `mode` | enum (clip \| attributes) | no | `"clip"` |  |
| `recordFrame` | number | no |  |  |
| `toTrack` | number | no |  |  |
| `targets` | array | no |  |  |
| `attributes` | record | no |  | CopyAttributesOptions, e.g. { allVideoAttributes: true } or { colorCorrection: true } |

### `clip_paste_attributes`

Paste attributes from one timeline item onto others (TimelineItem.CopyAttributes, Resolve 21+). Default copies all video attributes.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `source` | object | yes |  |  |
| `targets` | array | yes |  |  |
| `attributes` | record | no |  |  |

### `timeline_delete_gaps` — destructive

Delete all gaps between clips, rippling content left (Timeline.DeleteGaps, Resolve 21+). DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `clip_export_frame`

Export one frame of a timeline item as an image file (TimelineItem.ExportFrame, Resolve 21+).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `frameOffset` | number | no | `0` | 0-based offset from the item start |
| `path` | string | yes |  |  |

### `clip_get_properties` — read-only

Read a timeline item's Inspector properties (Pan, Tilt, ZoomX/Y, RotationAngle, Crop*, Opacity, CompositeMode, RetimeProcess...).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |

### `clip_set_properties`

Set any documented timeline item properties (verified by readback). Keys: Pan, Tilt, ZoomX, ZoomY, ZoomGang, RotationAngle, AnchorPointX/Y, Pitch, Yaw, FlipX, FlipY, CropLeft/Right/Top/Bottom, CropSoftness, CropRetain, DynamicZoomEase, CompositeMode, Opacity, Distortion, RetimeProcess, MotionEstimation, Scaling, ResizeFilter.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `properties` | record | yes |  |  |

### `clip_set_opacity`

Set item opacity 0-100.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `opacity` | number | yes |  |  |

### `clip_set_transform`

Set item transform: pan/tilt (pixels), zoom, rotation (degrees), anchor, flips.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `pan` | number | no |  |  |
| `tilt` | number | no |  |  |
| `zoomX` | number | no |  |  |
| `zoomY` | number | no |  |  |
| `rotation` | number | no |  |  |
| `anchorX` | number | no |  |  |
| `anchorY` | number | no |  |  |
| `flipX` | boolean | no |  |  |
| `flipY` | boolean | no |  |  |

### `clip_set_crop`

Crop an item (pixels from each edge), softness and retain-image-position.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `left` | number | no |  |  |
| `right` | number | no |  |  |
| `top` | number | no |  |  |
| `bottom` | number | no |  |  |
| `softness` | number | no |  |  |
| `retain` | boolean | no |  |  |

### `clip_set_rotation`

Rotate an item (degrees).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `degrees` | number | yes |  |  |

### `clip_set_zoom`

Zoom an item uniformly (1 = 100%) or per-axis.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `zoom` | number | no |  |  |
| `zoomX` | number | no |  |  |
| `zoomY` | number | no |  |  |

### `clip_set_position_xy`

Reposition an item in frame (Pan = X, Tilt = Y, in pixels).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `x` | number | yes |  |  |
| `y` | number | yes |  |  |

### `clip_set_composite_mode`

Set an item's composite (blend) mode by Resolve's numeric mode id (0 Normal, 1 Add, 2 Subtract, 3 Difference, 4 Multiply, 5 Screen, 6 Overlay, ...).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `mode` | number | yes |  |  |

### `clip_set_audio_video_link`

Link or unlink timeline items (e.g. a video item and its audio).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `items` | array | yes |  |  |
| `linked` | boolean | yes |  |  |

### `clip_set_enabled`

Enable or disable a timeline item.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `enabled` | boolean | yes |  |  |

### `clip_set_color`

Set or clear (null) a timeline item's clip color.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `color` | nullable | yes |  |  |

### `clip_add_marker`

Add a marker on a timeline item (frame relative to the item's start).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `frame` | number | yes |  |  |
| `color` | enum (Blue \| Cyan \| Green \| Yellow \| Red \| Pink \| Purple \| Fuchsia \| Rose \| Lavender \| Sky \| Mint \| Lemon \| Sand \| Cocoa \| Cream) | no | `"Blue"` |  |
| `name` | string | no | `""` |  |
| `note` | string | no | `""` |  |

### `clip_stabilize`

Run Resolve's stabilizer on a timeline item.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |

### `clip_smart_reframe`

Run Smart Reframe on a timeline item (Studio; useful for vertical deliverables).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |

### `clip_reverse`

Play a timeline item backwards (Fusion TimeStretcher in the item's composition; item length unchanged).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |

### `clip_freeze_frame`

Freeze frame. engine 'resolve' (default) sets clip speed to 0% (SetSpeed, Resolve 21+: holds the first frame); engine 'fusion' holds a chosen composition frame with a TimeStretcher.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `engine` | enum (resolve \| fusion) | no | `"resolve"` |  |
| `frame` | number | no | `0` | fusion engine: composition frame to hold |

### `clip_set_speed`

Change clip speed (0.5 = 50% slow motion, 2 = 200%). engine 'resolve' (default) uses TimelineItem.SetSpeed (Resolve 21+; item length changes, ripple optional); engine 'fusion' retimes inside the clip's Fusion composition without changing its length.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `speed` | number | yes |  |  |
| `engine` | enum (resolve \| fusion) | no | `"resolve"` |  |
| `ripple` | boolean | no | `false` |  |
| `pitchCorrection` | boolean | no |  |  |
| `interpolate` | boolean | no | `true` |  |

### `clip_insert_generator`

Insert a generator at the playhead (standard e.g. 'Solid Color', '10 Step'; fusion; or OFX by name).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `name` | string | yes |  |  |
| `kind` | enum (standard \| fusion \| ofx) | no | `"standard"` |  |
| `timecode` | string | no |  |  |
| `frame` | number | no |  |  |

## effects

### `effect_list` — read-only

List effects installed in this Resolve (Resolve.GetEffectsList: ResolveFX/OFX and Fusion effects; mediaType video|audio|photo). With fusionNodes: true also lists the Fusion node aliases usable with engine 'fusion'.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `mediaType` | enum (video \| audio \| photo) | no |  |  |
| `category` | enum (ofx \| fusion \| audio) | no |  |  |
| `query` | string | no |  |  |
| `fusionNodes` | boolean | no | `false` |  |
| `registry` | boolean | no | `false` | Ask Fusion (Lua helper) for every registered Fusion tool |

### `effect_search` — read-only

Search installed effects by name or id (e.g. 'blur', 'grain', 'lens').

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string | yes |  |  |
| `mediaType` | enum (video \| audio \| photo) | no |  |  |

### `effect_apply`

Apply an effect to a timeline item. engine 'resolve' (default) uses TimelineItem.AddEffect with an installed effect name/id (e.g. 'Gaussian Blur', 'Film Grain', 'Vignette', 'Lens Flare', or an alias like blur/film_grain/vignette). engine 'fusion' inserts a Fusion node into the item's composition (parameters are then settable with effect_set_parameters).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `effect` | string | yes |  |  |
| `engine` | enum (resolve \| fusion) | no | `"resolve"` |  |
| `category` | enum (ofx \| fusion \| audio) | no |  |  |
| `name` | string | no |  |  |
| `parameters` | record | no |  |  |

### `effect_remove`

Remove an effect from a timeline item: a ResolveFX/OFX/audio effect by name or id (engine 'resolve'), or a Fusion node by node name (engine 'fusion').

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `effect` | string | yes |  |  |
| `engine` | enum (resolve \| fusion) | no | `"resolve"` |  |
| `compIndex` | number | no | `1` |  |

### `effect_list_applied` — read-only

Effects on an item: ResolveFX/OFX/audio (GetEffects) plus Fusion nodes in its composition.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `compIndex` | number | no | `1` |  |

### `effect_set_enabled`

Enable or bypass an applied ResolveFX/OFX/audio effect.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `effect` | string | yes |  |  |
| `enabled` | boolean | yes |  |  |

### `effect_get_parameters` — read-only

List a Fusion effect node's inputs (ids, names, types, values). ResolveFX parameters are not exposed to scripting.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `node` | string | yes |  |  |
| `compIndex` | number | no | `1` |  |

### `effect_set_parameters`

Set Fusion effect node inputs (verified by readback). With time, sets a keyframe on an animated input.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `node` | string | yes |  | Fusion node name |
| `compIndex` | number | no | `1` |  |
| `parameters` | record | yes |  |  |
| `time` | number | no |  |  |

### `effect_configure`

Alias of effect_set_parameters.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `node` | string | yes |  | Fusion node name |
| `compIndex` | number | no | `1` |  |
| `parameters` | record | yes |  |  |
| `time` | number | no |  |  |

### `transition_list` — read-only

Transition names you can use with transition_add, and (with onTimeline) the transitions already on a track.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `onTimeline` | boolean | no | `false` |  |
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `trackType` | enum (video \| audio) | no | `"video"` |  |
| `trackIndex` | number | no |  |  |

### `transition_add`

Add a transition at the start or end of a timeline item (TimelineItem.AddTransition, Resolve 21+). E.g. Cross Dissolve, Dip To Color Dissolve, Push, Slide, Zoom (fusion), Cross Fade +3 dB (audio). Needs media handles at the edit.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `type` | string | no | `"Cross Dissolve"` |  |
| `category` | enum (simple \| fusion \| ofx \| audio) | no | `"simple"` |  |
| `position` | enum (start \| end) | no | `"end"` |  |
| `alignment` | enum (left \| center \| right) | no | `"center"` |  |
| `duration` | number | no |  | Frames (default: Resolve decides) |

### `transition_remove` — destructive

Remove transitions from a track (one by itemId from transition_list, or all on the track). DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `trackType` | enum (video \| audio) | no | `"video"` |  |
| `trackIndex` | number | no |  |  |
| `itemId` | string | no |  |  |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `transition_configure`

Change a transition's type/duration: removes it and adds the new one at the same edit of the given clip (transition parameters themselves are not scriptable).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `transitionId` | string | yes |  |  |
| `type` | string | yes |  |  |
| `category` | enum (simple \| fusion \| ofx \| audio) | no | `"simple"` |  |
| `position` | enum (start \| end) | no | `"end"` |  |
| `duration` | number | no |  |  |

### `adjustment_clip_create`

Insert an Adjustment Clip at the playhead (tries the 'Adjustment Clip' generator); apply effects to it with effect_apply.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `timecode` | string | no |  |  |
| `frame` | number | no |  |  |

## speed

### `speed_set`

Constant clip speed in percent (e.g. 50 = slow motion, 200 = fast). engine 'resolve' (default): TimelineItem.SetSpeed (Resolve 21+; changes item length; ripple optional). engine 'fusion': Fusion-based retiming remaps frames inside the clip's composition; the item's length on the timeline is not changed (the API has no speed-change/ripple). For true retime with length change use the Edit page Change Clip Speed.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `percentage` | number | yes |  |  |
| `engine` | enum (resolve \| fusion) | no | `"resolve"` |  |
| `ripple` | boolean | no | `false` |  |
| `pitchCorrection` | boolean | no |  |  |
| `stretchKeyframes` | boolean | no |  |  |
| `interpolate` | boolean | no | `true` |  |

### `speed_ramp_create`

Speed ramp from keyframes mapping composition frames to source frames (e.g. normal -> slow -> normal). Fusion-based retiming remaps frames inside the clip's composition; the item's length on the timeline is not changed (the API has no speed-change/ripple). For true retime with length change use the Edit page Change Clip Speed.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `keys` | array | yes |  |  |

### `speed_ramp_configure`

Change the keyframes of an existing MCP_Retime TimeStretcher node.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `node` | string | no | `"MCP_Retime"` |  |
| `keys` | array | yes |  |  |

### `speed_reverse`

Reverse playback. Fusion-based retiming remaps frames inside the clip's composition; the item's length on the timeline is not changed (the API has no speed-change/ripple). For true retime with length change use the Edit page Change Clip Speed.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |

### `speed_freeze`

Freeze frame: native 0% speed (Resolve 21+), or engine 'fusion' to hold a specific composition frame.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `engine` | enum (resolve \| fusion) | no | `"resolve"` |  |
| `frame` | number | no | `0` |  |

### `speed_optical_flow`

Set the item's retime process (optical flow / frame blend / nearest) and motion estimation mode via documented item properties.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `process` | enum (project \| nearest \| frame_blend \| optical_flow) | no | `"optical_flow"` |  |
| `motionEstimation` | number | no |  | 0 project, 1 standard faster, 2 standard better, 3 enhanced faster, 4 enhanced better, 5 speed warp faster, 6 speed warp better |

### `speed_retime_curve`

Arbitrary time-remap curve (frame -> source frame). Fusion-based retiming remaps frames inside the clip's composition; the item's length on the timeline is not changed (the API has no speed-change/ripple). For true retime with length change use the Edit page Change Clip Speed.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `keys` | array | yes |  |  |

### `speed_get_info` — read-only

Retime-related state of an item: RetimeProcess, MotionEstimation properties and any MCP retime Fusion nodes.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |

## titles

### `title_create`

Add a title. mode 'overlay' (default, non-destructive): Text+ composited over the video clip under the given frame, inside that clip's Fusion composition (lasts the clip's length). mode 'insert': Resolve's InsertFusionTitleIntoTimeline/InsertTitleIntoTimeline at the playhead — verified on Resolve 21 to RIPPLE-INSERT on the destination track (pushes later clips), so it needs confirm: true.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `timecode` | string | no |  | Insert at this timecode (moves the playhead) |
| `frame` | number | no |  |  |
| `mode` | enum (overlay \| insert) | no | `"overlay"` |  |
| `trackIndex` | number | no |  | overlay: video track whose clip receives the title (default: topmost clip at frame) |
| `text` | string | no | `"Title"` |  |
| `kind` | enum (fusion \| standard) | no | `"fusion"` |  |
| `template` | string | no |  |  |
| `style` | object | no |  |  |
| `animation` | object | no |  |  |
| `confirm` | boolean | no |  |  |

### `title_edit`

Restyle a Text+ title (any style fields).

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `compIndex` | number | no | `1` |  |
| `style` | object | yes |  |  |

### `title_set_text`

Change a Text+ title's text.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `compIndex` | number | no | `1` |  |
| `text` | string | yes |  |  |

### `title_set_font`

Set a Text+ title's font family and style.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `compIndex` | number | no | `1` |  |
| `font` | string | yes |  |  |
| `fontStyle` | string | no |  |  |

### `title_set_size`

Set a Text+ title's size (0..1).

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `compIndex` | number | no | `1` |  |
| `size` | number | yes |  |  |

### `title_set_color`

Set a Text+ title's fill color.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `compIndex` | number | no | `1` |  |
| `color` | string | yes |  | Hex color like #ff8800 |
| `opacity` | number | no |  |  |

### `title_set_position`

Position a Text+ title (normalized center).

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `compIndex` | number | no | `1` |  |
| `x` | number | yes |  |  |
| `y` | number | yes |  |  |

### `title_set_alignment`

Set Text+ horizontal alignment.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `compIndex` | number | no | `1` |  |
| `alignment` | enum (left \| center \| right) | yes |  |  |

### `title_set_background`

Add a background box behind a Text+ title.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `compIndex` | number | no | `1` |  |
| `color` | string | no | `"#000000"` | Hex color like #ff8800 |
| `opacity` | number | no | `0.75` |  |

### `title_set_animation`

Animate a Text+ title (fade, slide_up, zoom, scroll, typewriter) with Fusion keyframes.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `compIndex` | number | no | `1` |  |
| `animation` | object | yes |  |  |

### `title_get` — read-only

Read a Text+ title's text and style inputs.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `compIndex` | number | no | `1` |  |

### `title_delete` — destructive

Delete an inserted title item from the timeline (for overlay titles use fusion_delete_node on the MCP_Title node and its _Merge). DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `title_create_lower_third`

Lower-third name/role title with background box and slide-up animation.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `timecode` | string | no |  | Insert at this timecode (moves the playhead) |
| `frame` | number | no |  |  |
| `text` | string | yes |  |  |
| `subtitle` | string | no |  |  |
| `style` | object | no |  |  |

### `title_create_intro`

Large centered opening title with zoom-in animation.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `timecode` | string | no |  | Insert at this timecode (moves the playhead) |
| `frame` | number | no |  |  |
| `text` | string | yes |  |  |
| `subtitle` | string | no |  |  |
| `style` | object | no |  |  |

### `title_create_outro`

Centered closing title with fade-in.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `timecode` | string | no |  | Insert at this timecode (moves the playhead) |
| `frame` | number | no |  |  |
| `text` | string | yes |  |  |
| `subtitle` | string | no |  |  |
| `style` | object | no |  |  |

### `title_create_credits`

Scrolling credits (use newlines between lines).

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `timecode` | string | no |  | Insert at this timecode (moves the playhead) |
| `frame` | number | no |  |  |
| `text` | string | yes |  |  |
| `subtitle` | string | no |  |  |
| `style` | object | no |  |  |

### `title_create_scrolling_text`

Scrolling text crawl (vertical).

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `timecode` | string | no |  | Insert at this timecode (moves the playhead) |
| `frame` | number | no |  |  |
| `text` | string | yes |  |  |
| `subtitle` | string | no |  |  |
| `style` | object | no |  |  |

### `title_list_presets` — read-only

List reusable title presets and their styles.

*Implementation:* Resolve scripting API

_No parameters._

## subtitles

### `subtitle_create_track`

Add a subtitle track to the timeline.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |

### `subtitle_import`

Import an SRT (or other Resolve-supported subtitle file) and place it on the timeline's subtitle track.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `path` | string | yes |  | Absolute local file path |

### `subtitle_export`

Export the timeline's subtitle items to an SRT file (built from the subtitle track contents).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `path` | string | yes |  | Absolute local file path |
| `track` | number | no |  |  |
| `overwrite` | boolean | no | `false` |  |

### `subtitle_get_all` — read-only

All subtitle items (text, start/end frames).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |

### `subtitle_add` — read-only

Add a single subtitle caption. (Not scriptable: the scripting API cannot create or edit individual subtitle items.)

*Implementation:* Not scriptable (returns `unsupported` with an alternative)

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `text` | string | no |  |  |

### `subtitle_edit` — read-only

Edit a subtitle caption's text. (Not scriptable: the scripting API cannot create or edit individual subtitle items.)

*Implementation:* Not scriptable (returns `unsupported` with an alternative)

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `text` | string | no |  |  |

### `subtitle_delete` — read-only

Delete one subtitle caption. (Not scriptable: the scripting API cannot create or edit individual subtitle items.)

*Implementation:* Not scriptable (returns `unsupported` with an alternative)

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |

### `subtitle_set_timing` — read-only

Retime a subtitle caption. (Not scriptable: the scripting API cannot create or edit individual subtitle items.)

*Implementation:* Not scriptable (returns `unsupported` with an alternative)

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |

### `subtitle_set_style` — read-only

Style subtitle captions (font/size/color/background). (Not scriptable: subtitle track styling is not exposed to scripting.)

*Implementation:* Not scriptable (returns `unsupported` with an alternative)

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |

### `subtitle_generate`

Generate subtitles from the timeline audio. engine 'resolve' uses Resolve Studio's CreateSubtitlesFromAudio; engine 'provider' transcribes a rendered/source audio file with the configured AI provider and imports the SRT.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `engine` | enum (resolve \| provider) | no | `"resolve"` |  |
| `language` | string | no |  | resolve: e.g. english, spanish (AUTO_CAPTION_* constant). provider: ISO code like en |
| `charsPerLine` | number | no |  |  |
| `lines` | union | no |  |  |
| `gapFrames` | number | no |  |  |
| `audioPath` | string | no |  | provider engine: audio/video file to transcribe |

## fusion

### `fusion_get_composition` — read-only

Inspect a Fusion composition (item's comp, or the Fusion page's current comp): name, render range, nodes. create: true adds a comp to the item if it has none.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `create` | boolean | no | `false` |  |

### `fusion_get_nodes` — read-only

List nodes with types and input connections.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |

### `fusion_create_node`

Create any Fusion node by RegID or alias (TextPlus, Background, Merge, Transform, Blur, Glow, Camera3D, Shape3D, pEmitter...). The type is validated by Fusion; unknown types are reported. insertIntoChain puts it before MediaOut.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `type` | string | yes |  |  |
| `name` | string | no |  |  |
| `inputs` | record | no |  | Fusion input id -> value (numbers, strings, [x,y] points) |
| `insertIntoChain` | boolean | no | `false` |  |
| `x` | number | no |  |  |
| `y` | number | no |  |  |

### `fusion_delete_node` — destructive

Delete a node (MediaIn/MediaOut protected). DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `node` | string | yes |  |  |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `fusion_connect_nodes`

Connect node 'from' output into node 'to' input (default: its main input). Input names are validated against the node.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `from` | string | yes |  |  |
| `to` | string | yes |  |  |
| `input` | string | no |  | e.g. Background, Foreground, Input, EffectMask, SceneInput1 |

### `fusion_disconnect_nodes`

Disconnect a node's input.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `node` | string | yes |  |  |
| `input` | string | no |  |  |

### `fusion_set_node_input`

Set node inputs (verified by readback). With time, sets a keyframe value on an animated input.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `node` | string | yes |  |  |
| `inputs` | record | yes |  | Fusion input id -> value (numbers, strings, [x,y] points) |
| `time` | number | no |  |  |

### `fusion_get_node_inputs` — read-only

List a node's inputs (id, name, type, optional values).

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `node` | string | yes |  |  |
| `withValues` | boolean | no | `false` |  |

### `fusion_create_text`

Create a Text+ node with text, font, size and color, merged over the clip (or output directly when overClip is false).

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `text` | string | yes |  |  |
| `font` | string | no |  |  |
| `size` | number | no | `0.08` |  |
| `color` | string | no | `"#ffffff"` | Hex color like #ff8800 |
| `position` | tuple | no | `[0.5,0.5]` |  |
| `name` | string | no | `"MCP_Text"` |  |
| `overClip` | boolean | no | `true` |  |

### `fusion_create_3d_text`

Build a 3D text scene: Text3D -> Merge3D (+ Camera3D + directional light) -> Renderer3D, connected to MediaOut.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `text` | string | yes |  |  |
| `extrusion` | number | no | `0.15` |  |
| `size` | number | no | `0.4` |  |
| `prefix` | string | no | `"MCP3D"` |  |

### `fusion_create_background`

Create a Background node (solid color or gradient).

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `color` | string | no | `"#000000"` | Hex color like #ff8800 |
| `gradientTo` | string | no |  | Hex color like #ff8800 |
| `name` | string | no | `"MCP_Background"` |  |
| `connectToOutput` | boolean | no | `false` |  |

### `fusion_create_merge`

Create a Merge node compositing foreground over background (optionally wiring existing nodes) with blend/apply mode.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `background` | string | no |  |  |
| `foreground` | string | no |  |  |
| `name` | string | no | `"MCP_Merge"` |  |
| `blend` | number | no | `1` |  |
| `applyMode` | string | no |  | Normal, Screen, Multiply, Overlay, ... |
| `connectToOutput` | boolean | no | `false` |  |

### `fusion_create_transform`

Create a Transform node (center, size, angle), optionally after an existing node.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `input` | string | no |  |  |
| `name` | string | no | `"MCP_Transform"` |  |
| `center` | tuple | no |  |  |
| `size` | number | no |  |  |
| `angle` | number | no |  |  |

### `fusion_create_mask`

Create a mask (rectangle, ellipse, polygon, bspline) and optionally attach it as EffectMask of a node.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `shape` | enum (rectangle \| ellipse \| polygon \| bspline) | yes |  |  |
| `name` | string | no | `"MCP_Mask"` |  |
| `center` | tuple | no |  |  |
| `width` | number | no |  |  |
| `height` | number | no |  |  |
| `softEdge` | number | no |  |  |
| `invert` | boolean | no |  |  |
| `applyTo` | string | no |  |  |

### `fusion_create_chroma_key`

Green/blue-screen removal: DeltaKeyer on the clip (inserted before MediaOut), optional background node merged behind.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `screen` | enum (green \| blue) | no | `"green"` |  |
| `background` | string | no |  |  |
| `name` | string | no | `"MCP_Keyer"` |  |

### `fusion_create_particle_system`

Particle system: pEmitter -> (pDirectionalForce) -> pRender, merged over the clip.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `prefix` | string | no | `"MCP_Particles"` |  |
| `number` | number | no | `50` |  |
| `lifespan` | number | no | `100` |  |
| `velocity` | number | no | `0.1` |  |
| `gravity` | boolean | no | `true` |  |

### `fusion_create_camera`

Create a Camera3D node.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `name` | string | no | `"MCP_Camera"` |  |
| `z` | number | no | `3` |  |
| `angleOfView` | number | no |  |  |

### `fusion_create_light`

Create a 3D light (ambient, directional, point, spot).

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `kind` | enum (ambient \| directional \| point \| spot) | no | `"directional"` |  |
| `name` | string | no | `"MCP_Light"` |  |
| `intensity` | number | no |  |  |
| `color` | string | no |  | Hex color like #ff8800 |

### `fusion_create_3d_scene`

Empty 3D scene skeleton: Merge3D with Camera3D + light -> Renderer3D -> MediaOut. Add Shape3D/Text3D/ImagePlane3D into the Merge3D scene inputs.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `prefix` | string | no | `"MCP_Scene"` |  |
| `shape` | enum (none \| cube \| sphere \| plane \| torus \| cylinder \| cone) | no | `"cube"` |  |

### `fusion_set_keyframe`

Animate a node input: adds a BezierSpline (or XYPath for points with path: true) and sets values at frames.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `node` | string | yes |  |  |
| `input` | string | yes |  |  |
| `keys` | array | yes |  |  |
| `path` | boolean | no | `false` |  |

### `fusion_create_animation`

Preset animations on a node: fade_in/out (Blend on Merge or Alpha1 on Text+), scale_up (Size), spin (Angle), slide (Center), pulse (Size loop).

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `node` | string | yes |  |  |
| `preset` | enum (fade_in \| fade_out \| scale_up \| spin \| slide_left \| slide_up \| pulse) | yes |  |  |
| `start` | number | no | `0` |  |
| `frames` | number | no | `24` |  |
| `inputOverride` | string | no |  |  |

### `fusion_set_expression`

Set a SimpleExpression on a node input (e.g. 'time/24', 'Text1.Size*2').

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `node` | string | yes |  |  |
| `input` | string | yes |  |  |
| `expression` | string | yes |  |  |

### `fusion_build_graph`

Build a whole node graph from a declarative spec: nodes [{name,type,inputs}], connections [{from,to,input}], keyframes [{node,input,keys}], output node. All types/inputs validated; errors listed per node.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `nodes` | array | yes |  |  |
| `connections` | array | no | `[]` |  |
| `keyframes` | array | no | `[]` |  |
| `output` | string | no |  |  |

### `fusion_create_macro`

Save one or more nodes as a reusable .setting file (macro/template). Load later with fusion_load_template. Multi-node save needs the Fusion page open.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `nodes` | array | yes |  |  |
| `path` | string | yes |  | Absolute local file path |
| `overwrite` | boolean | no | `false` |  |

### `fusion_load_template`

Paste a .setting template/macro into a composition.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `path` | string | yes |  | Absolute local file path |

### `fusion_import_comp`

Import a .comp file as a new composition on a timeline item.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `path` | string | yes |  | Absolute local file path |

### `fusion_export_comp`

Export an item's composition to a .comp file.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `path` | string | yes |  | Absolute local file path |
| `compIndex` | number | no | `1` |  |
| `overwrite` | boolean | no | `false` |  |

### `fusion_insert_composition`

Insert an empty Fusion Composition clip at the playhead (for motion graphics / logo animations).

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `timecode` | string | no |  |  |

### `fusion_render_comp`

Render a Fusion composition (Composition.Render). Inside Resolve, comps usually render with the timeline: prefer render_* tools.

*Implementation:* Fusion scripting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `source` | enum (item \| current) | no | `"item"` |  |
| `compIndex` | number | no | `1` |  |
| `wait` | boolean | no | `true` |  |

## color

### `color_get_nodes` — read-only

List the item's color nodes (label, LUT, tools) — Resolve 19+.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |

### `color_create_node` — read-only

Add a serial/parallel color node. (Not scriptable: Adding color nodes has no scripting API.)

*Implementation:* Not scriptable (returns `unsupported` with an alternative)

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |

### `color_delete_node` — read-only

Delete a color node. (Not scriptable: Deleting color nodes has no scripting API.)

*Implementation:* Not scriptable (returns `unsupported` with an alternative)

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |

### `color_set_node_enabled`

Enable/bypass a color node (Resolve 19.1+).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `nodeIndex` | number | no | `1` | 1-based color node index |
| `enabled` | boolean | yes |  |  |

### `color_set_cdl`

Apply an ASC CDL to a node: slope (≈ gain), offset, power (≈ inverse gamma), saturation. This is the scriptable primary correction.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `nodeIndex` | number | no | `1` | 1-based color node index |
| `slope` | tuple | no | `[1,1,1]` |  |
| `offset` | tuple | no | `[0,0,0]` |  |
| `power` | tuple | no | `[1,1,1]` |  |
| `saturation` | number | no | `1` |  |
| `preserve` | boolean | no | `true` | Create a new local grade version first so the previous grade can be restored |

### `color_set_lift`

Lift (shadows) — mapped to CDL offset via ASC CDL on a node (the Color-page wheels themselves are not scriptable). Values are RGB triples.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `nodeIndex` | number | no | `1` | 1-based color node index |
| `value` | tuple | yes |  |  |
| `preserve` | boolean | no | `true` | Create a new local grade version first so the previous grade can be restored |

### `color_set_gamma`

Gamma (midtones) — mapped to CDL power = 1/gamma via ASC CDL on a node (the Color-page wheels themselves are not scriptable). Values are RGB triples.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `nodeIndex` | number | no | `1` | 1-based color node index |
| `value` | tuple | yes |  |  |
| `preserve` | boolean | no | `true` | Create a new local grade version first so the previous grade can be restored |

### `color_set_gain`

Gain (highlights) — mapped to CDL slope via ASC CDL on a node (the Color-page wheels themselves are not scriptable). Values are RGB triples.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `nodeIndex` | number | no | `1` | 1-based color node index |
| `value` | tuple | yes |  |  |
| `preserve` | boolean | no | `true` | Create a new local grade version first so the previous grade can be restored |

### `color_set_offset`

Offset — CDL offset via ASC CDL on a node (the Color-page wheels themselves are not scriptable). Values are RGB triples.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `nodeIndex` | number | no | `1` | 1-based color node index |
| `value` | tuple | yes |  |  |
| `preserve` | boolean | no | `true` | Create a new local grade version first so the previous grade can be restored |

### `color_set_saturation`

Set saturation via CDL saturation (1 = neutral).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `nodeIndex` | number | no | `1` | 1-based color node index |
| `saturation` | number | yes |  |  |
| `preserve` | boolean | no | `true` | Create a new local grade version first so the previous grade can be restored |

### `color_set_contrast`

Contrast (1 = neutral) around pivot. Not directly scriptable; implemented by generating a 3D LUT with this adjustment and applying it to the node (replaces that node's LUT).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `nodeIndex` | number | no | `1` | 1-based color node index |
| `value` | number | yes |  |  |
| `pivot` | number | no |  |  |
| `preserve` | boolean | no | `true` | Create a new local grade version first so the previous grade can be restored |

### `color_set_temperature`

White-balance temperature (-1 cool .. +1 warm). Not directly scriptable; implemented by generating a 3D LUT with this adjustment and applying it to the node (replaces that node's LUT).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `nodeIndex` | number | no | `1` | 1-based color node index |
| `value` | number | yes |  |  |
| `pivot` | number | no |  |  |
| `preserve` | boolean | no | `true` | Create a new local grade version first so the previous grade can be restored |

### `color_set_tint`

Tint (-1 green .. +1 magenta). Not directly scriptable; implemented by generating a 3D LUT with this adjustment and applying it to the node (replaces that node's LUT).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `nodeIndex` | number | no | `1` | 1-based color node index |
| `value` | number | yes |  |  |
| `pivot` | number | no |  |  |
| `preserve` | boolean | no | `true` | Create a new local grade version first so the previous grade can be restored |

### `color_set_exposure`

Exposure in stops. Not directly scriptable; implemented by generating a 3D LUT with this adjustment and applying it to the node (replaces that node's LUT).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `nodeIndex` | number | no | `1` | 1-based color node index |
| `value` | number | yes |  |  |
| `pivot` | number | no |  |  |
| `preserve` | boolean | no | `true` | Create a new local grade version first so the previous grade can be restored |

### `color_apply_lut`

Apply a LUT file (.cube etc.) to a color node.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `lutPath` | string | yes |  | Absolute local file path |
| `nodeIndex` | number | no | `1` | 1-based color node index |
| `preserve` | boolean | no | `true` | Create a new local grade version first so the previous grade can be restored |

### `color_create_lut`

Generate a 3D .cube LUT from look parameters (exposure, white balance, lift/gamma/gain, contrast, saturation, split toning, fade, monochrome) or a named preset.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `path` | string | yes |  | Absolute local file path |
| `preset` | enum (hollywood_cinematic \| teal_orange \| filmic_warm \| vintage_film \| black_and_white \| moody_cinematic \| bright_commercial \| natural_documentary \| desaturated_cinematic \| night_cinematic) | no |  |  |
| `params` | object | no |  |  |
| `size` | number | no | `33` |  |
| `overwrite` | boolean | no | `false` |  |

### `color_export_item_lut`

Export an item's full grade as a LUT file (TimelineItem.ExportLUT).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `path` | string | yes |  | Absolute local file path |
| `size` | enum (17 \| 33 \| 65 \| panasonic) | no | `"33"` |  |
| `overwrite` | boolean | no | `false` |  |

### `color_copy_grade`

Copy the grade of one timeline item to other items (TimelineItem.CopyGrades).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `source` | object | yes |  |  |
| `targets` | array | yes |  |  |

### `color_paste_grade`

Paste (apply) a grade onto items: from another item (source) or from a .drx grade file.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `targets` | array | yes |  |  |
| `source` | object | no |  |  |
| `drxPath` | string | no |  | Absolute local file path |
| `keyframeMode` | enum (none \| source_timecode \| start_frames) | no | `"none"` |  |

### `color_match_shots`

Match shots. Shot Match itself is not scriptable, so: mode 'copy' copies the reference item's grade onto targets (CopyGrades); mode 'auto' runs Resolve's Auto Color balance on each target (ApplyAutoColor, Resolve 21+).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `mode` | enum (copy \| auto) | no | `"copy"` |  |
| `reference` | object | no |  |  |
| `targets` | array | yes |  |  |

### `color_auto_balance`

Resolve Auto Color: automatic balance and grade for an item (ApplyAutoColor, Resolve 21+).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |

### `color_get_cdl` — read-only

Read a node's primaries as an ASC CDL (GetCDL, Resolve 21+) — read before changing to preserve existing settings.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `nodeIndex` | number | no | `1` | 1-based color node index |

### `color_set_node_label`

Label a color node (Graph.SetNodeLabel, Resolve 21+).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `nodeIndex` | number | no | `1` | 1-based color node index |
| `label` | string | yes |  |  |

### `color_get_scopes` — read-only

Approximate scopes for the current frame: exports the frame as a still and measures luma/chroma statistics (YMIN/YAVG/YMAX, saturation, hue) with FFmpeg signalstats. Requires FFmpeg.

*Implementation:* Resolve API + FFmpeg/files

_No parameters._

### `color_create_power_window` — read-only

Create a Power Window. (Not scriptable: Power Windows has no scripting API.)

*Implementation:* Not scriptable (returns `unsupported` with an alternative)

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |

### `color_track_window` — read-only

Track a Power Window. (Not scriptable: The window tracker has no scripting API.)

*Implementation:* Not scriptable (returns `unsupported` with an alternative)

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |

### `color_magic_mask`

Run Magic Mask tracking on the current node (Studio; strokes must already be drawn).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `mode` | enum (forward \| backward \| bidirectional) | no | `"bidirectional"` |  |

### `color_apply_look`

Apply a cinematic look: a built-in preset (hollywood_cinematic, teal_orange, filmic_warm, vintage_film, black_and_white, moody_cinematic, bright_commercial, natural_documentary, desaturated_cinematic, night_cinematic), custom params, or a .drx grade. Applies to one item or every video item on a track.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `preset` | enum (hollywood_cinematic \| teal_orange \| filmic_warm \| vintage_film \| black_and_white \| moody_cinematic \| bright_commercial \| natural_documentary \| desaturated_cinematic \| night_cinematic) | no |  |  |
| `params` | object | no |  |  |
| `intensity` | number | no | `1` | Blend the preset toward neutral (0..1) |
| `drxPath` | string | no |  | Absolute local file path |
| `nodeIndex` | number | no | `1` | 1-based color node index |
| `wholeTrack` | boolean | no | `false` |  |
| `preserve` | boolean | no | `true` | Create a new local grade version first so the previous grade can be restored |

### `color_list_presets` — read-only

List the cinematic look presets and their parameters.

*Implementation:* Resolve scripting API

_No parameters._

### `color_get_properties` — read-only

Grade-related state of an item: versions, nodes (19+), color group.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |

### `color_versions` — read-only

List local/remote grade versions of an item.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |

### `color_version_load`

Switch an item to a named grade version (e.g. restore the version saved before an MCP change).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `name` | string | yes |  |  |
| `remote` | boolean | no | `false` |  |

### `color_version_add`

Add a new grade version to an item.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `name` | string | yes |  |  |
| `remote` | boolean | no | `false` |  |

### `color_reset` — destructive

Reset all grades on an item (Resolve 19+). A version is saved first when preserve is true. DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `preserve` | boolean | no | `true` | Create a new local grade version first so the previous grade can be restored |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `color_groups` — read-only

List color groups.

*Implementation:* Resolve scripting API

_No parameters._

### `color_assign_group`

Assign an item to a color group (created if missing).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `group` | string | yes |  |  |
| `create` | boolean | no | `true` |  |

### `color_grab_still`

Grab a gallery still of the current frame (stores the grade); optionally export it.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `exportFolder` | string | no |  | Absolute local file path |
| `format` | enum (png \| jpg \| tif \| dpx \| cin \| exr \| bmp \| tga \| ppm) | no | `"png"` |  |

## audio

### `audio_import`

Import music, sound effects or dialogue files into the media pool (default bin 'Audio').

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `paths` | array | yes |  |  |
| `bin` | string | no | `"Audio"` |  |

### `audio_add_track`

Add an audio track (mono, stereo, 5.1, 7.1, adaptive...).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `format` | string | no | `"stereo"` |  |
| `name` | string | no |  |  |

### `audio_remove_track` — destructive

Delete an audio track and its clips. DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `trackIndex` | number | yes |  |  |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `audio_get_tracks` — read-only

Audio tracks with format, state and items.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |

### `audio_place_clip`

Place an audio clip (music, SFX, VO) on an audio track at a record frame, optionally a source range.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |
| `trackIndex` | number | no | `1` |  |
| `recordFrame` | number | no |  |  |
| `sourceStart` | number | no |  |  |
| `sourceEnd` | number | no |  |  |

### `audio_move_clip` — destructive

Move an audio item to another frame/track. Re-placement based (see clip_trim/clip_split): item-level audio adjustments are not carried over. DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `recordFrame` | number | yes |  |  |
| `toTrack` | number | no |  |  |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `audio_trim` — destructive

Trim an audio item's head/tail. Re-placement based (see clip_trim/clip_split): item-level audio adjustments are not carried over. DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `trimStart` | number | no | `0` |  |
| `trimEnd` | number | no | `0` |  |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `audio_split` — destructive

Split an audio item at a timeline frame. Re-placement based (see clip_trim/clip_split): item-level audio adjustments are not carried over. DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `frame` | number | yes |  |  |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `audio_set_volume`

Set clip volume in dB (AudioVolume item property, Resolve 21+). Attempted via TimelineItem.SetProperty and verified by readback; reports 'unsupported' when this Resolve version rejects the property.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `volumeDb` | number | yes |  |  |

### `audio_set_gain`

Set clip gain in dB (Resolve exposes clip level as AudioVolume). Attempted via TimelineItem.SetProperty and verified by readback; reports 'unsupported' when this Resolve version rejects the property.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `gainDb` | number | yes |  |  |

### `audio_set_pan`

Set clip pan (AudioPan item property). Attempted via TimelineItem.SetProperty and verified by readback; reports 'unsupported' when this Resolve version rejects the property.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `pan` | number | yes |  |  |

### `audio_set_pitch`

Shift clip pitch (AudioPitchSemiTones / AudioPitchCents). Attempted via TimelineItem.SetProperty and verified by readback; reports 'unsupported' when this Resolve version rejects the property.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `semitones` | number | no | `0` |  |
| `cents` | number | no | `0` |  |

### `audio_dialogue_leveler`

Enable the Dialogue Leveler on a clip (reduce loud / lift soft dialogue, background reduction). Attempted via TimelineItem.SetProperty and verified by readback; reports 'unsupported' when this Resolve version rejects the property.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `enabled` | boolean | no | `true` |  |
| `reduceLoud` | boolean | no | `true` |  |
| `liftSoft` | boolean | no | `true` |  |
| `backgroundReduction` | boolean | no | `false` |  |
| `outputGainDb` | number | no | `0` |  |

### `audio_set_fade` — read-only

Set audio fade in/out handles. (Not scriptable: clip fade handles are not exposed to scripting.)

*Implementation:* Not scriptable (returns `unsupported` with an alternative)

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |

### `audio_add_effect`

Add a Fairlight FX / audio plugin to an audio clip (TimelineItem.AddEffect 'audio', Resolve 21+), e.g. 'Fairlight EQ', 'De-Esser', 'De-Hummer', 'Dialogue Processor', 'Reverb', 'Delay', 'Chorus'. Plugin parameters are not scriptable.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `effect` | string | yes |  |  |

### `audio_remove_effect`

Remove an audio effect from a clip by name or id.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `effect` | string | yes |  |  |

### `audio_set_eq`

Insert the Fairlight 'Fairlight EQ' plugin on an audio clip (AddEffect). Its parameters (bands, threshold, ratio, mix...) must be set in the plugin UI: they are not exposed to scripting.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `effect` | string | no | `"Fairlight EQ"` | Installed audio effect name (see effect_list mediaType audio) |

### `audio_set_compressor`

Insert the Fairlight 'Dynamics' plugin on an audio clip (AddEffect). Its parameters (bands, threshold, ratio, mix...) must be set in the plugin UI: they are not exposed to scripting.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `effect` | string | no | `"Dynamics"` | Installed audio effect name (see effect_list mediaType audio) |

### `audio_set_limiter`

Insert the Fairlight 'Limiter' plugin on an audio clip (AddEffect). Its parameters (bands, threshold, ratio, mix...) must be set in the plugin UI: they are not exposed to scripting.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `effect` | string | no | `"Limiter"` | Installed audio effect name (see effect_list mediaType audio) |

### `audio_set_reverb`

Insert the Fairlight 'Reverb' plugin on an audio clip (AddEffect). Its parameters (bands, threshold, ratio, mix...) must be set in the plugin UI: they are not exposed to scripting.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `effect` | string | no | `"Reverb"` | Installed audio effect name (see effect_list mediaType audio) |

### `audio_set_delay`

Insert the Fairlight 'Delay' plugin on an audio clip (AddEffect). Its parameters (bands, threshold, ratio, mix...) must be set in the plugin UI: they are not exposed to scripting.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `effect` | string | no | `"Delay"` | Installed audio effect name (see effect_list mediaType audio) |

### `audio_noise_reduction`

Insert the Fairlight 'Noise Reduction' plugin on an audio clip (AddEffect). Its parameters (bands, threshold, ratio, mix...) must be set in the plugin UI: they are not exposed to scripting.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `effect` | string | no | `"Noise Reduction"` | Installed audio effect name (see effect_list mediaType audio) |

### `audio_voiceover_record` — read-only

Record a voiceover. (Not scriptable: recording is not exposed to scripting.)

*Implementation:* Not scriptable (returns `unsupported` with an alternative)

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |

### `audio_master`

Mastering loudness: normalize audio items to a delivery standard (Timeline.NormalizeAudioLevel, Resolve 21+). Modes include EBU R128, ATSC A/85, Netflix, YouTube, TR-B32, Sample Peak Program, True Peak.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `mode` | string | no | `"YouTube"` |  |
| `targetLoudness` | number | no |  | LKFS/LUFS, e.g. -14 |
| `targetLevel` | number | no |  | dBFS for peak modes |
| `trackIndex` | number | no |  |  |
| `items` | array | no |  |  |

### `audio_normalize_modes` — read-only

Loudness normalization modes this Resolve supports.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |

### `audio_fairlight_presets` — read-only

List Fairlight presets.

*Implementation:* Resolve scripting API

_No parameters._

### `audio_apply_fairlight_preset`

Apply a saved Fairlight preset (bus/track setup) to the current timeline.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `preset` | string | yes |  |  |

### `audio_dialogue_cleanup`

Dialogue cleanup on an audio clip: Voice Isolation (amount 0-100) plus the Dialogue Leveler via item properties (Resolve 21+). Falls back to track-level Voice Isolation when itemIndex is omitted.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `amount` | number | no | `60` |  |
| `leveler` | boolean | no | `true` |  |
| `wholeTrack` | boolean | no | `false` |  |

### `audio_sync`

Sync separately recorded audio to video clips (waveform or timecode) via MediaPool.AutoSyncAudio.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clips` | array | yes |  |  |
| `mode` | enum (waveform \| timecode) | no | `"waveform"` |  |
| `retainEmbeddedAudio` | boolean | no |  |  |

### `audio_mix`

Balance a mix by setting per-item volume (dB) for several audio items in one call (e.g. dialogue 0 dB, music -18 dB). Each change is verified; unsupported properties are reported.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `levels` | array | yes |  |  |

### `audio_analyze`

Loudness analysis. With a timeline item: Resolve's AnalyzeAudioLevels (integrated LUFS + true peak, Resolve 21+). With a file path: FFmpeg EBU R128 (LUFS, LRA, true peak) plus silence ranges.

*Implementation:* Resolve API + FFmpeg/files

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `path` | string | no |  | Absolute local file path |
| `standard` | string | no | `"EBU R128"` |  |
| `silenceThresholdDb` | number | no | `-35` |  |
| `minSilenceSec` | number | no | `0.6` |  |
| `targetLufs` | number | no | `-14` |  |

### `audio_get_properties` — read-only

Read an audio item's properties as Resolve reports them.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | literal | no | `"audio"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |

### `audio_insert_at_playhead`

Insert an audio file on the current Fairlight track at the playhead (Project.InsertAudioToCurrentTrackAtPlayhead; offsets in samples).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `path` | string | yes |  | Absolute local file path |
| `startOffset` | number | no | `0` |  |
| `duration` | number | no | `0` |  |

## ai

### `ai_analyze_footage` — read-only

Analyze clips: Resolve clip properties plus (with FFmpeg) codec, bitrate, audio layout and loudness; flags offline media, low resolution, short takes. Returns a per-clip report.

*Implementation:* Server-side planner / workflow

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clips` | array | no |  | Clip ids/names (default: all clips) |
| `bin` | string | no |  |  |
| `deep` | boolean | no | `false` | Also run ffprobe/loudness on source files (slower) |
| `limit` | number | no | `100` |  |

### `ai_detect_scenes`

Detect scene cuts. source 'timeline' runs Resolve's DetectSceneCuts on the current timeline (adds cuts); source 'file' runs FFmpeg scene detection on a clip's source file and returns cut times (no changes).

*Implementation:* Resolve API + FFmpeg/files

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `source` | enum (file \| timeline) | no | `"file"` |  |
| `clip` | string | no |  | Media pool clip id, exact clip name, or file path |
| `threshold` | number | no | `0.35` |  |
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |

### `ai_detect_speakers` — read-only

Identify speakers in dialogue. (Not scriptable: Resolve's speaker detection is not scriptable and no diarization provider adapter is configured.)

*Implementation:* Not scriptable (returns `unsupported` with an alternative)

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clip` | string | no |  | Media pool clip id, exact clip name, or file path |

### `ai_detect_objects`

Prepare clips for object/face search: runs IntelliSearch analysis (MediaPoolItem.AnalyzeForIntellisearch, Resolve Studio 21+). Searching the analysis by phrase (e.g. 'person in a red shirt') happens in the Media page search bar: the query itself is not scriptable.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clips` | array | yes |  |  |
| `identifyFaces` | boolean | no | `false` |  |
| `better` | boolean | no | `false` |  |

### `ai_search_media` — read-only

Natural-language-ish media search: matches every word against clip names, file paths, metadata and saved transcripts (from ai_transcribe_audio). Ranked by hits.

*Implementation:* Server-side planner / workflow

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string | yes |  |  |
| `limit` | number | no | `25` |  |

### `ai_transcribe_audio`

Transcribe a clip. engine 'resolve' uses Resolve's built-in transcription (Studio). engine 'provider' sends the source file to the configured AI provider and saves transcript JSON + SRT under output/transcripts.

*Implementation:* Optional external provider

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |
| `engine` | enum (resolve \| provider) | no | `"resolve"` |  |
| `language` | string | no |  |  |

### `ai_generate_subtitles`

Generate timeline subtitles (Resolve Studio auto-captions). For provider-based captions use subtitle_generate with engine 'provider'.

*Implementation:* Server-side planner / workflow

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `language` | string | no |  |  |
| `charsPerLine` | number | no |  |  |
| `lines` | union | no |  |  |

### `ai_generate_voiceover`

Generate a voiceover. engine 'resolve' (default) uses Resolve's AI Speech Generator (Project.GenerateSpeech, Studio 21+ with the Extra installed; max 350 characters, voices like 'Female 1', 'Male 1'). engine 'provider' uses the configured TTS provider, imports the WAV into 'Voiceover' and can place it.

*Implementation:* Optional external provider

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `text` | string | yes |  |  |
| `engine` | enum (resolve \| provider) | no | `"resolve"` |  |
| `voice` | string | no |  |  |
| `speed` | number | no |  |  |
| `pitch` | number | no |  |  |
| `fileName` | string | no | `"voiceover"` |  |
| `place` | boolean | no | `false` |  |
| `trackIndex` | number | no | `0` | 0 = new track (resolve engine) |
| `recordFrame` | number | no |  |  |
| `timecode` | string | no |  |  |

### `ai_create_editing_plan` — read-only

Build a reviewable edit plan (ordered segments with source ranges, titles, music, look, export) from the media pool. Makes no changes; review then apply with ai_create_rough_cut { plan }.

*Implementation:* Server-side planner / workflow

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clips` | array | no |  | Clip ids/names (default: all clips) |
| `bin` | string | no |  |  |
| `goal` | string | yes |  | What to make, e.g. '60-second YouTube ad for a coffee brand' |
| `targetSeconds` | number | no | `60` |  |
| `shotSeconds` | number | no | `4` |  |
| `keywords` | array | no |  |  |
| `musicClip` | string | no |  | Media pool clip id, exact clip name, or file path |
| `title` | string | no |  |  |
| `look` | string | no |  |  |
| `exportPreset` | string | no |  |  |
| `fps` | number | no |  | Default: project timeline frame rate |

### `ai_find_best_clips` — read-only

Rank clips by usefulness (resolution, length, Good Take / rating metadata, naming, keyword matches) with reasons.

*Implementation:* Server-side planner / workflow

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clips` | array | no |  | Clip ids/names (default: all clips) |
| `bin` | string | no |  |  |
| `keywords` | array | no |  |  |
| `top` | number | no | `20` |  |
| `minSeconds` | number | no | `2` |  |

### `ai_create_rough_cut`

Create a NEW timeline from an edit plan (from ai_create_editing_plan) or build a plan on the fly. Existing timelines are never modified. apply: false returns only the plan.

*Implementation:* Server-side planner / workflow

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clips` | array | no |  | Clip ids/names (default: all clips) |
| `bin` | string | no |  |  |
| `goal` | string | no | `"Rough cut"` |  |
| `targetSeconds` | number | no | `60` |  |
| `shotSeconds` | number | no | `4` |  |
| `keywords` | array | no |  |  |
| `musicClip` | string | no |  | Media pool clip id, exact clip name, or file path |
| `title` | string | no |  |  |
| `look` | string | no |  |  |
| `exportPreset` | string | no |  |  |
| `fps` | number | no |  | Default: project timeline frame rate |
| `plan` | object | no |  |  |
| `timelineName` | string | no | `"AI Rough Cut"` |  |
| `apply` | boolean | no | `true` |  |

### `ai_create_highlights`

Highlight reel: picks the best clips (optionally around FFmpeg-detected scene changes) into short punchy segments on a NEW timeline.

*Implementation:* Server-side planner / workflow

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clips` | array | no |  | Clip ids/names (default: all clips) |
| `bin` | string | no |  |  |
| `targetSeconds` | number | no | `30` |  |
| `shotSeconds` | number | no | `2` |  |
| `keywords` | array | no |  |  |
| `timelineName` | string | no | `"AI Highlights"` |  |
| `apply` | boolean | no | `true` |  |

### `ai_create_social_video`

Social cut: plan + NEW timeline at the platform aspect ratio (9:16, 1:1, 4:5, 16:9). Optionally runs Smart Reframe (Studio) on placed items.

*Implementation:* Server-side planner / workflow

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clips` | array | no |  | Clip ids/names (default: all clips) |
| `bin` | string | no |  |  |
| `aspect` | enum (9:16 \| 1:1 \| 4:5 \| 16:9) | no | `"9:16"` |  |
| `targetSeconds` | number | no | `30` |  |
| `shotSeconds` | number | no | `2.5` |  |
| `keywords` | array | no |  |  |
| `title` | string | no |  |  |
| `timelineName` | string | no | `"AI Social"` |  |
| `smartReframe` | boolean | no | `false` |  |
| `apply` | boolean | no | `true` |  |

### `ai_suggest_transitions` — read-only

Suggest transitions for the current timeline's cut points by style (documentary, social, cinematic...). Suggestions only: transitions are not scriptable.

*Implementation:* Server-side planner / workflow

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `style` | string | no | `"cinematic"` |  |

### `ai_suggest_color_grade` — read-only

Recommend a look preset from the current frame's statistics (FFmpeg) and/or a genre. Apply with color_apply_look.

*Implementation:* Server-side planner / workflow

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `genre` | string | no |  |  |
| `useCurrentFrame` | boolean | no | `true` |  |

### `ai_analyze_audio` — read-only

Loudness (LUFS / true peak / LRA) and silence analysis of a clip's source audio. Requires FFmpeg.

*Implementation:* Resolve API + FFmpeg/files

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `clip` | string | yes |  | Media pool clip id, exact clip name, or file path |
| `targetLufs` | number | no | `-14` |  |

### `ai_generate_shot_list` — read-only

Shot list of the current timeline (or media pool): shot number, clip, in/out timecode, duration, markers/notes. Returned as rows (and CSV text).

*Implementation:* Server-side planner / workflow

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `source` | enum (timeline \| media) | no | `"timeline"` |  |

### `ai_remove_silence`

Remove silent gaps from a timeline item (dialogue): FFmpeg finds silences in the source range, the item (and its linked audio) is replaced by the kept ranges placed back-to-back. Run with apply: false first to review the cut list.

*Implementation:* Resolve API + FFmpeg/files

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `itemId` | string | no |  | Timeline item unique id (from timeline_get_clips) |
| `trackType` | enum (video \| audio \| subtitle) | no | `"video"` |  |
| `trackIndex` | number | no | `1` |  |
| `itemIndex` | number | no | `1` | 1-based position of the clip on the track (transitions are not counted) |
| `thresholdDb` | number | no | `-35` |  |
| `minSilenceSec` | number | no | `0.6` |  |
| `padSec` | number | no | `0.15` |  |
| `apply` | boolean | no | `false` |  |
| `confirm` | boolean | no |  | Required (true) with apply: true, after the user reviewed the cut list |

## photo

### `photo_check_support` — read-only

Detect Photo page scripting support (Photo Album API, Resolve 21+) and list albums.

*Implementation:* Resolve scripting API

_No parameters._

### `photo_import`

Import photographs (JPEG/PNG/TIFF/HEIC/RAW...) into the media pool and add them to a photo album (created if missing).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `paths` | array | yes |  |  |
| `album` | string | no | `"Photos"` |  |

### `photo_list_albums` — read-only

List photo albums with photo counts.

*Implementation:* Resolve scripting API

_No parameters._

### `photo_list` — read-only

List photos in an album (name, id, rating).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `album` | string | no |  |  |

### `photo_get_info` — read-only

A photo's properties (transform, crop, looks), rating, source file and resolution.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `album` | string | no |  | Album name or id (default: current album) |
| `photo` | union | yes |  | Photo name, id or 1-based index in the album |

### `photo_edit`

Set any documented PhotoAlbumItem properties at once (Pan, Tilt, ZoomX/Y, RotationAngle, FlipX/Y, CropLeft/Right/Top/Bottom, CropRatio, Source* section toggles...). All keys are validated by Resolve together.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `album` | string | no |  | Album name or id (default: current album) |
| `photo` | union | yes |  | Photo name, id or 1-based index in the album |
| `properties` | record | yes |  |  |

### `photo_crop`

Crop / reframe a photo (pixels from each edge, optional zoom and rotation).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `album` | string | no |  | Album name or id (default: current album) |
| `photo` | union | yes |  | Photo name, id or 1-based index in the album |
| `left` | number | no | `0` |  |
| `right` | number | no | `0` |  |
| `top` | number | no | `0` |  |
| `bottom` | number | no | `0` |  |
| `lockAspect` | boolean | no | `false` | Keep Resolve's crop aspect lock (it rejects crops that change the aspect when on) |
| `zoom` | number | no |  |  |
| `rotation` | number | no |  |  |

### `photo_adjust_exposure`

Exposure (stops) on a photo: generated 3D LUT applied to node 1 (the primaries wheels are not scriptable).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `album` | string | no |  | Album name or id (default: current album) |
| `photo` | union | yes |  | Photo name, id or 1-based index in the album |
| `value` | number | yes |  |  |

### `photo_adjust_contrast`

Contrast (1 = neutral) on a photo: generated 3D LUT applied to node 1 (the primaries wheels are not scriptable).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `album` | string | no |  | Album name or id (default: current album) |
| `photo` | union | yes |  | Photo name, id or 1-based index in the album |
| `value` | number | yes |  |  |

### `photo_adjust_saturation`

Saturation (1 = neutral) on a photo: generated 3D LUT applied to node 1 (the primaries wheels are not scriptable).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `album` | string | no |  | Album name or id (default: current album) |
| `photo` | union | yes |  | Photo name, id or 1-based index in the album |
| `value` | number | yes |  |  |

### `photo_adjust_white_balance`

White balance temperature (-1 cool .. +1 warm) on a photo: generated 3D LUT applied to node 1 (the primaries wheels are not scriptable).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `album` | string | no |  | Album name or id (default: current album) |
| `photo` | union | yes |  | Photo name, id or 1-based index in the album |
| `value` | number | yes |  |  |

### `photo_set_cdl`

Primary correction on a photo via ASC CDL (slope/offset/power/saturation). A grade version is saved first.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `album` | string | no |  | Album name or id (default: current album) |
| `photo` | union | yes |  | Photo name, id or 1-based index in the album |
| `nodeIndex` | number | no | `1` |  |
| `slope` | tuple | no | `[1,1,1]` |  |
| `offset` | tuple | no | `[0,0,0]` |  |
| `power` | tuple | no | `[1,1,1]` |  |
| `saturation` | number | no | `1` |  |

### `photo_apply_lut`

Apply a LUT file to a photo (staged into Resolve's LUT folder).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `album` | string | no |  | Album name or id (default: current album) |
| `photo` | union | yes |  | Photo name, id or 1-based index in the album |
| `lutPath` | string | yes |  | Absolute local file path |
| `nodeIndex` | number | no | `1` |  |

### `photo_apply_effect`

Apply an installed photo effect (Resolve.GetEffectsList('photo')) to a photo.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `album` | string | no |  | Album name or id (default: current album) |
| `photo` | union | yes |  | Photo name, id or 1-based index in the album |
| `effect` | string | yes |  |  |

### `photo_apply_grade`

Apply a cinematic look preset to a photo (generated LUT), or Resolve's Auto Color with preset 'auto'.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `album` | string | no |  | Album name or id (default: current album) |
| `photo` | union | yes |  | Photo name, id or 1-based index in the album |
| `preset` | enum (auto \| hollywood_cinematic \| teal_orange \| filmic_warm \| vintage_film \| black_and_white \| moody_cinematic \| bright_commercial \| natural_documentary \| desaturated_cinematic \| night_cinematic) | yes |  |  |

### `photo_set_rating`

Star-rate a photo (0-5).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `album` | string | no |  | Album name or id (default: current album) |
| `photo` | union | yes |  | Photo name, id or 1-based index in the album |
| `rating` | number | yes |  |  |

### `photo_export`

Export photos (all in the album, or selected) as finished images with PhotoAlbumItem.ExportFrame (jpg/png/tif), optional max dimension and JPEG quality. Never overwrites without overwrite: true.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `album` | string | no |  |  |
| `photos` | array | no |  |  |
| `outputDir` | string | yes |  | Absolute local file path |
| `format` | enum (jpg \| png \| tif) | no | `"jpg"` |  |
| `prefix` | string | no | `""` |  |
| `maxDimension` | number | no |  |  |
| `quality` | number | no |  |  |
| `overwrite` | boolean | no | `false` |  |

### `photo_from_media_pool`

Create (or add to) a photo album from still images already in the media pool.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `album` | string | yes |  |  |
| `photos` | array | yes |  |  |

## rendering

### `render_get_settings` — read-only

Current render format/codec, render mode, saved render presets and (for the current codec) supported resolutions.

*Implementation:* Resolve scripting API

_No parameters._

### `render_list_formats` — read-only

Render formats (and optionally codecs per format) this Resolve supports.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `withCodecs` | boolean | no | `false` |  |

### `render_list_presets` — read-only

Built-in MCP export presets (YouTube, TikTok, Reels, Stories, Feed, Facebook, Master, Archive, sequences, audio).

*Implementation:* Resolve scripting API

_No parameters._

### `render_set_settings`

Set render format/codec (validated) and/or raw render settings (TargetDir, CustomName, FormatWidth/Height, FrameRate, VideoQuality, ExportAudio/Video, MarkIn/Out, AudioCodec, AudioBitDepth, AudioSampleRate, ...). Or load a saved Resolve render preset.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `format` | string | no |  |  |
| `codec` | string | no |  |  |
| `settings` | record | no |  |  |
| `resolvePreset` | string | no |  |  |
| `mode` | enum (individual \| single) | no |  |  |

### `render_add_job`

Configure a render from an export preset (format/codec validated) and add it to the render queue without starting.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `preset` | enum (youtube_1080p \| youtube_4k \| tiktok \| instagram_reels \| instagram_stories \| instagram_feed \| facebook \| professional_master \| archive \| png_sequence \| tiff_sequence \| exr_sequence \| audio_wav \| custom) | no | `"youtube_1080p"` |  |
| `outputDir` | string | yes |  | Absolute local file path |
| `fileName` | string | yes |  | File name without extension |
| `format` | string | no |  | Override render format (e.g. mp4, mov) — see render_get_settings |
| `codec` | string | no |  | Override codec (validated against GetRenderCodecs) |
| `width` | number | no |  |  |
| `height` | number | no |  |  |
| `frameRate` | string | no |  |  |
| `quality` | union | no |  | VideoQuality: 0 = auto, or bitrate in Kb/s, or Least/Low/Medium/High/Best |
| `markIn` | number | no |  |  |
| `markOut` | number | no |  |  |
| `exportAudio` | boolean | no |  |  |
| `exportVideo` | boolean | no |  |  |
| `overwrite` | boolean | no | `false` |  |

### `render_start`

Start rendering queued jobs (all, or the given ids). Returns immediately; poll render_get_status.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `jobIds` | array | no |  |  |
| `interactive` | boolean | no | `false` |  |
| `background` | boolean | no |  | Run in the background: returns a jobId immediately; collect the result with wait_for_job / get_job. |

### `render_pause` — read-only

Pause rendering. (Not scriptable: the scripting API can only start or stop rendering.)

*Implementation:* Not scriptable (returns `unsupported` with an alternative)

_No parameters._

### `render_cancel` — destructive

Stop the render in progress (partial output may remain on disk). DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `render_get_status` — read-only

Status of one render job (JobStatus, CompletionPercentage, time taken) or whether any render is in progress.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `jobId` | string | no |  |  |

### `render_get_queue` — read-only

All render jobs with their status.

*Implementation:* Resolve scripting API

_No parameters._

### `render_remove_job` — destructive

Remove a job from the render queue (all: true clears the queue). Rendered files are not deleted. DESTRUCTIVE: requires confirm: true after explicit user confirmation.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `jobId` | string | no |  |  |
| `all` | boolean | no | `false` |  |
| `confirm` | boolean | no |  | Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do. |

### `render_export_timeline`

One-step export: configure from a preset, queue, render, wait (with progress notifications), then verify the output file (exists, size, ffprobe metadata). Never reports success without a verified file.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `preset` | enum (youtube_1080p \| youtube_4k \| tiktok \| instagram_reels \| instagram_stories \| instagram_feed \| facebook \| professional_master \| archive \| png_sequence \| tiff_sequence \| exr_sequence \| audio_wav \| custom) | no | `"youtube_1080p"` |  |
| `outputDir` | string | yes |  | Absolute local file path |
| `fileName` | string | yes |  | File name without extension |
| `format` | string | no |  | Override render format (e.g. mp4, mov) — see render_get_settings |
| `codec` | string | no |  | Override codec (validated against GetRenderCodecs) |
| `width` | number | no |  |  |
| `height` | number | no |  |  |
| `frameRate` | string | no |  |  |
| `quality` | union | no |  | VideoQuality: 0 = auto, or bitrate in Kb/s, or Least/Low/Medium/High/Best |
| `markIn` | number | no |  |  |
| `markOut` | number | no |  |  |
| `exportAudio` | boolean | no |  |  |
| `exportVideo` | boolean | no |  |  |
| `overwrite` | boolean | no | `false` |  |
| `wait` | boolean | no | `true` |  |
| `background` | boolean | no |  | Run in the background: returns a jobId immediately; collect the result with wait_for_job / get_job. |

### `render_export_clip`

Export just one timeline item's range (mark in/out set to the item) with a preset.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeline` | string | no |  | Timeline name or id (default: current timeline) |
| `preset` | enum (youtube_1080p \| youtube_4k \| tiktok \| instagram_reels \| instagram_stories \| instagram_feed \| facebook \| professional_master \| archive \| png_sequence \| tiff_sequence \| exr_sequence \| audio_wav \| custom) | no | `"youtube_1080p"` |  |
| `outputDir` | string | yes |  | Absolute local file path |
| `fileName` | string | yes |  | File name without extension |
| `format` | string | no |  | Override render format (e.g. mp4, mov) — see render_get_settings |
| `codec` | string | no |  | Override codec (validated against GetRenderCodecs) |
| `width` | number | no |  |  |
| `height` | number | no |  |  |
| `frameRate` | string | no |  |  |
| `quality` | union | no |  | VideoQuality: 0 = auto, or bitrate in Kb/s, or Least/Low/Medium/High/Best |
| `markIn` | number | no |  |  |
| `markOut` | number | no |  |  |
| `exportAudio` | boolean | no |  |  |
| `exportVideo` | boolean | no |  |  |
| `overwrite` | boolean | no | `false` |  |
| `itemId` | string | yes |  | Timeline item id from timeline_get_clips |
| `wait` | boolean | no | `true` |  |
| `background` | boolean | no |  | Run in the background: returns a jobId immediately; collect the result with wait_for_job / get_job. |

### `render_export_batch`

Queue several exports (e.g. YouTube 4K + TikTok + Instagram) of the same or different timelines, render them all, and verify each output.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `jobs` | array | yes |  |  |
| `wait` | boolean | no | `true` |  |
| `background` | boolean | no |  | Run in the background: returns a jobId immediately; collect the result with wait_for_job / get_job. |

### `render_verify_output` — read-only

Verify a rendered file: exists, non-empty, readable by ffprobe, optional expected width/height/min duration.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `path` | string | yes |  | Absolute local file path |
| `width` | number | no |  |  |
| `height` | number | no |  |  |
| `minDurationSec` | number | no |  |  |

### `render_save_preset`

Save the current render settings as a named Resolve render preset.

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | yes |  |  |

### `render_import_preset`

Import a Resolve render preset file (.xml).

*Implementation:* Resolve scripting API

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `path` | string | yes |  | Absolute local file path |

## workflows

### `workflow_create_youtube_video`

YouTube production: project (1080p/4K), import + organize footage, analyze, rough cut from best clips, B-roll interleave, intro title + lower third, optional subtitles, grade, background music, render YouTube preset and verify. Reports every step; fails if a required step fails.

*Implementation:* Server-side planner / workflow

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `projectName` | string | no |  | Create this new project. Omit to work in the currently open project. |
| `footageFolder` | string | no |  | Folder of footage to import |
| `footage` | array | no |  | Individual files to import |
| `musicFile` | string | no |  | Absolute local file path |
| `title` | string | no |  |  |
| `targetSeconds` | number | no | `60` |  |
| `look` | enum (hollywood_cinematic \| teal_orange \| filmic_warm \| vintage_film \| black_and_white \| moody_cinematic \| bright_commercial \| natural_documentary \| desaturated_cinematic \| night_cinematic) | no |  |  |
| `render` | boolean | no | `false` | Render at the end (writes a new file; never overwrites). |
| `exportPreset` | enum (youtube_1080p \| youtube_4k \| tiktok \| instagram_reels \| instagram_stories \| instagram_feed \| facebook \| professional_master \| archive \| png_sequence \| tiff_sequence \| exr_sequence \| audio_wav \| custom) | no |  |  |
| `outputDir` | string | no |  | Render destination (default: OUTPUT_DIR/renders) |
| `generateSubtitles` | boolean | no | `false` |  |
| `dryRun` | boolean | no | `false` | Only list the steps that would run |
| `resolution` | enum (1080p \| 4k) | no | `"1080p"` |  |
| `frameRate` | enum (23.976 \| 24 \| 25 \| 29.97 \| 30 \| 50 \| 59.94 \| 60) | no | `"24"` |  |
| `lowerThird` | string | no |  |  |
| `musicLevelDb` | number | no | `-18` |  |
| `background` | boolean | no |  | Run in the background: returns a jobId immediately; collect the result with wait_for_job / get_job. |

### `workflow_create_advertisement`

Cinematic commercial: import product footage, analyze, pick best shots (product keywords), fast-paced commercial timeline, animated intro title + end-card tagline, Fusion glow on the hero shot, cinematic grade (teal & orange default), music, render and verify.

*Implementation:* Server-side planner / workflow

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `projectName` | string | no |  | Create this new project. Omit to work in the currently open project. |
| `footageFolder` | string | no |  | Folder of footage to import |
| `footage` | array | no |  | Individual files to import |
| `musicFile` | string | no |  | Absolute local file path |
| `title` | string | no |  |  |
| `targetSeconds` | number | no | `30` |  |
| `look` | enum (hollywood_cinematic \| teal_orange \| filmic_warm \| vintage_film \| black_and_white \| moody_cinematic \| bright_commercial \| natural_documentary \| desaturated_cinematic \| night_cinematic) | no |  |  |
| `render` | boolean | no | `false` | Render at the end (writes a new file; never overwrites). |
| `exportPreset` | enum (youtube_1080p \| youtube_4k \| tiktok \| instagram_reels \| instagram_stories \| instagram_feed \| facebook \| professional_master \| archive \| png_sequence \| tiff_sequence \| exr_sequence \| audio_wav \| custom) | no |  |  |
| `outputDir` | string | no |  | Render destination (default: OUTPUT_DIR/renders) |
| `generateSubtitles` | boolean | no | `false` |  |
| `dryRun` | boolean | no | `false` | Only list the steps that would run |
| `brand` | string | no |  |  |
| `tagline` | string | no |  |  |
| `keywords` | array | no | `["product","hero","logo"]` |  |
| `background` | boolean | no |  | Run in the background: returns a jobId immediately; collect the result with wait_for_job / get_job. |

### `workflow_create_social_content`

Social video: configures aspect ratio and export for the platform (tiktok, reels, shorts, stories, instagram_feed, square, facebook, horizontal, social_ad), builds a punchy cut, big captions-style title, optional auto subtitles and Smart Reframe, grade, render and verify.

*Implementation:* Server-side planner / workflow

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `projectName` | string | no |  | Create this new project. Omit to work in the currently open project. |
| `footageFolder` | string | no |  | Folder of footage to import |
| `footage` | array | no |  | Individual files to import |
| `musicFile` | string | no |  | Absolute local file path |
| `title` | string | no |  |  |
| `targetSeconds` | number | no | `30` |  |
| `look` | enum (hollywood_cinematic \| teal_orange \| filmic_warm \| vintage_film \| black_and_white \| moody_cinematic \| bright_commercial \| natural_documentary \| desaturated_cinematic \| night_cinematic) | no |  |  |
| `render` | boolean | no | `false` | Render at the end (writes a new file; never overwrites). |
| `exportPreset` | enum (youtube_1080p \| youtube_4k \| tiktok \| instagram_reels \| instagram_stories \| instagram_feed \| facebook \| professional_master \| archive \| png_sequence \| tiff_sequence \| exr_sequence \| audio_wav \| custom) | no |  |  |
| `outputDir` | string | no |  | Render destination (default: OUTPUT_DIR/renders) |
| `generateSubtitles` | boolean | no | `false` |  |
| `dryRun` | boolean | no | `false` | Only list the steps that would run |
| `platform` | enum (tiktok \| reels \| shorts \| stories \| instagram_feed \| square \| facebook \| horizontal \| social_ad) | no | `"tiktok"` |  |
| `smartReframe` | boolean | no | `false` |  |
| `background` | boolean | no |  | Run in the background: returns a jobId immediately; collect the result with wait_for_job / get_job. |

### `workflow_create_documentary`

Documentary: import all footage, organize interviews vs B-roll bins (by name keywords), transcribe interviews (Resolve or provider), assemble interview-led story with B-roll, narration (optional TTS), subtitles, natural grade, music bed, render and verify.

*Implementation:* Server-side planner / workflow

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `projectName` | string | no |  | Create this new project. Omit to work in the currently open project. |
| `footageFolder` | string | no |  | Folder of footage to import |
| `footage` | array | no |  | Individual files to import |
| `musicFile` | string | no |  | Absolute local file path |
| `title` | string | no |  |  |
| `targetSeconds` | number | no | `600` |  |
| `look` | enum (hollywood_cinematic \| teal_orange \| filmic_warm \| vintage_film \| black_and_white \| moody_cinematic \| bright_commercial \| natural_documentary \| desaturated_cinematic \| night_cinematic) | no |  |  |
| `render` | boolean | no | `false` | Render at the end (writes a new file; never overwrites). |
| `exportPreset` | enum (youtube_1080p \| youtube_4k \| tiktok \| instagram_reels \| instagram_stories \| instagram_feed \| facebook \| professional_master \| archive \| png_sequence \| tiff_sequence \| exr_sequence \| audio_wav \| custom) | no |  |  |
| `outputDir` | string | no |  | Render destination (default: OUTPUT_DIR/renders) |
| `generateSubtitles` | boolean | no | `false` |  |
| `dryRun` | boolean | no | `false` | Only list the steps that would run |
| `interviewKeywords` | array | no | `["interview","int_","talking","a-cam"]` |  |
| `transcribe` | enum (none \| resolve \| provider) | no | `"none"` |  |
| `narration` | string | no |  |  |
| `background` | boolean | no |  | Run in the background: returns a jobId immediately; collect the result with wait_for_job / get_job. |

### `workflow_create_cinematic_video`

Complete cinematic production across pages: 4K DCI-flat or UHD project, edit (rough cut), Fusion (animated 3D title or Text+ intro, film grain), Color (cinematic look), Fairlight (music bed level), Deliver (master + optional web version) with verification.

*Implementation:* Server-side planner / workflow

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `projectName` | string | no |  | Create this new project. Omit to work in the currently open project. |
| `footageFolder` | string | no |  | Folder of footage to import |
| `footage` | array | no |  | Individual files to import |
| `musicFile` | string | no |  | Absolute local file path |
| `title` | string | no |  |  |
| `targetSeconds` | number | no | `60` |  |
| `look` | enum (hollywood_cinematic \| teal_orange \| filmic_warm \| vintage_film \| black_and_white \| moody_cinematic \| bright_commercial \| natural_documentary \| desaturated_cinematic \| night_cinematic) | no |  |  |
| `render` | boolean | no | `false` | Render at the end (writes a new file; never overwrites). |
| `exportPreset` | enum (youtube_1080p \| youtube_4k \| tiktok \| instagram_reels \| instagram_stories \| instagram_feed \| facebook \| professional_master \| archive \| png_sequence \| tiff_sequence \| exr_sequence \| audio_wav \| custom) | no |  |  |
| `outputDir` | string | no |  | Render destination (default: OUTPUT_DIR/renders) |
| `generateSubtitles` | boolean | no | `false` |  |
| `dryRun` | boolean | no | `false` | Only list the steps that would run |
| `resolution` | enum (uhd \| dci4k \| 1080p) | no | `"uhd"` |  |
| `letterbox` | boolean | no | `true` |  |
| `title3d` | boolean | no | `false` |  |
| `filmGrain` | boolean | no | `true` |  |
| `webVersion` | boolean | no | `false` |  |
| `background` | boolean | no |  | Run in the background: returns a jobId immediately; collect the result with wait_for_job / get_job. |

## Examples

```json
{ "name": "project_create", "arguments": { "name": "Cinematic 4K", "width": 3840, "height": 2160, "frameRate": "24" } }
{ "name": "media_import_folder", "arguments": { "path": "D:\\Footage", "organizeByType": true } }
{ "name": "clip_trim", "arguments": { "itemId": "…", "trimEnd": 24 } }
{ "name": "transition_add", "arguments": { "trackIndex": 1, "itemIndex": 1, "type": "Cross Dissolve", "position": "end", "duration": 12 } }
{ "name": "color_apply_look", "arguments": { "preset": "teal_orange", "wholeTrack": true } }
{ "name": "render_export_timeline", "arguments": { "preset": "youtube_4k", "outputDir": "C:\\Users\\me\\Videos", "fileName": "final" } }
```
