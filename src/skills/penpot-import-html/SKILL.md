---
name: penpot-import-html
description: Import winner HTML/CSS into a Penpot page via MCP. Use after od-design-candidates + select_winner, or when the user says "import HTML to Penpot", "lock this design into Penpot". Writes a page, token set, root board, and PENPOT_IMPORT_HANDOFF. Requires Penpot MCP server connection.
metadata:
  mcp-server: penpot-local
---

# Import HTML into Penpot

Lock-in step: OpenDesign HTML is a sketch. This skill draws it into the **open Penpot file**. Downstream implement uses the Penpot board, not the HTML.

## Overview

Input: winner `.mash/designs/<page-slug>/source/index.html` (plus colocated assets).

Output: a page in the connected Penpot file, a token set, a root board id, and `PENPOT_IMPORT_HANDOFF` with shape ids for `penpot-implement-design`.

Requires `penpot-local` or `user-penpot-local` MCP and an open file. Internal layout JSON is fine; do not write a user-facing YAML spec.

For fills, gradients, strokes, shadows, text, resize, and error handling, read `REFERENCE.md` in this skill's directory.

## Inputs

- `htmlPath` — default `.mash/designs/<page-slug>/source/index.html`
- `pageSlug` — kebab-case page id (**required**). This is the Penpot page name and the artifact directory. HTML `<title>` is the root board label only.
- `assetsDir` — optional; default is the HTML file's directory

## Prerequisites

```bash
STACK="${MASH_DESIGN_STACK:-$HOME/.local/share/mash/design}"
APP="$(pwd -P)"
. "${STACK}/lib/od_daemon.sh"
od_load "$APP"
```

Penpot MCP connected; target file open in the plugin.

## Workflow

### Step 1: Parse HTML into layout JSON

```bash
STACK="${MASH_DESIGN_STACK:-$HOME/.local/share/mash/design}"
APP="$(pwd -P)"
. "${STACK}/lib/od_daemon.sh"
od_load "$APP"
PAGE_SLUG="<page-slug>"
HTML="${APP}/.mash/designs/${PAGE_SLUG}/source/index.html"
OUT="${APP}/.mash/designs/${PAGE_SLUG}/penpot-import/layout.json"

node "${SKILLS}/penpot-import-html/scripts/html-to-layout.js" \
  --html "$HTML" \
  --page-slug "$PAGE_SLUG" \
  --project-root "$APP" \
  --assets-dir "$(dirname "$HTML")" \
  --out "$OUT"
```

Read `layout.json`. Abort if it is empty or missing `layout`.

Copy selected shapes into `storage` immediately if you inspect the current page — selection is not stable.

### Step 2: Create the page

The Penpot **page name is `meta.slug`** (`pageSlug`), not the HTML title. That keeps later slugification identical to the pipeline slug.

If a page named `meta.slug` exists (`penpotUtils.getPageByName`), ask: use it (clear children of the root board first, with confirmation) or create `meta.slug (vN)`.

Otherwise create a new page named `meta.slug`. Set page background from `tokens.palette[meta.background]`.

Store `storage.pageId` and `storage.pageSlug` (`meta.slug`). Subsequent `execute_code` calls must target this page (`penpotUtils.getPageById`).

### Step 3: Design tokens and library assets

Generate execute_code scripts from `layout.json` (do not invent token loops):

```bash
node "${SKILLS}/penpot-import-html/scripts/render/build-execute-code.js" \
  --layout "$OUT" \
  --out-dir "${APP}/.mash/designs/${PAGE_SLUG}/penpot-import/execute-code"
```

Run via MCP `execute_code`, in order:

- **3a** `create-tokens.js` — token set `import-<page-slug>`
- **3b** `create-colors.js` — library colors from the palette
- **3c** `create-typographies.js` — library typographies

Activate the token set after creation (`set.toggleActive()` if needed). Token apply is async — sleep ~100ms before reading applied values.

Store `storage.tokenSetName`.

### Step 4: Create the root board and walk the layout tree

Create one root board named after `meta.name` (HTML title / board label) at 1440×(estimated height, minimum 900). Store `storage.rootBoardId`.

Walk `layout` depth-first. For each node:

1. Map type → Penpot create (`createBoard`, `createRectangle`, `createText`, `createEllipse` as needed). `row` / `column` / `board` → Board. `text` → Text. `image` → Rectangle with image fill when the asset can be imported; otherwise a named placeholder rectangle.
2. `parent.insertChild(parent.children.length, shape)` — **never** `appendChild` (broken except flex). For flex `dir` `row`/`column`, children array is reversed vs visual order — use `board.appendChild(shape)` in **visual** order.
3. Set `name`. Prefer tokens via `shape.applyToken(token, properties)` over raw fills.
4. Dimensions: `resize(w, h)` then restore `growType` on text (`auto-width` / `auto-height`).
5. Flex: `penpotUtils.addFlexLayout(container, dir)` when the container already has children. Padding/gap from `layout` object. Child `layoutChild` sizing `fill`/`auto`/`fix`.
6. Text: `characters`, font from typography token, `fontSize`, weight, align.
7. Hidden nodes: `shape.hidden = true`.
8. Store `storage.shapeByLayoutId[node.id] = shape.id`.

Do not use `parentX`/`parentY` writes; use `penpotUtils.setParentXY`.

If payload is too large, render one top-level section per `execute_code` call and keep IDs in `storage`.

### Step 5: Images

For each `assets` entry, import if MCP import is available; otherwise create a named rectangle (`image:<name>`) and list it in the handoff as a placeholder.

### Step 6: Cross-check

Re-read the page with `penpotUtils.shapeStructure(page.root, 3)`. Compare section count and names to `layout.json`. Fix mismatches.

If text, auto-layout, or images are too lossy to implement from, stop, report the gaps in `BLOCKERS`, and do not claim success.

### Step 7: Persist import handoff

Write `.mash/designs/<page-slug>/penpot-import/handoff.json` — this is the canonical identity for map and implement. Do not re-slugify the Penpot page title later.

```json
{
  "pageSlug": "<page-slug>",
  "pageName": "<meta.name board label>",
  "pageId": "<penpot page id>",
  "rootBoardId": "<root board shape id>",
  "tokenSetName": "import-<page-slug>",
  "shapeByLayoutId": {}
}
```

Then emit:

```text
PENPOT_IMPORT_HANDOFF
SUCCESS: true|false
PAGE_SLUG: <page-slug>
PAGE_NAME: <page name>
PAGE_ID: <penpot page id>
ROOT_BOARD_ID: <root board shape id>
TOKEN_SET: import-<page-slug>
LAYOUT_JSON: .mash/designs/<page-slug>/penpot-import/layout.json
SHAPE_COUNT: <n>
BLOCKERS: none | <reason>
END_PENPOT_IMPORT_HANDOFF
```

Offer `penpot-create-design-system` next (map) with this `pageSlug`. Then `penpot-implement-design` with `ROOT_BOARD_ID` from the handoff. Do not ask the user to select the board when `ROOT_BOARD_ID` is known.

Layout tree walk is still MCP and can lose text, auto-layout, or images. Record those in `BLOCKERS`. Do not claim success if the board is too lossy to implement from.

NEVER log data you also `return` from `execute_code`.
