# MMD Skills

Local design-to-code toolkit for Cursor. [OpenDesign](https://github.com/nexu-io/open-design) explores HTML. [Penpot](https://penpot.app) is the canonical file. Penpot implement ships code. This repo is not an application; you install the skills **once on this machine** and run Penpot + OpenDesign as a machine-local Docker stack. Design artifacts stay in **your app** (`rosey/`). This project's files are MIT ([LICENSE](LICENSE)); third-party stack pieces are listed in [NOTICE](NOTICE).

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

## Install (once per machine)

```bash
curl -fsSL https://raw.githubusercontent.com/LuisAlejandro/mmd-skills/develop/install.sh | bash
```

That fetches the toolkit, copies the Cursor skill pack into `~/.cursor/skills`, review agents into `~/.cursor/agents`, merges MCP `penpot-local` → `http://localhost:4401/mcp` and Context7 → `https://mcp.context7.com/mcp` into `~/.cursor/mcp.json`, and syncs the Compose stack to `~/.local/share/mmd-skills` (override with `MMD_STACK_ROOT`). It starts the stack unless OpenDesign already answers `/api/health`.

Then open **your app** in Cursor. Skills are already on this machine. Funnel output still lands in the app under `rosey/`.

Re-run the same curl to update. Flags: `curl -fsSL … | bash -s -- --no-start` (`--check`, `--no-stack`, `--no-agents`). From a clone, `./install.sh` still works.

## After install

1. Open [http://localhost:9001](http://localhost:9001) and log in with the local user from `mmd setup`. Activate the **penpot-local** MCP in Cursor.
2. Compose OpenDesign uses port `7457` so it does not collide with a host Open Design app on `7456`.
3. See [MCP](#mcp) for `penpot-local`, Context7, and the Penpot plugin connect step.
4. `mmd setup` prompts for a **local Penpot** email/password (not penpot.app) and for a provider API key (Cursor / Anthropic / OpenAI). It writes the **stack** `penpot.env` (email only; password is not stored). Use `mmd auth` later for keys. Scripted installs: `MMD_NONINTERACTIVE=1` with `PENPOT_LOCAL_EMAIL` and `PENPOT_LOCAL_PASSWORD`, or `--skip-user` / `--skip-auth`. `mmd start` applies keys to harnesses. `pick-agent` only selects a harness that is on PATH and has matching credentials.

OpenDesign UI: [http://127.0.0.1:7457](http://127.0.0.1:7457). Mailcatcher: [http://localhost:1080](http://localhost:1080).

## MCP

`install.sh` merges both servers into `~/.cursor/mcp.json`:

- `penpot-local` → `http://localhost:4401/mcp` (`user-penpot-local` is the same snippet). Skills accept either name.
- `context7` → `https://mcp.context7.com/mcp` for library docs some skills may use. That server is part of this pack.

HTTP `:4401` is not enough. In Penpot, open the file and use **File → MCP Server → Connect**. Import never draws a board without the plugin on an open file.

## Stack CLI (`mmd`)

No Make. From a clone: `./bin/mmd <command>`. After install, `mmd` may be on `PATH` via `~/.local/bin`, or run `~/.local/share/mmd-skills/bin/mmd`. Developing this repo uses the clone as the stack root.

| Command | What it does |
| --- | --- |
| `mmd setup` | Create `penpot.env`, generate secrets, local Penpot user (`--skip-user` / `PENPOT_LOCAL_EMAIL` + `PENPOT_LOCAL_PASSWORD`), optional provider keys (`--skip-auth` / `MMD_NONINTERACTIVE=1`), pull Penpot, build OpenDesign |
| `mmd start` | `compose up --build --detach`, then apply harness logins |
| `mmd auth` | Prompt for provider keys, recreate `open-design`, apply harness logins |
| `mmd stop` | Stop containers |
| `mmd down` | Stop and remove containers (keep volumes) |
| `mmd restart` | Stop then start |
| `mmd destroy` | Remove this project's containers, images, and volumes. Prints the stack, project name, and every named volume at risk, then requires typing the exact project name to confirm (`MMD_CONFIRM_DESTROY=1` for non-interactive use). Does not uninstall the CLI or skills |
| `mmd uninstall` | Destroy the Compose project(s), then remove `~/.local/bin/mmd`, `~/.local/share/mmd-skills`, and the managed pack in `~/.cursor/skills` and `~/.cursor/agents`. Same exact-name confirmation as `destroy`, with its own bypass (`MMD_CONFIRM_UNINSTALL=1`) that `destroy`'s bypass cannot satisfy. Keeps `rosey/` |
| `mmd logs` | Follow logs |
| `mmd status` | `compose ps` |
| `mmd update` | Pull Penpot images, rebuild OpenDesign, recreate, apply harness logins |
| `mmd backup` | Dump Postgres into `backups/`. PostgreSQL data only — does not cover Penpot assets, OpenDesign data, or OpenDesign home state; no restore path exists yet for those volumes |
| `mmd doctor` | OpenDesign health, agent CLIs, runnable harness table |
| `mmd convert` | Figma → Penpot via [figpot](https://github.com/betagouv/figpot) (optional; needs `.env`) |

Compose project name is `penpot` for the installed default share root and for an implicit clone-detected invocation, so existing volumes keep working. An explicit alternate `MMD_STACK_ROOT` derives its own stable project name instead, so distinct custom stack roots never collide under one Compose project. The stack is loopback-only. Do not publish the fat OpenDesign image (`penpot-opendesign:local` contains vendor CLIs).

`penpot.env` and `.env` are created (and corrected on each `mmd setup`/`mmd auth`) with mode `0600` — owner read/write only. `docker compose config` (without `-q`) resolves and prints every interpolated secret in plaintext by design; do not paste its output into shared logs or issue reports.

If the daemon is down, invoke the **mmd-setup** skill or run `mmd start`. Do not start a host `opendesign` process.

## Convert (Figma → Penpot), optional

1. Copy `.env.example` to `.env` in the stack root and fill tokens and URLs.
2. Create an empty file in local Penpot and copy its URL (`file-id=...`).
3. `mmd convert`

`convert.sh` runs `npx @betagouv/figpot` on the host.

## Layout

| Path | Role |
| --- | --- |
| `install.sh` | Copy skills/agents to `~/.cursor`; sync/start the machine stack |
| `bin/mmd` | Stack lifecycle (no Make) |
| `docker-compose.yaml` | Official Penpot compose plus `open-design` on `127.0.0.1:7457` and MCP on `4401` |
| `docker/opendesign/` | Image: `ghcr.io/nexu-io/od` plus Linux `cursor-agent`, `claude`, `codex`, `opencode`, `pi` |
| `.cursor/skills/` | Funnel skills (source pack; installer copies to `~/.cursor/skills`) |
| `.agents/shared/lib/` | OpenDesign daemon helpers (installer copies to the stack `lib/`) |
| `.cursor/mcp.json` | Tracked Cursor MCP: Context7 + `penpot-local` |
| `mcp.json.example` | Same snippet for hand-merging into `~/.cursor/mcp.json` |
| `LICENSE` / `NOTICE` | MIT for this repo; third-party attribution |
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