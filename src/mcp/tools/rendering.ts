import { existsSync, mkdirSync, readdirSync, statfsSync, statSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { z } from "zod";
import { probe, toolAvailable } from "../../utils/media-probe.js";
import { EXPORT_PRESETS } from "../../design-engine/presets/presets.js";
import { absPath, timelineArg, type ToolContext, type ToolRegistry, type ToolResult, clean, run } from "./common.js";
import { McpToolError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

const presetKeys = Object.keys(EXPORT_PRESETS) as [string, ...string[]];

export const RenderTarget = {
  timeline: timelineArg,
  preset: z.enum(presetKeys).default("youtube_1080p"),
  outputDir: absPath,
  fileName: z.string().min(1).max(200).regex(/^[^\\/:*?"<>|]+$/).describe("File name without extension"),
  format: z.string().optional().describe("Override render format (e.g. mp4, mov) — see render_get_settings"),
  codec: z.string().optional().describe("Override codec (validated against GetRenderCodecs)"),
  width: z.number().int().min(16).max(16384).optional(),
  height: z.number().int().min(16).max(16384).optional(),
  frameRate: z.string().optional(),
  quality: z.union([z.number().int(), z.string()]).optional().describe("VideoQuality: 0 = auto, or bitrate in Kb/s, or Least/Low/Medium/High/Best"),
  markIn: z.number().int().min(0).optional(),
  markOut: z.number().int().min(0).optional(),
  exportAudio: z.boolean().optional(),
  exportVideo: z.boolean().optional(),
  overwrite: z.boolean().default(false),
};

type Target = { timeline?: string; preset: string; outputDir: string; fileName: string; format?: string; codec?: string; width?: number; height?: number; frameRate?: string; quality?: number | string; markIn?: number; markOut?: number; exportAudio?: boolean; exportVideo?: boolean; overwrite: boolean };

/** Free bytes on the volume holding dir (undefined when unknown). */
function freeBytes(dir: string): number | undefined {
  try {
    const st = statfsSync(dir);
    return Number(st.bavail) * Number(st.bsize);
  } catch {
    return undefined;
  }
}

/** Configure format/codec/settings and queue a job. Returns the job id and expected output. */
export async function queueRender(ctx: ToolContext, t: Target): Promise<{ jobId: string; expected: string; format: string; codec: string; settings: Record<string, unknown> }> {
  const preset = EXPORT_PRESETS[t.preset]!;
  const dir = ctx.paths.write(t.outputDir, { dir: true });
  mkdirSync(dir, { recursive: true });
  const free = freeBytes(dir);
  if (free !== undefined && free < 512 * 2 ** 20) throw new McpToolError("INSUFFICIENT_STORAGE", `Only ${(free / 2 ** 20).toFixed(0)} MB free in ${dir}.`);
  const format = t.format ?? preset.format;
  const expected = join(dir, `${t.fileName}.${t.format ?? preset.extension}`);
  if (existsSync(expected) && !t.overwrite) throw new McpToolError("FILE_EXISTS", `${expected} already exists. Pass overwrite: true (after confirming) or choose another fileName.`);
  if (t.timeline) await ctx.bridge.call("timeline.open", { name: t.timeline });
  const picked = await ctx.bridge.call<{ format: string; codec: string }>("render.pick_codec", { format, candidates: t.codec ? [t.codec] : preset.codecCandidates });
  await ctx.bridge.call("render.set_format", { format: picked.format, codec: picked.codec });
  const settings: Record<string, unknown> = clean({
    TargetDir: dir,
    CustomName: t.fileName,
    SelectAllFrames: t.markIn === undefined && t.markOut === undefined,
    MarkIn: t.markIn, MarkOut: t.markOut,
    FormatWidth: t.width ?? (preset.width || undefined),
    FormatHeight: t.height ?? (preset.height || undefined),
    FrameRate: t.frameRate,
    VideoQuality: t.quality,
    ExportVideo: t.exportVideo ?? preset.video ?? true,
    ExportAudio: t.exportAudio ?? preset.audio ?? true,
  });
  await ctx.bridge.call("render.set_settings", { settings });
  const job = await ctx.bridge.call<{ jobId: string }>("render.add_job", {});
  return { jobId: job.jobId, expected, format: picked.format, codec: picked.codec, settings };
}

/** Poll a job until it finishes; reports MCP progress. Never assumes success. */
export async function waitForJob(ctx: ToolContext, jobId: string, timeoutMs: number): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < deadline) {
    const st = await ctx.bridge.call<{ status: Record<string, unknown>; rendering: boolean }>("render.job_status", { jobId });
    const status = String(st.status.JobStatus ?? "");
    const pct = Number(st.status.CompletionPercentage ?? 0);
    if (pct !== last) {
      last = pct;
      await ctx.progress(pct, 100, `Rendering ${pct}% (${status})`);
    }
    if (/complete/i.test(status)) return st.status;
    if (/fail|cancel/i.test(status)) throw new McpToolError("RENDER_FAILED", `Render job ${jobId} ended with status '${status}'.`, st.status);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new McpToolError("TIMEOUT", `Render job ${jobId} did not finish within ${Math.round(timeoutMs / 1000)} s. It may still be running: check render_get_status.`);
}

/** Find the file a job produced (Resolve may append numbering for sequences). */
export function findOutput(expected: string): string | undefined {
  if (existsSync(expected)) return expected;
  const dir = dirname(expected);
  const stem = basename(expected, extname(expected));
  if (!existsSync(dir)) return undefined;
  const hit = readdirSync(dir).filter((f) => f.startsWith(stem)).map((f) => join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  return hit;
}

export async function verifyOutput(ctx: ToolContext, path: string, expect?: { width?: number; height?: number; minDurationSec?: number }): Promise<{ ok: boolean; path: string; bytes: number; checks: Record<string, boolean | string>; probe?: unknown }> {
  if (!existsSync(path)) throw new McpToolError("RENDER_FAILED", `Output file ${path} does not exist.`);
  const bytes = statSync(path).size;
  const checks: Record<string, boolean | string> = { exists: true, nonEmpty: bytes > 0 };
  let info: Awaited<ReturnType<typeof probe>> | undefined;
  if (await toolAvailable(ctx.config.ffprobePath)) {
    try {
      info = await probe(ctx.config.ffprobePath, path);
      checks.readable = true;
      if (expect?.width && info.video?.width) checks.width = info.video.width === expect.width;
      if (expect?.height && info.video?.height) checks.height = info.video.height === expect.height;
      if (expect?.minDurationSec !== undefined && info.durationSec !== undefined) checks.duration = info.durationSec >= expect.minDurationSec;
    } catch (e) {
      checks.readable = false;
      checks.probeError = (e as Error).message;
    }
  } else checks.readable = "not checked (ffprobe unavailable)";
  const ok = Object.values(checks).every((v) => v !== false);
  return { ok, path, bytes, checks, probe: info };
}

async function renderAndVerify(ctx: ToolContext, t: Target, wait: boolean): Promise<ToolResult> {
  const q = await queueRender(ctx, t);
  await ctx.bridge.call("render.start", { jobIds: [q.jobId] });
  logger.info("render started", { jobId: q.jobId, expected: q.expected });
  if (!wait) return { data: { ...q, started: true }, message: `Render job ${q.jobId} started. Poll render_get_status { jobId: "${q.jobId}" } then render_verify_output.` };
  const status = await waitForJob(ctx, q.jobId, ctx.config.resolve.renderTimeoutMs);
  const out = findOutput(q.expected);
  if (!out) throw new McpToolError("RENDER_FAILED", `Resolve reported the job complete but no output was found at ${q.expected}.`, status);
  const preset = EXPORT_PRESETS[t.preset]!;
  const v = await verifyOutput(ctx, out, { width: t.width ?? (preset.width || undefined), height: t.height ?? (preset.height || undefined) });
  return { data: { jobId: q.jobId, format: q.format, codec: q.codec, status, output: v }, status: v.ok ? "ok" : "partial", warnings: v.ok ? [] : [`Verification issues: ${JSON.stringify(v.checks)}`], message: v.ok ? `Render complete and verified: ${out} (${(v.bytes / 2 ** 20).toFixed(1)} MB).` : `Rendered ${out}, but verification flagged issues.` };
}

export function registerRendering(reg: ToolRegistry): void {
  const category = "rendering";
  reg.define({ name: "render_get_settings", category, readOnly: true, description: "Current render format/codec, render mode, saved render presets and (for the current codec) supported resolutions.", input: {}, handler: async (_a, ctx) => run(ctx, "render.get_settings") });
  reg.define({ name: "render_list_formats", category, readOnly: true, description: "Render formats (and optionally codecs per format) this Resolve supports.", input: { withCodecs: z.boolean().default(false) }, handler: async (a, ctx) => run(ctx, "render.formats", a) });
  reg.define({ name: "render_list_presets", category, readOnly: true, description: "Built-in MCP export presets (YouTube, TikTok, Reels, Stories, Feed, Facebook, Master, Archive, sequences, audio).", input: {}, handler: async () => ({ data: EXPORT_PRESETS }) });
  reg.define({
    name: "render_set_settings", category,
    description: "Set render format/codec (validated) and/or raw render settings (TargetDir, CustomName, FormatWidth/Height, FrameRate, VideoQuality, ExportAudio/Video, MarkIn/Out, AudioCodec, AudioBitDepth, AudioSampleRate, ...). Or load a saved Resolve render preset.",
    input: { format: z.string().optional(), codec: z.string().optional(), settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(), resolvePreset: z.string().optional(), mode: z.enum(["individual", "single"]).optional() },
    handler: async (a, ctx) => {
      const out: Record<string, unknown> = {};
      if (a.resolvePreset) out.preset = await ctx.bridge.call("render.load_preset", { preset: a.resolvePreset });
      if (a.format && a.codec) out.formatAndCodec = await ctx.bridge.call("render.set_format", { format: a.format, codec: a.codec });
      if (a.mode) out.mode = await ctx.bridge.call("render.set_mode", { mode: a.mode });
      if (a.settings) {
        const s = { ...a.settings };
        if (typeof s.TargetDir === "string") s.TargetDir = ctx.paths.write(s.TargetDir, { dir: true });
        out.settings = await ctx.bridge.call("render.set_settings", { settings: s });
      }
      if (!Object.keys(out).length) throw new McpToolError("INVALID_ARGUMENT", "Nothing to set.");
      return { data: out, message: "Render settings applied." };
    },
  });
  reg.define({
    name: "render_add_job", category,
    description: "Configure a render from an export preset (format/codec validated) and add it to the render queue without starting.",
    input: RenderTarget,
    handler: async (a, ctx) => { const q = await queueRender(ctx, a); return { data: q, message: `Queued job ${q.jobId} -> ${q.expected}.` }; },
  });
  reg.define({ name: "render_start", category, background: true, description: "Start rendering queued jobs (all, or the given ids). Returns immediately; poll render_get_status.", input: { jobIds: z.array(z.string()).optional(), interactive: z.boolean().default(false) }, handler: async (a, ctx) => run(ctx, "render.start", clean(a), "Rendering started.") });
  reg.unsupported("render_pause", category, "Pause rendering.", "the scripting API can only start or stop rendering.", "Use render_cancel to stop; restart later with render_start (the job restarts from the beginning).");
  reg.define({ name: "render_cancel", category, destructive: true, description: "Stop the render in progress (partial output may remain on disk).", input: {}, handler: async (_a, ctx) => run(ctx, "render.stop", {}, "Rendering stopped.") });
  reg.define({
    name: "render_get_status", category, readOnly: true,
    description: "Status of one render job (JobStatus, CompletionPercentage, time taken) or whether any render is in progress.",
    input: { jobId: z.string().optional() },
    handler: async (a, ctx) => (a.jobId ? run(ctx, "render.job_status", a) : run(ctx, "render.is_rendering")),
  });
  reg.define({ name: "render_get_queue", category, readOnly: true, description: "All render jobs with their status.", input: {}, handler: async (_a, ctx) => run(ctx, "render.queue") });
  reg.define({ name: "render_remove_job", category, destructive: true, description: "Remove a job from the render queue (all: true clears the queue). Rendered files are not deleted.", input: { jobId: z.string().optional(), all: z.boolean().default(false) }, handler: async (a, ctx) => (a.all ? run(ctx, "render.delete_all_jobs") : a.jobId ? run(ctx, "render.delete_job", { jobId: a.jobId }) : Promise.reject(new McpToolError("INVALID_ARGUMENT", "Give jobId or all: true."))) });
  reg.define({
    name: "render_export_timeline", category, background: true,
    description: "One-step export: configure from a preset, queue, render, wait (with progress notifications), then verify the output file (exists, size, ffprobe metadata). Never reports success without a verified file.",
    input: { ...RenderTarget, wait: z.boolean().default(true) },
    handler: async (a, ctx) => renderAndVerify(ctx, a, a.wait),
  });
  reg.define({
    name: "render_export_clip", category, background: true,
    description: "Export just one timeline item's range (mark in/out set to the item) with a preset.",
    input: { ...RenderTarget, itemId: z.string().describe("Timeline item id from timeline_get_clips"), wait: z.boolean().default(true) },
    handler: async (a, ctx) => {
      const list = await ctx.bridge.call<{ items: { id: string; start: number; end: number }[] }>("timeline.clips", clean({ timeline: a.timeline }));
      const it = list.items.find((i) => i.id === a.itemId);
      if (!it) throw new McpToolError("NOT_FOUND", `Item ${a.itemId} not on the timeline.`);
      return renderAndVerify(ctx, { ...a, markIn: it.start, markOut: it.end - 1 }, a.wait);
    },
  });
  reg.define({
    name: "render_export_batch", category, background: true,
    description: "Queue several exports (e.g. YouTube 4K + TikTok + Instagram) of the same or different timelines, render them all, and verify each output.",
    input: { jobs: z.array(z.object(RenderTarget)).min(1).max(20), wait: z.boolean().default(true) },
    handler: async (a, ctx) => {
      const queued = [];
      for (const j of a.jobs) queued.push({ target: j, ...(await queueRender(ctx, j)) });
      await ctx.bridge.call("render.start", { jobIds: queued.map((q) => q.jobId) });
      if (!a.wait) return { data: queued, message: `${queued.length} job(s) started.` };
      const results = [];
      for (const q of queued) {
        try {
          await waitForJob(ctx, q.jobId, ctx.config.resolve.renderTimeoutMs);
          const out = findOutput(q.expected);
          results.push(out ? { jobId: q.jobId, ...(await verifyOutput(ctx, out)) } : { jobId: q.jobId, ok: false, error: "output not found" });
        } catch (e) {
          results.push({ jobId: q.jobId, ok: false, error: (e as Error).message });
        }
      }
      const okCount = results.filter((r) => r.ok).length;
      return { data: results, status: okCount === results.length ? "ok" : "partial", message: `${okCount}/${results.length} render(s) verified.` };
    },
  });
  reg.define({
    name: "render_verify_output", category, readOnly: true,
    description: "Verify a rendered file: exists, non-empty, readable by ffprobe, optional expected width/height/min duration.",
    input: { path: absPath, width: z.number().int().optional(), height: z.number().int().optional(), minDurationSec: z.number().optional() },
    handler: async (a, ctx) => {
      const v = await verifyOutput(ctx, ctx.paths.read(a.path), clean({ width: a.width, height: a.height, minDurationSec: a.minDurationSec }));
      return { data: v, status: v.ok ? "ok" : "partial", message: v.ok ? `Verified ${v.path}.` : `Verification failed: ${JSON.stringify(v.checks)}` };
    },
  });
  reg.define({ name: "render_save_preset", category, description: "Save the current render settings as a named Resolve render preset.", input: { name: z.string().min(1) }, handler: async (a, ctx) => run(ctx, "render.save_preset", a) });
  reg.define({ name: "render_import_preset", category, description: "Import a Resolve render preset file (.xml).", input: { path: absPath }, handler: async (a, ctx) => run(ctx, "render.import_preset", { path: ctx.paths.read(a.path, { kind: "file" }) }) });
}
