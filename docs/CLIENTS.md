# MCP clients

How to connect DaVinci Resolve MCP to each client. The one-line installers configure most of these automatically.

## Claude Desktop and Claude Code

The server runs locally over **stdio**; Claude starts it as a child process.

### Claude Desktop (Windows)

1. Build: `pnpm build` (or run `scripts\install.ps1`, which prints a ready config snippet).
2. Open `%APPDATA%\Claude\claude_desktop_config.json` (Claude Desktop → Settings → Developer → Edit Config).
3. Add (use absolute paths, doubled backslashes):

```json
{
  "mcpServers": {
    "davinci-resolve": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\you\\DaVinci-Resolve-MCP\\dist\\index.js"],
      "env": {
        "RESOLVE_PYTHON": "C:\\Python312\\python.exe",
        "ALLOWED_WRITE_PATHS": "D:\\Exports;C:\\Users\\you\\Videos"
      }
    }
  }
}
```

4. Fully quit Claude Desktop (tray icon → Quit) and reopen it. The tools appear under the tools menu.

`env` is optional — `.env` in the project folder is read too.

### Claude Code

```powershell
claude mcp add davinci-resolve -- node C:\Users\you\DaVinci-Resolve-MCP\dist\index.js
```

Or commit a project `.mcp.json` (see `examples/mcp.json`).

### Tool count

The server exposes 337 tools. If your client prefers fewer, set `MCP_TOOL_CATEGORIES`, for example:

```json
"env": { "MCP_TOOL_CATEGORIES": "application,projects,media,timeline,editing,effects,titles,color,audio,rendering,workflows" }
```

### Try it

> Check the Resolve status, then create a 4K 24 fps project called "Test", import C:\Users\you\Videos\clip.mp4, put it on a new timeline, add a teal-and-orange look and export it for YouTube 4K to my Videos folder.

### Troubleshooting

- **Server not listed**: check `%APPDATA%\Claude\logs\mcp-server-davinci-resolve.log`; usually a wrong path to `node.exe` or `dist\index.js`.
- **`RESOLVE_NOT_RUNNING`**: start Resolve or ask Claude to run `resolve_launch`; check *External scripting using = Local*.
- **`PYTHON_NOT_FOUND`**: set `RESOLVE_PYTHON` to the full path of 64-bit `python.exe`.
- More: [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## ChatGPT

ChatGPT talks to MCP servers over **HTTPS** (remote MCP / connectors). It cannot launch a local stdio process, so you run this server's **Streamable HTTP** transport on the PC that runs Resolve and make it reachable over HTTPS.

> The server controls your desktop application. Only expose it with authentication, only for as long as you need it, and never with *External scripting using = Network* in Resolve.

### 1. Run the HTTP transport with a token

```powershell
powershell -ExecutionPolicy Bypass -File scripts\new-token.ps1
```

Put the value in `.env`:

```
MCP_TRANSPORT=http
MCP_HTTP_HOST=127.0.0.1
MCP_HTTP_PORT=3334
MCP_AUTH_TOKEN=<token>
```

```powershell
node dist\index.js --transport http
```

Local check: `http://127.0.0.1:3334/healthz` → `{"ok":true}`.

### 2. Expose it over HTTPS

Keep the server bound to `127.0.0.1` and put an HTTPS tunnel or reverse proxy in front of it, for example:

- **Cloudflare Tunnel**: `cloudflared tunnel --url http://127.0.0.1:3334`
- **ngrok**: `ngrok http 3334`
- A reverse proxy (Caddy / nginx / IIS) with a TLS certificate on your own domain.

The public URL of the MCP endpoint is `https://<host>/mcp`.

### 3. Authentication options

| ChatGPT connector auth | Server setting |
|---|---|
| Bearer / API-key header | `MCP_AUTH_TOKEN` (header `Authorization: Bearer <token>`) |
| No authentication (header not configurable) | `MCP_SECRET_PATH=<long random>` and use `https://<host>/mcp/<secret>` as the URL. Treat the URL as a password. |
| OAuth | Not built in; put an OAuth-capable gateway (e.g. Cloudflare Access) in front of the tunnel. |

Requests without valid credentials get `401`; unknown paths get `404`. When bound to loopback without a token, DNS-rebinding protection only allows `127.0.0.1` / `localhost` Host headers.

### 4. Add the connector in ChatGPT

1. ChatGPT → **Settings → Apps & Connectors → Advanced → Developer mode** (on plans that offer it).
2. **Create connector**: name *DaVinci Resolve*, MCP server URL `https://<host>/mcp` (or the secret-path URL), choose the authentication that matches step 3.
3. In a chat, enable the connector and ask: *"Check the DaVinci Resolve status."*

Availability of custom MCP connectors and the exact menu names depend on your ChatGPT plan and may change; consult OpenAI's current documentation if the menus differ.

If ChatGPT limits the number of tools, set `MCP_TOOL_CATEGORIES` (see [CONFIGURATION.md](CONFIGURATION.md)).

### Local development testing

Use the MCP Inspector against the HTTP endpoint:

```powershell
npx @modelcontextprotocol/inspector
```

Connect to `http://127.0.0.1:3334/mcp` with header `Authorization: Bearer <token>`.

### Troubleshooting

- **401**: token mismatch, or the connector sends no header (use `MCP_SECRET_PATH`).
- **400 "No valid session"**: the client sent a non-initialize request without `mcp-session-id`; reconnect the connector.
- **Tunnel works but tools fail with `RESOLVE_NOT_RUNNING`**: Resolve must be running on the same PC as the server.
- Long renders: ChatGPT may time out waiting; use `render_export_timeline { wait: false }` then `render_get_status`.
