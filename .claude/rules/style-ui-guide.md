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
- A dialog that loads lazily from a surface holding unsent input (the order form) uses `createRetryableLazyComponent` and is mounted through `LazyDialogHost` from `@/components/ui/lazy-dialog-host`; never `createLazyComponent`, which reloads the page on a missing chunk and would discard the draft. Warm such dialogs on intent (pointer, press or focus reaching the surface), not on an idle timer: a download every load performs is startup weight (`docs/terminal-performance-baseline.md`).
- A dialog kept mounted through its exit (via `useLingeringValue` or a local closing state) must treat `open === false` as cancelled: disable its confirm/submit control with `!open` and early-return in the handler, and invalidate any pending async work it owns. A closing dialog must never submit.

### Menu popups

- Two tiers only. **Navigation and form menus** (header `More`, account, language, the utilities popover, order-type and other trading-panel dropdowns) use the shared skin from `@/lib/ui/menu-popup-skin`: `menuPopupSkinClass` for action menus whose items stay `text-fg` (and keep `text-error` for destructive entries), `menuPopupSelectionSkinClass` for pick-one menus (muted options, selected option on `bg-trading-panel-card` in bold), `menuPopupSurfaceClass` for a `Popover` that only needs the surface. **Dense in-table filters and order-book controls** keep the `@gatu/ui` `Dropdown` default.
- The shared skin is `rounded-24` (12px) with `p-1`, `bg-overlay`, `shadow-overlay` and `border-trading-panel-stroke-card`; items are `rounded-16` (8px), `px-3 py-2`, `text-2sm` medium, 34px tall on desktop and `min-h-11` with `text-sm` at `max-[1000px]`; disabled entries use `text-fg-disabled`. A menu takes the font of the region that opens it, so every skinned menu is `font-market-close`.
- Call sites add only what is content-specific (width, `max-h`, icon size, hiding the check icon). Do not restyle a skinned menu with `!` modifiers, arbitrary radii or a one-off shadow or disabled colour; `modal-surface-contract` fails on those.
- Overrides work without `!` because `cn()` knows the project scales. Both merge helpers (`@/lib/cn`, `packages/ui/src/utils.ts`) list the numeric radius scale and named shadows, and the terminal helper also lists `font-market-close`; `class-merge-theme-scales.test.ts` fails when a theme key is added without listing it. Without that entry, tailwind-merge keeps both the primitive class and the override and the stylesheet order decides which one wins.
