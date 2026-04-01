## Style & UI Guide (Anvil)

### Border Colors

| State | Token | Notes |
|-------|-------|-------|
| Default | `border-stroke-weak` | Structural neutral border |
| Hover | `hover:border-stroke-strong` | Stronger on hover |
| Focus | `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus` | Outline-based focus ring |
| Active/selected | `border-stroke-brand-strong` | Brand accent for active state |
| Disabled | `border-stroke-disabled` | Faded structural |
| Error | `border-stroke-error-strong` | Semantic error |
| Success | `border-stroke-success-strong` | Semantic success |

- Never use opacity-based borders for hover. Use solid `hover:border-stroke-strong` instead.
- Focus uses `outline` (not `border`) with `focus-visible:` prefix for keyboard-only focus rings.
