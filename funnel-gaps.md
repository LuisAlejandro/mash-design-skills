# Funnel gap notes

The skill chain is wired: optional `od-design-system`, candidates, human pick, import (`handoff.json`), map, implement, then PNG review / sync / iterator. This is leftover risk after the contract fixes, not a live pass.

## Will still block a first run

Workspace [`.cursor/mcp.json`](.cursor/mcp.json) in this toolkit clone may list unrelated servers. Import, implement, reviewer, and iterator call MCP against `penpot-local` or `user-penpot-local`. `install.sh` merges `penpot-local` into the **app** `.cursor/mcp.json`. Without the plugin, an open Penpot file, and one of those server names, import never draws a board.

The HTML→Penpot tree walk is still MCP `execute_code`. Generated token/color/typography scripts are deterministic, but text, images, and nested layout can still drop. `PENPOT_IMPORT_HANDOFF` `BLOCKERS` must stay honest when that happens.

This repository is Compose and skills, not an application. `scan-and-catalog` will report `framework: unknown`. Map still writes rules from Penpot plus `rosey/design-system/DESIGN.md` when that file exists.

## Not verified live

These checks were not run against a running stack:

1. Daemon down → `mmd start` (not a host sidecar).
2. Import → a selectable board and `handoff.json` with `rootBoardId`.
3. PNG review against a live app URL.

Live MCP remains a manual `mmd doctor` plus plugin check.
