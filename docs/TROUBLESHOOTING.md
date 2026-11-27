# Troubleshooting

Start with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-deps.ps1
```

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-bridge.ps1
```

and the `resolve_check_scripting_connection` tool, which reports which layer fails.

| Error code / symptom | Cause | Fix |
|---|---|---|
| `RESOLVE_NOT_INSTALLED` | Resolve not found | Install it or set `RESOLVE_INSTALL_DIR` / `RESOLVE_SCRIPT_LIB` |
| `RESOLVE_NOT_RUNNING` | Resolve closed, or external scripting off | Start Resolve (`resolve_launch`); Preferences → System → General → External scripting using = **Local**; restart Resolve |
| `SCRIPTING_UNAVAILABLE` | Python can't load `fusionscript.dll` | Use 64-bit Python; check `RESOLVE_SCRIPT_API` points at the `Scripting` folder containing `Modules` |
| `PYTHON_NOT_FOUND` | `python` not on PATH for the MCP client | Set `RESOLVE_PYTHON` to the full `python.exe` path (Claude Desktop does not inherit your shell PATH changes until restarted) |
| `TIMEOUT` | A modal dialog in Resolve (e.g. "save project?"), or a very long call | Dismiss dialogs; raise `RESOLVE_TIMEOUT_MS`. The bridge restarts itself after a timeout |
| `NO_PROJECT` / `NO_TIMELINE` | Nothing open | `project_open` / `project_create`, `timeline_open` / `timeline_create` |
| `CONFIRMATION_REQUIRED` | Destructive tool called without `confirm: true` | Expected: the assistant must ask you first |
| `PATH_NOT_ALLOWED` | Write outside allowed folders | Use a folder under `ALLOWED_WRITE_PATHS` or add one |
| `FILE_EXISTS` | Export target exists | Choose another name or pass `overwrite: true` after confirming |
| `UNSUPPORTED` | Feature not in this Resolve version / not scriptable | Read the `hint`; see [SUPPORTED_FEATURES.md](SUPPORTED_FEATURES.md). Many editing/audio/photo tools need Resolve 21 |
| `OPERATION_FAILED: SetLUT` | LUT outside Resolve's LUT folders | Handled automatically (staged into `…\Support\LUT\MCP`); if it still fails check write access to `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\LUT` |
| Transition not added | No media handles at the edit | Trim the clips (`clip_trim`) so both sides have spare frames, then `transition_add` |
| Title pushed clips to the right | `title_create { mode: "insert" }` ripple-inserts (Resolve behaviour) | Use the default `mode: "overlay"` |
| Photos imported as one "sequence" clip | Resolve groups numbered images imported together | `photo_import` / `media_import_image` import one file per call; for generic `media_import` use those tools for stills |
| Codec not available | Not installed / not licensed (e.g. H.265 on free version) | `render_list_formats { withCodecs: true }`; presets fall back through candidates |
| Render "complete" but no file | Unusual custom name / target | `render_verify_output` on the real path; tool never claims success without the file |
| Volume/pan "unsupported" | Resolve < 21 | Use the Fairlight mixer manually |
| ResolveFX parameters don't change | Not scriptable | Use `engine: "fusion"` effects, whose inputs are scriptable |

## Logs

- Server: `logs\mcp-YYYY-MM-DD.log` (JSON lines; set `LOG_LEVEL=debug` for bridge timings and Python stderr)
- Operations: `logs\operations-YYYY-MM-DD.jsonl` — or call `mcp_recent_operations`
- Claude Desktop: `%APPDATA%\Claude\logs\mcp-server-davinci-resolve.log`

## Reset the bridge

The Python worker restarts automatically after a crash or timeout. To force it, restart the MCP client (or the server process).
