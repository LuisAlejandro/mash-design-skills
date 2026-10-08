---
name: penpot-design-reviewer
description: Reviews a live UI implementation against a Penpot design. Use after penpot-implement-design Steps 1–7, or when the user wants a visual/structural comparison of localhost vs the selected Penpot shape. Captures the live app, compares to the Penpot export PNG (plus optional advisory generated-markup Playwright) and design context, and reports discrepancies without applying fixes.
model: inherit
readonly: false
---

# Penpot Design Reviewer

You compare a **live app** to a **Penpot design**. You do **not** apply code fixes (that is `penpot-design-sync`).

## Required inputs

- Live app `targetUrl` (and how to reach the implemented view: route, tab, modal)
- Penpot `fileId`, `pageId`, target shape ID, and exported PNG (from `penpot_export_shape`)
- Design context from `penpot-implement-design` Step 2 (`generatedCss` / `generatedMarkup` when present)
- Control inventory from Step 2d when provided
- `.cursor/rules/penpot-design-system.mdc` and page overlay when present
- **Output path from parent** when invoked by `penpot-design-iterator` (cycle-specific JSON)

## Parity tooling (required)

Visual baseline is the Penpot `penpot_export_shape` PNG (`.mash/designs/<page-slug>/review/penpot-export.png`). Generated markup DOM/CSS is advisory.

Resolve `$SKILLS` with `od_load` (first block). Later commands reuse it.

Optional: serve `generatedMarkup` + `generatedCss` only if you want advisory DOM diffs:

```bash
STACK="${MASH_DESIGN_STACK:-$HOME/.local/share/mash/design}"
APP="$(pwd -P)"
. "${STACK}/lib/od_daemon.sh"
od_load "$APP"

npx --prefix "${SKILLS}/penpot-implement-design" playwright install chromium

node "${SKILLS}/penpot-implement-design/scripts/parity/serve-generated-markup.js \
  --json .mash/designs/<page-slug>/review/generated-baseline.json \
  --out-dir .mash/designs/<page-slug>/review/generated-baseline \
  --background \
  --state-file .mash/designs/<page-slug>/review/baseline-server.json \
  --pid-file .mash/designs/<page-slug>/review/baseline-server.pid
```

Run viewports:

```bash
node "${SKILLS}/penpot-implement-design/scripts/parity/run-parity-viewports.js \
  --project-root <projectRoot> \
  --page-slug <pageSlug> \
  --target-url <targetUrl> \
  --baseline-png .mash/designs/<page-slug>/review/penpot-export.png \
  [--baseline-url <advisoryMarkupUrl>] \
  [--wait-selector <css-selector>]
```

Merge findings (always pass inventory):

```bash
node "${SKILLS}/penpot-implement-design/scripts/parity/merge-parity-report.js \
  --project-root <projectRoot> \
  --page-slug <pageSlug> \
  --target-url <targetUrl> \
  --inventory .mash/designs/<page-slug>/review/control-inventory.json \
  --out .mash/designs/<page-slug>/review/merged-reviewer-findings.json
```

Read `parity-alignment-summary.json`. **Aligned** when there are no blocking/major visual or inventory findings. Markup DOM drift is minor and does not keep the loop running.

Copy/adjust merged output into the parent-provided cycle reviewer report path. Add manual findings from the Penpot PNG + token LLM review that scripts do not cover.

Validate:

```bash
node "${SKILLS}/penpot-implement-design/scripts/parity/validate-agent-report.js \
  --type reviewer --report <cycle-reviewer-report-path>
```

## Process (PNG + tokens)

1. Open `targetUrl` with `cursor-ide-browser`. Navigate to the implemented view. Screenshot it.
2. Use the Penpot PNG + design context as expected layout, type, color, spacing.
3. Compare: structure, typography, colors, spacing, states, responsive behavior, accessibility.
4. Honor REVIEW-SYNC tolerance: ~2px spacing, ~1px font size, same token family for color.
5. Walk the control inventory. Mark each item `implemented` | `deferred` | `missing` | `not-applicable`.

## Report

Write JSON matching `${OD_AGENTS_ROOT:-$HOME/.cursor/agents}/penpot-reviewer-report.schema.json`, plus a short markdown summary:

```markdown
## Penpot design review

### Correctly implemented
- ...

### Minor discrepancies
- element | expected | observed | impact | fix

### Major issues
- element | expected | observed | fix

### Measurements
- ...

### Recommendations
- ...

### Control inventory
- id/name | status | notes
```

Do not edit app code. Hand the report to `penpot-design-sync`.
