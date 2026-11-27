import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadConfig } from "../../src/config/index.js";
import { createAppContext, toolContext } from "../../src/server.js";
import { buildEditPlan, keepRanges, scoreClips, suggestLook } from "../../src/design-engine/planner/planner.js";
import { ToolRegistry, toCallResult } from "../../src/mcp/tools/common.js";
import { McpToolError } from "../../src/utils/errors.js";

const app = createAppContext(loadConfig({ LOG_DIR: "" }, ["node"]));
const ctx = toolContext(app);

describe("tool registry", () => {
  it("registers every module with unique, well-formed names", () => {
    const names = [...app.registry.tools.keys()];
    expect(names.length).toBeGreaterThan(250);
    for (const n of names) expect(n).toMatch(/^[a-z][a-z0-9_]{2,63}$/);
    for (const required of ["resolve_get_status", "project_create", "media_import", "timeline_create", "clip_append", "effect_apply", "speed_set", "title_create", "subtitle_generate", "fusion_create_node", "color_apply_look", "audio_analyze", "ai_create_rough_cut", "photo_export", "render_export_timeline", "workflow_create_youtube_video", "workflow_create_cinematic_video"]) {
      expect(app.registry.tools.has(required), required).toBe(true);
    }
  });
  it("every tool has a description and a strict object schema", () => {
    for (const t of app.registry.tools.values()) {
      expect(t.description.length, t.name).toBeGreaterThan(15);
      expect(t.inputSchema.safeParse({ __unknown: 1 }).success, t.name).toBe(false);
    }
  });
  it("destructive tools require confirm", async () => {
    const destructive = [...app.registry.tools.values()].filter((t) => t.destructive);
    expect(destructive.map((t) => t.name)).toEqual(expect.arrayContaining(["project_delete", "media_delete", "timeline_delete", "clip_delete", "render_cancel"]));
    await expect(app.registry.invoke("project_delete", { name: "Anything" }, ctx)).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
  });
  it("validates input before touching Resolve", async () => {
    await expect(app.registry.invoke("project_create", { name: "bad/name" }, ctx)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(app.registry.invoke("timeline_set_start_timecode", { timecode: "1:00" }, ctx)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(app.registry.invoke("media_import", { paths: ["relative.mp4"] }, ctx)).rejects.toMatchObject({ code: "INVALID_PATH" });
  });
  it("unsupported tools report honestly", async () => {
    const r = await toCallResult("color_create_node", () => app.registry.invoke("color_create_node", {}, ctx));
    expect(r.isError).toBe(true);
    expect((r.structuredContent as { status: string }).status).toBe("unsupported");
    expect((r.structuredContent as { ok: boolean }).ok).toBe(false);
  });
  it("toCallResult never reports ok for partial results", async () => {
    const r = await toCallResult("x", async () => ({ status: "partial", data: {} }));
    expect((r.structuredContent as { ok: boolean }).ok).toBe(false);
    const ok = await toCallResult("x", async () => ({ data: 1 }));
    expect((ok.structuredContent as { ok: boolean }).ok).toBe(true);
  });
  it("rejects duplicate tool names", () => {
    const r = new ToolRegistry();
    r.define({ name: "dup_tool", category: "t", description: "a test tool here", input: { a: z.string() }, handler: async () => ({}) });
    expect(() => r.define({ name: "dup_tool", category: "t", description: "a test tool here", input: {}, handler: async () => ({}) })).toThrow();
  });
  it("maps node errors to tool error codes", async () => {
    const r = await toCallResult("x", async () => { throw Object.assign(new Error("nope"), { code: "ENOSPC" }); });
    expect((r.structuredContent as { error: { code: string } }).error.code).toBe("INSUFFICIENT_STORAGE");
    const e = new McpToolError("NO_PROJECT", "none");
    const r2 = await toCallResult("x", async () => { throw e; });
    expect((r2.structuredContent as { error: { hint?: string } }).error.hint).toMatch(/project_open/);
  });
});

describe("planner", () => {
  const clip = (id: string, name: string, frames: number, res = "1920x1080", md: Record<string, string> = {}) => ({ id, name, properties: { Type: "Video + Audio", Frames: String(frames), FPS: "24", Resolution: res }, metadata: md });
  it("scores good takes above junk", () => {
    const s = scoreClips([clip("a", "test_slate", 400), clip("b", "hero_product", 400, "3840x2160", { "Good Take": "1" }), clip("c", "tiny", 10)]);
    expect(s[0]!.id).toBe("b");
    expect(s.at(-1)!.score).toBeLessThan(s[0]!.score);
  });
  it("builds a plan that fills the target with integer frame ranges", () => {
    const scored = scoreClips([clip("a", "wide", 2400), clip("b", "close", 2400), clip("c", "drone", 2400)]);
    const plan = buildEditPlan("test", scored, { targetSeconds: 30, fps: 24, shotSeconds: 4 });
    expect(plan.estimatedSeconds).toBe(30);
    for (const s of plan.segments) {
      expect(Number.isInteger(s.sourceStart) && Number.isInteger(s.sourceEnd)).toBe(true);
      expect(s.sourceEnd).toBeGreaterThan(s.sourceStart);
      expect(s.sourceEnd).toBeLessThanOrEqual(2400);
    }
  });
  it("reports when there is not enough material", () => {
    const plan = buildEditPlan("x", [], { targetSeconds: 10, fps: 24 });
    expect(plan.segments).toHaveLength(0);
    expect(plan.notes.join(" ")).toMatch(/No usable/);
  });
  it("computes keep ranges around silences", () => {
    const k = keepRanges([{ start: 2, end: 4 }, { start: 6, end: 6.2 }, { start: 9, end: 12 }], 0, 10, 0.1);
    expect(k[0]).toEqual({ start: 0, end: 2.1 });
    expect(k[1]!.start).toBeCloseTo(3.9);
    expect(k.at(-1)!.end).toBeCloseTo(9.1);
  });
  it("suggests looks from genre and stats", () => {
    expect(suggestLook(undefined, "horror trailer").preset).toBe("night_cinematic");
    expect(suggestLook({ YAVG: 40 }).preset).toBe("moody_cinematic");
  });
});
