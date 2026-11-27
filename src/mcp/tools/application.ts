import { arch, cpus, freemem, platform, release, totalmem } from "node:os";
import { z } from "zod";
import { isResolveRunning, launchResolve } from "../../resolve/bridge/detect.js";
import { RESOLVE_PAGES } from "../../config/constants.js";
import { toolAvailable } from "../../utils/media-probe.js";
import { type ToolRegistry, run } from "./registry.js";

export function registerApplication(reg: ToolRegistry): void {
  const category = "application";

  reg.define({
    name: "resolve_get_status", category, readOnly: true,
    description: "Check whether DaVinci Resolve is installed and running, whether scripting is connected, and the open project/timeline/page. Call this first.",
    input: {},
    handler: async (_a, ctx) => {
      const install = await ctx.bridge.installInfo(true);
      const running = await isResolveRunning();
      let status: Record<string, unknown> = {};
      try {
        status = await ctx.bridge.call("app.status", {}, 20000);
      } catch (e) {
        status = { connected: false, error: (e as Error).message };
      }
      const connected = Boolean(status.connected);
      return {
        data: { install, processRunning: running, ...status },
        message: connected
          ? `Connected to ${status.product} ${status.version}. Project: ${status.project ?? "none"}, timeline: ${status.timeline ?? "none"}, page: ${status.page}.`
          : !install.installed ? "DaVinci Resolve is not installed (or not found). Set RESOLVE_INSTALL_DIR if it is in a custom location."
          : !running ? "DaVinci Resolve is installed but not running. Use resolve_launch."
          : "Resolve is running but scripting is not connected. Enable Preferences > System > General > External scripting using: Local, then restart Resolve.",
      };
    },
  });

  reg.define({
    name: "resolve_check_scripting_connection", category, readOnly: true,
    description: "Verify the scripting API connection end-to-end (Python bridge, fusionscript, Resolve) and report exactly which layer fails.",
    input: {},
    handler: async (_a, ctx) => {
      const install = await ctx.bridge.installInfo(true);
      const layers: Record<string, unknown> = { resolveInstalled: install.installed, fusionscript: install.fusionscript ?? null, scriptApiFolder: install.scriptApiExists };
      try {
        const s = await ctx.bridge.call<Record<string, unknown>>("app.status", {}, 20000);
        layers.python = ctx.bridge.python?.info?.python;
        layers.connected = s.connected;
        layers.detail = s.error ?? null;
        return { data: layers, status: s.connected ? "ok" : "partial", message: s.connected ? "Scripting connection OK." : `Scripting not connected: ${(s.error as { message?: string })?.message ?? "unknown"}` };
      } catch (e) {
        layers.python = false;
        layers.detail = (e as Error).message;
        return { data: layers, status: "partial", message: `Python bridge failed: ${(e as Error).message}` };
      }
    },
  });

  reg.define({
    name: "resolve_launch", category,
    description: "Launch DaVinci Resolve if it is not running and wait (up to waitSeconds) for the scripting API to accept connections.",
    input: { wait: z.boolean().default(true), waitSeconds: z.number().int().min(10).max(600).default(180) },
    handler: async (a, ctx) => {
      if (!a.wait) {
        const r = await launchResolve(ctx.config.resolve);
        return { data: r, message: r.alreadyRunning ? "Resolve is already running." : "Resolve launch started (not waiting for scripting)." };
      }
      const already = await isResolveRunning();
      await ctx.bridge.ensureRunning(a.waitSeconds * 1000);
      const s = await ctx.bridge.call<Record<string, unknown>>("app.status");
      return { data: s, message: already ? "Resolve was already running; scripting connected." : `Resolve launched and connected (${s.version}).` };
    },
  });

  reg.define({
    name: "resolve_close", category, destructive: true,
    description: "Quit DaVinci Resolve. Unsaved changes may be lost unless saveProject is true.",
    input: { saveProject: z.boolean().default(true) },
    handler: async (a, ctx) => {
      if (a.saveProject) {
        const cur = await ctx.bridge.call<{ project: string | null }>("project.current");
        if (cur.project) await ctx.bridge.call("project.save");
      }
      return run(ctx, "app.quit", {}, "Quit requested; Resolve is closing.");
    },
  });

  reg.define({ name: "resolve_get_version", category, readOnly: true, description: "Read the installed DaVinci Resolve product name and version.", input: {}, handler: async (_a, ctx) => run(ctx, "app.version", {}, (d) => `${(d as { product: string }).product} ${(d as { versionString: string }).versionString}`) });

  reg.define({
    name: "resolve_get_capabilities", category, readOnly: true,
    description: "Probe which documented scripting methods this Resolve build exposes (per object), plus optional tools (ffmpeg, AI provider). Use to decide which tools will work.",
    input: {},
    handler: async (_a, ctx) => {
      const caps = await ctx.bridge.call<Record<string, unknown>>("app.capabilities");
      const extra = {
        ffmpeg: await toolAvailable(ctx.config.ffmpegPath),
        ffprobe: await toolAvailable(ctx.config.ffprobePath),
        aiProvider: ctx.config.ai.provider !== "none" && Boolean(ctx.config.ai.apiKey) ? ctx.config.ai.provider : null,
      };
      return { data: { ...caps, optional: extra }, message: "Capabilities probed from the running Resolve." };
    },
  });

  reg.define({ name: "resolve_get_application_info", category, readOnly: true, description: "Application info: product, version, current page, keyframe mode, database, Fusion availability.", input: {}, handler: async (_a, ctx) => run(ctx, "app.info") });
  reg.define({ name: "resolve_get_current_project", category, readOnly: true, description: "Name/id of the open project and its current timeline (null when none).", input: {}, handler: async (_a, ctx) => run(ctx, "project.current") });
  reg.define({ name: "resolve_get_current_page", category, readOnly: true, description: "The Resolve page currently shown (media, cut, edit, fusion, color, fairlight, deliver).", input: {}, handler: async (_a, ctx) => run(ctx, "app.get_page") });
  reg.define({
    name: "resolve_set_current_page", category,
    description: "Switch Resolve to a page. 'photo' only exists in versions that have the Photo page.",
    input: { page: z.enum(RESOLVE_PAGES) },
    handler: async (a, ctx) => run(ctx, "app.set_page", a, (d) => `Now on the ${(d as { page: string }).page} page.`),
  });
  reg.define({
    name: "resolve_get_system_info", category, readOnly: true,
    description: "Host system info (OS, CPU, memory) and the scripting paths in use.",
    input: {},
    handler: async (_a, ctx) => {
      const py = await ctx.bridge.call<Record<string, unknown>>("app.system_info").catch((e) => ({ error: (e as Error).message }));
      return { data: { os: `${platform()} ${release()}`, arch: arch(), cpus: cpus().length, cpuModel: cpus()[0]?.model, totalMemGb: +(totalmem() / 2 ** 30).toFixed(1), freeMemGb: +(freemem() / 2 ** 30).toFixed(1), node: process.version, python: py } };
    },
  });
}
