# Mash Design Skills

Mash Design Skills is the design-to-code pack that sits beside
[Mash Programming Skills](https://github.com/LuisAlejandro/mash-programming-skills).
[OpenDesign](https://github.com/nexu-io/open-design) explores HTML.
[Penpot](https://penpot.app) is the canonical file. Penpot implement ships code.
You install the skills once on this machine and run Penpot + OpenDesign as a
machine-local Docker stack. Design artifacts stay in the app under `.mash/`.
This project is GPLv3 ([LICENSE](LICENSE)); third-party stack pieces are listed
in [NOTICE](NOTICE).

```text
od-design-system? → od-design-candidates → [pick winner]
  → penpot-import-html → penpot-create-design-system → penpot-implement-design
  → reviewer (Penpot PNG vs live) → sync → iterator
  → (later) penpot-sync-code-to-design
```

After pick, identity is `.mash/designs/<page-slug>/penpot-import/handoff.json`
(`pageSlug`, `pageId`, `rootBoardId`). Later stages read that file. Do not
re-slugify the Penpot page title.

Skip `od-design-system` when `.mash/design-system/DESIGN.md` or
`.mash/designs/design-system.json` already exists. Skip candidates and import
when a Penpot frame already exists. Root `DESIGN.md` stays at the app root.

## Installation

No checkout is required. This downloads the `develop` tarball and installs from it:

```bash
curl -fsSL https://raw.githubusercontent.com/LuisAlejandro/mash-design-skills/develop/install.sh | bash
```

A checkout installs from that checkout. `MASH_DESIGN_SKILLS` points the same
script at another checkout:

```bash
MASH_DESIGN_SKILLS=/path/to/mash-design-skills \
  bash /path/to/mash-design-skills/install.sh
```

Re-running refreshes design-owned skills, agents, the `penpot-local` MCP entry,
and the Compose stack. It does not write `.mash/` into the app.

Flags: `./install.sh --check`, `--version`, `--no-agents`, `--no-stack`,
`--no-start`.

### Global destinations

| Surface | Destination |
| --- | --- |
| Design manifest, pin, uninstaller | `~/.config/mash/design-install-manifest.json`, `design-stack.json`, `uninstall-design.sh` |
| Skill npm dependencies | `~/.config/mash/node_modules/<skill>/` |
| Skill Python virtualenvs | `~/.config/mash/venvs/<skill>/` |
| Cursor skills and agents | `~/.cursor/skills/`, `~/.cursor/agents/` |
| OpenCode skills and agents | `~/.config/opencode/skills/`, `~/.config/opencode/agents/` |
| Pi skills and agents | `~/.pi/agent/skills/`, `~/.agents/` |
| Cursor MCP | `penpot-local` in `~/.cursor/mcp.json` |
| Compose stack | `~/.local/share/mash/design` (override with `MASH_DESIGN_STACK`) |
| CLI | `~/.local/bin/mds` |

`context7` and the other programming MCP servers belong to Mash Programming
Skills. This installer does not add or remove them.

### What installation does

1. Prunes design skills and agents that the previous design manifest owned but
   this tree no longer contains.
2. Copies `src/skills/` and `src/agents/` into the three IDE homes.
3. Installs each skill's npm and Python dependencies once under
   `~/.config/mash/` and symlinks them into each copy.
4. Copies `headless/` to `~/.config/mash/headless`, installs its npm
   dependencies, and merges `penpot-local` as a stdio MCP into
   `~/.cursor/mcp.json`.
5. Syncs the Compose stack to `~/.local/share/mash/design`, writes
   `~/.config/mash/design-stack.json`, and links `mds`.
6. Runs `mds setup` when `penpot.env` is missing, then `mds start` unless
   OpenDesign already answers `/api/health`.

`mds setup` stores a Penpot access token in `penpot.env` and points
`penpot-local` at that token. No browser plugin is required.

## Requirements this pack does not install

An agent harness. Install at least one of `pi`, `opencode`, `cursor-agent`,
`codex`, or `claude`. Docker and Docker Compose v2 are required for the stack.
Node.js and Python 3 are required for skill dependencies.

Mash Programming Skills is a separate install. It provides planning and review
skills, always-on rules, and the shared MCP servers other than `penpot-local`.

## Uninstallation

Install copies `uninstall.sh` to `~/.config/mash/uninstall-design.sh`. That copy
reads `design-install-manifest.json` and does not need this repository.
`./uninstall.sh` in a checkout is the same script. Uninstallation is a dry run
unless `--apply` is set:

```bash
~/.config/mash/uninstall-design.sh            # show what would be removed
~/.config/mash/uninstall-design.sh --check    # exit 0 if the design payload is installed
~/.config/mash/uninstall-design.sh --apply    # remove the design payload
```

`--apply` removes design-owned skills, agents, `penpot-local`, the stack pin,
`~/.local/bin/mds`, and `~/.local/share/mash/design`. When the stack directory
holds a Compose file, teardown asks for the project name.
`MASH_DESIGN_CONFIRM_UNINSTALL=1` confirms that step when there is no terminal.
App `.mash/` trees stay.

`mds uninstall` runs the same script.

## Stack CLI (`mds`)

From a clone: `./bin/mds <command>`. After install, `mds` is on `PATH` via
`~/.local/bin`, or run `~/.local/share/mash/design/bin/mds`. Developing this
repo uses the clone as the stack root when you invoke `./bin/mds` with no
`MASH_DESIGN_STACK`.

| Command | What it does |
| --- | --- |
| `mds setup` | Create `penpot.env`, generate secrets, local Penpot user (`--skip-user` / `PENPOT_LOCAL_EMAIL` + `PENPOT_LOCAL_PASSWORD`), optional provider keys (`--skip-auth` / `MASH_DESIGN_NONINTERACTIVE=1`), pull Penpot, build OpenDesign |
| `mds start` | `compose up --build --detach`, then apply harness logins |
| `mds auth` | Prompt for provider keys, recreate `open-design`, apply harness logins |
| `mds stop` | Stop containers |
| `mds down` | Stop and remove containers (keep volumes) |
| `mds restart` | Stop then start |
| `mds destroy` | Remove this project's containers, images, and volumes. Prints the stack, project name, and every named volume at risk, then requires typing the exact project name to confirm (`MASH_DESIGN_CONFIRM_DESTROY=1` for non-interactive use). Does not uninstall the CLI or skills |
| `mds uninstall` | Dry run of `uninstall.sh`. `--apply` removes the design payload |
| `mds logs` | Follow logs |
| `mds status` | `compose ps` |
| `mds update` | Pull Penpot images, rebuild OpenDesign, recreate, apply harness logins |
| `mds backup` | Dump Postgres into `backups/`. PostgreSQL data only — does not cover Penpot assets, OpenDesign data, or OpenDesign home state; no restore path exists yet for those volumes |
| `mds doctor` | OpenDesign health, agent CLIs, runnable harness table |
| `mds convert` | Figma → Penpot via [figpot](https://github.com/betagouv/figpot) (optional; needs `.env`) |

Compose project name is `penpot` for the installed default share root and for
an implicit clone-detected invocation. An explicit alternate
`MASH_DESIGN_STACK` derives its own stable project name instead. The stack is
loopback-only. Do not publish the fat OpenDesign image
(`penpot-opendesign:local` contains vendor CLIs).

`penpot.env` and `.env` are created with mode `0600`. `docker compose config`
(without `-q`) prints every interpolated secret. Do not paste its output into
shared logs.

If the daemon is down, invoke the mash-design-setup skill or run `mds start`.
Do not start a host `opendesign` process.

Open [http://localhost:9001](http://localhost:9001) and log in with the local
user from `mds setup`. OpenDesign UI: [http://127.0.0.1:7457](http://127.0.0.1:7457).
Mailcatcher: [http://localhost:1080](http://localhost:1080). Port `7457` avoids
a host Open Design app on `7456`.

## Convert (Figma → Penpot), optional

1. Copy `.env.example` to `.env` in the stack root and fill tokens and URLs.
2. Create an empty file in local Penpot and copy its URL (`file-id=...`).
3. `mds convert`

## Repository files

| Path | Role |
| --- | --- |
| `install.sh` / `uninstall.sh` | Global install and manifest-scoped uninstall |
| `src/skills/` | Funnel skills (source pack) |
| `src/agents/` | Review, sync, and iterator agents |
| `scripts/od_daemon.py`, `scripts/od_daemon.sh` | OpenDesign daemon helpers |
| `scripts/release.sh`, `scripts/lib.sh`, `scripts/rollback.sh` | Release, shared gates, and rollback |
| `bin/mds` | Stack lifecycle |
| `convert.sh` | Figma → Penpot entry point behind `mds convert` |
| `headless/` | Penpot stdio server (`penpot-local`) |
| `headless/test/` | vitest unit and integration suites for `penpot-local` |
| `tests/` | pytest suite for the OpenDesign daemon helpers |
| `docker-compose.yaml` | Penpot compose plus `open-design` on `127.0.0.1:7457` |
| `docker/opendesign/` | Image `penpot-opendesign:local` |
| `Dockerfile.test`, `compose.test.yaml` | Isolated test image and disposable test container; not the `mds` runtime |
| `mcp.json.example` | `penpot-local` snippet for `~/.cursor/mcp.json` |
| `penpot.env.example` | Instance version, public URI, OpenDesign token and API keys |
| `.env.example` | `mds convert` tokens and URLs for `.env` |
| `Makefile` | Test-image, test-suite, and release targets (no runtime lifecycle) |
| `VERSION`, `.bumpversion.cfg` | Canonical version and the files the release bumps |
| `HISTORY.md` | Changelog regenerated by `gitchangelog` at release time |
| `AGENTS.md` | Maintainer map for this repo |

Do not commit `penpot.env` or `.env`.

## Development

Clone and install from the checkout so the global IDE homes track `src/`:

```bash
git clone git@github.com:LuisAlejandro/mash-design-skills.git
cd mash-design-skills
./install.sh
```

Re-run `./install.sh` after changing a skill or agent; `./install.sh --check`
verifies the installed payload. [CONTRIBUTING.md](CONTRIBUTING.md) holds the
shorter contributor checklist.

### Tests

Run all offline unit suites in the disposable test image (Python 3.12 and
Node.js 22):

```bash
make test
```

For a single suite, use `make test-python`, `make test-skills`, or
`make test-headless`; `make test-image` builds the image without running tests.
These commands use `compose.test.yaml` and never start the `mds` stack. The
same Make targets run in Push CI. Direct host commands remain available:

Daemon helpers and the `od-design-candidates` skill:

```bash
python3 -m pytest tests src/skills/od-design-candidates/tests
```

Skill npm packages (each needs its own dependencies installed first):

```bash
npm ci --prefix src/skills/penpot-import-html
npm test --prefix src/skills/penpot-import-html
npm ci --prefix src/skills/penpot-implement-design
npm test --prefix src/skills/penpot-implement-design
```

`penpot-create-design-system` has no test script yet. The `penpot-local` MCP
server uses vitest:

```bash
cd headless
npm ci
npm run typecheck
npm test                  # unit suite
npm run test:integration  # needs a running Penpot stack
npm run build
```

`npm run test:integration` needs a separately running Penpot stack under
`mds`; it is not part of `make test` or the release gate.

## Release

`VERSION` is the canonical version. `.bumpversion.cfg` lists every file that
carries it (`install.sh`, the `headless/` package manifests and server
banner), so `make release-*` keeps them in sync.

Release from a clean `develop` with `git`, git-flow, `gh`, `gpg`, and
`bumpversion` available:

```bash
make release-patch   # or release-minor / release-major
make release         # uses VERSION_TYPE, default patch
VERSION=x.y.z make undo-release
```

`scripts/release.sh` starts a `release/<version>` git-flow branch, bumps the
version, regenerates `HISTORY.md` with `gitchangelog`, pushes the branch, waits
for that exact commit's release-branch CI (the `Push` workflow selected by
`RELEASE_CI_WORKFLOW`, default `push.yml`, so its `on.push.branches` must list
`release/**`), then finishes the release and publishes the GitHub release.
The `Push` workflow runs `scripts/preflight.sh` and `make test` on `develop`,
`master`, and `release/**`; the post-publish `Publish Release`
workflow checks the tag and version with the same preflight script. The local
release script has no separate preflight target, so it relies on the Push gate.

## References

https://www.skills.sh/anthropics/skills/canvas-design
https://www.skills.sh/anthropics/skills/frontend-design
https://www.skills.sh/wshobson/agents/tailwind-design-system
https://github.com/julianromli/ai-skills/tree/main/skills/clone-website
https://recent.design/skills
https://github.com/penpot/penpot-exporter-figma-plugin#add-to-figma
https://www.retune.dev/
