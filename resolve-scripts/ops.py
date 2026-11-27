"""Operation registry and shared helpers for the Resolve bridge.

Every operation is a plain function registered with @op("module.name"). It
receives a dict of already-validated parameters (validated by Zod on the
TypeScript side) and returns JSON-serialisable data. Operations call only
documented methods of the DaVinci Resolve scripting API (see
Support/Developer/Scripting/README.txt) and verify the API's return values;
a False/None return becomes an OPERATION_FAILED error, never fake success.
"""
from __future__ import annotations

import os
from typing import Any, Callable, Dict, List, Optional

from errors import ResolveError
from resolve_connection import get_resolve

OPS: Dict[str, Callable[[dict], Any]] = {}


def op(name: str):
    def deco(fn):
        OPS[name] = fn
        return fn

    return deco


def fail(code: str, message: str, details=None):
    raise ResolveError(code, message, details)


def check(result: Any, what: str) -> Any:
    """Resolve API methods return False/None on failure. Turn that into an error."""
    if result is None or result is False:
        fail("OPERATION_FAILED", f"DaVinci Resolve rejected the operation: {what}")
    return result


def has(obj: Any, method: str) -> bool:
    try:
        return callable(getattr(obj, method, None))
    except Exception:
        return False


def require_method(obj: Any, method: str, feature: str):
    if not has(obj, method):
        fail(
            "UNSUPPORTED",
            f"{feature} requires the scripting method {method}(), which this DaVinci Resolve version does not expose.",
        )


# ---------------------------------------------------------------- accessors

def resolve():
    return get_resolve()


def project_manager():
    return check(resolve().GetProjectManager(), "GetProjectManager")


def project():
    p = project_manager().GetCurrentProject()
    if not p:
        fail("NO_PROJECT", "No project is open in DaVinci Resolve. Open or create a project first.")
    return p


def media_pool():
    return check(project().GetMediaPool(), "GetMediaPool")


def timelines() -> List[Any]:
    p = project()
    out = []
    for i in range(1, int(p.GetTimelineCount() or 0) + 1):
        t = p.GetTimelineByIndex(i)
        if t:
            out.append(t)
    return out


def timeline(name: Optional[str] = None):
    """Current timeline, or a timeline by name or unique id."""
    p = project()
    if name:
        for t in timelines():
            if t.GetName() == name or t.GetUniqueId() == name:
                return t
        fail("NOT_FOUND", f"Timeline '{name}' not found in project '{p.GetName()}'.")
    t = p.GetCurrentTimeline()
    if not t:
        fail("NO_TIMELINE", "No timeline is open. Create or open a timeline first.")
    return t


def walk_folders(folder=None, path: str = "") -> List[tuple]:
    """[(path, folder)] for the media pool tree."""
    if folder is None:
        folder = check(media_pool().GetRootFolder(), "GetRootFolder")
    here = path or folder.GetName()
    out = [(here, folder)]
    for sub in folder.GetSubFolderList() or []:
        out.extend(walk_folders(sub, f"{here}/{sub.GetName()}"))
    return out


def find_folder(path: Optional[str], create: bool = False):
    """Find a bin by 'Master/Footage/Day1' style path (root name optional)."""
    root = check(media_pool().GetRootFolder(), "GetRootFolder")
    if not path:
        return root
    parts = [p for p in path.replace("\\", "/").split("/") if p]
    if parts and parts[0] == root.GetName():
        parts = parts[1:]
    cur = root
    for part in parts:
        nxt = next((f for f in (cur.GetSubFolderList() or []) if f.GetName() == part), None)
        if nxt is None:
            if not create:
                fail("NOT_FOUND", f"Bin '{path}' not found (missing '{part}').")
            nxt = check(media_pool().AddSubFolder(cur, part), f"AddSubFolder {part}")
        cur = nxt
    return cur


def all_clips() -> List[tuple]:
    out = []
    for path, folder in walk_folders():
        for c in folder.GetClipList() or []:
            out.append((path, c))
    return out


def find_clip(ref: str):
    """Find a media pool item by unique id, exact name or file path."""
    if not ref:
        fail("INVALID_ARGUMENT", "A clip id or name is required.")
    norm = os.path.normcase(os.path.normpath(ref)) if (":" in ref or "\\" in ref or "/" in ref) else None
    by_name = []
    for _, c in all_clips():
        if c.GetUniqueId() == ref:
            return c
        if c.GetName() == ref:
            by_name.append(c)
        elif norm:
            fp = c.GetClipProperty("File Path") or ""
            if fp and os.path.normcase(os.path.normpath(fp)) == norm:
                by_name.append(c)
    if len(by_name) == 1:
        return by_name[0]
    if len(by_name) > 1:
        fail("AMBIGUOUS", f"{len(by_name)} clips match '{ref}'. Use the clip id instead.",
             [c.GetUniqueId() for c in by_name])
    fail("NOT_FOUND", f"Media pool clip '{ref}' not found.")


def clip_summary(c, folder: Optional[str] = None) -> dict:
    props = {}
    try:
        props = c.GetClipProperty() or {}
    except Exception:
        props = {}
    keep = ["Clip Name", "File Path", "Type", "Duration", "FPS", "Resolution", "Video Codec",
            "Audio Codec", "Audio Ch", "Frames", "Start TC", "End TC", "Format", "Clip Color", "Proxy"]
    return {
        "id": c.GetUniqueId(),
        "name": c.GetName(),
        "bin": folder,
        "properties": {k: props.get(k) for k in keep if k in props},
    }


def track_types():
    return ("video", "audio", "subtitle")


def is_transition(it) -> bool:
    try:
        return has(it, "GetType") and it.GetType() == "transition"
    except Exception:
        return False


def clip_items(items):
    """Track items without transitions: itemIndex always counts clips only."""
    return [it for it in items if not is_transition(it)]


def timeline_item(p: dict, tl=None):
    """Locate a timeline item by {itemId} or {trackType, trackIndex, itemIndex} (1-based)."""
    tl = tl or timeline(p.get("timeline"))
    item_id = p.get("itemId")
    if item_id:
        for tt in track_types():
            for ti in range(1, int(tl.GetTrackCount(tt) or 0) + 1):
                for it in tl.GetItemListInTrack(tt, ti) or []:
                    if it.GetUniqueId() == item_id:
                        return it
        fail("NOT_FOUND", f"Timeline item '{item_id}' not found on timeline '{tl.GetName()}'.")
    tt = p.get("trackType", "video")
    ti = int(p.get("trackIndex", 1))
    ii = int(p.get("itemIndex", 1))
    count = int(tl.GetTrackCount(tt) or 0)
    if ti < 1 or ti > count:
        fail("NOT_FOUND", f"{tt} track {ti} does not exist (timeline has {count}).")
    items = clip_items(tl.GetItemListInTrack(tt, ti) or [])
    if ii < 1 or ii > len(items):
        fail("NOT_FOUND", f"{tt} track {ti} has {len(items)} item(s); item {ii} does not exist.")
    return items[ii - 1]


def item_summary(it, tt: str = "video", ti: int = 0, idx: int = 0) -> dict:
    out = {
        "id": it.GetUniqueId(),
        "name": it.GetName(),
        "type": it.GetType() if has(it, "GetType") else None,
        "trackType": tt,
        "trackIndex": ti,
        "itemIndex": idx,
        "start": it.GetStart(),
        "end": it.GetEnd(),
        "duration": it.GetDuration(),
    }
    for m in ("GetLeftOffset", "GetRightOffset", "GetSourceStartFrame", "GetSourceEndFrame"):
        if has(it, m):
            try:
                out[m[3].lower() + m[4:]] = getattr(it, m)()
            except Exception:
                pass
    mpi = it.GetMediaPoolItem() if has(it, "GetMediaPoolItem") else None
    out["mediaPoolItemId"] = mpi.GetUniqueId() if mpi else None
    return out


def to_plain(v: Any) -> Any:
    """Convert Resolve return values (dicts with int keys etc.) into JSON-safe data."""
    if isinstance(v, dict):
        return {str(k): to_plain(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [to_plain(x) for x in v]
    if isinstance(v, (str, int, float, bool)) or v is None:
        return v
    return str(v)


def ensure_parent_dir(path: str):
    d = os.path.dirname(os.path.abspath(path))
    if not os.path.isdir(d):
        os.makedirs(d, exist_ok=True)
