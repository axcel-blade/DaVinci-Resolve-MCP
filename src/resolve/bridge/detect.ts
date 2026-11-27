import { execFile, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { platform } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { AppConfig } from "../../config/index.js";
import { WINDOWS_INSTALL_CANDIDATES } from "../../config/constants.js";
import { McpToolError } from "../../utils/errors.js";

const exec = promisify(execFile);

export interface InstallInfo {
  installed: boolean;
  installDir?: string;
  executable?: string;
  fusionscript?: string;
  fuscript?: string;
  scriptApi: string;
  scriptApiExists: boolean;
  readme?: string;
  fileVersion?: string;
  studio?: boolean;
  source: string;
}

function defaultScriptApi(): string {
  if (platform() === "win32") {
    return join(process.env.PROGRAMDATA ?? "C:\\ProgramData", "Blackmagic Design", "DaVinci Resolve", "Support", "Developer", "Scripting");
  }
  if (platform() === "darwin") return "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting";
  return "/opt/resolve/Developer/Scripting";
}

async function registryInstallDirs(): Promise<string[]> {
  if (platform() !== "win32") return [];
  const out: string[] = [];
  for (const key of [
    "HKLM\\SOFTWARE\\Blackmagic Design\\DaVinci Resolve",
    "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  ]) {
    try {
      const { stdout } = await exec("reg", ["query", key, "/s", "/f", "DaVinci Resolve", "/d"], { windowsHide: true, timeout: 8000, maxBuffer: 8 * 1024 * 1024 });
      for (const m of stdout.matchAll(/InstallLocation\s+REG_SZ\s+(.+)/gi)) out.push(m[1]!.trim());
      for (const m of stdout.matchAll(/InstallDir\s+REG_SZ\s+(.+)/gi)) out.push(m[1]!.trim());
    } catch {
      /* key missing */
    }
  }
  return out;
}

async function fileVersion(exe: string): Promise<string | undefined> {
  if (platform() !== "win32") return undefined;
  try {
    const { stdout } = await exec("powershell", ["-NoProfile", "-Command", `(Get-Item -LiteralPath '${exe.replace(/'/g, "''")}').VersionInfo.ProductVersion`], { windowsHide: true, timeout: 10000 });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Detect a DaVinci Resolve installation without assuming a fixed directory. */
export async function detectInstall(cfg: AppConfig["resolve"]): Promise<InstallInfo> {
  const scriptApi = cfg.scriptApi ?? defaultScriptApi();
  const candidates: { dir: string; source: string }[] = [];
  if (cfg.installDir) candidates.push({ dir: cfg.installDir, source: "RESOLVE_INSTALL_DIR" });
  if (cfg.scriptLib) candidates.push({ dir: join(cfg.scriptLib, ".."), source: "RESOLVE_SCRIPT_LIB" });
  for (const d of await registryInstallDirs()) candidates.push({ dir: d, source: "registry" });
  if (platform() === "win32") for (const d of WINDOWS_INSTALL_CANDIDATES) candidates.push({ dir: d, source: "default path" });
  if (platform() === "darwin") candidates.push({ dir: "/Applications/DaVinci Resolve/DaVinci Resolve.app", source: "default path" });
  if (platform() === "linux") candidates.push({ dir: "/opt/resolve", source: "default path" });

  const readme = ["README.md", "README.txt"].map((f) => join(scriptApi, f)).find((f) => existsSync(f));
  for (const { dir, source } of candidates) {
    const exe = platform() === "win32" ? join(dir, "Resolve.exe") : platform() === "darwin" ? join(dir, "Contents", "MacOS", "Resolve") : join(dir, "bin", "resolve");
    if (!existsSync(exe)) continue;
    const lib = cfg.scriptLib ?? (platform() === "win32" ? join(dir, "fusionscript.dll") : platform() === "darwin" ? join(dir, "Contents", "Libraries", "Fusion", "fusionscript.so") : join(dir, "libs", "Fusion", "fusionscript.so"));
    const fuscript = platform() === "win32" ? join(dir, "fuscript.exe") : join(dir, "fuscript");
    const version = await fileVersion(exe);
    return {
      installed: true, installDir: dir, executable: exe,
      fusionscript: existsSync(lib) ? lib : undefined,
      fuscript: existsSync(fuscript) ? fuscript : undefined,
      scriptApi, scriptApiExists: existsSync(scriptApi), readme,
      fileVersion: version,
      studio: readme ? /studio/i.test(readFileSync(readme, "utf8").slice(0, 400)) || undefined : undefined,
      source,
    };
  }
  return { installed: false, scriptApi, scriptApiExists: existsSync(scriptApi), readme, source: "not found" };
}

export async function isResolveRunning(): Promise<boolean> {
  try {
    if (platform() === "win32") {
      const { stdout } = await exec("tasklist", ["/FI", "IMAGENAME eq Resolve.exe", "/NH"], { windowsHide: true, timeout: 8000 });
      return /Resolve\.exe/i.test(stdout);
    }
    const { stdout } = await exec("pgrep", ["-x", "Resolve"], { timeout: 5000 });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function launchResolve(cfg: AppConfig["resolve"]): Promise<{ launched: boolean; executable: string; alreadyRunning: boolean }> {
  if (await isResolveRunning()) return { launched: false, executable: "", alreadyRunning: true };
  const info = await detectInstall(cfg);
  if (!info.installed || !info.executable) {
    throw new McpToolError("RESOLVE_NOT_INSTALLED", "DaVinci Resolve was not found. Set RESOLVE_INSTALL_DIR if it is installed in a custom location.");
  }
  const child = spawn(info.executable, [], { detached: true, stdio: "ignore", windowsHide: false, cwd: info.installDir });
  child.unref();
  return { launched: true, executable: info.executable, alreadyRunning: false };
}

/** List installed LUT folders (handy for color tools). */
export function lutFolders(): string[] {
  const base = platform() === "win32" ? join(process.env.PROGRAMDATA ?? "C:\\ProgramData", "Blackmagic Design", "DaVinci Resolve", "Support", "LUT") : "/Library/Application Support/Blackmagic Design/DaVinci Resolve/LUT";
  if (!existsSync(base)) return [];
  return [base, ...readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(base, d.name))];
}
