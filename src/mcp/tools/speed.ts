import { z } from "zod";
import { ItemRef, type ToolRegistry, clean, itemRef, run } from "./common.js";

const LIMIT = "Fusion-based retiming remaps frames inside the clip's composition; the item's length on the timeline is not changed (the API has no speed-change/ripple). For true retime with length change use the Edit page Change Clip Speed.";

export function registerSpeed(reg: ToolRegistry): void {
  const category = "speed";
  const key = z.object({ frame: z.number().min(0).describe("Composition frame"), sourceFrame: z.number().min(0).describe("Source frame shown at that point") });

  reg.define({ name: "speed_set", category, description: "Constant clip speed in percent (e.g. 50 = slow motion, 200 = fast). engine 'resolve' (default): TimelineItem.SetSpeed (Resolve 21+; changes item length; ripple optional). engine 'fusion': " + LIMIT, input: { ...ItemRef, percentage: z.number().min(0).max(10000), engine: z.enum(["resolve", "fusion"]).default("resolve"), ripple: z.boolean().default(false), pitchCorrection: z.boolean().optional(), stretchKeyframes: z.boolean().optional(), interpolate: z.boolean().default(true) }, handler: async (a, ctx) => a.engine === "fusion" ? run(ctx, "speed.fusion", { ...itemRef(a), mode: "constant", speed: a.percentage / 100, interpolate: a.interpolate }) : run(ctx, "speed.set_native", clean({ ...itemRef(a), percentage: a.percentage, ripple: a.ripple, pitchCorrection: a.pitchCorrection, stretchKeyframes: a.stretchKeyframes }), `Speed set to ${a.percentage}%.`) });
  reg.define({
    name: "speed_ramp_create", category, support: "fusion",
    description: `Speed ramp from keyframes mapping composition frames to source frames (e.g. normal -> slow -> normal). ${LIMIT}`,
    input: { ...ItemRef, keys: z.array(key).min(2) },
    handler: async (a, ctx) => run(ctx, "speed.fusion", { ...itemRef(a), mode: "ramp", keys: a.keys }),
  });
  reg.define({
    name: "speed_ramp_configure", category, support: "fusion",
    description: "Change the keyframes of an existing MCP_Retime TimeStretcher node.",
    input: { ...ItemRef, node: z.string().default("MCP_Retime"), keys: z.array(key).min(2) },
    handler: async (a, ctx) => run(ctx, "fusion.keyframes", { ...itemRef(a), node: a.node, input: "SourceTime", keys: a.keys.map((k) => ({ frame: k.frame, value: k.sourceFrame })) }),
  });
  reg.define({ name: "speed_reverse", category, support: "fusion", description: `Reverse playback. ${LIMIT}`, input: ItemRef, handler: async (a, ctx) => run(ctx, "speed.fusion", { ...itemRef(a), mode: "reverse" }) });
  reg.define({ name: "speed_freeze", category, description: "Freeze frame: native 0% speed (Resolve 21+), or engine 'fusion' to hold a specific composition frame.", input: { ...ItemRef, engine: z.enum(["resolve", "fusion"]).default("resolve"), frame: z.number().min(0).default(0) }, handler: async (a, ctx) => a.engine === "fusion" ? run(ctx, "speed.fusion", { ...itemRef(a), mode: "freeze", frame: a.frame }) : run(ctx, "speed.set_native", { ...itemRef(a), percentage: 0 }, "Freeze frame applied.") });
  reg.define({
    name: "speed_optical_flow", category,
    description: "Set the item's retime process (optical flow / frame blend / nearest) and motion estimation mode via documented item properties.",
    input: { ...ItemRef, process: z.enum(["project", "nearest", "frame_blend", "optical_flow"]).default("optical_flow"), motionEstimation: z.number().int().min(0).max(6).optional().describe("0 project, 1 standard faster, 2 standard better, 3 enhanced faster, 4 enhanced better, 5 speed warp faster, 6 speed warp better") },
    handler: async (a, ctx) => run(ctx, "speed.retime_process", { ...itemRef(a), process: a.process, motionEstimation: a.motionEstimation }),
  });
  reg.define({ name: "speed_retime_curve", category, support: "fusion", description: `Arbitrary time-remap curve (frame -> source frame). ${LIMIT}`, input: { ...ItemRef, keys: z.array(key).min(2) }, handler: async (a, ctx) => run(ctx, "speed.fusion", { ...itemRef(a), mode: "curve", keys: a.keys }) });
  reg.define({
    name: "speed_get_info", category, readOnly: true,
    description: "Retime-related state of an item: RetimeProcess, MotionEstimation properties and any MCP retime Fusion nodes.",
    input: ItemRef,
    handler: async (a, ctx) => {
      const props = await ctx.bridge.call<{ properties: Record<string, unknown>; item: unknown }>("edit.get_properties", itemRef(a));
      let nodes: unknown = [];
      try {
        nodes = await ctx.bridge.call("effect.list_applied", itemRef(a));
      } catch {
        nodes = [];
      }
      const retime = (nodes as { type: string }[]).filter((n) => ["TimeSpeed", "TimeStretcher"].includes(n.type));
      const native = await ctx.bridge.call<{ speed: unknown }>("speed.get_native", itemRef(a)).catch(() => undefined);
      return { data: { item: props.item, speed: native?.speed, retimeProcess: props.properties.RetimeProcess, motionEstimation: props.properties.MotionEstimation, fusionRetimeNodes: retime } };
    },
  });
}
