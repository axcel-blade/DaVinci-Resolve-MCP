import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { AiProvider, segmentsToSrt } from "../../utils/ai-provider.js";
import { detectScenes, frameStats, loudness, probe, silences, toolAvailable } from "../../utils/media-probe.js";
import { buildEditPlan, keepRanges, scoreClips, suggestLook, suggestTransitions, type ClipInfo, type EditPlan } from "../../design-engine/planner/planner.js";
import { clipRef, ItemRef, timelineArg, type ToolContext, type ToolRegistry, clean, itemRef, run } from "./common.js";
import { McpToolError } from "../../utils/errors.js";
import { secondsToFrames } from "../../utils/timecode.js";

async function loadClips(ctx: ToolContext, opts: { clips?: string[]; bin?: string; withMetadata?: boolean; limit?: number }): Promise<ClipInfo[]> {
  const list = await ctx.bridge.call<{ clips: ClipInfo[] }>("media.list", clean({ bin: opts.bin, limit: opts.limit ?? 2000 }));
  let clips = list.clips;
  if (opts.clips?.length) {
    const want = new Set(opts.clips);
    clips = clips.filter((c) => want.has(c.id) || want.has(c.name) || want.has(c.properties["File Path"] ?? ""));
  }
  if (opts.withMetadata) {
    for (const c of clips.slice(0, 300)) {
      try {
        c.metadata = (await ctx.bridge.call<{ metadata: Record<string, string> }>("media.metadata", { clip: c.id })).metadata;
      } catch {
        c.metadata = {};
      }
    }
  }
  return clips;
}

function transcriptsDir(ctx: ToolContext): string {
  const d = join(ctx.config.paths.outputDir, "transcripts");
  mkdirSync(d, { recursive: true });
  return d;
}

/** Create a timeline from a plan. Only new objects are created; nothing existing is modified. */
export async function applyPlan(ctx: ToolContext, plan: EditPlan, timelineName: string, settings?: { width?: number; height?: number }): Promise<Record<string, unknown>> {
  const tl = await ctx.bridge.call("timeline.create", clean({ name: timelineName, settings: settings?.width ? { timelineResolutionWidth: String(settings.width), timelineResolutionHeight: String(settings.height), timelineOutputResolutionWidth: String(settings.width), timelineOutputResolutionHeight: String(settings.height) } : undefined }));
  const placed = plan.segments.length
    ? await ctx.bridge.call("edit.append", { clips: plan.segments.map((s) => ({ clip: s.clipId, sourceStart: s.sourceStart, sourceEnd: s.sourceEnd })) })
    : { placed: [] };
  let music: unknown;
  if (plan.musicClipId) {
    try {
      const tracks = await ctx.bridge.call<{ trackType: string; trackIndex: number }[]>("timeline.tracks", {});
      const audioTracks = tracks.filter((t) => t.trackType === "audio").length;
      const add = await ctx.bridge.call<{ trackIndex: number }>("timeline.add_track", { trackType: "audio", audioType: "stereo", name: "Music" });
      music = await ctx.bridge.call("edit.append", { clips: [{ clip: plan.musicClipId, trackIndex: add.trackIndex ?? audioTracks + 1, recordFrame: (tl as { timeline: { startFrame: number } }).timeline.startFrame, mediaType: "audio", sourceStart: 0, sourceEnd: Math.round(plan.estimatedSeconds * plan.fps) }] });
    } catch (e) {
      music = { error: (e as Error).message };
    }
  }
  return { timeline: tl, placed, music };
}

export function registerAi(reg: ToolRegistry): void {
  const category = "ai";
  const s = { category, support: "planner" as const };
  const clipsSel = { clips: z.array(clipRef).optional().describe("Clip ids/names (default: all clips)"), bin: z.string().optional() };

  reg.define({
    ...s, name: "ai_analyze_footage", readOnly: true,
    description: "Analyze clips: Resolve clip properties plus (with FFmpeg) codec, bitrate, audio layout and loudness; flags offline media, low resolution, short takes. Returns a per-clip report.",
    input: { ...clipsSel, deep: z.boolean().default(false).describe("Also run ffprobe/loudness on source files (slower)"), limit: z.number().int().min(1).max(500).default(100) },
    handler: async (a, ctx) => {
      const clips = (await loadClips(ctx, { clips: a.clips, bin: a.bin, withMetadata: true })).slice(0, a.limit);
      const scored = new Map(scoreClips(clips).map((x) => [x.id, x]));
      const ff = a.deep && (await toolAvailable(ctx.config.ffprobePath));
      const report = [];
      for (const c of clips) {
        const fp = c.properties["File Path"];
        const r: Record<string, unknown> = { id: c.id, name: c.name, type: c.properties.Type, resolution: c.properties.Resolution, fps: c.properties.FPS, duration: c.properties.Duration, fileExists: fp ? existsSync(fp) : null, score: scored.get(c.id)?.score, notes: scored.get(c.id)?.reasons };
        if (ff && fp && existsSync(fp)) {
          try { r.probe = await probe(ctx.config.ffprobePath, fp); } catch (e) { r.probe = { error: (e as Error).message }; }
          if (/audio|video/i.test(c.properties.Type ?? "")) {
            try { r.loudness = await loudness(ctx.config.ffmpegPath, fp); } catch { /* optional */ }
          }
        }
        report.push(r);
      }
      return { data: { clips: report, deep: Boolean(ff) }, warnings: a.deep && !ff ? ["ffprobe not available: deep analysis skipped."] : [], message: `Analyzed ${report.length} clip(s).` };
    },
  });
  reg.define({
    ...s, name: "ai_detect_scenes", support: "integration",
    description: "Detect scene cuts. source 'timeline' runs Resolve's DetectSceneCuts on the current timeline (adds cuts); source 'file' runs FFmpeg scene detection on a clip's source file and returns cut times (no changes).",
    input: { source: z.enum(["file", "timeline"]).default("file"), clip: clipRef.optional(), threshold: z.number().min(0.05).max(0.95).default(0.35), timeline: timelineArg },
    handler: async (a, ctx) => {
      if (a.source === "timeline") return run(ctx, "timeline.detect_scene_cuts", clean({ timeline: a.timeline }), (d) => `${(d as { cutsAdded: number }).cutsAdded} cut(s) added.`, 1800000);
      if (!a.clip) throw new McpToolError("INVALID_ARGUMENT", "clip is required for source 'file'.");
      const info = await ctx.bridge.call<{ properties: Record<string, string> }>("media.info", { clip: a.clip });
      const fp = ctx.paths.read(info.properties["File Path"] ?? "", { kind: "file" });
      const fps = parseFloat(info.properties.FPS ?? "24") || 24;
      const cuts = await detectScenes(ctx.config.ffmpegPath, fp, a.threshold);
      return { data: { file: fp, fps, cuts: cuts.map((t) => ({ seconds: +t.toFixed(3), frame: secondsToFrames(t, fps) })) }, message: `${cuts.length} scene change(s) detected.` };
    },
  });
  reg.unsupported("ai_detect_speakers", category, "Identify speakers in dialogue.", "Resolve's speaker detection is not scriptable and no diarization provider adapter is configured.",
    "Use Resolve's transcription panel (speaker detection in Studio 19+), or transcribe with ai_transcribe_audio and label speakers manually via markers.", { clip: clipRef.optional() });
  reg.define({
    ...s, name: "ai_detect_objects", support: "api",
    description: "Prepare clips for object/face search: runs IntelliSearch analysis (MediaPoolItem.AnalyzeForIntellisearch, Resolve Studio 21+). Searching the analysis by phrase (e.g. 'person in a red shirt') happens in the Media page search bar: the query itself is not scriptable.",
    input: { clips: z.array(clipRef).min(1).max(500), identifyFaces: z.boolean().default(false), better: z.boolean().default(false) },
    handler: async (a, ctx) => {
      const r = await ctx.bridge.call<{ analyzed: { ok: boolean }[] }>("ai.intellisearch_analyze", a, 3600000);
      const ok = r.analyzed.filter((x) => x.ok).length;
      return { data: r, status: ok === r.analyzed.length ? "ok" : "partial", message: `IntelliSearch analysis done for ${ok}/${r.analyzed.length} clip(s). Search in the Media page; ai_search_media covers names, metadata and transcripts.` };
    },
  });
  reg.define({
    ...s, name: "ai_search_media", readOnly: true,
    description: "Natural-language-ish media search: matches every word against clip names, file paths, metadata and saved transcripts (from ai_transcribe_audio). Ranked by hits.",
    input: { query: z.string().min(1), limit: z.number().int().min(1).max(200).default(25) },
    handler: async (a, ctx) => {
      const words = a.query.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !["the", "and", "with", "all", "clips", "find", "containing", "wearing"].includes(w));
      const clips = await loadClips(ctx, { withMetadata: true });
      const dir = transcriptsDir(ctx);
      const transcripts: Record<string, string> = {};
      for (const t of await ctx.bridge.call<{ id: string; text: string }[]>("ai.all_transcripts").catch(() => [])) transcripts[t.id] = t.text.toLowerCase();
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
        try { const j = JSON.parse(readFileSync(join(dir, f), "utf8")); if (j.clipId) transcripts[j.clipId] = String(j.text ?? "").toLowerCase(); } catch { /* skip */ }
      }
      const hits = clips.map((c) => {
        const hay = `${c.name} ${c.properties["File Path"] ?? ""} ${Object.values(c.metadata ?? {}).join(" ")}`.toLowerCase();
        const t = transcripts[c.id] ?? "";
        const matched = words.filter((w) => hay.includes(w) || t.includes(w));
        return { id: c.id, name: c.name, score: matched.length, matched, inTranscript: words.filter((w) => t.includes(w)) };
      }).filter((h) => h.score > 0).sort((x, y) => y.score - x.score).slice(0, a.limit);
      return { data: { words, hits }, message: `${hits.length} clip(s) matched.`, warnings: ["Visual content search runs in Resolve's IntelliSearch UI (prepare with ai_detect_objects); this tool matches names, metadata and Resolve/provider transcripts."] };
    },
  });
  reg.define({
    ...s, name: "ai_transcribe_audio", support: "external",
    description: "Transcribe a clip. engine 'resolve' uses Resolve's built-in transcription (Studio). engine 'provider' sends the source file to the configured AI provider and saves transcript JSON + SRT under output/transcripts.",
    input: { clip: clipRef, engine: z.enum(["resolve", "provider"]).default("resolve"), language: z.string().optional() },
    handler: async (a, ctx) => {
      if (a.engine === "resolve") return run(ctx, "media.transcribe", { clip: a.clip }, "Transcribed with Resolve.", 1800000);
      const info = await ctx.bridge.call<{ id: string; name: string; properties: Record<string, string> }>("media.info", { clip: a.clip });
      const fp = ctx.paths.read(info.properties["File Path"] ?? "", { kind: "file" });
      const t = await new AiProvider(ctx.config.ai).transcribe(fp, a.language);
      const base = join(transcriptsDir(ctx), info.id.replace(/[^\w-]/g, "_"));
      writeFileSync(`${base}.json`, JSON.stringify({ clipId: info.id, clipName: info.name, file: fp, ...t }, null, 2));
      writeFileSync(`${base}.srt`, segmentsToSrt(t.segments));
      return { data: { json: `${base}.json`, srt: `${base}.srt`, segments: t.segments.length, preview: t.text.slice(0, 500) }, message: `Transcribed ${t.segments.length} segment(s).` };
    },
  });
  reg.define({
    ...s, name: "ai_generate_subtitles",
    description: "Generate timeline subtitles (Resolve Studio auto-captions). For provider-based captions use subtitle_generate with engine 'provider'.",
    input: { timeline: timelineArg, language: z.string().optional(), charsPerLine: z.number().int().min(1).max(60).optional(), lines: z.union([z.literal(1), z.literal(2)]).optional() },
    handler: async (a, ctx) => run(ctx, "subtitle.generate", clean(a), (d) => `Generated ${(d as { added: number }).added} subtitle(s).`, 3600000),
  });
  reg.define({
    ...s, name: "ai_generate_voiceover", support: "external",
    description: "Generate a voiceover. engine 'resolve' (default) uses Resolve's AI Speech Generator (Project.GenerateSpeech, Studio 21+ with the Extra installed; max 350 characters, voices like 'Female 1', 'Male 1'). engine 'provider' uses the configured TTS provider, imports the WAV into 'Voiceover' and can place it.",
    input: { text: z.string().min(1).max(4000), engine: z.enum(["resolve", "provider"]).default("resolve"), voice: z.string().optional(), speed: z.number().min(-10).max(10).optional(), pitch: z.number().min(-2).max(2).optional(), fileName: z.string().regex(/^[\w-]+$/).default("voiceover"), place: z.boolean().default(false), trackIndex: z.number().int().min(0).default(0).describe("0 = new track (resolve engine)"), recordFrame: z.number().int().min(0).optional(), timecode: z.string().optional() },
    handler: async (a, ctx) => {
      if (a.engine === "resolve") {
        return run(ctx, "ai.generate_speech", clean({ text: a.text, voice: a.voice, speed: a.speed, pitch: a.pitch, fileName: a.fileName, addToTimeline: a.place, audioTrack: a.trackIndex, timecode: a.timecode }), "Speech generated by Resolve.", 600000);
      }
      const out = ctx.paths.write(join(ctx.config.paths.outputDir, "voiceover", `${a.fileName}-${Date.now()}.wav`));
      mkdirSync(join(ctx.config.paths.outputDir, "voiceover"), { recursive: true });
      const r = await new AiProvider(ctx.config.ai).speech(a.text, out, a.voice);
      const imp = await ctx.bridge.call<{ clips: { id: string }[] }>("media.import", { paths: [out], bin: "Voiceover" });
      let placed: unknown;
      if (a.place && imp.clips[0]) placed = await ctx.bridge.call("edit.append", { clips: [clean({ clip: imp.clips[0].id, trackIndex: a.trackIndex || 1, recordFrame: a.recordFrame, mediaType: "audio" })] });
      return { data: { file: r, clip: imp.clips[0], placed }, message: `Voiceover generated (${r.bytes} bytes) and imported.` };
    },
  });
  const planInput = {
    ...clipsSel,
    goal: z.string().min(1).max(500).describe("What to make, e.g. '60-second YouTube ad for a coffee brand'"),
    targetSeconds: z.number().min(3).max(7200).default(60),
    shotSeconds: z.number().min(0.5).max(60).default(4),
    keywords: z.array(z.string()).optional(),
    musicClip: clipRef.optional(),
    title: z.string().optional(),
    look: z.string().optional(),
    exportPreset: z.string().optional(),
    fps: z.number().optional().describe("Default: project timeline frame rate"),
  };
  type PlanArgs = { clips?: string[]; bin?: string; goal: string; targetSeconds: number; shotSeconds: number; keywords?: string[]; musicClip?: string; title?: string; look?: string; exportPreset?: string; fps?: number };
  const makePlan = async (ctx: ToolContext, a: PlanArgs): Promise<EditPlan> => {
    const clips = await loadClips(ctx, { clips: a.clips, bin: a.bin, withMetadata: true });
    const fps = a.fps ?? parseFloat(String((await ctx.bridge.call<Record<string, string>>("project.get_settings", { keys: ["timelineFrameRate"] })).timelineFrameRate)) ?? 24;
    const scored = scoreClips(clips, { keywords: a.keywords });
    let music = a.musicClip;
    if (music) music = (await ctx.bridge.call<{ id: string }>("media.info", { clip: music })).id;
    return buildEditPlan(a.goal, scored, { targetSeconds: a.targetSeconds, fps: fps || 24, shotSeconds: a.shotSeconds, musicClipId: music, title: a.title, look: a.look, exportPreset: a.exportPreset });
  };
  reg.define({ ...s, name: "ai_create_editing_plan", readOnly: true, description: "Build a reviewable edit plan (ordered segments with source ranges, titles, music, look, export) from the media pool. Makes no changes; review then apply with ai_create_rough_cut { plan }.", input: planInput, handler: async (a, ctx) => { const plan = await makePlan(ctx, a); return { data: plan, message: `Plan: ${plan.segments.length} segment(s), ~${plan.estimatedSeconds}s.`, warnings: plan.notes }; } });
  reg.define({
    ...s, name: "ai_find_best_clips", readOnly: true,
    description: "Rank clips by usefulness (resolution, length, Good Take / rating metadata, naming, keyword matches) with reasons.",
    input: { ...clipsSel, keywords: z.array(z.string()).optional(), top: z.number().int().min(1).max(200).default(20), minSeconds: z.number().min(0).default(2) },
    handler: async (a, ctx) => { const clips = await loadClips(ctx, { clips: a.clips, bin: a.bin, withMetadata: true }); return { data: scoreClips(clips, { keywords: a.keywords, minSec: a.minSeconds }).slice(0, a.top) }; },
  });
  const PlanSchema = z.object({
    goal: z.string(), targetSeconds: z.number(), fps: z.number(), estimatedSeconds: z.number(),
    segments: z.array(z.object({ clipId: z.string(), clipName: z.string(), sourceStart: z.number().int(), sourceEnd: z.number().int(), role: z.string(), note: z.string().optional() })),
    titles: z.array(z.object({ text: z.string(), atSecond: z.number(), kind: z.string() })).default([]),
    musicClipId: z.string().optional(), look: z.string().optional(), exportPreset: z.string().optional(), notes: z.array(z.string()).default([]),
  });
  reg.define({
    ...s, name: "ai_create_rough_cut",
    description: "Create a NEW timeline from an edit plan (from ai_create_editing_plan) or build a plan on the fly. Existing timelines are never modified. apply: false returns only the plan.",
    input: { ...planInput, goal: z.string().default("Rough cut"), plan: PlanSchema.optional(), timelineName: z.string().min(1).default("AI Rough Cut"), apply: z.boolean().default(true) },
    handler: async (a, ctx) => {
      const plan = (a.plan as EditPlan | undefined) ?? (await makePlan(ctx, a));
      if (!a.apply) return { data: plan, message: "Plan only (apply: false)." };
      if (!plan.segments.length) throw new McpToolError("NO_MEDIA", "The plan has no segments; import usable video first.", plan.notes);
      const r = await applyPlan(ctx, plan, a.timelineName);
      return { data: { plan, ...r }, message: `Rough cut '${a.timelineName}' created with ${plan.segments.length} segment(s).`, warnings: plan.notes };
    },
  });
  reg.define({
    ...s, name: "ai_create_highlights",
    description: "Highlight reel: picks the best clips (optionally around FFmpeg-detected scene changes) into short punchy segments on a NEW timeline.",
    input: { ...clipsSel, targetSeconds: z.number().min(5).max(600).default(30), shotSeconds: z.number().min(0.5).max(10).default(2), keywords: z.array(z.string()).optional(), timelineName: z.string().default("AI Highlights"), apply: z.boolean().default(true) },
    handler: async (a, ctx) => {
      const plan = await makePlan(ctx, { ...a, goal: "Highlights" });
      if (!a.apply) return { data: plan };
      if (!plan.segments.length) throw new McpToolError("NO_MEDIA", "No usable clips for highlights.");
      return { data: { plan, ...(await applyPlan(ctx, plan, a.timelineName)) }, message: `Highlights timeline '${a.timelineName}' created.` };
    },
  });
  reg.define({
    ...s, name: "ai_create_social_video",
    description: "Social cut: plan + NEW timeline at the platform aspect ratio (9:16, 1:1, 4:5, 16:9). Optionally runs Smart Reframe (Studio) on placed items.",
    input: { ...clipsSel, aspect: z.enum(["9:16", "1:1", "4:5", "16:9"]).default("9:16"), targetSeconds: z.number().min(3).max(180).default(30), shotSeconds: z.number().min(0.5).max(10).default(2.5), keywords: z.array(z.string()).optional(), title: z.string().optional(), timelineName: z.string().default("AI Social"), smartReframe: z.boolean().default(false), apply: z.boolean().default(true) },
    handler: async (a, ctx) => {
      const dims = { "9:16": [1080, 1920], "1:1": [1080, 1080], "4:5": [1080, 1350], "16:9": [1920, 1080] }[a.aspect] as [number, number];
      const plan = await makePlan(ctx, { ...a, goal: `Social ${a.aspect}` });
      if (!a.apply) return { data: { plan, resolution: dims } };
      if (!plan.segments.length) throw new McpToolError("NO_MEDIA", "No usable clips.");
      const r = await applyPlan(ctx, plan, a.timelineName, { width: dims[0], height: dims[1] });
      const warnings = [...plan.notes];
      if (a.smartReframe) {
        const items = (r.placed as { placed: { id: string }[] }).placed ?? [];
        for (const it of items) await ctx.bridge.call("edit.smart_reframe", { itemId: it.id }, 1800000).catch((e) => warnings.push(`Smart Reframe: ${(e as Error).message}`));
      }
      if (a.title) await ctx.bridge.call("title.overlay", { frame: (r.timeline as { timeline: { startFrame: number } }).timeline.startFrame, style: { text: a.title, size: 0.07, position: [0.5, 0.75], color: "#ffffff", fontStyle: "Bold" }, animation: { type: "zoom", frames: 12 } }).catch((e) => warnings.push(`Title: ${(e as Error).message}`));
      return { data: { plan, resolution: dims, ...r }, warnings, message: `${a.aspect} timeline '${a.timelineName}' created.` };
    },
  });
  reg.define({
    ...s, name: "ai_suggest_transitions", readOnly: true,
    description: "Suggest transitions for the current timeline's cut points by style (documentary, social, cinematic...). Suggestions only: transitions are not scriptable.",
    input: { timeline: timelineArg, style: z.string().default("cinematic") },
    handler: async (a, ctx) => {
      const d = await ctx.bridge.call<{ items: { start: number; trackType: string; trackIndex: number }[] }>("timeline.clips", clean({ timeline: a.timeline, trackType: "video", trackIndex: 1 }));
      const info = await ctx.bridge.call<{ fps: number; startFrame: number }>("timeline.info", clean({ name: a.timeline }));
      const cuts = d.items.slice(1).map((i) => (i.start - info.startFrame) / info.fps);
      return { data: suggestTransitions(cuts, a.style), warnings: ["Apply transitions in the Edit page; the scripting API cannot add them."] };
    },
  });
  reg.define({
    ...s, name: "ai_suggest_color_grade", readOnly: true,
    description: "Recommend a look preset from the current frame's statistics (FFmpeg) and/or a genre. Apply with color_apply_look.",
    input: { genre: z.string().optional(), useCurrentFrame: z.boolean().default(true) },
    handler: async (a, ctx) => {
      let stats: Record<string, number> | undefined;
      const warnings: string[] = [];
      if (a.useCurrentFrame) {
        try {
          const path = ctx.paths.write(join(ctx.config.paths.outputDir, "scopes", `frame-${Date.now()}.png`));
          await ctx.bridge.call("color.export_frame", { path });
          stats = await frameStats(ctx.config.ffmpegPath, path);
        } catch (e) {
          warnings.push(`Frame analysis skipped: ${(e as Error).message}`);
        }
      }
      return { data: { ...suggestLook(stats, a.genre), stats }, warnings };
    },
  });
  reg.define({
    ...s, name: "ai_analyze_audio", support: "integration", readOnly: true,
    description: "Loudness (LUFS / true peak / LRA) and silence analysis of a clip's source audio. Requires FFmpeg.",
    input: { clip: clipRef, targetLufs: z.number().default(-14) },
    handler: async (a, ctx) => {
      const info = await ctx.bridge.call<{ properties: Record<string, string> }>("media.info", { clip: a.clip });
      const fp = ctx.paths.read(info.properties["File Path"] ?? "", { kind: "file" });
      const l = await loudness(ctx.config.ffmpegPath, fp);
      const sil = await silences(ctx.config.ffmpegPath, fp);
      return { data: { file: fp, loudness: l, gainToTargetDb: l.integratedLufs !== undefined ? +(a.targetLufs - l.integratedLufs).toFixed(1) : null, silences: sil } };
    },
  });
  reg.define({
    ...s, name: "ai_generate_shot_list", readOnly: true,
    description: "Shot list of the current timeline (or media pool): shot number, clip, in/out timecode, duration, markers/notes. Returned as rows (and CSV text).",
    input: { timeline: timelineArg, source: z.enum(["timeline", "media"]).default("timeline") },
    handler: async (a, ctx) => {
      if (a.source === "media") {
        const clips = await loadClips(ctx, { withMetadata: true });
        const rows = clips.map((c, i) => ({ shot: i + 1, clip: c.name, type: c.properties.Type, duration: c.properties.Duration, resolution: c.properties.Resolution, scene: c.metadata?.Scene, take: c.metadata?.Take, notes: c.metadata?.Comments }));
        return { data: { rows, csv: toCsv(rows) } };
      }
      const info = await ctx.bridge.call<{ fps: number; startFrame: number }>("timeline.info", clean({ name: a.timeline }));
      const d = await ctx.bridge.call<{ items: { name: string; start: number; end: number; duration: number; trackIndex: number }[] }>("timeline.clips", clean({ timeline: a.timeline, trackType: "video" }));
      const { framesToTimecode } = await import("../../utils/timecode.js");
      const rows = d.items.sort((x, y) => x.start - y.start).map((it, i) => ({ shot: i + 1, track: `V${it.trackIndex}`, clip: it.name, in: framesToTimecode(Math.max(0, it.start - info.startFrame), info.fps), out: framesToTimecode(Math.max(0, it.end - info.startFrame), info.fps), seconds: +(it.duration / info.fps).toFixed(2) }));
      return { data: { rows, csv: toCsv(rows) } };
    },
  });
  reg.define({
    ...s, name: "ai_remove_silence", support: "integration",
    description: "Remove silent gaps from a timeline item (dialogue): FFmpeg finds silences in the source range, the item (and its linked audio) is replaced by the kept ranges placed back-to-back. Run with apply: false first to review the cut list.",
    input: { ...ItemRef, thresholdDb: z.number().min(-80).max(-10).default(-35), minSilenceSec: z.number().min(0.2).max(10).default(0.6), padSec: z.number().min(0).max(1).default(0.15), apply: z.boolean().default(false), confirm: z.boolean().optional().describe("Required (true) with apply: true, after the user reviewed the cut list") },
    handler: async (a, ctx) => {
      const p = await ctx.bridge.call<{ item: { id: string; start: number; end: number; sourceStartFrame?: number; sourceEndFrame?: number; leftOffset?: number; mediaPoolItemId: string | null } }>("edit.get_properties", itemRef(a));
      if (!p.item.mediaPoolItemId) throw new McpToolError("UNSUPPORTED", "Item has no source clip.");
      const info = await ctx.bridge.call<{ properties: Record<string, string> }>("media.info", { clip: p.item.mediaPoolItemId });
      const fp = ctx.paths.read(info.properties["File Path"] ?? "", { kind: "file" });
      const tl = await ctx.bridge.call<{ fps: number }>("timeline.info", clean({ name: a.timeline }));
      const fps = tl.fps;
      const srcS = p.item.sourceStartFrame ?? p.item.leftOffset ?? 0;
      const srcE = srcS + (p.item.end - p.item.start);
      const sil = await silences(ctx.config.ffmpegPath, fp, a.thresholdDb, a.minSilenceSec);
      const keep = keepRanges(sil, srcS / fps, srcE / fps, a.padSec).map((r) => ({ sourceStart: secondsToFrames(r.start, fps), sourceEnd: secondsToFrames(r.end, fps) })).filter((r) => r.sourceEnd > r.sourceStart);
      const removedFrames = srcE - srcS - keep.reduce((t, r) => t + r.sourceEnd - r.sourceStart, 0);
      const plan = { file: fp, sourceRange: [srcS, srcE], keep, removedSeconds: +(removedFrames / fps).toFixed(2) };
      if (!a.apply) return { data: plan, message: `Would remove ${plan.removedSeconds}s in ${Math.max(0, keep.length - 1)} gap(s). Call again with apply: true and confirm: true.` };
      if (ctx.config.safety.requireConfirmation && a.confirm !== true) throw new McpToolError("CONFIRMATION_REQUIRED", "Removing silence edits the timeline. Show the user the plan (apply: false), then call with apply: true and confirm: true.", plan);
      if (!keep.length) throw new McpToolError("INVALID_STATE", "Everything would be removed; adjust the threshold.");
      // delete the item and any linked audio of the same source at the same position
      const all = await ctx.bridge.call<{ items: { id: string; start: number; end: number; mediaPoolItemId: string | null; trackType: string }[] }>("timeline.clips", clean({ timeline: a.timeline }));
      const linked = all.items.filter((i) => i.mediaPoolItemId === p.item.mediaPoolItemId && i.start === p.item.start && i.end === p.item.end);
      await ctx.bridge.call("edit.delete", { timeline: a.timeline, items: linked.map((i) => ({ itemId: i.id })), ripple: false });
      let rec = p.item.start;
      const clips = keep.map((k) => { const c = { clip: p.item.mediaPoolItemId!, sourceStart: k.sourceStart, sourceEnd: k.sourceEnd, recordFrame: rec, trackIndex: a.trackIndex }; rec += k.sourceEnd - k.sourceStart; return c; });
      const placed = await ctx.bridge.call("edit.append", { timeline: a.timeline, clips });
      return { data: { ...plan, removedItems: linked.length, placed }, message: `Removed ${plan.removedSeconds}s of silence; ${keep.length} segment(s) placed. Later items were not rippled (gap left at the end).` };
    },
  });
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]!);
  const esc = (v: unknown) => { const s = v === undefined || v === null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}
