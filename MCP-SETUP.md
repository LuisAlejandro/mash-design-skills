# Penpot MCP (Cursor consumes a URL)

`mmd start` runs the official `penpot-mcp` container and publishes **http://localhost:4401**. Cursor should only consume that URL. Do not use `docker exec` or a `command` entry in `mcp.json`.

## 1. Start the stack

From an app after `install.sh`, or from this clone:

```bash
mmd setup   # first time
mmd start
```

Penpot UI: http://localhost:9001  
MCP HTTP: http://localhost:4401/mcp (legacy SSE: http://localhost:4401/sse)

`install.sh` merges the MCP snippet into the **app** `.cursor/mcp.json` and starts the stack unless it is already healthy.

## 2. Point Cursor at the URL

Project config (what the installer writes) uses the name `penpot-local`:

```json
{
  "mcpServers": {
    "penpot-local": {
      "url": "http://localhost:4401/mcp",
      "type": "http"
    }
  }
}
```

If you put the same snippet in `~/.cursor/mcp.json`, Cursor shows it as `user-penpot-local` (`user-` = user config). Skills accept **either** name.

See [mcp.json.example](mcp.json.example).

## 3. Connect the plugin in Penpot

The HTTP server is not enough by itself. The official MCP talks to the **open file** through Penpot’s MCP plugin.

1. Open http://localhost:9001 and log in with the local user from `mmd setup`.
2. Open a design file.
3. **File → MCP Server → Connect** (keep that tab and the plugin connected while agents run).

If the daemon or MCP is down, run `mmd start` or invoke the **mmd-setup** skill.

## Alternative URL (Integrations token)

If 4401 is not reachable, use the frontend proxy instead. In Penpot: **Your account → Integrations → MCP Server**, copy the URL (includes `userToken`):

`http://localhost:9001/mcp/stream?userToken=YOUR_MCP_KEY`

Do not commit that token. Docs: [Penpot MCP](https://help.penpot.app/mcp/), [Docker install](https://help.penpot.app/technical-guide/getting-started/docker/).

## Admin CLI (optional)

`mmd setup` already creates the local profile (registration is disabled). For an extra user:

```bash
docker exec -T penpot-penpot-backend-1 python3 manage.py create-profile \
  -n "Name" -e you@local.test -p 'secret' --skip-tutorial --skip-walkthrough
```
