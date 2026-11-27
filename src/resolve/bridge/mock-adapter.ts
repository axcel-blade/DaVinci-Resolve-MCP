import { McpToolError } from "../../utils/errors.js";
import type { InstallInfo } from "./detect.js";

type Handler = (params: Record<string, unknown>, state: MockState) => unknown;

interface MockState {
  page: string;
  projects: string[];
  project: string | null;
  timelines: string[];
  timeline: string | null;
}

/**
 * In-memory stand-in for DaVinci Resolve used by automated tests and the installer smoke test
 * (RESOLVE_ADAPTER=mock). It models only enough application state to exercise the server; every
 * result produced through it is tagged source: "mock" so it can never be mistaken for real work.
 * Ops without a handler succeed with an echo payload ({ mock: true, op, params }).
 */
export class MockResolve {
  readonly calls: { op: string; params: unknown }[] = [];
  state: MockState = { page: "edit", projects: ["Untitled Project"], project: null, timelines: [], timeline: null };
  private overrides = new Map<string, Handler>();
  delayMs = 0;

  /** Force a specific op to run a custom handler (throw inside it to simulate a Resolve error). */
  on(op: string, handler: Handler): void {
    this.overrides.set(op, handler);
  }

  installInfo(): InstallInfo {
    return { installed: true, installDir: "(mock)", scriptApi: "(mock)", scriptApiExists: true, studio: true, source: "mock" };
  }

  async call<T = unknown>(op: string, params: object = {}): Promise<T> {
    this.calls.push({ op, params });
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const p = params as Record<string, unknown>;
    const h = this.overrides.get(op) ?? HANDLERS[op];
    return (h ? h(p, this.state) : { mock: true, op, params: p }) as T;
  }
}

const requireProject = (s: MockState): string => {
  if (!s.project) throw new McpToolError("NO_PROJECT", "No project is open (mock).");
  return s.project;
};

const HANDLERS: Record<string, Handler> = {
  "app.status": (_p, s) => ({ connected: true, product: "DaVinci Resolve Studio", version: "mock", page: s.page, project: s.project, timeline: s.timeline }),
  "app.version": () => ({ product: "DaVinci Resolve Studio", versionString: "mock", version: [0, 0, 0, 0, ""] }),
  "app.info": (_p, s) => ({ product: "DaVinci Resolve Studio", version: "mock", page: s.page, fusion: true }),
  "app.get_page": (_p, s) => ({ page: s.page }),
  "app.set_page": (p, s) => {
    s.page = String(p.page);
    return { page: s.page, ok: true };
  },
  "project.list": (_p, s) => ({ folder: "Root", projects: s.projects, folders: [] }),
  "project.current": (_p, s) => ({ project: s.project, timeline: s.timeline }),
  "project.create": (p, s) => {
    const name = String(p.name);
    if (s.projects.includes(name)) throw new McpToolError("ALREADY_EXISTS", `Project '${name}' already exists (mock).`);
    s.projects.push(name);
    s.project = name;
    s.timelines = [];
    s.timeline = null;
    const settings = (p.settings ?? {}) as Record<string, unknown>;
    return { name, settingsApplied: Object.fromEntries(Object.keys(settings).map((k) => [k, { ok: true }])) };
  },
  "project.open": (p, s) => {
    const name = String(p.name);
    if (!s.projects.includes(name)) throw new McpToolError("NOT_FOUND", `Project '${name}' not found (mock).`);
    s.project = name;
    return { name };
  },
  "project.close": (_p, s) => {
    s.project = null;
    s.timeline = null;
    return { closed: true };
  },
  "project.save": (_p, s) => ({ saved: requireProject(s) }),
  "project.timelines": (_p, s) => ({ timelines: s.timelines.map((name, i) => ({ index: i + 1, name })), current: s.timeline }),
};
