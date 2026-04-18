# `packages/ui/` Design Engineering Review

Review against Emil Kowalski's design engineering principles (touch-first, no layout shift, reduced-motion, a11y, keyboard, performance).

Legend: 🚨 ship-blocker · ⚠️ high priority · 🔧 polish · ✅ done · ⏳ outstanding

---

## Priority queue (top-down)

- [x] 🚨 Fix `pagination.tsx` broken imports (`ArrowLeft` / `ArrowRight` undefined)
- [x] ⚠️ Fix layout shift in TextInput/NumberInput invalid state (`border` → `ring`)
- [x] ⚠️ Switch modal/drawer viewport units `vh` → `dvh`
- [x] ⚠️ Bump all pseudo hit-areas to 44px minimum
- [x] ⚠️ Add `@media (hover: hover)` gate for all `hover:` utilities (via `@custom-variant hover`)
- [x] ⚠️ Audit & fill motion-reduce gaps (~15 files)
- [x] ⚠️ Enforce `aria-label` on `ButtonIcon` and minimal `Dropdown` trigger
- [x] ⚠️ Fix label-input association in search/autocomplete/combobox (`<label htmlFor>`)
- [x] ⚠️ Replace `opacity-40` disabled state with disabled color tokens (where semantically right)
- [x] 🔧 Broaden iOS-zoom guard to Android browsers (`@media (pointer: coarse)`)
- [ ] 🔧 Dedupe autocomplete ↔ combobox (~90% duplicate logic)
- [ ] 🔧 Dedupe modal close-button markup (desktop + mobile both inline)
- [ ] 🔧 Rename `Slot` → `Placeholder` (collides with Radix/shadcn polymorphic Slot)
- [x] 🔧 Extract nested ternaries to helpers (remaining: alert, search-input, text-input, number-input, textarea, toggle)
- [x] 🔧 Strip manual `useMemo`/`useCallback` from autocomplete (React 19 compiler)
- [x] 🔧 Introduce z-index scale tokens (`--z-sticky`, `--z-overlay`, `--z-dropdown`, `--z-tooltip`, `--z-toast`)

---

## What I just fixed in this pass

Disabled-state tokens (kept `opacity-40` only on complex widgets where the whole group should dim — slider, toggle track, checkbox/radio labels):

- [x] `dropdown.tsx` triggers (default + minimal)
- [x] `select.tsx` trigger
- [x] `tabs.tsx` trigger
- [x] `segmented-controls.tsx` trigger
- [x] `pagination.tsx` nav button
- [x] `number-input.tsx` stepper (→ `text-icon-disabled`)

Nested ternary extractions (lookup tables):

- [x] `text-input.tsx` `inputTextSizeClasses`
- [x] `number-input.tsx` `inputTextSizeClasses`, `stepperIconSizes`
- [x] `search-input.tsx` `searchIconSizes`, `searchInputTextClasses`
- [x] `textarea.tsx` `resizeClasses`
- [x] `toggle.tsx` `labelTextSizeClasses`
- [x] `alert.tsx` `paddingClasses`, `titleTextClasses`, `descTextClasses`, `iconWrapperSizeClasses`, `closeIconSizes`

Other:

- [x] `autocomplete.tsx` removed `React.useMemo` / `React.useCallback`
- [x] `globals.css` added z-index scale + broadened iOS-zoom guard to `@media (pointer: coarse)`
- [x] `modal.tsx` `border-stroke-weak/40` → `border-stroke-weak` (no opacity modifier on alpha-tuned stroke)
- [x] All `z-[1000]` → `z-dropdown` / `z-tooltip` utility classes

---

## Outstanding items (by file)

### 1. `alert-global.tsx`

- [ ] L57 Reconsider `role="alert"` — use `role="status"` for non-interrupting alerts
- [ ] L58 Flex layout: `p-3` on wrapper + `m-3` on close is awkward — unify

### 2. `alert.tsx`

- [ ] L17 `overflow-clip` → `overflow-hidden` (safer across browsers)
- [ ] L154 Close icon 10/12px is too small — bump to 12/14 minimum
- [ ] L101 `inverse-brand` vs `inverse-neutral` share the same accent color — distinguish

### 3. `autocomplete.tsx`

- [ ] L119 Icon size switch misses xxs/md/lg gradient (only `sm` vs `md+`)
- [ ] L132 Chip remove button: add focus-visible style and touch hit expansion
- [ ] L150 Clear button: add hit expansion
- [ ] L186 Hardcoded `"No results found"` — add i18n hook or make prop
- [ ] L143 xxs falls to text-xs instead of text-2xs — inconsistent (shared with combobox)

### 4. `avatar.tsx`

- [ ] L59-61 Consider `key={src}` remount instead of `useEffect` to reset `imgError` (biome warning)
- [ ] L70 Add explicit `width`/`height` to `<img>` (prevent layout shift)
- [ ] L70 Add `loading="lazy"` for list avatars
- [ ] L70 If `initials` exist, set `aria-label` on wrapper (not empty alt)
- [ ] L33-38 `statusSizes` border math inconsistent at xxs (1.5 + 2 border = 3.5px)
- [ ] L89-96 Status dot needs `role="status"` + `aria-label={status}`
- [ ] L124 `-space-x-2` assumes LTR — add RTL handling
- [ ] L137 Overflow indicator needs `aria-label` (e.g. "3 more")

### 5. `badge-count.tsx`

- [ ] L8 Add size variant (currently fixed `h-6 min-w-6`)

### 6. `badge-dot.tsx`

- [ ] L43 `outline` prop adds ring → may shift adjacent content; document or fix

### 7. `badge.tsx`

- [ ] L19-23 xxs `py-0` may clip icons — add minimum padding
- [ ] L62 Icon wrapper has no fixed size → inconsistent row height

### 8. `breadcrumbs.tsx`

- [ ] L83-91 Link needs hit-area expansion for small sizes (< 44px tall)
- [ ] L50-54 Re-evaluate `role="presentation"` on `<li>` separator
- [ ] L73 `gapClass` duplicative — pull from CVA

### 9. `button-groups.tsx`

- [ ] L32 `[&>*+*]:-ml-px` breaks on wrap — document no-wrap or handle
- [ ] Add `active:scale-[0.97]` to match standalone Button press feedback

### 10. `button-icons.tsx`

- [ ] Add pseudo expansion to `lg` for consistency

### 11. `button.tsx`

- [ ] L42 `hover:opacity-90` produces muddy hover — consider tint overlay token
- [ ] L130 `defaultVariants.size = "sm"` is dead code (runtime `size ?? DEFAULT_SIZE` overrides)
- [ ] Document xxs/xs variants as desktop-only (under 32px tall)

### 12. `card.tsx`

- [ ] L10 `overflow-hidden` may clip child focus rings — document trade-off
- [ ] L58 Add `as` prop for heading element (hard-coded `<h3>`)
- [ ] Consider optional `hover:shadow-*` elevation variant

### 13. `checkboxes.tsx`

- [ ] L66 Label wrapper still uses `opacity-40` — acceptable if whole group should dim; revisit if using tokens throughout
- [ ] L75-78 Add 100-150ms scale-in on indicator appearance
- [ ] L77 xxs checkmark near-illegible (10px icon on 12px box) — bump min to 12

### 14. `combobox.tsx`

- [ ] L181 Hardcoded `"No results found"` — i18n or prop
- [ ] L121 Chip remove: add hit expansion
- [ ] Factor shared logic with `autocomplete.tsx` (~90% duplicate)

### 15. `config.ts`

- [ ] Document per-component defaults that diverge from `DEFAULT_SIZE` (e.g., slider thumbSize defaults to `md`)

### 16. `divider.tsx`

- [ ] L26 Remove unnecessary non-null assertion on `orientation`

### 17. `drawer.tsx`

- [ ] L84 Bottom drawer needs `pb-[env(safe-area-inset-bottom)]` by default
- [ ] L134,172 Header/footer padding `px-8 py-6` large — add size variant
- [ ] L137 Add drag-handle to primitive (currently only in AdaptiveModal)
- [ ] L163 Consider custom scrollbar on body

### 18. `dropdown.tsx`

- [ ] L136 Verify `onClick` vs `onSelect` close-on-click semantics
- [ ] L132 Fill md/lg gradient in `caretSize` (currently 14 for `sm`, 16 otherwise)

### 19. `globals.css`

- [ ] L393-395 Consider global `box-sizing: border-box` defensively
- [ ] Consider global `@media (prefers-reduced-motion: reduce)` baseline policy

### 20. `index.ts`

- [ ] L51 Document whether `DEFAULT_SIZE` is public API
- [ ] L127 Rename `Slot` → `Placeholder`

### 21. `modal.tsx`

- [ ] L160-163 Drag handle uses `bg-fill/20` opacity modifier on non-alpha token
- [ ] Extract shared `<CloseButton>` for desktop/mobile

### 22. `number-input.tsx`

- [ ] L203-205 Error icon size={24} too big for xxs/xs inputs
- [ ] L168-171 Stepper buttons missing explicit size — may miss touch target

### 23. `pagination.tsx`

- [ ] L44 Current page visual distinction weak — add `bg-fill-selected` or stronger cue
- [ ] L158 Mobile page count already has `tabular-nums` ✓ but width-jump from 9→10 possible — document

### 24. `progress-indicator.tsx`

- [ ] L60 ArrowLeftIcon `size={20}` fixed — scale with button size
- [ ] Consider subtle animation on step advance

### 25. `radio-buttons.tsx`

- [ ] L58 Still uses `opacity-40` on the whole item — acceptable, same as checkbox
- [ ] L10 `mt-0.5` breaks for multi-line labels or label-less rendering

### 26. `search-input.tsx`

- [ ] (Clean after this pass — all nested ternaries + label association + motion-reduce addressed)

### 27. `segmented-controls.tsx`

- [ ] L100 Indicator animates `left`/`width` — prefer `transform: translateX() scaleX()`
- [ ] L47-53 md `py-3` feels tall relative to sm — smooth gradient
- [ ] L95 `overflow-hidden` may clip focus rings on edge items

### 28. `select.tsx`

- [ ] L168-170 Caret should animate rotate on open/close

### 29. `slider.tsx`

- [ ] Still uses `opacity-40` on root — acceptable for widget-level dim
- [ ] Add thumb `transition-transform` with `data-dragging:transition-none` override

### 30. `slot.tsx`

- [ ] Rename `Slot` → `Placeholder` (avoid confusion with Radix/shadcn Slot)

### 31. `table.tsx`

- [ ] L21 Document `h-20` default cell height (80px is very tall)
- [ ] L35,42 Add optional `hover:bg-fill-hover` row styling
- [ ] Add optional sticky header
- [ ] Add sort-indicator helper component
- [ ] Consider keyboard row navigation

### 32. `tabs.tsx`

- [ ] L72 Animate indicator via `transform` instead of `left`/`width`
- [ ] L119-169 Collapse empty `size` variants into compoundVariants directly

### 33. `tag.tsx`

- [ ] L81 Remove redundant `tabIndex={0}` on `<button>`

### 34. `text-input.tsx`

- [ ] L91 `text-icon opacity-80` diverges from prefix (`text-fg-muted`) — unify
- [ ] L113 Error icon size={24} too big for xxs/xs inputs

### 35. `text-link.tsx`

- [ ] L65-66 Render `<span>` when disabled (not `<a>` with `tabIndex={-1}`)

### 36. `text.tsx`

- [ ] L15 `uppercase` variant doesn't use `--tracking-uppercase: 2px` token — wire up
- [ ] L57 Document default-color coupling (uppercase → weak, else strong)

### 37. `textarea.tsx`

- [ ] Consider char counter helper

### 38. `textblock.tsx`

- [ ] L31 `items-start` → `items-center` for icon centering in circle
- [ ] L45 Render `<button>` when `onLinkClick` provided without `href`
- [ ] Add size variant (currently hard-coded `text-lg`/`text-sm`)

### 39. `toggle.tsx`

- [ ] L17 Still uses `opacity-40` on track — acceptable for widget-level dim

### 40. `tooltip.tsx`

- [ ] L68 Arrow with border looks half-cut on diagonals — review
- [ ] Verify Base UI sets `aria-describedby` on trigger

### 41. `types.ts`

- [ ] Verify `BrandConfig` usage — remove if unused

### 42. `utils.ts`

- [ ] No issues.

---

## Build status

- ✅ Biome check clean (only pre-existing `avatar.tsx` useEffect warning, documented in item #4 above)
- ✅ No regressions from fixes
