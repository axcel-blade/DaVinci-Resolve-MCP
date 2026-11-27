import { z } from "zod";
import { hexColor, ItemRef, timelineArg, type ToolRegistry, clean, itemRef, run } from "./registry.js";
import { McpToolError } from "../../utils/errors.js";

export const TitleStyle = z.object({
  text: z.string().max(5000).optional(),
  font: z.string().optional().describe("Installed font family, e.g. 'Open Sans'"),
  fontStyle: z.string().optional().describe("e.g. Bold, Regular"),
  size: z.number().min(0).max(1).optional().describe("Text+ size (0.08 ≈ default)"),
  color: hexColor.optional(),
  opacity: z.number().min(0).max(1).optional(),
  position: z.tuple([z.number(), z.number()]).optional().describe("Center in normalized frame coords [x, y], 0.5,0.5 = middle"),
  alignment: z.enum(["left", "center", "right"]).optional(),
  tracking: z.number().optional(),
  lineSpacing: z.number().optional(),
  background: z.object({ color: hexColor.default("#000000"), opacity: z.number().min(0).max(1).default(0.75) }).optional(),
  outline: z.object({ color: hexColor.default("#000000"), thickness: z.number().min(0).max(0.5).default(0.02) }).optional(),
  shadow: z.boolean().optional(),
});
export type TitleStyleT = z.infer<typeof TitleStyle>;

export const TitleAnimation = z.object({ type: z.enum(["fade", "slide_up", "zoom", "scroll", "typewriter"]), frames: z.number().int().min(1).max(10000).default(15) });

/** Reusable title presets. */
export const TITLE_PRESETS: Record<string, { style: TitleStyleT; animation?: z.infer<typeof TitleAnimation> }> = {
  lower_third: { style: { size: 0.045, position: [0.28, 0.16], alignment: "left", color: "#ffffff", background: { color: "#111111", opacity: 0.7 } }, animation: { type: "slide_up", frames: 12 } },
  intro: { style: { size: 0.12, position: [0.5, 0.5], alignment: "center", color: "#ffffff", fontStyle: "Bold" }, animation: { type: "zoom", frames: 24 } },
  outro: { style: { size: 0.08, position: [0.5, 0.5], alignment: "center", color: "#ffffff" }, animation: { type: "fade", frames: 20 } },
  credits: { style: { size: 0.04, position: [0.5, 0.5], alignment: "center", color: "#ffffff", lineSpacing: 1.2 }, animation: { type: "scroll", frames: 240 } },
  subtitle_social: { style: { size: 0.06, position: [0.5, 0.25], alignment: "center", color: "#ffffff", outline: { color: "#000000", thickness: 0.04 }, fontStyle: "Bold" } },
};

const placement = { timeline: timelineArg, timecode: z.string().optional().describe("Insert at this timecode (moves the playhead)"), frame: z.number().int().min(0).optional() };

export function registerTitles(reg: ToolRegistry): void {
  const category = "titles";
  const comp = { ...ItemRef, compIndex: z.number().int().min(1).default(1) };

  reg.define({
    name: "title_create", category, support: "fusion",
    description: "Add a title. mode 'overlay' (default, non-destructive): Text+ composited over the video clip under the given frame, inside that clip's Fusion composition (lasts the clip's length). mode 'insert': Resolve's InsertFusionTitleIntoTimeline/InsertTitleIntoTimeline at the playhead — verified on Resolve 21 to RIPPLE-INSERT on the destination track (pushes later clips), so it needs confirm: true.",
    input: { ...placement, mode: z.enum(["overlay", "insert"]).default("overlay"), trackIndex: z.number().int().min(1).optional().describe("overlay: video track whose clip receives the title (default: topmost clip at frame)"), text: z.string().max(5000).default("Title"), kind: z.enum(["fusion", "standard"]).default("fusion"), template: z.string().optional(), style: TitleStyle.optional(), animation: TitleAnimation.optional(), confirm: z.boolean().optional() },
    handler: async (a, ctx) => {
      const style = { ...(a.style ?? {}), text: a.style?.text ?? a.text };
      if (a.mode === "overlay") return run(ctx, "title.overlay", clean({ timeline: a.timeline, frame: a.frame, trackIndex: a.trackIndex, style, animation: a.animation }), "Title composited over the clip.");
      if (ctx.config.safety.requireConfirmation && a.confirm !== true) {
        throw new McpToolError("CONFIRMATION_REQUIRED", "mode 'insert' ripple-inserts the title on the destination track and shifts later clips. Confirm with the user, then pass confirm: true (or use mode 'overlay').");
      }
      return run(ctx, "title.create", clean({ timeline: a.timeline, timecode: a.timecode, frame: a.frame, kind: a.kind, template: a.template, style, animation: a.animation }), "Title inserted.");
    },
  });
  const styled = (tool: string, desc: string, input: z.ZodRawShape, map: (a: Record<string, unknown>) => TitleStyleT) =>
    reg.define({ name: tool, category, support: "fusion", description: desc, input: { ...comp, ...input }, handler: async (a, ctx) => run(ctx, "title.style", { ...itemRef(a as never), compIndex: (a as { compIndex: number }).compIndex, style: clean(map(a as Record<string, unknown>)) }) });
  styled("title_edit", "Restyle a Text+ title (any style fields).", { style: TitleStyle }, (a) => a.style as TitleStyleT);
  styled("title_set_text", "Change a Text+ title's text.", { text: z.string().max(5000) }, (a) => ({ text: a.text as string }));
  styled("title_set_font", "Set a Text+ title's font family and style.", { font: z.string(), fontStyle: z.string().optional() }, (a) => ({ font: a.font as string, fontStyle: a.fontStyle as string | undefined }));
  styled("title_set_size", "Set a Text+ title's size (0..1).", { size: z.number().min(0).max(1) }, (a) => ({ size: a.size as number }));
  styled("title_set_color", "Set a Text+ title's fill color.", { color: hexColor, opacity: z.number().min(0).max(1).optional() }, (a) => ({ color: a.color as string, opacity: a.opacity as number | undefined }));
  styled("title_set_position", "Position a Text+ title (normalized center).", { x: z.number(), y: z.number() }, (a) => ({ position: [a.x as number, a.y as number] }));
  styled("title_set_alignment", "Set Text+ horizontal alignment.", { alignment: z.enum(["left", "center", "right"]) }, (a) => ({ alignment: a.alignment as "left" }));
  styled("title_set_background", "Add a background box behind a Text+ title.", { color: hexColor.default("#000000"), opacity: z.number().min(0).max(1).default(0.75) }, (a) => ({ background: { color: a.color as string, opacity: a.opacity as number } }));
  reg.define({ name: "title_set_animation", category, support: "fusion", description: "Animate a Text+ title (fade, slide_up, zoom, scroll, typewriter) with Fusion keyframes.", input: { ...comp, animation: TitleAnimation }, handler: async (a, ctx) => run(ctx, "title.animate", { ...itemRef(a), compIndex: a.compIndex, animation: a.animation }) });
  reg.define({ name: "title_get", category, support: "fusion", readOnly: true, description: "Read a Text+ title's text and style inputs.", input: comp, handler: async (a, ctx) => run(ctx, "title.get", { ...itemRef(a), compIndex: a.compIndex }) });
  reg.define({ name: "title_delete", category, destructive: true, description: "Delete an inserted title item from the timeline (for overlay titles use fusion_delete_node on the MCP_Title node and its _Merge).", input: ItemRef, handler: async (a, ctx) => run(ctx, "edit.delete", { timeline: a.timeline, items: [itemRef({ ...a, timeline: undefined })], ripple: false }) });

  const preset = (tool: string, key: keyof typeof TITLE_PRESETS, desc: string, extra: z.ZodRawShape = {}) =>
    reg.define({
      name: tool, category, support: "fusion", description: desc,
      input: { ...placement, text: z.string().max(5000), subtitle: z.string().optional(), style: TitleStyle.optional(), ...extra },
      handler: async (a, ctx) => {
        const p = TITLE_PRESETS[key]!;
        const text = (a as { subtitle?: string }).subtitle ? `${a.text}\n${(a as { subtitle?: string }).subtitle}` : a.text;
        return run(ctx, "title.overlay", clean({ timeline: a.timeline, frame: a.frame, style: { ...p.style, ...(a.style ?? {}), text }, animation: p.animation, name: `MCP_${key}` }), `${tool.replace("title_create_", "")} title composited over the clip.`);
      },
    });
  preset("title_create_lower_third", "lower_third", "Lower-third name/role title with background box and slide-up animation.");
  preset("title_create_intro", "intro", "Large centered opening title with zoom-in animation.");
  preset("title_create_outro", "outro", "Centered closing title with fade-in.");
  preset("title_create_credits", "credits", "Scrolling credits (use newlines between lines).");
  preset("title_create_scrolling_text", "credits", "Scrolling text crawl (vertical).");
  reg.define({ name: "title_list_presets", category, readOnly: true, description: "List reusable title presets and their styles.", input: {}, handler: async () => ({ data: TITLE_PRESETS }) });
}
