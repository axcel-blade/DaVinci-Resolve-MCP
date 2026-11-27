// Run all suites with JSON reporters and write docs/TEST_REPORT.md (passed / failed / skipped / unsupported).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "test-output");
mkdirSync(out, { recursive: true });
const vitest = join(root, "node_modules", "vitest", "vitest.mjs");

function runSuite(name, args) {
  const file = join(out, `${name}.json`);
  try {
    execFileSync(process.execPath, [vitest, "run", ...args, "--reporter=json", `--outputFile=${file}`], { cwd: root, stdio: "inherit" });
  } catch { /* failures are recorded in the JSON */ }
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

const suites = { "Unit + integration": runSuite("offline", ["--project", "default"]), "Live DaVinci Resolve": runSuite("live", ["--project", "e2e"]) };
const liveReports = ["live-test/live-report.json", "live-test/v21/v21-report.json"].map((f) => join(root, "output", f)).filter(existsSync).map((f) => JSON.parse(readFileSync(f, "utf8")));

function sh(cmd, args) {
  try { return execFileSync(cmd, args, { encoding: "utf8", windowsHide: true }).trim(); } catch { return "unknown"; }
}
const resolveVersion = process.platform === "win32"
  ? sh("powershell", ["-NoProfile", "-Command", "(Get-Item \"$env:ProgramFiles\\Blackmagic Design\\DaVinci Resolve\\Resolve.exe\" -ErrorAction SilentlyContinue).VersionInfo.ProductVersion"])
  : "unknown";
const env = `- OS: ${sh("powershell", ["-NoProfile", "-Command", "(Get-CimInstance Win32_OperatingSystem).Caption"])}\n- DaVinci Resolve: ${resolveVersion || "not found"}\n- Node: ${process.version}\n- Python: ${sh(process.env.RESOLVE_PYTHON || "python", ["--version"])}\n- FFmpeg: ${sh("ffmpeg", ["-version"]).split("\n")[0]}\n`;
let md = `# Test Report\n\nGenerated ${new Date().toISOString()} by \`pnpm test:report\`.\n\n## Environment\n\n${env}\n| Suite | Passed | Failed | Skipped |\n|---|---|---|---|\n`;
for (const [n, r] of Object.entries(suites)) md += r ? `| ${n} | ${r.numPassedTests} | ${r.numFailedTests} | ${r.numPendingTests + (r.numTodoTests ?? 0)} |\n` : `| ${n} | – | – | not run |\n`;
for (const [n, r] of Object.entries(suites)) {
  if (!r) continue;
  md += `\n## ${n}\n\n| Test | Result |\n|---|---|\n`;
  for (const f of r.testResults) for (const a of f.assertionResults) md += `| ${a.ancestorTitles.slice(-1)[0] ?? ""} › ${a.title} | ${a.status} |\n`;
}
const unsupported = liveReports.flatMap((r) => r.report.filter((x) => x.result === "unsupported").map((x) => x.test));
md += `\n## Unsupported in the tested Resolve version\n\n${unsupported.length ? unsupported.map((u) => `- ${u}`).join("\n") : "- none recorded"}\n`;
md += `\n## Known limitations\n\nSee [SUPPORTED_FEATURES.md](SUPPORTED_FEATURES.md) for every feature that the scripting API does not expose and the alternative each tool offers.\n`;
writeFileSync(join(root, "docs", "TEST_REPORT.md"), md);
console.log("docs/TEST_REPORT.md written");
