---
name: penpot-apply-design-updates
description: Helper of penpot-sync-code-to-design. Applies a code-derived design delta to the open Penpot file via MCP execute_code. Do not invoke directly unless that orchestrator asked you to. Requires Penpot MCP server connection.
metadata:
  mcp-server: penpot-local
---

# Apply Design Updates to Penpot

Internal helper of **`penpot-sync-code-to-design`**. Do not treat this as a standalone entry point.

## Inputs

- Design delta: `{ [shapeId]: { text?, fills?, layout?, typography? } }`
- Penpot file connected via MCP

## Workflow

For each `shapeId` in the delta, `execute_code` to update the shape. Prefer `penpotUtils.findShapeById(id)`. Copy the shape into `storage` before mutating.

Field mapping:

| Delta | Penpot |
| ----- | ------ |
| `text` | `shape.characters = text` (text layers only) |
| `fills` | replace `shape.fills` entire array |
| `layout.dir` / gaps / padding | `shape.flex.*` (or grid) |
| `typography.fontSize` | `shape.fontSize` (string) |
| `typography.fontWeight` | `shape.fontWeight` |

Do not use `resize()` for font size. After text changes with auto grow, sleep ~100ms before reading bounds.

If a shape is missing, record failure and continue. Never `appendChild` for z-order.

Read `scripts/apply-delta.js`, substitute the delta, run via `execute_code`. One shape per call if payloads are large.

Report per-shape success/failure and surface API errors.

## Prerequisite

Penpot MCP must expose shape updates via `execute_code` (it does). If a property is missing, look it up with `penpot_api_info` and retry — do not invent APIs.
