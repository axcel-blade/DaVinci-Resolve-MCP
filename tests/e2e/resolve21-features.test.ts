/**
 * LIVE tests for the Resolve 20/21 scripting additions (native trim/move/speed, ResolveFX, transitions,
 * audio properties/normalization/analysis, Photo Album API). Runs in its own temporary project.
 * Features missing from the installed version are recorded as "unsupported" (skipped), never as passed.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { createAppContext, toolContext, type AppContext } from "../../src/server.js";
import { toCallResult } from "../../src/mcp/tools/common.js";

const OUT = join(process.cwd(), "output", "live-test", "v21");
const report: { test: string; result: string; note?: string }[] = [];
let app: AppContext;
let live = false;
let reason = "";

async function tool(name: string, args: Record<string, unknown> = {}) {
  const r = await toCallResult(name, () => app.registry.invoke(name, args, toolContext(app)));
  return r.structuredContent as { ok: boolean; status: string; message: string; data: any; error?: { code: string } };
}

function step(name: string, fn: () => Promise<"unsupported" | void>, timeout = 300000) {
  it(name, async (t) => {
    if (!live) { report.push({ test: name, result: "skipped", note: reason }); return t.skip(); }
    let r: "unsupported" | void;
    try { r = await fn(); } catch (e) { report.push({ test: name, result: "failed", note: (e as Error).message }); throw e; }
    if (r === "unsupported") { report.push({ test: name, result: "unsupported" }); return t.skip(); }
    report.push({ test: name, result: "passed" });
  }, timeout);
}

const unsupportedOr = (r: { status: string }) => (r.status === "unsupported" ? "unsupported" : undefined);

beforeAll(async () => {
  app = createAppContext(loadConfig({ ...process.env, LOG_DIR: "logs" }, ["node"]));
  const s = await tool("resolve_get_status");
  live = Boolean(s.data?.connected);
  reason = s.message;
  if (!live) return;
  mkdirSync(OUT, { recursive: true });
  const ff = (args: string[]) => execFileSync(process.env.FFMPEG_PATH || "ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
  try {
    ff(["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=24:duration=6", "-f", "lavfi", "-i", "sine=frequency=440:duration=6", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", join(OUT, "a.mp4")]);
    ff(["-f", "lavfi", "-i", "testsrc=size=1920x1080:rate=24:duration=6", "-f", "lavfi", "-i", "sine=frequency=660:duration=6", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", join(OUT, "b.mp4")]);
    ff(["-f", "lavfi", "-i", "color=c=teal:size=1600x1200", "-frames:v", "1", join(OUT, "photo1.jpg")]);
    ff(["-f", "lavfi", "-i", "color=c=orange:size=1200x1600", "-frames:v", "1", join(OUT, "photo2.jpg")]);
  } catch (e) {
    live = false;
    reason = `FFmpeg needed: ${(e as Error).message}`;
    return;
  }
  await tool("project_create", { name: `MCP_V21_TEST_${Date.now()}`, width: 1920, height: 1080, frameRate: "24" });
  await tool("media_import", { paths: [join(OUT, "a.mp4"), join(OUT, "b.mp4")], bin: "Footage" });
  await tool("timeline_create", { name: "V21" });
  // place middle 3 s of each clip so both have handles for trims/transitions
  await tool("clip_append", { clips: [{ clip: join(OUT, "a.mp4"), sourceStart: 24, sourceEnd: 96 }, { clip: join(OUT, "b.mp4"), sourceStart: 24, sourceEnd: 96 }] });
}, 180000);

afterAll(async () => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "v21-report.json"), JSON.stringify({ when: new Date().toISOString(), report }, null, 2));
  await app?.bridge.stop();
});

describe("Resolve 21 native features (live)", () => {
  step("effect list + apply ResolveFX", async () => {
    const l = await tool("effect_list", { query: "blur" });
    if (l.status === "unsupported" || l.error?.code === "UNSUPPORTED") return "unsupported";
    expect(l.data.count).toBeGreaterThan(0);
    const r = await tool("effect_apply", { trackIndex: 1, itemIndex: 1, effect: "blur" });
    expect(r.ok).toBe(true);
    const applied = await tool("effect_list_applied", { trackIndex: 1, itemIndex: 1 });
    expect(JSON.stringify(applied.data.native)).toMatch(/Gaussian Blur/);
    expect((await tool("effect_remove", { trackIndex: 1, itemIndex: 1, effect: "Gaussian Blur" })).ok).toBe(true);
  });
  step("native trim (no re-placement)", async () => {
    const before = (await tool("clip_get_properties", { trackIndex: 1, itemIndex: 1 })).data.item;
    const r = await tool("clip_trim", { trackIndex: 1, itemIndex: 1, trimEnd: 6 });
    if (r.status === "confirmation_required") return "unsupported";
    expect(r.ok).toBe(true);
    expect(r.data.after.id).toBe(before.id); // same item, not re-placed
    expect(r.data.after.duration).toBe(before.duration - 6);
  });
  step("native move", async () => {
    const items = (await tool("timeline_get_clips", { trackType: "video", trackIndex: 1 })).data.items;
    const last = items[items.length - 1];
    const r = await tool("clip_move", { itemId: last.id, recordFrame: last.start + 12 });
    if (r.status === "confirmation_required") return "unsupported";
    expect(r.ok).toBe(true);
    expect(r.data.after.start).toBe(last.start + 12);
  });
  step("native clip speed", async () => {
    const items = (await tool("timeline_get_clips", { trackType: "video", trackIndex: 1 })).data.items;
    const r = await tool("clip_set_speed", { itemId: items[0].id, speed: 0.5 });
    if (unsupportedOr(r) || r.error?.code === "UNSUPPORTED") return "unsupported";
    expect(r.ok).toBe(true);
    expect(r.data.speed.Percentage).toBe(50);
  });
  step("transition between clips", async () => {
    const items = (await tool("timeline_get_clips", { trackType: "video", trackIndex: 1 })).data.items.filter((i: { type: string }) => i.type !== "transition");
    await tool("timeline_delete_gaps", { confirm: true });
    const r = await tool("transition_add", { itemId: items[0].id, type: "Cross Dissolve", position: "end", duration: 12 });
    if (r.error?.code === "UNSUPPORTED") return "unsupported";
    expect(r.ok).toBe(true);
  });
  step("audio volume / pan properties", async () => {
    const r = await tool("audio_set_volume", { trackIndex: 1, itemIndex: 1, volumeDb: -6 });
    if (r.status === "unsupported") return "unsupported";
    expect(r.ok).toBe(true);
    expect(r.data.results.AudioVolume.actual).toBe(-6);
    expect((await tool("audio_set_pan", { trackIndex: 1, itemIndex: 1, pan: -20 })).ok).toBe(true);
  });
  step("audio loudness analysis (Resolve)", async () => {
    const r = await tool("audio_analyze", { trackIndex: 1, itemIndex: 1 });
    if (r.error?.code === "UNSUPPORTED") return "unsupported";
    expect(r.ok).toBe(true);
    expect(r.data.levels.Integrated).toBeLessThan(0);
  });
  step("audio normalization (YouTube)", async () => {
    const r = await tool("audio_master", { mode: "YouTube" });
    if (r.error?.code === "UNSUPPORTED") return "unsupported";
    expect(r.ok).toBe(true);
  });
  step("dialogue cleanup (voice isolation + leveler)", async () => {
    const r = await tool("audio_dialogue_cleanup", { trackIndex: 1, itemIndex: 1, amount: 50 });
    if (r.status === "unsupported") return "unsupported";
    expect(["ok", "partial"]).toContain(r.status);
  });
  step("paste attributes", async () => {
    await tool("clip_set_transform", { trackIndex: 1, itemIndex: 1, zoomX: 1.2, zoomY: 1.2 });
    const items = (await tool("timeline_get_clips", { trackType: "video", trackIndex: 1 })).data.items.filter((i: { type: string }) => i.type === "video");
    const r = await tool("clip_paste_attributes", { source: { itemId: items[0].id }, targets: [{ itemId: items[1].id }] });
    if (r.error?.code === "UNSUPPORTED") return "unsupported";
    expect(r.ok).toBe(true);
    const p = await tool("clip_get_properties", { itemId: items[1].id });
    expect(p.data.properties.ZoomX).toBeCloseTo(1.2);
  });
  step("photo album import, crop, grade, export", async () => {
    const chk = await tool("photo_check_support");
    if (chk.status === "unsupported") return "unsupported";
    const imp = await tool("photo_import", { paths: [join(OUT, "photo1.jpg"), join(OUT, "photo2.jpg")], album: "MCP Test Album" });
    expect(imp.ok).toBe(true);
    const list = await tool("photo_list", { album: "MCP Test Album" });
    expect(list.data.photos.length).toBe(2);
    expect((await tool("photo_crop", { album: "MCP Test Album", photo: 1, left: 50, right: 50 })).ok).toBe(true);
    expect((await tool("photo_set_rating", { album: "MCP Test Album", photo: 1, rating: 4 })).ok).toBe(true);
    const g = await tool("photo_apply_grade", { album: "MCP Test Album", photo: 2, preset: "vintage_film" });
    expect(g.ok).toBe(true);
    const ex = await tool("photo_export", { album: "MCP Test Album", outputDir: join(OUT, "photos", String(Date.now())), format: "jpg", maxDimension: 800 });
    expect(ex.ok).toBe(true);
    for (const f of ex.data.files) expect(existsSync(f.path)).toBe(true);
  });
});
