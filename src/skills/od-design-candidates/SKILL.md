---
name: od-design-candidates
description: Generate three OpenDesign HTML design variations from a brief (Discord-free). Writes candidates under .mash/designs/PAGE_SLUG/candidates/ and emits DESIGN_CANDIDATES_HANDOFF. Use before picking a winner and running penpot-import-html / penpot-design-pipeline.
---

# OpenDesign Design Candidates

## Communication while using this skill

**Caveman lite** for assistant status prose while this skill runs: strip filler and hedging; keep articles and full sentences; stay professional and tight. Technical accuracy unchanged; quoted errors and code unchanged. Drop lite for security warnings, irreversible confirmations, ambiguous multi-step instructions, user confusion, or when the user asks for normal or long-form wording.

**Artifact boundary:** Caveman lite applies to chat and status prose, not HTML exports, screenshots, `candidates.json`, or handoff blocks.

## Overview

Local replacement for OpenClaw DesignCandidates generation (no Discord).

1. Ensure design system exists (`.mash/design-system/DESIGN.md` + `.mash/designs/design-system.json`).
2. Plan exactly **3** variation directives (agent step).
3. Run OpenDesign `example-web-prototype` create → run → export → screenshot via Python HTTP client against the Compose daemon.
4. Emit `DESIGN_CANDIDATES_HANDOFF`.

Does **not** implement app UI. Downstream: human pick → `select_winner.py` → **`penpot-import-html`** (or full **`penpot-design-pipeline`**).

Talk to the daemon at `http://127.0.0.1:7457` only. Never spawn `(cd /tmp && opendesign --no-open)`. Never require a host `opendesign` binary. OpenCode runs inside the Compose container.

## Interaction Mode

Parse `$ARGUMENTS` for at most one interaction mode token:

- `mode:interactive` — default. May ask for brief / pageSlug.
- `mode:non-interactive` — no blocking questions; require brief + pageSlug (and paths) in args.

Strip the mode token before resolving inputs. If no mode token is present, set `INTERACTION_MODE=interactive`.

## Inputs

- `brief` or `briefFile`: design brief text or path to a text/markdown file (required).
- `pageSlug`: kebab-case page id (required; derive from brief title if interactive and missing).
- `repoRoot`: optional; default `pwd -P` (Cursor basedir).
- `winnerVariation` / `winner:vN`: **not** used here — selection is `select_winner.py` or `penpot-design-pipeline`.
- Optional: `model` (OpenDesign run model; overrides `OPEN_DESIGN_RUN_MODEL` from `penpot.env`, empty = Auto), `daemonUrl` (override; default from `OPEN_DESIGN_DAEMON_URL` or `http://127.0.0.1:7457`), `skipScreenshots`.

## Prerequisites

The Compose OpenDesign service must already be up (`mds start`, or invoke the mash-design-setup skill). Health is unauthenticated; every other `/api/*` call sends `Authorization: Bearer $OD_API_TOKEN` from the stack `penpot.env` (process env wins).

```bash
STACK="${MASH_DESIGN_STACK:-$HOME/.local/share/mash/design}"
APP="$(pwd -P)"
. "${STACK}/lib/od_daemon.sh"
od_load "$APP"
od_require_health

PYTHON="${SKILLS}/od-design-candidates/.venv/bin/python"
test -x "$PYTHON"
```

The installer creates that virtualenv under `~/.config/mash/venvs/od-design-candidates` and symlinks it into each IDE copy, including Playwright Chromium. If `$PYTHON` is missing, re-run `install.sh`. Do not create a virtualenv inside the skill directory.

If health fails, stop and tell the user to run `mds start` (or invoke the mash-design-setup skill). Do not start a sidecar daemon.

Repo must already have a published design system, or run **`od-design-system`** first so:

- `.mash/design-system/DESIGN.md` exists
- `.mash/designs/design-system.json` contains `designSystemId`

## Artifact layout

```text
.mash/designs/<page-slug>/
  candidates/
    candidates.json
    variation-plan.json
    v1/index.html
    v1/preview.png
    v1/project-meta.json
    v2/...
    v3/...
```

## Workflow

### 1. Ensure design system

If `.mash/design-system/DESIGN.md` or `.mash/designs/design-system.json` is missing, invoke **`od-design-system`** with `mode:non-interactive` and wait until both exist. Do **not** nest Cursor SDK bootstraps.

### 2. Plan variations (agent)

Using [`references/variation-planner-prompt.md`](references/variation-planner-prompt.md), write:

`.mash/designs/<page-slug>/candidates/variation-plan.json`

Exactly 3 variations with `title`, `directive`, `rationale`. Set `"source": "agent"`.

Also write the brief to a temp or page file, e.g. `.mash/designs/<page-slug>/candidates/brief.txt`.

### 3. Generate candidates (scripts)

```bash
STACK="${MASH_DESIGN_STACK:-$HOME/.local/share/mash/design}"
APP="$(pwd -P)"
. "${STACK}/lib/od_daemon.sh"
od_load "$APP"
PYTHON="${SKILLS}/od-design-candidates/.venv/bin/python"
# fallback: python3 if venv missing and deps installed

cd "${SKILLS}/od-design-candidates/scripts"
MODEL="${MODEL:-$(python3 "${STACK}/lib/od_daemon.py" pick-model)}"   # invocation wins, else penpot.env

"${PYTHON}" generate_candidates.py \
  --repo-root "${APP}" \
  --page-slug "<page-slug>" \
  --brief-file "${APP}/.mash/designs/<page-slug>/candidates/brief.txt" \
  --variation-plan "${APP}/.mash/designs/<page-slug>/candidates/variation-plan.json" \
  ${MODEL:+--model "$MODEL"}
```

Resolve `MODEL` from the invocation first, then `OPEN_DESIGN_RUN_MODEL` in the stack `penpot.env` (or process env). Omit `--model` when both are empty so OpenDesign uses Auto.

Expect ~minutes × 3 OpenDesign runs (agent from `pick_run_agent`). On failure, surface the error; do not invent HTML.

### 4. Present results

Show paths to `v1`/`v2`/`v3` HTML and PNG. In interactive mode, offer next steps: pick a winner (`select_winner.py`) or continue with **`penpot-design-pipeline`**.

### 5. Emit handoff

Always emit:

```text
DESIGN_CANDIDATES_HANDOFF
SUCCESS: true|false
PAGE_SLUG: <page-slug>
CANDIDATES_JSON: .mash/designs/<page-slug>/candidates/candidates.json
V1_HTML: .mash/designs/<page-slug>/candidates/v1/index.html
V2_HTML: .mash/designs/<page-slug>/candidates/v2/index.html
V3_HTML: .mash/designs/<page-slug>/candidates/v3/index.html
BLOCKERS: none | <reason>
END_DESIGN_CANDIDATES_HANDOFF
```

## Select winner (helper)

After the user chooses `vN`:

```bash
cd "${SKILLS}/od-design-candidates/scripts"
"${PYTHON}" select_winner.py \
  --repo-root "${APP}" \
  --page-slug "<page-slug>" \
  --variation N
```

Copies into `.mash/designs/<page-slug>/source/index.html` (and preview.png when present) and sets `winnerVariation` in `candidates.json`.

## Tests

```bash
"${SKILLS}/od-design-candidates/.venv/bin/python" -m pytest \
  "${SKILLS}/od-design-candidates/tests" -q
```

## Downstream

- Full chain: **`penpot-design-pipeline`**
- Manual: `select_winner.py` → **`penpot-import-html`** → **`penpot-create-design-system`** → **`penpot-implement-design`**
