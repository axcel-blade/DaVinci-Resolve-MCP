/**
 * Every operation resolve-scripts/*.py registers with @op(...). The bridge refuses anything else before
 * DaVinci Resolve is contacted, and the Python worker refuses again: there is deliberately no
 * "run arbitrary Python / Lua" op. tests/unit/bridge.test.ts keeps this list in sync with the Python side.
 */
export const BRIDGE_OPS = [
  // ai
  "ai.all_transcripts", "ai.generate_speech", "ai.intellisearch_analyze", "ai.transcription",
  // app
  "app.capabilities", "app.get_page", "app.info", "app.is_studio", "app.quit", "app.set_page", "app.status",
  "app.system_info", "app.version",
  // audio
  "audio.analyze_levels", "audio.apply_fairlight_preset", "audio.fairlight_presets", "audio.item_voice_isolation",
  "audio.modes", "audio.normalize", "audio.tracks", "audio.try_property", "audio.voice_isolation",
  // color
  "color.apply_drx", "color.assign_group", "color.auto_color", "color.copy_grade", "color.export_frame",
  "color.export_lut", "color.generate_lut", "color.get_cdl", "color.grab_still", "color.groups", "color.magic_mask",
  "color.node_enabled", "color.node_label", "color.nodes", "color.reset", "color.set_cdl", "color.set_lut",
  "color.version_add", "color.version_load", "color.versions",
  // edit
  "edit.add_marker", "edit.append", "edit.copy_attributes", "edit.delete", "edit.delete_gaps", "edit.export_frame",
  "edit.get_properties", "edit.insert_audio_at_playhead", "edit.insert_generator", "edit.link", "edit.move",
  "edit.replace_at", "edit.set_enabled", "edit.set_item_color", "edit.set_properties", "edit.smart_reframe",
  "edit.stabilize", "edit.trim",
  // effect
  "effect.apply", "effect.list_applied", "effect.remove",
  // fusion
  "fusion.build", "fusion.comp_info", "fusion.connect", "fusion.create_node", "fusion.delete_node",
  "fusion.disconnect", "fusion.export_comp", "fusion.expression", "fusion.get_inputs", "fusion.import_comp",
  "fusion.insert_composition", "fusion.item_comps", "fusion.keyframes", "fusion.load_settings", "fusion.nodes",
  "fusion.render", "fusion.save_settings", "fusion.set_inputs",
  // fx
  "fx.add", "fx.delete", "fx.get", "fx.list", "fx.set_enabled",
  // media
  "media.add_marker", "media.auto_sync_audio", "media.bins", "media.create_bin", "media.delete", "media.file_paths",
  "media.import", "media.import_folder", "media.import_sequence", "media.info", "media.link_proxy", "media.list",
  "media.metadata", "media.missing", "media.move_to_bin", "media.relink", "media.rename", "media.replace",
  "media.search", "media.selected", "media.set_color", "media.set_flag", "media.set_mark_in_out",
  "media.set_metadata", "media.storage_volumes", "media.technical", "media.transcribe", "media.unlink_proxy",
  // photo
  "photo.add_effect", "photo.albums", "photo.auto_color", "photo.create_album", "photo.export", "photo.info",
  "photo.list", "photo.set_cdl", "photo.set_lut", "photo.set_properties", "photo.set_rating",
  // project
  "project.close", "project.create", "project.current", "project.delete", "project.export", "project.get_settings",
  "project.import", "project.info", "project.list", "project.open", "project.rename", "project.save",
  "project.set_preset", "project.set_settings", "project.stamp", "project.timelines",
  // render
  "render.add_job", "render.codecs", "render.delete_all_jobs", "render.delete_job", "render.formats",
  "render.get_settings", "render.import_preset", "render.is_rendering", "render.job_status", "render.load_preset",
  "render.pick_codec", "render.queue", "render.save_preset", "render.set_format", "render.set_mode",
  "render.set_settings", "render.start", "render.stop",
  // speed
  "speed.fusion", "speed.get_native", "speed.retime_process", "speed.set_native",
  // subtitle
  "subtitle.create_track", "subtitle.export_srt", "subtitle.generate", "subtitle.get_all", "subtitle.import",
  // timeline
  "timeline.add_marker", "timeline.add_track", "timeline.clips", "timeline.compound", "timeline.create",
  "timeline.delete", "timeline.delete_track", "timeline.detect_scene_cuts", "timeline.duplicate", "timeline.export",
  "timeline.fusion_clip", "timeline.get_settings", "timeline.import", "timeline.info", "timeline.list",
  "timeline.markers", "timeline.open", "timeline.rename", "timeline.set_playhead", "timeline.set_settings",
  "timeline.set_start_timecode", "timeline.set_track", "timeline.tracks",
  // title
  "title.animate", "title.create", "title.get", "title.overlay", "title.style",
  // transition
  "transition.add", "transition.list", "transition.remove",
] as const;

export type BridgeOp = (typeof BRIDGE_OPS)[number];

export const ALLOWED_OPS: ReadonlySet<string> = new Set(BRIDGE_OPS);
