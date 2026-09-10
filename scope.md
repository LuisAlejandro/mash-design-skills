# Architecture (MMD Skills)

Historical design notes for the funnel. Day-to-day onboarding is [README.md](README.md). **OpenDesign explores, Penpot commits, Penpot implement ships.** HTML is a sketch. The Penpot file is canonical. Code is checked against Penpot, with OpenDesign’s machine parity borrowed on top.

Run both tools as a machine-local Compose stack (`mmd start`). Penpot lives in `docker-compose.yaml`. OpenDesign is the same Compose project, with Linux agent CLIs baked into that image, so explore stages do not depend on a host `opendesign` binary.

## Target flow

```text
od-design-system? → od-design-candidates → [pick winner]
  → penpot-import-html
  → penpot-create-design-system
  → penpot-implement-design
  → reviewer → sync → iterator
  → (later) penpot-sync-code-to-design
```

Skip the first two steps if a frame already exists in Penpot. Then start at create-design-system or implement.

**Stage by stage**

1. **Ground (keep `od-design-system`)**  
   Pull `DESIGN.md` / a package from the real frontend. That is the best “how this app already looks” input. Candidates and Penpot rules both consume it. Workspace generation hits the Compose daemon, not a host CLI.

2. **Explore (keep `od-design-candidates`)**  
   Three HTML variants, hard stop for a human pick. Do not implement from these files. Same daemon as ground.

3. **Lock (new `penpot-import-html`)**  
   This is the gap. Winner HTML → Penpot page: token set from CSS, boards/frames from the layout tree, assets where possible. After this, throw away HTML as the implement baseline. The Penpot file is the design.

4. **Map (keep `penpot-create-design-system` + `penpot-token-resolution`, fold in catalog brains)**  
   One rule file, e.g. `.cursor/rules/penpot-design-system.mdc` plus a page overlay. Steal from `od-design-catalog`: architecture scan, component catalog, glob derivation. Steal Penpot’s library/variant/comment/font inspection. Do not emit a second `od-design-system.mdc`.

5. **Build (keep `penpot-implement-design`, upgrade it)**  
   Still production UI from the selected shape (tree, tokens, `generatedCss` / `generatedMarkup`). Always continue into review. Borrow from OpenDesign:
   - serve `generatedMarkup`+`generatedCss` as the Playwright baseline (not the candidate HTML)
   - run viewport DOM + pixel diffs
   - keep Penpot PNG + token review for designer intent the CSS snapshot misses  
   Drop the “dummy data only / stop before review” behavior. That was the weaker implement path.

6. **Close the loop (keep code → Penpot)**  
   `penpot-sync-code-to-design` → analyze → apply. No HTML rewrite.

7. **Orchestrate (replace `od-design-pipeline`)**  
   One pipeline skill with the same pick-gate as today, but promote stages are import → map → Penpot implement → iterator, not catalog → HTML implement.

## Self-host OpenDesign (Compose)

Today `od-design-system` and `od-design-candidates` expect a host CLI: `(cd /tmp && opendesign --no-open)` on `http://127.0.0.1:7456`. That is the desktop-app path. Scope includes replacing it with a Compose-managed daemon and Linux agent CLIs inside the image.

**Shape**

- Add an `open-design` service next to Penpot. Base it on `ghcr.io/nexu-io/od` (same image as [nexu-io/open-design `deploy/docker-compose.yml`](https://github.com/nexu-io/open-design/blob/main/deploy/docker-compose.yml)). Do not vendor the OpenDesign monorepo.
- Put it in this repo’s Compose stack so `mmd start` brings up Penpot, Penpot MCP, and OpenDesign together. Prefer one project: extend `docker-compose.yaml`. Do not run a second compose project the skills have to discover.
- Bind the daemon to loopback only: `127.0.0.1:7457:7456` (host 7457, container 7456). Persist `/app/.od` in a named volume. Generate `OD_API_TOKEN` in setup the same way we generate `PENPOT_SECRET_KEY`.
- Point skills at the container URL + Bearer token. Stop spawning a host `opendesign` process. Treat “daemon not healthy” as a Compose failure (`mmd start` / **mmd-setup**), not a skill that launches a sidecar.

**Agent CLIs (in the image)**

The published `ghcr.io/nexu-io/od` image has no coding-agent CLIs. Host bind-mounts are a Linux-only overlay and cannot run macOS binaries in Docker Desktop. Scope is: **keep the daemon in Compose, install Linux CLIs in a local image** that `FROM`s that published image.

Install these four on `PATH` inside the container:

- `cursor-agent` (Cursor Agent — what `od-design-candidates` already requests)
- `claude` (Claude Code)
- `codex` (Codex CLI)
- `opencode` / `opencode-cli` (what `od-design-system` already requests)

The daemon auto-detects whatever is on `PATH`. Do not mount Homebrew or Cursor binaries from the Mac. Pass provider credentials through Compose env (`CURSOR_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and whatever OpenCode needs), not host `~/.claude` / `~/.codex` mounts. Codex in an unprivileged container likely needs `OD_CODEX_SANDBOX=danger-full-access`. Add glibc compatibility if the stock Alpine image cannot run the CLIs (same reason OpenDesign’s `Dockerfile.local` exists).

**Skill contract after this lands**

- `daemonUrl` default stays `http://127.0.0.1:7457`.
- Auth header required; no `OPEN_DESIGN_DISABLE_API_AUTH` on the published port.
- Candidates still export HTML into `rosey/designs/<page-slug>/` via the daemon API (no bind-mount of the git tree into the daemon unless export cannot write out).
- `od-design-system` still writes `DESIGN.md` in the repo; only workspace generation talks to the container.
- Ground and explore pick among the four in-image CLIs (`opencode` and `cursor-agent` already match today’s skill defaults).

## Create

- **`penpot-import-html`** — only net-new design capability. Input: winner `index.html` (+ assets). Output: page in the open Penpot file + shape ids for implement.
- **`penpot-design-pipeline`** (or a rewritten `od-design-pipeline`) — orchestration only.
- **Compose OpenDesign** — `open-design` service, env/token in setup, `bin/mmd` commands, skill clients send `Authorization: Bearer`. Local Dockerfile layers Linux `cursor-agent`, `claude`, `codex`, and `opencode` onto `ghcr.io/nexu-io/od`.

Upgrade, don’t duplicate: **`penpot-design-reviewer` / `sync` / `iterator`** get OpenDesign’s validate scripts, report schemas, and Playwright loop, keyed off Penpot-generated markup rather than exported HTML.

## Drop

These only exist to implement or review against HTML as source of truth:

- `od-implement-design`
- `od-design-iterator`, `od-design-reviewer`, `od-design-sync`
- `od-design-catalog` and `od-token-resolution` as standalone skills (logic moves into import + create-design-system)
- `od-design-pipeline` as currently specified (HTML → catalog → implement → iterator)

These overlap the candidate path and would sit unused in the funnel:

- `penpot-concept` and `penpot-prototype` (YAML + HTML preview). Candidates already produce previewable HTML. Keep `penpot-render` only if import-html cannot create boards itself; otherwise fold render scripts into import and drop render as a user-facing skill.

Keep `penpot-analyze-code-for-design` and `penpot-apply-design-updates` as helpers of sync-code-to-design (not extra entry points).

Also drop the host `opendesign` binary as a prerequisite. Skills must not start `(cd /tmp && opendesign --no-open)`.

## What you get vs today

| Today | Unified |
| --- | --- |
| Two implementers, two iterators, two rule files | One implement, one review trio, one rule file |
| Best pixels live on an HTML snapshot | Best pixels + tokens/variants from Penpot, with Playwright on generated CSS |
| `od-implement-design` stops before review | Review is mandatory, as Penpot already does |
| No HTML → Penpot | Explicit lock step |
| Host `opendesign` daemon + host CLIs | Compose `open-design` on `:7457`; Linux `cursor-agent`, `claude`, `codex`, `opencode` in the image |

## Scope I would not take

- Bidirectional HTML ↔ Penpot sync  
- Keeping HTML implement as a “fallback family” (it will get used and fork quality)  
- A new YAML concept layer unless import-html is too lossy and you need an editable spec in between  
- Forking or vendoring the OpenDesign monorepo (wrap `ghcr.io/nexu-io/od`; do not copy `apps/`)  
- API-only / BYOK-without-CLI as the explore engine (no file tools; weaker HTML export)  
- Publishing OpenDesign (or Penpot) past loopback; LAN / Traefik for OD  
- Mounting host macOS agent binaries into Docker Desktop  
- Shipping any agent CLI other than `cursor-agent`, `claude`, `codex`, and `opencode` in the image  

## Smallest experiment

Two spikes, in order:

1. **Compose daemon + image CLIs** — `mmd start` answers `GET http://127.0.0.1:7457/api/health` with a token. `/api/agents` (or Settings rescan) shows `cursor-agent`, `claude`, `codex`, and `opencode`. `od-design-candidates` talks only to that URL (no host `opendesign`). One successful `/api/runs` + HTML export with one of those four is enough.
2. **Lock-in** — that export → `penpot-import-html` → existing `penpot-implement-design`. If the imported file is good enough to implement from, the rest is deletion and folding. If import is lossy (text, auto-layout, images), that tells you whether `penpot-render`/YAML still earns a place.

That is the scope I’d argue for: one funnel, Compose-hosted OpenDesign with Linux `cursor-agent` / `claude` / `codex` / `opencode` in the image, one new import skill, Penpot implement as the only coder.