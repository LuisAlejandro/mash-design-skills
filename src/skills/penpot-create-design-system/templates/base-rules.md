# Base Design System Rules Template

Fill every `[PLACEHOLDER]` from codebase analysis (Step 2) and Penpot inspection (Step 3).

## General Component Rules

- IMPORTANT: Always use components from `[YOUR_PATH]` when possible
- Place new UI components in `[COMPONENT_DIRECTORY]`
- Follow `[NAMING_CONVENTION]` for component names
- Components must export as `[EXPORT_PATTERN]`

## Styling Rules

- Use `[CSS_FRAMEWORK/APPROACH]` for styling
- Design tokens are defined in `[TOKEN_LOCATION]`
- IMPORTANT: Never hardcode colors - always use tokens from `[TOKEN_FILE]`
- Spacing values must use the `[SPACING_SYSTEM]` scale
- Typography follows the scale defined in `[TYPOGRAPHY_LOCATION]`

## Penpot Integration Rules

These rules define how to translate Penpot designs into code for this project and must be followed for every Penpot-driven change.

### Required Flow (do not skip)

1. User must have the target shape selected in Penpot (or provide a shape id). Use Penpot MCP execute_code to get design context for the selection (layout, typography, colors, spacing, structure).
2. Use export_shape (shapeId "selection", format png or svg) for a visual reference of the shape being implemented.
3. Export any image fills or child image shapes via export_shape if needed; store in [ASSET_DIRECTORY].
4. Only after you have design context and exported visual, translate into this project's conventions, styles, and framework.
5. Validate against the Penpot export for 1:1 look and behavior before marking complete.

### Implementation Rules

- Treat the design context from Penpot as the source of truth for layout and styling
- Replace Tailwind or default utility classes with `[YOUR_STYLING_APPROACH]` when applicable
- Reuse existing components from `[COMPONENT_PATH]` instead of duplicating functionality
- Use the project's color system, typography scale, and spacing tokens consistently
- Respect existing routing, state management, and data-fetch patterns
- Strive for 1:1 visual parity with the Penpot design
- Validate the final UI against the exported Penpot image for both look and behavior

### Page-Specific Mappings

Color mappings, component mappings, responsive strategy, font requirements, and page-to-route mappings are page-specific and live in the **page overlay** file (`.cursor/rules/penpot-ds-<page-slug>.mdc`). Do not put them in the base rules.

### Page-to-Route / Page-to-Breakpoint Mapping (file-wide)

This is the one page-aware section kept in the base. It provides a high-level map of all pages in the Penpot file.

| Penpot Page | Purpose | Maps To |
| ----------- | ------- | ------- |
| [Map each page from the page structure scan] |

- Pages with viewport widths in their names map to CSS breakpoints
- Pages whose names match application sections map to routes
- Component documentation pages should not generate routes

### Interaction Patterns

Penpot interactions (NavigateTo, OpenOverlay, CloseOverlay, OpenUrl, PreviousScreen) must be translated to code behaviors:

- **NavigateTo** → Router link (`<Link>`, `router.push`, `<router-link>`) to the target page/route
- **OpenOverlay** → Modal/drawer/popover open handler; map to the project's modal system
- **CloseOverlay** → Modal/drawer dismiss handler
- **OpenUrl** → External link (`<a href="..." target="_blank">` or `window.open`)
- **PreviousScreen** → Back navigation (`router.back()`, `history.back()`)
- **Animations** (Dissolve, Slide, Push) → CSS transitions or the project's animation library
- Trigger mapping: `click` → onClick, `mouse-enter`/`mouse-leave` → hover handlers or CSS `:hover`, `after-delay` → setTimeout or CSS animation-delay

## Asset Handling

- Use Penpot MCP export_shape to export image fills (mode "fill") or shapes as PNG/SVG
- Store exported assets in `[ASSET_DIRECTORY]`
- DO NOT import new icon packages; use assets exported from the Penpot design
- DO NOT use placeholders when an asset can be exported from Penpot

## Project-Specific Conventions

- [Add any unique architectural patterns]
- [Add any special import requirements]
- [Add any testing requirements]
- [Add any accessibility standards]
- [Add any performance considerations]
