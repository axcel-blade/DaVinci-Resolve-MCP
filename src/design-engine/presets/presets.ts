/** Reusable presets: cinematic looks (as LUT parameters) and delivery/export targets. */

export interface LookParams {
  exposure?: number;
  temperature?: number;
  tint?: number;
  lift?: [number, number, number];
  gamma?: [number, number, number];
  gain?: [number, number, number];
  contrast?: number;
  pivot?: number;
  saturation?: number;
  vibrance?: number;
  shadowsTint?: [number, number, number];
  highlightsTint?: [number, number, number];
  fade?: number;
  monochrome?: boolean;
}

export const COLOR_PRESETS: Record<string, { label: string; description: string; params: LookParams }> = {
  hollywood_cinematic: {
    label: "Hollywood cinematic", description: "Rich contrast, slightly cool shadows, warm skin highlights.",
    params: { contrast: 1.18, saturation: 0.95, shadowsTint: [-0.02, 0.0, 0.03], highlightsTint: [0.03, 0.015, -0.01], gamma: [1.0, 1.0, 1.02] },
  },
  teal_orange: {
    label: "Teal and orange", description: "Blockbuster split-tone: teal shadows, orange highlights.",
    params: { contrast: 1.15, saturation: 1.05, shadowsTint: [-0.05, 0.02, 0.06], highlightsTint: [0.06, 0.02, -0.05] },
  },
  filmic_warm: {
    label: "Filmic warm", description: "Gentle warmth, soft roll-off, lifted blacks.",
    params: { temperature: 0.35, contrast: 1.08, saturation: 0.97, fade: 0.03, highlightsTint: [0.02, 0.01, -0.01] },
  },
  vintage_film: {
    label: "Vintage film", description: "Faded blacks, warm mids, muted saturation.",
    params: { fade: 0.08, saturation: 0.78, temperature: 0.25, tint: 0.05, contrast: 0.92, shadowsTint: [0.02, 0.01, 0.03] },
  },
  black_and_white: {
    label: "Black and white", description: "Rec.709-weighted monochrome with punchy contrast.",
    params: { monochrome: true, contrast: 1.2 },
  },
  moody_cinematic: {
    label: "Moody cinematic", description: "Darker mids, desaturated, cool shadows.",
    params: { exposure: -0.25, contrast: 1.2, saturation: 0.8, shadowsTint: [-0.02, 0.0, 0.035], gamma: [0.95, 0.95, 0.97] },
  },
  bright_commercial: {
    label: "Bright commercial", description: "Clean, bright, saturated with neutral whites.",
    params: { exposure: 0.2, contrast: 1.05, saturation: 1.12, vibrance: 0.2 },
  },
  natural_documentary: {
    label: "Natural documentary", description: "Subtle contrast and saturation lift; true-to-life.",
    params: { contrast: 1.04, saturation: 1.03, vibrance: 0.1 },
  },
  desaturated_cinematic: {
    label: "Desaturated cinematic", description: "Bleach-bypass feel: low saturation, high contrast.",
    params: { saturation: 0.6, contrast: 1.25, fade: 0.01 },
  },
  night_cinematic: {
    label: "Night cinematic", description: "Day-for-night style: cool, underexposed, low saturation.",
    params: { exposure: -0.6, temperature: -0.45, saturation: 0.7, contrast: 1.1, shadowsTint: [-0.01, 0.0, 0.04] },
  },
};

export interface ExportPreset {
  label: string;
  format: string;
  codecCandidates: string[];
  width: number;
  height: number;
  frameRate?: string;
  quality?: number | string;
  extension: string;
  audio?: boolean;
  video?: boolean;
  notes?: string;
}

/** Codec names are matched against GetRenderCodecs() at run time, never assumed. */
export const EXPORT_PRESETS: Record<string, ExportPreset> = {
  youtube_1080p: { label: "YouTube 1080p", format: "mp4", codecCandidates: ["H264", "H.264"], width: 1920, height: 1080, extension: "mp4" },
  youtube_4k: { label: "YouTube 4K", format: "mp4", codecCandidates: ["H265", "H.265", "H264"], width: 3840, height: 2160, extension: "mp4" },
  tiktok: { label: "TikTok 1080x1920", format: "mp4", codecCandidates: ["H264", "H.264"], width: 1080, height: 1920, extension: "mp4" },
  instagram_reels: { label: "Instagram Reels", format: "mp4", codecCandidates: ["H264", "H.264"], width: 1080, height: 1920, extension: "mp4" },
  instagram_stories: { label: "Instagram Stories", format: "mp4", codecCandidates: ["H264", "H.264"], width: 1080, height: 1920, extension: "mp4" },
  instagram_feed: { label: "Instagram Feed (4:5)", format: "mp4", codecCandidates: ["H264", "H.264"], width: 1080, height: 1350, extension: "mp4" },
  facebook: { label: "Facebook Video", format: "mp4", codecCandidates: ["H264", "H.264"], width: 1920, height: 1080, extension: "mp4" },
  professional_master: { label: "Professional Master (ProRes 422 HQ / DNxHR HQX)", format: "mov", codecCandidates: ["ProRes422HQ", "ProRes 422 HQ", "DNxHR HQX", "DNxHR"], width: 0, height: 0, extension: "mov", notes: "Uses timeline resolution. ProRes encoding on Windows depends on your Resolve version." },
  archive: { label: "High-quality Archive", format: "mov", codecCandidates: ["DNxHR 444", "DNxHR HQX", "ProRes4444", "ProRes422HQ"], width: 0, height: 0, extension: "mov" },
  png_sequence: { label: "PNG sequence", format: "png", codecCandidates: ["RGBA", "RGB", "PNG"], width: 0, height: 0, extension: "png" },
  tiff_sequence: { label: "TIFF sequence", format: "tif", codecCandidates: ["RGB16", "RGB", "TIFF"], width: 0, height: 0, extension: "tif" },
  exr_sequence: { label: "EXR sequence", format: "exr", codecCandidates: ["RGBHalf", "RGBAHalf", "EXR"], width: 0, height: 0, extension: "exr" },
  audio_wav: { label: "Audio only (WAV)", format: "wav", codecCandidates: ["LinearPCM", "PCM"], width: 0, height: 0, extension: "wav", video: false },
  custom: { label: "Custom Export", format: "mp4", codecCandidates: ["H264"], width: 0, height: 0, extension: "mp4", notes: "Override format/codec/size via arguments." },
};

export const ASPECTS: Record<string, { width: number; height: number; preset: string }> = {
  "16:9": { width: 1920, height: 1080, preset: "youtube_1080p" },
  "9:16": { width: 1080, height: 1920, preset: "tiktok" },
  "1:1": { width: 1080, height: 1080, preset: "instagram_feed" },
  "4:5": { width: 1080, height: 1350, preset: "instagram_feed" },
};
