import { AsyncLocalStorage } from "node:async_hooks";
import type { AppConfig } from "../../config/index.js";
import { McpToolError, toToolError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { ALLOWED_OPS } from "./commands.js";
import { detectInstall, isResolveRunning, launchResolve, type InstallInfo } from "./detect.js";
import { MockResolve } from "./mock-adapter.js";
import { PythonBridge } from "./python-adapter.js";
import { OperationQueue } from "./queue.js";
import type { AdapterName, BridgeAdapter, BridgeStatus, OperationRecord } from "./types.js";

/** Minimum timeout applied to every bridge call made inside withTimeoutScope (used by background jobs). */
const timeoutScope = new AsyncLocalStorage<number>();

/** Pick the adapter from config: the Python scripting worker for real Resolve, or the in-memory mock. */
export function createAdapter(cfg: AppConfig): BridgeAdapter {
  if (cfg.resolve.adapter === "mock") return new MockResolve();
  return new PythonBridge({
    pythonPath: cfg.resolve.pythonPath,
    timeoutMs: cfg.resolve.timeoutMs,
    env: { RESOLVE_SCRIPT_API: cfg.resolve.scriptApi, RESOLVE_SCRIPT_LIB: cfg.resolve.scriptLib },
  });
}

/**
 * The single gateway to DaVinci Resolve. Validates the op against the allowlist, serialises calls,
 * enforces timeouts, keeps an operation history and turns failures into typed errors.
 * Success is only reported when the Python side itself returned ok.
 */
export class ResolveBridge {
  readonly adapter: BridgeAdapter;
  private readonly queue = new OperationQueue();
  private readonly history: OperationRecord[] = [];
  private runningOp?: { op: string; since: string };
  private install?: InstallInfo;
  private launching?: Promise<void>;

  constructor(
    private cfg: AppConfig,
    adapter: BridgeAdapter = createAdapter(cfg),
  ) {
    this.adapter = adapter;
  }

  get adapterName(): AdapterName {
    return this.adapter.name;
  }

  /** Where results come from: "resolve" (real application) or "mock". */
  get source(): "resolve" | "mock" {
    return this.adapter.name === "mock" ? "mock" : "resolve";
  }

  /** The in-memory adapter when RESOLVE_ADAPTER=mock (tests use it to inspect or script calls). */
  get mock(): MockResolve | undefined {
    return this.adapter instanceof MockResolve ? this.adapter : undefined;
  }

  /** The Python worker when talking to a real Resolve. */
  get python(): PythonBridge | undefined {
    return this.adapter instanceof PythonBridge ? this.adapter : undefined;
  }

  async installInfo(refresh = false): Promise<InstallInfo> {
    if (this.mock) return this.mock.installInfo();
    if (!this.install || refresh) {
      this.install = await detectInstall(this.cfg.resolve);
      // Point the Python side at the detected library when the user did not configure one.
      if (this.install.fusionscript && !this.cfg.resolve.scriptLib) this.python?.setEnv("RESOLVE_SCRIPT_LIB", this.install.fusionscript);
    }
    return this.install;
  }

  /** Run `fn` so that every bridge call it makes waits at least `minTimeoutMs` for Resolve. */
  withTimeoutScope<T>(minTimeoutMs: number, fn: () => Promise<T>): Promise<T> {
    return timeoutScope.run(minTimeoutMs, fn);
  }

  status(): BridgeStatus {
    return { adapter: this.adapter.name, queue: this.queue.size, running: this.runningOp };
  }

  /** Most recent bridge operations, newest first. */
  recent(limit = 25): OperationRecord[] {
    return this.history.slice(-limit).reverse();
  }

  async call<T = unknown>(op: string, params: object = {}, timeoutMs?: number): Promise<T> {
    if (!ALLOWED_OPS.has(op)) throw new McpToolError("UNKNOWN_OP", `Bridge operation is not allowlisted: ${op}`);
    const scoped = timeoutScope.getStore();
    const effective = scoped !== undefined ? Math.max(timeoutMs ?? this.cfg.resolve.timeoutMs, scoped) : timeoutMs;
    if (!this.mock) await this.installInfo();
    return this.queue.run(async () => {
      const started = Date.now();
      this.runningOp = { op, since: new Date().toISOString() };
      let ok = false;
      let error: string | undefined;
      try {
        const out = await this.callAdapter<T>(op, params, effective);
        ok = true;
        logger.debug("bridge ok", { op, ms: Date.now() - started, adapter: this.adapter.name });
        return out;
      } catch (e) {
        error = toToolError(e).code;
        throw e;
      } finally {
        this.runningOp = undefined;
        this.history.push({ op, ok, durationMs: Date.now() - started, at: new Date().toISOString(), error });
        if (this.history.length > 200) this.history.shift();
      }
    });
  }

  private async callAdapter<T>(op: string, params: object, timeoutMs?: number): Promise<T> {
    try {
      return await this.adapter.call<T>(op, params, timeoutMs);
    } catch (e) {
      if (e instanceof McpToolError && e.code === "RESOLVE_NOT_RUNNING" && this.cfg.resolve.autoLaunch && this.python) {
        await this.ensureRunning();
        return this.adapter.call<T>(op, params, timeoutMs);
      }
      throw e;
    }
  }

  /** Launch Resolve (if allowed) and wait until the scripting API answers. */
  async ensureRunning(waitMs = 180000): Promise<void> {
    const python = this.python;
    if (!python) return;
    if (!this.launching) {
      this.launching = (async () => {
        if (!(await isResolveRunning())) await launchResolve(this.cfg.resolve);
        const deadline = Date.now() + waitMs;
        while (Date.now() < deadline) {
          try {
            const s = await python.call<{ connected: boolean }>("app.status", {}, 15000);
            if (s.connected) return;
          } catch {
            /* still starting */
          }
          await new Promise((r) => setTimeout(r, 3000));
        }
        throw new McpToolError("RESOLVE_NOT_RUNNING", `DaVinci Resolve did not accept scripting connections within ${Math.round(waitMs / 1000)} s.`);
      })().finally(() => {
        this.launching = undefined;
      });
    }
    return this.launching;
  }

  /** Operations queued or in flight (used for graceful shutdown). */
  get pending(): number {
    return Math.max(this.queue.size, this.adapter.pending);
  }

  stop(): Promise<void> {
    return this.adapter.stop();
  }
}
