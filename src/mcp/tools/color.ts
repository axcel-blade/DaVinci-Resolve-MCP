import { join } from "node:path";
import { z } from "zod";
import { frameStats } from "../../utils/media-probe.js";
import { COLOR_PRESETS, type LookParams } from "../../design-engine/presets/presets.js";
import { absPath, ItemRef, ItemRefSchema, timelineArg, type ToolContext, type ToolRegistry, clean, itemRef, run } from "./registry.js";
import { McpToolError } from "../../utils/errors.js";

const rgb = z.tuple([z.number(), z.number(), z.number()]);
const node = z.number().int().min(1).default(1).describe("1-based color node index");
const preserve = z.boolean().default(true).describe("Create a new local grade version first so the previous grade can be restored");

export const LookSchema = z.object({
  exposure: z.number().min(-5).max(5).optional(),
  temperature: z.number().min(-1).max(1).optional(),
  tint: z.number().min(-1).max(1).optional(),
  lift: rgb.optional(), gamma: rgb.optional(), gain: rgb.optional(),
  contrast: z.number().min(0).max(3).optional(), pivot: z.number().min(0).max(1).optional(),
  saturation: z.number().min(0).max(3).optional(), vibrance: z.number().min(-1).max(1).optional(),
  shadowsTint: rgb.optional(), highlightsTint: rgb.optional(),
  fade: z.number().min(0).max(0.5).optional(), monochrome: z.boolean().optional(),
});

/** Generate a LUT from look params and apply it to a node. */
async function applyLook(ctx: ToolContext, ref: object, params: LookParams, nodeIndex: number, keep: boolean, name: string) {
  const path = ctx.paths.write(join(ctx.config.paths.lutDir, `${name.replace(/[^\w.-]+/g, "_")}-${Date.now()}.cube`));
  const lut = await ctx.bridge.call("color.generate_lut", { path, params, size: 33, title: name });
  const applied = await ctx.bridge.call("color.set_lut", { ...ref, lutPath: path, nodeIndex, preserve: keep });
  return { lut, applied };
}

export function registerColor(reg: ToolRegistry): void {
  const category = "color";
  const NOT = (what: string) => `${what} has no scripting API.`;

  reg.define({ name: "color_get_nodes", category, readOnly: true, description: "List the item's color nodes (label, LUT, tools) — Resolve 19+.", input: ItemRef, handler: async (a, ctx) => run(ctx, "color.nodes", itemRef(a)) });
  reg.unsupported("color_create_node", category, "Add a serial/parallel color node.", NOT("Adding color nodes"),
    "Add nodes in the Color page (Alt+S), or apply a DRX/PowerGrade with the node structure you want via color_apply_look { drxPath }.", { ...ItemRef });
  reg.unsupported("color_delete_node", category, "Delete a color node.", NOT("Deleting color nodes"), "Use color_set_node_enabled to bypass a node, or color_reset to reset all grades.", { ...ItemRef });
  reg.define({ name: "color_set_node_enabled", category, description: "Enable/bypass a color node (Resolve 19.1+).", input: { ...ItemRef, nodeIndex: node, enabled: z.boolean() }, handler: async (a, ctx) => run(ctx, "color.node_enabled", { ...itemRef(a), nodeIndex: a.nodeIndex, enabled: a.enabled }) });

  reg.define({
    name: "color_set_cdl", category,
    description: "Apply an ASC CDL to a node: slope (≈ gain), offset, power (≈ inverse gamma), saturation. This is the scriptable primary correction.",
    input: { ...ItemRef, nodeIndex: node, slope: rgb.default([1, 1, 1]), offset: rgb.default([0, 0, 0]), power: rgb.default([1, 1, 1]), saturation: z.number().min(0).max(4).default(1), preserve },
    handler: async (a, ctx) => run(ctx, "color.set_cdl", { ...itemRef(a), nodeIndex: a.nodeIndex, slope: a.slope, offset: a.offset, power: a.power, saturation: a.saturation, preserve: a.preserve }),
  });
  const viaCdl = (tool: string, label: string, map: (v: [number, number, number]) => object) =>
    reg.define({
      name: tool, category,
      description: `${label} via ASC CDL on a node (the Color-page wheels themselves are not scriptable). Values are RGB triples.`,
      input: { ...ItemRef, nodeIndex: node, value: rgb, preserve },
      handler: async (a, ctx) => run(ctx, "color.set_cdl", { ...itemRef(a), nodeIndex: a.nodeIndex, ...map(a.value), preserve: a.preserve }, `${label} applied as CDL.`),
    });
  viaCdl("color_set_lift", "Lift (shadows) — mapped to CDL offset", (v) => ({ offset: v }));
  viaCdl("color_set_gamma", "Gamma (midtones) — mapped to CDL power = 1/gamma", (v) => ({ power: v.map((x) => (x > 0 ? 1 / x : 1)) }));
  viaCdl("color_set_gain", "Gain (highlights) — mapped to CDL slope", (v) => ({ slope: v }));
  viaCdl("color_set_offset", "Offset — CDL offset", (v) => ({ offset: v }));
  reg.define({ name: "color_set_saturation", category, description: "Set saturation via CDL saturation (1 = neutral).", input: { ...ItemRef, nodeIndex: node, saturation: z.number().min(0).max(4), preserve }, handler: async (a, ctx) => run(ctx, "color.set_cdl", { ...itemRef(a), nodeIndex: a.nodeIndex, saturation: a.saturation, preserve: a.preserve }) });

  const lutAdjust = (tool: string, label: string, field: keyof LookParams, schema: z.ZodNumber) =>
    reg.define({
      name: tool, category,
      description: `${label}. Not directly scriptable; implemented by generating a 3D LUT with this adjustment and applying it to the node (replaces that node's LUT).`,
      input: { ...ItemRef, nodeIndex: node, value: schema, pivot: z.number().min(0).max(1).optional(), preserve },
      handler: async (a, ctx) => {
        const r = await applyLook(ctx, itemRef(a), clean({ [field]: a.value, pivot: a.pivot } as LookParams), a.nodeIndex, a.preserve, tool);
        return { data: r, message: `${label} applied as generated LUT on node ${a.nodeIndex}.` };
      },
    });
  lutAdjust("color_set_contrast", "Contrast (1 = neutral) around pivot", "contrast", z.number().min(0).max(3));
  lutAdjust("color_set_temperature", "White-balance temperature (-1 cool .. +1 warm)", "temperature", z.number().min(-1).max(1));
  lutAdjust("color_set_tint", "Tint (-1 green .. +1 magenta)", "tint", z.number().min(-1).max(1));
  lutAdjust("color_set_exposure", "Exposure in stops", "exposure", z.number().min(-5).max(5));

  reg.define({
    name: "color_apply_lut", category,
    description: "Apply a LUT file (.cube etc.) to a color node.",
    input: { ...ItemRef, lutPath: absPath, nodeIndex: node, preserve },
    handler: async (a, ctx) => run(ctx, "color.set_lut", { ...itemRef(a), lutPath: ctx.paths.read(a.lutPath, { kind: "file" }), nodeIndex: a.nodeIndex, preserve: a.preserve }),
  });
  reg.define({
    name: "color_create_lut", category,
    description: "Generate a 3D .cube LUT from look parameters (exposure, white balance, lift/gamma/gain, contrast, saturation, split toning, fade, monochrome) or a named preset.",
    input: { path: absPath.refine((p) => p.toLowerCase().endsWith(".cube"), "must end with .cube"), preset: z.enum(Object.keys(COLOR_PRESETS) as [string, ...string[]]).optional(), params: LookSchema.optional(), size: z.number().int().min(17).max(65).default(33), overwrite: z.boolean().default(false) },
    handler: async (a, ctx) => {
      const params = { ...(a.preset ? COLOR_PRESETS[a.preset]!.params : {}), ...(a.params ?? {}) };
      return run(ctx, "color.generate_lut", { path: ctx.paths.write(a.path, { overwrite: a.overwrite }), params, size: a.size, overwrite: a.overwrite, title: a.preset ?? "MCP LUT" });
    },
  });
  reg.define({
    name: "color_export_item_lut", category,
    description: "Export an item's full grade as a LUT file (TimelineItem.ExportLUT).",
    input: { ...ItemRef, path: absPath, size: z.enum(["17", "33", "65", "panasonic"]).default("33"), overwrite: z.boolean().default(false) },
    handler: async (a, ctx) => run(ctx, "color.export_lut", { ...itemRef(a), path: ctx.paths.write(a.path, { overwrite: a.overwrite }), size: a.size, overwrite: a.overwrite }),
  });
  reg.define({
    name: "color_copy_grade", category,
    description: "Copy the grade of one timeline item to other items (TimelineItem.CopyGrades).",
    input: { timeline: timelineArg, source: ItemRefSchema.omit({ timeline: true }), targets: z.array(ItemRefSchema.omit({ timeline: true })).min(1) },
    handler: async (a, ctx) => run(ctx, "color.copy_grade", clean(a)),
  });
  reg.define({
    name: "color_paste_grade", category,
    description: "Paste (apply) a grade onto items: from another item (source) or from a .drx grade file.",
    input: { timeline: timelineArg, targets: z.array(ItemRefSchema.omit({ timeline: true })).min(1), source: ItemRefSchema.omit({ timeline: true }).optional(), drxPath: absPath.optional(), keyframeMode: z.enum(["none", "source_timecode", "start_frames"]).default("none") },
    handler: async (a, ctx) => {
      if (a.drxPath) return run(ctx, "color.apply_drx", clean({ timeline: a.timeline, path: ctx.paths.read(a.drxPath, { kind: "file" }), items: a.targets, keyframeMode: a.keyframeMode }));
      if (!a.source) throw new McpToolError("INVALID_ARGUMENT", "Give source (an item) or drxPath.");
      return run(ctx, "color.copy_grade", clean({ timeline: a.timeline, source: a.source, targets: a.targets }));
    },
  });
  reg.define({
    name: "color_match_shots", category,
    description: "Match shots. Shot Match itself is not scriptable, so: mode 'copy' copies the reference item's grade onto targets (CopyGrades); mode 'auto' runs Resolve's Auto Color balance on each target (ApplyAutoColor, Resolve 21+).",
    input: { timeline: timelineArg, mode: z.enum(["copy", "auto"]).default("copy"), reference: ItemRefSchema.omit({ timeline: true }).optional(), targets: z.array(ItemRefSchema.omit({ timeline: true })).min(1) },
    handler: async (a, ctx) => {
      if (a.mode === "copy") {
        if (!a.reference) throw new McpToolError("INVALID_ARGUMENT", "reference is required for mode 'copy'.");
        return run(ctx, "color.copy_grade", clean({ timeline: a.timeline, source: a.reference, targets: a.targets }), "Reference grade copied to targets.");
      }
      const out = [];
      for (const t of a.targets) out.push(await ctx.bridge.call("color.auto_color", clean({ timeline: a.timeline, ...t })).catch((e) => ({ error: (e as Error).message })));
      const bad = out.filter((o) => (o as { error?: string }).error).length;
      return { data: out, status: bad ? (bad === out.length ? "unsupported" : "partial") : "ok", message: `Auto Color applied to ${out.length - bad}/${out.length} item(s).` };
    },
  });
  reg.define({ name: "color_auto_balance", category, description: "Resolve Auto Color: automatic balance and grade for an item (ApplyAutoColor, Resolve 21+).", input: ItemRef, handler: async (a, ctx) => run(ctx, "color.auto_color", itemRef(a), "Auto Color applied.") });
  reg.define({ name: "color_get_cdl", category, readOnly: true, description: "Read a node's primaries as an ASC CDL (GetCDL, Resolve 21+) — read before changing to preserve existing settings.", input: { ...ItemRef, nodeIndex: node }, handler: async (a, ctx) => run(ctx, "color.get_cdl", { ...itemRef(a), nodeIndex: a.nodeIndex }) });
  reg.define({ name: "color_set_node_label", category, description: "Label a color node (Graph.SetNodeLabel, Resolve 21+).", input: { ...ItemRef, nodeIndex: node, label: z.string().min(1).max(100) }, handler: async (a, ctx) => run(ctx, "color.node_label", { ...itemRef(a), nodeIndex: a.nodeIndex, label: a.label }) });
  reg.define({
    name: "color_get_scopes", category, readOnly: true, support: "integration",
    description: "Approximate scopes for the current frame: exports the frame as a still and measures luma/chroma statistics (YMIN/YAVG/YMAX, saturation, hue) with FFmpeg signalstats. Requires FFmpeg.",
    input: {},
    handler: async (_a, ctx) => {
      const path = ctx.paths.write(join(ctx.config.paths.outputDir, "scopes", `frame-${Date.now()}.png`));
      await ctx.bridge.call("color.export_frame", { path });
      const stats = await frameStats(ctx.config.ffmpegPath, path);
      return { data: { still: path, stats, note: "Values are 8-bit (0-255) from the exported still." } };
    },
  });
  reg.unsupported("color_create_power_window", category, "Create a Power Window.", NOT("Power Windows"), "Draw windows in the Color page, or use a Fusion mask (fusion_create_mask) with an effect node.", { ...ItemRef });
  reg.unsupported("color_track_window", category, "Track a Power Window.", NOT("The window tracker"), "Track in the Color page, or use Magic Mask (color_magic_mask) on Studio.", { ...ItemRef });
  reg.define({ name: "color_magic_mask", category, description: "Run Magic Mask tracking on the current node (Studio; strokes must already be drawn).", input: { ...ItemRef, mode: z.enum(["forward", "backward", "bidirectional"]).default("bidirectional") }, handler: async (a, ctx) => run(ctx, "color.magic_mask", { ...itemRef(a), mode: a.mode }, "Magic Mask processed.", 1800000) });

  reg.define({
    name: "color_apply_look", category,
    description: "Apply a cinematic look: a built-in preset (hollywood_cinematic, teal_orange, filmic_warm, vintage_film, black_and_white, moody_cinematic, bright_commercial, natural_documentary, desaturated_cinematic, night_cinematic), custom params, or a .drx grade. Applies to one item or every video item on a track.",
    input: {
      ...ItemRef,
      preset: z.enum(Object.keys(COLOR_PRESETS) as [string, ...string[]]).optional(),
      params: LookSchema.optional(),
      intensity: z.number().min(0).max(1).default(1).describe("Blend the preset toward neutral (0..1)"),
      drxPath: absPath.optional(),
      nodeIndex: node,
      wholeTrack: z.boolean().default(false),
      preserve,
    },
    handler: async (a, ctx) => {
      let targets: object[] = [itemRef(a)];
      if (a.wholeTrack) {
        const list = await ctx.bridge.call<{ items: { id: string; type?: string }[] }>("timeline.clips", clean({ timeline: a.timeline, trackType: "video", trackIndex: a.trackIndex }));
        targets = list.items.filter((i) => i.type !== "transition").map((i) => ({ timeline: a.timeline, itemId: i.id }));
      }
      if (a.drxPath) {
        const p = ctx.paths.read(a.drxPath, { kind: "file" });
        return run(ctx, "color.apply_drx", clean({ timeline: a.timeline, path: p, items: targets.map((t) => ({ ...t, timeline: undefined })) }));
      }
      if (!a.preset && !a.params) throw new McpToolError("INVALID_ARGUMENT", "Give preset, params or drxPath.");
      const base = a.preset ? COLOR_PRESETS[a.preset]!.params : {};
      const params = scaleLook({ ...base, ...(a.params ?? {}) }, a.intensity);
      const path = ctx.paths.write(join(ctx.config.paths.lutDir, `${a.preset ?? "custom"}-${Date.now()}.cube`));
      await ctx.bridge.call("color.generate_lut", { path, params, size: 33, title: a.preset ?? "custom" });
      const results = [];
      const warnings: string[] = [];
      for (const t of targets) {
        try {
          results.push(await ctx.bridge.call("color.set_lut", { ...t, lutPath: path, nodeIndex: a.nodeIndex, preserve: a.preserve }));
        } catch (e) {
          warnings.push(`${JSON.stringify(t)}: ${(e as Error).message}`);
        }
      }
      if (!results.length) throw new McpToolError("OPERATION_FAILED", `Look could not be applied to any item. ${warnings.join(" | ")}`);
      return { data: { lut: path, params, applied: results.length, results }, warnings, status: warnings.length ? "partial" : "ok", message: `Look '${a.preset ?? "custom"}' applied to ${results.length}/${targets.length} item(s).` };
    },
  });
  reg.define({ name: "color_list_presets", category, readOnly: true, description: "List the cinematic look presets and their parameters.", input: {}, handler: async () => ({ data: COLOR_PRESETS }) });
  reg.define({ name: "color_get_properties", category, readOnly: true, description: "Grade-related state of an item: versions, nodes (19+), color group.", input: ItemRef, handler: async (a, ctx) => {
    const versions = await ctx.bridge.call("color.versions", itemRef(a));
    const nodes = await ctx.bridge.call("color.nodes", itemRef(a)).catch((e) => ({ unavailable: (e as Error).message }));
    return { data: { versions, nodes } };
  } });
  reg.define({ name: "color_versions", category, readOnly: true, description: "List local/remote grade versions of an item.", input: ItemRef, handler: async (a, ctx) => run(ctx, "color.versions", itemRef(a)) });
  reg.define({ name: "color_version_load", category, description: "Switch an item to a named grade version (e.g. restore the version saved before an MCP change).", input: { ...ItemRef, name: z.string(), remote: z.boolean().default(false) }, handler: async (a, ctx) => run(ctx, "color.version_load", { ...itemRef(a), name: a.name, remote: a.remote }) });
  reg.define({ name: "color_version_add", category, description: "Add a new grade version to an item.", input: { ...ItemRef, name: z.string(), remote: z.boolean().default(false) }, handler: async (a, ctx) => run(ctx, "color.version_add", { ...itemRef(a), name: a.name, remote: a.remote }) });
  reg.define({ name: "color_reset", category, destructive: true, description: "Reset all grades on an item (Resolve 19+). A version is saved first when preserve is true.", input: { ...ItemRef, preserve }, handler: async (a, ctx) => run(ctx, "color.reset", { ...itemRef(a), preserve: a.preserve }) });
  reg.define({ name: "color_groups", category, readOnly: true, description: "List color groups.", input: {}, handler: async (_a, ctx) => run(ctx, "color.groups") });
  reg.define({ name: "color_assign_group", category, description: "Assign an item to a color group (created if missing).", input: { ...ItemRef, group: z.string(), create: z.boolean().default(true) }, handler: async (a, ctx) => run(ctx, "color.assign_group", { ...itemRef(a), group: a.group, create: a.create }) });
  reg.define({
    name: "color_grab_still", category, description: "Grab a gallery still of the current frame (stores the grade); optionally export it.",
    input: { timeline: timelineArg, exportFolder: absPath.optional(), format: z.enum(["png", "jpg", "tif", "dpx", "cin", "exr", "bmp", "tga", "ppm"]).default("png") },
    handler: async (a, ctx) => run(ctx, "color.grab_still", clean({ ...a, exportFolder: a.exportFolder ? ctx.paths.write(a.exportFolder, { dir: true }) : undefined })),
  });
}

function scaleLook(p: LookParams, k: number): LookParams {
  if (k >= 1) return p;
  const lerp = (v: number | undefined, neutral: number) => (v === undefined ? undefined : neutral + (v - neutral) * k);
  const lerp3 = (v: [number, number, number] | undefined, n: number) => (v ? (v.map((x) => n + (x - n) * k) as [number, number, number]) : undefined);
  return clean({
    exposure: lerp(p.exposure, 0), temperature: lerp(p.temperature, 0), tint: lerp(p.tint, 0),
    lift: lerp3(p.lift, 0), gamma: lerp3(p.gamma, 1), gain: lerp3(p.gain, 1),
    contrast: lerp(p.contrast, 1), pivot: p.pivot, saturation: lerp(p.saturation, 1), vibrance: lerp(p.vibrance, 0),
    shadowsTint: lerp3(p.shadowsTint, 0), highlightsTint: lerp3(p.highlightsTint, 0), fade: lerp(p.fade, 0),
    monochrome: p.monochrome && k >= 0.5 ? true : undefined,
  });
}
