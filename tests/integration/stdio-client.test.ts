import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import { PROJECT_ROOT } from "../../src/config/constants.js";

/** Starts the real server as a child process over stdio, exactly like Claude Desktop does. */
describe("stdio MCP client compatibility", () => {
  it("initializes, lists tools and calls one over stdio", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(PROJECT_ROOT, "node_modules", "tsx", "dist", "cli.mjs"), join(PROJECT_ROOT, "src", "index.ts")],
      env: { ...process.env, LOG_LEVEL: "error", LOG_DIR: "" } as Record<string, string>,
      stderr: "pipe",
    });
    const client = new Client({ name: "stdio-test", version: "1.0.0" });
    await client.connect(transport);
    try {
      expect(client.getServerVersion()?.name).toBe("davinci-resolve-mcp");
      expect(client.getInstructions()).toMatch(/resolve_get_status/);
      const { tools } = await client.listTools();
      expect(tools.length).toBeGreaterThan(250);
      const r = await client.callTool({ name: "color_list_presets", arguments: {} });
      expect((r.structuredContent as { ok: boolean }).ok).toBe(true);
      const bad = await client.callTool({ name: "project_delete", arguments: { name: "X" } });
      expect(bad.isError).toBe(true);
    } finally {
      await client.close();
    }
  }, 60000);
});
