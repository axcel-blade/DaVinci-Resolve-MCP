"""Connection to the DaVinci Resolve scripting API.

Uses the official DaVinciResolveScript module shipped with Resolve
(Support/Developer/Scripting/Modules) and fusionscript.dll. Nothing here is
mocked: when Resolve is not reachable a ResolveError is raised and reported to
the MCP client.
"""
from __future__ import annotations

import importlib.util
import os
import sys
from typing import Any, Optional

from errors import ResolveError

_resolve: Any = None
_bmd: Any = None


def _default_api_dir() -> str:
    if sys.platform.startswith("win"):
        base = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
        return os.path.join(base, "Blackmagic Design", "DaVinci Resolve", "Support", "Developer", "Scripting")
    if sys.platform == "darwin":
        return "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting"
    return "/opt/resolve/Developer/Scripting"


def _default_lib() -> str:
    if sys.platform.startswith("win"):
        base = os.environ.get("PROGRAMFILES", r"C:\Program Files")
        return os.path.join(base, "Blackmagic Design", "DaVinci Resolve", "fusionscript.dll")
    if sys.platform == "darwin":
        return "/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fusionscript.so"
    return "/opt/resolve/libs/Fusion/fusionscript.so"


def paths() -> dict:
    api = os.environ.get("RESOLVE_SCRIPT_API") or _default_api_dir()
    lib = os.environ.get("RESOLVE_SCRIPT_LIB") or _default_lib()
    return {
        "RESOLVE_SCRIPT_API": api,
        "RESOLVE_SCRIPT_LIB": lib,
        "modules_dir": os.path.join(api, "Modules"),
        "api_exists": os.path.isdir(api),
        "lib_exists": os.path.isfile(lib),
        "readme": next((os.path.join(api, f) for f in ("README.md", "README.txt") if os.path.isfile(os.path.join(api, f))), None),
        "stubs": os.path.join(api, "DaVinciResolveScript.pyi") if os.path.isfile(os.path.join(api, "DaVinciResolveScript.pyi")) else None,
    }


def _load_module() -> Any:
    global _bmd
    if _bmd is not None:
        return _bmd
    p = paths()
    if not p["lib_exists"]:
        raise ResolveError(
            "RESOLVE_NOT_INSTALLED",
            f"fusionscript library not found at {p['RESOLVE_SCRIPT_LIB']}. Install DaVinci Resolve or set RESOLVE_SCRIPT_LIB.",
        )
    if not os.path.isdir(p["modules_dir"]):
        raise ResolveError(
            "SCRIPTING_UNAVAILABLE",
            f"Resolve scripting modules not found at {p['modules_dir']}. Set RESOLVE_SCRIPT_API.",
        )
    os.environ["RESOLVE_SCRIPT_API"] = p["RESOLVE_SCRIPT_API"]
    os.environ["RESOLVE_SCRIPT_LIB"] = p["RESOLVE_SCRIPT_LIB"]
    if p["modules_dir"] not in sys.path:
        sys.path.append(p["modules_dir"])
    try:
        # DaVinciResolveScript.py itself loads fusionscript from RESOLVE_SCRIPT_LIB.
        import DaVinciResolveScript as bmd  # type: ignore
    except Exception as exc:  # pragma: no cover - depends on installation
        # Fallback: load fusionscript directly as an extension module.
        try:
            loader = importlib.machinery.ExtensionFileLoader("fusionscript", p["RESOLVE_SCRIPT_LIB"])
            spec = importlib.util.spec_from_file_location("fusionscript", p["RESOLVE_SCRIPT_LIB"], loader=loader)
            if spec is None:
                raise exc
            bmd = importlib.util.module_from_spec(spec)
            loader.exec_module(bmd)
        except Exception as exc2:
            raise ResolveError(
                "SCRIPTING_UNAVAILABLE",
                f"Could not load the Resolve scripting module ({exc2}). Check that your Python version is supported by your Resolve build (64-bit Python 3.6+).",
            )
    _bmd = bmd
    return bmd


def get_resolve(required: bool = True) -> Optional[Any]:
    """Return a live Resolve object, reconnecting when the cached handle went stale."""
    global _resolve
    if _resolve is not None:
        try:
            if _resolve.GetVersionString():
                return _resolve
        except Exception:
            pass
        _resolve = None
    bmd = _load_module()
    r = None
    try:
        r = bmd.scriptapp("Resolve")
    except Exception:
        r = None
    if r is None:
        if required:
            raise ResolveError(
                "RESOLVE_NOT_RUNNING",
                "Could not connect to DaVinci Resolve. Make sure Resolve is running and that "
                "Preferences > System > General > External scripting using is set to 'Local'.",
            )
        return None
    _resolve = r
    return r


def module_constants() -> Any:
    """The Resolve object exposes constants such as EXPORT_EDL as attributes."""
    return get_resolve()
