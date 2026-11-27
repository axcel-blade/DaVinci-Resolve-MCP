import type { AppConfig } from "../../config/index.js";
import { McpToolError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { detectInstall, isResolveRunning, launchResolve, type InstallInfo } from "./detect.js";
import { MockResolve } from "./mock-adapter.js";
import { PythonBridge } from "./python-adapter.js";

/**
 * High-level gateway to DaVinci Resolve. Every Resolve operation goes through call(),
 * which runs a registered Python operation against the real scripting API.
 */
export class ResolveBridge {
  readonly python: PythonBridge;
  private install?: InstallInfo;
  private launching?: Promise<void>;
  /** Set when RESOLVE_ADAPTER=mock: every call is answered in memory and tagged source: "mock". */
  readonly mock?: MockResolve;

  constructor(private cfg: AppConfig) {
    this.python = new PythonBridge({
      pythonPath: cfg.resolve.pythonPath,
      timeoutMs: cfg.resolve.timeoutMs,
      env: {
        RESOLVE_SCRIPT_API: cfg.resolve.scriptApi,
        RESOLVE_SCRIPT_LIB: cfg.resolve.scriptLib,
      },
    });
    if (cfg.resolve.adapter === "mock") this.mock = new MockResolve();
  }

  /** Where results come from: "resolve" (real application) or "mock". */
  get source(): "resolve" | "mock" {
    return this.mock ? "mock" : "resolve";
  }

  async installInfo(refresh = false): Promise<InstallInfo> {
    if (this.mock) return this.mock.installInfo();
    if (!this.install || refresh) {
      this.install = await detectInstall(this.cfg.resolve);
      // Point the Python side at the detected library when the user did not configure one.
      if (this.install.fusionscript && !this.cfg.resolve.scriptLib) {
        this.python.setEnv("RESOLVE_SCRIPT_LIB", this.install.fusionscript);
      }
    }
    return this.install;
  }

  async call<T = unknown>(op: string, params: object = {}, timeoutMs?: number): Promise<T> {
    if (this.mock) return this.mock.call<T>(op, params);
    await this.installInfo();
    const started = Date.now();
    try {
      const out = await this.python.call<T>(op, params, timeoutMs);
      logger.debug("bridge ok", { op, ms: Date.now() - started });
      return out;
    } catch (e) {
      if (e instanceof McpToolError && e.code === "RESOLVE_NOT_RUNNING" && this.cfg.resolve.autoLaunch) {
        await this.ensureRunning();
        return this.python.call<T>(op, params, timeoutMs);
      }
      throw e;
    }
  }

  /** Launch Resolve (if allowed) and wait until the scripting API answers. */
  async ensureRunning(waitMs = 180000): Promise<void> {
    if (this.mock) return;
    if (!this.launching) {
      this.launching = (async () => {
        if (!(await isResolveRunning())) await launchResolve(this.cfg.resolve);
        const deadline = Date.now() + waitMs;
        while (Date.now() < deadline) {
          try {
            const s = await this.python.call<{ connected: boolean }>("app.status", {}, 15000);
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

  get pending(): number {
    if (this.mock) return 0;
    return this.python.pendingCount;
  }

  stop(): Promise<void> {
    return this.python.stop();
  }
}
