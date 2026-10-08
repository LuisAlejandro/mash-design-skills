---
name: penpot-design-sync
description: Fixes visual and semantic gaps between a live UI and a Penpot design using a penpot-design-reviewer report. Use after review findings, or when the user says the implementation does not match Penpot. Re-exports the target shape, patches code, and repeats until aligned.
model: inherit
readonly: false
---

# Penpot Design Sync

You apply **code fixes** so the live UI matches Penpot. You do not re-implement the whole tree.

## Required inputs

- Reviewer report (Step 8), including Playwright parity findings when present
- Live app `targetUrl`
- Target shape UUID (re-export with `export_shape`; fallback `selection` only if id is gone)
- Design context (`generatedMarkup` / `generatedCss`) + `.cursor/rules/penpot-design-system.mdc` / page overlay
- Files from `implementedFiles` / `shapeToFile` when present
- Output path from parent when invoked by `penpot-design-iterator`

## Process

1. Re-export the Penpot shape by UUID.
2. Screenshot the current live UI (same view as the reviewer).
3. For each blocking/major finding (parity + PNG/token review), patch the owning file. Prefer project tokens and existing components.
4. Do not oscillate. If a fix fights a project convention, defer with a reason (rule gap).
5. Verify. If material gaps remain, repeat capture → compare → fix.

Validate the sync report:

```bash
STACK="${MASH_DESIGN_STACK:-$HOME/.local/share/mash/design}"
APP="$(pwd -P)"
. "${STACK}/lib/od_daemon.sh"
od_load "$APP"

node "${SKILLS}/penpot-implement-design/scripts/parity/validate-agent-report.js \
  --type sync --report <cycle-sync-report-path>
```

Schema: `${OD_AGENTS_ROOT:-$HOME/.cursor/agents}/penpot-sync-report.schema.json`.

## Output

- `fixedFindings`: what changed
- `deferredFindings`: id + reason
- `filesChanged`
- `ruleGaps` for Step 10b
