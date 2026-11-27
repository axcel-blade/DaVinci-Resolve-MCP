import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodRawShape } from "zod";
import type { ResolveBridge } from "../../resolve/bridge/bridge.js";
import type { AppConfig } from "../../config/index.js";
import type { JobManager } from "../../jobs/job-manager.js";
import type { AuditLog } from "../../utils/audit.js";
import type { PathPolicy } from "../../utils/paths.js";
import { McpToolError, toToolError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

export type ToolStatus = "ok" | "partial" | "unsupported";

export interface ToolResult {
  data?: unknown;
  message?: string;
  warnings?: string[];
  status?: ToolStatus;
}

export interface ToolContext {
  bridge: ResolveBridge;
  config: AppConfig;
  paths: PathPolicy;
  audit: AuditLog;
  registry: ToolRegistry;
  /** Background jobs for long calls (tools defined with background: true). */
  jobs: JobManager<ToolResult>;
  /** Report progress (0..total) for long operations when the client sent a progress token. */
  progress: (progress: number, total?: number, message?: string) => Promise<void>;
}

export interface ToolDef<S extends ZodRawShape> {
  name: string;
  title?: string;
  description: string;
  category: string;
  input: S;
  /** Destructive tools require `confirm: true`; without it they explain what would happen. */
  destructive?: boolean;
  readOnly?: boolean;
  /** Long-running: accepts background: true and then returns a jobId at once (collect with wait_for_job). */
  background?: boolean;
  /** Implementation status, for docs/SUPPORTED_FEATURES.md: api | fusion | integration | external | unsupported */
  support?: "api" | "fusion" | "integration" | "external" | "unsupported" | "planner";
  handler: (args: z.infer<z.ZodObject<S>>, ctx: ToolContext) => Promise<ToolResult>;
}

export const OutputShape = {
  ok: z.boolean().describe("True only when DaVinci Resolve confirmed the operation."),
  tool: z.string(),
  source: z.enum(["resolve", "mock", "server"]).optional().describe("Where the result came from: the real DaVinci Resolve, the mock adapter (tests), or the server alone."),
  status: z.enum(["ok", "partial", "unsupported", "error", "confirmation_required"]),
  message: z.string(),
  data: z.any().optional(),
  warnings: z.array(z.string()),
  error: z.object({ code: z.string(), message: z.string(), details: z.any().optional(), hint: z.string().optional() }).optional(),
};

const backgroundArg = z.boolean().optional().describe(
  "Run in the background: returns a jobId immediately; collect the result with wait_for_job / get_job.",
);

const confirmArg = z.boolean().optional().describe(
  "Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do.",
);

export interface RegisteredTool {
  name: string;
  title?: string;
  description: string;
  category: string;
  destructive: boolean;
  readOnly: boolean;
  support: string;
  inputSchema: z.ZodObject<ZodRawShape>;
  run: (args: unknown, ctx: ToolContext) => Promise<ToolResult>;
}

export class ToolRegistry {
  readonly tools = new Map<string, RegisteredTool>();

  define<S extends ZodRawShape>(def: ToolDef<S>): void {
    if (this.tools.has(def.name)) throw new Error(`Duplicate tool ${def.name}`);
    const shape: ZodRawShape = { ...def.input, ...(def.destructive ? { confirm: confirmArg } : {}), ...(def.background ? { background: backgroundArg } : {}) };
    const schema = z.object(shape).strict();
    this.tools.set(def.name, {
      name: def.name,
      title: def.title,
      description: def.destructive ? `${def.description} DESTRUCTIVE: requires confirm: true after explicit user confirmation.` : def.description,
      category: def.category,
      destructive: Boolean(def.destructive),
      readOnly: Boolean(def.readOnly),
      support: def.support ?? "api",
      inputSchema: schema as z.ZodObject<ZodRawShape>,
      run: async (raw, ctx) => {
        const parsed = schema.safeParse(raw ?? {});
        if (!parsed.success) {
          throw new McpToolError("VALIDATION_ERROR", `Invalid arguments for ${def.name}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`);
        }
        const args = parsed.data as Record<string, unknown>;
        if (def.destructive && ctx.config.safety.requireConfirmation && args.confirm !== true) {
          throw new McpToolError("CONFIRMATION_REQUIRED", `${def.name} is destructive and was not executed. Confirm with the user, then call again with confirm: true.`, { tool: def.name, arguments: args });
        }
        if (def.background && args.background === true) {
          const { background: _bg, ...rest } = args;
          const job = ctx.jobs.start(def.name, () => def.handler(rest as z.infer<z.ZodObject<S>>, ctx));
          return {
            data: { jobId: job.id, state: job.state, queuedJobs: ctx.jobs.active },
            message: `${def.name} started in the background. Call wait_for_job { jobId: "${job.id}" } or get_job to collect the result.`,
          };
        }
        return def.handler(args as z.infer<z.ZodObject<S>>, ctx);
      },
    });
  }

  /** Register a tool whose feature the scripting API does not expose: it always reports UNSUPPORTED honestly. */
  unsupported(name: string, category: string, description: string, reason: string, alternative: string, input: ZodRawShape = {}): void {
    this.define({
      name, category, description: `${description} (Not scriptable: ${reason})`, input: input as ZodRawShape, readOnly: true, support: "unsupported",
      handler: async () => {
        throw new McpToolError("UNSUPPORTED", `${name}: ${reason}`, undefined, alternative);
      },
    });
  }

  /** In-process call with full validation/safety (used by workflows and tests). */
  async invoke(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const t = this.tools.get(name);
    if (!t) throw new McpToolError("NOT_FOUND", `Unknown tool ${name}`);
    const started = Date.now();
    try {
      const out = await t.run(args, ctx);
      ctx.audit.record({ tool: name, ok: true, ms: Date.now() - started, destructive: t.destructive, args });
      return out;
    } catch (e) {
      const err = toToolError(e);
      ctx.audit.record({ tool: name, ok: false, ms: Date.now() - started, destructive: t.destructive, args, error: err.code });
      throw err;
    }
  }

  registerAll(server: McpServer, makeCtx: (extra: { sendNotification: (n: never) => Promise<void>; _meta?: { progressToken?: string | number } }) => ToolContext, categories: string[] = []): void {
    for (const t of this.tools.values()) {
      if (categories.length && !categories.includes(t.category) && t.category !== "meta") continue;
      const annotations: ToolAnnotations = {
        title: t.title,
        readOnlyHint: t.readOnly,
        destructiveHint: t.destructive,
        openWorldHint: false,
      };
      server.registerTool(
        t.name,
        { title: t.title, description: t.description, inputSchema: t.inputSchema.shape, outputSchema: OutputShape, annotations },
        (async (args: unknown, extra: Parameters<typeof makeCtx>[0]): Promise<CallToolResult> => {
          const ctx = makeCtx(extra);
          return toCallResult(t.name, () => this.invoke(t.name, args, ctx), t.support === "planner" || t.category === "meta" ? "server" : ctx.bridge.source);
        }) as never,
      );
    }
  }
}

export async function toCallResult(name: string, fn: () => Promise<ToolResult>, source?: "resolve" | "mock" | "server"): Promise<CallToolResult> {
  try {
    const out = await fn();
    const status = out.status ?? "ok";
    const payload = {
      ok: status === "ok",
      tool: name,
      ...(source ? { source } : {}),
      status,
      message: out.message ?? (status === "ok" ? `${name} completed.` : `${name} finished with status ${status}.`),
      data: out.data,
      warnings: out.warnings ?? [],
    };
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError: status !== "ok" && status !== "partial" };
  } catch (e) {
    const err = toToolError(e);
    const status = err.code === "UNSUPPORTED" ? "unsupported" : err.code === "CONFIRMATION_REQUIRED" ? "confirmation_required" : "error";
    logger.warn("tool error", { tool: name, code: err.code, message: err.message });
    const payload = { ok: false, tool: name, ...(source ? { source } : {}), status, message: err.message, warnings: [] as string[], error: err.toJSON() };
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError: true };
  }
}

/* Shared argument schemas live in ./args.ts (re-exported so tool modules keep one import). */
export * from "./args.js";

/* ---------------- handler helpers ---------------- */

/** Run a bridge op and wrap the Resolve-confirmed result. */
export async function run(ctx: ToolContext, op: string, params: object = {}, message?: string | ((d: unknown) => string), timeoutMs?: number): Promise<ToolResult> {
  const data = await ctx.bridge.call(op, params, timeoutMs);
  const warnings: string[] = [];
  const failed = (data as { failed?: unknown[] } | null)?.failed;
  if (Array.isArray(failed) && failed.length) warnings.push(`Resolve rejected: ${failed.join(", ")}`);
  return {
    data,
    message: typeof message === "function" ? message(data) : message,
    warnings,
    status: warnings.length ? "partial" : "ok",
  };
}

