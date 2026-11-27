import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadConfig } from "../src/config/index.js";
import { ResolveBridge } from "../src/resolve/bridge/bridge.js";
import { MockResolve } from "../src/resolve/bridge/mock-adapter.js";
import { createAppContext, createServer } from "../src/server.js";

export function sandbox(): string {
  return mkdtempSync(join(tmpdir(), "rmcp-test-"));
}

/** An MCP client connected in-memory to a server running on the mock adapter. */
export async function setup(env: Record<string, string> = {}) {
  const dir = sandbox();
  const config = loadConfig({ RESOLVE_ADAPTER: "mock", OUTPUT_DIR: dir, LOG_DIR: "", LOG_LEVEL: "error", ...env }, ["node", "x"]);
  const mock = new MockResolve();
  const app = createAppContext(config, new ResolveBridge(config, mock));
  const server = createServer(app);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(b);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    return { ...(r.structuredContent as { ok: boolean; status: string; data?: unknown; error?: { code: string } }), isError: Boolean(r.isError) };
  };
  return { dir, config, mock, app, server, client, call, close: async () => { await client.close(); await server.close(); } };
}
