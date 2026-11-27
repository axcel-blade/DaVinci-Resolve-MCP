import type { ToolContext, ToolResult } from "../../mcp/tools/common.js";
import { toToolError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

export interface StepCtx {
  ctx: ToolContext;
  /** Results of previous steps by step id. */
  results: Record<string, unknown>;
  files: string[];
  warnings: string[];
}

export interface WorkflowStep {
  id: string;
  label: string;
  /** Required steps abort the workflow on failure; optional steps record a warning and continue. */
  required: boolean;
  /** Skip when it returns false. */
  when?: (s: StepCtx) => boolean;
  run: (s: StepCtx) => Promise<ToolResult | unknown>;
}

export interface WorkflowReport {
  workflow: string;
  success: boolean;
  stepsCompleted: { id: string; label: string; message?: string }[];
  stepsFailed: { id: string; label: string; required: boolean; error: string; code: string }[];
  stepsSkipped: { id: string; label: string; reason: string }[];
  warnings: string[];
  filesCreated: string[];
  timeline?: unknown;
  render?: unknown;
  project?: unknown;
}

/** Call a tool through the registry (validation + safety + audit) from a workflow step. */
export function tool(name: string, args: (s: StepCtx) => object | Promise<object>) {
  return async (s: StepCtx) => s.ctx.registry.invoke(name, await args(s), s.ctx);
}

export async function runWorkflow(name: string, steps: WorkflowStep[], ctx: ToolContext, dryRun = false): Promise<WorkflowReport> {
  const s: StepCtx = { ctx, results: {}, files: [], warnings: [] };
  const report: WorkflowReport = { workflow: name, success: false, stepsCompleted: [], stepsFailed: [], stepsSkipped: [], warnings: s.warnings, filesCreated: s.files };
  if (dryRun) {
    report.stepsSkipped = steps.map((st) => ({ id: st.id, label: st.label, reason: "dry run" }));
    report.success = true;
    return report;
  }
  let aborted = false;
  for (const [i, st] of steps.entries()) {
    await ctx.progress(i, steps.length, st.label);
    if (aborted) {
      report.stepsSkipped.push({ id: st.id, label: st.label, reason: "a required step failed" });
      continue;
    }
    if (st.when && !st.when(s)) {
      report.stepsSkipped.push({ id: st.id, label: st.label, reason: "not applicable" });
      continue;
    }
    try {
      const out = await st.run(s);
      s.results[st.id] = (out as ToolResult)?.data ?? out;
      const r = out as ToolResult;
      if (r?.warnings?.length) s.warnings.push(...r.warnings.map((w) => `${st.id}: ${w}`));
      if (r?.status === "unsupported" || r?.status === "partial") s.warnings.push(`${st.id}: finished with status ${r.status}`);
      report.stepsCompleted.push({ id: st.id, label: st.label, message: r?.message });
    } catch (e) {
      const err = toToolError(e);
      logger.warn("workflow step failed", { workflow: name, step: st.id, code: err.code, message: err.message });
      report.stepsFailed.push({ id: st.id, label: st.label, required: st.required, error: err.message, code: err.code });
      if (st.required) aborted = true;
    }
  }
  await ctx.progress(steps.length, steps.length, "done");
  report.success = !report.stepsFailed.some((f) => f.required);
  try {
    report.project = await ctx.bridge.call("project.current");
    report.timeline = await ctx.bridge.call("timeline.info", {});
  } catch {
    /* no project/timeline */
  }
  report.render = s.results.render;
  return report;
}
