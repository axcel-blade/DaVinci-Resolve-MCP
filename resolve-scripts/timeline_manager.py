"""Timeline management (Module D)."""
from __future__ import annotations

import os

from ops import (check, ensure_parent_dir, fail, find_clip, has, is_transition, item_summary, media_pool, op, project,
                 require_method, timeline, timeline_item, timelines, to_plain, track_types)
from resolve_connection import get_resolve
from timecode import frames_to_tc, timeline_fps, timeline_is_drop

TIMELINE_SETTINGS = ["timelineResolutionWidth", "timelineResolutionHeight", "timelineFrameRate",
                     "timelineOutputResolutionWidth", "timelineOutputResolutionHeight", "useCustomSettings",
                     "timelineDropFrameTimecode", "timelineInterlaceProcessing"]


def summary(tl) -> dict:
    fps = timeline_fps(tl)
    dur = int(tl.GetEndFrame()) - int(tl.GetStartFrame())
    return {
        "name": tl.GetName(), "id": tl.GetUniqueId(),
        "startFrame": tl.GetStartFrame(), "endFrame": tl.GetEndFrame(),
        "startTimecode": tl.GetStartTimecode(),
        "durationFrames": dur, "durationSeconds": round(dur / fps, 3) if fps else None,
        "durationTimecode": frames_to_tc(max(dur, 0), fps, timeline_is_drop(tl)),
        "fps": fps,
        "tracks": {t: int(tl.GetTrackCount(t) or 0) for t in track_types()},
    }


@op("timeline.create")
def create(p):
    mp = media_pool()
    name = p["name"]
    if any(t.GetName() == name for t in timelines()):
        fail("ALREADY_EXISTS", f"A timeline named '{name}' already exists.")
    if p.get("clips"):
        clips = [find_clip(c) for c in p["clips"]]
        tl = check(mp.CreateTimelineFromClips(name, clips), "CreateTimelineFromClips")
    else:
        tl = check(mp.CreateEmptyTimeline(name), f"CreateEmptyTimeline('{name}')")
    applied = {}
    settings = p.get("settings") or {}
    if settings:
        tl.SetSetting("useCustomSettings", "1")
        for k, v in settings.items():
            applied[k] = {"ok": bool(tl.SetSetting(k, str(v))), "actual": tl.GetSetting(k)}
    project().SetCurrentTimeline(tl)
    return {"timeline": summary(tl), "settingsApplied": applied}


@op("timeline.delete")
def delete(p):
    tl = timeline(p["name"])
    name = tl.GetName()
    check(media_pool().DeleteTimelines([tl]), "DeleteTimelines")
    return {"deleted": name}


@op("timeline.duplicate")
def duplicate(p):
    tl = timeline(p.get("name"))
    require_method(tl, "DuplicateTimeline", "Duplicating timelines")
    new = check(tl.DuplicateTimeline(p["newName"]) if p.get("newName") else tl.DuplicateTimeline(), "DuplicateTimeline")
    return {"source": tl.GetName(), "timeline": summary(new)}


@op("timeline.rename")
def rename(p):
    tl = timeline(p.get("name"))
    old = tl.GetName()
    check(tl.SetName(p["newName"]), "SetName")
    return {"from": old, "to": tl.GetName()}


@op("timeline.open")
def open_tl(p):
    tl = timeline(p["name"])
    check(project().SetCurrentTimeline(tl), "SetCurrentTimeline")
    return summary(tl)


@op("timeline.list")
def list_tl(p):
    cur = project().GetCurrentTimeline()
    out = []
    for i, t in enumerate(timelines()):
        out.append({"index": i + 1, "name": t.GetName(), "id": t.GetUniqueId(),
                    "current": bool(cur and cur.GetUniqueId() == t.GetUniqueId())})
    return out


@op("timeline.info")
def info(p):
    tl = timeline(p.get("name"))
    out = summary(tl)
    out["markers"] = to_plain(tl.GetMarkers() or {})
    out["currentTimecode"] = tl.GetCurrentTimecode()
    return out


@op("timeline.get_settings")
def get_settings(p):
    tl = timeline(p.get("name"))
    keys = p.get("keys") or TIMELINE_SETTINGS
    return {k: tl.GetSetting(k) for k in keys}


@op("timeline.set_settings")
def set_settings(p):
    tl = timeline(p.get("name"))
    out = {}
    if p.get("useCustomSettings", True):
        tl.SetSetting("useCustomSettings", "1")
    for k, v in p["settings"].items():
        out[k] = {"requested": str(v), "ok": bool(tl.SetSetting(k, str(v))), "actual": tl.GetSetting(k)}
    return {"results": out, "failed": [k for k, r in out.items() if not r["ok"]]}


@op("timeline.add_track")
def add_track(p):
    tl = timeline(p.get("timeline"))
    tt = p["trackType"]
    before = int(tl.GetTrackCount(tt) or 0)
    if tt == "audio":
        sub = p.get("audioType", "stereo")
        ok = tl.AddTrack("audio", sub)
    else:
        ok = tl.AddTrack(tt)
    check(ok, f"AddTrack('{tt}')")
    after = int(tl.GetTrackCount(tt) or 0)
    if p.get("name") and has(tl, "SetTrackName"):
        tl.SetTrackName(tt, after, p["name"])
    return {"trackType": tt, "trackIndex": after, "before": before, "after": after}


@op("timeline.delete_track")
def delete_track(p):
    tl = timeline(p.get("timeline"))
    tt, ti = p["trackType"], int(p["trackIndex"])
    count = int(tl.GetTrackCount(tt) or 0)
    if ti < 1 or ti > count:
        fail("NOT_FOUND", f"{tt} track {ti} does not exist.")
    check(tl.DeleteTrack(tt, ti), f"DeleteTrack('{tt}', {ti})")
    return {"deleted": {"trackType": tt, "trackIndex": ti}, "remaining": int(tl.GetTrackCount(tt) or 0)}


@op("timeline.tracks")
def tracks(p):
    tl = timeline(p.get("timeline"))
    out = []
    for tt in track_types():
        for ti in range(1, int(tl.GetTrackCount(tt) or 0) + 1):
            out.append({
                "trackType": tt, "trackIndex": ti,
                "name": tl.GetTrackName(tt, ti) if has(tl, "GetTrackName") else None,
                "subType": tl.GetTrackSubType(tt, ti) if has(tl, "GetTrackSubType") else None,
                "enabled": tl.GetIsTrackEnabled(tt, ti) if has(tl, "GetIsTrackEnabled") else None,
                "locked": tl.GetIsTrackLocked(tt, ti) if has(tl, "GetIsTrackLocked") else None,
                "items": len(tl.GetItemListInTrack(tt, ti) or []),
            })
    return out


@op("timeline.set_track")
def set_track(p):
    tl = timeline(p.get("timeline"))
    tt, ti = p["trackType"], int(p["trackIndex"])
    res = {}
    if "enabled" in p and p["enabled"] is not None:
        res["enabled"] = bool(tl.SetTrackEnable(tt, ti, bool(p["enabled"])))
    if "locked" in p and p["locked"] is not None:
        res["locked"] = bool(tl.SetTrackLock(tt, ti, bool(p["locked"])))
    if p.get("name"):
        res["name"] = bool(tl.SetTrackName(tt, ti, p["name"]))
    return res


@op("timeline.clips")
def clips(p):
    tl = timeline(p.get("timeline"))
    want = [p["trackType"]] if p.get("trackType") else list(track_types())
    out = []
    for tt in want:
        n = int(tl.GetTrackCount(tt) or 0)
        idxs = [int(p["trackIndex"])] if p.get("trackIndex") else range(1, n + 1)
        for ti in idxs:
            n_clip = 0
            for it in tl.GetItemListInTrack(tt, ti) or []:
                if is_transition(it):
                    if p.get("includeTransitions", True):
                        out.append(item_summary(it, tt, ti, None))
                    continue
                n_clip += 1
                out.append(item_summary(it, tt, ti, n_clip))
    clips_only = [x for x in out if x.get("type") != "transition"]
    return {"timeline": tl.GetName(), "count": len(clips_only), "transitions": len(out) - len(clips_only), "items": out}


@op("timeline.set_start_timecode")
def set_start_tc(p):
    tl = timeline(p.get("timeline"))
    check(tl.SetStartTimecode(p["timecode"]), f"SetStartTimecode('{p['timecode']}')")
    return {"startTimecode": tl.GetStartTimecode()}


@op("timeline.set_playhead")
def set_playhead(p):
    tl = timeline(p.get("timeline"))
    tc = p.get("timecode")
    if tc is None:
        tc = frames_to_tc(int(p["frame"]), timeline_fps(tl), timeline_is_drop(tl))
    check(tl.SetCurrentTimecode(tc), f"SetCurrentTimecode('{tc}')")
    return {"currentTimecode": tl.GetCurrentTimecode()}


def _items_from_refs(tl, refs):
    return [timeline_item(r, tl) for r in refs]


@op("timeline.compound")
def compound(p):
    tl = timeline(p.get("timeline"))
    items = _items_from_refs(tl, p["items"])
    info = {"name": p["name"]} if p.get("name") else {}
    if p.get("startTimecode"):
        info["startTimecode"] = p["startTimecode"]
    created = check(tl.CreateCompoundClip(items, info), "CreateCompoundClip")
    return {"compound": item_summary(created), "replacedItems": len(items)}


@op("timeline.fusion_clip")
def fusion_clip(p):
    tl = timeline(p.get("timeline"))
    items = _items_from_refs(tl, p["items"])
    created = check(tl.CreateFusionClip(items), "CreateFusionClip")
    return {"fusionClip": item_summary(created)}


EXPORT_TYPES = {
    "edl": ("EXPORT_EDL", "EXPORT_NONE", ".edl"),
    "edl_cdl": ("EXPORT_EDL", "EXPORT_CDL", ".edl"),
    "edl_missing": ("EXPORT_EDL", "EXPORT_MISSING_CLIPS", ".edl"),
    "aaf_new": ("EXPORT_AAF", "EXPORT_AAF_NEW", ".aaf"),
    "aaf_existing": ("EXPORT_AAF", "EXPORT_AAF_EXISTING", ".aaf"),
    "fcp7xml": ("EXPORT_FCP_7_XML", None, ".xml"),
    "fcpxml": ("EXPORT_FCPXML_1_10", None, ".fcpxml"),
    "drt": ("EXPORT_DRT", None, ".drt"),
    "otio": ("EXPORT_OTIO", None, ".otio"),
    "csv": ("EXPORT_TEXT_CSV", None, ".csv"),
    "ale": ("EXPORT_ALE", None, ".ale"),
}


@op("timeline.export")
def export(p):
    tl = timeline(p.get("timeline"))
    r = get_resolve()
    fmt = p["format"]
    const, sub, ext = EXPORT_TYPES[fmt]
    if fmt == "fcpxml":
        # pick the newest FCPXML constant this Resolve build defines
        cands = sorted([a for a in dir(r) if a.startswith("EXPORT_FCPXML_")], reverse=True)
        if not cands:
            fail("UNSUPPORTED", "This Resolve build does not define any EXPORT_FCPXML_* constant.")
        const = cands[0]
    if not hasattr(r, const):
        fail("UNSUPPORTED", f"This Resolve build does not define {const}.")
    path = p["path"]
    if not os.path.splitext(path)[1]:
        path += ext
    if os.path.exists(path) and not p.get("overwrite"):
        fail("FILE_EXISTS", f"{path} already exists.")
    ensure_parent_dir(path)
    args = [path, getattr(r, const)]
    if sub:
        args.append(getattr(r, sub))
    check(tl.Export(*args), f"Timeline.Export({fmt})")
    if not os.path.isfile(path):
        fail("OPERATION_FAILED", f"Resolve reported success but {path} was not written.")
    return {"timeline": tl.GetName(), "format": fmt, "constant": const, "path": path, "bytes": os.path.getsize(path)}


@op("timeline.import")
def import_tl(p):
    path = p["path"]
    if not os.path.isfile(path):
        fail("FILE_NOT_FOUND", f"{path} does not exist.")
    opts = {}
    if p.get("name"):
        opts["timelineName"] = p["name"]
    if p.get("importSourceClips") is not None:
        opts["importSourceClips"] = bool(p["importSourceClips"])
    tl = check(media_pool().ImportTimelineFromFile(path, opts), "ImportTimelineFromFile")
    return summary(tl)


@op("timeline.add_marker")
def add_marker(p):
    tl = timeline(p.get("timeline"))
    frame = int(p["frame"])
    check(tl.AddMarker(frame, p.get("color", "Blue"), p.get("name", ""), p.get("note", ""), int(p.get("duration", 1)), p.get("customData", "")), "AddMarker")
    return {"markers": to_plain(tl.GetMarkers())}


@op("timeline.markers")
def markers(p):
    tl = timeline(p.get("timeline"))
    return to_plain(tl.GetMarkers() or {})


@op("timeline.detect_scene_cuts")
def detect_scene_cuts(p):
    tl = timeline(p.get("timeline"))
    require_method(tl, "DetectSceneCuts", "Scene cut detection")
    before = sum(len(tl.GetItemListInTrack("video", i) or []) for i in range(1, int(tl.GetTrackCount("video") or 0) + 1))
    check(tl.DetectSceneCuts(), "DetectSceneCuts")
    after = sum(len(tl.GetItemListInTrack("video", i) or []) for i in range(1, int(tl.GetTrackCount("video") or 0) + 1))
    return {"timeline": tl.GetName(), "videoItemsBefore": before, "videoItemsAfter": after, "cutsAdded": after - before}
