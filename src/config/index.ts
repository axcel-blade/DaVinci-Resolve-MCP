import { existsSync, readFileSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { PROJECT_ROOT } from "./constants.js";

export interface AppConfig {
  transport: "stdio" | "http";
  http: { host: string; port: number; authToken?: string; secretPath?: string };
  resolve: {
    /** python = real Resolve via the scripting bridge; mock = in-memory stand-in for tests/CI. */
    adapter: "python" | "mock";
    pythonPath: string;
    installDir?: string;
    scriptApi?: string;
    scriptLib?: string;
    timeoutMs: number;
    renderTimeoutMs: number;
    autoLaunch: boolean;
  };
  paths: {
    outputDir: string;
    backupDir: string;
    lutDir: string;
    allowedWritePaths: string[];
    allowedReadPaths: string[]; // empty = any local absolute path
  };
  safety: { backupBeforeDestructive: boolean; requireConfirmation: boolean };
  ai: {
    provider: "none" | "openai";
    baseUrl: string;
    apiKey?: string;
    transcriptionModel: string;
    ttsModel: string;
    ttsVoice: string;
  };
  ffmpegPath: string;
  ffprobePath: string;
  /** Expose only these tool categories (MCP_TOOL_CATEGORIES=application,projects,...). Empty = all. */
  toolCategories: string[];
  logLevel: string;
  logDir: string;
}

/** Minimal .env loader (KEY=VALUE lines). Values already in process.env win (e.g. from the MCP client's env block). */
export function loadDotEnv(file = join(PROJECT_ROOT, ".env")): string | undefined {
  if (!existsSync(file)) return undefined;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
  return file;
}

function bool(v: string | undefined, d: boolean): boolean {
  if (v === undefined || v === "") return d;
  return /^(1|true|yes|on)$/i.test(v);
}

function int(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
}

function list(v: string | undefined): string[] {
  return (v ?? "").split(";").map((s) => s.trim()).filter(Boolean).map((p) => resolve(p));
}

function abs(p: string): string {
  return isAbsolute(p) ? p : resolve(PROJECT_ROOT, p);
}

export function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv): AppConfig {
  const transportArg = argv.indexOf("--transport");
  const transport = (transportArg >= 0 ? argv[transportArg + 1] : env.MCP_TRANSPORT) === "http" ? "http" : "stdio";
  const outputDir = abs(env.OUTPUT_DIR || "output");
  const backupDir = abs(env.BACKUP_DIR || join("output", "backups"));
  const lutDir = abs(env.LUT_DIR || join("output", "luts"));
  const videos = join(homedir(), "Videos");
  const allowedWritePaths = [
    outputDir, backupDir, lutDir,
    ...(env.ALLOWED_WRITE_PATHS ? list(env.ALLOWED_WRITE_PATHS) : [videos, join(homedir(), "Documents"), join(homedir(), "Desktop"), tmpdir()]),
  ];
  const cfg: AppConfig = {
    transport,
    http: {
      host: env.MCP_HTTP_HOST || "127.0.0.1",
      port: int(env.MCP_HTTP_PORT, 3334),
      authToken: env.MCP_AUTH_TOKEN || undefined,
      secretPath: env.MCP_SECRET_PATH || undefined,
    },
    resolve: {
      adapter: env.RESOLVE_ADAPTER === "mock" ? "mock" : "python",
      pythonPath: env.RESOLVE_PYTHON || (platform() === "win32" ? "python" : "python3"),
      installDir: env.RESOLVE_INSTALL_DIR || undefined,
      scriptApi: env.RESOLVE_SCRIPT_API || undefined,
      scriptLib: env.RESOLVE_SCRIPT_LIB || undefined,
      timeoutMs: int(env.RESOLVE_TIMEOUT_MS, 60000),
      renderTimeoutMs: int(env.RESOLVE_RENDER_TIMEOUT_MS, 4 * 60 * 60 * 1000),
      autoLaunch: bool(env.RESOLVE_AUTO_LAUNCH, false),
    },
    paths: { outputDir, backupDir, lutDir, allowedWritePaths, allowedReadPaths: list(env.ALLOWED_READ_PATHS) },
    safety: {
      backupBeforeDestructive: bool(env.BACKUP_BEFORE_DESTRUCTIVE, true),
      requireConfirmation: bool(env.REQUIRE_CONFIRMATION, true),
    },
    ai: {
      provider: env.AI_PROVIDER === "openai" ? "openai" : "none",
      baseUrl: env.AI_BASE_URL || "https://api.openai.com/v1",
      apiKey: env.AI_API_KEY || undefined,
      transcriptionModel: env.AI_TRANSCRIPTION_MODEL || "whisper-1",
      ttsModel: env.AI_TTS_MODEL || "tts-1",
      ttsVoice: env.AI_TTS_VOICE || "alloy",
    },
    ffmpegPath: env.FFMPEG_PATH || "ffmpeg",
    ffprobePath: env.FFPROBE_PATH || "ffprobe",
    toolCategories: (env.MCP_TOOL_CATEGORIES ?? "").split(",").map((x) => x.trim()).filter(Boolean),
    logLevel: env.LOG_LEVEL || "info",
    logDir: abs(env.LOG_DIR || "logs"),
  };
  if (cfg.transport === "http" && !isLoopback(cfg.http.host) && !cfg.http.authToken && !cfg.http.secretPath) {
    throw new Error("MCP_HTTP_HOST is not a loopback address: set MCP_AUTH_TOKEN (or MCP_SECRET_PATH) before exposing the server.");
  }
  return cfg;
}
