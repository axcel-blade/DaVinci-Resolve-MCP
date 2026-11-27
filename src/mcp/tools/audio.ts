import { z } from "zod";
import { loudness, silences } from "../../utils/media-probe.js";
import { absPath, clipRef, ItemRef, ItemRefSchema, timelineArg, type ToolRegistry, clean, itemRef, run } from "./registry.js";
import { McpToolError } from "../../utils/errors.js";

const AudioItem = { ...ItemRef, trackType: z.literal("audio").default("audio") };
const FAIRLIGHT_ALT = "Use the Fairlight page (Mixer > EQ / Dynamics), Fairlight FX on the track, or Voice Isolation in the Inspector. Save a track preset and reuse it.";

const REPLACE_NOTE = "Re-placement based (see clip_trim/clip_split): item-level audio adjustments are not carried over.";

export function registerAudio(reg: ToolRegistry): void {
  const category = "audio";
  reg.define({
    name: "audio_import", category,
    description: "Import music, sound effects or dialogue files into the media pool (default bin 'Audio').",
    input: { paths: z.array(absPath).min(1).max(1000), bin: z.string().default("Audio") },
    handler: async (a, ctx) => run(ctx, "media.import", { paths: a.paths.map((p) => ctx.paths.read(p, { kind: "file" })), bin: a.bin }, (d) => `Imported ${(d as { imported: number }).imported} audio clip(s).`, 300000),
  });
  reg.define({ name: "audio_add_track", category, description: "Add an audio track (mono, stereo, 5.1, 7.1, adaptive...).", input: { timeline: timelineArg, format: z.string().default("stereo"), name: z.string().optional() }, handler: async (a, ctx) => run(ctx, "timeline.add_track", clean({ timeline: a.timeline, trackType: "audio", audioType: a.format, name: a.name })) });
  reg.define({ name: "audio_remove_track", category, destructive: true, description: "Delete an audio track and its clips.", input: { timeline: timelineArg, trackIndex: z.number().int().min(1) }, handler: async (a, ctx) => run(ctx, "timeline.delete_track", clean({ timeline: a.timeline, trackType: "audio", trackIndex: a.trackIndex })) });
  reg.define({ name: "audio_get_tracks", category, readOnly: true, description: "Audio tracks with format, state and items.", input: { timeline: timelineArg }, handler: async (a, ctx) => run(ctx, "audio.tracks", clean(a)) });
  reg.define({
    name: "audio_place_clip", category,
    description: "Place an audio clip (music, SFX, VO) on an audio track at a record frame, optionally a source range.",
    input: { timeline: timelineArg, clip: clipRef, trackIndex: z.number().int().min(1).default(1), recordFrame: z.number().int().min(0).optional(), sourceStart: z.number().int().min(0).optional(), sourceEnd: z.number().int().min(0).optional() },
    handler: async (a, ctx) => run(ctx, "edit.append", { timeline: a.timeline, clips: [clean({ clip: a.clip, trackIndex: a.trackIndex, recordFrame: a.recordFrame, sourceStart: a.sourceStart, sourceEnd: a.sourceEnd, mediaType: "audio" })] }, "Audio placed."),
  });
  reg.define({ name: "audio_move_clip", category, destructive: true, description: `Move an audio item to another frame/track. ${REPLACE_NOTE}`, input: { ...AudioItem, recordFrame: z.number().int().min(0), toTrack: z.number().int().min(1).optional() }, handler: async (a, ctx) => run(ctx, "edit.replace_at", clean({ ...itemRef(a), action: "move", recordFrame: a.recordFrame, toTrack: a.toTrack })) });
  reg.define({ name: "audio_trim", category, destructive: true, description: `Trim an audio item's head/tail. ${REPLACE_NOTE}`, input: { ...AudioItem, trimStart: z.number().int().min(0).default(0), trimEnd: z.number().int().min(0).default(0) }, handler: async (a, ctx) => run(ctx, "edit.replace_at", { ...itemRef(a), action: "trim", trimStart: a.trimStart, trimEnd: a.trimEnd }) });
  reg.define({ name: "audio_split", category, destructive: true, description: `Split an audio item at a timeline frame. ${REPLACE_NOTE}`, input: { ...AudioItem, frame: z.number().int().min(0) }, handler: async (a, ctx) => run(ctx, "edit.replace_at", { ...itemRef(a), action: "split", frame: a.frame }) });

  const tryProp = (tool: string, desc: string, input: z.ZodRawShape, map: (a: Record<string, unknown>) => Record<string, unknown>) =>
    reg.define({
      name: tool, category,
      description: `${desc} Attempted via TimelineItem.SetProperty and verified by readback; reports 'unsupported' when this Resolve version rejects the property.`,
      input: { ...AudioItem, ...input },
      handler: async (a, ctx) => {
        const r = await ctx.bridge.call<{ unsupported: string[]; note?: string }>("audio.try_property", { ...itemRef(a as never), properties: clean(map(a as Record<string, unknown>)) });
        return { data: r, status: r.unsupported.length ? "unsupported" : "ok", message: r.note ?? "Applied.", warnings: r.unsupported.length ? [FAIRLIGHT_ALT] : [] };
      },
    });
  tryProp("audio_set_volume", "Set clip volume in dB (AudioVolume item property, Resolve 21+).", { volumeDb: z.number().min(-100).max(24) }, (a) => ({ AudioVolume: a.volumeDb }));
  tryProp("audio_set_gain", "Set clip gain in dB (Resolve exposes clip level as AudioVolume).", { gainDb: z.number().min(-100).max(24) }, (a) => ({ AudioVolume: a.gainDb }));
  tryProp("audio_set_pan", "Set clip pan (AudioPan item property).", { pan: z.number().min(-100).max(100) }, (a) => ({ AudioPan: a.pan }));
  tryProp("audio_set_pitch", "Shift clip pitch (AudioPitchSemiTones / AudioPitchCents).", { semitones: z.number().int().min(-24).max(24).default(0), cents: z.number().int().min(-100).max(100).default(0) }, (a) => ({ AudioPitchEnabled: true, AudioPitchSemiTones: a.semitones, AudioPitchCents: a.cents }));
  tryProp("audio_dialogue_leveler", "Enable the Dialogue Leveler on a clip (reduce loud / lift soft dialogue, background reduction).", { enabled: z.boolean().default(true), reduceLoud: z.boolean().default(true), liftSoft: z.boolean().default(true), backgroundReduction: z.boolean().default(false), outputGainDb: z.number().min(-24).max(24).default(0) }, (a) => ({ AudioDialogueLevelerEnabled: a.enabled, AudioDialogueLevelerReduceLoudDialogue: a.reduceLoud, AudioDialogueLevelerLiftSoftDialogue: a.liftSoft, AudioDialogueLevelerBackgroundReduction: a.backgroundReduction, AudioDialogueLevelerOutputGain: a.outputGainDb }));
  reg.unsupported("audio_set_fade", category, "Set audio fade in/out handles.", "clip fade handles are not exposed to scripting.", "Add an audio transition instead: transition_add { trackType: 'audio', category: 'audio', type: 'Cross Fade 0 dB', position: 'start' | 'end' }.", { ...AudioItem });
  const FX: Record<string, string> = { audio_set_eq: "Fairlight EQ", audio_set_compressor: "Dynamics", audio_set_limiter: "Limiter", audio_set_reverb: "Reverb", audio_set_delay: "Delay", audio_noise_reduction: "Noise Reduction" };
  reg.define({
    name: "audio_add_effect", category,
    description: "Add a Fairlight FX / audio plugin to an audio clip (TimelineItem.AddEffect 'audio', Resolve 21+), e.g. 'Fairlight EQ', 'De-Esser', 'De-Hummer', 'Dialogue Processor', 'Reverb', 'Delay', 'Chorus'. Plugin parameters are not scriptable.",
    input: { ...AudioItem, effect: z.string().min(1) },
    handler: async (a, ctx) => run(ctx, "fx.add", { ...itemRef(a), effect: a.effect, category: "audio" }, `Added ${a.effect}.`),
  });
  reg.define({ name: "audio_remove_effect", category, description: "Remove an audio effect from a clip by name or id.", input: { ...AudioItem, effect: z.string().min(1) }, handler: async (a, ctx) => run(ctx, "fx.delete", { ...itemRef(a), effect: a.effect }) });
  for (const [tool, fx] of Object.entries(FX)) {
    reg.define({
      name: tool, category,
      description: `Insert the Fairlight '${fx}' plugin on an audio clip (AddEffect). Its parameters (bands, threshold, ratio, mix...) must be set in the plugin UI: they are not exposed to scripting.`,
      input: { ...AudioItem, effect: z.string().default(fx).describe("Installed audio effect name (see effect_list mediaType audio)") },
      handler: async (a, ctx) => {
        const r = await run(ctx, "fx.add", { ...itemRef(a), effect: a.effect, category: "audio" }, `${a.effect} inserted.`);
        r.warnings = [...(r.warnings ?? []), "Plugin parameters are not scriptable; open the plugin on the clip to adjust them."];
        return r;
      },
    });
  }
  reg.unsupported("audio_voiceover_record", category, "Record a voiceover.", "recording is not exposed to scripting.", "Use Fairlight > Voiceover tool (or record externally and audio_import), or generate narration with ai_generate_voiceover.", { timeline: timelineArg });
  reg.define({
    name: "audio_master", category,
    description: "Mastering loudness: normalize audio items to a delivery standard (Timeline.NormalizeAudioLevel, Resolve 21+). Modes include EBU R128, ATSC A/85, Netflix, YouTube, TR-B32, Sample Peak Program, True Peak.",
    input: { timeline: timelineArg, mode: z.string().default("YouTube"), targetLoudness: z.number().min(-60).max(0).optional().describe("LKFS/LUFS, e.g. -14"), targetLevel: z.number().min(-60).max(0).optional().describe("dBFS for peak modes"), trackIndex: z.number().int().min(1).optional(), items: z.array(ItemRefSchema.omit({ timeline: true })).optional() },
    handler: async (a, ctx) => run(ctx, "audio.normalize", clean(a), (d) => `Normalized ${(d as { normalized: number }).normalized} item(s) to ${a.mode}.`, 1800000),
  });
  reg.define({ name: "audio_normalize_modes", category, readOnly: true, description: "Loudness normalization modes this Resolve supports.", input: { timeline: timelineArg }, handler: async (a, ctx) => run(ctx, "audio.modes", clean(a)) });
  reg.define({ name: "audio_fairlight_presets", category, readOnly: true, description: "List Fairlight presets.", input: {}, handler: async (_a, ctx) => run(ctx, "audio.fairlight_presets") });
  reg.define({ name: "audio_apply_fairlight_preset", category, description: "Apply a saved Fairlight preset (bus/track setup) to the current timeline.", input: { preset: z.string().min(1) }, handler: async (a, ctx) => run(ctx, "audio.apply_fairlight_preset", a) });
  reg.define({
    name: "audio_dialogue_cleanup", category,
    description: "Dialogue cleanup on an audio clip: Voice Isolation (amount 0-100) plus the Dialogue Leveler via item properties (Resolve 21+). Falls back to track-level Voice Isolation when itemIndex is omitted.",
    input: { ...AudioItem, amount: z.number().int().min(0).max(100).default(60), leveler: z.boolean().default(true), wholeTrack: z.boolean().default(false) },
    handler: async (a, ctx) => {
      if (a.wholeTrack) return run(ctx, "audio.voice_isolation", clean({ timeline: a.timeline, trackIndex: a.trackIndex, amount: a.amount, enabled: true }));
      const props: Record<string, unknown> = { AudioVoiceIsolationEnabled: true, AudioVoiceIsolationAmount: a.amount };
      if (a.leveler) Object.assign(props, { AudioDialogueLevelerEnabled: true, AudioDialogueLevelerReduceLoudDialogue: true, AudioDialogueLevelerLiftSoftDialogue: true });
      const r = await ctx.bridge.call<{ unsupported: string[]; note?: string }>("audio.try_property", { ...itemRef(a), properties: props });
      return { data: r, status: r.unsupported.length ? (r.unsupported.length === Object.keys(props).length ? "unsupported" : "partial") : "ok", message: r.unsupported.length ? r.note ?? "Some settings rejected." : `Voice Isolation ${a.amount}%${a.leveler ? " + Dialogue Leveler" : ""} enabled.` };
    },
  });
  reg.define({
    name: "audio_sync", category,
    description: "Sync separately recorded audio to video clips (waveform or timecode) via MediaPool.AutoSyncAudio.",
    input: { clips: z.array(clipRef).min(2), mode: z.enum(["waveform", "timecode"]).default("waveform"), retainEmbeddedAudio: z.boolean().optional() },
    handler: async (a, ctx) => run(ctx, "media.auto_sync_audio", clean(a), "Audio synced.", 600000),
  });
  reg.define({
    name: "audio_mix", category,
    description: "Balance a mix by setting per-item volume (dB) for several audio items in one call (e.g. dialogue 0 dB, music -18 dB). Each change is verified; unsupported properties are reported.",
    input: { timeline: timelineArg, levels: z.array(z.object({ item: ItemRefSchema.omit({ timeline: true }), volumeDb: z.number().min(-100).max(24) })).min(1) },
    handler: async (a, ctx) => {
      const results = [];
      let unsupportedCount = 0;
      for (const l of a.levels) {
        const r = await ctx.bridge.call<{ unsupported: string[] }>("audio.try_property", { ...clean({ timeline: a.timeline, ...l.item }), trackType: "audio", properties: { AudioVolume: l.volumeDb } });
        if (r.unsupported.length) unsupportedCount++;
        results.push(r);
      }
      return { data: results, status: unsupportedCount === results.length ? "unsupported" : unsupportedCount ? "partial" : "ok", message: unsupportedCount ? `${unsupportedCount}/${results.length} level changes rejected by Resolve.` : "Mix levels applied.", warnings: unsupportedCount ? [FAIRLIGHT_ALT] : [] };
    },
  });
  reg.define({
    name: "audio_analyze", category, support: "integration",
    description: "Loudness analysis. With a timeline item: Resolve's AnalyzeAudioLevels (integrated LUFS + true peak, Resolve 21+). With a file path: FFmpeg EBU R128 (LUFS, LRA, true peak) plus silence ranges.",
    input: { ...AudioItem, path: absPath.optional(), standard: z.string().default("EBU R128"), silenceThresholdDb: z.number().min(-90).max(0).default(-35), minSilenceSec: z.number().min(0.1).max(30).default(0.6), targetLufs: z.number().min(-40).max(-5).default(-14) },
    handler: async (a, ctx) => {
      if (!a.path) {
        const r = await ctx.bridge.call<{ levels: { Integrated?: number; TruePeak?: number } }>("audio.analyze_levels", { ...itemRef(a), standard: a.standard }, 1800000);
        const i = r.levels.Integrated;
        return { data: { ...r, targetLufs: a.targetLufs, gainToTargetDb: i !== undefined && i > -100 ? +(a.targetLufs - i).toFixed(1) : null }, message: `Integrated ${i?.toFixed?.(1)} LUFS, true peak ${r.levels.TruePeak?.toFixed?.(1)} dBFS.` };
      }
      const p = ctx.paths.read(a.path, { kind: "file" });
      const l = await loudness(ctx.config.ffmpegPath, p);
      const s2 = await silences(ctx.config.ffmpegPath, p, a.silenceThresholdDb, a.minSilenceSec);
      const delta = l.integratedLufs !== undefined ? +(a.targetLufs - l.integratedLufs).toFixed(1) : undefined;
      return { data: { loudness: l, targetLufs: a.targetLufs, gainToTargetDb: delta, silences: s2 }, message: `Integrated ${l.integratedLufs} LUFS, true peak ${l.truePeakDbtp} dBFS, ${s2.length} silence range(s).` };
    },
  });
  reg.define({
    name: "audio_get_properties", category, readOnly: true,
    description: "Read an audio item's properties as Resolve reports them.",
    input: AudioItem,
    handler: async (a, ctx) => run(ctx, "edit.get_properties", itemRef(a)),
  });
  reg.define({
    name: "audio_insert_at_playhead", category,
    description: "Insert an audio file on the current Fairlight track at the playhead (Project.InsertAudioToCurrentTrackAtPlayhead; offsets in samples).",
    input: { path: absPath, startOffset: z.number().int().min(0).default(0), duration: z.number().int().min(0).default(0) },
    handler: async (a, ctx) => {
      if (!a.path) throw new McpToolError("INVALID_ARGUMENT", "path required");
      return run(ctx, "edit.insert_audio_at_playhead", { ...a, path: ctx.paths.read(a.path, { kind: "file" }) });
    },
  });
}
