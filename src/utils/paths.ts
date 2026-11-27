import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, normalize, relative, resolve, sep } from "node:path";
import type { AppConfig } from "../config/index.js";
import { McpToolError } from "./errors.js";

/**
 * Filesystem path policy.
 *  - Paths must be absolute local paths (no device namespaces, no NUL bytes).
 *  - Reads: any local path unless ALLOWED_READ_PATHS is set.
 *  - Writes (exports, renders, backups, LUTs): only under allowed write roots.
 *  - Existing files are never overwritten unless the caller passes overwrite: true.
 */
export class PathPolicy {
  constructor(private cfg: AppConfig["paths"]) {}

  get writeRoots(): string[] {
    return this.cfg.allowedWritePaths;
  }

  normalize(p: string): string {
    if (typeof p !== "string" || !p.trim()) throw new McpToolError("INVALID_PATH", "Path is empty.");
    if (p.includes("\0")) throw new McpToolError("INVALID_PATH", "Path contains a NUL byte.");
    if (/^\\\\[?.]\\/.test(p)) throw new McpToolError("INVALID_PATH", "Device namespace paths (\\\\?\\, \\\\.\\) are not allowed.");
    if (!isAbsolute(p)) throw new McpToolError("INVALID_PATH", `Path must be absolute: ${p}`);
    return normalize(resolve(p));
  }

  private within(p: string, root: string): boolean {
    const rel = relative(root.toLowerCase(), p.toLowerCase());
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel) && !rel.startsWith(sep));
  }

  private real(p: string): string {
    // Resolve symlinks of the deepest existing ancestor so links cannot escape a root.
    let cur = p;
    while (!existsSync(cur)) {
      const up = dirname(cur);
      if (up === cur) return p;
      cur = up;
    }
    try {
      const r = realpathSync(cur);
      return resolve(r, relative(cur, p));
    } catch {
      return p;
    }
  }

  read(p: string, opts: { mustExist?: boolean; kind?: "file" | "dir" } = {}): string {
    const n = this.normalize(p);
    if (this.cfg.allowedReadPaths.length && !this.cfg.allowedReadPaths.some((r) => this.within(this.real(n), r))) {
      throw new McpToolError("PATH_NOT_ALLOWED", `Reading ${n} is outside ALLOWED_READ_PATHS.`);
    }
    if (opts.mustExist !== false) {
      if (!existsSync(n)) throw new McpToolError("FILE_NOT_FOUND", `${n} does not exist.`);
      const st = statSync(n);
      if (opts.kind === "file" && !st.isFile()) throw new McpToolError("INVALID_PATH", `${n} is not a file.`);
      if (opts.kind === "dir" && !st.isDirectory()) throw new McpToolError("INVALID_PATH", `${n} is not a folder.`);
    }
    return n;
  }

  write(p: string, opts: { overwrite?: boolean; dir?: boolean } = {}): string {
    const n = this.normalize(p);
    const real = this.real(n);
    if (!this.cfg.allowedWritePaths.some((r) => this.within(real, r))) {
      throw new McpToolError("PATH_NOT_ALLOWED", `Writing to ${n} is not allowed. Allowed roots: ${this.cfg.allowedWritePaths.join("; ")}`, undefined,
        "Use a path under one of the allowed roots, or add a folder to ALLOWED_WRITE_PATHS.");
    }
    if (!opts.dir && existsSync(n) && !opts.overwrite) {
      throw new McpToolError("FILE_EXISTS", `${n} already exists. Pass overwrite: true (after confirming with the user) to replace it.`);
    }
    return n;
  }
}
