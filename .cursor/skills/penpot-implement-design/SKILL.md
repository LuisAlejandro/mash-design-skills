---
name: penpot-implement-design
description: Translates Penpot designs into production-ready code and always runs review, sync, and polish. Use when implementing UI from Penpot (user has shape selected or provides shape id), when user mentions "implement design", "generate code". Discovers how to run the dev server (Makefile preferred, then docker compose, then yarn/pnpm/npm scripts) and the localhost:port URL if not provided; then runs penpot-design-reviewer, penpot-design-sync until aligned, and penpot-design-iterator. Requires Penpot MCP server connection.
metadata:
  mcp-server: penpot-local
---

# Implement Design

## Overview

This skill provides a structured workflow for translating Penpot designs into production-ready code with pixel-perfect accuracy. It uses the Penpot MCP (execute_code, export_shape) to get design context and visuals, and ensures 1:1 visual parity with the design.

**Orchestration:** After completing implementation (Steps 1–7), you **always** obtain a live app URL (from the user or by discovering and starting the dev server—see Step 7b), then **orchestrate** in order: **penpot-design-reviewer** (Step 8), **penpot-design-sync** until aligned (Step 9), then **penpot-design-iterator** (Step 10 — up to 5 cycles; stop early when PNG + inventory align). **CRITICAL: Steps 8–10c are mandatory. Do NOT stop or end your turn after Step 7. Continue immediately to Step 8.** The only exception is if the dev server cannot be started and the URL cannot be determined — in that case, document what was tried and stop after Step 7.

## Prerequisites

- Penpot MCP server (`penpot-local` or `user-penpot-local`) must be connected; the user must have their Penpot file connected to the MCP plugin
- Target shape: `ROOT_BOARD_ID` / `shapeId` argument, or `rosey/designs/<page-slug>/penpot-import/handoff.json`, or a Penpot selection
- Live app URL is required for Steps 8–10; if the user does not provide it, you must discover how to run the dev server and infer the URL (Step 7b)
- Project should have an established design system or component library (preferred)

## Required Workflow

**Follow these steps in order. Do not skip steps.**

### Step 1: Confirm Target Shape and Identify Page

Resolve the target shape **in this order**. Do not wait for a Penpot click when an id is already known.

1. Argument `ROOT_BOARD_ID` or `shapeId`.
2. `rosey/designs/<page-slug>/penpot-import/handoff.json` `rootBoardId` (use the pipeline `pageSlug` when given; otherwise glob `rosey/designs/*/penpot-import/handoff.json`).
3. Current Penpot selection (first shape).

Set `storage.targetShapeId` via `execute_code` **before** serialize:

```javascript
storage.targetShapeId = "<resolved-uuid>";
```

If nothing resolves, ask the user to select the shape in Penpot or pass the id.

**Identify the current page (execute_code):** Read `scripts/get-current-page.js` in this skill's directory and run it via Penpot MCP execute_code.

**Page slug:** use `handoff.pageSlug` when present. Do **not** re-slugify the Penpot page title. Fall back to slugifying `pageName` only if there is no handoff.

### Step 1b: Detect Previous Implementation

Check whether this shape has been implemented before. Check **two files** in order:

**1. Check the per-shape state file** (`.cursor/penpot-implement-state-<shapeId>.json`):

Using the current selection's shape ID, check if `.cursor/penpot-implement-state-<shapeId>.json` exists. If it exists **and** contains a `completedAt` field → this is a **re-run** (incremental update mode). The state file contains:
  - `implementedFiles` — files created/modified in the last run
  - `shapeToFile` — which Penpot shape IDs map to which project files
  - `designSnapshot` — the old shape tree for diffing in Step 2c

Tell the user: "Previous implementation found for '<targetShapeName>' (completed \<timestamp\>). I'll diff against the last run and apply only the changes."

**2. If no state file exists for this shape**, check the cumulative registry (`.cursor/penpot-implement-registry.json`):

If the registry exists and contains an entry for the current shape's ID under `implementations.<targetShapeId>` → this is a **re-run of a previously implemented shape** (incremental update mode). Load `implementedFiles` and `shapeToFile` from the registry entry. Note: the registry does not store `designSnapshot`, so the diff in Step 2c will be limited to detecting file-level changes rather than property-level diffs.

Tell the user: "Previous implementation found in registry for '<shapeName>' (last implemented \<lastImplementedAt\>). I'll use the recorded file mapping for targeted updates."

**3. If neither file has a match**, this is a **first run**. Proceed normally.

Set a flag `isIncrementalUpdate = true/false` to guide behavior in Steps 2c and 5.

### Step 1c: Classify Selection Scope

Determine **what kind of thing** the user selected so Step 5 knows **where** to write code. Read `scripts/classify-selection.js` in this skill's directory and run it via Penpot MCP execute_code. It returns `isMainBoard`, `isPageRootChild`, `depthFromRoot`, `childCount`, and dimensions.

Combine the classification result with the variant detection from Step 2 (run later) to assign one of three scopes. Until variant detection runs, tentatively assign based on the classification script alone; adjust after Step 2 if the shape turns out to be a component instance.

**Decision tree:**

| # | Condition | Scope | Output location |
|---|---|---|---|
| 1 | `isMainBoard` is `true` (selected shape is a top-level board on the page) | **Page** | Create or update the **route/page file** from the page-to-route mapping in the base design system rules (e.g. "Dashboard (1440)" → `/dashboard` → `app/dashboard/page.tsx`). Decompose large child boards into imported components. |
| 2 | Shape is a library component instance (from variant detection in Step 2) | **Component** | Create or update a file in the **component directory**. Do not create or modify any page/route file. |
| 3 | `isPageRootChild` is `true` AND `childCount > 0` AND NOT a library component instance | **Section** | Create as a **component**. Then ask the user: "This looks like a section of the '\<pageName\>' page. Want me to also import and render it in the page file for \<route\>?" If yes, wire it in. If no, leave it standalone. |
| 4 | Everything else (deeper nesting, leaf shapes, small elements) | **Component** | Create or update a file in the **component directory**. Do not create or modify any page/route file. |

Rules are evaluated top-to-bottom; first match wins. Record the assigned `selectionScope` (`"page"`, `"section"`, or `"component"`) — it is used in Step 5 to determine output location and in Step 10c for the manifest.

**If the page-to-route mapping is missing** (no base design system rules or no entry for the current page): for Page scope, ask the user which file to write to. For Section/Component scope, use the component directory from codebase analysis.

### Step 2: Fetch Design Context

**Data reuse:** Before running the Penpot introspection scripts below, check for the handoff artifact at `.cursor/penpot-design-context.json` in the project root. If it exists, **read it and reuse its data** — skip invoking the `penpot-token-resolution` skill (the tokens are already resolved in the artifact), skip re-fetching library data, page structure, comments, and fonts. The artifact is page-keyed: use the `pages.<page-slug>` entry matching the selected shape's page for page-specific data (colors, fonts, comments). This file is written by `penpot-create-design-system` (Step 3b) and survives context window limits and cross-conversation invocations. If the file does not exist (this skill was invoked standalone), run all scripts below as normal, including the token resolution step. You still need to run the design-context script below for the _selected shape's_ layout/structure. Also reuse the library/component data when checking for component variants later in this step. The flows and shape-specific comments queries should still run (they are scoped to the selected shape).

Call the Penpot MCP **execute_code** tool with the script in `scripts/serialize-shape.js` in this skill's directory. Read that file and run it via execute_code. It uses `storage.targetShapeId` (then selection). Use the returned object as your structured design data.

**Resolve tokens (separate step):**

After the script above returns, read the `penpot-token-resolution` skill and follow its **shape** mode. The token names are already in `storage.tokenNamesToResolve`. Run the shape execute_code script from that skill. It returns `{ resolvedTokens, failedTokens }`. Merge these into the design context results from above.

**Persist the target shape ID:** After the script above returns successfully, write the target shape ID and page context to `.cursor/penpot-implement-state-<shapeId>.json` (where `<shapeId>` is the target shape's UUID) so it survives MCP reconnections (which clear `storage`). Each shape gets its own state file, enabling concurrent implementations in different chat windows.

```json
{
  "targetShapeId": "<id from storage.targetShapeId>",
  "targetShapeName": "<name from designContext.name>",
  "pageSlug": "<derived page slug>",
  "pageName": "<page name from Step 1>",
  "startedAt": "<ISO timestamp>"
}
```

If `storage.targetShapeId` is lost in a subsequent execute_code call (MCP reconnected), read this file to restore the ID and set `storage.targetShapeId` in the next execute_code before proceeding. If the shape ID itself is unknown (both `storage` and in-memory state lost), glob for `.cursor/penpot-implement-state-*.json` files that have no `completedAt` field (i.e., still in-progress). If exactly one matches, use it. If multiple match, list them and ask the user which implementation to resume. This avoids interrupting the user to re-select the shape.

- If the response contains `error`, ask the user to select a shape in Penpot and repeat.
- Otherwise use the returned object (and `storage.targetShapeId` in subsequent execute_code calls if needed):
  - **designContext** — layout, typography, colors, spacing, and structure
  - **generatedCss** — treat as the source-of-truth CSS from Penpot; use it when writing styles instead of reconstructing from raw properties
  - **generatedMarkup** — use as the structural HTML/SVG starting point, then adapt to the project's framework (e.g. React JSX, Vue template)

Write `{ generatedMarkup, generatedCss }` to `rosey/designs/<page-slug>/review/generated-baseline.json` so Steps 8–10 Playwright parity can serve Penpot markup as the baseline (not candidate HTML).
- From the **penpot-token-resolution** skill (shape mode, run as a separate step after the script above):
  - **resolvedTokens** — token name → value map; use for exact token-to-project-token mapping instead of matching by hex
  - **failedTokens** — list of token names that could not be resolved (not found or API error). If non-empty, warn the user that these tokens will fall back to raw hex values from the design context. List the failed names so the user can investigate or accept the gap
- Additional fields from the design context:
  - **layout.childrenReversed** — when `true` (flex `dir` is `"column"` or `"row"`), the `children` array in the design context is in **reverse visual order** (first element in the array appears last visually). Reverse the array when generating HTML/JSX to produce correct visual ordering
  - **pathContent** (on `type: "path"` nodes) — array of `PathCommand` objects representing the SVG path data. Use to inline custom vector shapes as `<svg><path d="...">` elements instead of requiring a raster export
  - **svgContent** (on `type: "svg-raw"` nodes) — raw SVG markup embedded in the shape. Inline directly or extract as an SVG component
  - **booleanType** (on `type: "bool"/"boolean"` nodes) — the boolean operation (`union`, `difference`, `intersection`, `exclude`). Export as SVG via `export_shape` since boolean ops are hard to reproduce in CSS
  - **exportSettings** — designer-defined export presets (format, scale, suffix). Honor these when exporting assets rather than always using default params
  - **interactions** — trigger + action pairs defining prototyping behavior. Translate to code in Step 5 (see "Interaction translation")

**Check for component variants and library mapping (execute_code):** After fetching design context, check whether the selected shape is a library component instance and whether it has variant siblings. Read `scripts/variant-detection.js` in this skill's directory and run it via Penpot MCP execute_code.

> **API note:** The variant detection script uses methods (`isComponentInstance()`, `component()`, `isVariant()`, `variants.variantComponents()`, `variantProps`) that may not be available in all Penpot Plugin API versions. The script wraps each API probe in its own try/catch so failures are non-fatal. If `variantError` is returned, use the Penpot MCP `penpot_api_info` tool to look up the current Shape and LibraryComponent API, adjust method names, and retry before falling back to heuristic detection.

- **Check `apiMethodsAvailable`** to see which variant APIs were found. If key methods are missing, use `penpot_api_info` to look up the correct method names for the current API version and retry.
- If `libraryMatch` is found, note the Penpot component name for mapping to an existing project component.
- If `variantProperties` is non-empty, these are the variant property names (e.g. `["State", "Size"]`). Each variant in `variants` has a `props` map (e.g. `{ State: "hover", Size: "large" }`). Implement each variant as the appropriate CSS pseudo-class, component prop, or state.
- The script first tries the proper Penpot Variants API. If the shape is not a library component or has no formal variants, it falls back to a heuristic: scanning sibling shapes under the same parent board whose base name (before `/` or `(`) matches, **and** whose type and dimensions are similar (within 50% tolerance). This avoids false positives like `Card/Header` and `Card/Footer` being treated as variants of each other. If heuristic detection is used, `variantDetection` will be `"heuristic"`.
- If no variants are found but the design visually contains state variants, manually inspect sibling frames and implement the appropriate states.

**Fetch prototyping flows (execute_code):** Penpot Flows define prototyping starting points and multi-step user journeys. Read `scripts/prototyping-flows.js` in this skill's directory and run it via Penpot MCP execute_code.

- **flows** — prototyping flows on the current page. Each flow has a starting shape; map flows to route entry points or user journey starting screens.
- **interactions** — flattened list of all interactions within the target shape tree, with trigger type, action type, destination shape/page, URL, or overlay target. Use this in Step 5 to generate event handlers, router links, modal triggers, etc.

**Collect designer comments on target shape (execute_code):** Comments attached to or near the target shape carry designer intent, edge-case notes, and implementation instructions. Read `scripts/collect-shape-comments.js` in this skill's directory and run it via Penpot MCP execute_code.

- If comments are found within the target shape's bounds, include their content as implementation context. Designer notes may specify: animation behavior, edge cases, conditional visibility, responsive overrides, or accessibility requirements.
- If the comment API is unavailable, proceed without comments — this is non-blocking.

### Step 2c: Create Design Snapshot and Diff

After fetching the design context, create a snapshot for change detection on future re-runs.

**Create the snapshot:** Read `scripts/create-design-snapshot.js` in this skill's directory and run it via Penpot MCP execute_code. It walks the target shape tree and returns a flat map of `{ shapes: { [shapeId]: properties }, rootShapeId, shapeCount }`. Each entry contains only diffable properties (fills, strokes, shadows, text, layout, dimensions, tokens, child order) — much lighter than the full design context.

**If `isIncrementalUpdate` is true** (from Step 1b):

1. Load the `designSnapshot` from `.cursor/penpot-implement-state-<shapeId>.json` (the old snapshot).
2. Diff old vs new snapshots to produce a changeset:
   - **Added shapes:** IDs present in the new snapshot but absent from the old.
   - **Removed shapes:** IDs present in the old snapshot but absent from the new.
   - **Modified shapes:** IDs present in both, with at least one property value that differs. For each, list the changed properties and their old/new values.
   - **Unchanged shapes:** IDs present in both with identical property values.
3. Produce a human-readable summary, e.g.: "3 shapes modified (Button: fill color #0066FF → #FF6600, Header: text 'Welcome' → 'Dashboard'), 1 added (NewIcon), 1 removed (OldBadge), 28 unchanged."
4. **Short-circuit check:** If nothing changed (zero added, removed, or modified), tell the user "No design changes detected since the last run — the implementation should already be up to date." Offer to re-run the review/sync anyway or stop. If the user chooses to stop, skip to Step 10c.
5. Tell the user the changeset summary before proceeding.
6. Also load `implementedFiles` and `shapeToFile` from the state file — these are needed in Step 5 for targeted updates.

**If `isIncrementalUpdate` is false** (first run): Keep the new snapshot in memory. It will be saved alongside the implementation manifest in Step 10c.

### Step 2d: Build Control Inventory (mandatory)

**CRITICAL: This step prevents missing UI elements.** Before proceeding to implementation, build an exhaustive inventory of every visible, interactive, or prominent UI element in the target design frame. This inventory becomes the mandatory implementation checklist — every item must be either implemented or explicitly deferred with a reason.

**Walk the full shape tree** from the design context (Step 2) and categorize every non-hidden element:

1. **Structural elements:** headings, section titles, dividers, containers, cards
2. **Interactive controls:** buttons, search inputs, filter controls, dropdowns, toggles, checkboxes, radio buttons, sliders, pagination
3. **Data display:** tables, lists, grids, charts, badges, tags, avatars, status indicators
4. **Navigation:** tabs, breadcrumbs, links, menus, sidebars
5. **Content:** paragraphs, labels, descriptions, placeholder text, images, icons
6. **Feedback:** toasts, alerts, progress bars, loading indicators, empty states

**Output a numbered checklist** in this format:

```text
Control Inventory for "<shapeName>":
1. [heading] Section title — "Threats in Selected Phase"
2. [search] Search input — placeholder "Search threats..."
3. [button] Filters button — with filter icon
4. [tabs] Sub-tab navigation — "All", "Critical", "Warning"
5. [table] Data table — columns: Threat, Severity, Phase, Status
6. [card] Threat detail card — expandable with description
...
```

**Reference view cross-check (mandatory):** After building the inventory from the design, scan the codebase for comparable views (views that serve a similar purpose — e.g., other table views, other list views, other modal tabs). If those reference views include controls (search, filters, pagination, sorting, bulk actions) that also appear in the design, explicitly verify they are on the inventory. If the design includes them but they were somehow missed in the tree walk, add them. If comparable views have controls that the design does NOT include, note the discrepancy but do not add them — the design is the source of truth.

**Persist the inventory** to `rosey/designs/<page-slug>/review/control-inventory.json` as a JSON array of `{ id, name, kind, status }` (status may start as `"pending"`). Pass that path to the reviewer as `--inventory`. The inventory also stays in memory for Step 5.

### Step 3: Capture Visual Reference

Call the Penpot MCP **export_shape** tool with `shapeId` set to `storage.targetShapeId` (the UUID) and `format: "png"` (or `"svg"` if you prefer vector reference). Fall back to `shapeId: "selection"` only if the stored id is gone. Save the PNG under `rosey/designs/<page-slug>/review/penpot-export.png`. It is the visual baseline for Steps 8–10.

### Step 4: Export Required Assets

- From the design context (Step 2), identify any child shapes that are images (`type === 'image'`) or have image fills (`fills` with `fillImage`). For each such shape, call **export_shape** with that shape's `id` (use execute_code to get the shape by id if needed) and `format: "png"` or `"svg"`. For raw image data use `mode: "fill"` when exporting a shape that has an image fill.
- **Path shapes** (`type === "path"`): If `pathContent` is available, convert the path commands to an SVG `<path d="...">` for inlining. If the path is complex or has fills/strokes that are hard to reproduce, export via **export_shape** as SVG instead.
- **SvgRaw shapes** (`type === "svg-raw"`): Use `svgContent` from the design context directly as inline SVG. If missing, export via **export_shape** as SVG.
- **Boolean shapes** (`type === "bool"/"boolean"`): Always export via **export_shape** as SVG — boolean operations (union, difference, intersection, exclude) are not reproducible in CSS alone.
- **Export presets**: If a shape has `exportSettings` (designer-defined export presets), honor those settings (format, scale, suffix) when exporting instead of using defaults.
- Save exported assets into the project's asset directory. Do not add new icon packages; use only assets exported from the Penpot design.

### Step 5: Translate to Project Conventions

**Before translating, verify design system rules are available.** Check for the following files:

1. `.cursor/rules/penpot-design-system.mdc` — base rules (project-wide conventions, component paths, styling approach, interaction patterns).
2. `.cursor/rules/penpot-ds-<page-slug>.mdc` — page overlay for this `pageSlug` (from handoff, not a re-slugified title).

If both files exist, load and follow both — the page overlay takes precedence when it conflicts with the base.

If only the base exists but the page overlay for the current page is missing, **tell the user**: "Base design system rules exist, but there's no page overlay for '<pageName>'. Page-specific color mappings, component mappings, and font requirements won't be available. Would you like me to generate the page overlay first (runs PCDS Steps 3–5 for this page), or proceed without it?" If the user wants the overlay, read the `penpot-create-design-system` SKILL.md and follow Steps 3–5 for the current page (the base already exists, so Steps 1–2 are skipped per PCDS Step 0). Then return here and continue. If the user declines, proceed — derive mappings from the handoff artifact or the design context as best you can.

If no rules files exist at all, analyze the codebase directly for component patterns, styling approach, and token locations before proceeding.

**Handling hidden shapes:** Shapes in the design context with `hidden === true` should **not** be rendered as visible UI. Skip them during implementation unless they serve a specific purpose documented in the design (e.g., accessibility-only elements).

**Control inventory cross-reference (mandatory before AND after writing code):**

Before writing any code, review the control inventory from Step 2d. Plan your implementation to cover every item on the checklist. After writing all code, walk the inventory again and mark each item:

- **Implemented** — the element exists in the code
- **Deferred** — explicitly not implemented, with a stated reason (e.g., "depends on API not yet available")
- **N/A** — design-only element not relevant to code (e.g., annotation, redline)

**If any item is not marked "Implemented" or "Deferred" with a valid reason, you MUST go back and implement it before proceeding to Step 6.** This is the primary safeguard against missing UI elements like search bars, filter buttons, toolbars, or pagination.

**Component reuse check (mandatory before creating any new component):**

Before writing a new component file, search the project's component directories for existing components that could fulfill the same role. Follow this procedure:

1. **Identify what you are about to create.** Determine the component's purpose (e.g., button, card, input, modal, avatar, badge) and the props/variants it needs.
2. **Scan existing components.** Glob the component directories listed in the design system rules (or the directories detected in Step 2's codebase analysis — typically `src/components/`, `src/ui/`, `packages/ui/`, etc.) for files whose names or exported symbols suggest overlapping functionality. Check barrel files (`index.ts`/`index.js`) for a quick inventory. Also check the Component & Variant Mapping table in the design system rules if one exists.
3. **Evaluate matches.** For each candidate, read its exports and props interface. A component is a match if:
   - It serves the same visual/functional purpose (e.g., both are buttons, both are card containers), **or**
   - It covers ≥ 80 % of the required props/variants and can be extended with a new variant or wrapper.
4. **Decide:**
   - **Exact or near match found →** Use it. Add a new variant prop value, extend its styles, or wrap it — do **not** create a duplicate.
   - **Partial match found →** Prefer extending the existing component. Only create a new component if the required changes would break the existing component's API contract or semantics.
   - **No match found →** Create the new component in the project's designated directory following naming conventions.
5. **Log the decision.** In your response, briefly state which existing components you considered and why you reused or chose not to reuse them.

**Track design system rule gaps (mandatory):**

Throughout Steps 5–9, maintain a running list of gaps encountered in the design system rules. A gap is any situation where the rules were missing, incorrect, or insufficient. Examples:

- A Penpot color used on the shape has no entry in the Color Mapping table
- A Penpot component has no entry in the Component & Variant Mapping table
- A gradient or image fill has no mapping guidance
- A font used in the design isn't mentioned in Font Requirements
- The styling approach in the rules doesn't match what the project actually uses
- A Penpot interaction type has no translation guidance in the rules

Record each gap as: `{ rule_file, section, description, suggestion }`. You will surface these in Step 10b.

**Incremental update mode (when `isIncrementalUpdate` is true):**

When a changeset is available from Step 2c, use it for targeted updates instead of re-translating the entire shape tree:

1. **Modified shapes → targeted file edits.** For each modified shape, look up `shapeToFile` (from Step 1b) to find which project file implements it. Read that file and apply only the changed properties. Examples:
   - Fill color changed → update the color token/class in that component's styles
   - Text content changed → update the string literal or i18n key
   - Font size/weight changed → update the typography class or token
   - Layout gap/padding changed → update the spacing values
   - Dimensions changed → update width/height or resize constraints
   - Children reordered → reorder JSX/HTML elements to match

2. **Added shapes → create or extend.** For shapes that are new in the design:
   - Determine if they belong inside an existing implemented component (check parentId against `shapeToFile`). If yes, add the new element to that file.
   - If the new shape is a standalone component (top-level child of the root), run the full component reuse check (see below) and create or extend as needed.

3. **Removed shapes → warn, don't auto-delete.** For shapes that were in the old design but not the new: tell the user "Shape '\<name\>' was removed from the design. The code in '\<file\>' may need manual cleanup — I won't auto-delete code." The user decides whether to remove it.

4. **Unchanged shapes → skip.** Do not re-check or re-translate shapes that haven't changed. Skip the component reuse check for them — it was already done in the previous run.

5. **Track file changes.** Update `implementedFiles` and `shapeToFile` as you go. New files get `action: "created"`, previously-existing files being edited again get `action: "modified"`. Added shapes get new entries in `shapeToFile`.

After applying targeted edits, proceed to Step 6 (visual parity check) and Step 7 as normal — the review/sync loop will catch anything the targeted edits missed.

**Full implementation mode (when `isIncrementalUpdate` is false):**

Translate the Penpot design context into this project's framework, styles, and conventions. Track every file you create or modify and the shape IDs involved — these are saved to the implementation manifest in Step 10c.

**Output location (driven by `selectionScope` from Step 1c):**

- **Page scope:** Create or update the route/page file identified in Step 1c. Use the page-to-route mapping from the base design system rules to resolve the file path (e.g. Next.js App Router: `app/<route>/page.tsx`, Pages Router: `pages/<route>.tsx`, Vue: `src/pages/<Route>.vue`). If the route file already exists, read it and integrate the new layout into its existing structure. Decompose the design tree: for each major child board that represents a reusable piece (card, sidebar, nav), create a separate component in the component directory and import it into the page file. Leaf elements (text, icons, simple shapes) stay inline in the page file.

- **Section scope:** Create the component in the component directory. If the user accepted the offer in Step 1c to wire it into the page file, also open the route/page file for the current page and add an import + render of the new component at the appropriate position. If the page file doesn't exist yet, create it with just the section component rendered.

- **Component scope:** Create or update a file in the component directory following naming conventions. Do **not** create or modify any page/route file. If the user later asks "where do I use this?", suggest the page file from the page-to-route mapping or Storybook if the project has one.

**Key principles:**

- Use the design context from Step 2 (and the exported image from Step 3) as the representation of design and behavior
- Translate Penpot gradient fills (in `shape.fills`, linear/radial) to CSS gradients (`linear-gradient`, `radial-gradient`) when generating styles; use `generatedCss` from Step 2 when available for exact gradient output
- Replace Tailwind or default utility classes with the project's preferred utilities or design system tokens
- Reuse existing components (buttons, inputs, typography, icon wrappers) instead of duplicating functionality
- Use the project's color system, typography scale, and spacing tokens consistently
- Map Penpot `shape.tokens` values to project design tokens using the color/token mapping from the design system rules
- Respect existing routing, state management, and data-fetch patterns
- If variant siblings were found in Step 2, implement each variant as the appropriate interactive state (CSS pseudo-class, component prop, or conditional class)
- **Reference view parity:** If comparable views in the codebase include standard controls (search, filters, pagination, sorting, bulk actions) and the design also includes them, ensure this implementation includes them too. Do not assume they are optional just because the design context summary didn't highlight them — check the control inventory from Step 2d

**Interaction translation (mandatory when interactions exist):**

If the interactions list from Step 2 is non-empty, translate each interaction into code behavior. Use the Page-to-Route / Interaction Patterns mapping from the design system rules if available; otherwise infer from the action type:

| Penpot Action | Code Translation |
| --- | --- |
| **NavigateTo** (destination shape/page) | Router navigation: `<Link to="...">`, `router.push(...)`, or `<router-link>`. Map the destination page/board name to a project route using the page mapping table. |
| **OpenOverlay** (overlay shape) | Open a modal, drawer, popover, or tooltip. Use the project's modal/overlay system. The overlay shape id identifies which component to show. |
| **CloseOverlay** | Dismiss the currently open modal/drawer. Call the project's close/dismiss handler. |
| **ToggleOverlay** | Toggle visibility of the overlay component (show if hidden, hide if shown). |
| **OpenUrl** (url) | External link: `<a href="url" target="_blank" rel="noopener noreferrer">` or `window.open(url)`. |
| **PreviousScreen** | Back navigation: `router.back()` or `history.back()`. |

Trigger mapping:

- `click` → `onClick` / `@click` handler
- `mouse-enter` → `onMouseEnter` / `@mouseenter`, or CSS `:hover` if the action is purely visual
- `mouse-leave` → `onMouseLeave` / `@mouseleave`
- `after-delay` → `setTimeout` with the specified delay, or CSS `animation-delay`

Animation mapping (when an interaction includes an animation):

- `Dissolve` → CSS `opacity` transition or `fade-in`/`fade-out`
- `Slide` → CSS `transform: translateX/Y` transition
- `Push` → CSS `transform` with the adjacent element also transitioning out

If a designer comment on the shape provides additional interaction context, follow the comment over the default mapping.

**Designer comments:** If Step 2 collected comments within the target shape's bounds, incorporate their instructions. Comments may specify: conditional visibility logic, animation timing, responsive overrides, accessibility notes, or implementation preferences that override defaults.

**Responsive strategy:**

- If the design system rules define breakpoints and a responsive strategy, follow them
- If the Penpot design includes frames at multiple viewport widths, implement each as a responsive breakpoint
- If neither exists, implement at the design's native width and use reasonable responsive defaults (fluid widths, wrapping flex containers) to avoid horizontal overflow on smaller screens

### Step 6: Achieve 1:1 Visual Parity

Strive for pixel-perfect visual parity with the Penpot design.

**Guidelines:**

- Prioritize fidelity to the Penpot design (layout, typography, colors from design context)
- Avoid hardcoded values; use design tokens from the project or from Penpot tokens where available
- When conflicts arise between design system tokens and Penpot specs, prefer design system tokens but adjust spacing or sizes minimally to match visuals
- Follow WCAG requirements for accessibility
- Add component documentation as needed

### Step 7: Validate Against Penpot

Before marking complete, validate the final UI against the exported Penpot image from Step 3.

**Validation checklist:**

- [ ] Layout matches (spacing, alignment, sizing)
- [ ] Typography matches (font, size, weight, line height)
- [ ] Colors match exactly
- [ ] Interactive states work as designed (hover, active, disabled) if applicable
- [ ] Interactions translated (NavigateTo → links, OpenOverlay → modals, etc.) if present
- [ ] Animations match design intent (dissolve, slide, push transitions) if specified
- [ ] Path/SVG shapes render correctly (inlined or exported)
- [ ] Responsive behavior follows design intent
- [ ] Assets render correctly (including designer export presets honored)
- [ ] Designer comment instructions addressed if any were found
- [ ] Fonts load correctly (all Penpot fonts available in project)
- [ ] Accessibility standards met

### Step 7b: Ensure dev server is running and obtain live app URL

You need a live app URL for Steps 8–10. If the user did **not** provide one, discover how to run the dev server and infer the URL.

**Check for an already-running server (do this first):** Before starting anything, check whether a dev server is already running:

1. List the IDE terminal files and scan their output for URLs matching `http://localhost:\d+` or `https?://127\.0\.0\.1:\d+`. If found, use that URL and skip the rest of Step 7b.
2. As a fallback, try common ports by running `curl -s -o /dev/null -w "%{http_code}" http://localhost:PORT` for ports 3000, 5173, 4200, 8080, 8000. If any returns a 2xx or 3xx status, use `http://localhost:PORT` and skip the rest.

Only proceed to the startup checklist below if no running server is found.

**Monorepo detection (do this second):** Before running the checklist below, check if the project is a monorepo. Look for: `pnpm-workspace.yaml`, `lerna.json`, `nx.json`, `turbo.json`, or a root `package.json` with a `workspaces` field. If found, locate the frontend/web app package (common paths: `apps/web/`, `apps/frontend/`, `packages/app/`, or identified by framework dependencies like `react`, `vue`, `next`, `nuxt`, `svelte` in its `package.json`). Run the checklist below **from that package's directory**, not the project root.

Use this **checklist in order of preference** (most preferred first):

1. **Makefile (most preferred)**
   - Look for a `Makefile` in the project root.
   - Check for targets that start a dev server: `dev`, `start`, `run`, `serve`, `up`, `frontend`, `web`, `app`. Prefer `dev` or `serve` if present.
   - Run the chosen target (e.g. `make dev`) in the background. From the Makefile content or process output, determine the port and set the live URL (e.g. `http://localhost:3000`). If the Makefile runs a known stack, use common defaults (e.g. 3000, 5173) until output confirms.

2. **Docker Compose**
   - If no suitable Makefile target exists, look for `docker-compose.yml`, `compose.yaml`, or `compose.yml`.
   - Identify the service that serves the frontend (by name, `ports`, or build context).
   - Run `docker compose up -d` (or `docker-compose up -d`) for that service or the full stack.
   - From the port mapping (e.g. `"3000:3000"`), set the live app URL to `http://localhost:PORT` (host port).

3. **Package manager scripts (least preferred)**
   - If neither Makefile nor Docker Compose applies, check `package.json` (project root or frontend app in a monorepo).
   - Look for scripts: `dev`, `start`, `serve`, `run`, or `develop`. Use the first that clearly starts a dev server.
   - Run with the project’s package manager: `yarn dev`, `pnpm dev`, or `npm run dev` (prefer in that order if lockfiles exist). Run in the background.
   - Infer the URL from the script output (e.g. "Local: http://localhost:5173/") or from framework defaults (Vite → 5173, Next.js → 3000, Create React App → 3000, etc.).

**Inferring the URL:** Prefer the URL printed by the dev command. If not shown, use framework defaults for the detected tooling. If something is already listening on a port (e.g. from a previous run), use that port.

**If the dev server cannot be started or the URL cannot be determined:** Note what you tried (Makefile targets, compose files, scripts) and why it failed. Stop after Step 7 and tell the user they can provide a live app URL or fix the dev setup to run the full review/sync flow.

**Resuming later (Step 7c):** If you stopped after Step 7 and the user later provides a live app URL (or the dev server issue is resolved), resume directly from **Step 8** using the design context, exported image, and target shape id already gathered in Steps 1–3. Do **not** re-run Steps 1–7. If `storage.targetShapeId` was lost (e.g. MCP reconnection), first check `.cursor/penpot-implement-state-<shapeId>.json` for the persisted ID. If the shape ID itself is unknown, glob for `.cursor/penpot-implement-state-*.json` files without a `completedAt` field; if exactly one matches, use it. If multiple in-progress files exist, list them and ask the user which to resume. If found, restore the ID into `storage.targetShapeId` via execute_code and continue. Only ask the user to re-select the shape if no in-progress state file is found.

### Step 8–10d: Review, sync, iterate, and surface gaps

**CRITICAL: Do NOT end your turn, stop, or ask for permission after Step 7. You MUST immediately continue to Step 8 and execute the full review/sync/iterate flow (Steps 8 through 10d) in the same turn.** The implementation is not complete until the review, sync, iterator, gap surfacing, manifest save, and registry update have all been executed. Stopping after Step 7 is a workflow violation.

Read **REVIEW-SYNC.md** in this skill's directory and follow its workflow starting at Step 8. It contains route navigation guidance, penpot-design-reviewer orchestration (with tolerance thresholds), penpot-design-sync loop, penpot-design-iterator, Step 10b (surface design system rule gaps), **Step 10c (save implementation manifest)**, and **Step 10d (update cumulative implementation registry at `.cursor/penpot-implement-registry.json`)**. Both 10c and 10d are mandatory — do NOT stop after 10c.

**You MUST also pass the control inventory** (from Step 2d) to the review phase. The reviewer uses it to verify every design element was implemented.

For examples, best practices, and troubleshooting (including design context too large, probe script reference), see REFERENCE.md in this skill's directory.
