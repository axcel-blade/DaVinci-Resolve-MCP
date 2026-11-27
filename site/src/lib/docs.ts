import type { MarkdownInstance } from "astro";
import pkg from "../../../package.json";

export const REPO = "https://github.com/axcel-blade/DaVinci-Resolve-MCP";
export const VERSION: string = pkg.version;

/** docs/*.md from the repository root; the site never keeps its own copy. */
const files = import.meta.glob<MarkdownInstance<Record<string, unknown>>>("../../../docs/*.md", { eager: true });

export interface Doc {
  slug: string;
  file: string;
  title: string;
  group: string;
  order: number;
  entry: MarkdownInstance<Record<string, unknown>>;
}

/** Sidebar order and grouping; unknown docs land under "Reference" alphabetically. */
const LAYOUT: Record<string, [group: string, order: number]> = {
  INSTALLATION: ["Get started", 1],
  CONFIGURATION: ["Get started", 2],
  CLIENTS: ["Get started", 3],
  EXAMPLES: ["Get started", 5],
  TROUBLESHOOTING: ["Get started", 6],
  SUPPORTED_FEATURES: ["Reference", 1],
  API_REFERENCE: ["Reference", 2],
  TOOLS: ["Reference", 3],
  TIMECODE: ["Reference", 4],
  LIMITATIONS: ["Reference", 5],
  ARCHITECTURE: ["Project", 1],
  SECURITY: ["Project", 2],
  DEVELOPMENT: ["Project", 3],
  TESTING: ["Project", 4],
  TEST_REPORT: ["Project", 5],
};
export const GROUPS = ["Get started", "Reference", "Project"];

export const docs: Doc[] = Object.entries(files)
  .map(([path, entry]) => {
    const file = path.split("/").pop()!.replace(/\.md$/, "");
    const heading = entry.getHeadings().find((h) => h.depth === 1)?.text;
    const [group, order] = LAYOUT[file] ?? ["Reference", 99];
    return { slug: file.toLowerCase().replace(/_/g, "-"), file, title: heading ?? file.replace(/_/g, " "), group, order, entry };
  })
  .sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.order - b.order || a.title.localeCompare(b.title));

export const toolCount = (): number => {
  const tools = docs.find((d) => d.file === "TOOLS");
  return tools ? tools.entry.getHeadings().filter((h) => h.depth === 3).length : 0;
};

/** Prefix a site path with the configured base ("/DaVinci-Resolve-MCP"). */
export const href = (path: string): string => `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`;
