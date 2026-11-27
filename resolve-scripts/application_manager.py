"""Application-level operations (Module A)."""
from __future__ import annotations

import platform
import sys

from ops import check, fail, has, op, project_manager, resolve
from resolve_connection import get_resolve, paths

PAGES = ["media", "cut", "edit", "fusion", "color", "fairlight", "deliver"]


@op("app.status")
def status(p):
    info = {"paths": paths(), "python": sys.version.split()[0]}
    try:
        r = get_resolve(required=False)
    except Exception as e:  # module missing etc.
        code = getattr(e, "code", "SCRIPTING_UNAVAILABLE")
        info.update({"connected": False, "error": {"code": code, "message": str(e)}})
        return info
    if r is None:
        info.update({"connected": False, "error": {"code": "RESOLVE_NOT_RUNNING", "message": "Resolve is not running or external scripting is disabled."}})
        return info
    pm = r.GetProjectManager()
    proj = pm.GetCurrentProject() if pm else None
    tl = proj.GetCurrentTimeline() if proj else None
    info.update({
        "connected": True,
        "product": r.GetProductName(),
        "version": r.GetVersionString(),
        "page": r.GetCurrentPage(),
        "project": proj.GetName() if proj else None,
        "timeline": tl.GetName() if tl else None,
    })
    return info


@op("app.version")
def version(p):
    r = resolve()
    v = r.GetVersion() or []
    return {"product": r.GetProductName(), "versionString": r.GetVersionString(), "version": list(v)}


@op("app.info")
def app_info(p):
    r = resolve()
    pm = project_manager()
    out = {
        "product": r.GetProductName(),
        "version": r.GetVersionString(),
        "page": r.GetCurrentPage(),
        "keyframeMode": r.GetKeyframeMode() if has(r, "GetKeyframeMode") else None,
    }
    if has(pm, "GetCurrentDatabase"):
        out["database"] = pm.GetCurrentDatabase()
    fu = r.Fusion() if has(r, "Fusion") else None
    out["fusionAvailable"] = fu is not None
    return out


@op("app.quit")
def quit_app(p):
    r = resolve()
    r.Quit()
    return {"quitRequested": True}


@op("app.get_page")
def get_page(p):
    return {"page": resolve().GetCurrentPage()}


@op("app.set_page")
def set_page(p):
    page = p["page"]
    r = resolve()
    ok = r.OpenPage(page)
    if not ok:
        fail("OPERATION_FAILED", f"Resolve could not open the '{page}' page (it may not exist in this version).")
    return {"page": r.GetCurrentPage()}


@op("app.system_info")
def system_info(p):
    return {
        "os": platform.platform(),
        "machine": platform.machine(),
        "python": sys.version,
        "scripting": paths(),
    }


@op("app.capabilities")
def capabilities(p):
    """Probe which documented API methods this Resolve build exposes."""
    r = resolve()
    pm = project_manager()
    proj = pm.GetCurrentProject()
    caps = {
        "version": r.GetVersionString(),
        "pages": PAGES + (["photo"] if _version_major(r) >= 21 else []),
        "resolve": {m: has(r, m) for m in ["Fusion", "OpenPage", "ImportRenderPreset", "ExportRenderPreset", "GetKeyframeMode", "LoadLayoutPreset", "Quit"]},
        "projectManager": {m: has(pm, m) for m in ["CreateProject", "DeleteProject", "LoadProject", "ImportProject", "ExportProject", "RestoreProject", "ArchiveProject", "CreateFolder", "GetDatabaseList", "SetCurrentDatabase"]},
    }
    if proj:
        mp = proj.GetMediaPool()
        caps["project"] = {m: has(proj, m) for m in ["GetGallery", "GetRenderFormats", "GetRenderCodecs", "SetRenderSettings", "GetRenderJobStatus", "ExportCurrentFrameAsStill", "GetColorGroupsList", "InsertAudioToCurrentTrackAtPlayhead"]}
        caps["mediaPool"] = {m: has(mp, m) for m in ["ImportMedia", "AppendToTimeline", "CreateTimelineFromClips", "ImportTimelineFromFile", "RelinkClips", "AutoSyncAudio", "MoveClips", "DeleteClips", "ExportMetadata", "GetSelectedClips"]}
        tl = proj.GetCurrentTimeline()
        if tl:
            caps["timeline"] = {m: has(tl, m) for m in ["AddTrack", "DeleteTrack", "DeleteClips", "DuplicateTimeline", "CreateCompoundClip", "CreateFusionClip", "Export", "InsertTitleIntoTimeline", "InsertFusionTitleIntoTimeline", "InsertGeneratorIntoTimeline", "CreateSubtitlesFromAudio", "DetectSceneCuts", "GetNodeGraph", "SetClipsLinked", "GrabStill"]}
            items = tl.GetItemListInTrack("video", 1) or []
            if items:
                it = items[0]
                caps["timelineItem"] = {m: has(it, m) for m in ["SetProperty", "AddFusionComp", "SetLUT", "SetCDL", "CopyGrades", "AddVersion", "CreateMagicMask", "Stabilize", "SmartReframe", "GetNodeGraph", "SetClipEnabled", "AssignToColorGroup", "ExportLUT"]}
    caps["fusion"] = has(r, "Fusion") and r.Fusion() is not None
    return caps


def _version_major(r) -> int:
    try:
        return int((r.GetVersion() or [0])[0])
    except Exception:
        return 0
