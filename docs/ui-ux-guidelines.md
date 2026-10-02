# UI/UX Guidelines

This file is a compact entry point, not a second copy of the design system. When guidance conflicts, use this authority order:

1. `AGENTS.md` product contracts.
2. `packages/ui/README.md`, exported `@sairn/ui` component APIs, `.claude/rules/design-tokens.md`, and the active application stylesheet.
3. Executable page and component contract tests. Tests may refine a screen but must not override shared token rules.
4. This document.

## Foundations

- Use `font-sans` (Inter) for product UI. Reserve `font-mono` for addresses, code, and content whose character alignment is meaningful.
- Use the named typography scale. Do not add arbitrary pixel font sizes for one screen.
- Apply `tabular-nums` to comparable financial values and table columns.
- Use named radius utilities so the theme's `--radius-factor` remains effective. Avoid arbitrary pixel radii.
- Prefer existing spacing and breakpoint conventions. The trading terminal's inclusive mobile breakpoint is `1000px`.

## Components and tokens

- Start with components exported by `@sairn/ui`; compose semantic HTML around them when page structure requires elements such as `article`, `section`, or `table`.
- Use semantic foreground, surface, fill, stroke, action, signal, success, warning, error, and info tokens. Do not hard-code theme colors in components.
- Use `bg-dashboard-canvas` for the branded data-dashboard canvas and `bg-grid-container` for the desktop grid underlay. `bg-portfolio-canvas` is a compatibility alias for Portfolio, not a general page token.
- A translucent fill communicates a state or inset region, not elevation. Do not nest the same translucent fill on a parent card and its children; use a raised surface, an outlined structural region, and at most one filled inset level.
- Keep dividers where they communicate rows, fields, or tab structure. Avoid borders that only turn every piece of content into another card.

## Information hierarchy and actions

- Give each task region one primary action. Responsive variants may coexist in source only when CSS guarantees that one is visible at a time.
- Put a visible explanation next to a disabled primary action when the reason is not self-evident. Do not rely on disabled-button tooltips.
- Financial labels must state the lifecycle or basis users need to compare values: denomination, total versus period, claimed versus unclaimed, and source attribution where relevant.
- Never show the same protocol field twice under near-synonymous labels. Builder or affiliate attribution must be identified as a breakdown, not implied to be an additional balance.
- Use color to reinforce text, icons, or position. Color must not be the only way to identify status, selection, profit/loss, or progress.

## Interaction and accessibility

- Preserve the focus-visible treatment, keyboard behavior, accessible names, and disabled semantics provided by `@sairn/ui`.
- Icon-only controls require an accessible name. Custom interactive elements must use the correct native element before adding ARIA.
- Loading, empty, stale, and error states must remain distinguishable without color and must not expose actions against unverified data.
- Verify affected views in light and dark themes, at desktop and mobile widths, and at boundary breakpoints. Check reflow and text scaling rather than treating a single screenshot as the contract.

## Review checklist

- Does the page use current semantic tokens and shared components?
- Is there one clear primary action for each task?
- Are financial values named by meaning rather than by implementation detail?
- Are surface, outline, and inset layers visually distinct without translucent fill nesting?
- Do type, radii, spacing, and breakpoints use named project conventions?
- Do keyboard, focus, contrast, reflow, and non-color cues still work?
