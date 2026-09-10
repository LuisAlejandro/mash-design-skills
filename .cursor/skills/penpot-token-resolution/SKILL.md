---
name: penpot-token-resolution
description: Resolves Penpot design tokens via the Penpot MCP (entire catalog or tokens used on a selected shape). Use when creating design system rules, implementing a Penpot shape, or when the user asks to list/resolve Penpot tokens. Requires Penpot MCP server connection.
metadata:
  mcp-server: penpot-local
---

# Penpot Token Resolution

Resolve Penpot design tokens to concrete values through `execute_code`. Two modes:

| Mode | When | Script |
| ---- | ---- | ------ |
| **catalog** | `penpot-create-design-system` Step 3 (file-wide mapping) | `scripts/resolve-catalog.js` |
| **shape** | `penpot-implement-design` Step 2 (tokens on the selected tree) | `scripts/resolve-shape.js` |

Do not invent token values. If a name cannot be resolved, put it in `failedTokens`.

Use Penpot MCP `penpot-local` or `user-penpot-local`.

`penpotUtils.findTokenByName(name)` is the resolver. Do **not** use `token.resolvedValue` (API currently broken). Follow `{other.token}` references yourself (cap depth at 10).

## Catalog mode

Read `scripts/resolve-catalog.js` and run it via Penpot MCP `execute_code`.

If `tokenOverview()` returns more than ~200 names, the script already batches in groups of 100. If it times out, rerun with a single token set name.

Returns `{ overview, setCount, themeCount, resolvedTokens, failedTokens }`.

## Shape mode

Prerequisite: `penpot-implement-design` serialize-shape already set `storage.tokenNamesToResolve` (array of token names found on the tree).

Read `scripts/resolve-shape.js` and run it via `execute_code`.

Returns `{ resolvedTokens, failedTokens }`. Merge into the design context.

If `storage.tokenNamesToResolve` is missing, collect names from `shape.tokens` on the target tree first, then resolve.

## Handling failures

- Non-empty `failedTokens`: warn the user. Those tokens fall back to raw hex from the design context.
- Token API missing: return `{ error }` and tell the caller to look up the current API with `penpot_api_info`.
