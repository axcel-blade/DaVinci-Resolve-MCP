/**
 * End-to-end LIVE workflow: new project -> import sample footage -> timeline -> clips -> title ->
 * background audio -> basic grade -> render MP4 -> verify. Uses a dedicated test project.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { createAppContext, toolContext, type AppContext } from "../../src/server.js";
import { toCallResult } from "../../src/mcp/tools/common.js";

const OUT = join(process.cwd(), "output", "live-test", "e2e");
let app: AppContext;
let live = false;
let reason = "";

async function tool(name: string, args: Record<string, unknown> = {}) {
  const r = await toCallResult(name, () => app.registry.invoke(name, args, toolContext(app)));
  return r.structuredContent as { ok: boolean; status: string; message: string; data: any };
}

beforeAll(async () => {
  app = createAppContext(loadConfig({ ...process.env, LOG_DIR: "logs" }, ["node"]));
  const s = await tool("resolve_get_status");
  live = Boolean(s.data?.connected);
  reason = s.message;
  if (!live) return;
  mkdirSync(OUT, { recursive: true });
  try {
    const ff = (args: string[]) => execFileSync(process.env.FFMPEG_PATH || "ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
    ff(["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=24:duration=8", "-f", "lavfi", "-i", "sine=frequency=500:duration=8", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", join(OUT, "interview_a.mp4")]);
    ff(["-f", "lavfi", "-i", "mandelbrot=size=1920x1080:rate=24", "-t", "8", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(OUT, "broll_drone.mp4")]);
    ff(["-f", "lavfi", "-i", "sine=frequency=330:duration=20", join(OUT, "music.wav")]);
  } catch (e) {
    live = false;
    reason = `FFmpeg needed for sample media: ${(e as Error).message}`;
  }
}, 120000);

afterAll(async () => app?.bridge.stop());

describe("E2E YouTube workflow (live)", () => {
  it("builds and renders a verified MP4", async (t) => {
    if (!live) return t.skip(reason);
    const r = await tool("workflow_create_youtube_video", {
      projectName: `MCP_E2E_${Date.now()}`,
      footage: [join(OUT, "interview_a.mp4"), join(OUT, "broll_drone.mp4")],
      musicFile: join(OUT, "music.wav"),
      title: "E2E Test",
      targetSeconds: 10,
      look: "filmic_warm",
      render: true,
      outputDir: OUT,
    });
    writeFileSync(join(OUT, "e2e-report.json"), JSON.stringify(r.data, null, 2));
    expect(r.data.stepsFailed.filter((f: { required: boolean }) => f.required)).toEqual([]);
    expect(r.data.success).toBe(true);
    const file = r.data.filesCreated[0];
    expect(file && existsSync(file)).toBe(true);
    const out = r.data.render.output;
    expect(out.ok).toBe(true);
    expect(out.probe.video.width).toBe(1920);
    expect(out.probe.durationSec).toBeGreaterThan(8);
  }, 900000);
});
