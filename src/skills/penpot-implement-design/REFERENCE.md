# Implement Design — Reference

## Implementation Rules

### Component Organization

- Place UI components in the project's designated design system directory
- Follow the project's component naming conventions
- Avoid inline styles unless truly necessary for dynamic values

### Design System Integration

- ALWAYS use components from the project's design system when possible
- Map Penpot design tokens to project design tokens
- When a matching component exists, extend it rather than creating a new one
- Document any new components added to the design system

### Code Quality

- Avoid hardcoded values - extract to constants or design tokens
- Keep components composable and reusable
- Add TypeScript types for component props
- Include JSDoc comments for exported components

## Examples

### Example 1: Implementing a Button Component

User says: "Implement this button" and passes the button shape id (or it is `rootBoardId` in the import handoff).

**Actions:**

1. Resolve `fileId`, `pageId`, and `shapeId` from the argument or the handoff.
2. Call `penpot_get_shape` with `includeDescendants: true` for layout, fills, and typography.
3. Call `penpot_export_shape` with that id and `format: "png"` for the visual reference.
4. Export any icon/image assets from child shapes if present.
5. Check if project has existing button component; if yes, extend with new variant; if no, create using project conventions.
6. Map Penpot colors to project design tokens (e.g., `primary-500`, `primary-hover`).
7. Validate against exported image for padding, border radius, typography.

**Result:** Button component matching Penpot design, integrated with project design system.

### Example 2: Building a Dashboard Layout

User passes the dashboard board id and says "Implement this dashboard."

**Actions:**

1. Call `penpot_get_shape` with `includeDescendants: true`. If the tree is large, set `maxDepth` to 2 and fetch children on demand.
2. Call `penpot_export_shape` for the board PNG.
3. Export logos and icons with `penpot_export_shape` on each child id.
4. Build layout using project's layout primitives; implement each section with existing components where possible.
5. Validate responsive behavior against the design context and exported image.

**Result:** Complete dashboard matching Penpot design with responsive layout.

## Best Practices

### Always Start with Context

Never implement based on assumptions. Call `penpot_get_shape` for design context and `penpot_export_shape` for the PNG first.

### Incremental Validation

Validate frequently during implementation, not just at the end. This catches issues early.

### Document Deviations

If you must deviate from the Penpot design (e.g., for accessibility or technical constraints), document why in code comments.

### Reuse Over Recreation

Always check for existing components before creating new ones. Consistency across the codebase is more important than exact Penpot replication.

### Design System First

When in doubt, prefer the project's design system patterns over literal Penpot translation.

## Common Issues and Solutions

### Issue: Design context is too large or deep

**Cause:** The target shape has many nested layers and the tree is huge.
**Solution:** Call `penpot_get_shape` with a small `maxDepth` (3–5), or `penpot_find_shapes` with `isRoot: true` for a name list, then fetch children on demand. Ask for a smaller board id when the tree is still too large.

### Issue: Design doesn't match after implementation

**Cause:** Visual discrepancies between the implemented code and the Penpot design.
**Solution:** Compare side-by-side with the exported image from Step 3. Check spacing, colors, and typography in the design context object.

### Issue: Shape id is missing

**Cause:** No `shapeId` argument and no `rootBoardId` in `.mash/designs/*/penpot-import/handoff.json`.
**Solution:** Ask the user for the shape id. There is no Penpot selection.

### Issue: Design token values differ from Penpot

**Cause:** The project's design system tokens have different values than those in the Penpot design.
**Solution:** When project tokens differ from Penpot values, prefer project tokens for consistency but adjust spacing/sizing to maintain visual fidelity.

### Issue: Dev server cannot be started or URL unknown

**Cause:** Step 7b could not find a Makefile target, docker compose setup, or package.json script to run the dev server, or could not infer the port/URL.
**Solution:** Document what was tried (e.g. "No Makefile, checked compose.yaml and package.json scripts"). Stop after Step 7 and ask the user to provide the live app URL (e.g. `http://localhost:3000`) or to fix the dev setup so the checklist can succeed next time.

## Understanding Design Implementation

The Penpot implementation workflow establishes a reliable process for translating designs to code:

**For designers:** Confidence that implementations will match their Penpot designs with pixel-perfect accuracy.
**For developers:** A structured approach using design context and exported images, with no dependency on Figma.
**For teams:** Consistent, high-quality implementations that maintain design system integrity.

By following this workflow, you ensure that every Penpot design is implemented with the same level of care and attention to detail.

## Additional Resources

- Penpot file library: `penpot_get_file_snapshot` returns colors, typographies, token sets, and resolved tokens
- Shape tokens: `appliedTokens` on `penpot_get_shape`
