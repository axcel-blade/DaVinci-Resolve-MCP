import { join } from "node:path";
import { z } from "zod";
import { COLOR_PRESETS } from "../../design-engine/presets/presets.js";
import { absPath, clipRef, type ToolRegistry, clean, run } from "./common.js";
import { McpToolError } from "../../utils/errors.js";

const IMAGE = /\.(png|jpe?g|tiff?|exr|dpx|bmp|tga|psd|heic|heif|webp|cr2|cr3|nef|arw|dng|raf|orf|rw2)$/i;

/**
 * Photo page automation through the Photo Album API (Resolve 21+): Project.GetPhotoAlbum*, MediaPool.CreatePhotoAlbumFromPhotos,
 * PhotoAlbumItem.SetProperties (transform / crop / looks), SetCDL, node-graph LUTs, AddEffect, SetRatings, ApplyAutoColor, ExportFrame.
 */
export function registerPhoto(reg: ToolRegistry): void {
  const category = "photo";
  const PhotoRef = { album: z.string().optional().describe("Album name or id (default: current album)"), photo: z.union([z.string(), z.number().int().min(1)]).describe("Photo name, id or 1-based index in the album") };
  type PR = { album?: string; photo: string | number };
  const ref = (a: PR) => clean({ album: a.album, photo: a.photo });

  reg.define({
    name: "photo_check_support", category, readOnly: true,
    description: "Detect Photo page scripting support (Photo Album API, Resolve 21+) and list albums.",
    input: {},
    handler: async (_a, ctx) => {
      try {
        const albums = await ctx.bridge.call("photo.albums");
        return { data: { photoApi: true, albums }, message: "Photo Album API available." };
      } catch (e) {
        return { status: "unsupported", data: { photoApi: false }, message: `Photo page scripting unavailable: ${(e as Error).message}` };
      }
    },
  });
  reg.define({
    name: "photo_import", category,
    description: "Import photographs (JPEG/PNG/TIFF/HEIC/RAW...) into the media pool and add them to a photo album (created if missing).",
    input: { paths: z.array(absPath).min(1).max(2000), album: z.string().min(1).max(255).default("Photos") },
    handler: async (a, ctx) => {
      const paths = a.paths.map((p) => ctx.paths.read(p, { kind: "file" }));
      const bad = paths.filter((p) => !IMAGE.test(p));
      if (bad.length) throw new McpToolError("INVALID_ARGUMENT", `Not image files: ${bad.slice(0, 5).join(", ")}`);
      const imp = await ctx.bridge.call<{ clips: { id: string }[] }>("media.import", { paths, bin: a.album, asStills: true }, 600000);
      const album = await ctx.bridge.call("photo.create_album", { name: a.album, photos: imp.clips.map((c) => c.id) });
      return { data: { imported: imp.clips.length, album }, message: `Imported ${imp.clips.length} photo(s) into album '${a.album}'.` };
    },
  });
  reg.define({ name: "photo_list_albums", category, readOnly: true, description: "List photo albums with photo counts.", input: {}, handler: async (_a, ctx) => run(ctx, "photo.albums") });
  reg.define({ name: "photo_list", category, readOnly: true, description: "List photos in an album (name, id, rating).", input: { album: z.string().optional() }, handler: async (a, ctx) => run(ctx, "photo.list", clean(a)) });
  reg.define({ name: "photo_get_info", category, readOnly: true, description: "A photo's properties (transform, crop, looks), rating, source file and resolution.", input: PhotoRef, handler: async (a, ctx) => run(ctx, "photo.info", ref(a)) });
  reg.define({
    name: "photo_edit", category,
    description: "Set any documented PhotoAlbumItem properties at once (Pan, Tilt, ZoomX/Y, RotationAngle, FlipX/Y, CropLeft/Right/Top/Bottom, CropRatio, Source* section toggles...). All keys are validated by Resolve together.",
    input: { ...PhotoRef, properties: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])) },
    handler: async (a, ctx) => run(ctx, "photo.set_properties", { ...ref(a), properties: a.properties }),
  });
  reg.define({
    name: "photo_crop", category,
    description: "Crop / reframe a photo (pixels from each edge, optional zoom and rotation).",
    input: { ...PhotoRef, left: z.number().min(0).default(0), right: z.number().min(0).default(0), top: z.number().min(0).default(0), bottom: z.number().min(0).default(0), lockAspect: z.boolean().default(false).describe("Keep Resolve's crop aspect lock (it rejects crops that change the aspect when on)"), zoom: z.number().min(0.01).max(100).optional(), rotation: z.number().min(-360).max(360).optional() },
    handler: async (a, ctx) => run(ctx, "photo.set_properties", { ...ref(a), properties: clean({ SourceCroppingEnabled: true, CropLockAspectRatio: a.lockAspect, CropLeft: a.left, CropRight: a.right, CropTop: a.top, CropBottom: a.bottom, SourceTransformEnabled: a.zoom !== undefined || a.rotation !== undefined ? true : undefined, ZoomX: a.zoom, ZoomY: a.zoom, RotationAngle: a.rotation }) }, "Photo cropped."),
  });
  const lutLook = (tool: string, label: string, field: string, schema: z.ZodNumber) =>
    reg.define({
      name: tool, category, description: `${label} on a photo: generated 3D LUT applied to node 1 (the primaries wheels are not scriptable).`,
      input: { ...PhotoRef, value: schema },
      handler: async (a, ctx) => {
        const path = ctx.paths.write(join(ctx.config.paths.lutDir, `${tool}-${Date.now()}.cube`));
        await ctx.bridge.call("color.generate_lut", { path, params: { [field]: a.value }, size: 33, title: tool });
        return run(ctx, "photo.set_lut", { ...ref(a), lutPath: path, nodeIndex: 1 }, `${label} applied.`);
      },
    });
  lutLook("photo_adjust_exposure", "Exposure (stops)", "exposure", z.number().min(-5).max(5));
  lutLook("photo_adjust_contrast", "Contrast (1 = neutral)", "contrast", z.number().min(0).max(3));
  lutLook("photo_adjust_saturation", "Saturation (1 = neutral)", "saturation", z.number().min(0).max(3));
  lutLook("photo_adjust_white_balance", "White balance temperature (-1 cool .. +1 warm)", "temperature", z.number().min(-1).max(1));
  reg.define({
    name: "photo_set_cdl", category, description: "Primary correction on a photo via ASC CDL (slope/offset/power/saturation). A grade version is saved first.",
    input: { ...PhotoRef, nodeIndex: z.number().int().min(1).default(1), slope: z.tuple([z.number(), z.number(), z.number()]).default([1, 1, 1]), offset: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]), power: z.tuple([z.number(), z.number(), z.number()]).default([1, 1, 1]), saturation: z.number().min(0).max(4).default(1) },
    handler: async (a, ctx) => run(ctx, "photo.set_cdl", { ...ref(a), nodeIndex: a.nodeIndex, slope: a.slope, offset: a.offset, power: a.power, saturation: a.saturation }),
  });
  reg.define({ name: "photo_apply_lut", category, description: "Apply a LUT file to a photo (staged into Resolve's LUT folder).", input: { ...PhotoRef, lutPath: absPath, nodeIndex: z.number().int().min(1).default(1) }, handler: async (a, ctx) => run(ctx, "photo.set_lut", { ...ref(a), lutPath: ctx.paths.read(a.lutPath, { kind: "file" }), nodeIndex: a.nodeIndex }) });
  reg.define({ name: "photo_apply_effect", category, description: "Apply an installed photo effect (Resolve.GetEffectsList('photo')) to a photo.", input: { ...PhotoRef, effect: z.string().min(1) }, handler: async (a, ctx) => run(ctx, "photo.add_effect", { ...ref(a), effect: a.effect }) });
  reg.define({
    name: "photo_apply_grade", category,
    description: "Apply a cinematic look preset to a photo (generated LUT), or Resolve's Auto Color with preset 'auto'.",
    input: { ...PhotoRef, preset: z.enum(["auto", ...Object.keys(COLOR_PRESETS)] as [string, ...string[]]) },
    handler: async (a, ctx) => {
      if (a.preset === "auto") return run(ctx, "photo.auto_color", ref(a), "Auto Color applied.");
      const path = ctx.paths.write(join(ctx.config.paths.lutDir, `photo-${a.preset}-${Date.now()}.cube`));
      await ctx.bridge.call("color.generate_lut", { path, params: COLOR_PRESETS[a.preset]!.params, size: 33, title: a.preset });
      return run(ctx, "photo.set_lut", { ...ref(a), lutPath: path, nodeIndex: 1 }, `Look '${a.preset}' applied.`);
    },
  });
  reg.define({ name: "photo_set_rating", category, description: "Star-rate a photo (0-5).", input: { ...PhotoRef, rating: z.number().int().min(0).max(5) }, handler: async (a, ctx) => run(ctx, "photo.set_rating", { ...ref(a), rating: a.rating }) });
  reg.define({
    name: "photo_export", category,
    description: "Export photos (all in the album, or selected) as finished images with PhotoAlbumItem.ExportFrame (jpg/png/tif), optional max dimension and JPEG quality. Never overwrites without overwrite: true.",
    input: { album: z.string().optional(), photos: z.array(z.union([z.string(), z.number().int()])).optional(), outputDir: absPath, format: z.enum(["jpg", "png", "tif"]).default("jpg"), prefix: z.string().regex(/^[\w-]*$/).default(""), maxDimension: z.number().int().min(16).max(30000).optional(), quality: z.number().int().min(1).max(100).optional(), overwrite: z.boolean().default(false) },
    handler: async (a, ctx) => {
      const dir = ctx.paths.write(a.outputDir, { dir: true });
      return run(ctx, "photo.export", clean({ ...a, outputDir: dir }), (d) => `Exported ${(d as { exported: number }).exported} photo(s) to ${dir}.`, 1800000);
    },
  });
  reg.define({ name: "photo_from_media_pool", category, description: "Create (or add to) a photo album from still images already in the media pool.", input: { album: z.string().min(1), photos: z.array(clipRef).min(1) }, handler: async (a, ctx) => run(ctx, "photo.create_album", { name: a.album, photos: a.photos }) });
}
