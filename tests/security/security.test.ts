import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { PathPolicy } from "../../src/utils/paths.js";
import { createAppContext, toolContext } from "../../src/server.js";
import { authorize } from "../../src/transport/http.js";

const cfg = loadConfig({ RESOLVE_ADAPTER: "mock", LOG_DIR: "test-output/logs", ALLOWED_WRITE_PATHS: join(tmpdir(), "rmcp-sec") }, []);

describe("security", () => {
  it("path sandbox rejects writes outside allowed roots, relative paths, NUL bytes and device paths", () => {
    const p = new PathPolicy(cfg.paths);
    expect(() => p.write("C:\\Windows\\evil.mp4")).toThrow(/not allowed/);
    expect(() => p.write(join(tmpdir(), "rmcp-sec", "..", "..", "escape.mp4"))).toThrow(/not allowed/);
    expect(() => p.write("relative/out.mp4")).toThrow(/absolute/);
    expect(() => p.read("C:\\a\0b")).toThrow(/NUL/);
    expect(() => p.read("\\\\?\\C:\\x")).toThrow(/Device/);
  });

  it("tool schemas reject unknown keys and destructive tools need confirm", async () => {
    const app = createAppContext(cfg);
    const ctx = toolContext(app);
    await expect(app.registry.invoke("project_list", { script: "import os" }, ctx)).rejects.toThrow(/Invalid arguments/);
    await expect(app.registry.invoke("resolve_close", {}, ctx)).rejects.toThrow(/destructive/);
  });

  it("no tool accepts free-form code", () => {
    const app = createAppContext(cfg);
    for (const t of app.registry.tools.values()) {
      for (const key of Object.keys(t.inputSchema.shape)) expect(key).not.toMatch(/^(code|script|command|eval|python|lua)$/i);
    }
  });

  it("HTTP refuses non-loopback binds without a token and checks bearer tokens", () => {
    expect(() => loadConfig({ MCP_TRANSPORT: "http", MCP_HTTP_HOST: "0.0.0.0" }, [])).toThrow(/MCP_AUTH_TOKEN/);
    const http = { host: "0.0.0.0", port: 1, authToken: "a".repeat(32) };
    expect(authorize({ headers: {}, url: "/mcp" }, http).ok).toBe(false);
    expect(authorize({ headers: { authorization: "Bearer wrong" }, url: "/mcp" }, http).ok).toBe(false);
    expect(authorize({ headers: { authorization: `Bearer ${"a".repeat(32)}` }, url: "/mcp" }, http).ok).toBe(true);
  });
});
