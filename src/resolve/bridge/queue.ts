import { McpToolError } from "../../utils/errors.js";

/**
 * Serial operation queue. DaVinci Resolve's scripting API is not safe for concurrent use
 * (two calls can interleave project/timeline state), so every bridge call runs strictly one at a time,
 * whichever adapter is active and however many MCP sessions are connected.
 */
export class OperationQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;

  constructor(private readonly maxPending = 100) {}

  get size(): number {
    return this.pending;
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    if (this.pending >= this.maxPending) {
      return Promise.reject(new McpToolError("BRIDGE_BUSY", `Operation queue is full (${this.maxPending} pending).`));
    }
    this.pending++;
    const result = this.tail.then(task, task);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result.finally(() => {
      this.pending--;
    });
  }
}
