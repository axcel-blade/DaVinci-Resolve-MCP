import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { promisify } from "node:util";
import { McpToolError } from "./errors.js";

const exec = promisify(execFile);

export interface ProbeResult {
  path: string;
  bytes: number;
  formatName?: string;
  durationSec?: number;
  bitRate?: number;
  video?: { codec?: string; width?: number; height?: number; fps?: number; pixFmt?: string; frames?: number };
  audio?: { codec?: string; channels?: number; sampleRate?: number; layout?: string };
  subtitles: number;
}

function rate(r?: string): number | undefined {
  if (!r) return undefined;
  const [a, b] = r.split("/").map(Number);
  return a && b ? Math.round((a / b) * 1000) / 1000 : undefined;
}

let ffAvailable: Record<string, boolean> = {};

export async function toolAvailable(bin: string): Promise<boolean> {
  if (bin in ffAvailable) return ffAvailable[bin]!;
  try {
    await exec(bin, ["-version"], { timeout: 8000, windowsHide: true });
    ffAvailable[bin] = true;
  } catch {
    ffAvailable[bin] = false;
  }
  return ffAvailable[bin]!;
}

export function resetToolCache(): void {
  ffAvailable = {};
}

/** Read technical metadata with ffprobe (optional dependency). */
export async function probe(ffprobe: string, path: string): Promise<ProbeResult> {
  const bytes = statSync(path).size;
  if (!(await toolAvailable(ffprobe))) {
    throw new McpToolError("UNSUPPORTED", "ffprobe is not installed or not on PATH; detailed media analysis is unavailable.", undefined, "Install FFmpeg and set FFPROBE_PATH, or use media_get_info (reads Resolve's own clip properties).");
  }
  const { stdout } = await exec(ffprobe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path], { timeout: 60000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  const j = JSON.parse(stdout) as { format?: Record<string, string>; streams?: Record<string, string | number>[] };
  const v = j.streams?.find((s) => s.codec_type === "video");
  const a = j.streams?.find((s) => s.codec_type === "audio");
  return {
    path, bytes,
    formatName: j.format?.format_name,
    durationSec: j.format?.duration ? Number(j.format.duration) : undefined,
    bitRate: j.format?.bit_rate ? Number(j.format.bit_rate) : undefined,
    video: v ? { codec: String(v.codec_name), width: Number(v.width), height: Number(v.height), fps: rate(String(v.avg_frame_rate || v.r_frame_rate)), pixFmt: String(v.pix_fmt), frames: v.nb_frames ? Number(v.nb_frames) : undefined } : undefined,
    audio: a ? { codec: String(a.codec_name), channels: Number(a.channels), sampleRate: Number(a.sample_rate), layout: a.channel_layout ? String(a.channel_layout) : undefined } : undefined,
    subtitles: (j.streams ?? []).filter((s) => s.codec_type === "subtitle").length,
  };
}

/** Scene changes via ffmpeg's scene score (select filter). Returns cut times in seconds. */
export async function detectScenes(ffmpeg: string, path: string, threshold = 0.35, timeoutMs = 15 * 60 * 1000): Promise<number[]> {
  if (!(await toolAvailable(ffmpeg))) throw new McpToolError("UNSUPPORTED", "ffmpeg is not installed; file-based scene detection is unavailable.", undefined, "Install FFmpeg, or use ai_detect_scenes with source: 'timeline' (Resolve's DetectSceneCuts).");
  const { stderr } = await exec(ffmpeg, ["-hide_banner", "-nostats", "-i", path, "-an", "-vf", `select='gt(scene,${threshold})',showinfo`, "-f", "null", "-"], { timeout: timeoutMs, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return [...stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
}

/** EBU R128 loudness with ffmpeg's ebur128 filter. */
export async function loudness(ffmpeg: string, path: string, timeoutMs = 15 * 60 * 1000): Promise<{ integratedLufs?: number; lraLu?: number; truePeakDbtp?: number }> {
  if (!(await toolAvailable(ffmpeg))) throw new McpToolError("UNSUPPORTED", "ffmpeg is not installed; loudness analysis is unavailable.", undefined, "Install FFmpeg and set FFMPEG_PATH, or use Fairlight's Loudness meter.");
  const { stderr } = await exec(ffmpeg, ["-hide_banner", "-nostats", "-i", path, "-vn", "-filter_complex", "ebur128=peak=true", "-f", "null", "-"], { timeout: timeoutMs, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  const num = (re: RegExp) => {
    const m = re.exec(summary);
    return m ? Number(m[1]) : undefined;
  };
  return { integratedLufs: num(/I:\s+(-?[\d.]+) LUFS/), lraLu: num(/LRA:\s+(-?[\d.]+) LU/), truePeakDbtp: num(/Peak:\s+(-?[\d.]+) dBFS/) };
}

/** Silence ranges (seconds) via ffmpeg silencedetect. */
export async function silences(ffmpeg: string, path: string, noiseDb = -35, minSec = 0.6): Promise<{ start: number; end: number }[]> {
  if (!(await toolAvailable(ffmpeg))) throw new McpToolError("UNSUPPORTED", "ffmpeg is not installed; silence detection is unavailable.");
  const { stderr } = await exec(ffmpeg, ["-hide_banner", "-nostats", "-i", path, "-vn", "-af", `silencedetect=noise=${noiseDb}dB:d=${minSec}`, "-f", "null", "-"], { timeout: 15 * 60 * 1000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const starts = [...stderr.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  return starts.map((s, i) => ({ start: Math.max(0, s), end: ends[i] ?? Number.NaN }));
}

/** Image statistics of a still (luma/chroma averages) via ffmpeg signalstats. */
export async function frameStats(ffmpeg: string, path: string): Promise<Record<string, number>> {
  if (!(await toolAvailable(ffmpeg))) throw new McpToolError("UNSUPPORTED", "ffmpeg is not installed; frame statistics are unavailable.");
  const { stderr } = await exec(ffmpeg, ["-hide_banner", "-i", path, "-vf", "signalstats,metadata=print", "-f", "null", "-"], { timeout: 60000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  const out: Record<string, number> = {};
  for (const m of stderr.matchAll(/lavfi\.signalstats\.(\w+)=([-\d.]+)/g)) out[m[1]!] = Number(m[2]);
  return out;
}

export function sha256File(path: string): Promise<string> {
  return new Promise((res, rej) => {
    const h = createHash("sha256");
    createReadStream(path).on("data", (d) => h.update(d)).on("end", () => res(h.digest("hex"))).on("error", rej);
  });
}
