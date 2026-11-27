"""Fairlight / audio operations.

The Resolve scripting API exposes audio tracks (add/delete/name/enable/lock,
sub-type), audio items on the timeline, AutoSyncAudio and inserting audio at
the playhead. Fairlight mixer parameters (fader, EQ, dynamics, plugins) are not
documented scripting surfaces. Item properties such as Volume/Pan are only
*attempted* via SetProperty and verified by readback; when Resolve rejects them
the result says so instead of claiming success.
"""
from __future__ import annotations

from ops import check, fail, has, item_summary, op, require_method, timeline, timeline_item, to_plain


@op("audio.tracks")
def tracks(p):
    tl = timeline(p.get("timeline"))
    out = []
    for ti in range(1, int(tl.GetTrackCount("audio") or 0) + 1):
        out.append({
            "trackIndex": ti,
            "name": tl.GetTrackName("audio", ti) if has(tl, "GetTrackName") else None,
            "subType": tl.GetTrackSubType("audio", ti) if has(tl, "GetTrackSubType") else None,
            "enabled": tl.GetIsTrackEnabled("audio", ti) if has(tl, "GetIsTrackEnabled") else None,
            "items": [item_summary(it, "audio", ti, i + 1) for i, it in enumerate(tl.GetItemListInTrack("audio", ti) or [])],
        })
    return out


@op("audio.try_property")
def try_property(p):
    it = timeline_item({**p, "trackType": p.get("trackType", "audio")})
    res = {}
    for k, v in p["properties"].items():
        before = it.GetProperty(k)
        ok = bool(it.SetProperty(k, v))
        after = it.GetProperty(k)
        res[k] = {"requested": v, "ok": ok and after is not None, "before": to_plain(before), "actual": to_plain(after)}
    unsupported = [k for k, r in res.items() if not r["ok"]]
    return {"item": item_summary(it, "audio"), "results": res, "unsupported": unsupported,
            "note": ("Resolve rejected: " + ", ".join(unsupported) + ". These audio parameters are not scriptable in this version; adjust them in the Fairlight page or Inspector.") if unsupported else None}


@op("audio.voice_isolation")
def voice_isolation(p):
    tl = timeline(p.get("timeline"))
    ti = int(p.get("trackIndex", 1))
    if not has(tl, "SetVoiceIsolationState"):
        fail("UNSUPPORTED", "Voice Isolation is not scriptable in this Resolve version (Timeline.SetVoiceIsolationState not exposed). Use Fairlight > Voice Isolation in the UI.")
    state = {"isEnabled": bool(p.get("enabled", True)), "amount": int(p.get("amount", 50))}
    check(tl.SetVoiceIsolationState(ti, state), "SetVoiceIsolationState")
    return {"trackIndex": ti, "state": to_plain(tl.GetVoiceIsolationState(ti)) if has(tl, "GetVoiceIsolationState") else state}
