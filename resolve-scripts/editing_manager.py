"""Editing, titles, subtitles, effects and speed (Modules E-I).

The Resolve scripting API has no trim/split/move primitives for timeline
items. Those operations are implemented as a documented *re-placement*:
the item's media pool clip is re-appended with AppendToTimeline() using
explicit source ranges and record frames, after the original item is removed.
Item-level adjustments (grades, Fusion comps, transforms) on the original are
NOT carried over; the TypeScript layer marks these tools destructive.
"""
from __future__ import annotations

import os

from fusion_manager import add_tool, comp_for, insert_before_output, set_inputs, tool_info
from ops import (check, fail, find_clip, has, item_summary, media_pool, op, project, require_method,
                 timeline, timeline_item, to_plain)
from resolve_connection import get_resolve
from timecode import frames_to_tc, timeline_fps, timeline_is_drop

TRANSFORM_KEYS = ["Pan", "Tilt", "ZoomX", "ZoomY", "ZoomGang", "RotationAngle", "AnchorPointX", "AnchorPointY",
                  "Pitch", "Yaw", "FlipX", "FlipY", "CropLeft", "CropRight", "CropTop", "CropBottom",
                  "CropSoftness", "CropRetain", "DynamicZoomEase", "CompositeMode", "Opacity", "Distortion",
                  "RetimeProcess", "MotionEstimation", "Scaling", "ResizeFilter"]


def _place(mpi, src_start: int, src_end: int, track: int, record: int, media_type=None):
    """AppendToTimeline with an explicit range. src_end is exclusive here."""
    info = {"mediaPoolItem": mpi, "startFrame": int(src_start), "endFrame": int(src_end) - 1,
            "trackIndex": int(track), "recordFrame": int(record)}
    if media_type:
        info["mediaType"] = media_type
    items = media_pool().AppendToTimeline([info]) or []
    if not items:
        fail("OPERATION_FAILED", "AppendToTimeline did not place the clip.")
    return items


def _source_range(it):
    if has(it, "GetSourceStartFrame"):
        s = it.GetSourceStartFrame()
        e = it.GetSourceEndFrame()
        if s is not None and e is not None:
            return int(s), int(e) + 1
    left = int(it.GetLeftOffset() or 0)
    return left, left + int(it.GetDuration())


def _media_type(p):
    return 2 if p.get("trackType") == "audio" else 1


# ---------------------------------------------------------------- placement

@op("edit.append")
def append(p):
    tl = timeline(p.get("timeline"))
    entries = []
    for c in p["clips"]:
        mpi = find_clip(c["clip"])
        info = {"mediaPoolItem": mpi}
        for k_in, k_out in (("sourceStart", "startFrame"), ("trackIndex", "trackIndex"), ("recordFrame", "recordFrame")):
            if c.get(k_in) is not None:
                info[k_out] = int(c[k_in])
        if c.get("sourceEnd") is not None:
            info["endFrame"] = int(c["sourceEnd"]) - 1
            info.setdefault("startFrame", 0)
        if c.get("mediaType"):
            info["mediaType"] = 1 if c["mediaType"] == "video" else 2
        entries.append(info)
    items = media_pool().AppendToTimeline(entries) or []
    if not items:
        fail("OPERATION_FAILED", "AppendToTimeline placed no clips (check source ranges and track indices).")
    return {"timeline": tl.GetName(), "placed": [item_summary(i) for i in items]}


@op("edit.delete")
def delete(p):
    tl = timeline(p.get("timeline"))
    items = [timeline_item(r, tl) for r in p["items"]]
    names = [i.GetName() for i in items]
    check(tl.DeleteClips(items, bool(p.get("ripple", False))), "DeleteClips")
    return {"deleted": names, "ripple": bool(p.get("ripple", False))}


@op("edit.replace_at")
def replace_at(p):
    """Move/trim/split implementation: remove item, re-place ranges. Returns new items."""
    tl = timeline(p.get("timeline"))
    it = timeline_item(p, tl)
    mpi = it.GetMediaPoolItem()
    if mpi is None:
        fail("UNSUPPORTED", "This timeline item has no media pool clip (generator/title/compound); it cannot be re-placed via the API.")
    src_s, src_e = _source_range(it)
    start, end = int(it.GetStart()), int(it.GetEnd())
    track = int(p.get("trackIndex", 1))
    mtype = _media_type(p)
    action = p["action"]
    if action == "move":
        pieces = [(src_s, src_e, int(p.get("toTrack", track)), int(p["recordFrame"]))]
    elif action == "trim":
        ns = src_s + int(p.get("trimStart", 0))
        ne = src_e - int(p.get("trimEnd", 0))
        if ne <= ns:
            fail("INVALID_ARGUMENT", "Trim would leave zero or negative duration.")
        pieces = [(ns, ne, track, start + int(p.get("trimStart", 0)) if not p.get("ripple") else start)]
    elif action == "split":
        f = int(p["frame"])
        if not (start < f < end):
            fail("INVALID_ARGUMENT", f"Split frame {f} must be inside the item ({start}-{end}).")
        cut = src_s + (f - start)
        pieces = [(src_s, cut, track, start), (cut, src_e, track, f)]
    elif action == "set_in_out":
        ns, ne = int(p["sourceIn"]), int(p["sourceOut"])
        if ne <= ns:
            fail("INVALID_ARGUMENT", "sourceOut must be greater than sourceIn.")
        pieces = [(ns, ne, track, int(p.get("recordFrame", start)))]
    elif action == "duplicate":
        pieces = [(src_s, src_e, int(p.get("toTrack", track)), int(p.get("recordFrame", end)))]
    else:
        fail("INVALID_ARGUMENT", f"Unknown action {action}")
    original = item_summary(it)
    if action != "duplicate":
        check(tl.DeleteClips([it], False), "DeleteClips(original)")
    placed = []
    try:
        for s, e, trk, rec in pieces:
            placed.extend(_place(mpi, s, e, trk, rec, mtype))
    except Exception:
        if action != "duplicate":  # best-effort restore of the original placement
            try:
                _place(mpi, src_s, src_e, track, start, mtype)
            except Exception:
                pass
        raise
    return {"action": action, "original": original, "items": [item_summary(i) for i in placed],
            "note": "Item-level adjustments on the original item are not carried over by re-placement." if action != "duplicate" else None}


@op("edit.get_properties")
def get_properties(p):
    it = timeline_item(p)
    props = to_plain(it.GetProperty() or {})
    out = {"item": item_summary(it), "properties": props}
    if has(it, "GetClipEnabled"):
        out["enabled"] = it.GetClipEnabled()
    if has(it, "GetClipColor"):
        out["clipColor"] = it.GetClipColor()
    return out


@op("edit.set_properties")
def set_properties(p):
    it = timeline_item(p)
    res = {}
    for k, v in p["properties"].items():
        ok = it.SetProperty(k, v)
        res[k] = {"requested": v, "ok": bool(ok), "actual": to_plain(it.GetProperty(k))}
    return {"item": item_summary(it), "results": res, "failed": [k for k, r in res.items() if not r["ok"]]}


@op("edit.set_enabled")
def set_enabled(p):
    it = timeline_item(p)
    require_method(it, "SetClipEnabled", "Enabling/disabling clips")
    check(it.SetClipEnabled(bool(p["enabled"])), "SetClipEnabled")
    return {"item": it.GetName(), "enabled": it.GetClipEnabled()}


@op("edit.link")
def link(p):
    tl = timeline(p.get("timeline"))
    items = [timeline_item(r, tl) for r in p["items"]]
    check(tl.SetClipsLinked(items, bool(p["linked"])), "SetClipsLinked")
    return {"items": [i.GetName() for i in items], "linked": bool(p["linked"])}


@op("edit.set_item_color")
def set_item_color(p):
    it = timeline_item(p)
    if p.get("color"):
        check(it.SetClipColor(p["color"]), "SetClipColor")
    else:
        check(it.ClearClipColor(), "ClearClipColor")
    return {"item": it.GetName(), "color": it.GetClipColor()}


@op("edit.add_marker")
def item_marker(p):
    it = timeline_item(p)
    check(it.AddMarker(int(p["frame"]), p.get("color", "Blue"), p.get("name", ""), p.get("note", ""), int(p.get("duration", 1)), p.get("customData", "")), "AddMarker")
    return {"markers": to_plain(it.GetMarkers())}


# ---------------------------------------------------------------- generators & titles

def _seek(tl, p):
    if p.get("timecode"):
        check(tl.SetCurrentTimecode(p["timecode"]), "SetCurrentTimecode")
    elif p.get("frame") is not None:
        check(tl.SetCurrentTimecode(frames_to_tc(int(p["frame"]), timeline_fps(tl), timeline_is_drop(tl))), "SetCurrentTimecode")


@op("edit.insert_generator")
def insert_generator(p):
    tl = timeline(p.get("timeline"))
    _seek(tl, p)
    kind = p.get("kind", "standard")
    name = p["name"]
    fn = {"standard": "InsertGeneratorIntoTimeline", "fusion": "InsertFusionGeneratorIntoTimeline",
          "ofx": "InsertOFXGeneratorIntoTimeline"}[kind]
    require_method(tl, fn, "Inserting generators")
    it = getattr(tl, fn)(name)
    if not it:
        fail("UNSUPPORTED", f"Resolve could not insert the {kind} generator '{name}'. Check the exact name in the Effects Library.")
    return {"item": item_summary(it)}


def _text_tool(comp):
    tl = list((comp.GetToolList(False, "TextPlus") or {}).values())
    if not tl:
        tl = [t for t in (comp.GetToolList(False) or {}).values() if (t.GetAttrs() or {}).get("TOOLS_RegID") == "TextPlus"]
    if not tl:
        fail("NOT_FOUND", "No Text+ node found in the title's Fusion composition.")
    return tl[0]


def _hex(color):
    c = color.lstrip("#")
    return [int(c[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]


def style_inputs(style: dict) -> dict:
    """Translate a friendly style into Text+ input IDs (validated by readback)."""
    ins = {}
    if style.get("text") is not None:
        ins["StyledText"] = style["text"]
    if style.get("font"):
        ins["Font"] = style["font"]
    if style.get("fontStyle"):
        ins["Style"] = style["fontStyle"]
    if style.get("size") is not None:
        ins["Size"] = float(style["size"])
    if style.get("color"):
        r, g, b = _hex(style["color"])
        ins.update({"Red1": r, "Green1": g, "Blue1": b})
    if style.get("opacity") is not None:
        ins["Alpha1"] = float(style["opacity"])
    if style.get("position"):
        ins["Center"] = [float(style["position"][0]), float(style["position"][1])]
    if style.get("alignment"):
        ins["HorizontalJustificationNew"] = {"left": 0, "center": 1, "right": 2}[style["alignment"]]
    if style.get("tracking") is not None:
        ins["CharacterSpacingClone"] = float(style["tracking"])
    if style.get("lineSpacing") is not None:
        ins["LineSpacingClone"] = float(style["lineSpacing"])
    if style.get("background"):
        bg = style["background"]
        r, g, b = _hex(bg.get("color", "#000000"))
        ins.update({"Enabled4": 1, "Red4": r, "Green4": g, "Blue4": b, "Alpha4": float(bg.get("opacity", 0.75))})
    if style.get("outline"):
        r, g, b = _hex(style["outline"].get("color", "#000000"))
        ins.update({"Enabled2": 1, "Red2": r, "Green2": g, "Blue2": b, "Thickness2": float(style["outline"].get("thickness", 0.02))})
    if style.get("shadow"):
        ins.update({"Enabled3": 1})
    return ins


def _item_at(tl, frame: int, track=None):
    """Video item under an absolute timeline frame (topmost track first, or a given track)."""
    tracks = [int(track)] if track else list(range(int(tl.GetTrackCount("video") or 0), 0, -1))
    for ti in tracks:
        for idx, it in enumerate(tl.GetItemListInTrack("video", ti) or []):
            if int(it.GetStart()) <= frame < int(it.GetEnd()):
                return it, ti, idx + 1
    fail("NOT_FOUND", f"No video item at frame {frame}" + (f" on V{track}" if track else "") + ".")


@op("title.overlay")
def title_overlay(p):
    """Non-rippling title: Text+ merged over the clip inside the clip's Fusion composition."""
    tl = timeline(p.get("timeline"))
    frame = int(p["frame"]) if p.get("frame") is not None else int(tl.GetStartFrame())
    it, ti, idx = _item_at(tl, frame, p.get("trackIndex"))
    count = int(it.GetFusionCompCount() or 0)
    comp = it.GetFusionCompByIndex(1) if count else check(it.AddFusionComp(), "AddFusionComp")
    name = p.get("name") or "MCP_Title"
    base = name
    n = 1
    while comp.FindTool(name) is not None:
        n += 1
        name = f"{base}{n}"
    t = add_tool(comp, "TextPlus", name)
    merge = add_tool(comp, "Merge", f"{name}_Merge")
    chain = insert_before_output(comp, merge)
    check(merge.ConnectInput("Foreground", t), "ConnectInput Foreground")
    styled = set_inputs(t, style_inputs(p.get("style") or {"text": p.get("text", "")}))
    out = {"item": item_summary(it, "video", ti, idx), "textNode": tool_info(t), "mergeNode": tool_info(merge), "styled": styled, "chain": chain,
           "note": "Title is composited inside this clip's Fusion composition; it lasts for the clip's duration."}
    if p.get("animation"):
        out["animation"] = _animate(comp, t, p["animation"], tl)
    return out


@op("title.create")
def title_create(p):
    tl = timeline(p.get("timeline"))
    _seek(tl, p)
    kind = p.get("kind", "fusion")
    name = p.get("template") or ("Text+" if kind == "fusion" else "Text")
    if kind == "fusion":
        it = tl.InsertFusionTitleIntoTimeline(name)
    else:
        it = tl.InsertTitleIntoTimeline(name)
    if not it:
        fail("UNSUPPORTED", f"Resolve could not insert the title '{name}'. Check the template name in the Effects Library > Titles.")
    out = {"item": item_summary(it), "template": name}
    if kind == "fusion" and int(it.GetFusionCompCount() or 0) > 0:
        comp = it.GetFusionCompByIndex(1)
        t = _text_tool(comp)
        out["textNode"] = tool_info(t)
        out["styled"] = set_inputs(t, style_inputs(p.get("style") or {"text": p.get("text", "")}))
        if p.get("animation"):
            out["animation"] = _animate(comp, t, p["animation"], tl)
    if p.get("durationFrames"):
        out["note"] = "Title duration cannot be set through the scripting API; the default generator length was used."
    return out


@op("title.style")
def title_style(p):
    comp, it = comp_for(p, create=False)
    t = _text_tool(comp)
    res = set_inputs(t, style_inputs(p["style"]))
    return {"item": item_summary(it) if it else None, "results": res, "failed": [k for k, v in res.items() if not v["ok"]]}


@op("title.get")
def title_get(p):
    comp, it = comp_for(p, create=False)
    t = _text_tool(comp)
    keys = ["StyledText", "Font", "Style", "Size", "Red1", "Green1", "Blue1", "Center", "HorizontalJustificationNew"]
    return {"item": item_summary(it) if it else None, "inputs": {k: to_plain(t.GetInput(k)) for k in keys}}


def _animate(comp, t, anim, tl):
    """Simple text animations via keyframes on Text+ inputs."""
    kind = anim.get("type", "fade")
    dur = int(anim.get("frames", 15))
    s0 = float((comp.GetAttrs() or {}).get("COMPN_RenderStart", 0))  # comp frame of the clip's first frame
    comp.Lock()
    try:
        if kind == "fade":
            t.AddModifier("Alpha1", "BezierSpline")
            t.SetInput("Alpha1", 0.0, s0)
            t.SetInput("Alpha1", 1.0, s0 + dur)
        elif kind == "slide_up":
            t.AddModifier("Center", "XYPath")
            t.SetInput("Center", {1: 0.5, 2: 0.3}, s0)
            t.SetInput("Center", {1: 0.5, 2: 0.5}, s0 + dur)
        elif kind == "zoom":
            t.AddModifier("Size", "BezierSpline")
            base = float(t.GetInput("Size") or 0.08)
            t.SetInput("Size", base * 0.5, s0)
            t.SetInput("Size", base, s0 + dur)
        elif kind == "scroll":
            span = int(anim.get("frames", 240))
            t.AddModifier("Center", "XYPath")
            t.SetInput("Center", {1: 0.5, 2: -0.5}, s0)
            t.SetInput("Center", {1: 0.5, 2: 1.5}, s0 + span)
        elif kind == "typewriter":
            # Text+ "Write On" range: End input animated 0 -> 1
            t.AddModifier("End", "BezierSpline")
            t.SetInput("End", 0.0, s0)
            t.SetInput("End", 1.0, s0 + dur)
        else:
            fail("INVALID_ARGUMENT", f"Unknown animation '{kind}'.")
    finally:
        comp.Unlock()
    return {"type": kind, "frames": dur, "startFrame": s0}


@op("title.animate")
def title_animate(p):
    comp, it = comp_for(p, create=False)
    t = _text_tool(comp)
    return _animate(comp, t, p["animation"], None)


# ---------------------------------------------------------------- subtitles

def _subtitle_items(tl):
    out = []
    for ti in range(1, int(tl.GetTrackCount("subtitle") or 0) + 1):
        for i, it in enumerate(tl.GetItemListInTrack("subtitle", ti) or []):
            out.append((ti, i + 1, it))
    return out


@op("subtitle.create_track")
def sub_track(p):
    tl = timeline(p.get("timeline"))
    check(tl.AddTrack("subtitle"), "AddTrack('subtitle')")
    return {"subtitleTracks": int(tl.GetTrackCount("subtitle") or 0)}


@op("subtitle.get_all")
def sub_all(p):
    tl = timeline(p.get("timeline"))
    fps = timeline_fps(tl)
    return {"fps": fps, "subtitles": [
        {"track": ti, "index": idx, "id": it.GetUniqueId(), "text": it.GetName(),
         "start": it.GetStart(), "end": it.GetEnd()} for ti, idx, it in _subtitle_items(tl)]}


def _srt_time(frames: int, fps: float, offset: int) -> str:
    ms = int(round((frames - offset) * 1000.0 / fps))
    ms = max(ms, 0)
    h, rem = divmod(ms, 3600000)
    m, rem = divmod(rem, 60000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


@op("subtitle.export_srt")
def sub_export(p):
    tl = timeline(p.get("timeline"))
    fps = timeline_fps(tl)
    offset = int(tl.GetStartFrame())
    items = _subtitle_items(tl)
    if p.get("track"):
        items = [x for x in items if x[0] == int(p["track"])]
    if not items:
        fail("NOT_FOUND", "The timeline has no subtitle items to export.")
    path = p["path"]
    if os.path.exists(path) and not p.get("overwrite"):
        fail("FILE_EXISTS", f"{path} already exists.")
    lines = []
    for n, (_, _, it) in enumerate(sorted(items, key=lambda x: x[2].GetStart()), 1):
        lines += [str(n), f"{_srt_time(it.GetStart(), fps, offset)} --> {_srt_time(it.GetEnd(), fps, offset)}", it.GetName() or "", ""]
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))
    return {"path": path, "count": len(items)}


@op("subtitle.import")
def sub_import(p):
    """Import an SRT into the media pool and append it to the timeline (creates a subtitle track)."""
    tl = timeline(p.get("timeline"))
    path = p["path"]
    if not os.path.isfile(path):
        fail("FILE_NOT_FOUND", f"{path} does not exist.")
    before = len(_subtitle_items(tl))
    items = media_pool().ImportMedia([path]) or []
    if not items:
        fail("OPERATION_FAILED", "Resolve did not import the subtitle file.")
    placed = media_pool().AppendToTimeline([{"mediaPoolItem": items[0], "recordFrame": int(tl.GetStartFrame())}]) or []
    after = len(_subtitle_items(tl))
    if after <= before:
        return {"imported": True, "appended": False,
                "note": "Subtitle file is in the media pool but was not placed automatically. Drag it onto the timeline, or check that a subtitle track exists."}
    return {"imported": True, "appended": True, "subtitleItems": after - before}


@op("subtitle.generate")
def sub_generate(p):
    tl = timeline(p.get("timeline"))
    require_method(tl, "CreateSubtitlesFromAudio", "Auto subtitles (Resolve Studio AI)")
    r = get_resolve()
    settings = {}
    lang = p.get("language")
    if lang:
        const = f"AUTO_CAPTION_{lang.upper()}"
        if hasattr(r, const) and hasattr(r, "SUBTITLE_LANGUAGE"):
            settings[r.SUBTITLE_LANGUAGE] = getattr(r, const)
    if p.get("charsPerLine") and hasattr(r, "SUBTITLE_CHARS_PER_LINE"):
        settings[r.SUBTITLE_CHARS_PER_LINE] = int(p["charsPerLine"])
    if p.get("lines") and hasattr(r, "SUBTITLE_LINE_BREAK"):
        settings[r.SUBTITLE_LINE_BREAK] = r.AUTO_CAPTION_LINE_DOUBLE if int(p["lines"]) == 2 else r.AUTO_CAPTION_LINE_SINGLE
    if p.get("gapFrames") is not None and hasattr(r, "SUBTITLE_GAP"):
        settings[r.SUBTITLE_GAP] = int(p["gapFrames"])
    before = len(_subtitle_items(tl))
    ok = tl.CreateSubtitlesFromAudio(settings)
    if not ok:
        fail("OPERATION_FAILED", "CreateSubtitlesFromAudio returned False. This feature requires DaVinci Resolve Studio and audio on the timeline.")
    return {"subtitleItems": len(_subtitle_items(tl)), "added": len(_subtitle_items(tl)) - before}


# ---------------------------------------------------------------- effects & speed via Fusion

@op("effect.apply")
def effect_apply(p):
    comp, it = comp_for(p)
    t = add_tool(comp, p["effect"], p.get("name"))
    res = {"node": tool_info(t), "item": item_summary(it) if it else None}
    if p.get("parameters"):
        res["parameters"] = set_inputs(t, p["parameters"])
    res["chain"] = insert_before_output(comp, t)
    return res


@op("effect.remove")
def effect_remove(p):
    """Remove an effect node and reconnect its upstream to its downstream."""
    comp, _ = comp_for(p, create=False)
    t = comp.FindTool(p["node"])
    if t is None:
        fail("NOT_FOUND", f"Effect node '{p['node']}' not found.")
    info = tool_info(t)
    if info["type"] in ("MediaIn", "MediaOut"):
        fail("INVALID_ARGUMENT", "MediaIn/MediaOut are not effects.")
    from fusion_manager import main_input_name
    mi = main_input_name(t)
    upstream = getattr(t, mi).GetConnectedOutput() if mi and hasattr(t, mi) else None
    downstream = []
    for o in (t.GetOutputList() or {}).values():
        for inp in (o.GetConnectedInputs() or {}).values():
            downstream.append(inp)
    t.Delete()
    for inp in downstream:
        if upstream is not None:
            inp.ConnectTo(upstream)
    return {"removed": info, "reconnected": len(downstream) if upstream is not None else 0}


@op("effect.list_applied")
def effect_list_applied(p):
    comp, it = comp_for(p, create=False)
    return [tool_info(t) for t in (comp.GetToolList(False) or {}).values()
            if (t.GetAttrs() or {}).get("TOOLS_RegID") not in ("MediaIn", "MediaOut")]


@op("speed.retime_process")
def retime_process(p):
    it = timeline_item(p)
    mapping = {"project": 0, "nearest": 1, "frame_blend": 2, "optical_flow": 3}
    res = {"RetimeProcess": bool(it.SetProperty("RetimeProcess", mapping[p["process"]]))}
    if p.get("motionEstimation") is not None:
        res["MotionEstimation"] = bool(it.SetProperty("MotionEstimation", int(p["motionEstimation"])))
    return {"item": it.GetName(), "results": res, "actual": {k: it.GetProperty(k) for k in ("RetimeProcess", "MotionEstimation")}}


@op("speed.fusion")
def speed_fusion(p):
    """Speed effects with Fusion TimeSpeed / TimeStretcher nodes inside the clip's composition.

    The timeline item's length is unchanged (API limitation); the composition's
    source frames are remapped within it.
    """
    comp, it = comp_for(p)
    mode = p["mode"]
    comp.Lock()
    try:
        if mode == "constant":
            t = add_tool(comp, "TimeSpeed", p.get("name") or "MCP_Speed")
            r = set_inputs(t, {"Speed": float(p["speed"]), "InterpolateBetweenFrames": 1 if p.get("interpolate") else 0})
        elif mode == "freeze":
            t = add_tool(comp, "TimeStretcher", p.get("name") or "MCP_Freeze")
            t.AddModifier("SourceTime", "BezierSpline")
            t.SetInput("SourceTime", float(p["frame"]), 0)
            end = comp.GetAttrs().get("COMPN_RenderEnd", 100)
            t.SetInput("SourceTime", float(p["frame"]), float(end))
            r = {"SourceTime": {"ok": True, "value": p["frame"]}}
        elif mode in ("ramp", "reverse", "curve"):
            t = add_tool(comp, "TimeStretcher", p.get("name") or "MCP_Retime")
            a = comp.GetAttrs() or {}
            s0, s1 = float(a.get("COMPN_RenderStart", 0)), float(a.get("COMPN_RenderEnd", 100))
            t.AddModifier("SourceTime", "BezierSpline")
            if mode == "reverse":
                keys = [(s0, s1), (s1, s0)]
            else:
                keys = [(float(k["frame"]), float(k["sourceFrame"])) for k in p["keys"]]
            for at, src in keys:
                t.SetInput("SourceTime", src, at)
            r = {"keys": keys}
        else:
            fail("INVALID_ARGUMENT", f"Unknown speed mode {mode}")
    finally:
        comp.Unlock()
    chain = insert_before_output(comp, t)
    return {"item": item_summary(it) if it else None, "node": tool_info(t), "mode": mode, "results": r, "chain": chain,
            "limitation": "Timeline item duration is not changed by Fusion retiming; trim or extend the clip separately."}


@op("edit.stabilize")
def stabilize(p):
    it = timeline_item(p)
    require_method(it, "Stabilize", "Stabilization")
    check(it.Stabilize(), "Stabilize")
    return {"item": it.GetName(), "stabilized": True}


@op("edit.smart_reframe")
def smart_reframe(p):
    it = timeline_item(p)
    require_method(it, "SmartReframe", "Smart Reframe (Studio)")
    check(it.SmartReframe(), "SmartReframe")
    return {"item": it.GetName(), "reframed": True}


@op("edit.insert_audio_at_playhead")
def insert_audio(p):
    proj = project()
    require_method(proj, "InsertAudioToCurrentTrackAtPlayhead", "Inserting audio at playhead")
    if not os.path.isfile(p["path"]):
        fail("FILE_NOT_FOUND", f"{p['path']} does not exist.")
    check(proj.InsertAudioToCurrentTrackAtPlayhead(p["path"], int(p.get("startOffset", 0)), int(p.get("duration", 0))), "InsertAudioToCurrentTrackAtPlayhead")
    return {"inserted": p["path"]}
