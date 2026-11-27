import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";
import { JobManager } from "../../src/jobs/job-manager.js";
import { createAppContext, toolContext } from "../../src/server.js";
import { toCallResult } from "../../src/mcp/tools/common.js";

describe("JobManager", () => {
  it("runs jobs in order and reports results", async () => {
    const jobs = new JobManager<number>();
    const order: number[] = [];
    const a = jobs.start("a", async () => { order.push(1); return 1; });
    const b = jobs.start("b", async () => { order.push(2); return 2; });
    expect((await jobs.wait(b.id, 1000)).result).toBe(2);
    expect(jobs.get(a.id).state).toBe("succeeded");
    expect(order).toEqual([1, 2]);
  });

  it("records failures and cancels only queued jobs", async () => {
    const jobs = new JobManager();
    let release!: () => void;
    const blocker = jobs.start("slow", () => new Promise((r) => { release = () => r("done"); }));
    const queued = jobs.start("later", async () => "x");
    await new Promise((r) => setTimeout(r, 10));
    expect(jobs.cancel(blocker.id).cancelled).toBe(false);
    expect(jobs.cancel(queued.id).cancelled).toBe(true);
    release();
    const bad = jobs.start("bad", async () => { throw new Error("boom"); });
    const r = await jobs.wait(bad.id, 1000);
    expect(r.state).toBe("failed");
    expect(r.error?.message).toBe("boom");
  });
});

describe("mock adapter + background tools", () => {
  const app = createAppContext(loadConfig({ RESOLVE_ADAPTER: "mock", LOG_DIR: "test-output/logs" }, []));
  const ctx = toolContext(app);

  it("answers through the mock and tags source", async () => {
    expect(app.bridge.source).toBe("mock");
    const created = await app.registry.invoke("project_create", { name: "MockProj" }, ctx);
    expect((created.data as { name: string }).name).toBe("MockProj");
    const res = await toCallResult("project_create", async () => created, app.bridge.source);
    expect((res.structuredContent as { source: string }).source).toBe("mock");
    expect(app.bridge.mock?.calls.some((c) => c.op === "project.create")).toBe(true);
  });

  it("background: true returns a jobId collected by wait_for_job", async () => {
    expect(app.registry.tools.get("render_start")?.inputSchema.shape).toHaveProperty("background");
    const started = await app.registry.invoke("render_start", { background: true }, ctx);
    const { jobId } = started.data as { jobId: string };
    expect(jobId).toBeTruthy();
    const done = await app.registry.invoke("wait_for_job", { jobId, timeoutSeconds: 5 }, ctx);
    expect((done.data as { job: { state: string } }).job.state).toBe("succeeded");
  });
});
