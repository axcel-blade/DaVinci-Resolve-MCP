# Natural-language workflows

How an assistant turns requests into tool calls. It always starts with `resolve_get_status` and inspects state before acting.

## "Create a new 4K cinematic project."

1. `resolve_get_status`
2. `project_create { name: "Cinematic 4K", width: 3840, height: 2160, frameRate: "24" }` — each setting read back

## "Import all videos from D:\Footage."

1. `media_import_folder { path: "D:\\Footage", types: ["video"], organizeByType: true }`
2. `media_find_duplicates` (optional) and `ai_analyze_footage` for a report

## "Find all clips containing a person wearing a red shirt."

1. `ai_detect_objects { clips: [...] }` — runs IntelliSearch analysis (Studio 21+)
2. Tell the user to type the phrase in the Media page search (the query is UI-only), and/or `ai_search_media { query: "red shirt" }` over names, metadata and transcripts

## "Create a 60-second YouTube advertisement."

1. `workflow_create_advertisement { targetSeconds: 60, brand: "...", dryRun: true }` → show the steps
2. Same with `dryRun: false`, `render: true` after approval → report with steps completed/failed, files, verified render

## "Remove unwanted silence from the dialogue."

1. `timeline_get_clips { trackType: "video" }` → choose the interview item
2. `ai_remove_silence { itemId, apply: false }` → cut list for review
3. After approval: `ai_remove_silence { itemId, apply: true, confirm: true }`, then `timeline_delete_gaps { confirm: true }` to close the gaps

## "Add animated subtitles."

1. `subtitle_generate` (Resolve Studio) — or `subtitle_generate { engine: "provider", audioPath }`
2. For burned-in animated captions: `title_create { text, style: <subtitle_social preset>, animation: { type: "slide_up" } }` per line

## "Apply a cinematic teal and orange grade."

1. `color_apply_look { preset: "teal_orange", wholeTrack: true }` — a new grade version is saved first per clip
2. Revert any clip with `color_version_load { name: <previousVersion> }`

## "Create a professional animated logo in Fusion."

1. `fusion_insert_composition`
2. `fusion_create_background { color: "#0b0b12", connectToOutput: false }`
3. `fusion_create_3d_text { itemId, text: "NOVA" }`
4. `fusion_create_animation { itemId, node: "MCP3D_Text", preset: "spin", frames: 48, inputOverride: "Transform3DOp.Rotate.Y" }`
5. `fusion_get_nodes` to verify

## "Add background music and balance the dialogue."

1. `audio_import { paths: ["D:\\Music\\bed.wav"] }`, `audio_add_track { name: "Music" }`, `audio_place_clip`
2. `audio_set_volume { itemId: <music>, volumeDb: -18 }`
3. `audio_dialogue_cleanup { itemId: <dialogue> }`
4. `audio_master { mode: "YouTube" }`, `audio_analyze { itemId }` to confirm loudness

## "Export the finished video in 4K."

1. `render_export_timeline { preset: "youtube_4k", outputDir: "C:\\Users\\me\\Videos", fileName: "final" }`
2. The result includes job status and `output` verification (exists, size, resolution, duration)

## Social versions in one go

`render_export_batch { jobs: [ {preset:"youtube_4k",...}, {preset:"tiktok",...}, {preset:"instagram_feed",...} ] }` — for vertical deliverables build a vertical timeline first (`ai_create_social_video { aspect: "9:16", smartReframe: true }`).
