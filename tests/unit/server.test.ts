import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { createAppContext, createServer } from "../../src/server.js";

async function connect() {
  const app = createAppContext(loadConfig({ RESOLVE_ADAPTER: "mock", LOG_DIR: "test-output/logs" }, []));
  const server = createServer(app);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return { app, client };
}

describe("MCP server (mock adapter)", () => {
  it("lists tools with annotations and job tools", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(300);
    const names = tools.map((t) => t.name);
    for (const n of ["resolve_get_status", "project_create", "render_start", "get_job", "wait_for_job", "list_jobs", "cancel_job"]) expect(names).toContain(n);
    expect(tools.find((t) => t.name === "resolve_close")?.annotations?.destructiveHint).toBe(true);
    await client.close();
  });

  it("returns the result envelope with source", async () => {
    const { client } = await connect();
    const r = await client.callTool({ name: "project_create", arguments: { name: "EnvelopeTest" } });
    const body = r.structuredContent as { ok: boolean; source: string; tool: string };
    expect(body).toMatchObject({ ok: true, source: "mock", tool: "project_create" });
    const planner = await client.callTool({ name: "list_jobs", arguments: {} });
    expect((planner.structuredContent as { source: string }).source).toBe("server");
    await client.close();
  });

  it("lists resources and prompts", async () => {
    const { client } = await connect();
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain("resolve://status");
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain("create_youtube_video");
    await client.close();
  });

  it("refuses destructive calls without confirm", async () => {
    const { client } = await connect();
    const r = await client.callTool({ name: "resolve_close", arguments: {} });
    expect((r.structuredContent as { status: string }).status).toBe("confirmation_required");
    await client.close();
  });
});
