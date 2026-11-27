import { existsSync, statSync } from "node:fs";
import { extname } from "node:path";
import { z } from "zod";
import { CLIP_COLORS, MARKER_COLORS } from "../../config/constants.js";
import { probe, sha256File } from "../../utils/media-probe.js";
import { absPath, clipRef, type ToolRegistry, clean, run } from "./common.js";
import { McpToolError } from "../../utils/errors.js";

const VIDEO = [".mp4", ".mov", ".avi", ".mxf", ".mkv", ".m4v", ".mts", ".m2ts", ".braw", ".r3d", ".webm"];
const AUDIO = [".wav", ".mp3", ".aif", ".aiff", ".flac", ".m4a", ".aac", ".ogg"];
const IMAGE = [".png", ".jpg", ".jpeg", ".tif", ".tiff", ".exr", ".dpx", ".bmp", ".tga", ".psd", ".heic", ".webp", ".cr2", ".cr3", ".nef", ".arw", ".dng"];

const bin = z.string().max(512).optional().describe("Target bin path like 'Footage/Day1' (created if missing). Default: current bin.");

function importTyped(reg: ToolRegistry, tool: string, kind: string, exts: string[]) {
  reg.define({
    name: tool, category: "media",
    description: `Import ${kind} files (${exts.join(", ")}) into the media pool. Source files are never modified.`,
    input: { paths: z.array(absPath).min(1).max(2000), bin },
    handler: async (a, ctx) => {
      const paths = a.paths.map((p) => ctx.paths.read(p, { kind: "file" }));
      const wrong = paths.filter((p) => !exts.includes(extname(p).toLowerCase()));
      if (wrong.length) throw new McpToolError("INVALID_ARGUMENT", `Not ${kind} files: ${wrong.slice(0, 5).join(", ")}`);
      return run(ctx, "media.import", clean({ paths, bin: a.bin, asStills: kind === "image" ? true : undefined }), (d) => `Imported ${(d as { imported: number }).imported} ${kind} clip(s).`, 300000);
    },
  });
}


export function registerMedia(reg: ToolRegistry): void {
  const category = "media";

  reg.define({
    name: "media_import", category,
    description: "Import any supported media files (video, audio, stills, subtitles) into the media pool, optionally into a bin.",
    input: { paths: z.array(absPath).min(1).max(2000), bin },
    handler: async (a, ctx) => run(ctx, "media.import", clean({ paths: a.paths.map((p) => ctx.paths.read(p)), bin: a.bin }), (d) => `Imported ${(d as { imported: number }).imported} clip(s).`, 300000),
  });
  reg.define({
    name: "media_import_folder", category,
    description: "Import all supported media from a folder (recursive by default). organizeByType puts files into Video/Audio/Images bins.",
    input: { path: absPath, recursive: z.boolean().default(true), types: z.array(z.enum(["video", "audio", "image"])).optional(), organizeByType: z.boolean().default(false), bin },
    handler: async (a, ctx) => run(ctx, "media.import_folder", clean({ ...a, path: ctx.paths.read(a.path, { kind: "dir" }) }), (d) => `Imported ${(d as { imported: number }).imported} of ${(d as { found: number }).found} file(s).`, 900000),
  });
  importTyped(reg, "media_import_video", "video", VIDEO);
  importTyped(reg, "media_import_audio", "audio", AUDIO);
  importTyped(reg, "media_import_image", "image", IMAGE);
  reg.define({
    name: "media_import_sequence", category,
    description: "Import an image sequence as one clip. pattern uses printf-style frame numbering, e.g. C:\\renders\\shot_%04d.exr.",
    input: { pattern: absPath.regex(/%0?\d*d/, "pattern must contain a %d / %04d frame token"), start: z.number().int().min(0), end: z.number().int().min(0), bin },
    handler: async (a, ctx) => {
      if (a.end < a.start) throw new McpToolError("INVALID_ARGUMENT", "end must be >= start");
      ctx.paths.normalize(a.pattern);
      return run(ctx, "media.import_sequence", clean(a), "Image sequence imported.");
    },
  });
  reg.define({
    name: "media_list", category, readOnly: true,
    description: "List clips in the media pool (all bins or one bin), optionally filtered by Resolve clip type (Video, Audio, Still, Timeline...).",
    input: { bin: z.string().optional(), type: z.string().optional(), limit: z.number().int().min(1).max(5000).default(500) },
    handler: async (a, ctx) => run(ctx, "media.list", clean(a)),
  });
  reg.define({ name: "media_list_bins", category, readOnly: true, description: "List all bins (folders) in the media pool with clip counts.", input: {}, handler: async (_a, ctx) => run(ctx, "media.bins") });
  reg.define({
    name: "media_search", category, readOnly: true,
    description: "Search media pool clips by name, file path and metadata (keywords, comments, scene, shot...). Case-insensitive substring match.",
    input: { query: z.string().min(1), fields: z.array(z.enum(["name", "path", "metadata"])).optional() },
    handler: async (a, ctx) => run(ctx, "media.search", clean(a)),
  });
  reg.define({ name: "media_get_info", category, readOnly: true, description: "All Resolve clip properties for a clip, whether the source file exists, mark in/out and markers.", input: { clip: clipRef }, handler: async (a, ctx) => run(ctx, "media.info", a) });
  reg.define({ name: "media_get_metadata", category, readOnly: true, description: "Clip metadata fields (and third-party metadata).", input: { clip: clipRef }, handler: async (a, ctx) => run(ctx, "media.metadata", a) });
  reg.define({
    name: "media_set_metadata", category,
    description: "Set clip metadata fields (e.g. Keywords, Comments, Description, Scene, Shot, Take). Each field is verified by readback.",
    input: { clip: clipRef, metadata: z.record(z.string(), z.union([z.string(), z.number()])) },
    handler: async (a, ctx) => run(ctx, "media.set_metadata", a),
  });
  reg.define({ name: "media_rename", category, description: "Rename a clip in the media pool (Clip Name property; the file on disk is untouched).", input: { clip: clipRef, name: z.string().min(1).max(255) }, handler: async (a, ctx) => run(ctx, "media.rename", a) });
  reg.define({ name: "media_move_to_bin", category, description: "Move clips to a bin (created if missing).", input: { clips: z.array(clipRef).min(1), bin: z.string().min(1), create: z.boolean().default(true) }, handler: async (a, ctx) => run(ctx, "media.move_to_bin", a) });
  reg.define({ name: "media_create_bin", category, description: "Create a bin (sub-folder) in the media pool, under parent (default: root).", input: { name: z.string().min(1).max(255), parent: z.string().optional() }, handler: async (a, ctx) => run(ctx, "media.create_bin", clean(a)) });
  reg.define({
    name: "media_delete", category, destructive: true,
    description: "Remove clips from the media pool. Files on disk are NOT deleted. Timeline uses of the clips go offline.",
    input: { clips: z.array(clipRef).min(1) },
    handler: async (a, ctx) => run(ctx, "media.delete", a, (d) => `Removed ${(d as { removedFromMediaPool: string[] }).removedFromMediaPool.length} clip(s) from the media pool.`),
  });
  reg.define({ name: "media_find_missing", category, readOnly: true, description: "Find offline clips whose source files no longer exist.", input: {}, handler: async (_a, ctx) => run(ctx, "media.missing", {}, (d) => `${(d as { count: number }).count} offline clip(s).`) });
  reg.define({
    name: "media_relink", category,
    description: "Relink clips to files in a folder (Resolve searches it for matching names). Without clips, relinks every offline clip.",
    input: { folder: absPath, clips: z.array(clipRef).optional() },
    handler: async (a, ctx) => run(ctx, "media.relink", clean({ ...a, folder: ctx.paths.read(a.folder, { kind: "dir" }) })),
  });
  for (const [tool, field, label] of [["media_get_duration", "duration", "duration"], ["media_get_resolution", "resolution", "resolution"], ["media_get_frame_rate", "fps", "frame rate"], ["media_get_audio_channels", "audioChannels", "audio channel count"]] as const) {
    reg.define({
      name: tool, category, readOnly: true, description: `Read a clip's ${label} from Resolve's clip properties.`, input: { clip: clipRef },
      handler: async (a, ctx) => {
        const d = await ctx.bridge.call<Record<string, unknown>>("media.technical", a);
        return { data: field === "resolution" ? { resolution: d.resolution, width: d.width, height: d.height } : field === "duration" ? { duration: d.duration, frames: d.frames, fps: d.fps } : { [field]: d[field] }, message: `${label}: ${JSON.stringify(d[field])}` };
      },
    });
  }
  reg.define({
    name: "media_probe_file", category, readOnly: true,
    description: "Technical analysis of a source file with ffprobe (codec, resolution, fps, audio layout, bitrate). Requires FFmpeg.",
    input: { path: absPath },
    handler: async (a, ctx) => ({ data: await probe(ctx.config.ffprobePath, ctx.paths.read(a.path, { kind: "file" })) }),
  });
  reg.unsupported("media_generate_proxy", category, "Generate proxy media for clips.", "the scripting API has no proxy-generation method.",
    "Generate proxies in the Media page (right-click > Generate Proxy Media), or render proxies with the Deliver page / FFmpeg and attach them with media_link_proxy.", { clips: z.array(clipRef).optional() });
  reg.unsupported("media_generate_optimized", category, "Generate optimized media for clips.", "the scripting API has no optimized-media method.",
    "Use Media page > right-click > Generate Optimized Media.", { clips: z.array(clipRef).optional() });
  reg.define({
    name: "media_link_proxy", category,
    description: "Attach an existing proxy file to a clip (MediaPoolItem.LinkProxyMedia). Use unlink: true to detach.",
    input: { clip: clipRef, proxyPath: absPath.optional(), unlink: z.boolean().default(false) },
    handler: async (a, ctx) => {
      if (a.unlink) return run(ctx, "media.unlink_proxy", { clip: a.clip }, "Proxy unlinked.");
      if (!a.proxyPath) throw new McpToolError("INVALID_ARGUMENT", "proxyPath is required unless unlink is true.");
      return run(ctx, "media.link_proxy", { clip: a.clip, proxyPath: ctx.paths.read(a.proxyPath, { kind: "file" }) }, "Proxy linked.");
    },
  });
  reg.define({
    name: "media_replace", category, destructive: true,
    description: "Replace a clip's source file with another file (MediaPoolItem.ReplaceClip). Every timeline use switches to the new file.",
    input: { clip: clipRef, path: absPath },
    handler: async (a, ctx) => run(ctx, "media.replace", { clip: a.clip, path: ctx.paths.read(a.path, { kind: "file" }) }, "Clip source replaced."),
  });
  reg.define({ name: "media_set_clip_color", category, description: "Set (or clear with null) a clip's color label.", input: { clip: clipRef, color: z.enum(CLIP_COLORS).nullable() }, handler: async (a, ctx) => run(ctx, "media.set_color", a) });
  reg.define({ name: "media_set_clip_flag", category, description: "Add a flag to a clip, or clear flags (clear: true; color omitted clears all).", input: { clip: clipRef, color: z.enum(MARKER_COLORS).optional(), clear: z.boolean().default(false) }, handler: async (a, ctx) => { if (!a.clear && !a.color) throw new McpToolError("INVALID_ARGUMENT", "color is required to add a flag."); return run(ctx, "media.set_flag", clean(a)); } });
  reg.define({
    name: "media_set_clip_rating", category,
    description: "Rate a clip 0-5 stars by writing a 'Rating'-style metadata field (verified by readback). Also sets 'Good Take' for ratings >= 4.",
    input: { clip: clipRef, rating: z.number().int().min(0).max(5), field: z.string().default("Rating") },
    handler: async (a, ctx) => {
      const md: Record<string, string> = { [a.field]: String(a.rating) };
      if (a.rating >= 4) md["Good Take"] = "1";
      const r = await ctx.bridge.call<{ results: Record<string, { ok: boolean }> }>("media.set_metadata", { clip: a.clip, metadata: md });
      const ok = r.results[a.field]?.ok;
      return { data: r, status: ok ? "ok" : "unsupported", message: ok ? `Rated ${a.rating}/5.` : `Resolve rejected metadata field '${a.field}'. Use a field your Resolve version supports (see media_get_metadata), e.g. Keywords or Comments.` };
    },
  });
  reg.define({ name: "media_add_marker", category, description: "Add a marker to a media pool clip at a source frame.", input: { clip: clipRef, frame: z.number().int().min(0), color: z.enum(MARKER_COLORS).default("Blue"), name: z.string().default(""), note: z.string().default(""), duration: z.number().int().min(1).default(1) }, handler: async (a, ctx) => run(ctx, "media.add_marker", a) });
  reg.define({ name: "media_set_mark_in_out", category, description: "Set a clip's mark in/out (source frames).", input: { clip: clipRef, markIn: z.number().int().min(0), markOut: z.number().int().min(0), type: z.enum(["all", "video", "audio"]).default("all") }, handler: async (a, ctx) => run(ctx, "media.set_mark_in_out", a) });
  reg.define({ name: "media_get_selected", category, readOnly: true, description: "Clips currently selected in the media pool.", input: {}, handler: async (_a, ctx) => run(ctx, "media.selected") });
  reg.define({
    name: "media_find_duplicates", category, readOnly: true,
    description: "Find duplicate source files among media pool clips. 'quick' compares size+name, 'hash' compares SHA-256 (reads every file).",
    input: { method: z.enum(["quick", "hash"]).default("quick") },
    handler: async (a, ctx) => {
      const files = await ctx.bridge.call<{ id: string; name: string; filePath: string }[]>("media.file_paths");
      const groups = new Map<string, typeof files>();
      for (const f of files) {
        if (!f.filePath || !existsSync(f.filePath) || statSync(f.filePath).isDirectory()) continue;
        const key = a.method === "hash" ? await sha256File(f.filePath) : `${statSync(f.filePath).size}:${f.filePath.split(/[\\/]/).pop()?.toLowerCase()}`;
        groups.set(key, [...(groups.get(key) ?? []), f]);
      }
      const dups = [...groups.entries()].filter(([, v]) => v.length > 1).map(([key, v]) => ({ key, clips: v }));
      return { data: { method: a.method, groups: dups }, message: `${dups.length} duplicate group(s).` };
    },
  });
  reg.define({
    name: "media_organize_by_type", category,
    description: "Move every clip in the root bin into Video / Audio / Stills / Timelines bins based on Resolve's clip Type.",
    input: {},
    handler: async (_a, ctx) => {
      const list = await ctx.bridge.call<{ clips: { id: string; bin: string; properties: Record<string, string> }[] }>("media.list", { limit: 5000 });
      const root = list.clips[0]?.bin?.split("/")[0];
      const buckets: Record<string, string[]> = {};
      for (const c of list.clips) {
        if (c.bin !== root) continue;
        const t = (c.properties.Type ?? "").toLowerCase();
        const b = t.includes("timeline") ? "Timelines" : t.includes("audio") && !t.includes("video") ? "Audio" : t.includes("still") || t.includes("image") ? "Stills" : "Video";
        (buckets[b] ??= []).push(c.id);
      }
      const moved: Record<string, number> = {};
      for (const [b, ids] of Object.entries(buckets)) {
        await ctx.bridge.call("media.move_to_bin", { clips: ids, bin: b, create: true });
        moved[b] = ids.length;
      }
      return { data: { moved }, message: `Organized ${Object.values(moved).reduce((x, y) => x + y, 0)} clip(s).` };
    },
  });
  reg.define({ name: "media_auto_sync_audio", category, description: "Auto-sync separately recorded audio to video clips by waveform or timecode (MediaPool.AutoSyncAudio).", input: { clips: z.array(clipRef).min(2), mode: z.enum(["waveform", "timecode"]).default("waveform"), retainEmbeddedAudio: z.boolean().optional() }, handler: async (a, ctx) => run(ctx, "media.auto_sync_audio", clean(a), "Audio synced.", 600000) });
  reg.define({ name: "media_transcribe", category, description: "Transcribe a clip's audio with Resolve's built-in transcription (Studio; result is stored in Resolve).", input: { clip: clipRef }, handler: async (a, ctx) => run(ctx, "media.transcribe", a, "Transcription complete.", 1800000) });
  reg.define({ name: "media_storage_volumes", category, readOnly: true, description: "Mounted volumes visible to Resolve's Media Storage.", input: {}, handler: async (_a, ctx) => run(ctx, "media.storage_volumes") });
}
