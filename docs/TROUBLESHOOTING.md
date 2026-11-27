# Troubleshooting

Start with diagnostics, then the bridge smoke test:

- Windows: `powershell -ExecutionPolicy Bypass -File scripts\diagnostics.ps1`, then `scripts\test-bridge.ps1`
- macOS: `./scripts/diagnostics.sh`, then `./scripts/test-bridge.sh`

In an MCP client, the `resolve_check_scripting_connection` tool reports which layer fails, and `mcp_bridge_status` and the `resolve://status` resource show the adapter, DaVinci Resolve's version, the queue and recent operations.
Server logs are JSON lines on stderr (Claude Desktop: `%APPDATA%\Claude\logs\mcp-server-davinci-resolve.log`) and in `logs\mcp-YYYY-MM-DD.log`; set `LOG_LEVEL=debug` for per-op timing and Python stderr. Every tool call is also recorded in `logs\operations-YYYY-MM-DD.jsonl` (or call `mcp_recent_operations`).

| Symptom | Cause | Fix |
|---|---|---|
| `RESOLVE_NOT_INSTALLED` | DaVinci Resolve not found at the detected or configured path | Install DaVinci Resolve, or set `RESOLVE_INSTALL_DIR` / `RESOLVE_SCRIPT_LIB` |
| `RESOLVE_NOT_RUNNING` | Resolve closed, or external scripting off | Start Resolve (or `resolve_launch`, or `RESOLVE_AUTO_LAUNCH=true`); Preferences → System → General → External scripting using = **Local**, then restart Resolve |
| `SCRIPTING_UNAVAILABLE` | Python cannot load `fusionscript` | Use 64-bit Python; check `RESOLVE_SCRIPT_API` points at the `Scripting` folder containing `Modules` |
| `PYTHON_NOT_FOUND` | `python` not on `PATH` for the MCP client | Set `RESOLVE_PYTHON` to the full `python.exe` path (Claude Desktop does not inherit shell `PATH` changes until restarted) |
| `TIMEOUT` | Modal dialog open in Resolve (e.g. "save project?"), or a very long call | Dismiss dialogs; raise `RESOLVE_TIMEOUT_MS` or use `background: true`. The worker restarts itself after a timeout; check `mcp_bridge_status` before retrying — the op may have completed |
| `BRIDGE_BUSY` | More than 100 calls queued | Wait for running jobs (`list_jobs`) and retry |
| `UNKNOWN_OP` | An op name not in the allowlist reached the bridge | A bug in a tool: please open an issue |
| `OPERATION_FAILED` with the API method name | The Resolve API returned `False`/`None` | The method and arguments are in `error.details`; check the item exists and the page/project state, then retry |
| `NO_PROJECT` / `NO_TIMELINE` | Nothing open | `project_open` / `project_create`, `timeline_open` / `timeline_create` |
| `NOT_FOUND` / `AMBIGUOUS` | Clip, timeline or item id/name not found or not unique | `media_list` / `timeline_get_clips`; prefer ids, names are case-sensitive |
| `PATH_NOT_ALLOWED` | Write outside the sandbox | Use a folder under `ALLOWED_WRITE_PATHS` or add one |
| `FILE_EXISTS` | Overwrite protection | Ask the user, then pass `overwrite: true` or pick a new name |
| `CONFIRMATION_REQUIRED` | Destructive tool | Ask the user and call again with `confirm: true` |
| `UNSUPPORTED` | Feature not in this Resolve version or not scriptable | `error.hint` names a workaround ([LIMITATIONS.md](LIMITATIONS.md), [SUPPORTED_FEATURES.md](SUPPORTED_FEATURES.md)); many editing, audio and photo tools need Resolve 21 |
| `PROVIDER_NOT_CONFIGURED` | AI provider tool without credentials | Set `AI_PROVIDER=openai` and `AI_API_KEY` |
| `OPERATION_FAILED: SetLUT` | LUT outside Resolve's LUT folders | Handled automatically (staged into `…\Support\LUT\MCP`); if it still fails check write access to `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\LUT` |
| Transition not added | No media handles at the edit | Trim the clips so both sides have spare frames, then `transition_add` |
| Title pushed clips to the right | `title_create { mode: "insert" }` ripple-inserts (Resolve behaviour) | Use the default `mode: "overlay"` |
| Photos imported as one "sequence" clip | Resolve groups numbered images imported together | `photo_import` / `media_import_image` import one file per call |
| Codec not available | Not installed or not licensed (e.g. H.265 on the free version) | `render_list_formats { withCodecs: true }`; presets fall back through candidates |
| Render "complete" but no file | Unusual custom name or target | `render_verify_output` on the real path; the tool never claims success without the file |
| ResolveFX parameters don't change | Not scriptable | Use `engine: "fusion"` effects, whose inputs are scriptable |
| Results say `source: "mock"` | `RESOLVE_ADAPTER=mock` | Remove it to use DaVinci Resolve |
| Claude Desktop shows no tools | Bad path in config, or Claude not restarted | Use an absolute path to `dist/index.js`, run `pnpm build`, fully quit and reopen Claude |
| ChatGPT "connector failed" | Tunnel down, wrong secret path | Check `https://<host>/healthz` and the full `/mcp/<secret>` URL |
| `401` / `403` from HTTP | Missing token / Host header not allowed (DNS-rebinding protection) | Verify `MCP_AUTH_TOKEN` or URL; connect via `127.0.0.1:<port>` or `localhost:<port>` |
| PowerShell blocked by execution policy | Machine policy | Run the scripts with `-ExecutionPolicy Bypass`; if a GPO forbids it, sign the scripts or ask IT |
