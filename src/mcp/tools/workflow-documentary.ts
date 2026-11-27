import { z } from "zod";
import type { ToolRegistry } from "./registry.js";
import { stdSteps, WorkflowInput } from "../../design-engine/workflows/common.js";
import { runWorkflow, type StepCtx } from "../../design-engine/workflows/engine.js";

export function registerDocumentaryWorkflow(reg: ToolRegistry): void {
  reg.define({
    name: "workflow_create_documentary", category: "workflows", background: true, support: "planner",
    description: "Documentary: import all footage, organize interviews vs B-roll bins (by name keywords), transcribe interviews (Resolve or provider), assemble interview-led story with B-roll, narration (optional TTS), subtitles, natural grade, music bed, render and verify.",
    input: { ...WorkflowInput, targetSeconds: z.number().min(30).max(7200).default(600), interviewKeywords: z.array(z.string()).default(["interview", "int_", "talking", "a-cam"]), transcribe: z.enum(["none", "resolve", "provider"]).default("none"), narration: z.string().max(4000).optional() },
    handler: async (a, ctx) => {
      const st = stdSteps({ ...a, look: a.look ?? "natural_documentary" }, { timelineName: a.title ?? "Documentary Assembly", width: 1920, height: 1080, fps: "24", shotSeconds: 8, keywords: a.interviewKeywords, defaultPreset: "professional_master", titleTool: "title_create_intro" });
      const steps = [st.status!, st.project!, st.requireProject!, st.importFolder!, st.importFiles!, st.importMusic!,
        { id: "organize", label: "Organize interviews and B-roll", required: false, run: async (s: StepCtx) => {
          const list = await s.ctx.bridge.call<{ clips: { id: string; name: string; properties: Record<string, string> }[] }>("media.list", { limit: 5000 });
          const re = new RegExp(a.interviewKeywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
          const interviews = list.clips.filter((c) => re.test(c.name) && /video/i.test(c.properties.Type ?? ""));
          const broll = list.clips.filter((c) => !re.test(c.name) && /video/i.test(c.properties.Type ?? ""));
          if (interviews.length) await s.ctx.bridge.call("media.move_to_bin", { clips: interviews.map((c) => c.id), bin: "Interviews" });
          if (broll.length) await s.ctx.bridge.call("media.move_to_bin", { clips: broll.map((c) => c.id), bin: "B-Roll" });
          return { data: { interviews: interviews.map((c) => c.id), broll: broll.map((c) => c.id) }, message: `${interviews.length} interview(s), ${broll.length} B-roll clip(s).` };
        } },
        { id: "transcribe", label: "Transcribe interviews", required: false, when: () => a.transcribe !== "none", run: async (s: StepCtx) => {
          const ids = (s.results.organize as { interviews?: string[] } | undefined)?.interviews ?? [];
          const out = [];
          for (const id of ids) out.push(await s.ctx.registry.invoke("ai_transcribe_audio", { clip: id, engine: a.transcribe }, s.ctx).catch((e) => ({ error: (e as Error).message })));
          return { data: out, message: `Transcribed ${out.length} interview(s).` };
        } },
        st.analyze!, st.roughCut!, st.title!,
        { id: "narration", label: "Generate narration (TTS)", required: false, when: () => Boolean(a.narration), run: (s: StepCtx) => s.ctx.registry.invoke("ai_generate_voiceover", { text: a.narration, fileName: "narration", place: true, trackIndex: 2 }, s.ctx) },
        st.subtitles!, st.grade!, st.save!, st.render!];
      const report = await runWorkflow("workflow_create_documentary", steps, ctx, a.dryRun);
      return { data: report, status: report.success ? "ok" : "partial", message: report.success ? "Documentary workflow finished." : "Documentary workflow stopped at a required step." };
    },
  });
}
