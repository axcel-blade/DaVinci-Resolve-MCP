/** Error codes shared with resolve-scripts/errors.py. */
export type ErrorCode =
  | "RESOLVE_NOT_INSTALLED" | "RESOLVE_NOT_RUNNING" | "SCRIPTING_UNAVAILABLE" | "PYTHON_NOT_FOUND"
  | "NO_PROJECT" | "NO_TIMELINE" | "NO_COMPOSITION" | "NOT_FOUND" | "AMBIGUOUS" | "ALREADY_EXISTS"
  | "FILE_NOT_FOUND" | "FILE_EXISTS" | "NO_MEDIA" | "INVALID_ARGUMENT" | "INVALID_STATE" | "INVALID_PATH"
  | "PATH_NOT_ALLOWED" | "PERMISSION_DENIED" | "INSUFFICIENT_STORAGE" | "OPERATION_FAILED" | "UNSUPPORTED"
  | "CONFIRMATION_REQUIRED" | "TIMEOUT" | "BRIDGE_CRASHED" | "BRIDGE_EXCEPTION" | "UNKNOWN_OP" | "BAD_REQUEST"
  | "RENDER_FAILED" | "PROVIDER_NOT_CONFIGURED" | "PROVIDER_ERROR" | "VALIDATION_ERROR" | "INTERNAL";

export class McpToolError extends Error {
  constructor(public code: ErrorCode | string, message: string, public details?: unknown, public hint?: string) {
    super(message);
    this.name = "McpToolError";
  }
  toJSON(): { code: string; message: string; details?: unknown; hint?: string } {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
      ...(this.hint ? { hint: this.hint } : {}),
    };
  }
}

const HINTS: Record<string, string> = {
  RESOLVE_NOT_INSTALLED: "Install DaVinci Resolve, or set RESOLVE_INSTALL_DIR / RESOLVE_SCRIPT_LIB to your installation.",
  RESOLVE_NOT_RUNNING: "Start DaVinci Resolve (resolve_launch) and set Preferences > System > General > External scripting using = Local.",
  SCRIPTING_UNAVAILABLE: "Check RESOLVE_SCRIPT_API and that your Python is 64-bit and supported by your Resolve version. Run scripts/check-deps.ps1.",
  PYTHON_NOT_FOUND: "Install 64-bit Python 3 or set RESOLVE_PYTHON to the python.exe path.",
  NO_PROJECT: "Open a project with project_open or create one with project_create.",
  NO_TIMELINE: "Open a timeline with timeline_open or create one with timeline_create.",
  CONFIRMATION_REQUIRED: "Ask the user to confirm, then call again with confirm: true.",
  UNSUPPORTED: "This feature is not exposed by the Resolve scripting API in your version. See docs/SUPPORTED_FEATURES.md for alternatives.",
  TIMEOUT: "Increase RESOLVE_TIMEOUT_MS, or check whether Resolve is showing a modal dialog.",
};

export function toToolError(err: unknown): McpToolError {
  if (err instanceof McpToolError) {
    if (!err.hint && HINTS[err.code]) err.hint = HINTS[err.code];
    return err;
  }
  const e = err as { code?: string; message?: string };
  if (e && typeof e === "object" && typeof e.code === "string" && typeof e.message === "string") {
    if (e.code === "EACCES" || e.code === "EPERM") return new McpToolError("PERMISSION_DENIED", e.message);
    if (e.code === "ENOSPC") return new McpToolError("INSUFFICIENT_STORAGE", e.message);
    if (e.code === "ENOENT") return new McpToolError("FILE_NOT_FOUND", e.message);
  }
  return new McpToolError("INTERNAL", err instanceof Error ? err.message : String(err));
}

export function unsupported(feature: string, alternative?: string): McpToolError {
  return new McpToolError(
    "UNSUPPORTED",
    `${feature} is not available through the DaVinci Resolve scripting API.`,
    undefined,
    alternative,
  );
}
