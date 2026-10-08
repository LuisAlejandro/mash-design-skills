---
name: penpot-token-resolution
description: Resolves Penpot design tokens via the Penpot MCP (entire catalog or tokens used on a shape). Use when creating design system rules, implementing a Penpot shape, or when the user asks to list/resolve Penpot tokens. Requires Penpot MCP server connection.
metadata:
  mcp-server: penpot-local
---

# Penpot Token Resolution

Resolve Penpot design tokens from the file library through `penpot-local`. Two modes:

| Mode | When | Call |
| ---- | ---- | ---- |
| **catalog** | `penpot-create-design-system` Step 3 (file-wide mapping) | `penpot_get_file_snapshot` |
| **shape** | `penpot-implement-design` Step 2 (tokens on one shape) | `penpot_get_shape` plus the snapshot's `library.resolvedTokens` |

Do not invent token values. If a name cannot be resolved, put it in `failedTokens`.

Use Penpot MCP `penpot-local`. Pass `fileId`. There is no plugin.

`penpot_get_file_snapshot` returns `library.resolvedTokens` and `library.failedTokens`. References such as `{other.token}` are followed to depth 10. Do not read a broken `resolvedValue` off a plugin token object.

## Catalog mode

Call `penpot_get_file_snapshot` with `fileId`.

Use:

- `library.tokenSets` — set name and tokens
- `library.themes` and `library.activeThemes`
- `library.colors` and `library.typographies`
- `library.resolvedTokens` — token name → value
- `library.failedTokens` — names that did not resolve

## Shape mode

Call `penpot_get_shape` with `fileId`, `pageId`, and `shapeId`. Collect names from `appliedTokens` on that shape and its descendants.

Resolve each name from `library.resolvedTokens` on the snapshot. Names missing there go in `failedTokens`.

Returns `{ resolvedTokens, failedTokens }`. Merge into the design context.

## Handling failures

- Non-empty `failedTokens`: warn the user. Those tokens fall back to the raw fill, font, gap, or radius on the shape.
- Snapshot missing `library`: the file has no token library yet. Proceed with library colors and raw shape values.
