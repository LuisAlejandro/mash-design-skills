---
name: penpot-apply-design-updates
description: Helper of penpot-sync-code-to-design. Applies a code-derived design delta to a Penpot file via penpot-local. Do not invoke directly unless that orchestrator asked you to. Requires Penpot MCP server connection.
metadata:
  mcp-server: penpot-local
---

# Apply Design Updates to Penpot

Internal helper of **`penpot-sync-code-to-design`**. Do not treat this as a standalone entry point.

## Inputs

- Design delta: `{ [shapeId]: { text?, fills?, layout?, typography? } }`
- `fileId` and `pageId` from the import handoff or the caller

## Workflow

For each `shapeId`, call `penpot_update_shapes` with one patch. Pass `fileId` and `pageId`. There is no selection.

Field mapping:

| Delta | `penpot_update_shapes` patch |
| ----- | ---------------------------- |
| `text` | `characters` (text shapes only) |
| `fills` | `fills` array, or `fillColor` for one solid hex |
| `layout.dir` / gaps / padding | `layout` (`type` `flex` or `grid`, `dir`, `rowGap`, `columnGap`, `padding`) |
| `typography.fontSize` | `fontSize` (string) |
| `typography.fontWeight` | `fontWeight` (string) |

When the delta names a library token, call `penpot_apply_tokens` for that attribute instead of writing only the raw value. That writes `applied-tokens` and the resolved fill, font, gap, or radius together.

If a shape is missing, record failure and continue.

Report per-shape success/failure and surface API errors.

## Prerequisite

`penpot-local` must be connected. Shape updates go through `penpot_update_shapes` and `penpot_apply_tokens`.
