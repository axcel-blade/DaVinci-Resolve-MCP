import { z } from "zod";
import { CLIP_COLORS, MARKER_COLORS } from "../../config/constants.js";
import { clipRef, ItemRef, ItemRefSchema, timelineArg, type ToolContext, type ToolRegistry, type ToolResult, clean, itemRef, run } from "./common.js";
import { McpToolError } from "../../utils/errors.js";

const frame = z.number().int().min(0);

const PlaceClip = z.object({
  clip: clipRef,
  sourceStart: frame.optional().describe("First source frame (inclusive)"),
  sourceEnd: frame.optional().describe("Source frame after the last one (exclusive)"),
  trackIndex: z.number().int().min(1).optional(),
  recordFrame: frame.optional().describe("Absolute timeline frame where the clip starts"),
  mediaType: z.enum(["video", "audio"]).optional().describe("Only video or only audio of the clip"),
});

/** Server-side clipboard for clip_copy / clip_paste. */
const clipboard: { item?: { timeline?: string; itemId: string } } = {};

const confirmFallback = z.boolean().optional().describe("Only needed on Resolve < 21, where this falls back to a destructive re-placement");

/** Prefer the native Resolve 21 op; on older versions fall back to re-placement, which needs confirmation. */
async function nativeOr(ctx: ToolContext, nativeOp: string, nativeArgs: object, fallbackArgs: object, confirm: boolean | undefined, message: string): Promise<ToolResult> {
  try {
    return await run(ctx, nativeOp, nativeArgs, message);
  } catch (e) {
    if ((e as { code?: string }).code !== "UNSUPPORTED") throw e;
    if (ctx.config.safety.requireConfirmation && confirm !== true) {
      throw new McpToolError("CONFIRMATION_REQUIRED", `This Resolve version lacks the native method, so the edit would be done by removing and re-placing the item (losing its grade/effects/transforms). Confirm with the user and pass confirm: true. (${(e as Error).message})`);
    }
    const r = await run(ctx, "edit.replace_at", fallbackArgs, `${message} (re-placement fallback)`);
    r.warnings = [...(r.warnings ?? []), "Done by re-placement: item-level adjustments were not carried over."];
    return r;
  }
}

const REPLACE_NOTE = "Implemented as a re-placement (remove item, append source range again) because the API has no direct trim/move/split: grades, effects and transforms on the original item are not carried over.";

export function registerEditing(reg: ToolRegistry): void {
  const category = "editing";

  reg.define({
    name: "clip_append", category,
    description: "Append media pool clips to the end of the current timeline (in order), optionally with source ranges and target tracks.",
    input: { timeline: timelineArg, clips: z.array(PlaceClip).min(1).max(500) },
    handler: async (a, ctx) => run(ctx, "edit.append", clean(a), (d) => `Placed ${(d as { placed: unknown[] }).placed.length} item(s).`, 300000),
  });
  reg.define({
    name: "clip_add", category,
    description: "Place one media pool clip on the timeline at a given record frame and track (AppendToTimeline with recordFrame).",
    input: { timeline: timelineArg, ...PlaceClip.shape },
    handler: async (a, ctx) => run(ctx, "edit.append", { timeline: a.timeline, clips: [clean({ clip: a.clip, sourceStart: a.sourceStart, sourceEnd: a.sourceEnd, trackIndex: a.trackIndex, recordFrame: a.recordFrame, mediaType: a.mediaType })] }, "Clip placed."),
  });
  reg.define({
    name: "clip_insert", category,
    description: "Place a clip at a record frame on a track that is empty there. The API has no ripple insert: to make room, move later clips first (clip_move) or use an empty track.",
    input: { timeline: timelineArg, ...PlaceClip.shape, recordFrame: frame },
    handler: async (a, ctx) => run(ctx, "edit.append", { timeline: a.timeline, clips: [clean({ ...a, timeline: undefined })] }, "Clip placed at record frame.", 120000),
  });
  reg.define({
    name: "clip_overwrite", category, destructive: true,
    description: "Overwrite the timeline range [recordFrame, recordFrame+length) on a track with a clip: overlapping items on that track are removed first, then the clip is placed.",
    input: { timeline: timelineArg, ...PlaceClip.shape, recordFrame: frame, trackIndex: z.number().int().min(1).default(1), length: z.number().int().min(1) },
    handler: async (a, ctx) => {
      const list = await ctx.bridge.call<{ items: { id: string; start: number; end: number; trackType: string; trackIndex: number }[] }>("timeline.clips", clean({ timeline: a.timeline, trackType: a.mediaType === "audio" ? "audio" : "video", trackIndex: a.trackIndex }));
      const end = a.recordFrame + a.length;
      const hits = list.items.filter((i) => i.start < end && i.end > a.recordFrame);
      if (hits.length) await ctx.bridge.call("edit.delete", { timeline: a.timeline, items: hits.map((h) => ({ itemId: h.id })), ripple: false });
      const placed = await ctx.bridge.call("edit.append", { timeline: a.timeline, clips: [clean({ clip: a.clip, sourceStart: a.sourceStart ?? 0, sourceEnd: (a.sourceStart ?? 0) + a.length, trackIndex: a.trackIndex, recordFrame: a.recordFrame, mediaType: a.mediaType })] });
      return { data: { removed: hits, placed }, warnings: hits.some((h) => h.start < a.recordFrame || h.end > end) ? ["Items partially overlapping the range were removed entirely (no partial trims via API)."] : [], message: `Overwrote ${hits.length} item(s).` };
    },
  });
  reg.define({
    name: "clip_replace", category, destructive: true,
    description: "Replace a timeline item with a different media pool clip at the same position and length.",
    input: { ...ItemRef, clip: clipRef, sourceStart: frame.default(0) },
    handler: async (a, ctx) => {
      const props = await ctx.bridge.call<{ item: { id: string; start: number; duration: number } }>("edit.get_properties", itemRef(a));
      await ctx.bridge.call("edit.delete", { timeline: a.timeline, items: [{ itemId: props.item.id }], ripple: false });
      const placed = await ctx.bridge.call("edit.append", { timeline: a.timeline, clips: [{ clip: a.clip, sourceStart: a.sourceStart, sourceEnd: a.sourceStart + props.item.duration, trackIndex: a.trackIndex, recordFrame: props.item.start, mediaType: a.trackType === "audio" ? "audio" : "video" }] });
      return { data: { replaced: props.item, placed }, message: "Item replaced." };
    },
  });
  reg.define({
    name: "clip_split", category, destructive: true,
    description: `Split a timeline item at an absolute timeline frame into two items. ${REPLACE_NOTE}`,
    input: { ...ItemRef, frame },
    handler: async (a, ctx) => run(ctx, "edit.replace_at", { ...itemRef(a), action: "split", frame: a.frame }, "Item split."),
  });
  reg.define({
    name: "clip_trim", category,
    description: "Trim frames from the head (trimStart) and/or tail (trimEnd) of a timeline item with native SetLeftOffset/SetRightOffset (Resolve 21+; linked audio follows). Negative values extend into handles. Does not ripple.",
    input: { ...ItemRef, trimStart: z.number().int().default(0), trimEnd: z.number().int().default(0), updateLinked: z.boolean().default(true), confirm: confirmFallback },
    handler: async (a, ctx) => {
      if (!a.trimStart && !a.trimEnd) throw new McpToolError("INVALID_ARGUMENT", "trimStart or trimEnd must be non-zero.");
      return nativeOr(ctx, "edit.trim", clean({ ...itemRef(a), trimStart: a.trimStart || undefined, trimEnd: a.trimEnd || undefined, updateLinked: a.updateLinked }), { ...itemRef(a), action: "trim", trimStart: Math.max(0, a.trimStart), trimEnd: Math.max(0, a.trimEnd) }, a.confirm, "Item trimmed.");
    },
  });
  reg.define({
    name: "clip_move", category,
    description: "Move a timeline item to a new record frame and/or track with Timeline.MoveItems (Resolve 21+; linked items follow; fails instead of overwriting when the destination is occupied).",
    input: { ...ItemRef, recordFrame: frame.optional(), toTrack: z.number().int().min(1).optional(), moveLinked: z.boolean().default(true), confirm: confirmFallback },
    handler: async (a, ctx) => {
      if (a.recordFrame === undefined && a.toTrack === undefined) throw new McpToolError("INVALID_ARGUMENT", "Give recordFrame and/or toTrack.");
      const cur = await ctx.bridge.call<{ item: { start: number } }>("edit.get_properties", itemRef(a));
      return nativeOr(ctx, "edit.move", clean({ ...itemRef(a), recordFrame: a.recordFrame, toTrack: a.toTrack, moveLinked: a.moveLinked }), clean({ ...itemRef(a), action: "move", recordFrame: a.recordFrame ?? cur.item.start, toTrack: a.toTrack }), a.confirm, "Item moved.");
    },
  });
  reg.define({
    name: "clip_set_position", category,
    description: "Set a timeline item's start frame (Timeline.MoveItems).",
    input: { ...ItemRef, recordFrame: frame, confirm: confirmFallback },
    handler: async (a, ctx) => nativeOr(ctx, "edit.move", { ...itemRef(a), recordFrame: a.recordFrame }, { ...itemRef(a), action: "move", recordFrame: a.recordFrame }, a.confirm, "Item moved."),
  });
  reg.define({
    name: "clip_set_in_out", category,
    description: "Change which source range a timeline item plays (source in inclusive, out exclusive) by setting its left/right offsets natively (Resolve 21+).",
    input: { ...ItemRef, sourceIn: frame, sourceOut: frame, confirm: confirmFallback },
    handler: async (a, ctx) => {
      if (a.sourceOut <= a.sourceIn) throw new McpToolError("INVALID_ARGUMENT", "sourceOut must be greater than sourceIn.");
      const p = await ctx.bridge.call<{ item: { leftOffset: number; rightOffset: number; duration: number } }>("edit.get_properties", itemRef(a));
      const total = p.item.leftOffset + p.item.duration + p.item.rightOffset;
      if (a.sourceOut > total) throw new McpToolError("INVALID_ARGUMENT", `sourceOut ${a.sourceOut} is beyond the clip's ${total} source frames.`);
      return nativeOr(ctx, "edit.trim", { ...itemRef(a), leftOffset: a.sourceIn, rightOffset: total - a.sourceOut }, { ...itemRef(a), action: "set_in_out", sourceIn: a.sourceIn, sourceOut: a.sourceOut }, a.confirm, "Source range changed.");
    },
  });
  reg.define({
    name: "clip_set_duration", category,
    description: "Set a timeline item's duration by moving its tail edit point within the available source media (native SetRightOffset).",
    input: { ...ItemRef, durationFrames: z.number().int().min(1), confirm: confirmFallback },
    handler: async (a, ctx) => {
      const p = await ctx.bridge.call<{ item: { leftOffset: number; rightOffset: number; duration: number } }>("edit.get_properties", itemRef(a));
      const right = p.item.rightOffset + (p.item.duration - a.durationFrames);
      if (right < 0) throw new McpToolError("INVALID_ARGUMENT", `Only ${p.item.duration + p.item.rightOffset} frames of source are available after the in point.`);
      return nativeOr(ctx, "edit.trim", { ...itemRef(a), rightOffset: right }, { ...itemRef(a), action: "set_in_out", sourceIn: p.item.leftOffset, sourceOut: p.item.leftOffset + a.durationFrames }, a.confirm, "Duration changed.");
    },
  });
  reg.define({
    name: "clip_delete", category, destructive: true,
    description: "Delete timeline items (ripple optional). Media pool clips are not affected.",
    input: { timeline: timelineArg, items: z.array(ItemRefSchema.omit({ timeline: true })).min(1), ripple: z.boolean().default(false) },
    handler: async (a, ctx) => run(ctx, "edit.delete", clean(a)),
  });
  reg.define({
    name: "clip_duplicate", category,
    description: "Duplicate a timeline item's source range to another position/track (default: right after the original).",
    input: { ...ItemRef, recordFrame: frame.optional(), toTrack: z.number().int().min(1).optional() },
    handler: async (a, ctx) => run(ctx, "edit.replace_at", clean({ ...itemRef(a), action: "duplicate", recordFrame: a.recordFrame, toTrack: a.toTrack }), "Item duplicated."),
  });
  reg.define({
    name: "clip_copy", category,
    description: "Copy a timeline item to this server's clipboard (remembers it for clip_paste). Resolve's own clipboard is not scriptable.",
    input: ItemRef,
    handler: async (a, ctx) => {
      const p = await ctx.bridge.call<{ item: { id: string; name: string } }>("edit.get_properties", itemRef(a));
      clipboard.item = { itemId: p.item.id, timeline: a.timeline };
      return { data: { copied: p.item }, message: `Copied '${p.item.name}'. Use clip_paste to paste the clip or its attributes.` };
    },
  });
  reg.define({
    name: "clip_paste", category,
    description: "Paste the clip_copy item: mode 'clip' places a duplicate at recordFrame/toTrack; mode 'attributes' pastes its attributes (transform, crop, composite, retime, effects, grade...) onto target items like Edit > Paste Attributes (Resolve 21+).",
    input: { mode: z.enum(["clip", "attributes"]).default("clip"), recordFrame: frame.optional(), toTrack: z.number().int().min(1).optional(), targets: z.array(ItemRefSchema.omit({ timeline: true })).optional(), attributes: z.record(z.string(), z.boolean()).optional().describe("CopyAttributesOptions, e.g. { allVideoAttributes: true } or { colorCorrection: true }") },
    handler: async (a, ctx) => {
      if (!clipboard.item) throw new McpToolError("INVALID_STATE", "Clipboard is empty; call clip_copy first.");
      if (a.mode === "clip") return run(ctx, "edit.replace_at", clean({ ...clipboard.item, action: "duplicate", recordFrame: a.recordFrame, toTrack: a.toTrack }), "Clip pasted.");
      if (!a.targets?.length) throw new McpToolError("INVALID_ARGUMENT", "targets are required for mode 'attributes'.");
      return run(ctx, "edit.copy_attributes", clean({ timeline: clipboard.item.timeline, source: { itemId: clipboard.item.itemId }, targets: a.targets, options: a.attributes }), "Attributes pasted.");
    },
  });
  reg.define({
    name: "clip_paste_attributes", category,
    description: "Paste attributes from one timeline item onto others (TimelineItem.CopyAttributes, Resolve 21+). Default copies all video attributes.",
    input: { timeline: timelineArg, source: ItemRefSchema.omit({ timeline: true }), targets: z.array(ItemRefSchema.omit({ timeline: true })).min(1), attributes: z.record(z.string(), z.boolean()).optional() },
    handler: async (a, ctx) => run(ctx, "edit.copy_attributes", clean({ timeline: a.timeline, source: a.source, targets: a.targets, options: a.attributes }), "Attributes pasted."),
  });
  reg.define({
    name: "timeline_delete_gaps", category, destructive: true,
    description: "Delete all gaps between clips, rippling content left (Timeline.DeleteGaps, Resolve 21+).",
    input: { timeline: timelineArg },
    handler: async (a, ctx) => run(ctx, "edit.delete_gaps", clean(a), "Gaps deleted."),
  });
  reg.define({
    name: "clip_export_frame", category,
    description: "Export one frame of a timeline item as an image file (TimelineItem.ExportFrame, Resolve 21+).",
    input: { ...ItemRef, frameOffset: z.number().int().min(0).default(0).describe("0-based offset from the item start"), path: z.string().min(3) },
    handler: async (a, ctx) => run(ctx, "edit.export_frame", { ...itemRef(a), frameOffset: a.frameOffset, path: ctx.paths.write(a.path) }),
  });

  reg.define({ name: "clip_get_properties", category, readOnly: true, description: "Read a timeline item's Inspector properties (Pan, Tilt, ZoomX/Y, RotationAngle, Crop*, Opacity, CompositeMode, RetimeProcess...).", input: ItemRef, handler: async (a, ctx) => run(ctx, "edit.get_properties", itemRef(a)) });
  reg.define({
    name: "clip_set_properties", category,
    description: "Set any documented timeline item properties (verified by readback). Keys: Pan, Tilt, ZoomX, ZoomY, ZoomGang, RotationAngle, AnchorPointX/Y, Pitch, Yaw, FlipX, FlipY, CropLeft/Right/Top/Bottom, CropSoftness, CropRetain, DynamicZoomEase, CompositeMode, Opacity, Distortion, RetimeProcess, MotionEstimation, Scaling, ResizeFilter.",
    input: { ...ItemRef, properties: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])) },
    handler: async (a, ctx) => run(ctx, "edit.set_properties", { ...itemRef(a), properties: a.properties }),
  });
  const prop = (tool: string, description: string, input: z.ZodRawShape, map: (a: Record<string, unknown>) => Record<string, unknown>) =>
    reg.define({ name: tool, category, description, input: { ...ItemRef, ...input }, handler: async (a, ctx) => run(ctx, "edit.set_properties", { ...itemRef(a as never), properties: clean(map(a as Record<string, unknown>)) }) });
  prop("clip_set_opacity", "Set item opacity 0-100.", { opacity: z.number().min(0).max(100) }, (a) => ({ Opacity: a.opacity }));
  prop("clip_set_transform", "Set item transform: pan/tilt (pixels), zoom, rotation (degrees), anchor, flips.", {
    pan: z.number().optional(), tilt: z.number().optional(), zoomX: z.number().min(0).max(100).optional(), zoomY: z.number().min(0).max(100).optional(),
    rotation: z.number().min(-360).max(360).optional(), anchorX: z.number().optional(), anchorY: z.number().optional(), flipX: z.boolean().optional(), flipY: z.boolean().optional(),
  }, (a) => ({ Pan: a.pan, Tilt: a.tilt, ZoomX: a.zoomX, ZoomY: a.zoomY, RotationAngle: a.rotation, AnchorPointX: a.anchorX, AnchorPointY: a.anchorY, FlipX: a.flipX, FlipY: a.flipY }));
  prop("clip_set_crop", "Crop an item (pixels from each edge), softness and retain-image-position.", {
    left: z.number().min(0).optional(), right: z.number().min(0).optional(), top: z.number().min(0).optional(), bottom: z.number().min(0).optional(), softness: z.number().min(-100).max(100).optional(), retain: z.boolean().optional(),
  }, (a) => ({ CropLeft: a.left, CropRight: a.right, CropTop: a.top, CropBottom: a.bottom, CropSoftness: a.softness, CropRetain: a.retain }));
  prop("clip_set_rotation", "Rotate an item (degrees).", { degrees: z.number().min(-360).max(360) }, (a) => ({ RotationAngle: a.degrees }));
  prop("clip_set_zoom", "Zoom an item uniformly (1 = 100%) or per-axis.", { zoom: z.number().min(0).max(100).optional(), zoomX: z.number().min(0).max(100).optional(), zoomY: z.number().min(0).max(100).optional() }, (a) => ({ ZoomX: a.zoomX ?? a.zoom, ZoomY: a.zoomY ?? a.zoom }));
  prop("clip_set_position_xy", "Reposition an item in frame (Pan = X, Tilt = Y, in pixels).", { x: z.number(), y: z.number() }, (a) => ({ Pan: a.x, Tilt: a.y }));
  prop("clip_set_composite_mode", "Set an item's composite (blend) mode by Resolve's numeric mode id (0 Normal, 1 Add, 2 Subtract, 3 Difference, 4 Multiply, 5 Screen, 6 Overlay, ...).", { mode: z.number().int().min(0).max(40) }, (a) => ({ CompositeMode: a.mode }));

  reg.define({
    name: "clip_set_audio_video_link", category,
    description: "Link or unlink timeline items (e.g. a video item and its audio).",
    input: { timeline: timelineArg, items: z.array(ItemRefSchema.omit({ timeline: true })).min(1), linked: z.boolean() },
    handler: async (a, ctx) => run(ctx, "edit.link", clean(a)),
  });
  reg.define({ name: "clip_set_enabled", category, description: "Enable or disable a timeline item.", input: { ...ItemRef, enabled: z.boolean() }, handler: async (a, ctx) => run(ctx, "edit.set_enabled", { ...itemRef(a), enabled: a.enabled }) });
  reg.define({ name: "clip_set_color", category, description: "Set or clear (null) a timeline item's clip color.", input: { ...ItemRef, color: z.enum(CLIP_COLORS).nullable() }, handler: async (a, ctx) => run(ctx, "edit.set_item_color", { ...itemRef(a), color: a.color }) });
  reg.define({ name: "clip_add_marker", category, description: "Add a marker on a timeline item (frame relative to the item's start).", input: { ...ItemRef, frame, color: z.enum(MARKER_COLORS).default("Blue"), name: z.string().default(""), note: z.string().default("") }, handler: async (a, ctx) => run(ctx, "edit.add_marker", { ...itemRef(a), frame: a.frame, color: a.color, name: a.name, note: a.note }) });
  reg.define({ name: "clip_stabilize", category, description: "Run Resolve's stabilizer on a timeline item.", input: ItemRef, handler: async (a, ctx) => run(ctx, "edit.stabilize", itemRef(a), "Stabilized.", 1800000) });
  reg.define({ name: "clip_smart_reframe", category, description: "Run Smart Reframe on a timeline item (Studio; useful for vertical deliverables).", input: ItemRef, handler: async (a, ctx) => run(ctx, "edit.smart_reframe", itemRef(a), "Smart Reframe applied.", 1800000) });
  reg.define({
    name: "clip_reverse", category,
    description: "Play a timeline item backwards (Fusion TimeStretcher in the item's composition; item length unchanged).",
    input: ItemRef,
    handler: async (a, ctx) => run(ctx, "speed.fusion", { ...itemRef(a), mode: "reverse" }, "Reverse applied via Fusion."),
  });
  reg.define({
    name: "clip_freeze_frame", category,
    description: "Freeze frame. engine 'resolve' (default) sets clip speed to 0% (SetSpeed, Resolve 21+: holds the first frame); engine 'fusion' holds a chosen composition frame with a TimeStretcher.",
    input: { ...ItemRef, engine: z.enum(["resolve", "fusion"]).default("resolve"), frame: z.number().min(0).default(0).describe("fusion engine: composition frame to hold") },
    handler: async (a, ctx) => a.engine === "fusion" ? run(ctx, "speed.fusion", { ...itemRef(a), mode: "freeze", frame: a.frame }, "Freeze frame applied via Fusion.") : run(ctx, "speed.set_native", { ...itemRef(a), percentage: 0 }, "Freeze frame (0% speed) applied."),
  });
  reg.define({
    name: "clip_set_speed", category,
    description: "Change clip speed (0.5 = 50% slow motion, 2 = 200%). engine 'resolve' (default) uses TimelineItem.SetSpeed (Resolve 21+; item length changes, ripple optional); engine 'fusion' retimes inside the clip's Fusion composition without changing its length.",
    input: { ...ItemRef, speed: z.number().min(0.01).max(100), engine: z.enum(["resolve", "fusion"]).default("resolve"), ripple: z.boolean().default(false), pitchCorrection: z.boolean().optional(), interpolate: z.boolean().default(true) },
    handler: async (a, ctx) => a.engine === "fusion"
      ? run(ctx, "speed.fusion", { ...itemRef(a), mode: "constant", speed: a.speed, interpolate: a.interpolate }, `Speed ${a.speed}x applied via Fusion.`)
      : run(ctx, "speed.set_native", clean({ ...itemRef(a), percentage: a.speed * 100, ripple: a.ripple, pitchCorrection: a.pitchCorrection }), `Speed set to ${a.speed * 100}%.`),
  });
  reg.define({
    name: "clip_insert_generator", category,
    description: "Insert a generator at the playhead (standard e.g. 'Solid Color', '10 Step'; fusion; or OFX by name).",
    input: { timeline: timelineArg, name: z.string().min(1), kind: z.enum(["standard", "fusion", "ofx"]).default("standard"), timecode: z.string().optional(), frame: frame.optional() },
    handler: async (a, ctx) => run(ctx, "edit.insert_generator", clean(a)),
  });
}
