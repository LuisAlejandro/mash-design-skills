# penpot-local

This directory is the Penpot MCP server in Mash Design Skills. Install copies it to `~/.config/mash/headless` and Cursor runs `node dist/server.js` as `penpot-local`.

The server edits files over Penpot RPC at `PENPOT_BASE_URL` with `PENPOT_ACCESS_TOKEN`. PNG, SVG, and PDF export uses `PENPOT_LOGIN_EMAIL` and `PENPOT_LOGIN_PASSWORD` with the exporter container. Library colors, typographies, and token sets live in the Penpot file. `PENPOT_TOKENS_PATH` is an optional on-disk JSON file.

## Develop

```bash
npm install
npm test
npm run build
```

`npm run test:integration` talks to a running Penpot. Set `PENPOT_BASE_URL` and `PENPOT_ACCESS_TOKEN` first. Unit tests do not.

`mds setup` writes the access token, email, and password into the stack `penpot.env`. The installer copies those into `~/.cursor/mcp.json`.
