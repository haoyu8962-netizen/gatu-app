## Design Tokens (Anvil)

- **No hardcoded colors** - Never use hex values like `text-[#2b2e48]` or `bg-[#f1f3f4]`. Always use Anvil tokens from `src/styles.css`.
- **No arbitrary font sizes** - Never use `text-[10px]` etc. Use the named scale: `text-xs` (14px), `text-sm` (16px), `text-base` (20px), `text-lg` (24px).

### Text
- `text-text-strong` primary text (max contrast)
- `text-text-weak` secondary text
- `text-text-disabled` placeholder / disabled text
- `text-text-inverse-strong` inverse (light-on-dark / dark-on-light)
- `text-text-brand` accent / brand color
- `text-text-error` error text
- `text-text-warning` warning text
- `text-text-success` success / positive text
- `text-text-info` informational text

### Background
- `bg-bg-base` page background
- `bg-bg-raised` panels / raised surfaces
- `bg-bg-overlay` cards / elevated overlays
- `bg-bg-sunken` sunken / inset areas
- `bg-bg-alternate` alternating table rows

### Fill
- `bg-fill-strong` strong fill (e.g. primary buttons)
- `bg-fill-weak` weak fill (e.g. secondary backgrounds)
- `bg-fill-weaker` very subtle fill
- `bg-fill-hover` hover state fill
- `bg-fill-press` pressed state fill
- `bg-fill-selected` selected state fill
- `bg-fill-disabled` disabled state fill
- `bg-fill-brand-strong` / `bg-fill-brand-weak` brand accent fills
- `bg-fill-error-strong` / `bg-fill-error-weak` error fills
- `bg-fill-success-strong` / `bg-fill-success-weak` success fills
- `bg-fill-warning-strong` / `bg-fill-warning-weak` warning fills

### Border
- `border-stroke-weak` default structural border
- `border-stroke-strong` emphasis border
- `border-stroke-brand-strong` brand accent border
- `border-stroke-error-strong` error border
- `border-stroke-success-strong` success border
- `border-stroke-disabled` disabled border

### Shadows
- `shadow-raised` small elevation (cards, dropdowns)
- `shadow-overlay` large elevation (modals, popovers)

### Border Radius
- **`rounded-8`** default radius for buttons, inputs, cards, badges, and all interactive elements.
- `rounded-12` overlays, modals, popovers
- `rounded-16` large containers
- `rounded-full` pills, tags, avatars

### Market colors
- `text-text-success` / `bg-fill-success-strong` for positive / green
- `text-text-error` / `bg-fill-error-strong` for negative / red
- `market-neutral` for unchanged
