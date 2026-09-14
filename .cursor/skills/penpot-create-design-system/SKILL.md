---
name: penpot-create-design-system
description: Generates custom design system rules for the user's codebase (map step after HTML→Penpot import). Use when user says "create design system rules", "generate rules for my project", "set up design rules", or wants project-specific conventions for Penpot-to-code workflows. Pipeline invokes this with mode:non-interactive. Standalone interactive runs may offer implement afterward.
metadata:
  mcp-server: penpot-local
---

# Create Design System Rules

## Overview

This skill is the **map** step after `penpot-import-html` (or when a Penpot frame already exists). It writes Cursor rules from the Penpot file, the app scan, and `rosey/design-system/DESIGN.md` when that package exists. Penpot is canonical for layout. The OpenDesign package is extra input, not a second rule file.

Write **only** `.cursor/rules/penpot-design-system.mdc` and `.cursor/rules/penpot-ds-<page-slug>.mdc`. Do not emit `od-design-system.mdc`.

Pipeline Stage E owns implement. In `mode:non-interactive`, do not offer or invoke `penpot-implement-design`.

## Interaction Mode

Parse `$ARGUMENTS` for at most one:

- `mode:interactive` — default. Confirm mappings (Step 4c). After save, offer implement (Step 6).
- `mode:non-interactive` — skip Step 4c and Step 6. Require or infer `pageSlug`. If `scan-and-catalog` reports `framework: unknown`, still write rules from Penpot + `DESIGN.md`. Conservative globs only (`src/**` if that directory exists). Do not stall.

If no mode token is present, set `INTERACTION_MODE=interactive`.

## Inputs

- `pageSlug` — canonical slug from the pipeline / import handoff. Overlay filename is `penpot-ds-<page-slug>.mdc`. Do not re-slugify the Penpot page title when this is set.
- Optional: `pageId` from import handoff. Match the open Penpot page via `penpotUtils.getPageById` when present.

## Prerequisites

- Penpot MCP server (`penpot-local` or `user-penpot-local`) must be connected; user must connect their Penpot file to the MCP plugin
- Access to the project codebase for analysis
- Understanding of your team's component conventions (or willingness to establish them)

## When to Use This Skill

Use this skill when:

- Starting a new project that will use Penpot designs
- Onboarding an AI coding agent to an existing project with established patterns
- Standardizing Penpot-to-code workflows across your team
- Updating or refining existing design system conventions
- Users explicitly request: "create design system rules", "set up Penpot guidelines", "customize rules for my project"

## Required Workflow

**Follow these steps in order. Do not skip steps.**

### Step 0: Detect Existing Artifacts and Determine Current Page

Before doing any work, check what already exists and identify the target page.

**Determine the current Penpot page (execute_code):** Read `scripts/get-current-page.js` in this skill's directory and run it via Penpot MCP execute_code.

If `pageId` from import handoff is set, switch to that page (`penpotUtils.getPageById`) before scanning.

Record `pageName` and `pageId`. **Page slug:** use the `pageSlug` argument or `rosey/designs/<page-slug>/penpot-import/handoff.json`. Do not re-slugify the Penpot page title when handoff/arg is present. Only if neither exists, derive a slug by lowercasing the page name and replacing non-alphanumeric characters with hyphens.

If `rosey/design-system/DESIGN.md` exists, read it now. Use it in Steps 2 and 4 for tokens, type, and component names.

**Check for existing files:**

1. Check if `.cursor/rules/penpot-design-system.mdc` exists (the base rules).
2. Check if `.cursor/rules/penpot-ds-<page-slug>.mdc` exists (this page's overlay).
3. Check if `.cursor/penpot-design-context.json` exists (the handoff artifact).

**Decide what to do:**

| Base exists? | Page overlay exists? | Action                                                                                                                                                                                                                                    |
| ------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No           | No                   | Full run: Steps 1–5 (generate base + page overlay)                                                                                                                                                                                        |
| Yes          | No                   | Skip Steps 1–2 (reuse base), run Steps 3–5 for this page's overlay only                                                                                                                                                                   |
| Yes          | Yes                  | Ask the user: "Base rules and a page overlay for '<pageName>' already exist. Do you want to: (a) update the page overlay only, (b) regenerate everything, or (c) skip?" If (a), skip Steps 1–2. If (b), full run. If (c), jump to Step 6. |
| No           | Yes                  | Unusual — regenerate base (Steps 1–2), then ask whether to update or keep the page overlay                                                                                                                                                |

**Tell the user** which mode you're running in before proceeding.

### Step 1: Use the Design System Rules Template

There is no Penpot MCP tool that returns a template. Use the template below as the foundation. Adapt it to your project in Step 4.

**Template structure to follow:**

- **General component rules:** Paths, naming, export pattern
- **Styling rules:** CSS framework, design tokens location, spacing/typography scale
- **Penpot integration rules:** Required flow (get design context via execute_code, export_shape for visual, then implement and validate)
- **Asset handling:** Where to store exported images/SVGs from Penpot
- **Project-specific conventions:** Architecture, imports, accessibility, etc.

Structure your design system rules following the sections in Step 4.

### Step 2: Analyze the Codebase

Before finalizing rules, analyze the project to understand existing patterns. Use the concrete detection heuristics below — don't guess.

**Framework Detection — run the scanner, then confirm:**

```bash
STACK="${MMD_STACK_ROOT:-$HOME/.local/share/mmd-skills}"
APP="$(pwd -P)"
. "${STACK}/lib/od_daemon.sh"
od_load "$APP"
npm install --prefix "${SKILLS}/penpot-create-design-system"
node "${SKILLS}/penpot-create-design-system/scripts/scan-and-catalog.js" --project-root <projectRoot>
```

Use the printed `framework`, `styling`, `componentDirs`, `routeDirs`, `assetDirs`, and `globs`. Fill the Component & Variant Mapping table from `rosey/designs/component-catalog.json` (`matches`, `props`, `suggestedImport`). Do **not** write `.cursor/rules/od-design-system.mdc`.

The scanner is the source of truth for architecture. If `framework` is `unknown`, continue: write rules from Penpot plus `rosey/design-system/DESIGN.md` when present. Use `ruleGlobs` from the scanner (empty or `src/**` only when `src/` exists). Cross-check with these heuristics if the scan looks incomplete:

- Look for `next.config.*` → Next.js
- Look for `nuxt.config.*` → Nuxt
- Look for `svelte.config.*` → SvelteKit
- Look for `astro.config.*` → Astro
- Look for `vite.config.*` → Vite (check `package.json` deps for React/Vue/Svelte)
- Look for `angular.json` → Angular
- Check `package.json` `dependencies`/`devDependencies` for `react`, `vue`, `svelte`, `@angular/core`

**Styling Approach Detection (check in order):**

- Look for `tailwind.config.*` or `@tailwindcss` in deps → Tailwind CSS
- Search for `*.module.css` or `*.module.scss` files → CSS Modules
- Check deps for `styled-components`, `@emotion/styled`, `@emotion/react` → CSS-in-JS
- Check deps for `sass`, `less` → Preprocessor
- Look for `*.css` imports in components → Plain CSS
- Check for CSS variable definitions: search for `--` in `*.css` files under `src/` to find token files

**Component Organization Detection:**

- Search for common component directories: `src/components/`, `app/components/`, `lib/components/`, `src/ui/`, `packages/ui/`
- Check for barrel exports (`index.ts`/`index.js` re-exporting components)
- Sample 3–5 existing component files to detect naming conventions (PascalCase files = PascalCase components, kebab-case = kebab-case)
- Check for a dedicated design system package in monorepos (`packages/design-system/`, `packages/ui/`)

**Design Token Location Detection:**

- Search for files named `tokens.*`, `theme.*`, `variables.*`, `design-tokens.*` under `src/`
- If Tailwind: tokens are in `tailwind.config.*` under `theme.extend`
- If CSS variables: search `*.css` for `:root {` blocks with `--color-*`, `--space-*`, `--font-*`
- If CSS-in-JS: look for `theme.ts`/`theme.js` exporting a theme object

**Asset Directory Detection:**

- Check for `public/`, `static/`, `src/assets/`, `public/assets/`, `public/images/`
- In Next.js: `public/` is the static directory
- In Vite/CRA: `public/` or `src/assets/`
- Pick the first existing directory that contains image files (`.png`, `.svg`, `.jpg`)
- If none found, default to `public/assets/` (or `src/assets/` if no `public/` dir exists)

**Architecture Patterns:**

- Check `package.json` deps for state management: `zustand`, `redux`, `@reduxjs/toolkit`, `pinia`, `jotai`, `recoil`, `mobx`
- Check for path aliases: look in `tsconfig.json` `paths` field, `vite.config.*` `resolve.alias`, or `jsconfig.json`
- Check for routing: `react-router-dom`, `next/navigation`, `vue-router`, `@angular/router`

Record what you find for each category. Use the results to fill the rule templates in Step 4.

### Step 3: Inspect Penpot Tokens and Component Library

Before generating rules, inspect the Penpot design file to understand design-side conventions. This enables accurate token mapping and component reuse rules.

**Inspect token catalog:**

Read the `penpot-token-resolution` skill and follow its **catalog** mode. Run the catalog execute_code script from that skill. It returns `{ overview, setCount, themeCount, resolvedTokens, failedTokens }`.

**Inspect component library, colors, and component variants (execute_code):** Read `scripts/inspect-library.js` in this skill's directory and run it via Penpot MCP execute_code.

**Scan page structure (execute_code):** Read `scripts/scan-page-structure.js` in this skill's directory and run it via Penpot MCP execute_code. Enumerate all pages and their top-level boards to understand the design file's organization. This reveals responsive breakpoint pages, component documentation pages, and page-to-route mappings.

Use the results to identify:

- Pages that represent different viewport sizes (e.g., "Mobile", "Desktop", "Tablet") for breakpoint mapping
- Pages that correspond to application routes (e.g., "Login", "Dashboard", "Settings")
- Component documentation pages vs. actual design pages

**Collect designer comments (execute_code):** Comments on shapes carry designer intent, edge-case notes, and implementation instructions. Read `scripts/collect-comments.js` in this skill's directory and run it via Penpot MCP execute_code.

**Inspect available fonts on the current page (execute_code):** Discover which fonts are used on the current page so the page overlay can include font-loading instructions. Read `scripts/inspect-fonts.js` in this skill's directory and run it via Penpot MCP execute_code.

**Scan colors used on the current page (execute_code):** Collect all fill colors, gradients, image fills, and shadows used on the current page. Read `scripts/scan-colors.js` in this skill's directory and run it via Penpot MCP execute_code.

Use the results to build the **page-specific** color mapping table in Step 4:

- **Solid colors:** Map to project tokens using the file-wide token catalog and library colors.
- **Gradients:** Include a gradient mapping section in the page overlay. Each gradient should map to a project CSS variable, Tailwind utility, or inline `linear-gradient`/`radial-gradient` definition. If the project uses CSS custom properties for gradients (e.g. `--gradient-primary`), map to those.
- **Image fills:** List shapes with image fills so PID knows to export them via `export_shape`. Include `shapeId` for direct export.
- **Shadows:** Include a shadow mapping section in the page overlay. Each unique shadow should map to a project token (e.g. `--shadow-sm`, Tailwind `shadow-md`) or a raw CSS `box-shadow` value. Group similar shadows that differ only in color as variants of the same token.

**Handling results:**

- If the token script returns an `error`, use the Penpot MCP `penpot_api_info` tool to verify the current token/library API shape, adjust the script, and retry. If the API is unavailable, proceed without token mappings and note in the generated rules that the Color Mapping and Component Mapping tables should be filled manually once the Penpot library is established.
- **If `failedTokens` is non-empty**, list them. In interactive mode, ask whether to proceed or investigate. In non-interactive mode, proceed and note the gaps in the overlay.
- If the library is empty (no components, colors, or typographies), still generate the rule file. Leave the Color Mapping and Component & Variant Mapping tables as placeholders with a note: _"Fill these tables as the Penpot library is populated."_
- If `availableLibraries` returns libraries not yet connected, note them in the generated rules so the team can decide whether to connect them for shared design system assets.
- If the comment API is unavailable, note this limitation and proceed.

Use the results to:

- Create a **color mapping table** between Penpot library colors and project design tokens (e.g., Penpot `Brand/Primary #0066FF` → project `var(--color-primary)` or Tailwind `text-blue-600`). Use **resolvedTokens** (token name → value from `penpotUtils.findTokenByName`) for precise token mapping when building this table.
- Identify reusable Penpot components that map to existing project components
- Note any Penpot token sets/themes that correspond to project themes (light/dark mode, brand variants)
- Build a **page-to-route / page-to-breakpoint mapping** from the page structure scan
- Document relevant **designer comments** that contain implementation instructions or edge-case notes
- List **fonts used** in the design and ensure the project's font stack or web font loading covers them

Include these mappings in the generated rules (Step 4).

**Large file handling:**

If the Penpot file is large (many pages, hundreds of tokens, or deep component hierarchies), the scripts above may return truncated data or time out. Apply these mitigations:

- **Token catalog:** The `penpot-token-resolution` skill (catalog mode) includes large-catalog guidance. If `tokenOverview()` returns more than ~200 token names, it resolves tokens in batches of 100.
- **Page structure:** If the file has more than ~20 pages, limit the board scan to the first 20 pages. Note the omitted pages and let the user decide whether to scan more.
- **Library components:** If the library has more than ~100 components, return only `name` and `id` (skip `source` enrichment) to reduce payload size. The full details can be fetched on demand during implementation.
- **Font scan:** If `findShapes` is slow (file has thousands of shapes), scope the search to the current page (`penpot.root`) instead of all pages. Note that fonts on other pages may be missed.

If any script times out, retry with the reduced scope described above before falling back to manual data entry.

### Step 3b: Persist Handoff Artifact

After collecting all Penpot data, write a JSON summary to disk so that downstream skills can read it reliably.

**Write the file to `.cursor/penpot-design-context.json`** in the project root. The artifact has a **file-wide** section (tokens, library, page structure) and a **pages** map keyed by page slug for page-specific data (comments, fonts, page colors).

If the file already exists, **merge** into it using these rules:

- **`generatedAt`**: Always overwrite with the current timestamp.
- **`tokens`**: Replace entirely. The catalog reflects the current state of the Penpot file's token sets; partial merging would mix stale and fresh data.
- **`library`**: Replace entirely (components, colors, typographies, availableLibraries). Same rationale — the library snapshot should be internally consistent.
- **`pageStructure`**: Replace entirely. Pages may have been added, removed, or renamed.
- **`pages.<page-slug>`**: Add or overwrite the entry for the current page slug. **Do not delete other page entries** — they remain valid until their page is re-scanned. Each page entry has its own `updatedAt` timestamp so consumers can judge freshness independently.

Read `templates/artifact-schema.json` in this skill's directory for the schema. Write the file to `.cursor/penpot-design-context.json` in the project root following that structure.

This file is the authoritative handoff artifact. When `penpot-implement-design` is invoked, it reads the file-wide data plus the page entry matching the selected shape's page.

### Step 4: Generate Rules

Based on your codebase analysis and Penpot inspection, generate two files: the **base rules** (shared conventions) and the **page overlay** (page-specific mappings). If Step 0 determined the base already exists, skip generating the base section and only produce the page overlay.

#### 4A: Base Rules (`.cursor/rules/penpot-design-system.mdc`)

**Skip this section if Step 0 determined the base already exists.**

The base contains project-wide conventions that don't change per page. Read `templates/base-rules.md` in this skill's directory and use it as the template. Fill in all placeholders (e.g. `[YOUR_PATH]`, `[COMPONENT_DIRECTORY]`, `[ASSET_DIRECTORY]`) from your Step 2 codebase analysis and Step 3 Penpot inspection. Populate the Page-to-Route / Page-to-Breakpoint table from the page structure scan.

#### 4B: Page Overlay (`.cursor/rules/penpot-ds-<page-slug>.mdc`)

**Always generate this section** (it's the page-specific part).

The page overlay contains mappings specific to the current Penpot page. Read `templates/page-overlay.md` in this skill's directory and use it as the template. Fill in all sections using the page colors, fonts, shadows, gradients, image fills, and comments collected in Step 3 (scoped to the current page), combined with the file-wide token catalog and library data. Replace `<pageName>` in the template with the actual page name.

**Derive the page overlay `globs`** from the page-to-route mapping established in Step 3. If the page maps to a specific route (e.g. "Dashboard" → `/dashboard`), narrow the glob to that route's directory (e.g. `"app/dashboard/**"` or `"src/pages/dashboard/**"`). If the page is a component library or doesn't map to a single route, use the same broad glob as the base rules. Only include directories that exist.

### Step 4c: Validate Key Mappings with the User

**Skip this entire step when `INTERACTION_MODE=non-interactive`.** Proceed to Step 5.

Before saving, present a summary of the **page overlay** mappings for user confirmation. (Base rules were already validated on first run; skip this for the base if it already exists.)

**Show the user:**

1. **Top 5–10 color mappings for this page** (Penpot color → project token). If any page colors have no project token match, flag them explicitly.
2. **Gradient mappings** (if any gradients were found). Show the gradient type, stop colors, and the proposed CSS value or project token.
3. **Image fills** (if any). List the shapes with image fills and confirm the asset export plan.
4. **Component & variant mappings for this page** (Penpot component → project component). Include variant properties and the proposed prop mapping (e.g. State:hover → `:hover` or `isHovered` prop). List any Penpot components with no project counterpart and confirm the user wants new components created for them.
5. **Shadow mappings** (if any shadows were cataloged). Show the shadow values and proposed project tokens.
6. **Failed tokens** from Step 3 (if any). Ask if these are expected gaps or need investigation.

**Ask:** "Do these mappings look correct for the '<pageName>' page? If any are wrong, tell me the corrections and I'll update the page overlay before saving."

- If the user confirms, proceed to Step 5.
- If the user provides corrections, update the page overlay in Step 4B and re-present only the changed mappings for confirmation.
- If the user says "skip validation", proceed without changes.

### Step 5: Save Rules

**Save the base rules** (skip if Step 0 determined the base already exists):

Write `.cursor/rules/penpot-design-system.mdc` with the content from Step 4A, wrapped with YAML frontmatter.

**Derive the `globs` pattern from Step 2's architecture scan** (`scan-and-catalog.js` output `globs`). Use the detected component directories, page directories, and framework conventions. Use an array when multiple directories apply. Only include directories that actually exist.

| Detected Structure                  | Recommended `globs`                                                       |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Next.js App Router (`app/` dir)     | `["app/**", "src/components/**"]`                                         |
| Next.js Pages Router (`pages/` dir) | `["pages/**", "src/components/**"]`                                       |
| Vite/CRA with `src/`                | `["src/components/**", "src/pages/**", "src/views/**"]`                   |
| Vue/Nuxt                            | `["src/components/**", "src/views/**", "src/pages/**", "src/layouts/**"]` |
| SvelteKit                           | `["src/lib/components/**", "src/routes/**"]`                              |
| Monorepo (UI package)               | `["packages/ui/src/**", "apps/web/src/**"]`                               |
| Fallback (unknown)                  | `"src/**"`                                                                |

Only include directories that actually exist in the project. Remove entries for directories not found during Step 2 analysis. Wrap the generated base rules content in YAML frontmatter with `description`, `globs` (from the table above), and `alwaysApply: false`.

**Save the page overlay** (always):

Write `.cursor/rules/penpot-ds-<page-slug>.mdc` with the content from Step 4B.

After saving, tell the user which files were created or updated.

### Step 6: Offer to Invoke penpot-implement-design (Optional)

**Skip this entire step when `INTERACTION_MODE=non-interactive`.** Pipeline Stage E runs implement.

After saving the rules (base + page overlay) and confirming to the user that design system rules are in place:

1. **Ask the user:** "Design system rules are saved. Would you like to implement a Penpot shape now, or are you done for now?" If the user declines, stop here.
2. **Check prerequisites:** The user must have the target shape **selected in Penpot** (or have provided the shape id). If not, ask the user to select the shape now and wait for confirmation before proceeding.
3. **Carry forward gathered data:** The handoff artifact written in Step 3b (`.cursor/penpot-design-context.json`) contains all Penpot introspection data. The implement skill will read it from disk, so it survives context window limits and cross-conversation invocations. The data is also in the current conversation context for immediate use. **Do not re-fetch it.** (See implement skill's "Data Reuse" note in Step 2.)
4. **Invoke:** Once a selection is confirmed, **read the penpot-implement-design SKILL.md** (at the path provided in the agent skill list) **and follow its workflow starting at Step 1** in the same turn. Pass along any live app URL the user provided so it can run the full flow (review, sync, optional polish) after implementation.
5. **Iterate rules later:** The implement skill tracks design system rule gaps during implementation (Step 10b). After its sync loop completes, it presents any gaps found and offers to update the `.mdc` files. Accept the updates to keep rules accurate across implementation cycles.

For examples, best practices, and troubleshooting, see REFERENCE.md in this skill's directory.
