import { z } from "zod";
import { MARKER_COLORS } from "../config/constants.js";

/** Primitive schemas shared by tools, workflows and resources. */
export const AbsPath = z.string().min(3).max(1024).describe("Absolute local file path");
export const TimelineName = z.string().min(1).max(256).describe("Timeline name or id");
export const ClipRef = z.string().min(1).max(1024).describe("Media pool clip id, exact clip name, or file path");
export const HexColor = z.string().regex(/^#?[0-9a-fA-F]{6}$/).describe("Hex color like #ff8800");
export const TrackType = z.enum(["video", "audio", "subtitle"]);
export const MarkerColor = z.enum(MARKER_COLORS);
export const Confirm = z.boolean().optional().describe(
  "Destructive operation: must be true, and only after the user explicitly confirmed it. Without it the tool only explains what it would do.",
);
export const Background = z.boolean().optional().describe(
  "Run in the background: returns a jobId immediately; collect the result with wait_for_job / get_job.",
);

/** Locates a timeline item. Prefer itemId (from timeline_get_clips); otherwise track + 1-based index. */
export const ItemRefShape = {
  timeline: TimelineName.optional().describe("Timeline name or id (default: current timeline)"),
  itemId: z.string().optional().describe("Timeline item unique id (from timeline_get_clips)"),
  trackType: TrackType.default("video"),
  trackIndex: z.number().int().min(1).default(1),
  itemIndex: z.number().int().min(1).default(1).describe("1-based position of the clip on the track (transitions are not counted)"),
};
export const ItemRef = z.object(ItemRefShape);
export type ItemRef = z.infer<typeof ItemRef>;
