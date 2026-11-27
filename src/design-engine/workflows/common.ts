import { z } from "zod";
import { COLOR_PRESETS, EXPORT_PRESETS } from "../presets/presets.js";
import { absPath } from "../../mcp/tools/registry.js";
import { tool, type StepCtx, type WorkflowStep } from "./engine.js";

export const WorkflowInput = {
  projectName: z.string().min(1).max(255).optional().describe("Create this new project. Omit to work in the currently open project."),
  footageFolder: absPath.optional().describe("Folder of footage to import"),
  footage: z.array(absPath).optional().describe("Individual files to import"),
  musicFile: absPath.optional(),
  title: z.string().max(500).optional(),
  targetSeconds: z.number().min(3).max(7200).default(60),
  look: z.enum(Object.keys(COLOR_PRESETS) as [string, ...string[]]).optional(),
  render: z.boolean().default(false).describe("Render at the end (writes a new file; never overwrites)."),
  exportPreset: z.enum(Object.keys(EXPORT_PRESETS) as [string, ...string[]]).optional(),
  outputDir: absPath.optional().describe("Render destination (default: OUTPUT_DIR/renders)"),
  generateSubtitles: z.boolean().default(false),
  dryRun: z.boolean().default(false).describe("Only list the steps that would run"),
};

export type WorkflowArgs = {
  projectName?: string; footageFolder?: string; footage?: string[]; musicFile?: string; title?: string; targetSeconds: number;
  look?: string; render: boolean; exportPreset?: string; outputDir?: string; generateSubtitles: boolean; dryRun: boolean;
};

const fileStem = (s: string) => s.replace(/[^\w-]+/g, "_").slice(0, 60) || "export";

/** Shared building blocks for production workflows. */
export function stdSteps(a: WorkflowArgs, o: { timelineName: string; width?: number; height?: number; fps?: string; shotSeconds: number; keywords?: string[]; defaultPreset: string; titleTool?: string; lowerThird?: string }): Record<string, WorkflowStep> {
  const preset = a.exportPreset ?? o.defaultPreset;
  return {
    status: { id: "status", label: "Check Resolve connection", required: true, run: tool("resolve_get_status", () => ({})) },
    project: {
      id: "project", label: `Create project '${a.projectName}'`, required: true, when: () => Boolean(a.projectName),
      run: tool("project_create", () => ({ name: a.projectName, width: o.width, height: o.height, frameRate: o.fps })),
    },
    requireProject: { id: "requireProject", label: "Confirm a project is open", required: true, when: () => !a.projectName, run: tool("project_get_info", () => ({})) },
    importFolder: {
      id: "importFolder", label: "Import footage folder", required: !a.footage?.length, when: () => Boolean(a.footageFolder),
      run: tool("media_import_folder", () => ({ path: a.footageFolder, organizeByType: true, bin: "Footage" })),
    },
    importFiles: { id: "importFiles", label: "Import footage files", required: !a.footageFolder, when: () => Boolean(a.footage?.length), run: tool("media_import", () => ({ paths: a.footage, bin: "Footage" })) },
    importMusic: { id: "importMusic", label: "Import background music", required: false, when: () => Boolean(a.musicFile), run: tool("audio_import", () => ({ paths: [a.musicFile], bin: "Music" })) },
    analyze: { id: "analyze", label: "Analyze clips", required: false, run: tool("ai_find_best_clips", () => ({ keywords: o.keywords, top: 50 })) },
    roughCut: {
      id: "roughCut", label: "Assemble rough cut on a new timeline", required: true,
      run: async (s: StepCtx) => {
        const music = (s.results.importMusic as { clips?: { id: string }[] } | undefined)?.clips?.[0]?.id;
        return s.ctx.registry.invoke(o.width && o.height && o.width < o.height ? "ai_create_social_video" : "ai_create_rough_cut", {
          goal: o.timelineName, targetSeconds: a.targetSeconds, shotSeconds: o.shotSeconds, keywords: o.keywords, timelineName: o.timelineName, musicClip: music, apply: true,
          ...(o.width && o.height && o.width < o.height ? { aspect: o.width === o.height ? "1:1" : "9:16" } : {}),
        }, s.ctx);
      },
    },
    title: {
      id: "title", label: "Add title", required: false, when: () => Boolean(a.title),
      run: async (s: StepCtx) => {
        const info = await s.ctx.bridge.call<{ startFrame: number }>("timeline.info", {});
        return s.ctx.registry.invoke(o.titleTool ?? "title_create_intro", { text: a.title, frame: info.startFrame }, s.ctx);
      },
    },
    lowerThird: {
      id: "lowerThird", label: "Add lower third", required: false, when: () => Boolean(o.lowerThird),
      run: async (s: StepCtx) => {
        const info = await s.ctx.bridge.call<{ startFrame: number; fps: number }>("timeline.info", {});
        return s.ctx.registry.invoke("title_create_lower_third", { text: o.lowerThird, frame: info.startFrame + Math.round(info.fps * 3) }, s.ctx);
      },
    },
    subtitles: { id: "subtitles", label: "Generate subtitles", required: false, when: () => a.generateSubtitles, run: tool("subtitle_generate", () => ({})) },
    grade: { id: "grade", label: `Apply ${a.look ?? "cinematic"} look`, required: false, run: tool("color_apply_look", () => ({ preset: a.look ?? "hollywood_cinematic", wholeTrack: true, trackIndex: 1 })) },
    render: {
      id: "render", label: `Render (${preset})`, required: true, when: () => a.render,
      run: async (s: StepCtx) => {
        const r = await s.ctx.registry.invoke("render_export_timeline", { preset, outputDir: a.outputDir ?? `${s.ctx.config.paths.outputDir}\\renders`, fileName: `${fileStem(a.projectName ?? o.timelineName)}-${Date.now()}` }, s.ctx);
        const p = (r.data as { output?: { path?: string } })?.output?.path;
        if (p) s.files.push(p);
        return r;
      },
    },
    save: { id: "save", label: "Save project", required: false, run: tool("project_save", () => ({})) },
  };
}
