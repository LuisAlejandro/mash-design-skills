# MMD Skills

Local design-to-code toolkit for Cursor. [OpenDesign](https://github.com/nexu-io/open-design) explores HTML. [Penpot](https://penpot.app) is the canonical file. Penpot implement ships code. This repo is not an application; you install the skills into **your app** and run Penpot + OpenDesign as a machine-local Docker stack.

```text
od-design-system? → od-design-candidates → [pick winner]
  → penpot-import-html → penpot-create-design-system → penpot-implement-design
  → reviewer (Penpot PNG vs live) → sync → iterator
  → (later) penpot-sync-code-to-design
```

After pick, identity is `rosey/designs/<page-slug>/penpot-import/handoff.json` (`pageSlug`, `pageId`, `rootBoardId`). Later stages read that file. Do not re-slugify the Penpot page title.

Skip `od-design-system` when `rosey/design-system/DESIGN.md` or `rosey/designs/design-system.json` already exists. Skip candidates and import when a Penpot frame already exists.

## Requirements

- Docker and Docker Compose v2
- Node.js / Python 3 for skill scripts (the installer runs `npm install` and a candidates venv)

## Install into your app

From the **app** repository, not this clone:

```bash
git clone <this-repo> /path/to/mmd-skills
cd /path/to/my-app
/path/to/mmd-skills/install.sh
```

That copies the Cursor skill pack and review agents into `.cursor/`, merges MCP `penpot-local` → `http://localhost:4401/mcp`, writes `rosey/mmd-skills.json`, and syncs the Compose stack to `~/.local/share/mmd-skills` (override with `MMD_STACK_ROOT`). It starts the stack unless OpenDesign already answers `/api/health`.

Do not run `install.sh` inside this toolkit clone.

Re-run `install.sh` to update. Flags: `--check`, `--no-stack`, `--no-start`, `--no-agents`. Batch: copy `autoinstall.list.example` to `autoinstall.list` and run `./autoinstall.sh`.

## After install

1. Open [http://localhost:9001](http://localhost:9001), create the first user, then open a file and **File → MCP Server → Connect**. Keep that tab open while agents run.
2. Compose OpenDesign uses port `7457` so it does not collide with a host Open Design app on `7456`.
3. Cursor uses project MCP `penpot-local`, or the same snippet in `~/.cursor/mcp.json` as `user-penpot-local`. Both names work. See [MCP-SETUP.md](MCP-SETUP.md).
4. Fill `CURSOR_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in the **stack** `penpot.env` before OpenDesign agent jobs.

OpenDesign UI: [http://127.0.0.1:7457](http://127.0.0.1:7457). Docker Desktop may prompt for basic auth — username `open-design`, password = `OD_API_TOKEN`. Mailcatcher: [http://localhost:1080](http://localhost:1080).

## Stack CLI (`mmd`)

No Make. From a clone: `./bin/mmd <command>`. After install, `mmd` may be on `PATH` via `~/.local/bin`, or run `~/.local/share/mmd-skills/bin/mmd`. Developing this repo uses the clone as the stack root.

| Command | What it does |
| --- | --- |
| `mmd setup` | Create `penpot.env`, generate secrets, pull Penpot, build OpenDesign |
| `mmd start` | `compose up --build --detach` |
| `mmd stop` | Stop containers |
| `mmd down` | Stop and remove containers (keep volumes) |
| `mmd restart` | Stop then start |
| `mmd destroy` | Remove this project's containers, images, and volumes (asks first) |
| `mmd logs` | Follow logs |
| `mmd status` | `compose ps` |
| `mmd update` | Pull Penpot images, rebuild OpenDesign, recreate |
| `mmd backup` | Dump Postgres into `backups/` |
| `mmd doctor` | OpenDesign health, agent CLIs, `/api/agents` |
| `mmd convert` | Figma → Penpot via [figpot](https://github.com/betagouv/figpot) (optional; needs `.env`) |

Compose project name is `penpot` so existing volumes keep working. The stack is loopback-only. Do not publish the fat OpenDesign image (`penpot-opendesign:local` contains vendor CLIs).

If the daemon is down, invoke the **mmd-setup** skill or run `mmd start`. Do not start a host `opendesign` process.

## Convert (Figma → Penpot), optional

1. Copy `.env.example` to `.env` in the stack root and fill tokens and URLs.
2. Create an empty file in local Penpot and copy its URL (`file-id=...`).
3. `mmd convert`

`convert.sh` runs `npx @betagouv/figpot` on the host.

## Layout

| Path | Role |
| --- | --- |
| `install.sh` | Copy skills into an app; sync/start the machine stack |
| `bin/mmd` | Stack lifecycle (no Make) |
| `docker-compose.yaml` | Official Penpot compose plus `open-design` on `127.0.0.1:7457` and MCP on `4401` |
| `docker/opendesign/` | Image: `ghcr.io/nexu-io/od` plus Linux `cursor-agent`, `claude`, `codex`, `opencode`, `pi` |
| `.cursor/skills/` | Funnel skills (source pack) |
| `.agents/shared/lib/` | Harness-agnostic OpenDesign daemon helpers (copied into the app) |
| `mcp.json.example` | Cursor snippet: `http://localhost:4401/mcp` |
| `penpot.env.example` | Instance version, public URI, OpenDesign token and API keys |

Do not commit `penpot.env` or `.env`.


## references to add

https://www.skills.sh/anthropics/skills/canvas-design
https://www.skills.sh/anthropics/skills/frontend-design
https://www.skills.sh/wshobson/agents/tailwind-design-system
https://github.com/julianromli/ai-skills/tree/main/skills/clone-website
https://recent.design/skills
https://github.com/penpot/penpot-exporter-figma-plugin#add-to-figma
https://www.retune.dev/