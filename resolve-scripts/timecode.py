"""Frame-accurate timecode helpers (mirrors src/utils/timecode.ts)."""
from __future__ import annotations

import math


def nominal(fps: float) -> int:
    return int(round(fps))


def is_drop_frame_rate(fps: float) -> bool:
    return abs(fps - 29.97) < 0.01 or abs(fps - 59.94) < 0.01


def frames_to_tc(frame: int, fps: float, drop: bool = False) -> str:
    n = nominal(fps)
    if frame < 0:
        raise ValueError("frame must be >= 0")
    if drop and is_drop_frame_rate(fps):
        d = 2 if n == 30 else 4
        per10 = n * 600 - d * 9
        per1 = n * 60 - d
        tens, rem = divmod(frame, per10)
        if rem > d:
            frame = frame + d * 9 * tens + d * ((rem - d) // per1)
        else:
            frame = frame + d * 9 * tens
        sep = ";"
    else:
        sep = ":"
    ff = frame % n
    s = (frame // n) % 60
    m = (frame // (n * 60)) % 60
    h = frame // (n * 3600)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ff:02d}"


def tc_to_frames(tc: str, fps: float) -> int:
    drop = ";" in tc
    parts = [int(x) for x in tc.replace(";", ":").split(":")]
    if len(parts) != 4:
        raise ValueError(f"Invalid timecode '{tc}'")
    h, m, s, f = parts
    n = nominal(fps)
    total = ((h * 60 + m) * 60 + s) * n + f
    if drop and is_drop_frame_rate(fps):
        d = 2 if n == 30 else 4
        mins = h * 60 + m
        total -= d * (mins - mins // 10)
    return total


def timeline_fps(tl) -> float:
    v = tl.GetSetting("timelineFrameRate")
    try:
        return float(str(v).split()[0])
    except Exception:
        return 24.0


def timeline_is_drop(tl) -> bool:
    v = str(tl.GetSetting("timelineDropFrameTimecode") or "0")
    return v in ("1", "true", "True")


def seconds_to_frames(sec: float, fps: float) -> int:
    return int(math.floor(sec * fps + 1e-6))
