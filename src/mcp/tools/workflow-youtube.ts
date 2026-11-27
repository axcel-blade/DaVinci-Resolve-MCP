import { z } from "zod";
import type { ToolRegistry } from "./registry.js";
import { stdSteps, WorkflowInput } from "../../design-engine/workflows/common.js";
import { runWorkflow, type StepCtx } from "../../design-engine/workflows/engine.js";

export function registerYoutubeWorkflow(reg: ToolRegistry): void {
  reg.define({
    name: "workflow_create_youtube_video", category: "workflows", background: true, support: "planner",
    description: "YouTube production: project (1080p/4K), import + organize footage, analyze, rough cut from best clips, B-roll interleave, intro title + lower third, optional subtitles, grade, background music, render YouTube preset and verify. Reports every step; fails if a required step fails.",
    input: { ...WorkflowInput, resolution: z.enum(["1080p", "4k"]).default("1080p"), frameRate: z.enum(["23.976", "24", "25", "29.97", "30", "50", "59.94", "60"]).default("24"), lowerThird: z.string().optional(), musicLevelDb: z.number().min(-60).max(0).default(-18) },
    handler: async (a, ctx) => {
      const [w, h] = a.resolution === "4k" ? [3840, 2160] : [1920, 1080];
      const st = stdSteps(a, { timelineName: a.title ?? "YouTube Edit", width: w, height: h, fps: a.frameRate, shotSeconds: 5, defaultPreset: a.resolution === "4k" ? "youtube_4k" : "youtube_1080p", lowerThird: a.lowerThird });
      const steps = [st.status!, st.project!, st.requireProject!, st.importFolder!, st.importFiles!, st.importMusic!, st.analyze!, st.roughCut!, st.title!, st.lowerThird!, st.subtitles!, st.grade!,
        { id: "mix", label: "Balance music under dialogue", required: false, when: () => Boolean(a.musicFile), run: async (s: StepCtx) => {
          const tracks = await s.ctx.bridge.call<{ trackIndex: number; name: string | null; items: { id: string }[] }[]>("audio.tracks", {});
          const music = tracks.find((t) => t.name === "Music");
          if (!music?.items.length) return { status: "partial", message: "No music track found." };
          return s.ctx.registry.invoke("audio_mix", { levels: music.items.map((i) => ({ item: { itemId: i.id, trackType: "audio" }, volumeDb: a.musicLevelDb })) }, s.ctx);
        } },
        st.save!, st.render!];
      const report = await runWorkflow("workflow_create_youtube_video", steps, ctx, a.dryRun);
      return { data: report, status: report.success ? (report.warnings.length ? "partial" : "ok") : "partial", message: report.success ? "YouTube workflow finished." : "YouTube workflow stopped: a required step failed (see stepsFailed)." };
    },
  });
}
