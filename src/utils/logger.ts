import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";
const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let minLevel: LogLevel = "info";
let logFile: string | undefined;

/** Structured JSON logging to stderr (+ optional file). stdout is reserved for the stdio MCP transport. */
export function configureLogger(opts: { level?: string; dir?: string }): void {
  if (opts.level && opts.level in ORDER) minLevel = opts.level as LogLevel;
  if (opts.dir) {
    try {
      mkdirSync(opts.dir, { recursive: true });
      logFile = join(opts.dir, `mcp-${new Date().toISOString().slice(0, 10)}.log`);
    } catch {
      logFile = undefined;
    }
  }
}

const SECRET_KEYS = /token|secret|password|api[_-]?key|authorization/i;

export function redact(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(redact);
  if (data && typeof data === "object") {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEYS.test(k) ? "[redacted]" : redact(v)]),
    );
  }
  return data;
}

function write(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
  if (ORDER[level] < ORDER[minLevel]) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...(data ? (redact(data) as object) : {}) });
  process.stderr.write(line + "\n");
  if (logFile) {
    try {
      appendFileSync(logFile, line + "\n");
    } catch {
      /* best effort */
    }
  }
}

export const logger = {
  debug: (m: string, d?: Record<string, unknown>) => write("debug", m, d),
  info: (m: string, d?: Record<string, unknown>) => write("info", m, d),
  warn: (m: string, d?: Record<string, unknown>) => write("warn", m, d),
  error: (m: string, d?: Record<string, unknown>) => write("error", m, d),
};
