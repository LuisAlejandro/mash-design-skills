# Create Design System — Reference

## Rule Categories and Examples

### Essential Rules (Always Include)

**Component Discovery:**

```markdown
- UI components are located in `src/components/ui/`
- Feature components are in `src/components/features/`
- Layout primitives are in `src/components/layout/`
```

**Design Token Usage:**

```markdown
- Colors are defined as CSS variables in `src/styles/tokens.css`
- Never hardcode hex colors - use `var(--color-*)` tokens
- Spacing uses the 4px base scale: `--space-1` (4px), `--space-2` (8px), etc.
```

**Styling Approach:**

```markdown
- Use Tailwind utility classes for styling
- Custom styles go in component-level CSS modules
- Theme customization is in `tailwind.config.js`
```

### Recommended Rules (Highly Valuable)

**Component Patterns:**

```markdown
- All components must accept a `className` prop for composition
- Variant props should use union types: `variant: 'primary' | 'secondary'`
- Icon components should accept `size` and `color` props
```

**Import Conventions:**

```markdown
- Use path aliases: `@/components`, `@/styles`, `@/utils`
- Group imports: React, third-party, internal, types
- No relative imports beyond parent directory
```

**Code Quality:**

```markdown
- Add JSDoc comments for exported components
- Include PropTypes or TypeScript types for all props
- Extract magic numbers to named constants
```

### Optional Rules (Project-Specific)

**Accessibility:**

```markdown
- All interactive elements must have aria-labels
- Color contrast must meet WCAG AA standards
- Keyboard navigation required for all interactions
```

**Performance:**

```markdown
- Lazy load images with the `Image` component from `@/components/Image`
- Use React.memo for components that receive complex props
- Icons should be SVG components, not icon fonts
```

**Testing:**

```markdown
- Include unit tests for new components in `__tests__/` directory
- Use Testing Library queries (getByRole, getByLabelText)
- Test all interactive states and variants
```

## Examples

### Example 1: React + Tailwind Project

User says: "Create design system rules for my React project"

**Actions:**

1. Analyze codebase structure
2. Inspect Penpot token catalog and component library
3. Generate rules:

```markdown
# Penpot Integration Rules

## Component Organization

- UI components are in `src/components/ui/`
- Page components are in `src/app/`
- Use Tailwind for styling

## Penpot Implementation Flow

1. Get design context via Penpot MCP execute_code for the selected shape
2. Use export_shape for visual reference
3. Map Penpot colors to Tailwind colors defined in `tailwind.config.js`
4. Reuse components from `src/components/ui/` when possible
5. Validate against exported image before completing

## Styling Rules

- IMPORTANT: Use Tailwind utility classes, not inline styles
- Colors are defined in `tailwind.config.js` theme.colors
- Spacing uses Tailwind's default scale
- Custom components go in `src/components/ui/`

## Asset Rules

- Export images from Penpot via export_shape; store in `public/assets/`
- DO NOT install new icon libraries when assets exist in the design
```

4. Save to `.cursor/rules/penpot-design-system.mdc`
5. Test with a simple button implementation (select button in Penpot, run penpot-implement-design)

**Result:** The agent now consistently follows the project's conventions when implementing Penpot designs.

### Example 2: Vue + Custom CSS Project

User says: "Set up Penpot rules for my Vue app"

**Actions:**

1. Analyze codebase structure
2. Inspect Penpot token catalog; discover project uses CSS modules and a custom design token system
3. Generate rules:

```markdown
# Penpot Integration Rules

## Component Organization

- Components are in `src/components/`
- Composables are in `src/composables/`
- Vue SFC structure: <script setup>, <template>, <style scoped>

## Design Tokens

- IMPORTANT: All colors defined in `src/styles/tokens.css` as CSS variables
- Use `var(--color-primary)`, `var(--color-secondary)`, etc.
- Spacing: `var(--space-xs)` through `var(--space-xl)`
- Typography: `var(--text-sm)` through `var(--text-2xl)`

## Penpot Implementation Flow

1. Get design context via execute_code and export_shape for the selected shape
2. Translate to Vue 3 Composition API
3. Map Penpot colors to CSS variables in `src/styles/tokens.css`
4. Use CSS Modules for component styles
5. Check for existing components in `src/components/` before creating new ones

## Styling Rules

- Use CSS Modules (`.module.css` files)
- IMPORTANT: Reference design tokens, never hardcode values
- Scoped styles with CSS modules
```

4. Save to `.cursor/rules/penpot-design-system.mdc`
5. Validate with a card component

**Result:** The agent now correctly translates Penpot designs to Vue components using the project's design token system.

### Example 3: Design System Team

User says: "Generate rules for our design system library"

**Actions:**

1. Analyze the monorepo structure with design system package
2. Inspect Penpot token catalog and component library
3. Generate comprehensive rules:

```markdown
# Design System Rules

## Repository Structure

- Design system components: `packages/design-system/src/components/`
- Documentation: `packages/docs/`
- Design tokens: `packages/tokens/src/`

## Component Development

- IMPORTANT: All components must be in `packages/design-system/src/components/`
- Component file structure: `ComponentName/index.tsx`, `ComponentName.stories.tsx`, `ComponentName.test.tsx`
- Export all components from `packages/design-system/src/index.ts`

## Design Tokens

- Colors: `packages/tokens/src/colors.ts`
- Typography: `packages/tokens/src/typography.ts`
- Spacing: `packages/tokens/src/spacing.ts`
- IMPORTANT: Never hardcode values - import from tokens package

## Documentation Requirements

- Add Storybook story for every component
- Include JSDoc with @example
- Document all props with descriptions
- Add accessibility notes

## Penpot Integration

1. Get design context (execute_code) and export (export_shape) from Penpot
2. Map Penpot tokens to design system tokens
3. Create or extend component in design system package
4. Add Storybook stories showing all variants
5. Validate against exported Penpot image
6. Update documentation
```

4. Save to `.cursor/rules/penpot-design-system.mdc` and share with team
5. Add to team documentation

**Result:** Entire team follows consistent patterns when adding components from Penpot to the design system.

## Best Practices

### Start Simple, Iterate

Don't try to capture every rule upfront. Start with the most important conventions and add rules as you encounter inconsistencies.

### Be Specific

Instead of: "Use the design system"
Write: "Always use Button components from `src/components/ui/Button.tsx` with variant prop ('primary' | 'secondary' | 'ghost')"

### Make Rules Actionable

Each rule should tell the agent exactly what to do, not just what to avoid.

Good: "Colors are defined in `src/theme/colors.ts` - import and use these constants"
Bad: "Don't hardcode colors"

### Use IMPORTANT for Critical Rules

Prefix rules that must never be violated with "IMPORTANT:" to ensure the agent prioritizes them.

```markdown
- IMPORTANT: Never expose API keys in client-side code
- IMPORTANT: Always sanitize user input before rendering
```

### Document the Why

When rules seem arbitrary, explain the reasoning:

```markdown
- Place all data-fetching in server components (reduces client bundle size and improves performance)
- Use absolute imports with `@/` alias (makes refactoring easier and prevents broken relative paths)
```

## Common Issues and Solutions

### Issue: The agent isn't following the rules

**Cause:** Rules may be too vague or not properly loaded by the agent.
**Solution:**

- Make rules more specific and actionable
- Verify rules are saved in the correct configuration file
- Restart your agent or IDE to reload rules
- Add "IMPORTANT:" prefix to critical rules

### Issue: Rules conflict with each other

**Cause:** Contradictory or overlapping rules.
**Solution:**

- Review all rules for conflicts
- Establish a clear priority hierarchy
- Remove redundant rules
- Consolidate related rules into single, clear statements

### Issue: Too many rules increase latency

**Cause:** Excessive rules increase context size and processing time.
**Solution:**

- Focus on the 20% of rules that solve 80% of consistency issues
- Remove overly specific rules that rarely apply
- Combine related rules
- Use progressive disclosure (basic rules first, advanced rules in linked files)

### Issue: Rules become outdated as project evolves

**Cause:** Codebase changes but rules don't.
**Solution:**

- Schedule periodic rule reviews (monthly or quarterly)
- Update rules when architectural decisions change
- Version control your rule files
- Document rule changes in commit messages

## Understanding Design System Rules

Design system rules transform how AI coding agents work with your Penpot designs:

**Before rules:**

- The agent makes assumptions about component structure
- Inconsistent styling approaches across implementations
- Hardcoded values that don't match design tokens
- Components created in random locations
- Repetitive explanations of project conventions

**After rules:**

- The agent automatically follows your conventions
- Consistent component structure and styling
- Proper use of design tokens from the start
- Components organized correctly
- Zero repetitive prompting

The time invested in creating good rules pays off exponentially across every Penpot implementation task.

## Additional Resources

- Penpot Plugin API: use the Penpot MCP `penpot_api_info` tool for API documentation
- Penpot design tokens: use `penpot.library.local.tokens` in execute_code to inspect token sets
