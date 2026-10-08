---
name: penpot-import-html
description: Import winner HTML/CSS into a Penpot page via MCP. Use after od-design-candidates + select_winner, or when the user says "import HTML to Penpot", "lock this design into Penpot". Writes a page, token set, root board, and PENPOT_IMPORT_HANDOFF. Requires Penpot MCP server connection.
metadata:
  mcp-server: penpot-local
---

# Import HTML into Penpot

Lock-in step: OpenDesign HTML is a sketch. This skill draws it into a Penpot file through `penpot-local`. Downstream implement uses the Penpot board, not the HTML.

## Overview

Input: winner `.mash/designs/<page-slug>/source/index.html` (plus colocated assets).

Output: a page in a Penpot file, a token set, a root board id, and `PENPOT_IMPORT_HANDOFF` with file, page, and shape ids for `penpot-implement-design`.

Requires the `penpot-local` stdio MCP. Pass `fileId` into every tool. There is no plugin and no selection. Internal layout JSON is fine; do not write a user-facing YAML spec.

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

`penpot-local` is connected. Resolve `fileId` with `penpot_list_teams`, `penpot_list_projects`, and `penpot_list_files` when the user did not pass one.

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

Read `layout.json`. Abort if it is empty or missing `layout`. Keep `shapeByLayoutId` in the handoff file, not in plugin storage.

### Step 2: Create the page

The Penpot **page name is `meta.slug`** (`pageSlug`), not the HTML title. That keeps later slugification identical to the pipeline slug.

Call `penpot_list_pages` with `fileId`. If a page named `meta.slug` exists, ask: use it (clear children of the root board first, with confirmation) or create `meta.slug (vN)` via `penpot_create_page`.

Otherwise `penpot_create_page` named `meta.slug`. Record `pageId`.

### Step 3: Design tokens and library assets

From `layout.json` tokens, call `penpot-local` tools. Do not invent a second token loop.

- `penpot_write_token_set` with `set.name` = `import-<page-slug>`. Map `tokens.palette` to `type: "color"`, `tokens.spacing` to `type: "spacing"` (string pixels), and typography sizes to `type: "font-size"`. Pass `theme: { name: "light", group: "", sets: ["import-<page-slug>"] }` and `activate: true`.
- `penpot_add_library_color` once per palette entry (`name`, hex `color`).
- `penpot_add_typography` once per typography entry (`fontFamily`, `fontSize` and `fontWeight` as strings, `lineHeight` as a string).

Record `tokenSetName` as `import-<page-slug>`.

### Step 4: Create the root board and walk the layout tree

`penpot_add_shapes` one root frame named `meta.name` at 1440×(estimated height, minimum 900), parent and frame `00000000-0000-0000-0000-000000000000`. Record `rootBoardId`.

Walk `layout` depth-first. For each node call `penpot_add_shapes` with an explicit `id` when you need to parent the next node:

1. `row` / `column` / `board` → `type: "frame"`. `text` → `type: "text"`. `image` → `type: "image"` after `penpot_upload_media`, or a named `rect` placeholder.
2. Set `parentId` and `frameId` to the parent frame. Pass `x` and `y` inside that parent. Do not reorder children after the fact unless `penpot_reorder_shapes` is required.
3. After the shape exists, `penpot_apply_tokens` for fill, font, gap, or radius when `layout.json` names a token. The tool writes `applied-tokens` and the resolved value together.
4. Set width and height on the shape. Text `growType` is `auto-width`, `auto-height`, or `fixed`.
5. Frames: pass `layout` (`type: "flex"`, `dir` `row` or `column`, `rowGap`, `columnGap`, `padding`) on create. Children use `layoutItem.horizontalSizing` / `verticalSizing` of `fill`, `auto`, or `fix`.
6. Text: `characters`, `fontFamily`, `fontSize`, `fontWeight`.
7. Hidden nodes: `hidden: true`.
8. Record `shapeByLayoutId[node.id] = shape.id`.

If the payload is large, one `penpot_add_shapes` call per top-level section. Keep ids in the handoff.

### Step 5: Images

For each asset, `penpot_upload_media` then an image shape. If upload fails, create a named rectangle (`image:<name>`) and list it in the handoff as a placeholder.

### Step 6: Cross-check

`penpot_get_shape` on `rootBoardId` with `includeDescendants: true` and `maxDepth: 3`. Compare section count and names to `layout.json`. Fix mismatches with `penpot_update_shapes`.

If text, auto-layout, or images are too lossy to implement from, stop, report the gaps in `BLOCKERS`, and do not claim success.

### Step 7: Persist import handoff

Write `.mash/designs/<page-slug>/penpot-import/handoff.json` — this is the canonical identity for map and implement. Do not re-slugify the Penpot page title later.

```json
{
  "fileId": "<penpot file id>",
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
FILE_ID: <penpot file id>
PAGE_ID: <penpot page id>
ROOT_BOARD_ID: <root board shape id>
TOKEN_SET: import-<page-slug>
LAYOUT_JSON: .mash/designs/<page-slug>/penpot-import/layout.json
SHAPE_COUNT: <n>
BLOCKERS: none | <reason>
END_PENPOT_IMPORT_HANDOFF
```

Offer `penpot-create-design-system` next (map) with this `pageSlug`. Then `penpot-implement-design` with `ROOT_BOARD_ID` from the handoff. Do not ask the user to select the board when `ROOT_BOARD_ID` is known.

Layout tree walk can lose text, auto-layout, or images. Record those in `BLOCKERS`. Do not claim success if the board is too lossy to implement from.
