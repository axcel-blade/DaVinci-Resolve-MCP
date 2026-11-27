"""Operations that use the DaVinci Resolve 20/21 scripting additions.

Verified live against DaVinci Resolve Studio 21.2 (see docs/SUPPORTED_FEATURES.md):
TimelineItem.AddTransition / SetSpeed / GetSpeed / SetLeftOffset / SetRightOffset /
AddEffect / GetEffects / DeleteEffects / AnalyzeAudioLevels / CopyAttributes / ApplyAutoColor / GetCDL,
Timeline.MoveItems / DeleteGaps / NormalizeAudioLevel / GetNormalizeAudioModes,
Resolve.GetEffectsList / IsStudio / GetFairlightPresets, Project.GenerateSpeech,
MediaPoolItem.AnalyzeForIntellisearch / GetTranscription, and the Photo Album API.
Every op checks the method exists first, so older versions get a clear UNSUPPORTED error.
"""
from __future__ import annotations

import os

from ops import (check, fail, find_clip, has, item_summary, media_pool, op, project, require_method,
                 resolve, timeline, timeline_item, to_plain, track_types)


# ---------------------------------------------------------------- effects

def _effects_list(media_type=None):
    r = resolve()
    require_method(r, "GetEffectsList", "Listing effects")
    return list((r.GetEffectsList(media_type) if media_type else r.GetEffectsList()) or [])


def _find_effect(name_or_id: str, media_type=None, category=None):
    want = name_or_id.lower()
    effects = _effects_list(media_type)
    if category:
        effects = [e for e in effects if e.get("category") == category]
    exact = [e for e in effects if e.get("id", "").lower() == want or e.get("name", "").lower() == want]
    if len(exact) >= 1:
        return exact[0]
    partial = [e for e in effects if want in e.get("name", "").lower()]
    if len(partial) == 1:
        return partial[0]
    if partial:
        fail("AMBIGUOUS", f"'{name_or_id}' matches {len(partial)} effects; use the exact name or id.", [e["name"] for e in partial[:20]])
    fail("NOT_FOUND", f"No installed effect named '{name_or_id}'. Use effect_list to see available effects.")


@op("fx.list")
def fx_list(p):
    effects = _effects_list(p.get("mediaType"))
    q = (p.get("query") or "").lower()
    if q:
        effects = [e for e in effects if q in e.get("name", "").lower() or q in e.get("id", "").lower()]
    if p.get("category"):
        effects = [e for e in effects if e.get("category") == p["category"]]
    return {"count": len(effects), "effects": effects}


@op("fx.add")
def fx_add(p):
    it = timeline_item(p)
    require_method(it, "AddEffect", "Adding effects")
    media_type = "audio" if p.get("trackType") == "audio" else p.get("mediaType")
    e = _find_effect(p["effect"], media_type, p.get("category"))
    added = it.AddEffect(e["category"], e["id"])
    if not added:
        fail("OPERATION_FAILED", f"Resolve could not apply '{e['name']}' to '{it.GetName()}'.")
    return {"item": item_summary(it, p.get("trackType", "video")), "effect": to_plain(added.GetInfo()) if has(added, "GetInfo") else e}


@op("fx.get")
def fx_get(p):
    it = timeline_item(p)
    require_method(it, "GetEffects", "Reading effects")
    out = []
    for cat in ([p["category"]] if p.get("category") else ["ofx", "fusion", "audio"]):
        for i, e in enumerate(it.GetEffects(cat) or []):
            info = to_plain(e.GetInfo()) if has(e, "GetInfo") else {}
            info.update({"enabled": e.GetIsEnabled() if has(e, "GetIsEnabled") else None, "index": e.GetIndex() if has(e, "GetIndex") else i})
            out.append(info)
    return {"item": it.GetName(), "effects": out}


@op("fx.delete")
def fx_delete(p):
    it = timeline_item(p)
    require_method(it, "DeleteEffects", "Removing effects")
    want = p["effect"].lower()
    hits = []
    for cat in ["ofx", "fusion", "audio"]:
        for e in it.GetEffects(cat) or []:
            info = e.GetInfo() if has(e, "GetInfo") else {}
            if want in (info.get("name", "").lower(), info.get("id", "").lower()):
                hits.append((e, info))
    if not hits:
        fail("NOT_FOUND", f"Effect '{p['effect']}' is not applied to '{it.GetName()}'.")
    check(it.DeleteEffects([h[0] for h in hits]), "DeleteEffects")
    return {"removed": [to_plain(h[1]) for h in hits]}


@op("fx.set_enabled")
def fx_set_enabled(p):
    it = timeline_item(p)
    want = p["effect"].lower()
    for cat in ["ofx", "fusion", "audio"]:
        for e in it.GetEffects(cat) or []:
            info = e.GetInfo() or {}
            if want in (info.get("name", "").lower(), info.get("id", "").lower()):
                check(e.SetIsEnabled(bool(p["enabled"])), "SetIsEnabled")
                return {"effect": to_plain(info), "enabled": e.GetIsEnabled()}
    fail("NOT_FOUND", f"Effect '{p['effect']}' is not applied to '{it.GetName()}'.")


# ---------------------------------------------------------------- transitions

@op("transition.add")
def transition_add(p):
    it = timeline_item(p)
    require_method(it, "AddTransition", "Adding transitions (Resolve 21+)")
    opts = {"type": p.get("type", "Cross Dissolve"), "category": p.get("category", "simple"),
            "position": p.get("position", "end"), "alignment": p.get("alignment", "center")}
    if p.get("duration"):
        opts["duration"] = int(p["duration"])
    tr = it.AddTransition(opts)
    if not tr:
        fail("OPERATION_FAILED", f"Resolve could not add '{opts['type']}' at the {opts['position']} of '{it.GetName()}' (needs handles / an adjacent edit, and a valid transition name).", opts)
    return {"transition": item_summary(tr, p.get("trackType", "video")), "options": opts, "on": it.GetName()}


def _transitions(tl, tt="video", ti=None):
    out = []
    tracks = [ti] if ti else range(1, int(tl.GetTrackCount(tt) or 0) + 1)
    for t in tracks:
        for idx, it in enumerate(tl.GetItemListInTrack(tt, t) or []):
            if has(it, "GetType") and it.GetType() == "transition":
                out.append((t, idx + 1, it))
    return out


@op("transition.list")
def transition_list(p):
    tl = timeline(p.get("timeline"))
    tt = p.get("trackType", "video")
    return [dict(item_summary(it, tt, t, i), name=it.GetName()) for t, i, it in _transitions(tl, tt, p.get("trackIndex"))]


@op("transition.remove")
def transition_remove(p):
    tl = timeline(p.get("timeline"))
    tt = p.get("trackType", "video")
    trs = _transitions(tl, tt, p.get("trackIndex"))
    if p.get("itemId"):
        trs = [x for x in trs if x[2].GetUniqueId() == p["itemId"]]
    if not trs:
        fail("NOT_FOUND", "No matching transition on the timeline.")
    names = [x[2].GetName() for x in trs]
    check(tl.DeleteClips([x[2] for x in trs], False), "DeleteClips(transitions)")
    return {"removed": names}


# ---------------------------------------------------------------- speed / position / trim

@op("speed.set_native")
def speed_set(p):
    it = timeline_item(p)
    require_method(it, "SetSpeed", "Changing clip speed (Resolve 21+)")
    opts = {"Percentage": float(p["percentage"])}
    for k_in, k_out in (("pitchCorrection", "PitchCorrection"), ("stretchKeyframes", "StretchKeyframesToFit"), ("ripple", "RippleTimeline")):
        if p.get(k_in) is not None:
            opts[k_out] = bool(p[k_in])
    before = item_summary(it, p.get("trackType", "video"))
    check(it.SetSpeed(opts), f"SetSpeed({opts})")
    return {"before": before, "after": item_summary(it, p.get("trackType", "video")), "speed": to_plain(it.GetSpeed())}


@op("speed.get_native")
def speed_get(p):
    it = timeline_item(p)
    require_method(it, "GetSpeed", "Reading clip speed")
    return {"item": item_summary(it, p.get("trackType", "video")), "speed": to_plain(it.GetSpeed())}


@op("edit.move")
def move(p):
    tl = timeline(p.get("timeline"))
    require_method(tl, "MoveItems", "Moving timeline items (Resolve 21+)")
    it = timeline_item(p, tl)
    pos = {}
    if p.get("recordFrame") is not None:
        pos["startFrame"] = float(p["recordFrame"])
    if p.get("toTrack") is not None:
        pos["trackIndex"] = int(p["toTrack"])
    before = item_summary(it, p.get("trackType", "video"))
    check(tl.MoveItems([it], pos, bool(p.get("moveLinked", True))), f"MoveItems({pos}) — the destination may be occupied")
    return {"before": before, "after": item_summary(it, p.get("trackType", "video"))}


@op("edit.trim")
def trim(p):
    """Trim with SetLeftOffset/SetRightOffset (offset = source frames available beyond the edit point)."""
    it = timeline_item(p)
    require_method(it, "SetLeftOffset", "Native trimming (Resolve 21+)")
    before = item_summary(it, p.get("trackType", "video"))
    linked = bool(p.get("updateLinked", True))
    res = {}
    if p.get("leftOffset") is not None or p.get("trimStart"):
        lo = float(p["leftOffset"]) if p.get("leftOffset") is not None else float(it.GetLeftOffset()) + float(p["trimStart"])
        res["left"] = bool(it.SetLeftOffset(lo, False, linked))
    if p.get("rightOffset") is not None or p.get("trimEnd"):
        ro = float(p["rightOffset"]) if p.get("rightOffset") is not None else float(it.GetRightOffset()) + float(p["trimEnd"])
        res["right"] = bool(it.SetRightOffset(ro, False, linked))
    if not res:
        fail("INVALID_ARGUMENT", "Nothing to trim.")
    if not all(res.values()):
        fail("OPERATION_FAILED", f"Resolve rejected the trim {res} (not enough source handles, or it would overlap another clip).", res)
    return {"before": before, "after": item_summary(it, p.get("trackType", "video"))}


@op("edit.delete_gaps")
def delete_gaps(p):
    tl = timeline(p.get("timeline"))
    require_method(tl, "DeleteGaps", "Deleting gaps (Resolve 21+)")
    before = int(tl.GetEndFrame())
    check(tl.DeleteGaps(), "DeleteGaps")
    return {"endFrameBefore": before, "endFrameAfter": int(tl.GetEndFrame())}


@op("edit.copy_attributes")
def copy_attributes(p):
    tl = timeline(p.get("timeline"))
    src = timeline_item(p["source"], tl)
    require_method(src, "CopyAttributes", "Paste Attributes (Resolve 21+)")
    targets = [timeline_item(t, tl) for t in p["targets"]]
    opts = dict(p.get("options") or {"allVideoAttributes": True})
    check(src.CopyAttributes(targets, opts), "CopyAttributes")
    return {"source": src.GetName(), "targets": [t.GetName() for t in targets], "options": opts}


@op("edit.export_frame")
def export_frame(p):
    it = timeline_item(p)
    require_method(it, "ExportFrame", "Exporting item frames")
    res = it.ExportFrame(int(p.get("frameOffset", 0)), {"outputType": "file", "filePath": p["path"]})
    if not res or not os.path.isfile(p["path"]):
        fail("OPERATION_FAILED", "ExportFrame did not write the file.", to_plain(res))
    return {"path": p["path"], "bytes": os.path.getsize(p["path"])}


# ---------------------------------------------------------------- audio

@op("audio.modes")
def audio_modes(p):
    tl = timeline(p.get("timeline"))
    require_method(tl, "GetNormalizeAudioModes", "Audio normalization")
    return {"modes": list(tl.GetNormalizeAudioModes() or [])}


@op("audio.normalize")
def audio_normalize(p):
    tl = timeline(p.get("timeline"))
    require_method(tl, "NormalizeAudioLevel", "Audio normalization (Resolve 21+)")
    if p.get("items"):
        items = [timeline_item(dict(r, trackType="audio"), tl) for r in p["items"]]
    else:
        items = []
        for ti in range(1, int(tl.GetTrackCount("audio") or 0) + 1):
            if p.get("trackIndex") and ti != int(p["trackIndex"]):
                continue
            items.extend(tl.GetItemListInTrack("audio", ti) or [])
    if not items:
        fail("NOT_FOUND", "No audio items to normalize.")
    modes = list(tl.GetNormalizeAudioModes() or [])
    mode = p.get("mode", "EBU R128")
    if modes and mode not in modes:
        fail("INVALID_ARGUMENT", f"Unknown normalization mode '{mode}'.", modes)
    opts = {"normalizationMode": mode}
    if p.get("targetLoudness") is not None:
        opts["targetLoudness"] = float(p["targetLoudness"])
    if p.get("targetLevel") is not None:
        opts["targetLevel"] = float(p["targetLevel"])
    check(tl.NormalizeAudioLevel(items, opts), f"NormalizeAudioLevel({opts})")
    return {"normalized": len(items), "options": opts}


@op("audio.analyze_levels")
def audio_levels(p):
    it = timeline_item(dict(p, trackType="audio"))
    require_method(it, "AnalyzeAudioLevels", "Audio level analysis (Resolve 21+)")
    std = p.get("standard", "EBU R128")
    res = it.AnalyzeAudioLevels(std)
    if not res:
        fail("OPERATION_FAILED", f"AnalyzeAudioLevels('{std}') returned nothing.")
    return {"item": item_summary(it, "audio"), "standard": std, "levels": to_plain(res)}


@op("audio.item_voice_isolation")
def item_voice_isolation(p):
    it = timeline_item(dict(p, trackType="audio"))
    props = {"AudioVoiceIsolationEnabled": bool(p.get("enabled", True)), "AudioVoiceIsolationAmount": int(p.get("amount", 60))}
    res = {k: {"ok": bool(it.SetProperty(k, v)), "actual": to_plain(it.GetProperty(k))} for k, v in props.items()}
    if not all(r["ok"] for r in res.values()):
        fail("UNSUPPORTED", "This Resolve version does not expose Voice Isolation item properties.", res)
    return {"item": it.GetName(), "results": res}


@op("audio.fairlight_presets")
def fairlight_presets(p):
    r = resolve()
    require_method(r, "GetFairlightPresets", "Fairlight presets")
    return {"presets": to_plain(r.GetFairlightPresets())}


@op("audio.apply_fairlight_preset")
def apply_fairlight_preset(p):
    proj = project()
    require_method(proj, "ApplyFairlightPresetToCurrentTimeline", "Applying Fairlight presets")
    check(proj.ApplyFairlightPresetToCurrentTimeline(p["preset"]), f"ApplyFairlightPresetToCurrentTimeline('{p['preset']}')")
    return {"applied": p["preset"]}


# ---------------------------------------------------------------- AI features

@op("ai.generate_speech")
def generate_speech(p):
    proj = project()
    require_method(proj, "GenerateSpeech", "AI Speech Generator (Resolve 21+)")
    text = p["text"]
    if len(text) > 350:
        fail("INVALID_ARGUMENT", "Resolve's AI Speech Generator accepts at most 350 characters per call.")
    s = {"TextInput": text, "VoiceModel": p.get("voice", "Female 1")}
    for k_in, k_out in (("speed", "Speed"), ("pitch", "Pitch"), ("variation", "Variation"), ("fileName", "Filename"), ("addToTimeline", "AddToTimeline"), ("audioTrack", "AudioTrack")):
        if p.get(k_in) is not None:
            s[k_out] = p[k_in]
    mpi = proj.GenerateSpeech(s, p["timecode"]) if p.get("timecode") else proj.GenerateSpeech(s)
    if not mpi:
        fail("UNSUPPORTED", "GenerateSpeech failed. It requires DaVinci Resolve Studio with the 'AI Speech Generator' Extra installed (Help > Extras).")
    return {"clip": {"id": mpi.GetUniqueId(), "name": mpi.GetName(), "filePath": mpi.GetClipProperty("File Path")}, "settings": s}


@op("ai.intellisearch_analyze")
def intellisearch(p):
    clips = [find_clip(c) for c in p["clips"]]
    out = []
    for c in clips:
        require_method(c, "AnalyzeForIntellisearch", "IntelliSearch analysis (Studio 21+)")
        out.append({"clip": c.GetName(), "ok": bool(c.AnalyzeForIntellisearch(bool(p.get("identifyFaces", False)), bool(p.get("better", False))))})
    return {"analyzed": out}


@op("ai.transcription")
def transcription(p):
    c = find_clip(p["clip"])
    require_method(c, "GetTranscription", "Reading transcriptions (Resolve 21+)")
    t = c.GetTranscription() or {}
    return {"clip": c.GetName(), "id": c.GetUniqueId(), "transcription": to_plain(t)}


@op("ai.all_transcripts")
def all_transcripts(p):
    from ops import all_clips
    out = []
    for _, c in all_clips():
        if not has(c, "GetTranscription"):
            break
        try:
            t = c.GetTranscription() or {}
        except Exception:
            t = {}
        segs = t.get("segments") or []
        if segs:
            out.append({"id": c.GetUniqueId(), "name": c.GetName(), "text": " ".join(str(s.get("text", "")) for s in segs)})
    return out


@op("color.auto_color")
def auto_color(p):
    it = timeline_item(p)
    require_method(it, "ApplyAutoColor", "Auto Color (Resolve 21+)")
    check(it.ApplyAutoColor(), "ApplyAutoColor")
    return {"item": it.GetName(), "autoColor": True}


@op("color.get_cdl")
def get_cdl(p):
    it = timeline_item(p)
    require_method(it, "GetCDL", "Reading CDL")
    return {"item": it.GetName(), "node": int(p.get("nodeIndex", 1)), "cdl": to_plain(it.GetCDL(int(p.get("nodeIndex", 1))))}


@op("color.node_label")
def node_label(p):
    it = timeline_item(p)
    g = it.GetNodeGraph() if has(it, "GetNodeGraph") else None
    if g is None or not has(g, "SetNodeLabel"):
        fail("UNSUPPORTED", "Node labels require Resolve 21+.")
    check(g.SetNodeLabel(int(p["nodeIndex"]), p["label"]), "SetNodeLabel")
    return {"node": p["nodeIndex"], "label": g.GetNodeLabel(int(p["nodeIndex"]))}


# ---------------------------------------------------------------- Photo page (Photo Album API)

def _albums():
    proj = project()
    require_method(proj, "GetPhotoAlbumCount", "The Photo page API (Resolve 21+)")
    return [proj.GetPhotoAlbumByIndex(i) for i in range(1, int(proj.GetPhotoAlbumCount() or 0) + 1)]


def _album(name=None):
    proj = project()
    albums = _albums()
    if name:
        for a in albums:
            if a.GetName() == name or a.GetUniqueId() == name:
                return a
        fail("NOT_FOUND", f"Photo album '{name}' not found.", [a.GetName() for a in albums])
    cur = proj.GetCurrentPhotoAlbum()
    if not cur:
        fail("NOT_FOUND", "No current photo album. Create one with photo_import.")
    return cur


def _photo(p):
    a = _album(p.get("album"))
    items = list(a.GetPhotoList() or [])
    ref = p.get("photo")
    if ref is None:
        fail("INVALID_ARGUMENT", "photo (name, id or 1-based index) is required.")
    if isinstance(ref, int) or str(ref).isdigit():
        i = int(ref)
        if i < 1 or i > len(items):
            fail("NOT_FOUND", f"Album '{a.GetName()}' has {len(items)} photo(s).")
        return a, items[i - 1]
    for it in items:
        if it.GetUniqueId() == ref or it.GetName() == ref:
            return a, it
    fail("NOT_FOUND", f"Photo '{ref}' not in album '{a.GetName()}'.")


def _photo_summary(it, i=None):
    out = {"index": i, "id": it.GetUniqueId(), "name": it.GetName()}
    if has(it, "GetRatings"):
        out["rating"] = it.GetRatings()
    return out


@op("photo.albums")
def photo_albums(p):
    proj = project()
    cur = proj.GetCurrentPhotoAlbum()
    return [{"name": a.GetName(), "id": a.GetUniqueId(), "photos": len(a.GetPhotoList() or []), "current": bool(cur and cur.GetUniqueId() == a.GetUniqueId())} for a in _albums()]


@op("photo.create_album")
def photo_create_album(p):
    mp = media_pool()
    require_method(mp, "CreatePhotoAlbumFromPhotos", "Creating photo albums (Resolve 21+)")
    clips = [find_clip(c) for c in p["photos"]]
    existing = next((a for a in _albums() if a.GetName() == p["name"]), None)
    if existing:
        project().SetCurrentPhotoAlbum(existing)
        added = mp.AddToPhotoAlbum(clips) or []
        return {"album": p["name"], "created": False, "added": len(added)}
    a = check(mp.CreatePhotoAlbumFromPhotos(p["name"], clips), "CreatePhotoAlbumFromPhotos")
    project().SetCurrentPhotoAlbum(a)
    return {"album": a.GetName(), "created": True, "photos": len(a.GetPhotoList() or [])}


@op("photo.list")
def photo_list(p):
    a = _album(p.get("album"))
    return {"album": a.GetName(), "photos": [_photo_summary(it, i + 1) for i, it in enumerate(a.GetPhotoList() or [])]}


@op("photo.info")
def photo_info(p):
    a, it = _photo(p)
    out = _photo_summary(it)
    out["album"] = a.GetName()
    out["properties"] = to_plain(it.GetProperties()) if has(it, "GetProperties") else None
    mpi = it.GetMediaPoolItem() if has(it, "GetMediaPoolItem") else None
    if mpi:
        out["file"] = mpi.GetClipProperty("File Path")
        out["resolution"] = mpi.GetClipProperty("Resolution")
    return out


@op("photo.set_properties")
def photo_set_properties(p):
    a, it = _photo(p)
    require_method(it, "SetProperties", "Photo properties")
    props = p["properties"]
    ok = it.SetProperties(props)
    if not ok:
        fail("OPERATION_FAILED", "Resolve rejected the photo properties (all keys and values are validated together).", props)
    cur = it.GetProperties() or {}
    return {"photo": it.GetName(), "applied": {k: to_plain(cur.get(k)) for k in props}}


@op("photo.set_cdl")
def photo_set_cdl(p):
    a, it = _photo(p)
    cdl = {"NodeIndex": str(int(p.get("nodeIndex", 1))),
           "Slope": " ".join(f"{v:.6f}" for v in p.get("slope", [1, 1, 1])),
           "Offset": " ".join(f"{v:.6f}" for v in p.get("offset", [0, 0, 0])),
           "Power": " ".join(f"{v:.6f}" for v in p.get("power", [1, 1, 1])),
           "Saturation": f"{float(p.get('saturation', 1.0)):.6f}"}
    if has(it, "AddVersion") and p.get("preserve", True):
        import time
        it.AddVersion(f"MCP {time.strftime('%Y%m%d-%H%M%S')}", 0)
    check(it.SetCDL(cdl), "SetCDL(photo)")
    return {"photo": it.GetName(), "cdl": cdl}


@op("photo.set_lut")
def photo_set_lut(p):
    from color_manager import stage_lut
    a, it = _photo(p)
    g = it.GetNodeGraph() if has(it, "GetNodeGraph") else None
    if g is None:
        fail("UNSUPPORTED", "Photo node graph not available.")
    rel = stage_lut(p["lutPath"])
    project().RefreshLUTList()
    check(g.SetLUT(int(p.get("nodeIndex", 1)), rel), f"SetLUT(photo, {rel})")
    return {"photo": it.GetName(), "lut": rel}


@op("photo.add_effect")
def photo_add_effect(p):
    a, it = _photo(p)
    require_method(it, "AddEffect", "Photo effects")
    e = _find_effect(p["effect"], "photo", p.get("category"))
    added = it.AddEffect(e["category"], e["id"])
    if not added:
        fail("OPERATION_FAILED", f"Could not apply '{e['name']}' to the photo.")
    return {"photo": it.GetName(), "effect": e}


@op("photo.set_rating")
def photo_set_rating(p):
    a, it = _photo(p)
    check(it.SetRatings(int(p["rating"])), "SetRatings")
    return {"photo": it.GetName(), "rating": it.GetRatings()}


@op("photo.auto_color")
def photo_auto_color(p):
    a, it = _photo(p)
    check(it.ApplyAutoColor(), "ApplyAutoColor(photo)")
    return {"photo": it.GetName(), "autoColor": True}


@op("photo.export")
def photo_export(p):
    a = _album(p.get("album"))
    items = list(a.GetPhotoList() or [])
    if p.get("photos"):
        want = set(str(x) for x in p["photos"])
        items = [it for i, it in enumerate(items) if str(i + 1) in want or it.GetName() in want or it.GetUniqueId() in want]
    if not items:
        fail("NOT_FOUND", "No photos to export.")
    os.makedirs(p["outputDir"], exist_ok=True)
    out = []
    for i, it in enumerate(items):
        stem = os.path.splitext(it.GetName())[0]
        path = os.path.join(p["outputDir"], f"{p.get('prefix', '')}{stem}.{p.get('format', 'jpg')}")
        if os.path.exists(path) and not p.get("overwrite"):
            fail("FILE_EXISTS", f"{path} already exists.")
        opts = {"outputType": "file", "filePath": path}
        if p.get("maxDimension"):
            opts["maxDimension"] = int(p["maxDimension"])
        if p.get("quality"):
            opts["quality"] = int(p["quality"])
        res = it.ExportFrame(opts)
        ok = os.path.isfile(path)
        out.append({"photo": it.GetName(), "path": path, "ok": ok, "bytes": os.path.getsize(path) if ok else 0, "result": to_plain(res)})
    failed = [o for o in out if not o["ok"]]
    if len(failed) == len(out):
        fail("OPERATION_FAILED", "No photo was exported.", out)
    return {"album": a.GetName(), "exported": len(out) - len(failed), "files": out}


@op("app.is_studio")
def is_studio(p):
    r = resolve()
    return {"studio": bool(r.IsStudio()) if has(r, "IsStudio") else None}
