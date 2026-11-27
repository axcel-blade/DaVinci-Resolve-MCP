# MCP Clients

The server speaks MCP over **stdio** (local clients that launch a process) and **Streamable HTTP** (remote clients).
The one-line installers configure the clients below automatically; this page is for manual setup.

| Client | Transport | Config |
|---|---|---|
| Claude Desktop | stdio | `%APPDATA%\Claude\claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`) — or run `scripts\install.ps1 -ConfigureClaude`; see [INSTALLATION.md §5](INSTALLATION.md#5-claude-desktop-stdio) |
| Claude Code | stdio | `claude mcp add --scope user davinci-resolve -e RESOLVE_ADAPTER=python -- node C:\path\to\DaVinci-Resolve-MCP\dist\index.js` (or a project `.mcp.json`) |
| VS Code (Copilot agent mode) | stdio | `.vscode/mcp.json` (`servers` key, `type: "stdio"`) |
| Cursor | stdio | `~/.cursor/mcp.json` or project `.cursor/mcp.json` |
| Windsurf | stdio | `~/.codeium/windsurf/mcp_config.json`, same `mcpServers` shape as Claude Desktop |
| Gemini CLI | stdio | `~/.gemini/settings.json`, `mcpServers` key |
| Codex CLI | stdio | `codex mcp add davinci-resolve --env RESOLVE_ADAPTER=python -- node <repo>\dist\index.js` |
| ChatGPT (connectors / developer mode) | **remote HTTPS** only | Run `--transport http` with `MCP_SECRET_PATH` (or `MCP_AUTH_TOKEN`), expose it through an HTTPS tunnel. See [INSTALLATION.md §6](INSTALLATION.md#6-chatgpt-remote-https). |

## Tool count

The server exposes 342 tools. If a client prefers fewer, set `MCP_TOOL_CATEGORIES` in its `env` block, for example:

```json
"env": { "MCP_TOOL_CATEGORIES": "application,projects,media,timeline,editing,effects,titles,color,audio,rendering,workflows" }
```

## Several clients at once

Each stdio client starts its own server process. That is fine: every process drives the same DaVinci Resolve through its scripting API,
and each bridge serialises its own calls. Calls from two processes can interleave, so avoid editing the same project from two
clients at the same time. Alternatively run one HTTP server (`pnpm start:http`) and point every HTTP-capable client at it.

## Verifying a client

Ask the assistant to call `resolve_get_status`. Expected: the source (`resolve`), a DaVinci Resolve version and the open project and timeline.
If the server is not listed, check the client's MCP log (Claude Desktop: `%APPDATA%\Claude\logs\mcp-server-davinci-resolve.log`); usually
a wrong path to `node` or `dist\index.js`. More: [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
