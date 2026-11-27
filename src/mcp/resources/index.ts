import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FUSION_EFFECTS } from "../tools/effects.js";
import { COLOR_PRESETS, EXPORT_PRESETS } from "../../design-engine/presets/presets.js";
import type { ToolContext } from "../tools/common.js";

type Source = (ctx: ToolContext) => Promise<unknown>;

const RESOURCES: { name: string; uri: string; title: string; description: string; read: Source }[] = [
  { name: "status", uri: "resolve://status", title: "Resolve status", description: "Installation, connection, open project/timeline/page.", read: async (c) => ({ install: await c.bridge.installInfo(), status: await c.bridge.call("app.status", {}, 20000).catch((e) => ({ error: (e as Error).message })) }) },
  { name: "current-project", uri: "resolve://project/current", title: "Current project", description: "Current project summary.", read: (c) => c.bridge.call("project.info") },
  { name: "project-settings", uri: "resolve://project/settings", title: "Project settings", description: "All project settings.", read: (c) => c.bridge.call("project.get_settings", {}) },
  { name: "timeline", uri: "resolve://timeline/current", title: "Current timeline", description: "Current timeline info, tracks and items.", read: async (c) => ({ info: await c.bridge.call("timeline.info", {}), tracks: await c.bridge.call("timeline.tracks", {}), items: await c.bridge.call("timeline.clips", {}) }) },
  { name: "media-library", uri: "resolve://media", title: "Media library", description: "Bins and clips in the media pool.", read: async (c) => ({ bins: await c.bridge.call("media.bins"), clips: await c.bridge.call("media.list", { limit: 1000 }) }) },
  { name: "render-queue", uri: "resolve://render/queue", title: "Render queue", description: "Render jobs and status.", read: (c) => c.bridge.call("render.queue") },
  { name: "effects", uri: "resolve://effects", title: "Installed effects", description: "Effects applicable through this server (Fusion nodes) and look presets.", read: async () => ({ fusionEffects: FUSION_EFFECTS, lookPresets: COLOR_PRESETS }) },
  { name: "export-presets", uri: "resolve://presets/export", title: "Export presets", description: "Delivery presets.", read: async () => EXPORT_PRESETS },
  { name: "capabilities", uri: "resolve://capabilities", title: "Capabilities", description: "Scripting methods this Resolve build exposes.", read: (c) => c.bridge.call("app.capabilities") },
  { name: "operations", uri: "resolve://operations", title: "Operation log", description: "Recent tool calls.", read: async (c) => c.audit.recent.slice(-100) },
];

export function registerResources(server: McpServer, ctx: ToolContext): void {
  for (const r of RESOURCES) {
    server.registerResource(r.name, r.uri, { title: r.title, description: r.description, mimeType: "application/json" }, async (uri) => {
      let body: unknown;
      try {
        body = await r.read(ctx);
      } catch (e) {
        body = { error: (e as Error).message, code: (e as { code?: string }).code };
      }
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(body, null, 2) }] };
    });
  }
}

export const RESOURCE_URIS = RESOURCES.map((r) => r.uri);
