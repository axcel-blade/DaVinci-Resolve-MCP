"""Color page automation.

The scripting API exposes: CDL (slope/offset/power/saturation) per node,
LUTs per node, node graph inspection/enable (Resolve 19+), grade versions,
CopyGrades, DRX grade application, color groups, Magic Mask and LUT export.
Primary wheels, curves, qualifiers and windows are not scriptable; looks that
need them are generated as 3D LUTs (see lut_generator.py) and applied with SetLUT.
"""
from __future__ import annotations

import os
import shutil
import time

from lut_generator import write_cube
from ops import check, fail, has, item_summary, op, project, require_method, timeline, timeline_item, to_plain
from resolve_connection import get_resolve


def _graph(it):
    if has(it, "GetNodeGraph"):
        g = it.GetNodeGraph()
        if g:
            return g
    return None


def _preserve(it, p) -> dict:
    """Create a new local color version before changes so the previous grade stays recoverable."""
    if not p.get("preserve", True) or not has(it, "AddVersion"):
        return {"preserved": False}
    before = it.GetCurrentVersion() if has(it, "GetCurrentVersion") else None
    name = f"MCP {time.strftime('%Y%m%d-%H%M%S')}"
    ok = it.AddVersion(name, 0)
    return {"preserved": bool(ok), "previousVersion": to_plain(before), "newVersion": name if ok else None,
            "note": "Revert with color_version_load using previousVersion." if ok else "AddVersion failed; grade not preserved."}


@op("color.nodes")
def nodes(p):
    it = timeline_item(p)
    g = _graph(it)
    if g is None:
        fail("UNSUPPORTED", "Node graph access requires DaVinci Resolve 19 or later (TimelineItem.GetNodeGraph).")
    out = []
    for i in range(1, int(g.GetNumNodes() or 0) + 1):
        n = {"index": i, "label": g.GetNodeLabel(i) if has(g, "GetNodeLabel") else None,
             "lut": g.GetLUT(i) if has(g, "GetLUT") else None,
             "tools": list(g.GetToolsInNode(i) or []) if has(g, "GetToolsInNode") else None}
        out.append(n)
    return {"item": item_summary(it), "nodes": out}


@op("color.node_enabled")
def node_enabled(p):
    it = timeline_item(p)
    g = _graph(it)
    if g is None or not has(g, "SetNodeEnabled"):
        fail("UNSUPPORTED", "Enabling/disabling nodes requires Resolve 19.1+ (Graph.SetNodeEnabled).")
    check(g.SetNodeEnabled(int(p["nodeIndex"]), bool(p["enabled"])), "SetNodeEnabled")
    return {"node": p["nodeIndex"], "enabled": bool(p["enabled"])}


@op("color.set_cdl")
def set_cdl(p):
    it = timeline_item(p)
    keep = _preserve(it, p)
    cdl = {
        "NodeIndex": str(int(p.get("nodeIndex", 1))),
        "Slope": " ".join(f"{v:.6f}" for v in p.get("slope", [1, 1, 1])),
        "Offset": " ".join(f"{v:.6f}" for v in p.get("offset", [0, 0, 0])),
        "Power": " ".join(f"{v:.6f}" for v in p.get("power", [1, 1, 1])),
        "Saturation": f"{float(p.get('saturation', 1.0)):.6f}",
    }
    check(it.SetCDL(cdl), "SetCDL")
    return {"item": item_summary(it), "cdl": cdl, "version": keep}


def resolve_lut_root() -> str:
    if os.name == "nt":
        return os.path.join(os.environ.get("PROGRAMDATA", r"C:\ProgramData"), "Blackmagic Design", "DaVinci Resolve", "Support", "LUT")
    return "/Library/Application Support/Blackmagic Design/DaVinci Resolve/LUT"


def stage_lut(path: str) -> str:
    """Resolve (verified on 21.x) only accepts LUTs inside its LUT folders: copy others into LUT/MCP.

    Returns the path relative to the LUT root, which SetLUT accepts.
    """
    root = resolve_lut_root()
    ap = os.path.normcase(os.path.abspath(path))
    if ap.startswith(os.path.normcase(os.path.abspath(root)) + os.sep):
        return os.path.relpath(path, root)
    dst_dir = os.path.join(root, "MCP")
    os.makedirs(dst_dir, exist_ok=True)
    dst = os.path.join(dst_dir, os.path.basename(path))
    if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(path):
        shutil.copyfile(path, dst)
    return os.path.join("MCP", os.path.basename(path))


@op("color.set_lut")
def set_lut(p):
    it = timeline_item(p)
    path = p["lutPath"]
    if not os.path.isfile(path):
        fail("FILE_NOT_FOUND", f"LUT {path} does not exist.")
    try:
        rel = stage_lut(path)
    except OSError as e:
        fail("PERMISSION_DENIED", f"Could not copy the LUT into Resolve's LUT folder ({e}).")
    keep = _preserve(it, p)
    proj = project()
    if has(proj, "RefreshLUTList"):
        proj.RefreshLUTList()
    idx = int(p.get("nodeIndex", 1))
    g = _graph(it)
    ok = g.SetLUT(idx, rel) if g is not None and has(g, "SetLUT") else it.SetLUT(idx, rel)
    check(ok, f"SetLUT(node {idx}, {rel})")
    actual = g.GetLUT(idx) if g is not None and has(g, "GetLUT") else None
    return {"item": item_summary(it), "node": idx, "lut": path, "resolveLut": rel, "actual": actual, "version": keep}


@op("color.generate_lut")
def generate_lut(p):
    path = p["path"]
    if os.path.exists(path) and not p.get("overwrite"):
        fail("FILE_EXISTS", f"{path} already exists.")
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    info = write_cube(path, p.get("params") or {}, int(p.get("size", 33)), p.get("title") or os.path.basename(path))
    return info


@op("color.copy_grade")
def copy_grade(p):
    tl = timeline(p.get("timeline"))
    src = timeline_item(p["source"], tl)
    targets = [timeline_item(t, tl) for t in p["targets"]]
    check(src.CopyGrades(targets), "CopyGrades")
    return {"source": src.GetName(), "targets": [t.GetName() for t in targets]}


@op("color.apply_drx")
def apply_drx(p):
    tl = timeline(p.get("timeline"))
    if not os.path.isfile(p["path"]):
        fail("FILE_NOT_FOUND", f"{p['path']} does not exist.")
    items = [timeline_item(t, tl) for t in p["items"]]
    mode = {"none": 0, "source_timecode": 1, "start_frames": 2}[p.get("keyframeMode", "none")]
    check(tl.ApplyGradeFromDRX(p["path"], mode, items), "ApplyGradeFromDRX")
    return {"drx": p["path"], "items": [i.GetName() for i in items]}


@op("color.versions")
def versions(p):
    it = timeline_item(p)
    return {"current": to_plain(it.GetCurrentVersion()),
            "local": list(it.GetVersionNameList(0) or []), "remote": list(it.GetVersionNameList(1) or [])}


@op("color.version_load")
def version_load(p):
    it = timeline_item(p)
    check(it.LoadVersionByName(p["name"], 1 if p.get("remote") else 0), f"LoadVersionByName('{p['name']}')")
    return {"current": to_plain(it.GetCurrentVersion())}


@op("color.version_add")
def version_add(p):
    it = timeline_item(p)
    check(it.AddVersion(p["name"], 1 if p.get("remote") else 0), "AddVersion")
    return {"current": to_plain(it.GetCurrentVersion())}


@op("color.magic_mask")
def magic_mask(p):
    it = timeline_item(p)
    require_method(it, "CreateMagicMask", "Magic Mask (Studio)")
    mode = {"forward": "F", "backward": "B", "bidirectional": "BI"}[p.get("mode", "bidirectional")]
    check(it.CreateMagicMask(mode), "CreateMagicMask")
    return {"item": it.GetName(), "mode": mode,
            "note": "Magic Mask tracks the strokes already drawn on the current node; draw them in the Color page first."}


@op("color.export_lut")
def export_lut(p):
    it = timeline_item(p)
    r = get_resolve()
    kind = {"17": "EXPORT_LUT_17PTCUBE", "33": "EXPORT_LUT_33PTCUBE", "65": "EXPORT_LUT_65PTCUBE", "panasonic": "EXPORT_LUT_PANASONICVLUT"}[p.get("size", "33")]
    if not hasattr(r, kind):
        fail("UNSUPPORTED", f"{kind} not defined in this Resolve build.")
    if os.path.exists(p["path"]) and not p.get("overwrite"):
        fail("FILE_EXISTS", f"{p['path']} already exists.")
    check(it.ExportLUT(getattr(r, kind), p["path"]), "ExportLUT")
    return {"path": p["path"], "exists": os.path.isfile(p["path"])}


@op("color.groups")
def groups(p):
    proj = project()
    require_method(proj, "GetColorGroupsList", "Color groups")
    return [g.GetName() for g in (proj.GetColorGroupsList() or [])]


@op("color.assign_group")
def assign_group(p):
    proj = project()
    it = timeline_item(p)
    grp = next((g for g in (proj.GetColorGroupsList() or []) if g.GetName() == p["group"]), None)
    if grp is None:
        if not p.get("create", True):
            fail("NOT_FOUND", f"Color group '{p['group']}' not found.")
        grp = check(proj.AddColorGroup(p["group"]), "AddColorGroup")
    check(it.AssignToColorGroup(grp), "AssignToColorGroup")
    return {"item": it.GetName(), "group": grp.GetName()}


@op("color.reset")
def reset(p):
    it = timeline_item(p)
    g = _graph(it)
    if g is None or not has(g, "ResetAllGrades"):
        fail("UNSUPPORTED", "Resetting grades requires Resolve 19+ (Graph.ResetAllGrades).")
    keep = _preserve(it, p)
    check(g.ResetAllGrades(), "ResetAllGrades")
    return {"item": it.GetName(), "version": keep}


@op("color.grab_still")
def grab_still(p):
    tl = timeline(p.get("timeline"))
    s = check(tl.GrabStill(), "GrabStill")
    out = {"grabbed": True}
    if p.get("exportFolder"):
        gal = project().GetGallery()
        album = gal.GetCurrentStillAlbum()
        os.makedirs(p["exportFolder"], exist_ok=True)
        check(album.ExportStills([s], p["exportFolder"], p.get("prefix", "still"), p.get("format", "png")), "ExportStills")
        out["exportFolder"] = p["exportFolder"]
    return out


@op("color.export_frame")
def export_frame(p):
    proj = project()
    require_method(proj, "ExportCurrentFrameAsStill", "Exporting the current frame")
    if os.path.exists(p["path"]) and not p.get("overwrite"):
        fail("FILE_EXISTS", f"{p['path']} already exists.")
    os.makedirs(os.path.dirname(os.path.abspath(p["path"])), exist_ok=True)
    check(proj.ExportCurrentFrameAsStill(p["path"]), "ExportCurrentFrameAsStill")
    if not os.path.isfile(p["path"]):
        fail("OPERATION_FAILED", "Resolve reported success but no still was written.")
    return {"path": p["path"], "bytes": os.path.getsize(p["path"])}
