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
