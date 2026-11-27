import { z } from "zod";
import { ASPECTS } from "../../design-engine/presets/presets.js";
import type { ToolRegistry } from "./registry.js";
import { stdSteps, WorkflowInput } from "../../design-engine/workflows/common.js";
import { runWorkflow, type StepCtx } from "../../design-engine/workflows/engine.js";

const PLATFORM: Record<string, { aspect: keyof typeof ASPECTS; preset: string; maxSec: number }> = {
  tiktok: { aspect: "9:16", preset: "tiktok", maxSec: 180 },
  reels: { aspect: "9:16", preset: "instagram_reels", maxSec: 90 },
  shorts: { aspect: "9:16", preset: "tiktok", maxSec: 60 },
  stories: { aspect: "9:16", preset: "instagram_stories", maxSec: 60 },
  instagram_feed: { aspect: "4:5", preset: "instagram_feed", maxSec: 60 },
  square: { aspect: "1:1", preset: "instagram_feed", maxSec: 60 },
  facebook: { aspect: "16:9", preset: "facebook", maxSec: 240 },
  horizontal: { aspect: "16:9", preset: "youtube_1080p", maxSec: 600 },
  social_ad: { aspect: "9:16", preset: "instagram_reels", maxSec: 30 },
};

export function registerSocialWorkflow(reg: ToolRegistry): void {
  reg.define({
    name: "workflow_create_social_content", category: "workflows", background: true, support: "planner",
    description: "Social video: configures aspect ratio and export for the platform (tiktok, reels, shorts, stories, instagram_feed, square, facebook, horizontal, social_ad), builds a punchy cut, big captions-style title, optional auto subtitles and Smart Reframe, grade, render and verify.",
    input: { ...WorkflowInput, platform: z.enum(Object.keys(PLATFORM) as [string, ...string[]]).default("tiktok"), targetSeconds: z.number().min(3).max(600).default(30), smartReframe: z.boolean().default(false) },
    handler: async (a, ctx) => {
      const p = PLATFORM[a.platform]!;
      const dims = ASPECTS[p.aspect]!;
      const warnings: string[] = [];
      const target = Math.min(a.targetSeconds, p.maxSec);
      if (target < a.targetSeconds) warnings.push(`${a.platform} limit: duration capped at ${p.maxSec}s.`);
      const st = stdSteps({ ...a, targetSeconds: target, look: a.look ?? "bright_commercial" }, { timelineName: `${a.platform} cut`, width: dims.width, height: dims.height, fps: "30", shotSeconds: 2, defaultPreset: p.preset, titleTool: "title_create" });
      const steps = [st.status!, st.project!, st.requireProject!, st.importFolder!, st.importFiles!, st.importMusic!, st.analyze!,
        { id: "socialCut", label: `Build ${p.aspect} cut`, required: true, run: async (s: StepCtx) => {
          const music = (s.results.importMusic as { clips?: { id: string }[] } | undefined)?.clips?.[0]?.id;
          return s.ctx.registry.invoke("ai_create_social_video", { aspect: p.aspect, targetSeconds: target, shotSeconds: 2, title: a.title, timelineName: `${a.platform} cut`, smartReframe: a.smartReframe, musicClip: music }, s.ctx);
        } },
        st.subtitles!, st.grade!, st.save!, st.render!];
      const report = await runWorkflow("workflow_create_social_content", steps, ctx, a.dryRun);
      report.warnings.unshift(...warnings);
      return { data: { platform: a.platform, resolution: dims, ...report }, status: report.success ? "ok" : "partial", message: report.success ? `${a.platform} video workflow finished.` : "Social workflow stopped at a required step." };
    },
  });
}
