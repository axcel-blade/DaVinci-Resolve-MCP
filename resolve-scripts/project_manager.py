"""Project management (Module B)."""
from __future__ import annotations

import os
import time

from ops import check, ensure_parent_dir, fail, has, op, project, project_manager, require_method, timelines, to_plain

# Project settings that the docs list and that agents commonly need.
COMMON_SETTINGS = [
    "timelineResolutionWidth", "timelineResolutionHeight", "timelineFrameRate", "timelinePlaybackFrameRate",
    "timelineOutputResolutionWidth", "timelineOutputResolutionHeight", "videoMonitorFormat",
    "colorScienceMode", "colorSpaceTimeline", "colorSpaceOutput", "colorSpaceInput", "separateColorSpaceAndGamma",
    "rcmPresetMode", "audioCaptureNumChannels", "audioPlayoutNumChannels", "superScale",
]


def _list_projects(pm):
    return list(pm.GetProjectListInCurrentFolder() or [])


@op("project.list")
def list_projects(p):
    pm = project_manager()
    folder = pm.GetCurrentFolder() if has(pm, "GetCurrentFolder") else None
    return {
        "folder": folder,
        "projects": _list_projects(pm),
        "folders": list(pm.GetFolderListInCurrentFolder() or []) if has(pm, "GetFolderListInCurrentFolder") else [],
        "current": (pm.GetCurrentProject().GetName() if pm.GetCurrentProject() else None),
    }


@op("project.create")
def create(p):
    pm = project_manager()
    name = p["name"]
    if name in _list_projects(pm):
        fail("ALREADY_EXISTS", f"A project named '{name}' already exists in the current project folder.")
    proj = check(pm.CreateProject(name), f"CreateProject('{name}')")
    applied = _apply_settings(proj, p.get("settings") or {})
    return {"name": proj.GetName(), "id": proj.GetUniqueId(), "settingsApplied": applied}


@op("project.open")
def open_project(p):
    pm = project_manager()
    name = p["name"]
    if name not in _list_projects(pm):
        fail("NOT_FOUND", f"Project '{name}' not found in the current project folder.")
    proj = check(pm.LoadProject(name), f"LoadProject('{name}')")
    return {"name": proj.GetName(), "timelines": proj.GetTimelineCount()}


@op("project.save")
def save(p):
    pm = project_manager()
    proj = project()
    check(pm.SaveProject(), "SaveProject")
    return {"saved": proj.GetName()}


@op("project.close")
def close(p):
    pm = project_manager()
    proj = project()
    name = proj.GetName()
    if p.get("save", True):
        check(pm.SaveProject(), "SaveProject")
    check(pm.CloseProject(proj), "CloseProject")
    return {"closed": name, "saved": p.get("save", True)}


@op("project.export")
def export(p):
    """Export a project to a .drp file (used for backups)."""
    pm = project_manager()
    name = p.get("name") or project().GetName()
    path = p["path"]
    if os.path.exists(path) and not p.get("overwrite"):
        fail("FILE_EXISTS", f"{path} already exists.")
    ensure_parent_dir(path)
    if pm.GetCurrentProject() and pm.GetCurrentProject().GetName() == name:
        pm.SaveProject()
    check(pm.ExportProject(name, path, bool(p.get("withStillsAndLUTs", True))), f"ExportProject('{name}')")
    if not os.path.isfile(path):
        fail("OPERATION_FAILED", f"Resolve reported success but {path} was not written.")
    return {"project": name, "path": path, "bytes": os.path.getsize(path)}


@op("project.import")
def import_project(p):
    pm = project_manager()
    path = p["path"]
    if not os.path.isfile(path):
        fail("FILE_NOT_FOUND", f"{path} does not exist.")
    name = p.get("name")
    if name and name in _list_projects(pm):
        fail("ALREADY_EXISTS", f"A project named '{name}' already exists.")
    if path.lower().endswith(".dra"):
        require_method(pm, "RestoreProject", "Restoring archives")
        ok = pm.RestoreProject(path, name) if name else pm.RestoreProject(path)
    else:
        ok = pm.ImportProject(path, name) if name else pm.ImportProject(path)
    check(ok, f"ImportProject('{path}')")
    return {"imported": path, "name": name, "projects": _list_projects(pm)}


@op("project.delete")
def delete(p):
    pm = project_manager()
    name = p["name"]
    cur = pm.GetCurrentProject()
    if cur and cur.GetName() == name:
        fail("INVALID_STATE", f"'{name}' is the open project. Close it before deleting.")
    if name not in _list_projects(pm):
        fail("NOT_FOUND", f"Project '{name}' not found.")
    check(pm.DeleteProject(name), f"DeleteProject('{name}')")
    return {"deleted": name}


@op("project.rename")
def rename(p):
    proj = project()
    old = proj.GetName()
    check(proj.SetName(p["name"]), f"SetName('{p['name']}')")
    return {"from": old, "to": proj.GetName()}


@op("project.info")
def info(p):
    proj = project()
    tl = proj.GetCurrentTimeline()
    return {
        "name": proj.GetName(),
        "id": proj.GetUniqueId(),
        "timelineCount": proj.GetTimelineCount(),
        "currentTimeline": tl.GetName() if tl else None,
        "settings": {k: proj.GetSetting(k) for k in COMMON_SETTINGS},
        "renderJobs": len(proj.GetRenderJobList() or []),
        "presets": to_plain(proj.GetPresetList()) if has(proj, "GetPresetList") else None,
    }


@op("project.get_settings")
def get_settings(p):
    proj = project()
    keys = p.get("keys")
    if keys:
        return {k: proj.GetSetting(k) for k in keys}
    return to_plain(proj.GetSetting() or {})


def _apply_settings(proj, settings: dict) -> dict:
    results = {}
    for k, v in settings.items():
        ok = proj.SetSetting(k, str(v))
        results[k] = {"requested": str(v), "ok": bool(ok), "actual": proj.GetSetting(k)}
    return results


@op("project.set_settings")
def set_settings(p):
    proj = project()
    results = _apply_settings(proj, p["settings"])
    failed = [k for k, r in results.items() if not r["ok"]]
    return {"results": results, "failed": failed}


@op("project.timelines")
def get_timelines(p):
    proj = project()
    cur = proj.GetCurrentTimeline()
    return [
        {"index": i + 1, "name": t.GetName(), "id": t.GetUniqueId(), "current": bool(cur and cur.GetUniqueId() == t.GetUniqueId()),
         "startFrame": t.GetStartFrame(), "endFrame": t.GetEndFrame()}
        for i, t in enumerate(timelines())
    ]


@op("project.set_preset")
def set_preset(p):
    proj = project()
    check(proj.SetPreset(p["preset"]), f"SetPreset('{p['preset']}')")
    return {"preset": p["preset"]}


@op("project.current")
def current(p):
    pm = project_manager()
    proj = pm.GetCurrentProject()
    if not proj:
        return {"project": None}
    tl = proj.GetCurrentTimeline()
    return {"project": proj.GetName(), "id": proj.GetUniqueId(), "timeline": tl.GetName() if tl else None}


@op("project.stamp")
def stamp(p):
    return {"stamp": time.strftime("%Y%m%d-%H%M%S")}
