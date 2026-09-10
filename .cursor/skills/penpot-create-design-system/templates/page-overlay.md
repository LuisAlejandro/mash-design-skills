---
description: "Page-specific Penpot design rules for '<pageName>'. Extends penpot-design-system.mdc with color mappings, component mappings, fonts, and responsive strategy for this page."
globs: [derived from page-to-route mapping]
alwaysApply: false
---

# Penpot Page: <pageName>

This file extends the base design system rules in `.cursor/rules/penpot-design-system.mdc`. Always load the base rules first.

## Color Mapping

| Penpot Color | Project Token |
| ------------ | ------------- |
| [Map each solid color found on THIS page to its project token. Use solidColors + resolvedTokens + library colors.] |

## Gradient Mapping

| Penpot Gradient | CSS Value | Project Token (if any) |
| --------------- | --------- | ---------------------- |
| [Map each gradient from THIS page. Include type (linear/radial), stop colors, and the CSS equivalent.] |

## Image Fills

| Shape Name | Shape ID | Notes |
| ---------- | -------- | ----- |
| [List shapes with image fills. These must be exported via export_shape during implementation.] |

## Component & Variant Mapping

| Penpot Component | Variant Properties | Project Component | Prop Mapping |
| ---------------- | ------------------ | ----------------- | ------------ |
| [Map Penpot components used on THIS page.] |

If a Penpot component has `variantProperties` (e.g. `["State", "Size"]`), map each variant value to the project's equivalent:

- **State variants** (hover, active, disabled, focused) → CSS pseudo-classes or component state props
- **Size variants** (sm, md, lg) → component `size` prop values
- **Visual variants** (primary, secondary, ghost) → component `variant` prop values

## Shadow Mapping

| Penpot Shadow | CSS Value | Project Token (if any) |
| ------------- | --------- | ---------------------- |
| [Map each unique shadow from THIS page.] |

## Responsive Strategy

- [Breakpoints relevant to this page's boards, using board widths from the page structure scan]

## Font Requirements

- Fonts used on this page: [List from the page-scoped font scan]
- [Font loading instructions specific to this page]

## Designer Notes

- [Include any designer comments collected from this page]
