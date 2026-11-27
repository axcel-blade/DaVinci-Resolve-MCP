import { AbsPath, ClipRef, HexColor, ItemRef as ItemRefObject, ItemRefShape, TimelineName } from "../../schemas/index.js";

/** Tool-argument building blocks (thin aliases over src/schemas so tool modules read naturally). */
export const absPath = AbsPath;
export const timelineArg = TimelineName.optional().describe("Timeline name or id (default: current timeline)");
export const clipRef = ClipRef;
export const hexColor = HexColor;

/** Locates a timeline item (raw shape, spread into tool inputs). Prefer itemId; otherwise track + 1-based index. */
export const ItemRef = ItemRefShape;
export const ItemRefSchema = ItemRefObject;

/** Strip undefined so Python receives only provided keys. */
export function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Extract the timeline item reference fields from tool args. */
export function itemRef(a: { timeline?: string; itemId?: string; trackType?: string; trackIndex?: number; itemIndex?: number }) {
  return clean({ timeline: a.timeline, itemId: a.itemId, trackType: a.trackType, trackIndex: a.trackIndex, itemIndex: a.itemIndex });
}
