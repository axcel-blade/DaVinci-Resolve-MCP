import { z } from "zod";
import type { JobRecord } from "../../jobs/job-manager.js";
import type { ToolRegistry, ToolResult } from "./registry.js";

const jobIdArg = z.string().min(1).max(64).describe("Id returned by a tool called with background: true");

/** A finished job's result is shown as the original tool would have returned it. */
function jobOutput(job: JobRecord<ToolResult>): ToolResult {
  const { result, ...meta } = job;
  if (job.state !== "succeeded" || !result) {
    return { data: { job: meta }, message: job.error ? `Job ${job.id} ${job.state}: ${job.error.message}` : `Job ${job.id} is ${job.state}.` };
  }
  return { data: { job: meta, result: result.data }, warnings: result.warnings, status: result.status, message: result.message ?? `Job ${job.id} succeeded.` };
}

/** Background-job tools. Category "meta" so MCP_TOOL_CATEGORIES never hides them. */
export function registerJobs(reg: ToolRegistry): void {
  const category = "meta";
  reg.define({
    name: "get_job", category, readOnly: true, support: "planner",
    description: "Status of a background job (queued | running | succeeded | failed | cancelled). When it has succeeded, also returns the tool's full result.",
    input: { jobId: jobIdArg },
    handler: async ({ jobId }, ctx) => jobOutput(ctx.jobs.get(jobId)),
  });
  reg.define({
    name: "wait_for_job", category, readOnly: true, support: "planner",
    description: "Wait up to timeoutSeconds for a background job to finish, then return it as get_job does. If it is still running, call again; the job keeps going either way.",
    input: { jobId: jobIdArg, timeoutSeconds: z.number().int().min(1).max(55).default(30) },
    handler: async ({ jobId, timeoutSeconds }, ctx) => jobOutput(await ctx.jobs.wait(jobId, timeoutSeconds * 1000)),
  });
  reg.define({
    name: "list_jobs", category, readOnly: true, support: "planner",
    description: "List recent background jobs, newest first (results omitted; use get_job).",
    input: {},
    handler: async (_a, ctx) => ({ data: { active: ctx.jobs.active, jobs: ctx.jobs.list() } }),
  });
  reg.define({
    name: "cancel_job", category, support: "planner",
    description: "Cancel a queued background job. A job already running inside DaVinci Resolve cannot be interrupted; the result says so (use render_cancel for renders).",
    input: { jobId: jobIdArg },
    handler: async ({ jobId }, ctx) => ({ data: ctx.jobs.cancel(jobId) }),
  });
}
