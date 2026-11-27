"""Fusion automation (Fusion scripting API: Composition / Tool / Input objects)."""
from __future__ import annotations

import os

from ops import check, fail, has, item_summary, op, project, timeline, timeline_item, to_plain
from resolve_connection import get_resolve

# Fusion tool registry IDs used by the higher-level helpers. Each is validated at runtime:
# AddTool returns None for an unknown ID, which is reported instead of assumed.
TOOL_ALIASES = {
    "text": "TextPlus", "text+": "TextPlus", "text3d": "Text3D", "background": "Background", "merge": "Merge",
    "transform": "Transform", "blur": "Blur", "glow": "Glow", "softglow": "SoftGlow", "sharpen": "Sharpen",
    "unsharpmask": "UnsharpMask", "filmgrain": "FilmGrain", "grain": "Grain", "defocus": "Defocus",
    "directionalblur": "DirectionalBlur", "camerashake": "CameraShake", "lensdistort": "LensDistort",
    "brightnesscontrast": "BrightnessContrast", "colorcorrector": "ColorCorrector", "colorcurves": "ColorCurves",
    "huecurves": "HueCurves", "rectanglemask": "RectangleMask", "ellipsemask": "EllipseMask",
    "polygonmask": "PolylineMask", "bsplinemask": "BSplineMask", "deltakeyer": "DeltaKeyer",
    "ultrakeyer": "UltraKeyer", "chromakeyer": "ChromaKeyer", "lumakeyer": "LumaKeyer", "paint": "Paint",
    "camera3d": "Camera3D", "merge3d": "Merge3D", "renderer3d": "Renderer3D", "shape3d": "Shape3D",
    "imageplane3d": "ImagePlane3D", "ambientlight": "LightAmbient", "directionallight": "LightDirectional",
    "pointlight": "LightPoint", "spotlight": "LightSpot", "pemitter": "pEmitter", "prender": "pRender",
    "pdirectionalforce": "pDirectionalForce", "pturbulence": "pTurbulence", "timespeed": "TimeSpeed",
    "timestretcher": "TimeStretcher", "dissolve": "Dissolve", "crop": "Crop", "resize": "BetterResize",
    "letterbox": "Letterbox", "fastnoise": "FastNoise", "rays": "Rays", "highlight": "Highlight",
    "vignette": "Vignette", "cornerpositioner": "CornerPositioner", "planartracker": "PlanarTracker",
    "tracker": "Tracker", "dve": "DVE", "shadow": "Shadow", "bitmap": "BitmapMask", "matte": "MatteControl",
}


def reg_id(name: str) -> str:
    return TOOL_ALIASES.get(name.lower().replace(" ", "").replace("_", ""), name)


def fusion():
    fu = get_resolve().Fusion()
    if fu is None:
        fail("SCRIPTING_UNAVAILABLE", "Resolve did not return a Fusion object.")
    return fu


def comp_for(p, create: bool = True):
    """Composition of a timeline item (default), or the Fusion page's current comp."""
    if p.get("source") == "current":
        comp = fusion().GetCurrentComp()
        if comp is None:
            fail("NO_COMPOSITION", "No current Fusion composition. Open the Fusion page on a clip first.")
        return comp, None
    it = timeline_item(p)
    count = int(it.GetFusionCompCount() or 0)
    if count == 0:
        if not create:
            fail("NO_COMPOSITION", f"Timeline item '{it.GetName()}' has no Fusion composition.")
        comp = check(it.AddFusionComp(), "AddFusionComp")
    else:
        idx = int(p.get("compIndex", 1))
        if idx < 1 or idx > count:
            fail("NOT_FOUND", f"Item has {count} Fusion comp(s); compIndex {idx} does not exist.")
        comp = check(it.GetFusionCompByIndex(idx), "GetFusionCompByIndex")
    return comp, it


def tool_info(t) -> dict:
    a = t.GetAttrs() or {}
    return {"name": a.get("TOOLS_Name"), "type": a.get("TOOLS_RegID"), "passThrough": a.get("TOOLB_PassThrough")}


def find_tool(comp, name):
    t = comp.FindTool(name)
    if t is None:
        fail("NOT_FOUND", f"Fusion node '{name}' not found in the composition.")
    return t


def tools(comp):
    return list((comp.GetToolList(False) or {}).values())


def main_input_name(t, idx: int = 1):
    inp = t.FindMainInput(idx) if has(t, "FindMainInput") else None
    if inp is None:
        return None
    return (inp.GetAttrs() or {}).get("INPS_ID")


def add_tool(comp, kind: str, name: str = None, x=None, y=None):
    rid = reg_id(kind)
    comp.Lock()
    try:
        t = comp.AddTool(rid, -32768, -32768) if x is None else comp.AddTool(rid, int(x), int(y))
    finally:
        comp.Unlock()
    if t is None:
        fail("UNSUPPORTED", f"Fusion could not create a '{rid}' node. It is not a registered tool in this installation.")
    if name:
        t.SetAttrs({"TOOLS_Name": name})
    return t


def set_inputs(t, inputs: dict, time=None) -> dict:
    """Set inputs and read them back; report per-input success."""
    out = {}
    for key, val in (inputs or {}).items():
        v = val
        if isinstance(val, (list, tuple)):
            v = {i + 1: x for i, x in enumerate(val)}
        try:
            if time is None:
                t.SetInput(key, v)
            else:
                t.SetInput(key, v, time)
            back = t.GetInput(key) if time is None else t.GetInput(key, time)
            out[key] = {"ok": back is not None, "value": to_plain(back)}
        except Exception as e:
            out[key] = {"ok": False, "error": str(e)}
    return out


def input_ids(t):
    ids = []
    for inp in (t.GetInputList() or {}).values():
        a = inp.GetAttrs() or {}
        ids.append({"id": a.get("INPS_ID"), "name": a.get("INPS_Name"), "type": a.get("INPS_DataType")})
    return ids


def insert_before_output(comp, new_tool):
    """Insert new_tool into the main chain feeding MediaOut1 (MediaIn -> ... -> new -> MediaOut)."""
    outs = list((comp.GetToolList(False, "MediaOut") or {}).values())
    if not outs:
        fail("NO_COMPOSITION", "The composition has no MediaOut node to insert before.")
    mo = outs[0]
    mo_in = main_input_name(mo) or "Input"
    src = getattr(mo, mo_in).GetConnectedOutput() if hasattr(mo, mo_in) else None
    new_in = main_input_name(new_tool)
    if src is not None and new_in:
        check(new_tool.ConnectInput(new_in, src), f"ConnectInput {new_in}")
    check(mo.ConnectInput(mo_in, new_tool), "ConnectInput MediaOut")
    return {"insertedBefore": tool_info(mo)["name"], "upstreamConnected": src is not None}


# ---------------------------------------------------------------- ops

@op("fusion.comp_info")
def comp_info(p):
    comp, it = comp_for(p, create=bool(p.get("create", False)))
    a = comp.GetAttrs() or {}
    out = {
        "name": a.get("COMPS_Name"), "renderStart": a.get("COMPN_RenderStart"), "renderEnd": a.get("COMPN_RenderEnd"),
        "nodes": [tool_info(t) for t in tools(comp)],
    }
    if it is not None:
        out["item"] = item_summary(it)
        out["compNames"] = list(it.GetFusionCompNameList() or [])
    return out


@op("fusion.nodes")
def nodes(p):
    comp, _ = comp_for(p, create=False)
    out = []
    for t in tools(comp):
        info = tool_info(t)
        conns = {}
        for inp in (t.GetInputList() or {}).values():
            try:
                o = inp.GetConnectedOutput()
            except Exception:
                o = None
            if o is not None:
                src = o.GetTool()
                conns[(inp.GetAttrs() or {}).get("INPS_ID")] = (src.GetAttrs() or {}).get("TOOLS_Name") if src else None
        info["connections"] = conns
        out.append(info)
    return out


@op("fusion.create_node")
def create_node(p):
    comp, _ = comp_for(p)
    t = add_tool(comp, p["type"], p.get("name"), p.get("x"), p.get("y"))
    res = {"node": tool_info(t)}
    if p.get("inputs"):
        res["inputs"] = set_inputs(t, p["inputs"])
    if p.get("insertIntoChain"):
        res["chain"] = insert_before_output(comp, t)
    return res


@op("fusion.delete_node")
def delete_node(p):
    comp, _ = comp_for(p, create=False)
    t = find_tool(comp, p["node"])
    info = tool_info(t)
    if info["type"] in ("MediaIn", "MediaOut") and not p.get("allowMediaNodes"):
        fail("INVALID_ARGUMENT", "Refusing to delete a MediaIn/MediaOut node (set allowMediaNodes to override).")
    t.Delete()
    if comp.FindTool(p["node"]) is not None:
        fail("OPERATION_FAILED", f"Node '{p['node']}' still exists after Delete().")
    return {"deleted": info}


@op("fusion.connect")
def connect(p):
    comp, _ = comp_for(p, create=False)
    src = find_tool(comp, p["from"])
    dst = find_tool(comp, p["to"])
    inp = p.get("input") or main_input_name(dst)
    if not inp:
        fail("INVALID_ARGUMENT", f"Node '{p['to']}' has no main input; specify 'input'.")
    known = {i["id"] for i in input_ids(dst)}
    if inp not in known:
        fail("INVALID_ARGUMENT", f"Node '{p['to']}' has no input '{inp}'.", sorted(x for x in known if x)[:80])
    check(dst.ConnectInput(inp, src), f"ConnectInput('{inp}')")
    return {"from": p["from"], "to": p["to"], "input": inp}


@op("fusion.disconnect")
def disconnect(p):
    comp, _ = comp_for(p, create=False)
    dst = find_tool(comp, p["node"])
    inp = p.get("input") or main_input_name(dst)
    check(dst.ConnectInput(inp, None), f"ConnectInput('{inp}', None)")
    return {"node": p["node"], "input": inp, "disconnected": True}


@op("fusion.set_inputs")
def set_node_inputs(p):
    comp, _ = comp_for(p, create=False)
    t = find_tool(comp, p["node"])
    comp.Lock()
    try:
        res = set_inputs(t, p["inputs"], p.get("time"))
    finally:
        comp.Unlock()
    return {"node": p["node"], "results": res, "failed": [k for k, v in res.items() if not v["ok"]]}


@op("fusion.get_inputs")
def get_node_inputs(p):
    comp, _ = comp_for(p, create=False)
    t = find_tool(comp, p["node"])
    ids = input_ids(t)
    if p.get("withValues"):
        for i in ids:
            try:
                i["value"] = to_plain(t.GetInput(i["id"]))
            except Exception:
                i["value"] = None
    return {"node": tool_info(t), "inputs": ids}


@op("fusion.keyframes")
def keyframes(p):
    """Animate an input: adds a BezierSpline modifier then sets values at frames."""
    comp, _ = comp_for(p, create=False)
    t = find_tool(comp, p["node"])
    inp = p["input"]
    comp.Lock()
    try:
        modifier = "XYPath" if p.get("path") else "BezierSpline"
        t.AddModifier(inp, modifier)
        res = {}
        for k in p["keys"]:
            v = k["value"]
            if isinstance(v, (list, tuple)):
                v = {i + 1: x for i, x in enumerate(v)}
            t.SetInput(inp, v, float(k["frame"]))
            res[str(k["frame"])] = to_plain(t.GetInput(inp, float(k["frame"])))
    finally:
        comp.Unlock()
    return {"node": p["node"], "input": inp, "modifier": modifier, "keys": res}


@op("fusion.expression")
def expression(p):
    comp, _ = comp_for(p, create=False)
    t = find_tool(comp, p["node"])
    inp = getattr(t, p["input"], None)
    if inp is None:
        fail("INVALID_ARGUMENT", f"Input '{p['input']}' not found on '{p['node']}'.")
    inp.SetExpression(p["expression"])
    return {"node": p["node"], "input": p["input"], "expression": inp.GetExpression()}


@op("fusion.save_settings")
def save_settings(p):
    """Save a node's settings (.setting file) — the scriptable basis for macros/templates."""
    comp, _ = comp_for(p, create=False)
    path = p["path"]
    if os.path.exists(path) and not p.get("overwrite"):
        fail("FILE_EXISTS", f"{path} already exists.")
    names = p["nodes"]
    found = [find_tool(comp, n) for n in names]
    comp.SetActiveTool(None) if has(comp, "SetActiveTool") else None
    if len(found) == 1:
        check(found[0].SaveSettings(path), "SaveSettings")
    else:
        # Copy selection to settings table then write it.
        flow = comp.CurrentFrame.FlowView if comp.CurrentFrame else None
        if flow is None:
            fail("UNSUPPORTED", "Saving multi-node macros requires the Fusion page to be open (FlowView unavailable).")
        flow.Select()
        for t in found:
            flow.Select(t, True)
        settings = comp.CopySettings()
        check(comp.SaveSettings(path, settings) if has(comp, "SaveSettings") else None, "SaveSettings")
    if not os.path.isfile(path):
        fail("OPERATION_FAILED", f"{path} was not written.")
    return {"path": path, "nodes": names}


@op("fusion.load_settings")
def load_settings(p):
    comp, _ = comp_for(p)
    if not os.path.isfile(p["path"]):
        fail("FILE_NOT_FOUND", f"{p['path']} does not exist.")
    before = {tool_info(t)["name"] for t in tools(comp)}
    comp.Paste(comp.LoadSettings(p["path"])) if has(comp, "LoadSettings") else fail("UNSUPPORTED", "LoadSettings unavailable")
    after = {tool_info(t)["name"] for t in tools(comp)}
    return {"added": sorted(after - before)}


@op("fusion.item_comps")
def item_comps(p):
    it = timeline_item(p)
    return {"item": item_summary(it), "comps": list(it.GetFusionCompNameList() or [])}


@op("fusion.import_comp")
def import_comp(p):
    it = timeline_item(p)
    if not os.path.isfile(p["path"]):
        fail("FILE_NOT_FOUND", f"{p['path']} does not exist.")
    check(it.ImportFusionComp(p["path"]), "ImportFusionComp")
    return {"comps": list(it.GetFusionCompNameList() or [])}


@op("fusion.export_comp")
def export_comp(p):
    it = timeline_item(p)
    if os.path.exists(p["path"]) and not p.get("overwrite"):
        fail("FILE_EXISTS", f"{p['path']} already exists.")
    check(it.ExportFusionComp(p["path"], int(p.get("compIndex", 1))), "ExportFusionComp")
    return {"path": p["path"], "bytes": os.path.getsize(p["path"]) if os.path.isfile(p["path"]) else None}


@op("fusion.insert_composition")
def insert_composition(p):
    """Insert a new Fusion Composition clip at the playhead of the current timeline."""
    tl = timeline(p.get("timeline"))
    if p.get("timecode"):
        tl.SetCurrentTimecode(p["timecode"])
    it = check(tl.InsertFusionCompositionIntoTimeline(), "InsertFusionCompositionIntoTimeline")
    return {"item": item_summary(it)}


@op("fusion.build")
def build(p):
    """Build a node graph from a declarative spec: nodes, connections, keyframes.

    nodes: [{name, type, inputs}], connections: [{from, to, input?}], keyframes: [{node, input, keys}]
    output: node to connect to MediaOut (optional)
    """
    comp, it = comp_for(p)
    created, errors = [], []
    comp.Lock()
    comp.StartUndo("MCP build")
    try:
        for n in p.get("nodes", []):
            try:
                t = add_tool(comp, n["type"], n.get("name"), n.get("x"), n.get("y"))
                info = tool_info(t)
                if n.get("inputs"):
                    r = set_inputs(t, n["inputs"])
                    bad = [k for k, v in r.items() if not v["ok"]]
                    if bad:
                        errors.append({"node": info["name"], "failedInputs": bad})
                created.append(info)
            except Exception as e:
                errors.append({"node": n.get("name"), "error": str(getattr(e, "message", e))})
        for c in p.get("connections", []):
            try:
                connect({**{k: p.get(k) for k in ("source", "itemId", "trackType", "trackIndex", "itemIndex", "timeline", "compIndex")}, **c})
            except Exception as e:
                errors.append({"connection": c, "error": str(getattr(e, "message", e))})
        for k in p.get("keyframes", []):
            try:
                keyframes({**{x: p.get(x) for x in ("source", "itemId", "trackType", "trackIndex", "itemIndex", "timeline", "compIndex")}, **k})
            except Exception as e:
                errors.append({"keyframe": k.get("node"), "error": str(getattr(e, "message", e))})
        if p.get("output"):
            outs = list((comp.GetToolList(False, "MediaOut") or {}).values())
            if outs:
                mo = outs[0]
                check(mo.ConnectInput(main_input_name(mo) or "Input", find_tool(comp, p["output"])), "connect output")
            else:
                errors.append({"output": p["output"], "error": "No MediaOut node in composition."})
    finally:
        comp.EndUndo(True)
        comp.Unlock()
    return {"created": created, "errors": errors, "ok": not errors, "item": item_summary(it) if it else None}


@op("fusion.render")
def render(p):
    comp, _ = comp_for(p, create=False)
    if not has(comp, "Render"):
        fail("UNSUPPORTED", "Composition.Render() is not available.")
    ok = comp.Render({"Wait": True}) if p.get("wait", True) else comp.Render()
    if not ok:
        fail("OPERATION_FAILED", "Fusion composition render returned False. Inside Resolve, Fusion comps are normally rendered with the timeline on the Deliver page (use render_* tools).")
    return {"rendered": True}
