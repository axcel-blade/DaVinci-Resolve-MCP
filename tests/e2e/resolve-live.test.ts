/**
 * LIVE tests against the installed, running DaVinci Resolve.
 *   pnpm test:live          (Resolve must be running with external scripting = Local)
 * Uses a dedicated temporary project "MCP_LIVE_TEST_<timestamp>" and generated test media
 * (FFmpeg required for media generation). The user's projects are never opened or modified;
 * the test project is deleted at the end only if RESOLVE_LIVE_CLEANUP=1.
 * Tests are skipped (not passed) when Resolve is unavailable; unsupported features are reported as skipped.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { createAppContext, toolContext, type AppContext } from "../../src/server.js";
import { toCallResult } from "../../src/mcp/tools/registry.js";

const OUT = join(process.cwd(), "output", "live-test");
const report: { test: string; result: "passed" | "failed" | "skipped" | "unsupported"; note?: string }[] = [];
let app: AppContext;
let live = false;
let reason = "";
const project = `MCP_LIVE_TEST_${Date.now()}`;
const media: Record<string, string> = {};

async function tool(name: string, args: Record<string, unknown> = {}) {
  const r = await toCallResult(name, () => app.registry.invoke(name, args, toolContext(app)));
  return r.structuredContent as { ok: boolean; status: string; message: string; data: any; error?: { code: string; message: string } };
}

function step(name: string, fn: () => Promise<"unsupported" | void>, timeout = 300000) {
  it(name, async (t) => {
    if (!live) {
      report.push({ test: name, result: "skipped", note: reason });
      return t.skip();
    }
    let r: "unsupported" | void;
    try {
      r = await fn();
    } catch (e) {
      report.push({ test: name, result: "failed", note: (e as Error).message });
      throw e;
    }
    if (r === "unsupported") {
      // Reported as skipped, never as passed.
      report.push({ test: name, result: "unsupported" });
      return t.skip();
    }
    report.push({ test: name, result: "passed" });
  }, timeout);
}

function ffmpeg(args: string[]) {
  execFileSync(process.env.FFMPEG_PATH || "ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
}

beforeAll(async () => {
  app = createAppContext(loadConfig({ ...process.env, LOG_DIR: "logs" }, ["node"]));
  const s = await tool("resolve_get_status");
  live = Boolean(s.data?.connected);
  reason = live ? "" : s.message;
  if (!live) return;
  mkdirSync(OUT, { recursive: true });
  try {
    media.video = join(OUT, "test_video.mp4");
    media.video2 = join(OUT, "test_video2.mp4");
    media.audio = join(OUT, "test_music.wav");
    media.image = join(OUT, "test_image.png");
    ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=24:duration=6", "-f", "lavfi", "-i", "sine=frequency=440:duration=6", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", media.video]);
    ffmpeg(["-f", "lavfi", "-i", "smptebars=size=1920x1080:rate=24:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", media.video2]);
    ffmpeg(["-f", "lavfi", "-i", "sine=frequency=220:duration=10", media.audio]);
    ffmpeg(["-f", "lavfi", "-i", "color=c=orange:size=1920x1080", "-frames:v", "1", media.image]);
  } catch (e) {
    live = false;
    reason = `FFmpeg is required to generate live test media: ${(e as Error).message}`;
  }
}, 120000);

afterAll(async () => {
  if (live && process.env.RESOLVE_LIVE_CLEANUP === "1") {
    await tool("project_close", { save: false }).catch(() => undefined);
    await tool("project_delete", { name: project, confirm: true }).catch(() => undefined);
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "live-report.json"), JSON.stringify({ when: new Date().toISOString(), project, report }, null, 2));
  await app?.bridge.stop();
});

describe("DaVinci Resolve live", () => {
  step("1 detect Resolve", async () => { const r = await tool("resolve_get_status"); expect(r.data.install.installed).toBe(true); });
  step("2 connect to Resolve", async () => { const r = await tool("resolve_check_scripting_connection"); expect(r.ok).toBe(true); });
  step("3 read version", async () => { const r = await tool("resolve_get_version"); expect(r.ok).toBe(true); expect(r.data.versionString).toMatch(/\d+/); });
  step("4 create a project", async () => { const r = await tool("project_create", { name: project, width: 1920, height: 1080, frameRate: "24" }); expect(r.data.name).toBe(project); });
  step("5 save project", async () => { expect((await tool("project_save")).ok).toBe(true); });
  step("6 import video", async () => { const r = await tool("media_import_video", { paths: [media.video, media.video2], bin: "Footage" }); expect(r.data.imported).toBe(2); });
  step("7 import audio", async () => { const r = await tool("media_import_audio", { paths: [media.audio], bin: "Music" }); expect(r.data.imported).toBe(1); });
  step("8 import image", async () => { const r = await tool("media_import_image", { paths: [media.image], bin: "Stills" }); expect(r.data.imported).toBe(1); });
  step("9 create timeline", async () => { const r = await tool("timeline_create", { name: "Live Test" }); expect(r.ok).toBe(true); });
  step("10 add video clips", async () => {
    const r = await tool("clip_append", { clips: [{ clip: media.video }, { clip: media.video2 }] });
    expect(r.data.placed.length).toBeGreaterThanOrEqual(2);
    const clips = await tool("timeline_get_clips", { trackType: "video" });
    expect(clips.data.count).toBe(2);
  });
  step("11 edit clip properties", async () => {
    const r = await tool("clip_set_transform", { trackIndex: 1, itemIndex: 1, zoomX: 1.1, zoomY: 1.1, rotation: 2 });
    expect(r.data.results.ZoomX.ok).toBe(true);
  });
  step("12 create a title (overlay, no ripple)", async () => {
    const info = await tool("timeline_get_info");
    const before = (await tool("timeline_get_clips", { trackType: "video" })).data.count;
    const r = await tool("title_create", { text: "MCP Live Test", frame: info.data.startFrame, animation: { type: "fade", frames: 12 } });
    expect(r.ok || r.status === "partial").toBe(true);
    expect((await tool("timeline_get_clips", { trackType: "video" })).data.count).toBe(before);
    const nodes = await tool("fusion_get_nodes", { trackIndex: 1, itemIndex: 1 });
    expect(nodes.data.map((n: { type: string }) => n.type)).toContain("TextPlus");
  });
  step("13 apply an available transition", async () => {
    // Full-length clips have no handles; trim both sides of the edit to create them, then close the gap.
    const items = (await tool("timeline_get_clips", { trackType: "video", trackIndex: 1 })).data.items.filter((i: { type: string }) => i.type === "video");
    const a = items[items.length - 2], b = items[items.length - 1];
    await tool("clip_trim", { itemId: a.id, trimEnd: 12 });
    await tool("clip_trim", { itemId: b.id, trimStart: 12 });
    await tool("timeline_delete_gaps", { confirm: true });
    const r = await tool("transition_add", { itemId: a.id, type: "Cross Dissolve", position: "end", duration: 12 });
    if (r.status === "unsupported") return "unsupported";
    expect(r.ok).toBe(true);
    const l = await tool("transition_list", { onTimeline: true });
    expect(l.data.placed.length).toBeGreaterThan(0);
  });
  step("14 color adjustment", async () => {
    const r = await tool("color_set_cdl", { trackIndex: 1, itemIndex: 1, slope: [1.05, 1, 0.95], saturation: 1.1 });
    expect(r.ok).toBe(true);
    const look = await tool("color_apply_look", { trackIndex: 1, itemIndex: 2, preset: "teal_orange", nodeIndex: 1 });
    expect(look.ok).toBe(true);
    const versions = await tool("color_versions", { trackIndex: 1, itemIndex: 2 });
    expect(versions.data.local.some((v: string) => v.startsWith("MCP "))).toBe(true);
  });
  step("15 basic Fusion composition", async () => {
    const c = await tool("fusion_get_composition", { trackIndex: 1, itemIndex: 1, create: true });
    expect(c.ok).toBe(true);
    const n = await tool("fusion_create_node", { trackIndex: 1, itemIndex: 1, type: "Blur", name: "LiveBlur", inputs: { XBlurSize: 2 }, insertIntoChain: true });
    expect(n.ok).toBe(true);
    const nodes = await tool("fusion_get_nodes", { trackIndex: 1, itemIndex: 1 });
    expect(nodes.data.map((x: { name: string }) => x.name)).toContain("LiveBlur");
  });
  step("15b export EDL and back up project", async () => {
    const edl = await tool("timeline_export_edl", { path: join(OUT, `live-${Date.now()}.edl`) });
    expect(edl.ok).toBe(true);
    const bak = await tool("project_backup");
    expect(existsSync(bak.data.path)).toBe(true);
  });
  step("16 configure audio", async () => {
    const t = await tool("audio_add_track", { format: "stereo", name: "Music" });
    expect(t.ok).toBe(true);
    const p = await tool("audio_place_clip", { clip: media.audio, trackIndex: t.data.trackIndex });
    expect(p.ok).toBe(true);
  });
  step("17 configure a render", async () => {
    const r = await tool("render_add_job", { preset: "youtube_1080p", outputDir: OUT, fileName: `live-${Date.now()}` });
    expect(r.data.jobId).toBeTruthy();
    await tool("render_remove_job", { jobId: r.data.jobId, confirm: true });
  });
  step("18+19 render a test video and verify the output", async () => {
    const r = await tool("render_export_timeline", { preset: "youtube_1080p", outputDir: OUT, fileName: `live-render-${Date.now()}` });
    expect(r.data.output.ok).toBe(true);
    expect(existsSync(r.data.output.path)).toBe(true);
    expect(r.data.output.bytes).toBeGreaterThan(10000);
  }, 900000);
});
