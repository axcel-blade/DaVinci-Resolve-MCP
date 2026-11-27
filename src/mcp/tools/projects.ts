import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { backupProject, maybeBackup } from "../../utils/backup.js";
import { absPath, type ToolRegistry, run } from "./registry.js";
import { McpToolError } from "../../utils/errors.js";

const name = z.string().min(1).max(255).regex(/^[^\\/:*?"<>|]+$/, "Project names cannot contain \\ / : * ? \" < > |");

const FPS = ["23.976", "24", "25", "29.97", "30", "47.952", "48", "50", "59.94", "60", "119.88", "120"] as const;

export const ProjectSettingsInput = {
  width: z.number().int().min(16).max(16384).optional(),
  height: z.number().int().min(16).max(16384).optional(),
  frameRate: z.enum(FPS).optional().describe("Timeline frame rate. Must be set before media is added to a timeline."),
  playbackFrameRate: z.enum(FPS).optional(),
  colorScienceMode: z.string().optional().describe("e.g. davinciYRGB, davinciYRGBColorManagedv2, acescct"),
  colorSpaceTimeline: z.string().optional(),
  colorSpaceOutput: z.string().optional(),
  raw: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe("Any other documented project setting key/value (see project_get_settings)."),
};

export function toProjectSettings(a: { width?: number; height?: number; frameRate?: string; playbackFrameRate?: string; colorScienceMode?: string; colorSpaceTimeline?: string; colorSpaceOutput?: string; raw?: Record<string, unknown> }): Record<string, string> {
  const s: Record<string, string> = {};
  if (a.width) s.timelineResolutionWidth = String(a.width);
  if (a.height) s.timelineResolutionHeight = String(a.height);
  if (a.frameRate) s.timelineFrameRate = a.frameRate;
  if (a.playbackFrameRate ?? a.frameRate) s.timelinePlaybackFrameRate = (a.playbackFrameRate ?? a.frameRate)!;
  if (a.colorScienceMode) s.colorScienceMode = a.colorScienceMode;
  if (a.colorSpaceTimeline) s.colorSpaceTimeline = a.colorSpaceTimeline;
  if (a.colorSpaceOutput) s.colorSpaceOutput = a.colorSpaceOutput;
  for (const [k, v] of Object.entries(a.raw ?? {})) s[k] = String(v);
  return s;
}

export function registerProjects(reg: ToolRegistry): void {
  const category = "projects";

  reg.define({
    name: "project_create", category,
    description: "Create a new project in the current project-manager folder (and open it). Optionally set resolution, frame rate and color science, e.g. 4K 24 fps.",
    input: { name, ...ProjectSettingsInput },
    handler: async (a, ctx) => {
      const settings = toProjectSettings(a);
      const r = await ctx.bridge.call<{ name: string; settingsApplied: Record<string, { ok: boolean }> }>("project.create", { name: a.name, settings });
      const failed = Object.entries(r.settingsApplied).filter(([, v]) => !v.ok).map(([k]) => k);
      return { data: r, status: failed.length ? "partial" : "ok", warnings: failed.length ? [`Resolve rejected settings: ${failed.join(", ")}`] : [], message: `Project '${r.name}' created and opened.` };
    },
  });

  reg.define({ name: "project_open", category, description: "Open (load) an existing project by name from the current project-manager folder.", input: { name }, handler: async (a, ctx) => run(ctx, "project.open", a, `Project '${a.name}' opened.`) });
  reg.define({ name: "project_save", category, description: "Save the current project.", input: {}, handler: async (_a, ctx) => run(ctx, "project.save", {}, "Project saved.") });

  reg.define({
    name: "project_save_as", category,
    description: "Save the current project under a new name. Resolve has no direct Save-As API; this exports the project to a .drp and imports it under the new name, then optionally opens it.",
    input: { newName: name, open: z.boolean().default(true) },
    handler: async (a, ctx) => {
      await ctx.bridge.call("project.save");
      const bak = await backupProject(ctx);
      const imp = await ctx.bridge.call("project.import", { path: bak.path, name: a.newName });
      if (a.open) await ctx.bridge.call("project.open", { name: a.newName });
      return { data: { source: bak.project, copy: a.newName, viaFile: bak.path, import: imp }, message: `Saved '${bak.project}' as '${a.newName}'${a.open ? " and opened it" : ""}.` };
    },
  });

  reg.define({ name: "project_close", category, description: "Close the current project (saving first unless save=false).", input: { save: z.boolean().default(true) }, handler: async (a, ctx) => run(ctx, "project.close", a, "Project closed.") });

  reg.define({
    name: "project_delete", category, destructive: true,
    description: "Delete a project from the database. A .drp backup is exported first (BACKUP_BEFORE_DESTRUCTIVE). The project must not be open.",
    input: { name },
    handler: async (a, ctx) => {
      const warnings: string[] = [];
      const backup = await maybeBackup(ctx, warnings, a.name);
      if (ctx.config.safety.backupBeforeDestructive && !backup) {
        throw new McpToolError("OPERATION_FAILED", `Backup of '${a.name}' failed, so the project was NOT deleted. ${warnings.join(" ")}`);
      }
      const r = await ctx.bridge.call("project.delete", a);
      return { data: { ...(r as object), backup }, warnings, message: `Project '${a.name}' deleted${backup ? ` (backup: ${backup})` : ""}.` };
    },
  });

  reg.define({
    name: "project_duplicate", category,
    description: "Duplicate a project (export to .drp then import under a new name). Does not open the copy.",
    input: { source: name.optional().describe("Project to copy (default: current)"), newName: name },
    handler: async (a, ctx) => {
      const bak = await backupProject(ctx, a.source);
      const imp = await ctx.bridge.call("project.import", { path: bak.path, name: a.newName });
      return { data: { source: bak.project, copy: a.newName, viaFile: bak.path, import: imp }, message: `Duplicated '${bak.project}' as '${a.newName}'.` };
    },
  });

  reg.define({ name: "project_rename", category, description: "Rename the current project.", input: { newName: name }, handler: async (a, ctx) => run(ctx, "project.rename", { name: a.newName }, `Project renamed to '${a.newName}'.`) });
  reg.define({ name: "project_get_info", category, readOnly: true, description: "Current project info: name, timelines, key settings, render job count.", input: {}, handler: async (_a, ctx) => run(ctx, "project.info") });
  reg.define({ name: "project_list", category, readOnly: true, description: "List projects and folders in the current project-manager folder.", input: {}, handler: async (_a, ctx) => run(ctx, "project.list") });
  reg.define({
    name: "project_get_settings", category, readOnly: true,
    description: "Read project settings. Without keys returns all settings Resolve reports.",
    input: { keys: z.array(z.string()).optional() },
    handler: async (a, ctx) => run(ctx, "project.get_settings", a),
  });
  reg.define({
    name: "project_set_settings", category,
    description: "Set project settings (resolution, frame rate, color management, audio...). Each key is verified by reading it back. Frame rate cannot change once timelines contain media.",
    input: ProjectSettingsInput,
    handler: async (a, ctx) => {
      const settings = toProjectSettings(a);
      if (!Object.keys(settings).length) throw new McpToolError("INVALID_ARGUMENT", "No settings given.");
      return run(ctx, "project.set_settings", { settings }, "Project settings applied.");
    },
  });
  reg.define({ name: "project_get_timelines", category, readOnly: true, description: "List the project's timelines with ids and frame ranges.", input: {}, handler: async (_a, ctx) => run(ctx, "project.timelines") });

  reg.define({
    name: "project_backup", category,
    description: "Export a project (default: current) to a timestamped .drp in BACKUP_DIR (or a given folder under the allowed roots).",
    input: { name: name.optional(), folder: absPath.optional() },
    handler: async (a, ctx) => {
      if (a.folder) {
        const cur = await ctx.bridge.call<{ project: string | null }>("project.current");
        const proj = a.name ?? cur.project;
        if (!proj) throw new McpToolError("NO_PROJECT", "No project to back up.");
        const path = ctx.paths.write(join(ctx.paths.write(a.folder, { dir: true }), `${proj.replace(/[^\w.-]+/g, "_")}-${Date.now()}.drp`));
        return run(ctx, "project.export", { name: proj, path }, `Backup written to ${path}.`, 600000);
      }
      const r = await backupProject(ctx, a.name);
      return { data: r, message: `Backup written to ${r.path} (${r.bytes} bytes).` };
    },
  });

  reg.define({
    name: "project_list_backups", category, readOnly: true,
    description: "List .drp backups in BACKUP_DIR (newest first).",
    input: {},
    handler: async (_a, ctx) => {
      const dir = ctx.config.paths.backupDir;
      const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".drp")).map((f) => ({ path: join(dir, f), bytes: statSync(join(dir, f)).size, modified: statSync(join(dir, f)).mtime.toISOString() })) : [];
      files.sort((x, y) => y.modified.localeCompare(x.modified));
      return { data: { dir, backups: files } };
    },
  });

  reg.define({
    name: "project_restore", category,
    description: "Restore a project from a .drp (import) or .dra (archive restore) under a new name. Never overwrites an existing project.",
    input: { path: absPath, name: name.describe("Name for the restored project (must not already exist)") },
    handler: async (a, ctx) => {
      const p = ctx.paths.read(a.path, { kind: "file" });
      return run(ctx, "project.import", { path: p, name: a.name }, `Restored '${a.name}' from ${p}.`, 600000);
    },
  });
}
