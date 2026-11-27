import { z } from "zod";
import { runLuaHelper } from "../../resolve/bridge/lua-adapter.js";
import { ItemRef, timelineArg, type ToolRegistry, clean, itemRef, run } from "./common.js";

/** Fusion nodes usable with engine 'fusion' (validated by Fusion at AddTool time). */
export const FUSION_EFFECTS: Record<string, { regId: string; description: string; keyInputs: string[] }> = {
  blur: { regId: "Blur", description: "Gaussian blur", keyInputs: ["XBlurSize", "YBlurSize"] },
  glow: { regId: "Glow", description: "Glow", keyInputs: ["Glow", "GlowSize"] },
  soft_glow: { regId: "SoftGlow", description: "Soft glow", keyInputs: ["Gain", "Threshold"] },
  sharpen: { regId: "Sharpen", description: "Sharpen", keyInputs: ["Amount"] },
  unsharp_mask: { regId: "UnsharpMask", description: "Unsharp mask", keyInputs: ["XFilterSize", "Gain"] },
  film_grain: { regId: "FilmGrain", description: "Film grain", keyInputs: ["Size", "Strength"] },
  grain: { regId: "Grain", description: "Simple grain", keyInputs: ["Power"] },
  defocus: { regId: "Defocus", description: "Lens defocus", keyInputs: ["DefocusSize"] },
  directional_blur: { regId: "DirectionalBlur", description: "Motion/directional blur", keyInputs: ["Length", "Angle"] },
  lens_distort: { regId: "LensDistort", description: "Lens distortion", keyInputs: [] },
  camera_shake: { regId: "CameraShake", description: "Camera shake", keyInputs: ["XDeviation", "YDeviation"] },
  rays: { regId: "Rays", description: "Light rays", keyInputs: [] },
  highlight: { regId: "Highlight", description: "Highlight streaks", keyInputs: [] },
  color_corrector: { regId: "ColorCorrector", description: "Fusion color corrector", keyInputs: ["MasterSaturation"] },
  brightness_contrast: { regId: "BrightnessContrast", description: "Brightness/contrast", keyInputs: ["Brightness", "Contrast"] },
  chroma_key: { regId: "DeltaKeyer", description: "Green/blue screen keyer", keyInputs: ["Background"] },
  luma_key: { regId: "LumaKeyer", description: "Luma keyer", keyInputs: ["Low", "High"] },
  fast_noise: { regId: "FastNoise", description: "Procedural noise", keyInputs: [] },
  transform: { regId: "Transform", description: "Fusion transform", keyInputs: ["Center", "Size", "Angle"] },
};

/** Friendly names -> installed ResolveFX names (resolved against GetEffectsList at run time). */
export const EFFECT_ALIASES: Record<string, string> = {
  blur: "Gaussian Blur", glow: "Glow", sharpen: "Sharpen", film_grain: "Film Grain", vignette: "Vignette",
  noise_reduction: "Noise Reduction", lens_distortion: "Lens Distortion", chromatic_aberration: "Chromatic Aberration",
  light_rays: "Light Rays", lens_flare: "Lens Flare", stabilizer: "Stabilizer", mosaic: "Mosaic Blur", warp: "Warper",
  sharpen_edges: "Sharpen Edges", camera_shake: "Camera Shake", prism_blur: "Prism Blur", aperture_diffraction: "Aperture Diffraction",
};

export const TRANSITIONS = {
  simple: ["Cross Dissolve", "Additive Dissolve", "Blur Dissolve", "Dip To Color Dissolve", "Non-Additive Dissolve", "Smooth Cut", "Barn Door", "Clock Wipe", "Center Wipe", "Edge Wipe", "Heart", "Iris", "Radial Wipe", "Spiral Wipe", "Star", "Venetian Blind Wipe", "Wipe", "Push", "Slide", "Split", "Band Wipe", "Box", "Cross Iris", "Diamond Iris", "Eye", "Hexagon Iris", "Oval Iris", "Pentagon Iris", "Square Iris", "Triangle Iris"],
  audio: ["Cross Fade +3 dB", "Cross Fade 0 dB", "Cross Fade -3 dB"],
};

export function registerEffects(reg: ToolRegistry): void {
  const category = "effects";

  reg.define({
    name: "effect_list", category, readOnly: true,
    description: "List effects installed in this Resolve (Resolve.GetEffectsList: ResolveFX/OFX and Fusion effects; mediaType video|audio|photo). With fusionNodes: true also lists the Fusion node aliases usable with engine 'fusion'.",
    input: { mediaType: z.enum(["video", "audio", "photo"]).optional(), category: z.enum(["ofx", "fusion", "audio"]).optional(), query: z.string().optional(), fusionNodes: z.boolean().default(false), registry: z.boolean().default(false).describe("Ask Fusion (Lua helper) for every registered Fusion tool") },
    handler: async (a, ctx) => {
      if (a.registry) {
        const info = await ctx.bridge.installInfo();
        return { data: await runLuaHelper(info.fuscript, "list_tools", {}) };
      }
      const r = await ctx.bridge.call<{ count: number }>("fx.list", clean({ mediaType: a.mediaType, category: a.category, query: a.query }));
      return { data: { ...r, aliases: EFFECT_ALIASES, ...(a.fusionNodes ? { fusionNodes: FUSION_EFFECTS } : {}) }, message: `${r.count} effect(s) available.` };
    },
  });
  reg.define({
    name: "effect_search", category, readOnly: true, description: "Search installed effects by name or id (e.g. 'blur', 'grain', 'lens').",
    input: { query: z.string().min(1), mediaType: z.enum(["video", "audio", "photo"]).optional() },
    handler: async (a, ctx) => run(ctx, "fx.list", clean(a), (d) => `${(d as { count: number }).count} match(es).`),
  });
  reg.define({
    name: "effect_apply", category,
    description: "Apply an effect to a timeline item. engine 'resolve' (default) uses TimelineItem.AddEffect with an installed effect name/id (e.g. 'Gaussian Blur', 'Film Grain', 'Vignette', 'Lens Flare', or an alias like blur/film_grain/vignette). engine 'fusion' inserts a Fusion node into the item's composition (parameters are then settable with effect_set_parameters).",
    input: { ...ItemRef, effect: z.string().min(1), engine: z.enum(["resolve", "fusion"]).default("resolve"), category: z.enum(["ofx", "fusion", "audio"]).optional(), name: z.string().optional(), parameters: z.record(z.string(), z.any()).optional() },
    handler: async (a, ctx) => {
      if (a.engine === "fusion") return run(ctx, "effect.apply", clean({ ...itemRef(a), effect: FUSION_EFFECTS[a.effect]?.regId ?? a.effect, name: a.name, parameters: a.parameters }), "Fusion effect node inserted.");
      const r = await run(ctx, "fx.add", clean({ ...itemRef(a), effect: EFFECT_ALIASES[a.effect] ?? a.effect, category: a.category }), (d) => `Applied ${(d as { effect: { name: string } }).effect.name}.`);
      if (a.parameters) r.warnings = [...(r.warnings ?? []), "ResolveFX parameters are not scriptable; adjust them in the Inspector, or use engine 'fusion' for scriptable parameters."];
      return r;
    },
  });
  reg.define({
    name: "effect_remove", category,
    description: "Remove an effect from a timeline item: a ResolveFX/OFX/audio effect by name or id (engine 'resolve'), or a Fusion node by node name (engine 'fusion').",
    input: { ...ItemRef, effect: z.string().min(1), engine: z.enum(["resolve", "fusion"]).default("resolve"), compIndex: z.number().int().min(1).default(1) },
    handler: async (a, ctx) => a.engine === "fusion" ? run(ctx, "effect.remove", { ...itemRef(a), node: a.effect, compIndex: a.compIndex }) : run(ctx, "fx.delete", { ...itemRef(a), effect: a.effect }),
  });
  reg.define({
    name: "effect_list_applied", category, readOnly: true, description: "Effects on an item: ResolveFX/OFX/audio (GetEffects) plus Fusion nodes in its composition.",
    input: { ...ItemRef, compIndex: z.number().int().min(1).default(1) },
    handler: async (a, ctx) => {
      const native = await ctx.bridge.call("fx.get", itemRef(a)).catch((e) => ({ error: (e as Error).message }));
      const fusion = await ctx.bridge.call("effect.list_applied", { ...itemRef(a), compIndex: a.compIndex }).catch(() => []);
      return { data: { native, fusionNodes: fusion } };
    },
  });
  reg.define({ name: "effect_set_enabled", category, description: "Enable or bypass an applied ResolveFX/OFX/audio effect.", input: { ...ItemRef, effect: z.string(), enabled: z.boolean() }, handler: async (a, ctx) => run(ctx, "fx.set_enabled", { ...itemRef(a), effect: a.effect, enabled: a.enabled }) });
  reg.define({ name: "effect_get_parameters", category, support: "fusion", readOnly: true, description: "List a Fusion effect node's inputs (ids, names, types, values). ResolveFX parameters are not exposed to scripting.", input: { ...ItemRef, node: z.string(), compIndex: z.number().int().min(1).default(1) }, handler: async (a, ctx) => run(ctx, "fusion.get_inputs", { ...itemRef(a), node: a.node, compIndex: a.compIndex, withValues: true }) });
  const setParams = { ...ItemRef, node: z.string().describe("Fusion node name"), compIndex: z.number().int().min(1).default(1), parameters: z.record(z.string(), z.any()), time: z.number().optional() };
  reg.define({ name: "effect_set_parameters", category, support: "fusion", description: "Set Fusion effect node inputs (verified by readback). With time, sets a keyframe on an animated input.", input: setParams, handler: async (a, ctx) => run(ctx, "fusion.set_inputs", clean({ ...itemRef(a), node: a.node, compIndex: a.compIndex, inputs: a.parameters, time: a.time })) });
  reg.define({ name: "effect_configure", category, support: "fusion", description: "Alias of effect_set_parameters.", input: setParams, handler: async (a, ctx) => run(ctx, "fusion.set_inputs", clean({ ...itemRef(a), node: a.node, compIndex: a.compIndex, inputs: a.parameters, time: a.time })) });

  reg.define({
    name: "transition_list", category, readOnly: true,
    description: "Transition names you can use with transition_add, and (with onTimeline) the transitions already on a track.",
    input: { onTimeline: z.boolean().default(false), timeline: timelineArg, trackType: z.enum(["video", "audio"]).default("video"), trackIndex: z.number().int().min(1).optional() },
    handler: async (a, ctx) => {
      const placed = a.onTimeline ? await ctx.bridge.call("transition.list", clean({ timeline: a.timeline, trackType: a.trackType, trackIndex: a.trackIndex })) : undefined;
      return { data: { available: TRANSITIONS, categories: ["simple", "fusion", "ofx", "audio"], placed }, message: "Use the exact Edit-page transition name with transition_add (Fusion/OFX transitions use their library names)." };
    },
  });
  reg.define({
    name: "transition_add", category,
    description: "Add a transition at the start or end of a timeline item (TimelineItem.AddTransition, Resolve 21+). E.g. Cross Dissolve, Dip To Color Dissolve, Push, Slide, Zoom (fusion), Cross Fade +3 dB (audio). Needs media handles at the edit.",
    input: { ...ItemRef, type: z.string().default("Cross Dissolve"), category: z.enum(["simple", "fusion", "ofx", "audio"]).default("simple"), position: z.enum(["start", "end"]).default("end"), alignment: z.enum(["left", "center", "right"]).default("center"), duration: z.number().int().min(1).max(1000).optional().describe("Frames (default: Resolve decides)") },
    handler: async (a, ctx) => run(ctx, "transition.add", clean({ ...itemRef(a), type: a.type, category: a.category, position: a.position, alignment: a.alignment, duration: a.duration }), `${a.type} added.`),
  });
  reg.define({
    name: "transition_remove", category, destructive: true,
    description: "Remove transitions from a track (one by itemId from transition_list, or all on the track).",
    input: { timeline: timelineArg, trackType: z.enum(["video", "audio"]).default("video"), trackIndex: z.number().int().min(1).optional(), itemId: z.string().optional() },
    handler: async (a, ctx) => run(ctx, "transition.remove", clean(a)),
  });
  reg.define({
    name: "transition_configure", category,
    description: "Change a transition's type/duration: removes it and adds the new one at the same edit of the given clip (transition parameters themselves are not scriptable).",
    input: { ...ItemRef, transitionId: z.string(), type: z.string(), category: z.enum(["simple", "fusion", "ofx", "audio"]).default("simple"), position: z.enum(["start", "end"]).default("end"), duration: z.number().int().min(1).optional() },
    handler: async (a, ctx) => {
      await ctx.bridge.call("transition.remove", clean({ timeline: a.timeline, trackType: a.trackType, itemId: a.transitionId }));
      return run(ctx, "transition.add", clean({ ...itemRef(a), type: a.type, category: a.category, position: a.position, duration: a.duration }), "Transition replaced.");
    },
  });
  reg.define({
    name: "adjustment_clip_create", category,
    description: "Insert an Adjustment Clip at the playhead (tries the 'Adjustment Clip' generator); apply effects to it with effect_apply.",
    input: { timeline: timelineArg, timecode: z.string().optional(), frame: z.number().int().min(0).optional() },
    handler: async (a, ctx) => run(ctx, "edit.insert_generator", clean({ ...a, name: "Adjustment Clip", kind: "standard" }), "Adjustment clip inserted."),
  });
}
