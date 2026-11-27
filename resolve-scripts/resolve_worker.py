"""Long-lived JSON-lines worker used by the TypeScript MCP server.

Protocol (one JSON object per line):
  request : {"id": "1", "op": "project.create", "params": {...}}
  response: {"id": "1", "ok": true, "result": ...}
            {"id": "1", "ok": false, "error": {"code": "...", "message": "..."}}
stdout carries only protocol lines; diagnostics go to stderr.
"""
from __future__ import annotations

import json
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from errors import ResolveError  # noqa: E402
from ops import OPS  # noqa: E402

# Import managers so their @op functions register.
import application_manager  # noqa: E402,F401
import project_manager  # noqa: E402,F401
import media_manager  # noqa: E402,F401
import timeline_manager  # noqa: E402,F401
import editing_manager  # noqa: E402,F401
import fusion_manager  # noqa: E402,F401
import color_manager  # noqa: E402,F401
import audio_manager  # noqa: E402,F401
import render_manager  # noqa: E402,F401
import advanced_manager  # noqa: E402,F401


def _write(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, default=str) + "\n")
    sys.stdout.flush()


def handle(req: dict) -> dict:
    rid = req.get("id")
    name = req.get("op")
    fn = OPS.get(name)
    if fn is None:
        return {"id": rid, "ok": False, "error": {"code": "UNKNOWN_OP", "message": f"Unknown bridge operation '{name}'."}}
    try:
        return {"id": rid, "ok": True, "result": fn(req.get("params") or {})}
    except ResolveError as e:
        return {"id": rid, "ok": False, "error": e.to_json()}
    except Exception as e:  # unexpected: report with traceback for the log
        sys.stderr.write(traceback.format_exc())
        return {"id": rid, "ok": False, "error": {"code": "BRIDGE_EXCEPTION", "message": f"{type(e).__name__}: {e}"}}


def main() -> None:
    for stream in (sys.stdin, sys.stdout):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass
    if len(sys.argv) > 1 and sys.argv[1] == "--list-ops":
        print(json.dumps(sorted(OPS.keys())))
        return
    _write({"id": None, "ok": True, "result": {"ready": True, "python": sys.version.split()[0], "ops": len(OPS)}})
    for line in sys.stdin:
        line = line.strip().lstrip("﻿")
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            _write({"id": None, "ok": False, "error": {"code": "BAD_REQUEST", "message": str(e)}})
            continue
        _write(handle(req))


if __name__ == "__main__":
    main()
