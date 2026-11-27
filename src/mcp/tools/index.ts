import { z } from "zod";
import { registerAi } from "./ai.js";
import { registerApplication } from "./application.js";
import { registerAudio } from "./audio.js";
import { registerColor } from "./color.js";
import { registerEditing } from "./editing.js";
import { registerEffects } from "./effects.js";
import { registerJobs } from "./jobs.js";
import { registerFusion } from "./fusion.js";
import { registerMedia } from "./media.js";
import { registerPhoto } from "./photo.js";
import { registerProjects } from "./projects.js";
import { registerRendering } from "./rendering.js";
import { registerSpeed } from "./speed.js";
import { registerSubtitles } from "./subtitles.js";
import { registerTimeline } from "./timeline.js";
import { registerTitles } from "./titles.js";
import { registerAdvertisementWorkflow } from "./workflow-advertisement.js";
import { registerCinematicWorkflow } from "./workflow-cinematic.js";
import { registerDocumentaryWorkflow } from "./workflow-documentary.js";
import { registerSocialWorkflow } from "./workflow-social-media.js";
import { registerYoutubeWorkflow } from "./workflow-youtube.js";
import { ToolRegistry } from "./registry.js";

/** Build the full tool registry (independent of any MCP server instance). */
export function buildRegistry(): ToolRegistry {
  const reg = new ToolRegistry();
  registerApplication(reg);
  registerJobs(reg);
  registerProjects(reg);
  registerMedia(reg);
  registerTimeline(reg);
  registerEditing(reg);
  registerEffects(reg);
  registerSpeed(reg);
  registerTitles(reg);
  registerSubtitles(reg);
  registerFusion(reg);
  registerColor(reg);
  registerAudio(reg);
  registerAi(reg);
  registerPhoto(reg);
  registerRendering(reg);
  registerYoutubeWorkflow(reg);
  registerAdvertisementWorkflow(reg);
  registerSocialWorkflow(reg);
  registerDocumentaryWorkflow(reg);
  registerCinematicWorkflow(reg);
  reg.define({
    name: "mcp_list_tools", category: "meta", readOnly: true,
    description: "List this server's tools by category with support level (api, fusion, integration, external, planner, unsupported). Use to discover the right tool.",
    input: {},
    handler: async (_a, ctx) => {
      const by: Record<string, { name: string; support: string; destructive: boolean }[]> = {};
      for (const t of ctx.registry.tools.values()) (by[t.category] ??= []).push({ name: t.name, support: t.support, destructive: t.destructive });
      return { data: { count: ctx.registry.tools.size, categories: by } };
    },
  });
  reg.define({
    name: "mcp_recent_operations", category: "meta", readOnly: true,
    description: "The operation log: recent tool calls with outcome and duration (args redacted).",
    input: {},
    handler: async (_a, ctx) => ({ data: ctx.audit.recent.slice(-50) }),
  });
  reg.define({
    name: "mcp_bridge_status", category: "meta", readOnly: true,
    description: "Bridge state: active adapter (python | mock), serial queue depth, the operation running now, and the most recent bridge operations with outcome and duration.",
    input: { limit: z.number().int().min(1).max(200).default(25) },
    handler: async ({ limit }, ctx) => ({ data: { ...ctx.bridge.status(), recent: ctx.bridge.recent(limit) } }),
  });
  return reg;
}
