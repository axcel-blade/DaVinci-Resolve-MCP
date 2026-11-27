import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import type { AppConfig } from "../config/index.js";
import { McpToolError } from "./errors.js";

/**
 * Optional external AI provider adapter (OpenAI-compatible HTTP API).
 * Disabled unless AI_PROVIDER=openai and AI_API_KEY are set. Keys are read
 * from the environment only and never logged or returned.
 */
export class AiProvider {
  constructor(private cfg: AppConfig["ai"]) {}

  get configured(): boolean {
    return this.cfg.provider !== "none" && Boolean(this.cfg.apiKey);
  }

  private require(): void {
    if (!this.configured) {
      throw new McpToolError("PROVIDER_NOT_CONFIGURED", "No external AI provider is configured.", undefined,
        "Set AI_PROVIDER=openai and AI_API_KEY (and optionally AI_BASE_URL for a compatible server) in .env, or use Resolve's built-in features (subtitle_generate, media transcription).");
    }
  }

  async transcribe(path: string, language?: string): Promise<{ text: string; segments: { start: number; end: number; text: string }[] }> {
    this.require();
    const form = new FormData();
    form.append("file", new Blob([readFileSync(path)]), basename(path));
    form.append("model", this.cfg.transcriptionModel);
    form.append("response_format", "verbose_json");
    if (language) form.append("language", language);
    const res = await fetch(`${this.cfg.baseUrl}/audio/transcriptions`, { method: "POST", headers: { authorization: `Bearer ${this.cfg.apiKey}` }, body: form });
    if (!res.ok) throw new McpToolError("PROVIDER_ERROR", `Transcription failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const j = (await res.json()) as { text: string; segments?: { start: number; end: number; text: string }[] };
    return { text: j.text, segments: (j.segments ?? []).map((s) => ({ start: s.start, end: s.end, text: s.text.trim() })) };
  }

  async speech(text: string, outPath: string, voice?: string): Promise<{ path: string; bytes: number }> {
    this.require();
    const res = await fetch(`${this.cfg.baseUrl}/audio/speech`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: this.cfg.ttsModel, voice: voice ?? this.cfg.ttsVoice, input: text, response_format: "wav" }),
    });
    if (!res.ok) throw new McpToolError("PROVIDER_ERROR", `Speech generation failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(outPath, buf);
    return { path: outPath, bytes: buf.length };
  }
}

export function segmentsToSrt(segments: { start: number; end: number; text: string }[]): string {
  const t = (s: number) => {
    const ms = Math.max(0, Math.round(s * 1000));
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000), r = ms % 1000;
    const p = (x: number, n = 2) => String(x).padStart(n, "0");
    return `${p(h)}:${p(m)}:${p(sec)},${p(r, 3)}`;
  };
  return segments.map((s, i) => `${i + 1}\n${t(s.start)} --> ${t(s.end)}\n${s.text}\n`).join("\n");
}
