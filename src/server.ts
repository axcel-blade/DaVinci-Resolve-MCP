import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResolveBridge } from "./resolve/bridge/bridge.js";
import type { AppConfig } from "./config/index.js";
import { SERVER_NAME, SERVER_VERSION } from "./config/constants.js";
import { JobManager } from "./jobs/job-manager.js";
import { registerPrompts } from "./mcp/prompts/index.js";
import { registerResources } from "./mcp/resources/index.js";
import { AuditLog } from "./utils/audit.js";
import { PathPolicy } from "./utils/paths.js";
import { buildRegistry } from "./mcp/tools/index.js";
import type { ToolContext, ToolRegistry, ToolResult } from "./mcp/tools/common.js";

export const SERVER_INFO = { name: SERVER_NAME, version: SERVER_VERSION };

export interface AppContext {
  config: AppConfig;
  bridge: ResolveBridge;
  paths: PathPolicy;
  audit: AuditLog;
  registry: ToolRegistry;
  jobs: JobManager<ToolResult>;
}

export function createAppContext(config: AppConfig, bridge?: ResolveBridge): AppContext {
  return {
    config,
    bridge: bridge ?? new ResolveBridge(config),
    paths: new PathPolicy(config.paths),
    audit: new AuditLog(config.logDir),
    registry: buildRegistry(),
    jobs: new JobManager<ToolResult>(),
  };
}

export function toolContext(app: AppContext, progress: ToolContext["progress"] = async () => undefined): ToolContext {
  return { bridge: app.bridge, config: app.config, paths: app.paths, audit: app.audit, registry: app.registry, jobs: app.jobs, progress };
}

const INSTRUCTIONS = `Controls the user's running DaVinci Resolve through its official scripting API.
Start with resolve_get_status. Never assume a project, timeline, clip or track exists: inspect first.
Timeline items are addressed by itemId (from timeline_get_clips) or trackType/trackIndex/itemIndex (1-based).
Frames are integers; absolute timeline frames include the timeline start (usually 01:00:00:00).
Tools marked DESTRUCTIVE need confirm: true — only after the user explicitly agreed.
A result is successful only when ok is true; status "unsupported" means the Resolve API does not expose that feature (an alternative is given).
Long tools (renders, exports, workflows) accept background: true and return a jobId; collect results with wait_for_job.
Every result states its source (resolve | mock | server).
For multi-step jobs prefer the workflow_* tools (use dryRun first) or plan with ai_create_editing_plan before applying.`;

export function createServer(app: AppContext): McpServer {
  const server = new McpServer(SERVER_INFO, { capabilities: { tools: {}, resources: {}, prompts: {}, logging: {} }, instructions: INSTRUCTIONS });
  app.registry.registerAll(server, (extra) =>
    toolContext(app, async (progress, total, message) => {
      const token = extra._meta?.progressToken;
      if (token === undefined) return;
      await extra.sendNotification({ method: "notifications/progress", params: { progressToken: token, progress, total, message } } as never).catch(() => undefined);
    }),
    app.config.toolCategories,
  );
  registerResources(server, toolContext(app));
  registerPrompts(server);
  return server;
}
