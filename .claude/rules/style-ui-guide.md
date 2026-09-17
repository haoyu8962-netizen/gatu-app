## Style & UI Guide

### Border Colors

| State | Token | Notes |
|-------|-------|-------|
| Default | `border-stroke-weak` | Structural neutral border (also applied globally via `*`) |
| Prominent | `border-stroke-strong` | Stronger structural border |
| Focus | `focus-visible:border-stroke-focus` | Inputs, interactive elements |
| Active/selected | `border-stroke-selected` | Brand-tinted selection |
| Disabled | `border-stroke-disabled` | Faded structural |
| Semantic | `border-stroke-brand-strong`, `border-stroke-error-strong`, `border-stroke-warning-strong`, `border-stroke-success-strong`, `border-stroke-info-strong` | 80% alpha |
| Semantic soft | `border-stroke-*-weak` | 20% alpha for subtle outlined alerts |

- Use the `stroke-*` tokens for all of `border-*`, `ring-*`, `outline-*`, and `divide-*` utilities — they share the alpha-tuned values.
- Avoid opacity modifiers on `border-stroke-weak` for hover emphasis — switch to `border-stroke-strong` instead.

### Touch feedback

- Every tappable surface that is reachable on the mobile terminal must show press feedback, not only hover: use `TOUCH_PRESS_CLASS` (`active:bg-fill-weak`) or `TOUCH_PRESS_FADE_CLASS` (`active:opacity-60`) from `@/components/ui/touch-press`. Hover-only styling (`hover:*`, `min-[1001px]:hover:*`) is invisible on touch screens.
- Disclosure cards (`MobileDisclosureHeader`) keep their tinted `bg-market-close-card` header over the `bg-surface` card body; the press tint overlays the header through the full-card button. Keep that two-tone structure unless a design decision changes it.
