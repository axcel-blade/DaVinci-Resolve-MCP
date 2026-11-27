import { z } from "zod";
import { absPath, hexColor, ItemRef, timelineArg, type ToolRegistry, clean, itemRef, run } from "./common.js";

/** Target composition: a timeline item's comp (default) or the Fusion page's current comp. */
const CompTarget = { ...ItemRef, source: z.enum(["item", "current"]).default("item"), compIndex: z.number().int().min(1).default(1) };
type CT = { source: string; compIndex: number; timeline?: string; itemId?: string; trackType?: string; trackIndex?: number; itemIndex?: number };
const target = (a: CT) => clean({ ...itemRef(a), source: a.source, compIndex: a.compIndex });

const nodeName = z.string().min(1).max(128).regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Fusion node names: letters, digits, underscore");
const inputs = z.record(z.string(), z.any()).describe("Fusion input id -> value (numbers, strings, [x,y] points)");

function rgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255) as [number, number, number];
}

type Spec = { nodes: { name: string; type: string; inputs?: Record<string, unknown> }[]; connections?: { from: string; to: string; input?: string }[]; keyframes?: { node: string; input: string; keys: { frame: number; value: unknown }[] }[]; output?: string };

export function registerFusion(reg: ToolRegistry): void {
  const category = "fusion";
  const s = { support: "fusion" as const, category };
  const build = (ctx: Parameters<Parameters<ToolRegistry["define"]>[0]["handler"]>[1], a: CT, spec: Spec, msg: string) =>
    run(ctx, "fusion.build", { ...target(a), ...spec }, (d) => ((d as { ok: boolean }).ok ? msg : `${msg} (with errors; see data.errors)`));

  reg.define({ ...s, name: "fusion_get_composition", readOnly: true, description: "Inspect a Fusion composition (item's comp, or the Fusion page's current comp): name, render range, nodes. create: true adds a comp to the item if it has none.", input: { ...CompTarget, create: z.boolean().default(false) }, handler: async (a, ctx) => run(ctx, "fusion.comp_info", { ...target(a), create: a.create }) });
  reg.define({ ...s, name: "fusion_get_nodes", readOnly: true, description: "List nodes with types and input connections.", input: CompTarget, handler: async (a, ctx) => run(ctx, "fusion.nodes", target(a)) });
  reg.define({
    ...s, name: "fusion_create_node",
    description: "Create any Fusion node by RegID or alias (TextPlus, Background, Merge, Transform, Blur, Glow, Camera3D, Shape3D, pEmitter...). The type is validated by Fusion; unknown types are reported. insertIntoChain puts it before MediaOut.",
    input: { ...CompTarget, type: z.string().min(1), name: nodeName.optional(), inputs: inputs.optional(), insertIntoChain: z.boolean().default(false), x: z.number().int().optional(), y: z.number().int().optional() },
    handler: async (a, ctx) => run(ctx, "fusion.create_node", clean({ ...target(a), type: a.type, name: a.name, inputs: a.inputs, insertIntoChain: a.insertIntoChain, x: a.x, y: a.y })),
  });
  reg.define({ ...s, name: "fusion_delete_node", destructive: true, description: "Delete a node (MediaIn/MediaOut protected).", input: { ...CompTarget, node: z.string() }, handler: async (a, ctx) => run(ctx, "fusion.delete_node", { ...target(a), node: a.node }) });
  reg.define({ ...s, name: "fusion_connect_nodes", description: "Connect node 'from' output into node 'to' input (default: its main input). Input names are validated against the node.", input: { ...CompTarget, from: z.string(), to: z.string(), input: z.string().optional().describe("e.g. Background, Foreground, Input, EffectMask, SceneInput1") }, handler: async (a, ctx) => run(ctx, "fusion.connect", clean({ ...target(a), from: a.from, to: a.to, input: a.input })) });
  reg.define({ ...s, name: "fusion_disconnect_nodes", description: "Disconnect a node's input.", input: { ...CompTarget, node: z.string(), input: z.string().optional() }, handler: async (a, ctx) => run(ctx, "fusion.disconnect", clean({ ...target(a), node: a.node, input: a.input })) });
  reg.define({ ...s, name: "fusion_set_node_input", description: "Set node inputs (verified by readback). With time, sets a keyframe value on an animated input.", input: { ...CompTarget, node: z.string(), inputs, time: z.number().optional() }, handler: async (a, ctx) => run(ctx, "fusion.set_inputs", clean({ ...target(a), node: a.node, inputs: a.inputs, time: a.time })) });
  reg.define({ ...s, name: "fusion_get_node_inputs", readOnly: true, description: "List a node's inputs (id, name, type, optional values).", input: { ...CompTarget, node: z.string(), withValues: z.boolean().default(false) }, handler: async (a, ctx) => run(ctx, "fusion.get_inputs", { ...target(a), node: a.node, withValues: a.withValues }) });

  reg.define({
    ...s, name: "fusion_create_text",
    description: "Create a Text+ node with text, font, size and color, merged over the clip (or output directly when overClip is false).",
    input: { ...CompTarget, text: z.string().max(5000), font: z.string().optional(), size: z.number().min(0).max(1).default(0.08), color: hexColor.default("#ffffff"), position: z.tuple([z.number(), z.number()]).default([0.5, 0.5]), name: nodeName.default("MCP_Text"), overClip: z.boolean().default(true) },
    handler: async (a, ctx) => {
      const [r, g, b] = rgb(a.color);
      const spec: Spec = { nodes: [{ name: a.name, type: "TextPlus", inputs: clean({ StyledText: a.text, Font: a.font, Size: a.size, Red1: r, Green1: g, Blue1: b, Center: a.position }) }] };
      if (a.overClip) {
        spec.nodes.push({ name: `${a.name}_Merge`, type: "Merge" });
        spec.connections = [{ from: a.name, to: `${a.name}_Merge`, input: "Foreground" }];
      }
      const r1 = await build(ctx, a, spec, "Text node created.");
      if (a.overClip) {
        // put the merge into the main chain: upstream -> Merge.Background, Merge -> MediaOut
        const ins = await ctx.bridge.call("fusion.nodes", target(a)) as { name: string; type: string; connections: Record<string, string> }[];
        const out = ins.find((n) => n.type === "MediaOut");
        const upstream = out?.connections.Input;
        if (upstream) await ctx.bridge.call("fusion.connect", { ...target(a), from: upstream, to: `${a.name}_Merge`, input: "Background" });
        if (out) await ctx.bridge.call("fusion.connect", { ...target(a), from: `${a.name}_Merge`, to: out.name, input: "Input" });
      }
      return r1;
    },
  });
  reg.define({
    ...s, name: "fusion_create_3d_text",
    description: "Build a 3D text scene: Text3D -> Merge3D (+ Camera3D + directional light) -> Renderer3D, connected to MediaOut.",
    input: { ...CompTarget, text: z.string().max(1000), extrusion: z.number().min(0).max(1).default(0.15), size: z.number().min(0).max(2).default(0.4), prefix: nodeName.default("MCP3D") },
    handler: async (a, ctx) => build(ctx, a, {
      nodes: [
        { name: `${a.prefix}_Text`, type: "Text3D", inputs: { StyledText: a.text, Size: a.size, ExtrusionDepth: a.extrusion } },
        { name: `${a.prefix}_Camera`, type: "Camera3D", inputs: { "Transform3DOp.Translate.Z": 3 } },
        { name: `${a.prefix}_Light`, type: "LightDirectional" },
        { name: `${a.prefix}_Merge`, type: "Merge3D" },
        { name: `${a.prefix}_Render`, type: "Renderer3D" },
      ],
      connections: [
        { from: `${a.prefix}_Text`, to: `${a.prefix}_Merge`, input: "SceneInput1" },
        { from: `${a.prefix}_Camera`, to: `${a.prefix}_Merge`, input: "SceneInput2" },
        { from: `${a.prefix}_Light`, to: `${a.prefix}_Merge`, input: "SceneInput3" },
        { from: `${a.prefix}_Merge`, to: `${a.prefix}_Render`, input: "SceneInput" },
      ],
      output: `${a.prefix}_Render`,
    }, "3D text scene built."),
  });
  reg.define({
    ...s, name: "fusion_create_background",
    description: "Create a Background node (solid color or gradient).",
    input: { ...CompTarget, color: hexColor.default("#000000"), gradientTo: hexColor.optional(), name: nodeName.default("MCP_Background"), connectToOutput: z.boolean().default(false) },
    handler: async (a, ctx) => {
      const [r, g, b] = rgb(a.color);
      const ins: Record<string, unknown> = { TopLeftRed: r, TopLeftGreen: g, TopLeftBlue: b, TopLeftAlpha: 1 };
      if (a.gradientTo) {
        const [r2, g2, b2] = rgb(a.gradientTo);
        // Four-corner background: left edge = color, right edge = gradientTo.
        Object.assign(ins, { Type: 3, TopRightRed: r2, TopRightGreen: g2, TopRightBlue: b2, TopRightAlpha: 1, BottomLeftRed: r, BottomLeftGreen: g, BottomLeftBlue: b, BottomLeftAlpha: 1, BottomRightRed: r2, BottomRightGreen: g2, BottomRightBlue: b2, BottomRightAlpha: 1 });
      }
      return build(ctx, a, { nodes: [{ name: a.name, type: "Background", inputs: clean(ins) }], output: a.connectToOutput ? a.name : undefined }, "Background created.");
    },
  });
  reg.define({
    ...s, name: "fusion_create_merge",
    description: "Create a Merge node compositing foreground over background (optionally wiring existing nodes) with blend/apply mode.",
    input: { ...CompTarget, background: z.string().optional(), foreground: z.string().optional(), name: nodeName.default("MCP_Merge"), blend: z.number().min(0).max(1).default(1), applyMode: z.string().optional().describe("Normal, Screen, Multiply, Overlay, ..."), connectToOutput: z.boolean().default(false) },
    handler: async (a, ctx) => build(ctx, a, {
      nodes: [{ name: a.name, type: "Merge", inputs: clean({ Blend: a.blend, ApplyMode: a.applyMode }) }],
      connections: [...(a.background ? [{ from: a.background, to: a.name, input: "Background" }] : []), ...(a.foreground ? [{ from: a.foreground, to: a.name, input: "Foreground" }] : [])],
      output: a.connectToOutput ? a.name : undefined,
    }, "Merge created."),
  });
  reg.define({
    ...s, name: "fusion_create_transform",
    description: "Create a Transform node (center, size, angle), optionally after an existing node.",
    input: { ...CompTarget, input: z.string().optional(), name: nodeName.default("MCP_Transform"), center: z.tuple([z.number(), z.number()]).optional(), size: z.number().optional(), angle: z.number().optional() },
    handler: async (a, ctx) => build(ctx, a, { nodes: [{ name: a.name, type: "Transform", inputs: clean({ Center: a.center, Size: a.size, Angle: a.angle }) }], connections: a.input ? [{ from: a.input, to: a.name }] : [] }, "Transform created."),
  });
  reg.define({
    ...s, name: "fusion_create_mask",
    description: "Create a mask (rectangle, ellipse, polygon, bspline) and optionally attach it as EffectMask of a node.",
    input: { ...CompTarget, shape: z.enum(["rectangle", "ellipse", "polygon", "bspline"]), name: nodeName.default("MCP_Mask"), center: z.tuple([z.number(), z.number()]).optional(), width: z.number().optional(), height: z.number().optional(), softEdge: z.number().min(0).optional(), invert: z.boolean().optional(), applyTo: z.string().optional() },
    handler: async (a, ctx) => {
      const type = { rectangle: "RectangleMask", ellipse: "EllipseMask", polygon: "PolylineMask", bspline: "BSplineMask" }[a.shape];
      return build(ctx, a, { nodes: [{ name: a.name, type, inputs: clean({ Center: a.center, Width: a.width, Height: a.height, SoftEdge: a.softEdge, Invert: a.invert === undefined ? undefined : a.invert ? 1 : 0 }) }], connections: a.applyTo ? [{ from: a.name, to: a.applyTo, input: "EffectMask" }] : [] }, "Mask created.");
    },
  });
  reg.define({
    ...s, name: "fusion_create_chroma_key",
    description: "Green/blue-screen removal: DeltaKeyer on the clip (inserted before MediaOut), optional background node merged behind.",
    input: { ...CompTarget, screen: z.enum(["green", "blue"]).default("green"), background: z.string().optional(), name: nodeName.default("MCP_Keyer") },
    handler: async (a, ctx) => {
      const [r, g, b] = a.screen === "green" ? [0.1, 0.8, 0.2] : [0.1, 0.2, 0.85];
      return run(ctx, "fusion.create_node", { ...target(a), type: "DeltaKeyer", name: a.name, inputs: { BackgroundRed: r, BackgroundGreen: g, BackgroundBlue: b }, insertIntoChain: true }, "Keyer inserted. Refine with fusion_set_node_input (e.g. pick the exact screen color).");
    },
  });
  reg.define({
    ...s, name: "fusion_create_particle_system",
    description: "Particle system: pEmitter -> (pDirectionalForce) -> pRender, merged over the clip.",
    input: { ...CompTarget, prefix: nodeName.default("MCP_Particles"), number: z.number().min(1).max(10000).default(50), lifespan: z.number().min(1).default(100), velocity: z.number().default(0.1), gravity: z.boolean().default(true) },
    handler: async (a, ctx) => build(ctx, a, {
      nodes: [
        { name: `${a.prefix}_Emitter`, type: "pEmitter", inputs: { Number: a.number, Lifespan: a.lifespan, Velocity: a.velocity } },
        ...(a.gravity ? [{ name: `${a.prefix}_Gravity`, type: "pDirectionalForce" }] : []),
        { name: `${a.prefix}_Render`, type: "pRender" },
      ],
      connections: a.gravity
        ? [{ from: `${a.prefix}_Emitter`, to: `${a.prefix}_Gravity` }, { from: `${a.prefix}_Gravity`, to: `${a.prefix}_Render` }]
        : [{ from: `${a.prefix}_Emitter`, to: `${a.prefix}_Render` }],
    }, "Particle system built (merge pRender over your footage with fusion_create_merge)."),
  });
  reg.define({ ...s, name: "fusion_create_camera", description: "Create a Camera3D node.", input: { ...CompTarget, name: nodeName.default("MCP_Camera"), z: z.number().default(3), angleOfView: z.number().optional() }, handler: async (a, ctx) => build(ctx, a, { nodes: [{ name: a.name, type: "Camera3D", inputs: clean({ "Transform3DOp.Translate.Z": a.z, AoV: a.angleOfView }) }] }, "Camera created.") });
  reg.define({ ...s, name: "fusion_create_light", description: "Create a 3D light (ambient, directional, point, spot).", input: { ...CompTarget, kind: z.enum(["ambient", "directional", "point", "spot"]).default("directional"), name: nodeName.default("MCP_Light"), intensity: z.number().optional(), color: hexColor.optional() }, handler: async (a, ctx) => { const c = a.color ? rgb(a.color) : undefined; return build(ctx, a, { nodes: [{ name: a.name, type: { ambient: "LightAmbient", directional: "LightDirectional", point: "LightPoint", spot: "LightSpot" }[a.kind], inputs: clean({ Intensity: a.intensity, Red: c?.[0], Green: c?.[1], Blue: c?.[2] }) }] }, "Light created."); } });
  reg.define({
    ...s, name: "fusion_create_3d_scene",
    description: "Empty 3D scene skeleton: Merge3D with Camera3D + light -> Renderer3D -> MediaOut. Add Shape3D/Text3D/ImagePlane3D into the Merge3D scene inputs.",
    input: { ...CompTarget, prefix: nodeName.default("MCP_Scene"), shape: z.enum(["none", "cube", "sphere", "plane", "torus", "cylinder", "cone"]).default("cube") },
    handler: async (a, ctx) => {
      const shapeMap: Record<string, string> = { cube: "SurfaceCubeInputs", sphere: "SurfaceSphereInputs", plane: "SurfacePlaneInputs", torus: "SurfaceTorusInputs", cylinder: "SurfaceCylinderInputs", cone: "SurfaceConeInputs" };
      const nodes: Spec["nodes"] = [
        { name: `${a.prefix}_Camera`, type: "Camera3D", inputs: { "Transform3DOp.Translate.Z": 4 } },
        { name: `${a.prefix}_Light`, type: "LightDirectional" },
        { name: `${a.prefix}_Merge`, type: "Merge3D" },
        { name: `${a.prefix}_Render`, type: "Renderer3D" },
      ];
      const conns: NonNullable<Spec["connections"]> = [
        { from: `${a.prefix}_Camera`, to: `${a.prefix}_Merge`, input: "SceneInput1" },
        { from: `${a.prefix}_Light`, to: `${a.prefix}_Merge`, input: "SceneInput2" },
        { from: `${a.prefix}_Merge`, to: `${a.prefix}_Render`, input: "SceneInput" },
      ];
      if (a.shape !== "none") {
        nodes.unshift({ name: `${a.prefix}_Shape`, type: "Shape3D", inputs: { Shape: shapeMap[a.shape] } });
        conns.push({ from: `${a.prefix}_Shape`, to: `${a.prefix}_Merge`, input: "SceneInput3" });
      }
      return build(ctx, a, { nodes, connections: conns, output: `${a.prefix}_Render` }, "3D scene built.");
    },
  });
  const key = z.object({ frame: z.number(), value: z.union([z.number(), z.string(), z.tuple([z.number(), z.number()]), z.array(z.number())]) });
  reg.define({
    ...s, name: "fusion_set_keyframe",
    description: "Animate a node input: adds a BezierSpline (or XYPath for points with path: true) and sets values at frames.",
    input: { ...CompTarget, node: z.string(), input: z.string(), keys: z.array(key).min(1), path: z.boolean().default(false) },
    handler: async (a, ctx) => run(ctx, "fusion.keyframes", { ...target(a), node: a.node, input: a.input, keys: a.keys, path: a.path }),
  });
  reg.define({
    ...s, name: "fusion_create_animation",
    description: "Preset animations on a node: fade_in/out (Blend on Merge or Alpha1 on Text+), scale_up (Size), spin (Angle), slide (Center), pulse (Size loop).",
    input: { ...CompTarget, node: z.string(), preset: z.enum(["fade_in", "fade_out", "scale_up", "spin", "slide_left", "slide_up", "pulse"]), start: z.number().int().min(0).default(0), frames: z.number().int().min(1).default(24), inputOverride: z.string().optional() },
    handler: async (a, ctx) => {
      const s0 = a.start, s1 = a.start + a.frames;
      const presets: Record<string, { input: string; keys: { frame: number; value: unknown }[]; path?: boolean }> = {
        fade_in: { input: "Blend", keys: [{ frame: s0, value: 0 }, { frame: s1, value: 1 }] },
        fade_out: { input: "Blend", keys: [{ frame: s0, value: 1 }, { frame: s1, value: 0 }] },
        scale_up: { input: "Size", keys: [{ frame: s0, value: 0 }, { frame: s1, value: 1 }] },
        spin: { input: "Angle", keys: [{ frame: s0, value: 0 }, { frame: s1, value: 360 }] },
        slide_left: { input: "Center", path: true, keys: [{ frame: s0, value: [1.5, 0.5] }, { frame: s1, value: [0.5, 0.5] }] },
        slide_up: { input: "Center", path: true, keys: [{ frame: s0, value: [0.5, -0.3] }, { frame: s1, value: [0.5, 0.5] }] },
        pulse: { input: "Size", keys: [0, 0.5, 1, 1.5, 2].map((t, i) => ({ frame: s0 + Math.round((a.frames * t) / 2), value: i % 2 ? 1.1 : 1 })) },
      };
      const p = presets[a.preset]!;
      return run(ctx, "fusion.keyframes", { ...target(a), node: a.node, input: a.inputOverride ?? p.input, keys: p.keys, path: Boolean(p.path) });
    },
  });
  reg.define({ ...s, name: "fusion_set_expression", description: "Set a SimpleExpression on a node input (e.g. 'time/24', 'Text1.Size*2').", input: { ...CompTarget, node: z.string(), input: z.string(), expression: z.string().max(2000) }, handler: async (a, ctx) => run(ctx, "fusion.expression", { ...target(a), node: a.node, input: a.input, expression: a.expression }) });
  reg.define({
    ...s, name: "fusion_build_graph",
    description: "Build a whole node graph from a declarative spec: nodes [{name,type,inputs}], connections [{from,to,input}], keyframes [{node,input,keys}], output node. All types/inputs validated; errors listed per node.",
    input: {
      ...CompTarget,
      nodes: z.array(z.object({ name: nodeName, type: z.string(), inputs: inputs.optional(), x: z.number().int().optional(), y: z.number().int().optional() })).min(1).max(200),
      connections: z.array(z.object({ from: z.string(), to: z.string(), input: z.string().optional() })).default([]),
      keyframes: z.array(z.object({ node: z.string(), input: z.string(), keys: z.array(key), path: z.boolean().optional() })).default([]),
      output: z.string().optional(),
    },
    handler: async (a, ctx) => build(ctx, a, { nodes: a.nodes, connections: a.connections, keyframes: a.keyframes, output: a.output }, "Graph built."),
  });
  reg.define({
    ...s, name: "fusion_create_macro",
    description: "Save one or more nodes as a reusable .setting file (macro/template). Load later with fusion_load_template. Multi-node save needs the Fusion page open.",
    input: { ...CompTarget, nodes: z.array(z.string()).min(1), path: absPath.refine((p) => p.toLowerCase().endsWith(".setting"), "path must end with .setting"), overwrite: z.boolean().default(false) },
    handler: async (a, ctx) => run(ctx, "fusion.save_settings", { ...target(a), nodes: a.nodes, path: ctx.paths.write(a.path, { overwrite: a.overwrite }), overwrite: a.overwrite }),
  });
  reg.define({ ...s, name: "fusion_load_template", description: "Paste a .setting template/macro into a composition.", input: { ...CompTarget, path: absPath }, handler: async (a, ctx) => run(ctx, "fusion.load_settings", { ...target(a), path: ctx.paths.read(a.path, { kind: "file" }) }) });
  reg.define({ ...s, name: "fusion_import_comp", description: "Import a .comp file as a new composition on a timeline item.", input: { ...ItemRef, path: absPath }, handler: async (a, ctx) => run(ctx, "fusion.import_comp", { ...itemRef(a), path: ctx.paths.read(a.path, { kind: "file" }) }) });
  reg.define({ ...s, name: "fusion_export_comp", description: "Export an item's composition to a .comp file.", input: { ...ItemRef, path: absPath, compIndex: z.number().int().min(1).default(1), overwrite: z.boolean().default(false) }, handler: async (a, ctx) => run(ctx, "fusion.export_comp", { ...itemRef(a), path: ctx.paths.write(a.path, { overwrite: a.overwrite }), compIndex: a.compIndex, overwrite: a.overwrite }) });
  reg.define({ ...s, name: "fusion_insert_composition", description: "Insert an empty Fusion Composition clip at the playhead (for motion graphics / logo animations).", input: { timeline: timelineArg, timecode: z.string().optional() }, handler: async (a, ctx) => run(ctx, "fusion.insert_composition", clean(a)) });
  reg.define({ ...s, name: "fusion_render_comp", description: "Render a Fusion composition (Composition.Render). Inside Resolve, comps usually render with the timeline: prefer render_* tools.", input: { ...CompTarget, wait: z.boolean().default(true) }, handler: async (a, ctx) => run(ctx, "fusion.render", { ...target(a), wait: a.wait }, undefined, ctx.config.resolve.renderTimeoutMs) });
}
