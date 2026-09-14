---
name: mmd-setup
description: Install, start, stop, or diagnose the MMD Skills local stack (Penpot + MCP + OpenDesign). Use when the user asks to start Penpot, OpenDesign, the design stack, mmd start/setup/doctor, or when funnel skills report the daemon or MCP is down.
---

# MMD Skills stack

Owns the **machine-local** Compose stack. Does not implement UI. Does not spawn a host `opendesign` process. Does not run Compose from the app repo.

## Communication while using this skill

**Caveman lite** for assistant status prose: strip filler and hedging; keep articles and full sentences; stay professional and tight.

## Stack vs app

| Root | Where | What |
| --- | --- | --- |
| App | git toplevel | Copied skills, `rosey/designs/`, `rosey/mmd-skills.json` |
| Stack | `$MMD_STACK_ROOT` or pin `stack_root` or `~/.local/share/mmd-skills` | `docker-compose.yaml`, `penpot.env`, `bin/mmd` |

```bash
REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd -P)"
PIN="${REPO}/rosey/mmd-skills.json"
STACK="${MMD_STACK_ROOT:-}"
if [ -z "$STACK" ] && [ -f "$PIN" ]; then
  STACK="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("stack_root") or "")' "$PIN")"
fi
STACK="${STACK:-$HOME/.local/share/mmd-skills}"
MMD="${STACK}/bin/mmd"
```

If `mmd` is on `PATH`, use that. Otherwise use `"$MMD"`.

## When skills are missing

If `.cursor/skills/mmd-setup` is not in this app, tell the user to run the toolkit installer from the app root:

```bash
/path/to/mmd-skills/install.sh
```

Do not copy Compose into the app.

## Commands

| User intent | Command |
| --- | --- |
| First time / missing `penpot.env` | `"$MMD" setup` (prompts for a local Penpot user and provider keys on a TTY; `--skip-user` / `--skip-auth` or `MMD_NONINTERACTIVE=1` skips) |
| Add or change provider keys | `"$MMD" auth` then wait for harness apply |
| Daemon or Penpot down | `"$MMD" start` |
| Health + CLIs + runnable table | `"$MMD" doctor` |
| Pause | `"$MMD" stop` |
| Remove containers, keep volumes | `"$MMD" down` |
| Wipe this stack’s volumes | `"$MMD" destroy` (confirm first) |

Never run `docker system prune` against the whole machine.

## After start

1. Confirm `GET http://127.0.0.1:7457/api/health` and `mmd doctor`.
2. Penpot UI: http://localhost:9001 — log in with the local user from `mmd setup`.
3. If port 7457 is busy, tell the user that port is taken. The host Open Design desktop app uses 7456; this stack uses 7457.
4. Activate the `penpot-local` MCP in Cursor (`user-penpot-local` is the same snippet in `~/.cursor/mcp.json`).
5. Agent jobs: `"$MMD" setup` or `"$MMD" auth` writes provider keys to `$STACK/penpot.env`. `"$MMD" start` applies them. Do not hand-edit the toolkit clone `penpot.env` and expect Compose to see it.

## Funnel skills

On OpenDesign health failure, stop and run this skill (or `"$MMD" start`). Do not start a sidecar daemon. Then resume `od-design-candidates`, `od-design-system`, or `penpot-design-pipeline`.
