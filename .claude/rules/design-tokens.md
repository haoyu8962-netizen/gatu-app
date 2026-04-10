## Design Tokens

- **No hardcoded colors** - Never use hex values like `text-[#2b2e48]` or `bg-[#f1f3f4]`. Always use token utilities from `src/styles.css`.
- **No arbitrary font sizes** - Never use `text-[10px]` etc. Use the named scale: `text-3xs` (10px), `text-2xs` (11px), `text-xs` (12px), `text-sm` (14px), `text-base` (16px)+.

### Background — elevation levels (sunken → base → raised → overlay)
- `bg-bg-sunken` page/recessed background (light: `#f5f6fa`, dark: `#000000`)
- `bg-bg-base` default page background (light: `#ffffff`, dark: `#12131a`)
- `bg-bg-raised` elevated surfaces, cards (light: `#ffffff`, dark: `#1d1e26`)
- `bg-bg-overlay` overlays, modals (light: `#ffffff`, dark: `#292b33`)
- `bg-bg-alternate` alternating rows (light: `#f5f6fa`, dark: `#1d1e26`)
- `bg-bg-brand` brand-colored background
- `bg-bg-inverse` inverse background

> **Light mode gotcha**: `bg-bg-base` and `bg-bg-raised` are both `#ffffff` in light mode — they only differ in dark. Use `bg-bg-sunken` as the container whenever you need a visually distinct inset (e.g. tab switchers, pill groups) so that `bg-bg-raised` children appear elevated in both modes.

### Text — semantic intensity
- `text-text-strong` primary text (max contrast)
- `text-text-weak` secondary/muted text
- `text-text-brand` brand-accented text (blue/periwinkle)
- `text-text-disabled` disabled state
- `text-text-error` error state
- `text-text-warning` warning state
- `text-text-success` success state
- `text-text-info` informational state
- `text-text-inverse-strong` / `text-text-inverse-weak` inverted text on dark/brand surfaces

### Fill — for backgrounds that aren't elevation-based
- `bg-fill-strong` opaque strong fill
- `bg-fill-weak` / `bg-fill-weaker` subtle tinted fills (for hover states, chips)
- `bg-fill-hover` / `bg-fill-press` interactive state fills
- `bg-fill-selected` selected state fill (brand color)
- `bg-fill-disabled` disabled fill
- `bg-fill-overlay` scrim/backdrop fill
- `bg-fill-brand-strong` / `bg-fill-brand-weak` brand fills
- `bg-fill-error-strong` / `bg-fill-error-weak` error fills
- `bg-fill-warning-strong` / `bg-fill-warning-weak` warning fills
- `bg-fill-success-strong` / `bg-fill-success-weak` success fills
- `bg-fill-info-strong` / `bg-fill-info-weak` info fills
- `bg-fill-inverse-strong` / `bg-fill-inverse-weak` inverse fills
- `bg-fill-yellow` yellow accent (star icons, highlights)

### Stroke — borders and dividers
- `border-stroke-weak` default border (set globally on `*` in base layer)
- `border-stroke-strong` prominent border
- `border-stroke-selected` selected/active border (brand)
- `border-stroke-focus` focus ring
- `border-stroke-disabled` disabled border
- `border-stroke-brand-strong` / `border-stroke-brand-weak` brand borders
- `border-stroke-error-strong` / `border-stroke-error-weak` error borders
- `border-stroke-warning-strong` / `border-stroke-warning-weak` warning borders
- `border-stroke-success-strong` / `border-stroke-success-weak` success borders
- `border-stroke-info-strong` / `border-stroke-info-weak` info borders
- `border-stroke-inverse-strong` / `border-stroke-inverse-weak` inverse borders

### Icon — for coloring icon elements
- `text-icon-neutral` default icon color
- `text-icon-brand` brand icon
- `text-icon-error` / `text-icon-warning` / `text-icon-success` / `text-icon-info` semantic icons
- `text-icon-inverse` / `text-icon-inverse-strong` inverse icons

### Market / Trading Extensions
- `text-market-up` / `bg-market-up` positive PnL, price up (green)
- `text-market-down` / `bg-market-down` negative PnL, price down (red)
- `text-market-neutral` / `bg-market-neutral` unchanged
- `bg-scope-perp` / `bg-scope-spot` / `bg-scope-builders` DEX category colors
- `bg-sel` selection highlight

### Border Radius
- **Always use `rounded-xs`** as the default radius for buttons, inputs, cards, badges, and all interactive elements.
- `rounded-4`, `rounded-6`, `rounded-8` etc. map to the radius scale (multiplied by `--radius-factor`).
- Only deviate for pills/tags (`rounded-full`) or specific design exceptions.
