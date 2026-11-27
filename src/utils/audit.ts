import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { redact } from "./logger.js";

export interface AuditEntry {
  tool: string;
  ok: boolean;
  ms: number;
  destructive: boolean;
  args?: unknown;
  error?: string;
}

/** Operation log: every tool call (with redacted args) is appended to logs/operations-YYYY-MM-DD.jsonl. */
export class AuditLog {
  readonly recent: (AuditEntry & { time: string })[] = [];
  private file?: string;

  constructor(dir?: string) {
    if (dir) {
      try {
        mkdirSync(dir, { recursive: true });
        this.file = join(dir, `operations-${new Date().toISOString().slice(0, 10)}.jsonl`);
      } catch {
        this.file = undefined;
      }
    }
  }

  record(e: AuditEntry): void {
    const entry = { time: new Date().toISOString(), ...e, args: redact(e.args) };
    this.recent.push(entry);
    if (this.recent.length > 200) this.recent.shift();
    if (this.file) {
      try {
        appendFileSync(this.file, JSON.stringify(entry) + "\n");
      } catch {
        /* best effort */
      }
    }
  }
}
