# Mash Design Skills agent guidance

This repository is the canonical Mash Design Skills source. The installer is
machine-global: it copies skills and agents into the Cursor, OpenCode, and Pi
homes and syncs the Penpot + OpenDesign Compose stack. It does not write
`AGENTS.md`, root `DESIGN.md`, or `.mash/*` trees into the app.

## Source trees

| Tree | Role |
| --- | --- |
| `src/skills/` | Canonical skills. The installer copies every directory here. |
| `src/agents/` | Canonical agents and report schemas. |
| `scripts/od_daemon.py`, `scripts/od_daemon.sh` | OpenDesign daemon helper. Copied to the stack `lib/`. |
| `bin/mds` | Stack lifecycle CLI. There is no programming-skills equivalent. |

Do not put the skill pack back under `.cursor/skills` in this checkout. That
would load a second copy beside the installed global skills. Do not put
libraries under `.agents/`; Pi treats that tree as agents.

## IDE homes

The installer copies skills to `~/.cursor/skills/`, `~/.config/opencode/skills/`,
and `~/.pi/agent/skills/`. It copies agents to `~/.cursor/agents/`,
`~/.config/opencode/agents/`, and `~/.agents/`.

Name skills in prose ("invoke the mash-design-setup skill"). Slash syntax
differs per IDE, and these files are copied to all three.

## Machine paths

| Store | Path | What it holds |
| --- | --- | --- |
| Shared Mash config | `~/.config/mash/` | Also used by Mash Programming Skills |
| Design manifest | `~/.config/mash/design-install-manifest.json` | Skills, agents, dependency names, `penpot-local` |
| Design stack pin | `~/.config/mash/design-stack.json` | `stack_root` for the Compose directory |
| Design uninstaller | `~/.config/mash/uninstall-design.sh` | Dry run by default; `--apply` removes this pack |
| Skill dependencies | `~/.config/mash/node_modules/<skill>/`, `~/.config/mash/venvs/<skill>/` | Symlinked into each IDE copy |
| Compose stack | `~/.local/share/mash/design` | `docker-compose.yaml`, `penpot.env`, `bin/mds`. Override with `MASH_DESIGN_STACK` |

Do not write `~/.config/mash/install-manifest.json`. That file belongs to
Mash Programming Skills.

Checkout variable: `MASH_DESIGN_SKILLS`. Config directory variable:
`MASH_CONFIG_DIR`.

## App working files

Design skills write `.mash/designs/` and `.mash/design-system/` in the app.
Root `DESIGN.md` stays at the app root. The installer does not create those
paths.

## Scope: what this repo does not own

This repo does not ship planning, implementation, review, or release skills,
Hindsight, or always-on rules. Those live in `mash-programming-skills`. The only
MCP server this installer merges is `penpot-local`. `context7`, `github`,
`sentrux`, `cua-driver`, `agent-browser`, and `chrome-devtools` stay with the
programming pack.

Tool skills keep their own names (`od-*`, `penpot-*`). The product skill is
`mash-design-setup`. The CLI stays `mds`.
