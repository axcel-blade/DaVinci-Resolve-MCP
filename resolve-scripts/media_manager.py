"""Media pool management (Module C). Never touches files on disk except reading them."""
from __future__ import annotations

import os
import re

from ops import (all_clips, check, clip_summary, fail, find_clip, find_folder, has, media_pool, op,
                 require_method, to_plain, walk_folders)

VIDEO_EXT = {".mp4", ".mov", ".avi", ".mxf", ".mkv", ".m4v", ".mts", ".m2ts", ".braw", ".r3d", ".ari", ".webm", ".dng", ".crm"}
AUDIO_EXT = {".wav", ".mp3", ".aif", ".aiff", ".flac", ".m4a", ".aac", ".ogg", ".bwf"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".exr", ".dpx", ".bmp", ".tga", ".psd", ".heic", ".webp", ".cr2", ".cr3", ".nef", ".arw"}
SUB_EXT = {".srt", ".vtt", ".xml", ".ttml"}
CLIP_COLORS = ["Orange", "Apricot", "Yellow", "Lime", "Olive", "Green", "Teal", "Navy", "Blue", "Purple", "Violet", "Pink", "Tan", "Beige", "Brown", "Chocolate"]
FLAG_COLORS = ["Blue", "Cyan", "Green", "Yellow", "Red", "Pink", "Purple", "Fuchsia", "Rose", "Lavender", "Sky", "Mint", "Lemon", "Sand", "Cocoa", "Cream"]


def _set_bin(p):
    if p.get("bin"):
        folder = find_folder(p["bin"], create=True)
        check(media_pool().SetCurrentFolder(folder), "SetCurrentFolder")
        return folder
    return media_pool().GetCurrentFolder()


def _import(paths, p):
    missing = [x for x in paths if not os.path.exists(x)]
    if missing:
        fail("FILE_NOT_FOUND", f"{len(missing)} path(s) do not exist.", missing[:20])
    folder = _set_bin(p)
    if p.get("asStills"):
        # Resolve groups numbered images (IMG_0001.jpg, IMG_0002.jpg) into one image sequence when
        # imported together (verified on 21.2). Importing one file per call keeps them as stills.
        items = []
        for x in paths:
            items.extend(media_pool().ImportMedia([x]) or [])
    else:
        items = media_pool().ImportMedia(paths) or []
    if not items:
        fail("OPERATION_FAILED", "Resolve imported no clips. The files may be unsupported or already in the bin.", paths[:20])
    return {"bin": folder.GetName() if folder else None, "requested": len(paths), "imported": len(items),
            "clips": [clip_summary(c) for c in items]}


@op("media.import")
def import_media(p):
    return _import(list(p["paths"]), p)


@op("media.import_folder")
def import_folder(p):
    root = p["path"]
    if not os.path.isdir(root):
        fail("FILE_NOT_FOUND", f"Folder {root} does not exist.")
    kinds = set(p.get("types") or ["video", "audio", "image"])
    exts = set()
    if "video" in kinds: exts |= VIDEO_EXT
    if "audio" in kinds: exts |= AUDIO_EXT
    if "image" in kinds: exts |= IMAGE_EXT
    files = []
    walker = os.walk(root) if p.get("recursive", True) else [(root, [], os.listdir(root))]
    for d, _, names in walker:
        for n in sorted(names):
            if os.path.splitext(n)[1].lower() in exts:
                files.append(os.path.join(d, n))
    if not files:
        fail("NO_MEDIA", f"No supported media found in {root}.")
    if p.get("organizeByType"):
        out = {"bins": {}, "imported": 0}
        groups = {"Video": [f for f in files if os.path.splitext(f)[1].lower() in VIDEO_EXT],
                  "Audio": [f for f in files if os.path.splitext(f)[1].lower() in AUDIO_EXT],
                  "Images": [f for f in files if os.path.splitext(f)[1].lower() in IMAGE_EXT]}
        base = p.get("bin") or ""
        for name, group in groups.items():
            if group:
                r = _import(group, {"bin": f"{base}/{name}" if base else name})
                out["bins"][name] = r["imported"]
                out["imported"] += r["imported"]
        out["found"] = len(files)
        return out
    r = _import(files, p)
    r["found"] = len(files)
    return r


@op("media.import_sequence")
def import_sequence(p):
    """Image sequence: pattern like C:/seq/shot_%04d.exr with start/end index."""
    folder = _set_bin(p)
    info = {"FilePath": p["pattern"], "StartIndex": int(p["start"]), "EndIndex": int(p["end"])}
    items = media_pool().ImportMedia([info]) or []
    if not items:
        fail("OPERATION_FAILED", "Resolve did not import the image sequence. Check the pattern and frame range.")
    return {"bin": folder.GetName() if folder else None, "clips": [clip_summary(c) for c in items]}


@op("media.list")
def list_media(p):
    want_bin = p.get("bin")
    kind = (p.get("type") or "").lower()
    out = []
    for path, folder in walk_folders():
        if want_bin and not (path == want_bin or path.endswith("/" + want_bin) or folder.GetName() == want_bin):
            continue
        for c in folder.GetClipList() or []:
            s = clip_summary(c, path)
            if kind and kind not in str(s["properties"].get("Type", "")).lower():
                continue
            out.append(s)
    limit = int(p.get("limit", 500))
    return {"count": len(out), "clips": out[:limit], "truncated": len(out) > limit}


@op("media.bins")
def bins(p):
    return [{"path": path, "clips": len(f.GetClipList() or []), "id": f.GetUniqueId() if has(f, "GetUniqueId") else None}
            for path, f in walk_folders()]


@op("media.search")
def search(p):
    q = p["query"].lower()
    fields = p.get("fields") or ["name", "path", "metadata"]
    hits = []
    for path, c in all_clips():
        hay = []
        if "name" in fields:
            hay.append(c.GetName() or "")
        if "path" in fields:
            hay.append(c.GetClipProperty("File Path") or "")
        if "metadata" in fields:
            md = c.GetMetadata() or {}
            hay.extend(str(v) for v in md.values())
        if any(q in h.lower() for h in hay):
            hits.append(clip_summary(c, path))
    return {"query": p["query"], "count": len(hits), "clips": hits}


@op("media.info")
def info(p):
    c = find_clip(p["clip"])
    props = to_plain(c.GetClipProperty() or {})
    out = {"id": c.GetUniqueId(), "name": c.GetName(), "properties": props}
    fp = props.get("File Path")
    out["fileExists"] = bool(fp) and os.path.exists(fp) if fp else None
    if has(c, "GetMarkInOut"):
        out["markInOut"] = to_plain(c.GetMarkInOut())
    out["markers"] = to_plain(c.GetMarkers() or {})
    return out


@op("media.metadata")
def metadata(p):
    c = find_clip(p["clip"])
    return {"id": c.GetUniqueId(), "metadata": to_plain(c.GetMetadata() or {}),
            "thirdParty": to_plain(c.GetThirdPartyMetadata() or {}) if has(c, "GetThirdPartyMetadata") else None}


@op("media.set_metadata")
def set_metadata(p):
    c = find_clip(p["clip"])
    results = {}
    for k, v in p["metadata"].items():
        ok = c.SetMetadata(k, str(v))
        results[k] = {"ok": bool(ok), "actual": c.GetMetadata(k)}
    return {"id": c.GetUniqueId(), "results": results}


@op("media.rename")
def rename(p):
    c = find_clip(p["clip"])
    old = c.GetName()
    check(c.SetClipProperty("Clip Name", p["name"]), "SetClipProperty('Clip Name')")
    return {"id": c.GetUniqueId(), "from": old, "to": c.GetName()}


@op("media.create_bin")
def create_bin(p):
    parent = find_folder(p.get("parent"))
    existing = next((f for f in (parent.GetSubFolderList() or []) if f.GetName() == p["name"]), None)
    if existing:
        return {"bin": p["name"], "created": False, "note": "Bin already existed."}
    check(media_pool().AddSubFolder(parent, p["name"]), f"AddSubFolder('{p['name']}')")
    return {"bin": p["name"], "parent": parent.GetName(), "created": True}


@op("media.move_to_bin")
def move_to_bin(p):
    clips = [find_clip(x) for x in p["clips"]]
    target = find_folder(p["bin"], create=bool(p.get("create", True)))
    check(media_pool().MoveClips(clips, target), "MoveClips")
    return {"moved": len(clips), "bin": target.GetName()}


@op("media.delete")
def delete(p):
    clips = [find_clip(x) for x in p["clips"]]
    names = [c.GetName() for c in clips]
    check(media_pool().DeleteClips(clips), "DeleteClips")
    return {"removedFromMediaPool": names, "filesOnDiskUntouched": True}


@op("media.relink")
def relink(p):
    clips = [find_clip(x) for x in p["clips"]] if p.get("clips") else [c for _, c in all_clips() if _is_offline(c)]
    if not clips:
        return {"relinked": 0, "note": "No offline clips found."}
    if not os.path.isdir(p["folder"]):
        fail("FILE_NOT_FOUND", f"Folder {p['folder']} does not exist.")
    check(media_pool().RelinkClips(clips, p["folder"]), "RelinkClips")
    return {"relinked": len(clips), "stillOffline": [c.GetName() for c in clips if _is_offline(c)]}


def _is_offline(c) -> bool:
    fp = c.GetClipProperty("File Path") or ""
    if not fp:
        return False
    if "%" in fp or "[" in fp:  # image sequence patterns
        return not os.path.isdir(os.path.dirname(fp))
    return not os.path.exists(fp)


@op("media.missing")
def missing(p):
    out = []
    for path, c in all_clips():
        if _is_offline(c):
            out.append({"id": c.GetUniqueId(), "name": c.GetName(), "bin": path, "filePath": c.GetClipProperty("File Path")})
    return {"count": len(out), "clips": out}


@op("media.file_paths")
def file_paths(p):
    return [{"id": c.GetUniqueId(), "name": c.GetName(), "filePath": c.GetClipProperty("File Path"), "bin": path}
            for path, c in all_clips()]


def _num(v):
    try:
        return float(re.findall(r"[\d.]+", str(v))[0])
    except Exception:
        return None


@op("media.technical")
def technical(p):
    c = find_clip(p["clip"])
    props = c.GetClipProperty() or {}
    res = props.get("Resolution") or ""
    m = re.match(r"(\d+)\s*x\s*(\d+)", str(res))
    return {
        "id": c.GetUniqueId(), "name": c.GetName(),
        "duration": props.get("Duration"), "frames": props.get("Frames"),
        "fps": _num(props.get("FPS")), "resolution": res,
        "width": int(m.group(1)) if m else None, "height": int(m.group(2)) if m else None,
        "audioChannels": props.get("Audio Ch"), "audioCodec": props.get("Audio Codec"),
        "videoCodec": props.get("Video Codec"), "type": props.get("Type"),
    }


@op("media.link_proxy")
def link_proxy(p):
    c = find_clip(p["clip"])
    if not os.path.isfile(p["proxyPath"]):
        fail("FILE_NOT_FOUND", f"Proxy {p['proxyPath']} does not exist.")
    check(c.LinkProxyMedia(p["proxyPath"]), "LinkProxyMedia")
    return {"id": c.GetUniqueId(), "proxy": p["proxyPath"]}


@op("media.unlink_proxy")
def unlink_proxy(p):
    c = find_clip(p["clip"])
    check(c.UnlinkProxyMedia(), "UnlinkProxyMedia")
    return {"id": c.GetUniqueId(), "proxy": None}


@op("media.replace")
def replace(p):
    c = find_clip(p["clip"])
    if not os.path.isfile(p["path"]):
        fail("FILE_NOT_FOUND", f"{p['path']} does not exist.")
    check(c.ReplaceClip(p["path"]), "ReplaceClip")
    return {"id": c.GetUniqueId(), "filePath": c.GetClipProperty("File Path")}


@op("media.set_color")
def set_color(p):
    c = find_clip(p["clip"])
    if p["color"] in (None, "", "None"):
        check(c.ClearClipColor(), "ClearClipColor")
    else:
        check(c.SetClipColor(p["color"]), f"SetClipColor('{p['color']}')")
    return {"id": c.GetUniqueId(), "color": c.GetClipColor()}


@op("media.set_flag")
def set_flag(p):
    c = find_clip(p["clip"])
    if p.get("clear"):
        check(c.ClearFlags(p.get("color") or "All"), "ClearFlags")
    else:
        check(c.AddFlag(p["color"]), f"AddFlag('{p['color']}')")
    return {"id": c.GetUniqueId(), "flags": list(c.GetFlagList() or [])}


@op("media.add_marker")
def add_marker(p):
    c = find_clip(p["clip"])
    check(c.AddMarker(int(p["frame"]), p.get("color", "Blue"), p.get("name", ""), p.get("note", ""), int(p.get("duration", 1)), p.get("customData", "")), "AddMarker")
    return {"id": c.GetUniqueId(), "markers": to_plain(c.GetMarkers())}


@op("media.set_mark_in_out")
def set_mark_in_out(p):
    c = find_clip(p["clip"])
    require_method(c, "SetMarkInOut", "Clip mark in/out")
    check(c.SetMarkInOut(int(p["markIn"]), int(p["markOut"]), p.get("type", "all")), "SetMarkInOut")
    return {"id": c.GetUniqueId(), "markInOut": to_plain(c.GetMarkInOut())}


@op("media.transcribe")
def transcribe(p):
    c = find_clip(p["clip"])
    require_method(c, "TranscribeAudio", "Audio transcription")
    check(c.TranscribeAudio(), "TranscribeAudio")
    return {"id": c.GetUniqueId(), "transcribed": True, "note": "Transcription is stored in Resolve; view it in the Media page transcript panel."}


@op("media.auto_sync_audio")
def auto_sync_audio(p):
    mp = media_pool()
    require_method(mp, "AutoSyncAudio", "Audio auto-sync")
    clips = [find_clip(x) for x in p["clips"]]
    r = get_res()
    settings = {}
    mode = p.get("mode", "waveform")
    settings[r.AUDIO_SYNC_MODE] = r.AUDIO_SYNC_TIMECODE if mode == "timecode" else r.AUDIO_SYNC_WAVEFORM
    if p.get("retainEmbeddedAudio") is not None:
        settings[r.AUDIO_SYNC_RETAIN_EMBEDDED_AUDIO] = bool(p["retainEmbeddedAudio"])
    check(mp.AutoSyncAudio(clips, settings), "AutoSyncAudio")
    return {"synced": [c.GetName() for c in clips], "mode": mode}


def get_res():
    from resolve_connection import get_resolve
    return get_resolve()


@op("media.selected")
def selected(p):
    mp = media_pool()
    require_method(mp, "GetSelectedClips", "Reading the media pool selection")
    return [clip_summary(c) for c in (mp.GetSelectedClips() or [])]


@op("media.storage_volumes")
def storage(p):
    ms = check(get_res().GetMediaStorage(), "GetMediaStorage")
    return {"volumes": list(ms.GetMountedVolumeList() or [])}
