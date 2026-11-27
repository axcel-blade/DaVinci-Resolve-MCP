--[==[
Fusion Lua helpers for the DaVinci Resolve MCP.

Run through Resolve's fuscript executable by src/resolve/bridge/lua-adapter.ts:
  fuscript -l lua fusion_helpers.lua <helper> <json-args>
  e.g. fuscript -l lua fusion_helpers.lua list_tools {}

Can also be run from the Fusion console (Workspace > Console, Lua tab):
  HELPER = "comp_summary"; dofile([[C:\path\toesolve-scriptsusion_helpers.lua]])
Each helper prints one JSON line.
]==]

local function json(v)
  local t = type(v)
  if t == "nil" then return "null" end
  if t == "boolean" or t == "number" then return tostring(v) end
  if t == "string" then
    return '"' .. v:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', '\\n'):gsub('\r', '\\r') .. '"'
  end
  if t == "table" then
    local isArray = #v > 0
    local parts = {}
    if isArray then
      for _, x in ipairs(v) do parts[#parts + 1] = json(x) end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    for k, x in pairs(v) do parts[#parts + 1] = json(tostring(k)) .. ":" .. json(x) end
    return "{" .. table.concat(parts, ",") .. "}"
  end
  return json(tostring(v))
end

local function connect()
  local resolve = Resolve and Resolve() or (bmd and bmd.scriptapp("Resolve"))
  if not resolve then return nil, "Resolve not reachable" end
  return resolve:Fusion(), nil
end

local helpers = {}

-- Registered Fusion tool IDs (useful to validate node types before AddTool).
function helpers.list_tools(args)
  local fu, err = connect()
  if not fu then return { error = err } end
  local out = {}
  local reg = fu:GetRegList(1) -- CT_Tool
  for _, r in pairs(reg or {}) do
    local a = r:GetAttrs()
    out[#out + 1] = { id = a.REGS_ID, name = a.REGS_Name, category = a.REGS_Category }
  end
  return { tools = out }
end

-- Nodes in the current composition with their types.
function helpers.comp_summary(args)
  local fu, err = connect()
  if not fu then return { error = err } end
  local comp = fu:GetCurrentComp()
  if not comp then return { error = "No current composition" } end
  local nodes = {}
  for _, t in pairs(comp:GetToolList(false)) do
    local a = t:GetAttrs()
    nodes[#nodes + 1] = { name = a.TOOLS_Name, type = a.TOOLS_RegID }
  end
  return { name = comp:GetAttrs().COMPS_Name, nodes = nodes }
end

local name = HELPER or (arg and arg[1]) or "comp_summary"
ARGS = ARGS or (arg and arg[2])
local fn = helpers[name]
if not fn then
  print(json({ error = "unknown helper " .. tostring(name) }))
else
  local ok, res = pcall(fn, ARGS)
  print(json(ok and res or { error = tostring(res) }))
end
