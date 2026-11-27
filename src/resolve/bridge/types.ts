import type { InstallInfo } from "./detect.js";

export type AdapterName = "python" | "mock";

/**
 * Isolates the automation mechanism. Production: the long-lived Python worker that talks to
 * Resolve's official scripting API. The mock adapter exists for automated tests and never
 * claims to be a real DaVinci Resolve.
 */
export interface BridgeAdapter {
  readonly name: AdapterName;
  call<T = unknown>(op: string, params: object, timeoutMs?: number): Promise<T>;
  /** Calls the adapter itself still holds (in flight inside Resolve). */
  readonly pending: number;
  stop(): Promise<void>;
}

/** Install information is resolved by the bridge (mock answers it in memory). */
export type { InstallInfo };

export interface OperationRecord {
  op: string;
  ok: boolean;
  durationMs: number;
  at: string;
  error?: string;
}

export interface BridgeStatus {
  adapter: AdapterName;
  /** Operations waiting in, or running from, the serial queue. */
  queue: number;
  running?: { op: string; since: string };
}
