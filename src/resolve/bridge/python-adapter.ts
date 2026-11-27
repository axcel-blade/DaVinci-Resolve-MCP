import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { PYTHON_DIR } from "../../config/constants.js";
import { McpToolError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
  op: string;
}

export interface PythonBridgeOptions {
  pythonPath: string;
  env?: Record<string, string | undefined>;
  timeoutMs: number;
  script?: string;
}

/**
 * Manages the long-lived resolve-scripts/resolve_worker.py process (JSON lines over stdio).
 * Calls are serialized: the Resolve scripting API is not safe for concurrent use.
 * A timed-out call kills the worker; the next call starts a fresh one.
 */
export class PythonBridge {
  private proc?: ChildProcessWithoutNullStreams;
  private ready?: Promise<{ python: string; ops: number }>;
  private pending = new Map<string, Pending>();
  private seq = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private stderrTail: string[] = [];
  public info?: { python: string; ops: number };

  constructor(private opts: PythonBridgeOptions) {}

  /** Set an environment variable for the next worker start. */
  setEnv(key: string, value: string | undefined): void {
    this.opts.env = { ...this.opts.env, [key]: value };
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  private start(): Promise<{ python: string; ops: number }> {
    if (this.ready) return this.ready;
    const script = this.opts.script ?? join(PYTHON_DIR, "resolve_worker.py");
    this.ready = new Promise((resolveReady, rejectReady) => {
      let proc: ChildProcessWithoutNullStreams;
      try {
        proc = spawn(this.opts.pythonPath, ["-u", script], {
          env: { ...process.env, ...this.opts.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
          windowsHide: true,
        });
      } catch (e) {
        this.ready = undefined;
        rejectReady(new McpToolError("PYTHON_NOT_FOUND", `Could not start Python (${this.opts.pythonPath}): ${(e as Error).message}`));
        return;
      }
      this.proc = proc;
      let gotReady = false;
      proc.on("error", (e) => {
        if (this.proc !== proc && gotReady) return;
        this.ready = undefined;
        this.proc = undefined;
        const err = new McpToolError("PYTHON_NOT_FOUND", `Could not start Python (${this.opts.pythonPath}): ${e.message}`);
        if (!gotReady) rejectReady(err);
        this.failAll(err);
      });
      proc.on("exit", (code, signal) => {
        logger.warn("python worker exited", { code, signal, stderr: this.stderrTail.slice(-10).join("\n") });
        if (gotReady && this.proc !== proc) return; // an already-replaced (timed-out) worker
        this.ready = undefined;
        this.proc = undefined;
        const err = new McpToolError("BRIDGE_CRASHED", `Python bridge exited (code ${code ?? signal}). ${this.stderrTail.slice(-3).join(" ")}`.trim());
        if (!gotReady) rejectReady(err);
        this.failAll(err);
      });
      proc.stderr.setEncoding("utf8");
      proc.stderr.on("data", (d: string) => {
        for (const l of d.split(/\r?\n/).filter(Boolean)) {
          this.stderrTail.push(l);
          if (this.stderrTail.length > 50) this.stderrTail.shift();
          logger.debug("python stderr", { line: l });
        }
      });
      const rl = createInterface({ input: proc.stdout });
      rl.on("line", (line) => {
        let msg: { id: string | null; ok: boolean; result?: unknown; error?: { code: string; message: string; details?: unknown } };
        try {
          msg = JSON.parse(line);
        } catch {
          logger.warn("python worker non-JSON output", { line });
          return;
        }
        if (msg.id === null && !gotReady && msg.ok) {
          gotReady = true;
          this.info = msg.result as { python: string; ops: number };
          resolveReady(this.info);
          return;
        }
        const p = msg.id ? this.pending.get(msg.id) : undefined;
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(msg.id!);
        if (msg.ok) p.resolve(msg.result);
        else p.reject(new McpToolError(msg.error?.code ?? "BRIDGE_EXCEPTION", msg.error?.message ?? "Unknown bridge error", msg.error?.details));
      });
    });
    return this.ready;
  }

  private failAll(err: Error): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
      this.pending.delete(id);
    }
  }

  /** Run one bridge operation. Serialized; rejects with McpToolError. */
  call<T = unknown>(op: string, params: object = {}, timeoutMs = this.opts.timeoutMs): Promise<T> {
    const run = async (): Promise<T> => {
      await this.start();
      const proc = this.proc;
      if (!proc) throw new McpToolError("BRIDGE_CRASHED", "Python bridge is not running.");
      const id = String(++this.seq);
      return new Promise<T>((res, rej) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          logger.error("bridge timeout; restarting worker", { op, timeoutMs });
          // Detach first so the next call starts a fresh worker immediately.
          if (this.proc === proc) {
            this.proc = undefined;
            this.ready = undefined;
          }
          proc.kill();
          rej(new McpToolError("TIMEOUT", `Resolve operation '${op}' did not finish within ${timeoutMs} ms.`));
        }, timeoutMs);
        this.pending.set(id, { resolve: res as (v: unknown) => void, reject: rej, timer, op });
        proc.stdin.write(JSON.stringify({ id, op, params }) + "\n");
      });
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  async stop(): Promise<void> {
    this.proc?.stdin.end();
    this.proc?.kill();
    this.proc = undefined;
    this.ready = undefined;
  }
}
