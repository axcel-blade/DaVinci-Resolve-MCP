import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PYTHON_DIR } from "../../src/config/constants.js";

const PY = process.env.RESOLVE_PYTHON || (process.platform === "win32" ? "python" : "python3");

function py(code: string): string {
  return execFileSync(PY, ["-c", code], { cwd: PYTHON_DIR, encoding: "utf8" }).trim();
}

describe("python helpers", () => {
  it("timecode.py matches the TypeScript implementation", () => {
    const out = py("import timecode as t; print(t.frames_to_tc(1800, 29.97, True), t.tc_to_frames('00:01:00;02', 29.97), t.frames_to_tc(86400, 24), t.tc_to_frames('01:00:00:00', 24))");
    expect(out).toBe("00:01:00;02 1800 01:00:00:00 86400");
  });
  it("lut_generator writes a valid identity .cube", () => {
    const dir = mkdtempSync(join(tmpdir(), "lut-"));
    const path = join(dir, "id.cube").replace(/\\/g, "/");
    py(`import lut_generator as g; g.write_cube(r"${path}", {}, 5)`);
    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines[1]).toBe("LUT_3D_SIZE 5");
    expect(lines.length).toBe(4 + 125);
    expect(lines[4]).toBe("0.000000 0.000000 0.000000");
    expect(lines[5]).toBe("0.250000 0.000000 0.000000"); // red fastest
    expect(lines.at(-1)).toBe("1.000000 1.000000 1.000000");
  });
  it("monochrome look produces equal channels", () => {
    const out = py("import lut_generator as g; r=g.transform((0.8,0.2,0.1), {'monochrome': True}); print(abs(r[0]-r[1])<1e-9 and abs(r[1]-r[2])<1e-9)");
    expect(out).toBe("True");
  });
  it("worker registers every op the TypeScript side calls", () => {
    const ops: string[] = JSON.parse(execFileSync(PY, [join(PYTHON_DIR, "resolve_worker.py"), "--list-ops"], { encoding: "utf8" }));
    const srcDir = join(PYTHON_DIR, "..", "src");
    const src = ["application", "projects", "media", "timeline", "editing", "effects", "speed", "titles", "subtitles", "fusion", "color", "audio", "ai", "photo", "rendering", "workflow-documentary", "workflow-cinematic", "workflow-youtube"]
      .map((m) => readFileSync(join(srcDir, "mcp", "tools", `${m}.ts`), "utf8")).join("\n")
      + readFileSync(join(srcDir, "utils", "backup.ts"), "utf8")
      + readFileSync(join(srcDir, "mcp", "resources", "index.ts"), "utf8");
    const used = new Set([...src.matchAll(/(?:call(?:<[^>]*>)?\(|run\(ctx, )"([a-z_]+\.[a-z_]+)"/g)].map((m) => m[1]!));
    const missing = [...used].filter((o) => !ops.includes(o));
    expect(missing).toEqual([]);
    expect(used.size).toBeGreaterThan(100);
  });
});
