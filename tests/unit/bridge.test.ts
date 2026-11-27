import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PYTHON_DIR } from "../../src/config/constants.js";
import { loadConfig } from "../../src/config/index.js";
import { ResolveBridge } from "../../src/resolve/bridge/bridge.js";
import { BRIDGE_OPS } from "../../src/resolve/bridge/commands.js";
import { MockResolve } from "../../src/resolve/bridge/mock-adapter.js";
import { OperationQueue } from "../../src/resolve/bridge/queue.js";
import { McpToolError } from "../../src/utils/errors.js";
import { setup } from "../helpers.js";

const cfg = loadConfig({ RESOLVE_ADAPTER: "mock", LOG_DIR: "" }, ["node"]);

describe("ResolveBridge", () => {
  it("refuses ops that are not allowlisted (no arbitrary Python)", async () => {
    const mock = new MockResolve();
    const bridge = new ResolveBridge(cfg, mock);
    await expect(bridge.call("eval", { code: "import os" })).rejects.toMatchObject({ code: "UNKNOWN_OP" });
    expect(mock.calls).toHaveLength(0);
  });

  it("serialises ops in order and records history", async () => {
    const mock = new MockResolve();
    mock.delayMs = 5;
    const bridge = new ResolveBridge(cfg, mock);
    await Promise.all([bridge.call("project.create", { name: "A" }), bridge.call("project.create", { name: "B" }), bridge.call("project.list")]);
    expect(mock.calls.map((c) => c.op)).toEqual(["project.create", "project.create", "project.list"]);
    expect(bridge.recent(3).map((r) => r.op)).toEqual(["project.list", "project.create", "project.create"]);
    expect(bridge.status()).toMatchObject({ adapter: "mock", queue: 0 });
  });

  it("records failures with their error code", async () => {
    const mock = new MockResolve();
    mock.on("project.save", () => {
      throw new McpToolError("NO_PROJECT", "none");
    });
    const bridge = new ResolveBridge(cfg, mock);
    await expect(bridge.call("project.save")).rejects.toMatchObject({ code: "NO_PROJECT" });
    expect(bridge.recent(1)[0]).toMatchObject({ op: "project.save", ok: false, error: "NO_PROJECT" });
  });

  it("allowlist matches every @op registered in resolve-scripts", () => {
    const py = new Set<string>();
    for (const f of readdirSync(PYTHON_DIR).filter((n) => n.endsWith(".py"))) {
      for (const m of readFileSync(join(PYTHON_DIR, f), "utf8").matchAll(/^@op\("([^"]+)"\)/gm)) py.add(m[1]!);
    }
    expect([...BRIDGE_OPS].sort()).toEqual([...py].sort());
  });
});

describe("OperationQueue", () => {
  it("rejects when full", async () => {
    const q = new OperationQueue(1);
    const first = q.run(() => new Promise((r) => setTimeout(r, 20)));
    await expect(q.run(async () => 1)).rejects.toMatchObject({ code: "BRIDGE_BUSY" });
    await first;
    expect(q.size).toBe(0);
  });
});

describe("mcp_bridge_status", () => {
  it("reports adapter and recent ops", async () => {
    const t = await setup();
    await t.call("project_create", { name: "X" });
    const r = await t.call("mcp_bridge_status", { limit: 5 });
    expect(r).toMatchObject({ ok: true, data: { adapter: "mock" } });
    expect((r.data as { recent: { op: string }[] }).recent[0]!.op).toBe("project.create");
    await t.close();
  });
});
