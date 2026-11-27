/** Deterministic editorial heuristics. Outputs are reviewable plans; nothing here touches Resolve. */

export interface ClipInfo {
  id: string;
  name: string;
  bin?: string;
  properties: Record<string, string | undefined>;
  metadata?: Record<string, string>;
}

export interface ScoredClip {
  id: string;
  name: string;
  score: number;
  reasons: string[];
  frames: number;
  fps: number;
  kind: "video" | "audio" | "still" | "other";
}

export function clipKind(c: ClipInfo): ScoredClip["kind"] {
  const t = (c.properties.Type ?? "").toLowerCase();
  if (t.includes("still") || t.includes("image")) return "still";
  if (t.includes("video")) return "video";
  if (t.includes("audio")) return "audio";
  return "other";
}

export function clipFrames(c: ClipInfo): number {
  const f = Number(c.properties.Frames);
  return Number.isFinite(f) ? f : 0;
}

export function clipFps(c: ClipInfo): number {
  const f = parseFloat(String(c.properties.FPS ?? ""));
  return Number.isFinite(f) && f > 0 ? f : 24;
}

const POSITIVE = /(best|good|hero|select|keeper|favorite|fav|final|beauty|wide|establish|drone|aerial|product|logo|interview|a-?cam)/i;
const NEGATIVE = /(test|junk|ng|bad|blur|false.?start|slate|reject|tmp|temp)/i;

/** Score clips for usefulness: resolution, duration, metadata flags and naming signals. */
export function scoreClips(clips: ClipInfo[], opts: { minSec?: number; maxSec?: number; keywords?: string[] } = {}): ScoredClip[] {
  const minSec = opts.minSec ?? 2;
  const maxSec = opts.maxSec ?? 600;
  const kws = (opts.keywords ?? []).map((k) => k.toLowerCase());
  return clips.map((c) => {
    const reasons: string[] = [];
    let score = 50;
    const fps = clipFps(c);
    const frames = clipFrames(c);
    const sec = frames / fps;
    const kind = clipKind(c);
    const res = /(\d+)\s*x\s*(\d+)/.exec(c.properties.Resolution ?? "");
    const h = res ? Math.min(Number(res[1]), Number(res[2])) : 0;
    if (h >= 2160) { score += 12; reasons.push("4K+ source"); } else if (h >= 1080) { score += 8; reasons.push("HD source"); } else if (h && h < 720) { score -= 10; reasons.push("low resolution"); }
    if (kind === "video") {
      if (sec < minSec) { score -= 25; reasons.push(`short (${sec.toFixed(1)}s)`); } else if (sec > maxSec) { score -= 5; reasons.push("very long take"); } else { score += 5; reasons.push("usable length"); }
    }
    const md = Object.entries(c.metadata ?? {}).map(([k, v]) => `${k}=${v}`).join(" ");
    const text = `${c.name} ${md} ${c.properties["Clip Color"] ?? ""}`;
    if (/good take=1|good take=true/i.test(md)) { score += 20; reasons.push("marked Good Take"); }
    const rating = /rating=(\d)/i.exec(md);
    if (rating) { score += (Number(rating[1]) - 2.5) * 8; reasons.push(`rated ${rating[1]}/5`); }
    if (POSITIVE.test(text)) { score += 8; reasons.push("positive naming/metadata"); }
    if (NEGATIVE.test(text)) { score -= 20; reasons.push("negative naming/metadata"); }
    for (const k of kws) if (text.toLowerCase().includes(k)) { score += 15; reasons.push(`matches '${k}'`); }
    return { id: c.id, name: c.name, score: Math.round(Math.max(0, Math.min(100, score))), reasons, frames, fps, kind };
  }).sort((a, b) => b.score - a.score);
}

export interface PlanSegment {
  clipId: string;
  clipName: string;
  sourceStart: number;
  sourceEnd: number;
  role: "a-roll" | "b-roll" | "hook" | "music" | "outro";
  note?: string;
}

export interface EditPlan {
  goal: string;
  targetSeconds: number;
  fps: number;
  segments: PlanSegment[];
  estimatedSeconds: number;
  titles: { text: string; atSecond: number; kind: string }[];
  musicClipId?: string;
  look?: string;
  exportPreset?: string;
  notes: string[];
}

/** Assemble a plan that fills targetSeconds from the best clips, taking the middle of each take. */
export function buildEditPlan(goal: string, scored: ScoredClip[], opts: { targetSeconds: number; fps: number; shotSeconds?: number; hookSeconds?: number; musicClipId?: string; title?: string; look?: string; exportPreset?: string }): EditPlan {
  const fps = opts.fps;
  const target = opts.targetSeconds * fps;
  const shot = Math.round((opts.shotSeconds ?? 4) * fps);
  const videos = scored.filter((s) => s.kind === "video" && s.frames > fps && s.score >= 30);
  const segments: PlanSegment[] = [];
  let total = 0;
  const notes: string[] = [];
  if (!videos.length) notes.push("No usable video clips found (need video clips longer than 1 second with score >= 30).");
  let i = 0;
  while (total < target && videos.length && i < videos.length * 4) {
    const v = videos[i % videos.length]!;
    const pass = Math.floor(i / videos.length);
    const len = Math.min(shot, v.frames, target - total);
    const usable = v.frames - len;
    const start = Math.max(0, Math.floor(usable * (0.5 + 0.2 * pass)) % Math.max(1, usable));
    if (len >= Math.round(fps / 2)) {
      segments.push({ clipId: v.id, clipName: v.name, sourceStart: start, sourceEnd: start + len, role: segments.length === 0 ? "hook" : i % 3 === 2 ? "b-roll" : "a-roll" });
      total += len;
    }
    i++;
  }
  if (total < target && videos.length) notes.push(`Only ${(total / fps).toFixed(1)}s of material available for a ${opts.targetSeconds}s target.`);
  return {
    goal, targetSeconds: opts.targetSeconds, fps, segments, estimatedSeconds: +(total / fps).toFixed(2),
    titles: opts.title ? [{ text: opts.title, atSecond: 0, kind: "intro" }] : [],
    musicClipId: opts.musicClipId, look: opts.look, exportPreset: opts.exportPreset, notes,
  };
}

/** Keep ranges (seconds) inside [start,end] after removing silences, with padding. */
export function keepRanges(silences: { start: number; end: number }[], start: number, end: number, padSec = 0.15, minKeepSec = 0.3): { start: number; end: number }[] {
  const s = silences.filter((x) => Number.isFinite(x.end) && x.end > start && x.start < end).sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  let cur = start;
  for (const x of s) {
    const cutStart = Math.max(cur, x.start + padSec);
    const cutEnd = Math.min(end, x.end - padSec);
    if (cutEnd <= cutStart) continue;
    if (cutStart - cur >= minKeepSec) out.push({ start: cur, end: cutStart });
    cur = cutEnd;
  }
  if (end - cur >= minKeepSec) out.push({ start: cur, end });
  return out;
}

export function suggestTransitions(cutTimes: number[], style: string): { atSecond: number; transition: string; frames: number; reason: string }[] {
  return cutTimes.map((t, i) => {
    if (/doc|calm|interview/i.test(style)) return { atSecond: t, transition: "Cross Dissolve", frames: 12, reason: "gentle pacing" };
    if (/social|tiktok|reel|energetic|ad/i.test(style)) return { atSecond: t, transition: i % 4 === 3 ? "Zoom" : "Cut", frames: i % 4 === 3 ? 8 : 0, reason: "fast pacing; occasional zoom punch" };
    if (/cinematic|film/i.test(style)) return { atSecond: t, transition: i === cutTimes.length - 1 ? "Dip To Color Dissolve" : "Cut", frames: i === cutTimes.length - 1 ? 24 : 0, reason: "hard cuts, dip to black at the end" };
    return { atSecond: t, transition: "Cut", frames: 0, reason: "default" };
  });
}

export function suggestLook(stats: Record<string, number> | undefined, genre?: string): { preset: string; reasons: string[] } {
  const reasons: string[] = [];
  if (genre) {
    const g = genre.toLowerCase();
    const map: [RegExp, string][] = [[/night|horror|thriller/, "night_cinematic"], [/action|blockbuster|trailer/, "teal_orange"], [/wedding|travel|warm/, "filmic_warm"], [/retro|vintage|70s|80s/, "vintage_film"], [/noir|b&w|black/, "black_and_white"], [/drama|moody/, "moody_cinematic"], [/commercial|product|ad/, "bright_commercial"], [/doc/, "natural_documentary"], [/war|gritty/, "desaturated_cinematic"]];
    for (const [re, p] of map) if (re.test(g)) { reasons.push(`genre '${genre}'`); return { preset: p, reasons }; }
  }
  if (stats) {
    const yavg = stats.YAVG ?? 128;
    const sat = stats.SATAVG ?? 30;
    if (yavg < 60) { reasons.push(`dark frame (YAVG ${yavg})`); return { preset: "moody_cinematic", reasons }; }
    if (yavg > 170) { reasons.push(`bright frame (YAVG ${yavg})`); return { preset: "natural_documentary", reasons }; }
    if (sat < 15) { reasons.push(`low saturation (${sat})`); return { preset: "bright_commercial", reasons }; }
    reasons.push(`balanced exposure (YAVG ${yavg}), saturation ${sat}`);
  }
  return { preset: "hollywood_cinematic", reasons: reasons.length ? reasons : ["default cinematic look"] };
}
