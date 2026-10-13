---
name: penpot-design-pipeline
description: Orchestrate the local design funnel — OpenDesign candidates, human winner pick, HTML→Penpot import, design-system map, and Penpot implement (includes iterator). Discord-free. Pauses after candidates until winner vN is provided.
---

# Penpot Design Pipeline

## Communication while using this skill

**Caveman lite** for assistant status prose while this skill runs: strip filler and hedging; keep articles and full sentences; stay professional and tight. Technical accuracy unchanged; quoted errors and code unchanged. Drop lite for security warnings, irreversible confirmations, ambiguous multi-step instructions, user confusion, or when the user asks for normal or long-form wording.

**Artifact boundary:** Caveman lite applies to chat/status prose, not handoff blocks, HTML, screenshots, or Penpot shapes.

## Overview

OpenDesign explores. Penpot commits. Penpot implement ships.

```text
od-design-system? → od-design-candidates → [STOP: pick winner]
  → penpot-import-html → penpot-create-design-system → penpot-implement-design
```

`penpot-implement-design` always runs reviewer → sync → iterator. This skill **orchestrates**; it does not reimplement OpenDesign or UI coding.

Skip candidates + import when a Penpot frame already exists: start at `penpot-create-design-system`. Skip **Stage 0** as well in that case.

Never spawn a host `opendesign` process. The Compose daemon must already be up (`mds start`, or invoke the mash-design-setup skill).

## Interaction Mode

Parse `$ARGUMENTS` for at most one:

- `mode:interactive` — default. Ask for brief / pageSlug / winner when missing.
- `mode:non-interactive` — require `brief` (or briefFile), `pageSlug`, and either:
  - `winner:vN` / `winnerVariation` up front (full run), **or**
  - resume after candidates with only `pageSlug` + `winner:vN` (promote stages only).

If `mode:non-interactive` and candidates are not yet generated and winner is missing, stop with a blocker asking for `winner:vN` after candidates (do not auto-pick).

## Inputs

- `brief` / `briefFile`, `pageSlug` — required for candidates stage
- `winner:v1|v2|v3` or `winnerVariation:1|2|3` — required before promote stages
- Optional: `model` (OpenDesign run model for Stages 0 and A; overrides `OPEN_DESIGN_RUN_MODEL` from `penpot.env`), `skipCandidates` (reuse existing candidates), `skipImport` (Penpot board already exists)

## Hard pick gate

After `od-design-candidates` succeeds:

1. Show V1/V2/V3 HTML + PNG paths.
2. **Do not** run import/map/implement until a winner is chosen.
3. Interactive: ask which variation wins.
4. Non-interactive: require `winner:vN` in args; if absent, emit pipeline handoff with `BLOCKERS: waiting for winner:vN` and stop.

**Never auto-pick** a variation.

## Stages

### Stage 0 — Design system package

Skip when `skipCandidates` is set.

If `.mash/design-system/DESIGN.md` or `.mash/designs/design-system.json` (`designSystemId`) is missing, invoke **`od-design-system`** with the same mode token and `model`. Wait until both exist. Candidates will not run without them.

### Stage A — Candidates

Invoke **`od-design-candidates`** with the same mode token, `model`, and brief/pageSlug.

Wait for `DESIGN_CANDIDATES_HANDOFF` with `SUCCESS: true`.

### Stage B — Select winner

```bash
STACK="${MASH_DESIGN_STACK:-$HOME/.local/share/mash/design}"
APP="$(pwd -P)"
. "${STACK}/lib/od_daemon.sh"
od_load "$APP"
PYTHON="${SKILLS}/od-design-candidates/.venv/bin/python"
cd "${SKILLS}/od-design-candidates/scripts"
"${PYTHON}" select_winner.py \
  --repo-root "${APP}" \
  --page-slug "<page-slug>" \
  --variation N
```

Confirm `.mash/designs/<page-slug>/source/index.html` exists.

### Stage C — Import HTML into Penpot

Invoke **`penpot-import-html`** with `pageSlug` and `htmlPath` = `.mash/designs/<page-slug>/source/index.html`.

Wait for `PENPOT_IMPORT_HANDOFF` with `SUCCESS: true` and a `ROOT_BOARD_ID`.

Skip this stage when `skipImport` is set and a selectable Penpot board already exists.

### Stage D — Map (design system rules)

Invoke **`penpot-create-design-system`** with `mode:non-interactive` and `pageSlug`. Writes only `.cursor/rules/penpot-design-system.mdc` and `.cursor/rules/penpot-ds-<page-slug>.mdc`. Pass import `pageId` from handoff when present.

Do not implement UI in this stage. Map must not offer implement.

### Stage E — Implement (includes iterator)

Invoke **`penpot-implement-design`** with `pageSlug` and `ROOT_BOARD_ID` from `PENPOT_IMPORT_HANDOFF` / `handoff.json`. Do not ask the user to click the board when that id is present. That skill runs Steps 1–7 then **always** reviewer → sync → iterator (PNG baseline). Leave the app dev server running for review.

## Final handoff

```text
DESIGN_PIPELINE_HANDOFF
SUCCESS: true|false
PAGE_SLUG: <page-slug>
WINNER_VARIATION: 1|2|3|
SOURCE_HTML: .mash/designs/<page-slug>/source/index.html
ROOT_BOARD_ID: <id>|
STAGES: ds=pass|fail|skipped; candidates=pass|fail|skipped; pick=pass|waiting; import=...; map=...; implement=...
BLOCKERS: none | <reason>
END_DESIGN_PIPELINE_HANDOFF
```

## Prerequisites

Same as `od-design-candidates` (Compose daemon via `mds start` or the mash-design-setup skill, Playwright) plus:

```bash
STACK="${MASH_DESIGN_STACK:-$HOME/.local/share/mash/design}"
APP="$(pwd -P)"
. "${STACK}/lib/od_daemon.sh"
od_load "$APP"
```

`penpot-local` stdio MCP connected. Import and implement pass `fileId` from the handoff. No browser plugin.

## Out of scope

- Discord voting / OpenClaw cron
- Auto-picking winners
- Full product behavior after the visual shell
- Bidirectional HTML ↔ Penpot sync
