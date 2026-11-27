import { join } from "node:path";
import type { ToolContext } from "../mcp/tools/registry.js";
import { logger } from "./logger.js";

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function safeName(n: string): string {
  return n.replace(/[^\w.-]+/g, "_").slice(0, 80);
}

/** Export a project to BACKUP_DIR/<name>-<timestamp>.drp. Returns the path. */
export async function backupProject(ctx: ToolContext, projectName?: string): Promise<{ path: string; bytes: number; project: string }> {
  const cur = await ctx.bridge.call<{ project: string | null }>("project.current");
  const name = projectName ?? cur.project;
  if (!name) throw new Error("No project to back up.");
  const path = ctx.paths.write(join(ctx.config.paths.backupDir, `${safeName(name)}-${stamp()}.drp`));
  const r = await ctx.bridge.call<{ path: string; bytes: number; project: string }>("project.export", { name, path, withStillsAndLUTs: true }, 10 * 60 * 1000);
  logger.info("project backup written", { project: name, path: r.path, bytes: r.bytes });
  return r;
}

/** Back up before a risky change when BACKUP_BEFORE_DESTRUCTIVE is on. Failure is reported, not hidden. */
export async function maybeBackup(ctx: ToolContext, warnings: string[], projectName?: string): Promise<string | undefined> {
  if (!ctx.config.safety.backupBeforeDestructive) return undefined;
  try {
    const r = await backupProject(ctx, projectName);
    return r.path;
  } catch (e) {
    warnings.push(`Automatic project backup failed: ${(e as Error).message}`);
    return undefined;
  }
}
