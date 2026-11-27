import { z } from "zod";
import { MARKER_COLORS } from "../../config/constants.js";
import { absPath, clipRef, ItemRefSchema, timelineArg, type ToolRegistry, clean, run } from "./registry.js";
import { McpToolError } from "../../utils/errors.js";

const tlName = z.string().min(1).max(255);
const FPS = ["23.976", "24", "25", "29.97", "30", "48", "50", "59.94", "60"] as const;

const TimelineSettings = {
  width: z.number().int().min(16).max(16384).optional(),
  height: z.number().int().min(16).max(16384).optional(),
  frameRate: z.enum(FPS).optional(),
  raw: z.record(z.string(), z.union([z.string(), z.number()])).optional().describe("Other timeline setting keys (see timeline_get_settings)."),
};

function toSettings(a: { width?: number; height?: number; frameRate?: string; raw?: Record<string, unknown> }): Record<string, string> {
  const s: Record<string, string> = {};
  if (a.width) s.timelineResolutionWidth = String(a.width);
  if (a.height) s.timelineResolutionHeight = String(a.height);
  if (a.width) s.timelineOutputResolutionWidth = String(a.width);
  if (a.height) s.timelineOutputResolutionHeight = String(a.height);
  if (a.frameRate) s.timelineFrameRate = a.frameRate;
  for (const [k, v] of Object.entries(a.raw ?? {})) s[k] = String(v);
  return s;
}

export function registerTimeline(reg: ToolRegistry): void {
  const category = "timeline";

  reg.define({
    name: "timeline_create", category,
    description: "Create a timeline (empty, or from media pool clips in order) and make it current. Width/height/frameRate apply custom timeline settings (e.g. 1080x1920 vertical).",
    input: { name: tlName, clips: z.array(clipRef).optional(), ...TimelineSettings },
    handler: async (a, ctx) => run(ctx, "timeline.create", clean({ name: a.name, clips: a.clips, settings: toSettings(a) }), `Timeline '${a.name}' created.`),
  });
  reg.define({ name: "timeline_delete", category, destructive: true, description: "Delete a timeline from the project.", input: { name: tlName }, handler: async (a, ctx) => run(ctx, "timeline.delete", a, `Timeline '${a.name}' deleted.`) });
  reg.define({ name: "timeline_duplicate", category, description: "Duplicate a timeline (default: current).", input: { name: timelineArg, newName: tlName.optional() }, handler: async (a, ctx) => run(ctx, "timeline.duplicate", clean(a), "Timeline duplicated.") });
  reg.define({ name: "timeline_rename", category, description: "Rename a timeline (default: current).", input: { name: timelineArg, newName: tlName }, handler: async (a, ctx) => run(ctx, "timeline.rename", clean(a)) });
  reg.define({ name: "timeline_open", category, description: "Make a timeline the current timeline.", input: { name: tlName }, handler: async (a, ctx) => run(ctx, "timeline.open", a, `Timeline '${a.name}' is now current.`) });
  reg.define({ name: "timeline_list", category, readOnly: true, description: "List timelines in the project.", input: {}, handler: async (_a, ctx) => run(ctx, "timeline.list") });
  reg.define({ name: "timeline_get_info", category, readOnly: true, description: "Timeline summary: frame range, duration (frames/seconds/timecode), fps, track counts, markers, playhead.", input: { name: timelineArg }, handler: async (a, ctx) => run(ctx, "timeline.info", clean(a)) });
  reg.define({ name: "timeline_get_settings", category, readOnly: true, description: "Read timeline settings (resolution, frame rate, custom settings flag...).", input: { name: timelineArg, keys: z.array(z.string()).optional() }, handler: async (a, ctx) => run(ctx, "timeline.get_settings", clean(a)) });
  reg.define({
    name: "timeline_set_settings", category,
    description: "Set timeline settings (enables custom timeline settings). Each key verified by readback.",
    input: { name: timelineArg, ...TimelineSettings },
    handler: async (a, ctx) => {
      const settings = toSettings(a);
      if (!Object.keys(settings).length) throw new McpToolError("INVALID_ARGUMENT", "No settings given.");
      return run(ctx, "timeline.set_settings", clean({ name: a.name, settings }));
    },
  });
  reg.define({
    name: "timeline_add_track", category,
    description: "Add a video, audio or subtitle track. Audio tracks take a channel format (mono, stereo, 5.1, 7.1, adaptive1..24).",
    input: { timeline: timelineArg, trackType: z.enum(["video", "audio", "subtitle"]), audioType: z.string().default("stereo"), name: z.string().optional() },
    handler: async (a, ctx) => run(ctx, "timeline.add_track", clean(a), (d) => `Added ${a.trackType} track ${(d as { trackIndex: number }).trackIndex}.`),
  });
  reg.define({ name: "timeline_delete_track", category, destructive: true, description: "Delete a track and everything on it.", input: { timeline: timelineArg, trackType: z.enum(["video", "audio", "subtitle"]), trackIndex: z.number().int().min(1) }, handler: async (a, ctx) => run(ctx, "timeline.delete_track", clean(a)) });
  reg.define({ name: "timeline_get_tracks", category, readOnly: true, description: "List all tracks with name, sub-type, enabled/locked state and item counts.", input: { timeline: timelineArg }, handler: async (a, ctx) => run(ctx, "timeline.tracks", clean(a)) });
  reg.define({
    name: "timeline_set_track", category,
    description: "Enable/disable, lock/unlock or rename a track.",
    input: { timeline: timelineArg, trackType: z.enum(["video", "audio", "subtitle"]), trackIndex: z.number().int().min(1), enabled: z.boolean().optional(), locked: z.boolean().optional(), name: z.string().optional() },
    handler: async (a, ctx) => run(ctx, "timeline.set_track", clean(a)),
  });
  reg.define({
    name: "timeline_get_clips", category, readOnly: true,
    description: "List timeline items with ids, type (video/audio/generator/transition), record start/end (frames), duration, source offsets and media pool clip id. itemIndex counts clips only. Use the ids to target edits.",
    input: { timeline: timelineArg, trackType: z.enum(["video", "audio", "subtitle"]).optional(), trackIndex: z.number().int().min(1).optional(), includeTransitions: z.boolean().default(true) },
    handler: async (a, ctx) => run(ctx, "timeline.clips", clean(a)),
  });
  reg.define({
    name: "timeline_get_duration", category, readOnly: true, description: "Timeline duration in frames, seconds and timecode.", input: { name: timelineArg },
    handler: async (a, ctx) => {
      const d = await ctx.bridge.call<Record<string, unknown>>("timeline.info", clean(a));
      return { data: { frames: d.durationFrames, seconds: d.durationSeconds, timecode: d.durationTimecode, fps: d.fps }, message: `Duration ${d.durationTimecode} (${d.durationFrames} frames).` };
    },
  });
  reg.define({ name: "timeline_set_start_timecode", category, description: "Set the timeline start timecode, e.g. 01:00:00:00.", input: { timeline: timelineArg, timecode: z.string().regex(/^\d{2}[:;]\d{2}[:;]\d{2}[:;]\d{2}$/) }, handler: async (a, ctx) => run(ctx, "timeline.set_start_timecode", clean(a)) });
  reg.define({
    name: "timeline_set_playhead", category,
    description: "Move the playhead to a timecode or absolute timeline frame (titles and generators insert at the playhead).",
    input: { timeline: timelineArg, timecode: z.string().optional(), frame: z.number().int().min(0).optional() },
    handler: async (a, ctx) => {
      if (a.timecode === undefined && a.frame === undefined) throw new McpToolError("INVALID_ARGUMENT", "Give timecode or frame.");
      return run(ctx, "timeline.set_playhead", clean(a));
    },
  });
  reg.define({
    name: "timeline_create_compound_clip", category,
    description: "Combine timeline items into a compound clip.",
    input: { timeline: timelineArg, items: z.array(ItemRefSchema.omit({ timeline: true })).min(1), name: z.string().optional(), startTimecode: z.string().optional() },
    handler: async (a, ctx) => run(ctx, "timeline.compound", clean(a), "Compound clip created."),
  });
  reg.define({
    name: "timeline_create_nested_sequence", category,
    description: "Nest timeline items as a sequence. In Resolve this is a compound clip (the API's nesting primitive).",
    input: { timeline: timelineArg, items: z.array(ItemRefSchema.omit({ timeline: true })).min(1), name: z.string().optional() },
    handler: async (a, ctx) => run(ctx, "timeline.compound", clean(a), "Nested (compound) clip created."),
  });
  reg.define({
    name: "timeline_create_fusion_clip", category,
    description: "Combine timeline items into a Fusion clip for compositing.",
    input: { timeline: timelineArg, items: z.array(ItemRefSchema.omit({ timeline: true })).min(1) },
    handler: async (a, ctx) => run(ctx, "timeline.fusion_clip", clean(a), "Fusion clip created."),
  });

  const exportTool = (tool: string, formats: [string, ...string[]], label: string) =>
    reg.define({
      name: tool, category,
      description: `Export the timeline as ${label}. The output path must be under an allowed write folder; existing files need overwrite: true.`,
      input: { timeline: timelineArg, path: absPath, format: z.enum(formats as [string, ...string[]]).default(formats[0]), overwrite: z.boolean().default(false) },
      handler: async (a, ctx) => run(ctx, "timeline.export", clean({ ...a, path: ctx.paths.write(a.path, { overwrite: a.overwrite }) }), (d) => `Exported to ${(d as { path: string }).path}.`, 300000),
    });
  exportTool("timeline_export_edl", ["edl", "edl_cdl", "edl_missing"], "an EDL (CMX 3600)");
  exportTool("timeline_export_xml", ["fcpxml", "fcp7xml", "drt", "otio", "csv", "ale"], "FCPXML / FCP 7 XML / DRT / OTIO / CSV / ALE");
  exportTool("timeline_export_aaf", ["aaf_new", "aaf_existing"], "an AAF");
  reg.define({
    name: "timeline_import", category,
    description: "Import a timeline from AAF/EDL/XML/FCPXML/DRP/OTIO into the media pool.",
    input: { path: absPath, name: z.string().optional(), importSourceClips: z.boolean().optional() },
    handler: async (a, ctx) => run(ctx, "timeline.import", clean({ ...a, path: ctx.paths.read(a.path, { kind: "file" }) }), "Timeline imported.", 600000),
  });
  reg.define({
    name: "timeline_add_marker", category,
    description: "Add a marker on the timeline at a frame offset from the timeline start.",
    input: { timeline: timelineArg, frame: z.number().int().min(0), color: z.enum(MARKER_COLORS).default("Blue"), name: z.string().default(""), note: z.string().default(""), duration: z.number().int().min(1).default(1) },
    handler: async (a, ctx) => run(ctx, "timeline.add_marker", clean(a)),
  });
  reg.define({ name: "timeline_get_markers", category, readOnly: true, description: "All timeline markers.", input: { timeline: timelineArg }, handler: async (a, ctx) => run(ctx, "timeline.markers", clean(a)) });
}
