// Generate docs/TOOLS.md from the live tool registry (run after `pnpm build`).
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { buildRegistry } = await import(new URL("file:///" + join(root, "dist", "mcp", "tools", "index.js").replace(/\\/g, "/")).href);
const { zodToJsonSchema } = await import("zod-to-json-schema").catch(() => ({ zodToJsonSchema: null }));
const reg = buildRegistry();

const SUPPORT = {
  api: "Resolve scripting API", fusion: "Fusion scripting", integration: "Resolve API + FFmpeg/files", external: "Optional external provider",
  planner: "Server-side planner / workflow", unsupported: "Not scriptable (returns `unsupported` with an alternative)",
};

function fields(schema) {
  const shape = schema.shape ?? {};
  return Object.entries(shape).map(([k, v]) => {
    let t = v;
    let optional = false;
    let def;
    for (let i = 0; i < 6 && t?._def; i++) {
      if (t._def.typeName === "ZodOptional") { optional = true; t = t._def.innerType; continue; }
      if (t._def.typeName === "ZodDefault") { optional = true; def = t._def.defaultValue(); t = t._def.innerType; continue; }
      if (t._def.typeName === "ZodEffects") { t = t._def.schema; continue; }
      break;
    }
    const tn = t?._def?.typeName?.replace("Zod", "").toLowerCase() ?? "any";
    const enumVals = t?._def?.values ? ` (${(Array.isArray(t._def.values) ? t._def.values : Object.values(t._def.values)).join(" \\| ")})` : "";
    const desc = (v.description ?? t?.description ?? "").replace(/\|/g, "\\|");
    return `| \`${k}\` | ${tn}${enumVals} | ${optional ? "no" : "yes"} | ${def !== undefined ? "`" + JSON.stringify(def) + "`" : ""} | ${desc} |`;
  });
}

const byCat = new Map();
for (const t of reg.tools.values()) byCat.set(t.category, [...(byCat.get(t.category) ?? []), t]);
let md = `# MCP Tools\n\nGenerated from the tool registry by \`pnpm docs:tools\`. **${reg.tools.size} tools** in ${byCat.size} categories.\n\n`;
md += "Every tool returns `{ ok, tool, status, message, data, warnings, error? }`. `ok` is true only when DaVinci Resolve confirmed the operation. `status` is one of ok, partial, unsupported, error, confirmation_required.\n\n";
md += "Timeline items are addressed by `itemId` (from `timeline_get_clips`) or `trackType` + `trackIndex` + `itemIndex` (1-based, clips only). Tools marked **destructive** need `confirm: true` after the user agreed.\n\n## Contents\n\n";
for (const [c, list] of byCat) md += `- [${c}](#${c}) (${list.length})\n`;
for (const [c, list] of byCat) {
  md += `\n## ${c}\n`;
  for (const t of list) {
    md += `\n### \`${t.name}\`${t.destructive ? " — destructive" : ""}${t.readOnly ? " — read-only" : ""}\n\n${t.description}\n\n*Implementation:* ${SUPPORT[t.support] ?? t.support}\n\n`;
    const f = fields(t.inputSchema);
    md += f.length ? `| Parameter | Type | Required | Default | Description |\n|---|---|---|---|---|\n${f.join("\n")}\n` : "_No parameters._\n";
  }
}
md += `\n## Examples\n\n\`\`\`json\n{ "name": "project_create", "arguments": { "name": "Cinematic 4K", "width": 3840, "height": 2160, "frameRate": "24" } }\n{ "name": "media_import_folder", "arguments": { "path": "D:\\\\Footage", "organizeByType": true } }\n{ "name": "clip_trim", "arguments": { "itemId": "…", "trimEnd": 24 } }\n{ "name": "transition_add", "arguments": { "trackIndex": 1, "itemIndex": 1, "type": "Cross Dissolve", "position": "end", "duration": 12 } }\n{ "name": "color_apply_look", "arguments": { "preset": "teal_orange", "wholeTrack": true } }\n{ "name": "render_export_timeline", "arguments": { "preset": "youtube_4k", "outputDir": "C:\\\\Users\\\\me\\\\Videos", "fileName": "final" } }\n\`\`\`\n`;
void zodToJsonSchema;
writeFileSync(join(root, "docs", "TOOLS.md"), md);
console.log(`docs/TOOLS.md written (${reg.tools.size} tools)`);
