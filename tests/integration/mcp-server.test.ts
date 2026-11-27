import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PythonBridge } from "../../src/resolve/bridge/python-adapter.js";
import { loadConfig } from "../../src/config/index.js";
import { createAppContext, createServer, type AppContext } from "../../src/server.js";

type Payload = { ok: boolean; status: string; message: string; data?: Record<string, unknown>; error?: { code: string } };

let client: Client;
let app: AppContext;

beforeAll(async () => {
  app = createAppContext(loadConfig({ LOG_DIR: "", RESOLVE_TIMEOUT_MS: "20000" }, ["node"]));
  const server = createServer(app);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(b);
}, 30000);

afterAll(async () => {
  await client?.close();
  await app?.bridge.stop();
});

async function call(name: string, args: Record<string, unknown> = {}): Promise<Payload> {
  const r = await client.callTool({ name, arguments: args });
  return r.structuredContent as Payload;
}

describe("MCP server", () => {
  it("advertises tools with input and output schemas", async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(250);
    const status = tools.find((t) => t.name === "resolve_get_status")!;
    expect(status.outputSchema).toBeDefined();
    const del = tools.find((t) => t.name === "project_delete")!;
    expect(del.annotations?.destructiveHint).toBe(true);
    expect(Object.keys((del.inputSchema as { properties: object }).properties)).toContain("confirm");
  });

  it("lists resources and prompts", async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toEqual(expect.arrayContaining(["resolve://status", "resolve://render/queue", "resolve://capabilities"]));
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(expect.arrayContaining(["create_cinematic_video", "export_professional_master", "clean_dialogue_audio"]));
    const p = await client.getPrompt({ name: "apply_cinematic_grading", arguments: { look: "teal_orange" } });
    expect(JSON.stringify(p.messages)).toContain("teal_orange");
  });

  it("resolve_get_status works without crashing whether or not Resolve is present", async () => {
    const r = await call("resolve_get_status");
    expect(r.ok).toBe(true);
    expect(r.data).toHaveProperty("install");
    expect(typeof r.message).toBe("string");
  }, 60000);

  it("a Resolve operation without Resolve returns a real error, never fake success", async () => {
    const install = await app.bridge.installInfo();
    const r = await call("project_list");
    if (!install.installed) {
      expect(r.ok).toBe(false);
      expect(["RESOLVE_NOT_INSTALLED", "SCRIPTING_UNAVAILABLE", "RESOLVE_NOT_RUNNING"]).toContain(r.error?.code);
    } else {
      expect(typeof r.ok).toBe("boolean");
    }
  }, 60000);

  it("rejects invalid input with VALIDATION_ERROR", async () => {
    // The SDK validates against the advertised schema before our handler runs.
    const r = await client.callTool({ name: "timeline_add_track", arguments: { trackType: "hologram" } });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toMatch(/validation|invalid/i);
  });

  it("requires confirmation for destructive tools", async () => {
    const r = await call("timeline_delete", { name: "Main" });
    expect(r.status).toBe("confirmation_required");
    expect(r.error?.code).toBe("CONFIRMATION_REQUIRED");
  });

  it("blocks writes outside allowed folders", async () => {
    const r = await call("timeline_export_edl", { path: "C:\\Windows\\out.edl" });
    expect(r.error?.code).toBe("PATH_NOT_ALLOWED");
  });

  it("workflow dry run lists steps without touching Resolve", async () => {
    const r = await call("workflow_create_social_content", { platform: "tiktok", dryRun: true, footageFolder: tmpdir() });
    expect(r.ok).toBe(true);
    const skipped = (r.data as { stepsSkipped: { id: string }[] }).stepsSkipped.map((s) => s.id);
    expect(skipped).toEqual(expect.arrayContaining(["status", "socialCut", "render"]));
  });

  it("server-side planners and presets work offline", async () => {
    const presets = await call("render_list_presets");
    expect(Object.keys(presets.data!)).toEqual(expect.arrayContaining(["youtube_1080p", "youtube_4k", "tiktok", "instagram_reels", "instagram_stories", "instagram_feed", "facebook", "professional_master", "archive", "custom"]));
    const looks = await call("color_list_presets");
    expect(Object.keys(looks.data!)).toHaveLength(10);
  });
});

describe("Python bridge", () => {
  it("reports unknown ops and recovers after a worker timeout", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bridge-"));
    const script = join(dir, "slow_worker.py");
    writeFileSync(script, [
      "import sys, json, time",
      "print(json.dumps({'id': None, 'ok': True, 'result': {'ready': True, 'python': '3', 'ops': 1}}), flush=True)",
      "for line in sys.stdin:",
      "    req = json.loads(line)",
      "    if req['op'] == 'sleep': time.sleep(5)",
      "    elif req['op'] == 'echo': print(json.dumps({'id': req['id'], 'ok': True, 'result': req['params']}), flush=True)",
      "    else: print(json.dumps({'id': req['id'], 'ok': False, 'error': {'code': 'UNKNOWN_OP', 'message': 'x'}}), flush=True)",
    ].join("\n"));
    const b = new PythonBridge({ pythonPath: process.env.RESOLVE_PYTHON || "python", timeoutMs: 1000, script });
    expect(await b.call("echo", { a: 1 })).toEqual({ a: 1 });
    await expect(b.call("nope")).rejects.toMatchObject({ code: "UNKNOWN_OP" });
    await expect(b.call("sleep")).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(await b.call("echo", { again: true })).toEqual({ again: true });
    await b.stop();
  }, 30000);

  it("reports a missing Python executable clearly", async () => {
    const b = new PythonBridge({ pythonPath: "definitely-not-python-xyz", timeoutMs: 2000 });
    await expect(b.call("app.status")).rejects.toMatchObject({ code: "PYTHON_NOT_FOUND" });
  });
});
