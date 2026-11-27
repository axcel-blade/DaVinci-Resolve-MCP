import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SERVER_NAME = "davinci-resolve-mcp";
export const SERVER_VERSION = "1.0.0";

/** Repository root (works from src/ via tsx and from dist/ after build). */
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PYTHON_DIR = resolve(PROJECT_ROOT, "resolve-scripts");
export const LUA_DIR = resolve(PROJECT_ROOT, "resolve-scripts");

export const RESOLVE_PAGES = ["media", "cut", "edit", "fusion", "color", "fairlight", "deliver", "photo"] as const;

export const CLIP_COLORS = [
  "Orange", "Apricot", "Yellow", "Lime", "Olive", "Green", "Teal", "Navy",
  "Blue", "Purple", "Violet", "Pink", "Tan", "Beige", "Brown", "Chocolate",
] as const;

export const MARKER_COLORS = [
  "Blue", "Cyan", "Green", "Yellow", "Red", "Pink", "Purple", "Fuchsia",
  "Rose", "Lavender", "Sky", "Mint", "Lemon", "Sand", "Cocoa", "Cream",
] as const;

/** Common Windows install roots; RESOLVE_INSTALL_DIR overrides. */
export const WINDOWS_INSTALL_CANDIDATES = [
  "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve",
  "D:\\Program Files\\Blackmagic Design\\DaVinci Resolve",
  "C:\\Program Files (x86)\\Blackmagic Design\\DaVinci Resolve",
];
