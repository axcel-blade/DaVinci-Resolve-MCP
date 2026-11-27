import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { AiProvider, segmentsToSrt } from "../../utils/ai-provider.js";
import { absPath, timelineArg, type ToolRegistry, clean, run } from "./registry.js";
import { McpToolError } from "../../utils/errors.js";

const WHY = "the scripting API cannot create or edit individual subtitle items.";
const ALT = "Edit captions as an SRT (subtitle_export, edit the file, subtitle_import), or edit them in the Edit page subtitle track / Inspector.";

export function registerSubtitles(reg: ToolRegistry): void {
  const category = "subtitles";
  reg.define({ name: "subtitle_create_track", category, description: "Add a subtitle track to the timeline.", input: { timeline: timelineArg }, handler: async (a, ctx) => run(ctx, "subtitle.create_track", clean(a)) });
  reg.define({
    name: "subtitle_import", category,
    description: "Import an SRT (or other Resolve-supported subtitle file) and place it on the timeline's subtitle track.",
    input: { timeline: timelineArg, path: absPath },
    handler: async (a, ctx) => run(ctx, "subtitle.import", clean({ ...a, path: ctx.paths.read(a.path, { kind: "file" }) })),
  });
  reg.define({
    name: "subtitle_export", category,
    description: "Export the timeline's subtitle items to an SRT file (built from the subtitle track contents).",
    input: { timeline: timelineArg, path: absPath, track: z.number().int().min(1).optional(), overwrite: z.boolean().default(false) },
    handler: async (a, ctx) => run(ctx, "subtitle.export_srt", clean({ ...a, path: ctx.paths.write(a.path, { overwrite: a.overwrite }) }), (d) => `Exported ${(d as { count: number }).count} subtitle(s).`),
  });
  reg.define({ name: "subtitle_get_all", category, readOnly: true, description: "All subtitle items (text, start/end frames).", input: { timeline: timelineArg }, handler: async (a, ctx) => run(ctx, "subtitle.get_all", clean(a)) });
  reg.unsupported("subtitle_add", category, "Add a single subtitle caption.", WHY, ALT, { timeline: timelineArg, text: z.string().optional() });
  reg.unsupported("subtitle_edit", category, "Edit a subtitle caption's text.", WHY, ALT, { timeline: timelineArg, text: z.string().optional() });
  reg.unsupported("subtitle_delete", category, "Delete one subtitle caption.", WHY, ALT, { timeline: timelineArg });
  reg.unsupported("subtitle_set_timing", category, "Retime a subtitle caption.", WHY, ALT, { timeline: timelineArg });
  reg.unsupported("subtitle_set_style", category, "Style subtitle captions (font/size/color/background).", "subtitle track styling is not exposed to scripting.", "Style captions in the Inspector (Track Style), or burn styled captions with title_create (Text+, preset subtitle_social).", { timeline: timelineArg });
  reg.define({
    name: "subtitle_generate", category,
    description: "Generate subtitles from the timeline audio. engine 'resolve' uses Resolve Studio's CreateSubtitlesFromAudio; engine 'provider' transcribes a rendered/source audio file with the configured AI provider and imports the SRT.",
    input: {
      timeline: timelineArg,
      engine: z.enum(["resolve", "provider"]).default("resolve"),
      language: z.string().optional().describe("resolve: e.g. english, spanish (AUTO_CAPTION_* constant). provider: ISO code like en"),
      charsPerLine: z.number().int().min(1).max(60).optional(),
      lines: z.union([z.literal(1), z.literal(2)]).optional(),
      gapFrames: z.number().int().min(0).max(10).optional(),
      audioPath: absPath.optional().describe("provider engine: audio/video file to transcribe"),
    },
    handler: async (a, ctx) => {
      if (a.engine === "resolve") return run(ctx, "subtitle.generate", clean({ timeline: a.timeline, language: a.language, charsPerLine: a.charsPerLine, lines: a.lines, gapFrames: a.gapFrames }), (d) => `Generated ${(d as { added: number }).added} subtitle(s).`, 3600000);
      if (!a.audioPath) throw new McpToolError("INVALID_ARGUMENT", "audioPath is required for engine 'provider'.");
      const ai = new AiProvider(ctx.config.ai);
      const t = await ai.transcribe(ctx.paths.read(a.audioPath, { kind: "file" }), a.language);
      const srt = ctx.paths.write(join(ctx.config.paths.outputDir, `captions-${Date.now()}.srt`));
      writeFileSync(srt, segmentsToSrt(t.segments));
      const imp = await ctx.bridge.call("subtitle.import", clean({ timeline: a.timeline, path: srt }));
      return { data: { srt, segments: t.segments.length, import: imp }, message: `Transcribed ${t.segments.length} segment(s); SRT written to ${srt} and imported.` };
    },
  });
}
