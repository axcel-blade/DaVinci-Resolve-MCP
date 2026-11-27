import { z } from "zod";
import type { ToolRegistry } from "./common.js";
import { stdSteps, WorkflowInput } from "../../design-engine/workflows/common.js";
import { runWorkflow, type StepCtx } from "../../design-engine/workflows/engine.js";

export function registerCinematicWorkflow(reg: ToolRegistry): void {
  reg.define({
    name: "workflow_create_cinematic_video", category: "workflows", background: true, support: "planner",
    description: "Complete cinematic production across pages: 4K DCI-flat or UHD project, edit (rough cut), Fusion (animated 3D title or Text+ intro, film grain), Color (cinematic look), Fairlight (music bed level), Deliver (master + optional web version) with verification.",
    input: { ...WorkflowInput, resolution: z.enum(["uhd", "dci4k", "1080p"]).default("uhd"), letterbox: z.boolean().default(true), title3d: z.boolean().default(false), filmGrain: z.boolean().default(true), webVersion: z.boolean().default(false) },
    handler: async (a, ctx) => {
      const [w, h] = a.resolution === "dci4k" ? [4096, 2160] : a.resolution === "uhd" ? [3840, 2160] : [1920, 1080];
      const st = stdSteps({ ...a, look: a.look ?? "hollywood_cinematic" }, { timelineName: a.title ?? "Cinematic Edit", width: w, height: h, fps: "24", shotSeconds: 5, defaultPreset: a.exportPreset ?? "professional_master" });
      const steps = [st.status!, st.project!, st.requireProject!, st.importFolder!, st.importFiles!, st.importMusic!, st.analyze!, st.roughCut!,
        { id: "fusionTitle", label: a.title3d ? "Fusion 3D title" : "Fusion Text+ intro", required: false, when: () => Boolean(a.title), run: async (s: StepCtx) => {
          if (!a.title3d) return s.ctx.registry.invoke("title_create_intro", { text: a.title, frame: (await s.ctx.bridge.call<{ startFrame: number }>("timeline.info", {})).startFrame }, s.ctx);
          const info = await s.ctx.bridge.call<{ startFrame: number }>("timeline.info", {});
          await s.ctx.bridge.call("timeline.set_playhead", { frame: info.startFrame });
          const comp = await s.ctx.registry.invoke("fusion_insert_composition", {}, s.ctx);
          const itemId = (comp.data as { item: { id: string } }).item.id;
          await s.ctx.registry.invoke("fusion_create_3d_text", { itemId, text: a.title }, s.ctx);
          return s.ctx.registry.invoke("fusion_create_animation", { itemId, node: "MCP3D_Text", preset: "spin", frames: 48, inputOverride: "Transform3DOp.Rotate.Y" }, s.ctx);
        } },
        { id: "grain", label: "Film grain", required: false, when: () => a.filmGrain, run: (s: StepCtx) => s.ctx.registry.invoke("effect_apply", { trackType: "video", trackIndex: 1, itemIndex: 1, effect: "film_grain" }, s.ctx) },
        { id: "letterbox", label: "2.39:1 letterbox", required: false, when: () => a.letterbox, run: async (s: StepCtx) => {
          const list = await s.ctx.bridge.call<{ items: { id: string; type?: string }[] }>("timeline.clips", { trackType: "video", trackIndex: 1, includeTransitions: false });
          const bar = Math.round((h - w / 2.39) / 2);
          const out = [];
          for (const it of list.items) out.push(await s.ctx.registry.invoke("clip_set_crop", { itemId: it.id, top: bar, bottom: bar }, s.ctx).catch((e) => ({ error: (e as Error).message })));
          return { data: out, message: `Letterboxed ${out.length} item(s) (${bar}px bars).` };
        } },
        st.grade!, st.save!, st.render!,
        { id: "web", label: "Web version (YouTube 4K)", required: false, when: () => a.render && a.webVersion, run: (s: StepCtx) => s.ctx.registry.invoke("render_export_timeline", { preset: "youtube_4k", outputDir: a.outputDir ?? `${s.ctx.config.paths.outputDir}\\renders`, fileName: `web-${Date.now()}` }, s.ctx) },
      ];
      const report = await runWorkflow("workflow_create_cinematic_video", steps, ctx, a.dryRun);
      return { data: report, status: report.success ? "ok" : "partial", message: report.success ? "Cinematic workflow finished." : "Cinematic workflow stopped at a required step." };
    },
  });
}
