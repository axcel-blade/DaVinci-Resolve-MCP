import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root (works from src/ via tsx and from dist/ after build). */
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Name and version come from package.json so releases only bump one file. */
const PKG = JSON.parse(readFileSync(resolve(PROJECT_ROOT, "package.json"), "utf8")) as { name: string; version: string };
export const SERVER_NAME = PKG.name;
export const SERVER_VERSION = PKG.version;
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
