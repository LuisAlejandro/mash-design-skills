---
name: mash-design-setup
description: Install, start, stop, or diagnose the Mash Design Skills local stack (Penpot + MCP + OpenDesign). Use when the user asks to start Penpot, OpenDesign, the design stack, mds start/setup/doctor, or when funnel skills report the daemon or MCP is down.
---

# Mash Design Skills stack

Owns the **machine-local** Compose stack. Does not implement UI. Does not spawn a host `opendesign` process. Does not run Compose from the app repo.

## Roots

| Root | Where | What |
| --- | --- | --- |
| App | `pwd -P` (Cursor basedir) | `.mash/designs/`, `.mash/design-system/`, app source |
| Skills | `$OD_SKILLS_ROOT` after `od_load` (this clone's `src/skills` while editing the toolkit, otherwise `~/.cursor/skills`) | `src/skills/` |
| Stack | `$MASH_DESIGN_STACK` or `~/.local/share/mash/design` | `docker-compose.yaml`, `penpot.env`, `bin/mds` |

```bash
STACK="${MASH_DESIGN_STACK:-$HOME/.local/share/mash/design}"
APP="$(pwd -P)"
MDS="${STACK}/bin/mds"
. "${STACK}/lib/od_daemon.sh"
od_load "$APP"
# SKILLS=$OD_SKILLS_ROOT
```

If `mds` is on `PATH`, use that. Otherwise use `"$MDS"`.

## When skills are missing

If `$SKILLS/mash-design-setup` is not installed, tell the user to run the toolkit installer once on this machine:

```bash
curl -fsSL https://raw.githubusercontent.com/LuisAlejandro/mash-design-skills/develop/install.sh | bash
```

Do not copy Compose or skills into the app.

## Commands

| User intent | Command |
| --- | --- |
| First time / missing `penpot.env` | `"$MDS" setup` (prompts for a local Penpot user and provider keys on a TTY; `--skip-user` / `--skip-auth` or `MASH_DESIGN_NONINTERACTIVE=1` skips) |
| Add or change provider keys | `"$MDS" auth` then wait for harness apply |
| Daemon or Penpot down | `"$MDS" start` |
| Health + CLIs + runnable table | `"$MDS" doctor` |
| Pause | `"$MDS" stop` |
| Remove containers, keep volumes | `"$MDS" down` |
| Wipe this stack’s volumes | `"$MDS" destroy` — prints the stack, project name, and every named volume at risk, then requires typing the exact project name to confirm (`MASH_DESIGN_CONFIRM_DESTROY=1` non-interactively). Does not uninstall the CLI or skills |
| Uninstall the machine pack | `"$MDS" uninstall` is a dry run. `"$MDS" uninstall --apply` removes the design payload in `~/.config/mash/design-install-manifest.json`: skills, agents, `penpot-local`, the stack pin, and `~/.local/share/mash/design`. Compose teardown asks for the project name (`MASH_DESIGN_CONFIRM_UNINSTALL=1` when there is no terminal). Keeps `.mash/` in app repos |

Never run `docker system prune` against the whole machine.

## After start

1. Confirm `GET http://127.0.0.1:7457/api/health` and `mds doctor`.
2. Penpot UI: http://localhost:9001 — log in with the local user from `mds setup`.
3. If port 7457 is busy, tell the user that port is taken. The host Open Design desktop app uses 7456; this stack uses 7457.
4. Reload the `penpot-local` stdio MCP in Cursor (`user-penpot-local` is the same snippet in `~/.cursor/mcp.json`). `mds setup` stores `PENPOT_ACCESS_TOKEN` and points that server at `~/.config/mash/headless`. No browser plugin. This pack merges only that server. Context7 belongs to Mash Programming Skills.
5. Agent jobs: `"$MDS" setup` or `"$MDS" auth` writes provider keys to `$STACK/penpot.env`. `"$MDS" start` applies them and seeds the OpenDesign studio (`onboardingCompleted` + `agentId` from pick-agent) so http://127.0.0.1:7457 skips Cloud onboarding. Do not hand-edit the toolkit clone `penpot.env` and expect Compose to see it.

## Funnel skills

On OpenDesign health failure, stop and run this skill (or `"$MDS" start`). Do not start a sidecar daemon. Then resume `od-design-candidates`, `od-design-system`, or `penpot-design-pipeline`.
