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

### Dialog transitions

- `Modal` and `Drawer` from `@gatu/ui` gate an initially-open mount so Base UI still runs the enter transition; do not bypass them with `Dialog.Root` directly for app dialogs.
- Never add `!transition-none` or `data-starting-style:*` / `data-ending-style:*` overrides to `AdaptiveModal` `className` / `overlayClassName`; the 200 ms slide (drawer) and fade + scale (modal) are the contract. Destructive action buttons may keep `!transition-none` for their colors.
- Store-driven global modals must derive `open` from the store (never a literal `open`), because the host keeps a closing modal mounted for 250 ms so its exit transition can run.
- A dialog that owns a store session (for example Market Close) closes with `onOpenChange(false)` → local closing state → `onOpenChangeComplete(false)` → release the session, so the exit animation finishes before the component unmounts.
