# HypeTerminal Design System Redesign

## Strategy

**Phase 1: Reset to native Tailwind Zinc + shadcn defaults** — replace all custom OKLCH colors with Tailwind's native Zinc palette and one accent color. Use shadcn's default component styles as-is.
**Phase 2: Layer Linear-inspired refinements** — intentional, documented customizations on top of the clean native baseline.

### Core Decision (2026-02-26)

- **Neutral palette**: Tailwind's native **Zinc** scale (`zinc-50` through `zinc-950`)
- **Accent color**: Tailwind's native **Blue** (`blue-50` through `blue-950`) — used directly, no alias
- **Component styles**: shadcn defaults (zinc theme)
- **No custom OKLCH values** for the base theme — use what Tailwind and shadcn provide natively
- **Domain tokens preserved**: market-up/down, success, warning, error stay as custom tokens (trading-specific, no native equivalent)

### Why This Approach

1. **Eliminates color confusion** — instead of guessing between `oklch(0.552 0.016 285.938)` values, you use `zinc-500`
2. **shadcn compatibility** — new shadcn components work out of the box
3. **Tailwind IntelliSense** — autocomplete shows the full scale, no custom token lookup needed
4. **One accent decision** — everything interactive uses the same Tailwind color (e.g., `blue-500` for active, `blue-600` for hover, `blue-100` for subtle bg)
5. **Linear-compatible** — Linear's approach (neutral gray + one accent) maps perfectly to this model

This document is the single source of truth for the redesign.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Issues Found (Full Inventory)](#2-issues-found)
3. [Phase 1: Reset to shadcn Defaults](#3-phase-1-reset)
4. [Phase 2: Linear-Inspired Design Layer](#4-phase-2-design-layer)
5. [Design Principles](#5-design-principles)
6. [Reference: Linear Design System](#6-linear-reference)
7. [Reference: Vercel Geist Design System](#7-vercel-reference)
8. [Component Inventory](#8-component-inventory)

---

## 1. Current State Assessment

### What's Working Well

- **OKLCH color space** — same perceptual uniformity approach as Linear's LCH system
- **Semantic token architecture** — follows shadcn/Geist pattern (background, foreground, card, muted, etc.)
- **Domain tokens** — market-up/down/neutral with muted and bg variants is excellent for trading
- **Base UI migration** — completed; @base-ui/react primitives used correctly throughout
- **Zero hardcoded hex colors** in UI primitives (46 components all use tokens)
- **Font size scale** — well-defined dense scale (text-5xs through text-base)
- **Border radius scale** — properly tiered (xs → xl)
- **Positions/tradebox components** — exemplary token compliance, zero violations

### What's Not Working

- **Inconsistent patterns across components** — same visual element styled differently in different files
- **Residual Radix patterns** — old `data-[state=...]` in drawer, sidebar, table
- **Hardcoded `text-white`** — in badge, checkbox, number-input, mobile-bottom-nav
- **Inconsistent ring sizes** — mix of ring-1, ring-3, ring-4 instead of standard ring-2
- **Alert/warning box chaos** — every file styles alerts differently (varying opacity, padding, gap)
- **Mobile/desktop color mismatch** — logo, price displays use different tokens
- **Color confusion** — too many similar tokens make it unclear which to use when

### Architecture

```
src/styles.css          — Design tokens, theme vars, base styles
src/components/ui/      — 46 UI primitives (Base UI + shadcn pattern)
src/components/trade/   — ~50 feature components using ui/ primitives
```

**Stack**: Base UI (headless) + shadcn patterns (copy-paste components) + Tailwind v4

### Target Token System (Native Tailwind Zinc + Accent)

The new `styles.css` will use shadcn's zinc theme which maps Tailwind's native Zinc scale to semantic tokens:

**Light mode semantic tokens → zinc shades:**
```
--background       → white          (page bg)
--foreground       → zinc-950       (primary text)
--card             → white          (card bg)
--muted            → zinc-100       (subtle bg)
--muted-foreground → zinc-500       (secondary text)
--accent           → zinc-100       (hover bg)
--primary          → zinc-900       (default button)
--primary-foreground → zinc-50      (text on primary)
--secondary        → zinc-100       (secondary button)
--destructive      → red-500        (danger)
--border           → zinc-200       (structural border)
--input            → zinc-200       (input border)
--ring             → zinc-500       (focus ring)
```

**Dark mode → flipped zinc shades:**
```
--background       → zinc-950       (page bg)
--foreground       → zinc-50        (primary text)
--card             → zinc-900       (card bg)
--muted            → zinc-800       (subtle bg)
--muted-foreground → zinc-400       (secondary text)
--accent           → zinc-800       (hover bg)
--primary          → zinc-50        (default button)
--primary-foreground → zinc-900     (text on primary)
--secondary        → zinc-800       (secondary button)
--destructive      → red-500        (danger)
--border           → zinc-800       (structural border)
--input            → zinc-800       (input border)
--ring             → zinc-400       (focus ring)
```

**Accent (blue) is used directly** — no semantic token needed:
- `bg-blue-500` for CTA buttons
- `text-blue-500 dark:text-blue-400` for accent text
- `bg-blue-50 dark:bg-blue-950` for subtle accent backgrounds
- `border-blue-200 dark:border-blue-800` for accent borders
- `ring-blue-500/50` for focus rings on accent elements

**Domain tokens stay custom** (market-up/down, success, warning, error) — defined in `:root`/`.dark` with OKLCH values since no native Tailwind equivalent exists.

**The old `accent-blue` token is replaced** by direct `blue-*` usage throughout. Migration: find-replace `accent-blue` → `blue-500` (and adjust shades per context).

---

## 2. Issues Found

### Critical Issues

| Issue | Files | Fix |
|-------|-------|-----|
| Mobile header logo color mismatch | `mobile-header.tsx:29` uses `bg-market-up-bg border-market-up/40` vs desktop `bg-accent-blue/10 border-accent-blue/30` | Use same tokens as desktop |
| Price displays use `text-warning` | `mobile-chart-view.tsx:51`, `mobile-book-view.tsx:292,322`, `mobile-trade-view.tsx:331` | Use `text-foreground` |
| Button variant misuse | `mobile-header.tsx:43,52` uses `variant="link"` with `active:bg-muted/50` | Use `variant="ghost"` |

### Hardcoded Colors

| Pattern | Files |
|---------|-------|
| `text-white` | `number-input.tsx` (selection), `badge.tsx` (default/destructive), `checkbox.tsx` (checked), `mobile-bottom-nav.tsx` |

### Old Radix Patterns (`data-[state=...]`)

| File | Pattern | Should Be |
|------|---------|-----------|
| `drawer.tsx:26,44,50` | `data-[state=open]`, `data-[state=closed]` | `data-[open]`, `data-[closed]` |
| `sidebar.tsx` | `data-[state=collapsed]`, `data-[state=selected]` | `data-[collapsed]`, `data-[selected]` |
| `table.tsx` | `data-[state=selected]` | `data-[selected]` |

### Inconsistent Ring Sizes

| File | Current | Should Be |
|------|---------|-----------|
| `tabs.tsx:72` | `ring-1` | `ring-2` |
| `slider.tsx:112` | `ring-4` | `ring-2` |
| `order-toast.tsx` | `ring-1` | `ring-2` |

### Inconsistent Alert/Warning Boxes

Different files use different patterns for the same visual element:

| File | Background | Border | Padding | Gap |
|------|-----------|--------|---------|-----|
| `leverage-control.tsx` | `bg-market-down-bg` | `border-market-down/20` | `p-1.5` / `p-2.5` | `gap-1.5` / `gap-2` |
| `margin-mode-dialog.tsx` | `bg-warning/10` | `border-warning/20` | `p-2.5` | `gap-2` |
| `deposit-modal.tsx` | `bg-warning/5` | `border-warning/40` | `p-4` | `gap-3` |

### Inconsistent Focus Colors

| File | Pattern |
|------|---------|
| `token-selector.tsx` | `focus:border-accent-blue/40` |
| `trade-form-fields.tsx` | `focus:border-accent-blue/60` |
| Standard should be | `focus-visible:border-ring` + `focus-visible:ring-2 focus-visible:ring-ring/50` |

### Arbitrary Values (Non-Token)

| Pattern | Files |
|---------|-------|
| `h-[1.15rem]` | `switch.tsx` |
| `ease-[cubic-bezier(0.16,1,0.3,1)]` | `dialog.tsx` |
| `max-h-[80vh]` | `drawer.tsx` |
| `max-h-[300px]` | `command.tsx` |
| `h-[60vh]`, `max-h-[90vh]` | `token-selector.tsx` |
| `max-h-[70vh]` | `global-settings-dialog.tsx` |
| `sm:max-w-[480px]` | `command-menu.tsx` (should be `sm:max-w-md`) |
| `w-[100px]` | `drawer.tsx` |
| `gap-[inherit]` | `tabs.tsx` |
| `gap-[--spacing(var(--gap))]` | `toggle-group.tsx` |
| `min-w-[13ch]` | `token-selector.tsx` |

### Dropdown/Command Text Size Inconsistency

| Component | Item Text | Shortcut Text |
|-----------|-----------|---------------|
| `dropdown-menu.tsx` | `text-xs` | `text-2xs` |
| `command.tsx` | `text-sm` | `text-xs` |
| `context-menu.tsx` | `text-sm` | — |

Should standardize to one pattern.

---

## 3. Phase 1: Reset to shadcn Defaults

The goal is to get every component back to a known-good baseline. Keep all functionality, reset all styling to shadcn defaults.

### 3.1 Token System Reset

The current token system in `styles.css` is actually well-structured. The issue isn't the tokens themselves — it's inconsistent usage. For Phase 1:

**Keep as-is:**
- All CSS custom properties in `:root` and `.dark`
- The `@theme inline` mapping
- Domain tokens (market-up/down, success, warning, error)
- Typography scale (text-5xs through text-base)
- Border radius scale
- Shadow scale

**Clean up:**
- Remove any component-level styles in `@layer components` that duplicate what tokens provide
- Ensure every token has a clear, documented purpose

### 3.2 UI Primitive Reset Checklist

For each of the 46 UI components, verify it matches shadcn defaults:

**Immediate fixes (bugs/inconsistencies):**

- [ ] `badge.tsx` — Replace `text-white` with `text-primary-foreground` or `text-accent-blue-foreground`
- [ ] `checkbox.tsx` — Replace `data-[checked]:text-white` with `data-[checked]:text-primary-foreground`
- [ ] `number-input.tsx` — Replace `selection:text-white` with appropriate token
- [ ] `mobile-bottom-nav.tsx` — Replace `text-white` with appropriate token
- [ ] `drawer.tsx` — Replace `data-[state=open/closed]` with `data-[open/closed]`
- [ ] `sidebar.tsx` — Replace `data-[state=collapsed/selected]` with `data-[collapsed/selected]`
- [ ] `table.tsx` — Replace `data-[state=selected]` with `data-[selected]`
- [ ] `tabs.tsx:72` — Change `ring-1` to `ring-2`
- [ ] `slider.tsx:112` — Change `ring-4` to `ring-2`
- [ ] `switch.tsx` — Replace `h-[1.15rem]` with standard height token
- [ ] `dialog.tsx` — Replace arbitrary cubic-bezier with named easing or standard `ease-out`
- [ ] `command-menu.tsx` — Replace `sm:max-w-[480px]` with `sm:max-w-md`

**Standardize text sizes across similar components:**

- [ ] Dropdown items, command items, context menu items → all `text-xs`
- [ ] Shortcut text → all `text-2xs`
- [ ] Description text → all `text-xs text-muted-foreground`

**Standardize focus pattern everywhere:**

```
focus-visible:ring-2 focus-visible:ring-ring/50
```

- [ ] Audit every `focus:` and `focus-visible:` usage across all 46 ui/ components
- [ ] Replace all `ring-1`, `ring-3`, `ring-4` with `ring-2`
- [ ] Replace all `focus:` (without visible) with `focus-visible:` where appropriate

### 3.3 Trade Component Reset Checklist

**Critical fixes:**

- [ ] `mobile-header.tsx:29` — Change `bg-market-up-bg border-market-up/40` to `bg-accent-blue/10 border-accent-blue/30`
- [ ] `mobile-chart-view.tsx:51` — Change `text-warning` to `text-foreground`
- [ ] `mobile-book-view.tsx:292,322` — Change `text-warning` to `text-foreground`
- [ ] `mobile-trade-view.tsx:331` — Change `text-warning` to `text-foreground`
- [ ] `mobile-header.tsx:43,52` — Change `variant="link"` to `variant="ghost"`

**Standardize alert/warning/error boxes:**

Create one consistent pattern for all alert boxes:

```tsx
// Error
"flex items-center gap-2 p-2.5 rounded-xs bg-error-bg border border-error/20 text-xs"

// Warning
"flex items-center gap-2 p-2.5 rounded-xs bg-warning-bg border border-warning/20 text-xs"

// Success
"flex items-center gap-2 p-2.5 rounded-xs bg-success-bg border border-success/20 text-xs"

// Market Down (error in trade context)
"flex items-center gap-2 p-2.5 rounded-xs bg-market-down-bg border border-market-down/20 text-xs"

// Market Up (success in trade context)
"flex items-center gap-2 p-2.5 rounded-xs bg-market-up-bg border border-market-up/20 text-xs"
```

Apply this to: `leverage-control.tsx`, `margin-mode-dialog.tsx`, `deposit-modal.tsx`, `trade-form-fields.tsx`

**Standardize focus on inputs:**

All inputs should use:
```
focus:border-accent-blue/60 focus-visible:ring-2 focus-visible:ring-ring/50
```

Apply to: `token-selector.tsx`, `price-input-with-percent.tsx`, all NumberInput/Input usages

### 3.4 Reset Priority Order

1. Fix critical bugs (mobile header, price colors, button variants)
2. Fix hardcoded `text-white` everywhere
3. Fix old Radix `data-[state=...]` patterns
4. Standardize ring sizes
5. Standardize alert boxes
6. Standardize focus patterns
7. Clean up arbitrary values
8. Standardize text sizes across dropdown/command/context

---

## 4. Phase 2: Linear-Inspired Design Layer

Once Phase 1 is complete and everything is clean shadcn defaults, apply these customizations:

### 4.1 Color Philosophy (Linear-Inspired)

**Core principle: Extreme neutrality with rare, deliberate accent pops.**

Linear uses essentially 3 variables to generate entire themes:
1. Base color (the neutral gray)
2. Accent color (sparse, intentional)
3. Contrast level (accessibility)

For HypeTerminal:
- **Base**: Zinc (cool neutral) — already correct
- **Accent**: Blue (`accent-blue`) — already correct
- **Domain**: Market green/red — unique to trading, keep
- **Principle**: Accent color should appear in < 5% of the UI surface area

### 4.2 Typography Refinements

**Linear uses**: Inter + Inter Display
**Current**: Figtree + Geist Mono

Consider:
- Enable `font-variant-numeric: tabular-nums` globally for all numeric data (orderbook, positions, prices)
- Consider `font-feature-settings: 'cv12', 'cv13', 'ss01'` if switching to Inter
- Keep Geist Mono for code/data-heavy areas

### 4.3 Density Targets (Linear-Level)

| Element | Current | Linear Target |
|---------|---------|---------------|
| Sidebar row height | varies | 28-32px |
| Nav item height | h-8 (32px) | 28-30px |
| Table row height | varies | 28-32px |
| Input height | h-8 (32px) | 28-32px |
| Button padding | px-2.5 | px-2 |
| Section gap | space-y-4 | space-y-2 to space-y-3 |

### 4.4 Visual Effects (Selective)

Linear uses glassmorphism selectively:
- `backdrop-filter: blur(10px)` on command palette, modals
- Semi-transparent backgrounds on overlays
- **Not** on structural UI (sidebar, panels)

Consider for:
- Command menu overlay
- Dialog/sheet overlays
- **Not** for cards, panels, navigation

### 4.5 Interaction Polish

- Button press: `active:scale-98` (already have this)
- Hover transitions: `transition-colors duration-150`
- Card hover: `hover:scale-[1.01] hover:translate-y-[-2px]` with `duration-200`
- Standard easing: `ease-out` for most, `ease-in-out` for modals

---

## 5. Design Principles

### From Linear

1. **Dark-first design** — optimize for dark mode, then adapt light
2. **Extreme neutrality** — monochromatic UI with rare accent pops
3. **Perceptual uniformity** — OKLCH ensures consistent lightness across hues
4. **Compactness without claustrophobia** — tight spacing but clear hierarchy
5. **Subtle craft** — pixel-perfect alignment users feel subconsciously
6. **Performance-first** — flat design + minimal decoration = fewer paint ops

### From Vercel/Geist

1. **Function-based naming** — tokens named by what they do, not what they look like
2. **10-step reasoning** — backgrounds (1-3), borders (4-6), high-contrast (7-8), text (9-10)
3. **Let the browser size things** — flex/grid/intrinsic over JS measurement
4. **Design all states** — empty, sparse, dense, error
5. **Tabular numbers** — `font-variant-numeric: tabular-nums` for data alignment

### For HypeTerminal

1. **One way to do each thing** — every visual pattern has exactly one token/class combination
2. **Tokens over classes** — use semantic tokens, never raw color values
3. **Dense by default** — this is a trading terminal, optimize for information density
4. **Market colors are sacred** — green/red have universal meaning in trading, never repurpose
5. **Mobile is a viewport, not a different app** — same tokens, same patterns, just reflowed

---

## 6. Reference: Linear Design System

### Color System

Linear derives everything from **3 variables**: base color, accent color, contrast level.

**Dark mode (default):**
- Background: `#121212` (near-black, warm-neutral)
- Surface: `#1b1c1d`
- Input bg: `#171717`
- Text: `#cccccc` (not pure white — reduces eye strain)
- Accent: `#848CD0` (muted purple-blue)

**Light mode:**
- Background: `#F7F7F7` (warm off-white, not pure white)
- Text: `#2f2f2f` (not pure black)
- Surface: `#DDDDDD`
- Accent: `#8327c9` (vivid purple)

**Key insight**: Linear limited accent color presence in theme calculations, creating a highly neutral, timeless appearance. Content contrast was improved by making text darker (light mode) and lighter (dark mode) than typical.

### Typography

- Body: **Inter** (variable), 13-14px
- Headings: **Inter Display**
- Metadata: 11-12px
- Weights: 500 (medium), 600 (semibold), 800 (extrabold headings)
- Features: `cv12` (compact f), `cv13` (compact t), `ss01` (open digits), `tnum` (tabular nums)

### Spacing

- Sidebar row: 28-32px
- Padding: 10px / 15px / 20px
- Gaps: 10px (items), 25px (groups), 50px (sections)
- Border radius: 3px (subtle), 5px (cards), 8px (panels)

### Distinctive Traits

1. Dark-first design for engineer audience
2. Monochromatic with rare accent pops
3. LCH/OKLCH for perceptual uniformity
4. 3-variable theme generation
5. Compactness without claustrophobia
6. Subtle alignment precision felt subconsciously
7. Selective glassmorphism (overlays only)
8. Bold Inter Display headings for personality

**Sources:**
- [How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [Linear Style](https://linear.style/)
- [Linear Brand Guidelines](https://linear.app/brand)
- [The rise of Linear style design (Medium)](https://medium.com/design-bootcamp/the-rise-of-linear-style-design-origins-trends-and-techniques-4fd96aab7646)
- [Linear design SaaS trend (LogRocket)](https://blog.logrocket.com/ux-design/linear-design/)

---

## 7. Reference: Vercel Geist Design System

### Color System

**10-step scales** per color (100-1000), organized by function:

| Steps | Function | Usage |
|-------|----------|-------|
| 1-3 | Component backgrounds | default, hover, active |
| 4-6 | Borders | default, hover, active |
| 7-8 | High-contrast backgrounds | badges, tags, selected |
| 9-10 | Text and icons | secondary, primary |

**10 scales**: Background, Gray, Gray Alpha, Blue, Red, Amber, Green, Teal, Purple, Pink

**CSS pattern**: `--ds-gray-100` through `--ds-gray-1000`

### Typography

- **Geist Sans**: designed for legibility and simplicity
- **Geist Mono**: for code, terminals, data
- Typography consumed as Tailwind classes combining font-size, line-height, letter-spacing, font-weight
- `font-variant-numeric: tabular-nums` for data columns

### Component Philosophy

1. Let the browser size things (flex/grid over JS)
2. Design all states (empty, sparse, dense, error)
3. Mobile inputs >= 16px (prevents iOS zoom)
4. Loading buttons show indicator + keep label
5. Size and color customization for consistency

**Sources:**
- [Vercel Geist Introduction](https://vercel.com/geist/introduction)
- [Vercel Geist Colors](https://vercel.com/geist/colors)
- [Vercel Web Interface Guidelines](https://vercel.com/design/guidelines)
- [Geist Design System (Figma)](https://www.figma.com/community/file/1330020847221146106/geist-design-system-vercel)

---

## 8. Component Inventory

### UI Primitives (src/components/ui/) — 46 components

| Component | Primitive | Status | Notes |
|-----------|-----------|--------|-------|
| alert-dialog | @base-ui | Clean | — |
| alert | HTML + CVA | Clean | — |
| avatar | HTML | Clean | — |
| badge | HTML + CVA | **Fix** | `text-white` → token |
| button | @base-ui | Clean | — |
| button-group | HTML | Clean | — |
| card | HTML | Clean | — |
| chart | Recharts | Clean | — |
| checkbox | @base-ui | **Fix** | `text-white` → token |
| collapsible | @base-ui | Clean | — |
| command | cmdk | **Fix** | text size inconsistency, arbitrary max-h |
| context-menu | @base-ui | Clean | — |
| dialog | @base-ui | **Fix** | arbitrary cubic-bezier |
| drawer | Vaul | **Fix** | old Radix `data-[state=...]`, arbitrary values |
| dropdown-menu | @base-ui | Minor | text size could align with command |
| empty | HTML + CVA | Clean | — |
| field | HTML + CVA | Clean | — |
| flash | HTML | Minor | uses oklch() directly |
| info-row | HTML | Clean | — |
| input | HTML | Clean | — |
| input-group | HTML | Clean | — |
| item | HTML + CVA | Clean | — |
| label | HTML | Clean | — |
| number-input | HTML | **Fix** | `selection:text-white` |
| popover | @base-ui | Clean | — |
| progress | @base-ui | Clean | — |
| radio-group | @base-ui | Clean | — |
| resizable | react-resizable-panels | Clean | — |
| scroll-area | @base-ui | Clean | — |
| select | @base-ui | Clean | — |
| separator | @base-ui | Clean | — |
| sheet | @base-ui | Clean | — |
| sidebar | Custom | **Fix** | old Radix data attrs, complex calc values |
| skeleton | HTML | Clean | — |
| slider | @base-ui | **Fix** | `ring-4` → `ring-2` |
| sonner | Sonner | Clean | — |
| spinner | Phosphor | Clean | — |
| switch | @base-ui | **Fix** | `h-[1.15rem]` → standard |
| table | HTML | **Fix** | old Radix `data-[state=selected]` |
| tabs | @base-ui | **Fix** | `ring-1` → `ring-2` |
| textarea | HTML | Clean | — |
| time-ticker | Utility | Clean | — |
| toggle | @base-ui | Clean | — |
| toggle-group | @base-ui | **Fix** | arbitrary gap syntax |
| tooltip | @base-ui | Clean | — |
| virtual-table | TanStack | Clean | — |

**Summary**: 33 clean, 13 need fixes (mostly minor)

### Trade Components (src/components/trade/) — ~50 components

| Area | Files | Status | Key Issues |
|------|-------|--------|------------|
| chart/ | 7 | Mostly clean | Mixed button patterns in chart type selector |
| tradebox/ | 14 | Mostly clean | Alert box inconsistency in leverage/deposit |
| orderbook/ | 4 | Clean | — |
| positions/ | 13 | Excellent | Zero violations |
| header/ | 4 | Clean | — |
| footer/ | 1 | Clean | — |
| layout/ | 4 | Clean | — |
| components/ | 7 | Minor | Arbitrary max-width in command-menu |
| mobile/ | 9 | **Multiple fixes** | Logo color, price colors, button variants |
| Root files | 2 | Clean | — |

---

## New styles.css (Draft)

Changes from current:
- **Removed**: `--accent-blue`, `--accent-blue-foreground` (use `blue-*` directly)
- **Removed**: `--color-accent-blue`, `--color-accent-blue-foreground` from `@theme inline`
- **Updated**: `--sel` uses native blue instead of custom OKLCH
- **Updated**: `--scope-perp` uses native blue
- **Added**: Comments showing which zinc shade each token maps to
- **Kept**: All semantic tokens (already zinc-based, unchanged)
- **Kept**: All domain tokens (market, success, warning, error)
- **Kept**: Typography, radius, shadows, animations, base styles, component styles

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "@fontsource-variable/figtree";
@import "@fontsource-variable/geist-mono";

@custom-variant dark (&:is(.dark *));

@theme {
	/* Typography - Font Families */
	--font-sans: "Figtree Variable", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
	--font-mono: "Geist Mono Variable", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

	/* Typography - Custom text sizes for dense UI */
	--text-nav: 0.8125rem;    /* 13px */
	--text-nav--line-height: 1.38;
	--text-2xs: 0.6875rem;    /* 11px */
	--text-2xs--line-height: 1.45;
	--text-3xs: 0.625rem;     /* 10px */
	--text-3xs--line-height: 1.5;
	--text-4xs: 0.5625rem;    /* 9px */
	--text-4xs--line-height: 1.55;
	--text-5xs: 0.5rem;       /* 8px */
	--text-5xs--line-height: 1.5;

	/* Border Radius */
	--radius-xs: 0.125rem;    /* 2px */
	--radius-sm: 0.25rem;     /* 4px */
	--radius-md: 0.375rem;    /* 6px */
	--radius-lg: 0.5rem;      /* 8px */
	--radius-xl: 0.75rem;     /* 12px */

	/* Shadows */
	--shadow-xs: 0px 1px 2px 0px oklch(0.25 0.01 260 / 0.08);
	--shadow-sm: 0px 1px 2px 0px oklch(0.25 0.01 260 / 0.1), 0px 1px 2px -1px oklch(0.25 0.01 260 / 0.1);
	--shadow-md: 0px 1px 2px 0px oklch(0.25 0.01 260 / 0.1), 0px 2px 4px -1px oklch(0.25 0.01 260 / 0.1);
	--shadow-lg: 0px 1px 2px 0px oklch(0.25 0.01 260 / 0.1), 0px 4px 6px -1px oklch(0.25 0.01 260 / 0.1);
	--shadow-xl: 0px 1px 2px 0px oklch(0.25 0.01 260 / 0.1), 0px 8px 10px -1px oklch(0.25 0.01 260 / 0.1);
	--shadow-2xl: 0px 1px 2px 0px oklch(0.25 0.01 260 / 0.25);

	/* Animations */
	--animate-pulse-slow: pulse-slow 2s ease-in-out infinite;
	--animate-blink: blink 1s step-end infinite;
	--animate-collapse-down: collapse-down 0.2s ease-out;
	--animate-collapse-up: collapse-up 0.2s ease-out;
	--animate-countdown: countdown linear forwards;

	@keyframes pulse-slow {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
	}
	@keyframes blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0; }
	}
	@keyframes collapse-down {
		from { height: 0; opacity: 0; }
		to { height: var(--collapsible-panel-height); opacity: 1; }
	}
	@keyframes collapse-up {
		from { height: var(--collapsible-panel-height); opacity: 1; }
		to { height: 0; opacity: 0; }
	}
	@keyframes countdown {
		from { width: 100%; }
		to { width: 0%; }
	}
}

/* ===== LIGHT MODE ===== */
:root {
	/* Semantic — shadcn zinc defaults */
	--background: oklch(0.985 0 0);                    /* ~zinc-50 */
	--foreground: oklch(0.141 0.005 285.823);          /* zinc-950 */
	--card: oklch(1 0 0);                              /* white */
	--card-foreground: oklch(0.141 0.005 285.823);     /* zinc-950 */
	--popover: oklch(1 0 0);                           /* white */
	--popover-foreground: oklch(0.141 0.005 285.823);  /* zinc-950 */
	--muted: oklch(0.967 0.001 286.375);               /* zinc-100 */
	--muted-foreground: oklch(0.552 0.016 285.938);    /* zinc-500 */
	--accent: oklch(0.967 0.001 286.375);              /* zinc-100 */
	--accent-foreground: oklch(0.21 0.006 285.885);    /* zinc-900 */
	--primary: oklch(0.21 0.006 285.885);              /* zinc-900 */
	--primary-foreground: oklch(0.985 0 0);            /* zinc-50 */
	--secondary: oklch(0.967 0.001 286.375);           /* zinc-100 */
	--secondary-foreground: oklch(0.21 0.006 285.885); /* zinc-900 */
	--destructive: oklch(0.577 0.245 27.325);          /* red */
	--destructive-foreground: oklch(0.985 0 0);        /* zinc-50 */
	--border: oklch(0.92 0.004 286.32);                /* zinc-200 */
	--input: oklch(0.871 0.006 286.286);               /* zinc-300 */
	--ring: oklch(0.552 0.016 285.938);                /* zinc-500 */

	/* Sidebar */
	--sidebar: oklch(0.985 0 0);
	--sidebar-foreground: oklch(0.141 0.005 285.823);
	--sidebar-primary: oklch(0.21 0.006 285.885);
	--sidebar-primary-foreground: oklch(0.985 0 0);
	--sidebar-accent: oklch(0.967 0.001 286.375);
	--sidebar-accent-foreground: oklch(0.21 0.006 285.885);
	--sidebar-border: oklch(0.92 0.004 286.32);
	--sidebar-ring: oklch(0.552 0.016 285.938);

	/* Domain — Market */
	--market-up: oklch(0.52 0.14 145);
	--market-up-muted: oklch(0.58 0.12 145);
	--market-up-bg: oklch(0.95 0.03 145);
	--market-down: oklch(0.55 0.2 25);
	--market-down-muted: oklch(0.6 0.16 25);
	--market-down-bg: oklch(0.95 0.03 25);
	--market-neutral: oklch(0.63 0.02 260);

	/* Domain — Status */
	--success: oklch(0.52 0.14 155);
	--success-bg: oklch(0.97 0.02 155);
	--warning: oklch(0.78 0.16 75);
	--warning-bg: oklch(0.98 0.03 85);
	--error: oklch(0.5 0.16 25);
	--error-bg: oklch(0.97 0.02 25);

	/* Domain — Other */
	--highlight: oklch(0.72 0.17 60);
	--scope-perp: oklch(0.623 0.214 259.815);   /* blue-500 */
	--scope-spot: oklch(0.5 0.14 175);
	--scope-builders: oklch(0.56 0.14 55);

	/* Structural */
	--sel: oklch(0.623 0.214 259.815 / 15%);    /* blue-500/15% */
}

/* ===== DARK MODE ===== */
.dark {
	/* Semantic — shadcn zinc defaults (dark) */
	--background: oklch(0.141 0.005 285.823);          /* zinc-950 */
	--foreground: oklch(0.985 0 0);                    /* zinc-50 */
	--card: oklch(0.21 0.006 285.885);                 /* zinc-900 */
	--card-foreground: oklch(0.985 0 0);               /* zinc-50 */
	--popover: oklch(0.21 0.006 285.885);              /* zinc-900 */
	--popover-foreground: oklch(0.985 0 0);            /* zinc-50 */
	--muted: oklch(0.274 0.006 286.033);               /* zinc-800 */
	--muted-foreground: oklch(0.705 0.015 286.067);    /* zinc-400 */
	--accent: oklch(0.274 0.006 286.033);              /* zinc-800 */
	--accent-foreground: oklch(0.985 0 0);             /* zinc-50 */
	--primary: oklch(0.92 0.004 286.32);               /* zinc-200 */
	--primary-foreground: oklch(0.21 0.006 285.885);   /* zinc-900 */
	--secondary: oklch(0.274 0.006 286.033);           /* zinc-800 */
	--secondary-foreground: oklch(0.985 0 0);          /* zinc-50 */
	--destructive: oklch(0.704 0.191 22.216);          /* red (brighter for dark) */
	--destructive-foreground: oklch(0.985 0 0);        /* zinc-50 */
	--border: oklch(0.274 0.006 286.033);              /* zinc-800 */
	--input: oklch(0.274 0.006 286.033);               /* zinc-800 */
	--ring: oklch(0.552 0.016 285.938);                /* zinc-500 */

	/* Sidebar */
	--sidebar: oklch(0.21 0.006 285.885);
	--sidebar-foreground: oklch(0.985 0 0);
	--sidebar-primary: oklch(0.623 0.214 259.815);     /* blue-500 */
	--sidebar-primary-foreground: oklch(0.985 0 0);
	--sidebar-accent: oklch(0.274 0.006 286.033);
	--sidebar-accent-foreground: oklch(0.985 0 0);
	--sidebar-border: oklch(0.274 0.006 286.033);      /* zinc-800 */
	--sidebar-ring: oklch(0.552 0.016 285.938);

	/* Domain — Market */
	--market-up: oklch(0.62 0.16 150);
	--market-up-muted: oklch(0.5 0.12 150);
	--market-up-bg: oklch(0.25 0.04 150);
	--market-down: oklch(0.65 0.18 22);
	--market-down-muted: oklch(0.55 0.16 22);
	--market-down-bg: oklch(0.25 0.04 22);
	--market-neutral: oklch(0.68 0.02 260);

	/* Domain — Status */
	--success: oklch(0.52 0.14 155);
	--success-bg: oklch(0.28 0.05 155);
	--warning: oklch(0.78 0.16 75);
	--warning-bg: oklch(0.32 0.06 75);
	--error: oklch(0.5 0.16 25);
	--error-bg: oklch(0.25 0.04 25);

	/* Domain — Other */
	--highlight: oklch(0.72 0.17 60);
	--scope-perp: oklch(0.623 0.214 259.815);   /* blue-500 */
	--scope-spot: oklch(0.7 0.14 175);
	--scope-builders: oklch(0.72 0.16 65);

	/* Structural */
	--sel: oklch(0.623 0.214 259.815 / 15%);    /* blue-500/15% */

	/* Dark shadows */
	--shadow-xs: 0px 1px 2px 0px oklch(0 0 0 / 0.09);
	--shadow-sm: 0px 1px 2px 0px oklch(0 0 0 / 0.18), 0px 1px 2px -1px oklch(0 0 0 / 0.18);
	--shadow-md: 0px 1px 2px 0px oklch(0 0 0 / 0.18), 0px 2px 4px -1px oklch(0 0 0 / 0.18);
	--shadow-lg: 0px 1px 2px 0px oklch(0 0 0 / 0.18), 0px 4px 6px -1px oklch(0 0 0 / 0.18);
	--shadow-xl: 0px 1px 2px 0px oklch(0 0 0 / 0.18), 0px 8px 10px -1px oklch(0 0 0 / 0.18);
	--shadow-2xl: 0px 1px 2px 0px oklch(0 0 0 / 0.45);
}

/* ===== THEME INLINE ===== */
@theme inline {
	/* Semantic Colors */
	--color-background: var(--background);
	--color-foreground: var(--foreground);
	--color-card: var(--card);
	--color-card-foreground: var(--card-foreground);
	--color-popover: var(--popover);
	--color-popover-foreground: var(--popover-foreground);
	--color-muted: var(--muted);
	--color-muted-foreground: var(--muted-foreground);
	--color-accent: var(--accent);
	--color-accent-foreground: var(--accent-foreground);
	--color-primary: var(--primary);
	--color-primary-foreground: var(--primary-foreground);
	--color-secondary: var(--secondary);
	--color-secondary-foreground: var(--secondary-foreground);
	--color-destructive: var(--destructive);
	--color-destructive-foreground: var(--destructive-foreground);
	--color-border: var(--border);
	--color-input: var(--input);
	--color-ring: var(--ring);

	/* Sidebar */
	--color-sidebar: var(--sidebar);
	--color-sidebar-foreground: var(--sidebar-foreground);
	--color-sidebar-primary: var(--sidebar-primary);
	--color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
	--color-sidebar-accent: var(--sidebar-accent);
	--color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
	--color-sidebar-border: var(--sidebar-border);
	--color-sidebar-ring: var(--sidebar-ring);

	/* Domain — Market */
	--color-market-up: var(--market-up);
	--color-market-up-muted: var(--market-up-muted);
	--color-market-up-bg: var(--market-up-bg);
	--color-market-down: var(--market-down);
	--color-market-down-muted: var(--market-down-muted);
	--color-market-down-bg: var(--market-down-bg);
	--color-market-neutral: var(--market-neutral);

	/* Domain — Status */
	--color-success: var(--success);
	--color-success-bg: var(--success-bg);
	--color-warning: var(--warning);
	--color-warning-bg: var(--warning-bg);
	--color-error: var(--error);
	--color-error-bg: var(--error-bg);

	/* Domain — Other */
	--color-highlight: var(--highlight);
	--color-scope-perp: var(--scope-perp);
	--color-scope-spot: var(--scope-spot);
	--color-scope-builders: var(--scope-builders);
	--color-sel: var(--sel);

	/* Shadows */
	--shadow-xs: var(--shadow-xs);
	--shadow-sm: var(--shadow-sm);
	--shadow-md: var(--shadow-md);
	--shadow-lg: var(--shadow-lg);
	--shadow-xl: var(--shadow-xl);
	--shadow-2xl: var(--shadow-2xl);
}

/* ===== BASE ===== */
@layer base {
	* { @apply border-border; }
	body { @apply bg-background text-foreground font-sans antialiased; }
	::selection { background: var(--sel); color: inherit; }
}

@layer base {
	:root {
		--sat: env(safe-area-inset-top);
		--sar: env(safe-area-inset-right);
		--sab: env(safe-area-inset-bottom);
		--sal: env(safe-area-inset-left);
	}
	html { height: 100%; scrollbar-gutter: stable; }
	body { overscroll-behavior-y: contain; }
	button, a, [role="button"] { touch-action: manipulation; }
	button, [role="button"], nav { user-select: none; }
	@media (prefers-reduced-motion: no-preference) {
		html { scroll-behavior: smooth; }
	}
	@media (prefers-reduced-motion: reduce) {
		*, *::before, *::after {
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
			transition-duration: 0.01ms !important;
			scroll-behavior: auto !important;
		}
	}
}

/* ===== COMPONENT STYLES ===== */
@layer components {
	/* ... same as current (touch targets, depth bars, trade rows, etc.) ... */
}
```

### Migration: `accent-blue` → `blue-*`

Every usage of `accent-blue` in the codebase needs to be replaced with direct `blue-*`:

| Current | Replacement |
|---------|-------------|
| `bg-accent-blue` | `bg-blue-500` |
| `bg-accent-blue/10` | `bg-blue-500/10` |
| `bg-accent-blue/5` | `bg-blue-500/5` |
| `text-accent-blue` | `text-blue-500 dark:text-blue-400` |
| `border-accent-blue` | `border-blue-500` |
| `border-accent-blue/30` | `border-blue-500/30` |
| `hover:bg-accent-blue/10` | `hover:bg-blue-500/10` |
| `focus-visible:ring-ring/50` | `focus-visible:ring-blue-500/50` (for accent elements) |
| `data-[selected=true]:bg-accent-blue/10` | `data-[selected=true]:bg-blue-500/10` |
| `data-[selected=true]:text-accent-blue` | `data-[selected=true]:text-blue-500` |

**Note**: `text-blue-500` works in both light and dark mode for most cases. If contrast is insufficient in dark mode, use `dark:text-blue-400`.

### What stays as semantic tokens (NOT blue-*)

These should NOT be replaced with blue — they use the auto-flipping semantic tokens:
- `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-accent` — neutral backgrounds
- `text-foreground`, `text-muted-foreground` — neutral text
- `border-border`, `border-input` — neutral borders
- `bg-primary`, `text-primary-foreground` — black/white buttons
- `bg-destructive` — red danger buttons
- `text-market-up`, `text-market-down` — trading colors

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-26 | Phase 1: Reset to native Tailwind Zinc + shadcn defaults | Eliminates color confusion. Use what Tailwind provides natively. |
| 2026-02-26 | Use Tailwind's Zinc as base neutral | shadcn's zinc theme is the closest to Linear's aesthetic. Cool neutral, professional. |
| 2026-02-26 | Blue as accent, used directly (`blue-*`) | Native Tailwind, no alias indirection. Clean, professional. |
| 2026-02-26 | Keep domain tokens custom (market-up/down, success, warning) | Trading-specific colors have no Tailwind native equivalent. |
| 2026-02-26 | Linear + Vercel as Phase 2 inspiration | Both are compact, information-dense, premium-feeling. Perfect for a trading terminal. |
| 2026-02-26 | Base UI + shadcn pattern is correct foundation | Headless primitives (behavior) + owned components (style) is the right architecture. |

## Color Architecture (Final)

### Two native Tailwind scales:
- **`zinc-*`** (50-950) — all neutrals
- **`blue-*`** (50-950) — accent color

### Semantic tokens (auto light/dark via `:root` / `.dark`):
- `background`, `foreground`, `card`, `popover`, `muted`, `primary`, `secondary`, `destructive`, `border`, `input`, `ring`
- These reference zinc shades and flip automatically

### Domain tokens (trading-specific, custom per theme):
- `market-up`, `market-down`, `market-neutral`
- `success`, `warning`, `error` (with `-bg` variants)

### Usage rules:
1. **95% of code**: Use semantic tokens (`bg-background`, `text-foreground`, `bg-muted`, `border-border`)
2. **Accent**: Use `blue-*` directly (`bg-blue-500`, `text-blue-600`, `dark:text-blue-400`)
3. **Fine-tuning**: Use `zinc-*` directly with `dark:` when semantic tokens don't have the exact shade
4. **Trading data**: Use domain tokens (`text-market-up`, `bg-market-down-bg`)
5. **No aliases, no indirection** — native Tailwind classes only
