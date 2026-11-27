"""Deliver page automation: formats, codecs, settings, jobs and queue."""
from __future__ import annotations

import os

from ops import check, fail, has, op, project, require_method, timeline, to_plain
from resolve_connection import get_resolve


@op("render.formats")
def formats(p):
    proj = project()
    fmts = to_plain(proj.GetRenderFormats() or {})
    out = {"formats": fmts}
    if p.get("withCodecs"):
        out["codecs"] = {name: to_plain(proj.GetRenderCodecs(ext) or {}) for name, ext in fmts.items()}
    return out


@op("render.codecs")
def codecs(p):
    return to_plain(project().GetRenderCodecs(p["format"]) or {})


@op("render.get_settings")
def get_settings(p):
    proj = project()
    out = {
        "formatAndCodec": to_plain(proj.GetCurrentRenderFormatAndCodec()),
        "mode": proj.GetCurrentRenderMode() if has(proj, "GetCurrentRenderMode") else None,
        "presets": list(proj.GetRenderPresetList() or []),
    }
    if has(proj, "GetRenderResolutions"):
        fc = proj.GetCurrentRenderFormatAndCodec() or {}
        if fc.get("format") and fc.get("codec"):
            out["resolutions"] = to_plain(proj.GetRenderResolutions(fc["format"], fc["codec"]))
    return out


@op("render.set_format")
def set_format(p):
    proj = project()
    fmt, codec = p["format"], p["codec"]
    available = proj.GetRenderCodecs(fmt) or {}
    if not available:
        fail("UNSUPPORTED", f"Render format '{fmt}' is not available.", to_plain(proj.GetRenderFormats()))
    if codec not in available.values():
        # accept description match, e.g. "H.264" -> "H264"
        match = next((v for k, v in available.items() if k.lower() == codec.lower()), None)
        if not match:
            fail("UNSUPPORTED", f"Codec '{codec}' is not available for format '{fmt}'.", to_plain(available))
        codec = match
    check(proj.SetCurrentRenderFormatAndCodec(fmt, codec), f"SetCurrentRenderFormatAndCodec({fmt}, {codec})")
    return to_plain(proj.GetCurrentRenderFormatAndCodec())


@op("render.pick_codec")
def pick_codec(p):
    """Return the first candidate codec available for the format (validated, not assumed)."""
    proj = project()
    available = proj.GetRenderCodecs(p["format"]) or {}
    vals = list(available.values())
    for c in p["candidates"]:
        if c in vals:
            return {"format": p["format"], "codec": c}
        for desc, v in available.items():
            if c.lower() in desc.lower():
                return {"format": p["format"], "codec": v}
    fail("UNSUPPORTED", f"None of {p['candidates']} is available for format '{p['format']}'.", to_plain(available))


@op("render.set_settings")
def set_settings(p):
    proj = project()
    s = dict(p["settings"])
    if "TargetDir" in s:
        os.makedirs(s["TargetDir"], exist_ok=True)
    check(proj.SetRenderSettings(s), "SetRenderSettings")
    return {"applied": s}


@op("render.set_mode")
def set_mode(p):
    proj = project()
    check(proj.SetCurrentRenderMode(0 if p["mode"] == "individual" else 1), "SetCurrentRenderMode")
    return {"mode": p["mode"]}


@op("render.load_preset")
def load_preset(p):
    proj = project()
    if p["preset"] not in (proj.GetRenderPresetList() or []):
        fail("NOT_FOUND", f"Render preset '{p['preset']}' not found.", list(proj.GetRenderPresetList() or []))
    check(proj.LoadRenderPreset(p["preset"]), "LoadRenderPreset")
    return {"loaded": p["preset"], "formatAndCodec": to_plain(proj.GetCurrentRenderFormatAndCodec())}


@op("render.save_preset")
def save_preset(p):
    check(project().SaveAsNewRenderPreset(p["name"]), "SaveAsNewRenderPreset")
    return {"saved": p["name"]}


@op("render.add_job")
def add_job(p):
    proj = project()
    if p.get("timeline"):
        check(proj.SetCurrentTimeline(timeline(p["timeline"])), "SetCurrentTimeline")
    job = check(proj.AddRenderJob(), "AddRenderJob")
    detail = next((j for j in (proj.GetRenderJobList() or []) if j.get("JobId") == job), None)
    return {"jobId": job, "job": to_plain(detail)}


@op("render.queue")
def queue(p):
    proj = project()
    jobs = []
    for j in proj.GetRenderJobList() or []:
        jj = to_plain(j)
        try:
            jj["status"] = to_plain(proj.GetRenderJobStatus(j.get("JobId")))
        except Exception:
            pass
        jobs.append(jj)
    return {"rendering": bool(proj.IsRenderingInProgress()), "jobs": jobs}


@op("render.job_status")
def job_status(p):
    proj = project()
    st = proj.GetRenderJobStatus(p["jobId"])
    if not st:
        fail("NOT_FOUND", f"Render job {p['jobId']} not found.")
    detail = next((j for j in (proj.GetRenderJobList() or []) if j.get("JobId") == p["jobId"]), None)
    return {"jobId": p["jobId"], "status": to_plain(st), "job": to_plain(detail), "rendering": bool(proj.IsRenderingInProgress())}


@op("render.start")
def start(p):
    proj = project()
    ids = p.get("jobIds") or []
    interactive = bool(p.get("interactive", False))
    ok = proj.StartRendering(ids, interactive) if ids else proj.StartRendering(interactive)
    check(ok, "StartRendering")
    return {"started": True, "jobIds": ids or "all"}


@op("render.stop")
def stop(p):
    proj = project()
    proj.StopRendering()
    return {"stopped": True, "rendering": bool(proj.IsRenderingInProgress())}


@op("render.delete_job")
def delete_job(p):
    proj = project()
    check(proj.DeleteRenderJob(p["jobId"]), f"DeleteRenderJob({p['jobId']})")
    return {"deleted": p["jobId"]}


@op("render.delete_all_jobs")
def delete_all(p):
    check(project().DeleteAllRenderJobs(), "DeleteAllRenderJobs")
    return {"deletedAll": True}


@op("render.is_rendering")
def is_rendering(p):
    return {"rendering": bool(project().IsRenderingInProgress())}


@op("render.import_preset")
def import_preset(p):
    r = get_resolve()
    if not os.path.isfile(p["path"]):
        fail("FILE_NOT_FOUND", f"{p['path']} does not exist.")
    check(r.ImportRenderPreset(p["path"]), "ImportRenderPreset")
    return {"imported": p["path"]}
