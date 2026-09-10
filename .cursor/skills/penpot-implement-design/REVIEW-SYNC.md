# Review, Sync, Iterate, Manifest

Entered from `penpot-implement-design` after Step 7c. Prerequisites: design context, exported Penpot image, target shape ID, live app URL, and the control inventory from Step 2d.

**CRITICAL:** Do not stop until Steps 8–10d finish. Pass the control inventory into the reviewer.

Persist Step 2 `generatedMarkup` and `generatedCss` to `rosey/designs/<page-slug>/review/generated-baseline.json` (optional advisory DOM). Visual baseline is `rosey/designs/<page-slug>/review/penpot-export.png` from `export_shape`.

## Route navigation

If the implemented UI is not the page root (modal, tab, nested route):

1. Open the live app URL.
2. Navigate to the implemented view (click the tab, open the modal, follow the route).
3. Capture that view, not the landing page.

Use `cursor-ide-browser` (`browser_navigate`, `browser_snapshot`, `browser_take_screenshot`) or an equivalent browser agent.

## Step 8: Orchestrate penpot-design-reviewer

Requires live app URL and the Penpot design (context + exported image from Steps 1–7).

Invoke **penpot-design-reviewer** (or follow its workflow inline if the subagent is unavailable):

1. **Playwright baseline:** Compare the live app to `penpot-export.png` via `scripts/parity/run-parity-viewports.js --baseline-png ...`. Generated markup DOM/CSS is advisory only.
2. **Capture implementation:** Screenshot the live UI at the implemented view. Capture extra viewports or states if the design specifies them.
3. **Design specs:** Use Step 2 design context and Step 3 exported PNG as source of truth. Extract tokens, typography, spacing, colors.
4. **Compare:** Layout, typography, colors, spacing, interactive elements, responsive behavior, accessibility (PNG + token LLM review plus parity findings).
5. **Control inventory:** Every inventory item must be `implemented`, `deferred` (with reason), `missing`, or `not-applicable`.
6. **Output structured review:** sections ✅ Correctly Implemented, ⚠️ Minor Discrepancies, ❌ Major Issues, 📐 Measurements, 💡 Recommendations. Give actionable CSS/code fixes. Do **not** apply fixes here.

**Tolerance (do not nitpick):**

| Kind | Treat as aligned |
| ---- | ---------------- |
| Color | ΔE small / same token family (e.g. both `primary-500`) |
| Spacing | within 2px of design |
| Font size | within 1px |
| Border radius | within 2px |

Blocking/major: missing controls from the inventory, wrong layout structure, wrong typography scale, wrong color token, broken interactions.

Then continue to Step 9.

## Step 9: Orchestrate penpot-design-sync (repeat until aligned)

Repeat until the implementation matches the Penpot design or the user asks to stop.

Invoke **penpot-design-sync** (or follow its workflow inline):

1. **Design capture:** Re-export the shape with `export_shape` using the **stored target shape UUID**. Fall back to `shapeId: "selection"` only if the stored id is gone.
2. **Implementation capture:** Screenshot the current live UI.
3. **Compare:** Layout, typography, colors, spacing, shadows, borders, icons, responsive behavior. Document each discrepancy: element, current, expected, severity, fix.
4. **Implement fixes:** Apply code changes. Follow `.cursor/rules/penpot-design-system.mdc` and the page overlay. Targeted edits only.
5. **Verify:** Summarize what was fixed. If material differences remain, repeat. Stop when aligned or the user says stop.

Then continue to Step 10.

## Step 10: Orchestrate penpot-design-iterator

Always run **up to 5 cycles** of penpot-design-iterator automatically. Stop early when PNG + inventory are aligned.

Each cycle: PNG vs live (plus optional advisory markup parity) → PNG/token review → sync if not aligned → one focused screenshot polish of the target area. Stop early if PNG review is close (no blocking/major visual or inventory findings). Do **not** loop five times solely because markup DOM `aligned` is false.

Then continue to Step 10b.

## Step 10b: Surface design system rule gaps

Present the running gap list from Steps 5–9:

```text
Design system rule gaps:
- { rule_file, section, description, suggestion }
```

Offer to update `.cursor/rules/penpot-design-system.mdc` and/or `.cursor/rules/penpot-ds-<page-slug>.mdc` now. If the user accepts, apply the updates. Then continue to Step 10c.

## Step 10c: Save implementation manifest (mandatory)

Update `.cursor/penpot-implement-state-<shapeId>.json` (create if missing). Merge; do not wipe `startedAt` / `targetShapeId`.

```json
{
  "targetShapeId": "<UUID>",
  "targetShapeName": "<name>",
  "pageSlug": "<slug>",
  "pageName": "<name>",
  "firstImplementedAt": "<ISO, set once on first completed run>",
  "startedAt": "<ISO>",
  "completedAt": "<ISO now>",
  "implementedFiles": [
    { "path": "...", "action": "created|modified", "shapeIds": ["..."] }
  ],
  "shapeToFile": { "<shapeId>": "<file path>" },
  "designSnapshot": { "shapes": {}, "rootShapeId": "...", "shapeCount": 0 },
  "selectionScope": "page|section|component"
}
```

- `firstImplementedAt`: set on first completed run; never overwrite.
- `completedAt`: always set to now.
- `designSnapshot`: the snapshot from Step 2c (new tree).
- `implementedFiles` / `shapeToFile`: from Step 5 tracking.

## Step 10d: Update cumulative registry (mandatory)

Read or create `.cursor/penpot-implement-registry.json`:

```json
{
  "updatedAt": "<ISO>",
  "implementations": {
    "<targetShapeId>": {
      "targetShapeName": "...",
      "pageSlug": "...",
      "pageName": "...",
      "lastImplementedAt": "<ISO>",
      "implementedFiles": [],
      "shapeToFile": {}
    }
  }
}
```

Upsert `implementations.<targetShapeId>`. Do **not** store `designSnapshot` here (it lives in the per-shape state file). Then stop.

The implementation is complete only after 10d.
