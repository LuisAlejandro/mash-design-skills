---
name: mmd-setup
description: Install, start, stop, or diagnose the MMD Skills local stack (Penpot + MCP + OpenDesign). Use when the user asks to start Penpot, OpenDesign, the design stack, mmd start/setup/doctor, or when funnel skills report the daemon or MCP is down.
---

# MMD Skills stack

Owns the **machine-local** Compose stack. Does not implement UI. Does not spawn a host `opendesign` process. Does not run Compose from the app repo.

## Communication while using this skill

**Caveman lite** for assistant status prose: strip filler and hedging; keep articles and full sentences; stay professional and tight.

## Roots

| Root | Where | What |
| --- | --- | --- |
| App | `pwd -P` (Cursor basedir) | `rosey/designs/`, `rosey/design-system/`, app source |
| Skills | `$OD_SKILLS_ROOT` after `od_load` (env, this clone while editing the toolkit, or `~/.cursor/skills`) |
| Stack | `$MMD_STACK_ROOT` or `~/.local/share/mmd-skills` | `docker-compose.yaml`, `penpot.env`, `bin/mmd` |

```bash
STACK="${MMD_STACK_ROOT:-$HOME/.local/share/mmd-skills}"
APP="$(pwd -P)"
MMD="${STACK}/bin/mmd"
. "${STACK}/lib/od_daemon.sh"
od_load "$APP"
# SKILLS=$OD_SKILLS_ROOT
```

If `mmd` is on `PATH`, use that. Otherwise use `"$MMD"`.

## When skills are missing

If `$SKILLS/mmd-setup` is not installed, tell the user to run the toolkit installer once on this machine:

```bash
curl -fsSL https://raw.githubusercontent.com/LuisAlejandro/mmd-skills/develop/install.sh | bash
```

Do not copy Compose or skills into the app.

## Commands

| User intent | Command |
| --- | --- |
| First time / missing `penpot.env` | `"$MMD" setup` (prompts for a local Penpot user and provider keys on a TTY; `--skip-user` / `--skip-auth` or `MMD_NONINTERACTIVE=1` skips) |
| Add or change provider keys | `"$MMD" auth` then wait for harness apply |
| Daemon or Penpot down | `"$MMD" start` |
| Health + CLIs + runnable table | `"$MMD" doctor` |
| Pause | `"$MMD" stop` |
| Remove containers, keep volumes | `"$MMD" down` |
| Wipe this stack’s volumes | `"$MMD" destroy` — prints the stack, project name, and every named volume at risk, then requires typing the exact project name to confirm (`MMD_CONFIRM_DESTROY=1` non-interactively). Does not uninstall the CLI or skills |
| Uninstall the machine pack | `"$MMD" uninstall` — same exact-name confirmation as `destroy`, with its own bypass (`MMD_CONFIRM_UNINSTALL=1`; `destroy`'s bypass does not authorize this). Destroys the Compose project(s), then removes `~/.local/bin/mmd`, `~/.local/share/mmd-skills`, and named managed skills/agents under `~/.cursor`. Keeps `rosey/` |

Never run `docker system prune` against the whole machine.

## After start

1. Confirm `GET http://127.0.0.1:7457/api/health` and `mmd doctor`.
2. Penpot UI: http://localhost:9001 — log in with the local user from `mmd setup`.
3. If port 7457 is busy, tell the user that port is taken. The host Open Design desktop app uses 7456; this stack uses 7457.
4. Activate the `penpot-local` MCP in Cursor (`user-penpot-local` is the same snippet in `~/.cursor/mcp.json`). `install.sh` also merges Context7 (`https://mcp.context7.com/mcp`) for library docs some skills may use.
5. Agent jobs: `"$MMD" setup` or `"$MMD" auth` writes provider keys to `$STACK/penpot.env`. `"$MMD" start` applies them and seeds the OpenDesign studio (`onboardingCompleted` + `agentId` from pick-agent) so http://127.0.0.1:7457 skips Cloud onboarding. Do not hand-edit the toolkit clone `penpot.env` and expect Compose to see it.

## Funnel skills

On OpenDesign health failure, stop and run this skill (or `"$MMD" start`). Do not start a sidecar daemon. Then resume `od-design-candidates`, `od-design-system`, or `penpot-design-pipeline`.
