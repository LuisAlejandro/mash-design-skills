# Penpot import — shape fields

Writes go through `penpot-local`. Pass `fileId` and `pageId` on every call. The page root parent and frame id is `00000000-0000-0000-0000-000000000000`.

## Create

`penpot_add_shapes` types: `frame`, `rect`, `text`, `circle`, `image`, `path`, `bool`.

| Field | Use |
| ----- | --- |
| `parentId`, `frameId` | Parent frame. Both are the root id for a top-level board. |
| `x`, `y`, `width`, `height` | Position inside the parent. |
| `layout` | Frames only. `{ type: "flex" \| "grid", dir, rowGap, columnGap, padding: { p1, p2, p3, p4 } }`. |
| `layoutItem` | Child sizing: `horizontalSizing` / `verticalSizing` of `fill`, `auto`, or `fix`. |
| `fillColor` | One solid hex. Or `fills` for several. |
| `characters`, `fontFamily`, `fontSize`, `fontWeight` | Text. `fontSize` and `fontWeight` are strings. |
| `growType` | `auto-width`, `auto-height`, or `fixed`. |
| `r1`–`r4` | Corner radii. |
| `hidden` | Skip from the visible tree. |

After create, `penpot_apply_tokens` binds a library token. Attributes: `fill`, `font-family`, `font-size`, `font-weight`, `row-gap`, `column-gap`, `p1`–`p4`, `r1`–`r4`. The tool writes `applied-tokens` and the resolved value together.

`penpot_update_shapes` uses the same patch, including `layout` after the frame exists.

## Library

- `penpot_add_library_color` — `name`, hex `color`
- `penpot_add_typography` — `name`, `fontFamily`, string `fontSize` and `fontWeight`
- `penpot_write_token_set` — `set.name`, `set.tokens[]` with `name`, `type` (`color`, `spacing`, `font-size`, `border-radius`), and `value`. Optional `theme` and `activate: true`.

## Errors

| Failure | What to do |
| ------- | ---------- |
| Tool error | Read the message and retry that shape. Do not restart the page. |
| Payload too large | One `penpot_add_shapes` call per top-level section. Keep ids in the handoff. |
| Lost ids | Read `.mash/designs/<page-slug>/penpot-import/handoff.json`. |
| Token bind fails | Confirm the set was written and a theme was activated. Fall back to the raw fill and record the name. |
| Image upload fails | Named rectangle placeholder `image:<name>` and list it in the handoff. |
