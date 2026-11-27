import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { LUA_DIR } from "../../config/constants.js";
import { McpToolError } from "../../utils/errors.js";

const exec = promisify(execFile);

/** Bundled Lua helper names. Only these run: AI-generated code is never executed. */
export const LUA_HELPERS = ["list_tools", "comp_summary"] as const;
export type LuaHelper = (typeof LUA_HELPERS)[number];

/**
 * Runs bundled Fusion Lua helpers (resolve-scripts/fusion_helpers.lua) through Resolve's fuscript
 * executable. Arguments are passed as a JSON string; output is the JSON the helper prints.
 */
export async function runLuaHelper(fuscript: string | undefined, helper: LuaHelper, args: object, timeoutMs = 30000): Promise<unknown> {
  if (!LUA_HELPERS.includes(helper)) throw new McpToolError("INVALID_ARGUMENT", `Unknown Lua helper ${helper}`);
  if (!fuscript || !existsSync(fuscript)) {
    throw new McpToolError("UNSUPPORTED", "fuscript executable not found in the Resolve installation; Lua helpers are unavailable.");
  }
  const script = join(LUA_DIR, "fusion_helpers.lua");
  try {
    const { stdout } = await exec(fuscript, ["-l", "lua", script, helper, JSON.stringify(args)], { timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    const line = stdout.split(/\r?\n/).reverse().find((l) => l.trim().startsWith("{") || l.trim().startsWith("["));
    return line ? JSON.parse(line) : { raw: stdout };
  } catch (e) {
    throw new McpToolError("OPERATION_FAILED", `Lua helper ${helper} failed: ${(e as Error).message}`);
  }
}
