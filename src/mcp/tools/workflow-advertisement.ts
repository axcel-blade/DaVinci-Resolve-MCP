import { z } from "zod";
import type { ToolRegistry } from "./registry.js";
import { stdSteps, WorkflowInput } from "../../design-engine/workflows/common.js";
import { runWorkflow, type StepCtx } from "../../design-engine/workflows/engine.js";

export function registerAdvertisementWorkflow(reg: ToolRegistry): void {
  reg.define({
    name: "workflow_create_advertisement", category: "workflows", background: true, support: "planner",
    description: "Cinematic commercial: import product footage, analyze, pick best shots (product keywords), fast-paced commercial timeline, animated intro title + end-card tagline, Fusion glow on the hero shot, cinematic grade (teal & orange default), music, render and verify.",
    input: { ...WorkflowInput, targetSeconds: z.number().min(5).max(300).default(30), brand: z.string().max(200).optional(), tagline: z.string().max(300).optional(), keywords: z.array(z.string()).default(["product", "hero", "logo"]) },
    handler: async (a, ctx) => {
      const st = stdSteps({ ...a, look: a.look ?? "teal_orange", title: a.title ?? a.brand }, { timelineName: `${a.brand ?? "Commercial"} Spot`, width: 1920, height: 1080, fps: "24", shotSeconds: 2, keywords: a.keywords, defaultPreset: "youtube_1080p" });
      const steps = [st.status!, st.project!, st.requireProject!, st.importFolder!, st.importFiles!, st.importMusic!, st.analyze!, st.roughCut!, st.title!,
        { id: "heroGlow", label: "Motion-graphics glow on hero shot", required: false, run: (s: StepCtx) => s.ctx.registry.invoke("effect_apply", { trackType: "video", trackIndex: 1, itemIndex: 1, effect: "soft_glow" }, s.ctx) },
        { id: "endCard", label: "End-card tagline", required: false, when: () => Boolean(a.tagline), run: async (s: StepCtx) => {
          const info = await s.ctx.bridge.call<{ endFrame: number; fps: number }>("timeline.info", {});
          return s.ctx.registry.invoke("title_create_outro", { text: a.tagline, frame: Math.max(0, info.endFrame - Math.round(info.fps * 3)) }, s.ctx);
        } },
        st.grade!, st.save!, st.render!];
      const report = await runWorkflow("workflow_create_advertisement", steps, ctx, a.dryRun);
      return { data: report, status: report.success ? "ok" : "partial", message: report.success ? "Advertisement workflow finished." : "Advertisement workflow stopped at a required step." };
    },
  });
}
