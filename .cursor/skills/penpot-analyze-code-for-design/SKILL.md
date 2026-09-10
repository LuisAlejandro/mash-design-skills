---
name: penpot-analyze-code-for-design
description: Helper of penpot-sync-code-to-design. Turns current UI code into a Penpot design delta (text, fills, layout, typography) without calling Penpot. Do not invoke directly unless that orchestrator asked you to.
---

# Analyze Code for Design

Internal helper of **`penpot-sync-code-to-design`**. Do not treat this as a standalone entry point.

No Penpot API calls. Output is a structured delta for `penpot-apply-design-updates`.

## Inputs

- Component path(s) from the state file `implementedFiles` / `shapeToFile`
- Optional root `shapeId` and `shapeToFile` (sub-shape → file region)

## Workflow

1. Read the component file(s) and related styles/tokens.
2. Extract design-relevant data:
   - Text (JSX literals, i18n keys)
   - Colors (Tailwind classes, CSS vars, theme tokens)
   - Spacing (margin, padding, gap)
   - Typography (font size/weight)
   - Layout (flex/grid, direction, alignment)
3. Use `.cursor/rules/penpot-design-system.mdc` and `.cursor/rules/penpot-ds-<page-slug>.mdc` to map project tokens → Penpot semantics (reverse of implement-design mappings).
4. If the state file has `designSnapshot`, diff against it and emit **only changed fields**.
5. Output:

```json
{
  "<shapeId>": {
    "text": "optional new characters",
    "fills": [{ "fillColor": "#hex", "fillOpacity": 1 }],
    "layout": { "dir": "column", "rowGap": 16, "padding": {} },
    "typography": { "fontSize": "16", "fontWeight": "600" }
  }
}
```

Use a stable key when `shapeId` is not enough (e.g. `shapeId#nth-text`). Do not call Penpot.
