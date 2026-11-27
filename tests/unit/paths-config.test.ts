import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { PathPolicy } from "../../src/utils/paths.js";

describe("config", () => {
  it("has safe defaults", () => {
    const c = loadConfig({}, ["node", "x"]);
    expect(c.transport).toBe("stdio");
    expect(c.http.host).toBe("127.0.0.1");
    expect(c.safety.requireConfirmation).toBe(true);
    expect(c.safety.backupBeforeDestructive).toBe(true);
    expect(c.ai.provider).toBe("none");
    expect(c.resolve.timeoutMs).toBe(60000);
  });
  it("reads env and argv", () => {
    const c = loadConfig({ MCP_HTTP_PORT: "4000", RESOLVE_TIMEOUT_MS: "5000", AI_PROVIDER: "openai", AI_API_KEY: "k", MCP_TOOL_CATEGORIES: "media, color" }, ["node", "x", "--transport", "http"]);
    expect(c.transport).toBe("http");
    expect(c.http.port).toBe(4000);
    expect(c.resolve.timeoutMs).toBe(5000);
    expect(c.ai.provider).toBe("openai");
    expect(c.toolCategories).toEqual(["media", "color"]);
  });
  it("refuses a public HTTP bind without auth", () => {
    expect(() => loadConfig({ MCP_TRANSPORT: "http", MCP_HTTP_HOST: "0.0.0.0" }, ["node"])).toThrow(/MCP_AUTH_TOKEN/);
    expect(() => loadConfig({ MCP_TRANSPORT: "http", MCP_HTTP_HOST: "0.0.0.0", MCP_AUTH_TOKEN: "x" }, ["node"])).not.toThrow();
  });
});

describe("PathPolicy", () => {
  const root = mkdtempSync(join(tmpdir(), "rmcp-"));
  const policy = new PathPolicy({ outputDir: root, backupDir: root, lutDir: root, allowedWritePaths: [root], allowedReadPaths: [] });

  it("requires absolute paths and blocks device namespaces / NUL", () => {
    expect(() => policy.normalize("relative/file.mp4")).toThrow(/absolute/);
    expect(() => policy.normalize("\\\\?\\C:\\x")).toThrow(/Device/);
    expect(() => policy.normalize("C:\\a\0b")).toThrow(/NUL/);
  });
  it("allows writes only under allowed roots", () => {
    expect(policy.write(join(root, "out.mp4"))).toBe(join(root, "out.mp4"));
    expect(() => policy.write(join(root, "..", "escape.mp4"))).toThrow(/not allowed/);
    expect(() => policy.write("C:\\Windows\\System32\\evil.dll")).toThrow(/not allowed/);
  });
  it("never overwrites without overwrite: true", () => {
    const f = join(root, "exists.txt");
    writeFileSync(f, "x");
    expect(() => policy.write(f)).toThrow(/already exists/);
    expect(policy.write(f, { overwrite: true })).toBe(f);
  });
  it("checks existence on read", () => {
    expect(() => policy.read(join(root, "missing.mov"))).toThrow(/does not exist/);
    expect(() => policy.read(root, { kind: "file" })).toThrow(/not a file/);
  });
  it("restricts reads when ALLOWED_READ_PATHS is set", () => {
    const p = new PathPolicy({ outputDir: root, backupDir: root, lutDir: root, allowedWritePaths: [root], allowedReadPaths: [root] });
    expect(() => p.read("C:\\Windows\\win.ini", { mustExist: false })).toThrow(/outside/);
  });
});
