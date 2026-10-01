## Design Tokens

- **No hardcoded colors** - Never use hex values like `text-[#2b2e48]` or `bg-[#f1f3f4]`. Always use token utilities from `packages/ui/src/globals.css` + `apps/terminal/src/styles.css`.
- **No arbitrary font sizes** - Never use `text-[10px]` etc. Use the named scale: `text-3xs` (10px), `text-2xs` (11px), `text-xs` (12px), `text-2sm` (13px, trading-panel body per design handoff), `text-sm` (14px), `text-base` (16px)+.
- **Existing arbitrary values are a ratcheted debt** - `design-token-ratchet.test.ts` pins how many `text-[Npx]`, `rounded-[Npx]` and `!bg-modal` / `!bg-overlay` / `!shadow-overlay` usages remain in `apps/terminal/src`. Adding one fails the test; when you remove some, lower the baseline in the same change. Replace them file by file as you touch a file, not in one sweep: a named font size also sets its line-height, so `text-[13px]` equals `text-2sm` only where an explicit `leading-*` is present, and a sweep across ~130 files conflicts with every branch in flight. With `--radius-factor: 0.5` the named equivalents are `rounded-4`=2px, `rounded-8`=4px, `rounded-12`=6px, `rounded-16`=8px, `rounded-20`=10px, `rounded-24`=12px, `rounded-32`=16px; 3, 5, 7, 9, 14, 18 and 20px have no named equivalent and need a design decision.

### Naming rule for NEW tokens

Never cause **literal doubling** of the Tailwind property prefix. If a token is used as `bg-*`, don't name it with `bg-` prefix (that produces `bg-bg-foo`). If it's used as `text-*`, don't prefix with `text-`. Use a different word or drop the prefix.

| Category | Token pattern | Used as |
|---|---|---|
| Surfaces | `--color-<name>` (no `bg-` prefix) | `bg-<name>` |
| Foregrounds | `--color-fg` / `--color-fg-<variant>` | `text-fg-*` |
| Semantic (shared) | `--color-<brand\|error\|warning\|success\|info>[-soft]` | `bg-*`, `text-*` |
| Fills (interactive state bgs) | `--color-fill-<state>` | `bg-fill-<state>` — NOT stutter, `bg` ≠ `fill` |
| Strokes (borders / rings / outlines / dividers) | `--color-stroke-<variant>` | `border-stroke-*`, `ring-stroke-*`, `outline-stroke-*`, `divide-stroke-*` — NOT stutter, `border` ≠ `stroke` |
| Icons | `--color-icon[-<variant>]` | `text-icon-*` — NOT stutter, `text` ≠ `icon` |

**Rule of thumb:** the only stutter to avoid is a literal repeat of the same word (`bg-bg-*`, `text-text-*`). Having different words like `border-stroke-*` or `bg-fill-*` is fine and actually helps: `bg-fill-hover` clearly means "interactive fill used as background," distinct from `bg-surface` (a surface color).

**Checklist when adding a color:**
1. Put the raw value in Layer 2 (`:root` + `.dark`) of `packages/ui/src/globals.css`.
2. Wire it into Layer 3 `@theme inline` with `--color-<name>: var(--<layer2-name>);`.
3. Pick the `<name>` so that when Tailwind adds its property prefix, there's no literal doubling.
4. If it's used across multiple properties (bg/text), use a single semantic token and let Tailwind generate all three utilities.
5. Update this doc.

### Surfaces — elevation (sunken → background → surface → overlay)
- `bg-sunken` page/recessed background (light: `#f5f6fa`, dark: `#000000`)
- `bg-background` default page background (light: `#ffffff`, shared dark default: `#12131a`)
- `bg-grid-container` terminal desktop grid underlay visible through panel gutters (light: `#f1f3f6`, terminal dark: `#1b2429`)
- `bg-dashboard-canvas` branded data-dashboard canvas behind raised page content (light: `#f1f3f6`, terminal dark: `#04251f`)
- `bg-portfolio-canvas` compatibility alias for the portfolio page; new dashboard pages should use `bg-dashboard-canvas`
- `bg-surface` elevated surfaces, cards (light: `#ffffff`, shared dark default: `#1d1e26`)
- `bg-overlay` raised overlays that open without a scrim: tooltips, toasts, dropdown menus, selection indicators and anchored popovers of any size, including the desktop market selector (light: `#ffffff`, shared dark default: `#292b33`, terminal dark: `#212d33`). The choice follows the scrim, not the size: without a scrim a `bg-modal` popup would be the page colour in the dark terminal and disappear, which is why the same market selector uses `bg-modal` as a full-screen phone sheet and `bg-overlay` as a desktop popover
- `bg-modal` blocking modal and drawer surfaces (light: `#ffffff`, shared dark default: `#292b33`); also the inputs, checkboxes and option cards rendered inside those modals. List cards, table headers and in-panel filter triggers use `bg-surface`, never `bg-modal`, even where the two resolve to the same color in the terminal (`modal-surface-contract` pins this)
- `bg-alternate` alternating rows (light: `#f5f6fa`, shared dark default: `#1d1e26`)
- `bg-inverse-surface` inverse background

> **Terminal dark-theme override**: `apps/terminal/src/styles.css` intentionally sets `bg-background`, `bg-surface`, `bg-alternate`, and `bg-modal` to `#0f1a1f` so the terminal, order book, chart, and blocking dialogs share one continuous background. `bg-overlay` remains a distinct raised color for tooltips, toasts, dropdown menus and selection indicators. Do not restore the shared defaults in the terminal without an explicit design change.

> **Terminal dark hue family**: the terminal's raised overlay (`#212d33`) and modal scrim (`--fill-overlay: #03090ca8`) stay in the same hue family as `#0f1a1f` (≈199°). `#212d33` has the same relative luminance as the shared navy-grey default `#292b33`, so every text and raised-contrast ratio measured against the old value still holds. The shared defaults (`#292b33`, `#000626a8`) are tuned for the shared navy base `#12131a`; using them over the terminal base makes menus read purple-grey and turns the page navy behind an open modal. `modal-surface-contract` pins both pairs.

> **Light mode gotcha**: `bg-background` and `bg-surface` are both `#ffffff` in light mode. Use `bg-sunken` as the container whenever you need a visually distinct inset (e.g. tab switchers, pill groups) so that `bg-surface` children appear elevated.

### Foreground — text intensity
- `text-fg` primary text (max contrast)
- `text-fg-muted` secondary/muted text
- `text-fg-disabled` disabled state — bridged to `--icon-neutral` (60% ink/white) so disabled labels stay legible; the raw `--text-disabled` (12% alpha) is reserved for disabled fills/strokes, never text
- `text-fg-inverse` / `text-fg-inverse-muted` / `text-fg-inverse-disabled` inverted text on dark/brand surfaces

### Semantic — shared bg/text
Each works as `bg-*` and `text-*`:
- `brand` (`text-brand`, `bg-brand`)
- `error` / `warning` / `success` / `info`
- `-soft` variants for subtle tinted backgrounds: `bg-brand-soft`, `bg-error-soft`, etc.

For **borders / rings / outlines / dividers** using these semantic colors, use the stroke variants (see Strokes section) to preserve the intended alpha values.

### Brand roles — `--signal`, `--action`, `--focus`
- `--signal` is the Sairn accent (light `#176b64` teal, dark `#86e5d3` mint; hover `#0f524d` / `#a8eee1`; soft 10 % / 14 %). `text-brand`, `text-signal`, `bg-signal-soft` and the focus ring (`--focus: var(--signal)`) use it. The values live in `brand/brand.json` and must be identical in `packages/ui/src/globals.css`, the terminal and the website; `tests/brand-cross-app.test.mjs` pins the equality and a 4.5:1 text contrast on every terminal surface.
- `--action` stays neutral (light `#15171e`, dark `#edeef2`): filled primary buttons are not tinted with the brand, so they cannot be mistaken for the green Buy button.
- Waiting spinners use `text-fg-muted`, never `text-signal`: the kit's mint is also its success colour, and a mint spinner reads as "done".

### Fills — interactive state backgrounds
- `bg-fill-weak` / `bg-fill-weaker` subtle tinted fills (for hover, chips)
- `bg-fill-hover` / `bg-fill-press` interactive state fills
- `bg-fill-selected` selected state fill (brand color)
- `bg-fill-disabled` disabled fill
- `bg-scrim` scrim/backdrop
- `bg-fill-inverse` / `bg-fill-inverse-weak` / `bg-fill-inverse-hover` / `bg-fill-inverse-press` / `bg-fill-inverse-disabled` inverse fills
- `bg-fill` opaque strong fill
- `bg-white` / `bg-yellow` accent fills

### Strokes — borders, rings, outlines, dividers
Use these with `border-*`, `ring-*`, `outline-*`, `divide-*` prefixes. The stroke tokens carry alpha variants (e.g. brand borders are 80% alpha; semantic soft borders are 20% alpha). Collapsing them into flat semantic tokens would lose those alphas, so they stay as `stroke-*`.

- `border-stroke-weak` default structural border (also applied globally via `*`)
- `border-stroke-strong` prominent border
- `border-stroke-selected` selected/active border (brand)
- `border-stroke-focus` focus ring / border
- `border-stroke-disabled` disabled border
- Trading panel (app-level, `apps/terminal/src/styles.css`): `border-trading-panel-stroke-card` (#e3e8ee 卡边), `border-trading-panel-stroke-input` (#d8dfe7 输入边), `border-trading-panel-stroke-control` (#c6cfd9 复选/虚线), `border-trading-panel-stroke-row` (#eef1f5 行分隔; dark 均映射语义令牌)
- `market-close-*` is a second family with the same values as `trading-panel-*` for text (`fg` / `muted` / `subtle`), strokes (`stroke-card` / `stroke-input` / `stroke-control`), surfaces (`card` / `hover`) and the control and focus colours; it started in the Market Close dialog and spread to 60+ files. New code uses `trading-panel-*` (and the shared menu skin already does); keep `market-close-*` only for the tokens that family alone defines (`danger*`, `success`, `warning`, the inline-edit shadow) until a rename is scheduled. `font-market-close` is the IBM Plex Sans family of every redesigned surface, not a dialog-specific font.
- Semantic (each at 80% alpha): `border-stroke-brand-strong`, `border-stroke-error-strong`, `border-stroke-warning-strong`, `border-stroke-success-strong`, `border-stroke-info-strong`
- Semantic soft (20% alpha): `border-stroke-brand-weak`, `border-stroke-error-weak`, etc.
- Inverse: `border-stroke-inverse-strong` / `border-stroke-inverse-weak` / `border-stroke-inverse-disabled`

All the above also work as `ring-stroke-*`, `outline-stroke-*`, `divide-stroke-*`.

### Icons — for coloring icon elements
- `text-icon` default icon color
- `text-icon-brand` brand icon
- `text-icon-error` / `text-icon-warning` / `text-icon-success` / `text-icon-info` semantic icons
- `text-icon-inverse` / `text-icon-inverse-strong` / `text-icon-inverse-disabled` inverse icons

### Typography — families and scale
- `font-sans` is Inter Variable and the default for every surface. `font-market-close` is IBM Plex Sans Variable for the redesigned trading surfaces (header, market overview, token selector, account tables, funds dialogs); the token name is historical and stays until a rename is scheduled. `font-mono` is the system monospace stack for addresses and keys. Do not add a third webfont or an arbitrary `font-[…]` family.
- The terminal declares its webfonts in `apps/terminal/src/styles.css`; `.claude/rules/startup-rendering.md` owns their `font-display`, preload and startup-gate rules. Surfaces that cannot wait for a webfont stay on system fonts: the bootstrap error page, and the chart iframe, whose document cannot see the application `@font-face` rules (`docs/runtime-guardrails.md` §4).
- The named size scale pairs each size with a line height: `text-3xs` 10/14, `text-2xs` 11/16, `text-xs` 12/16, `text-2sm` 13/18, `text-sm` 14/20, `text-base` 16/24, `text-lg` 20/28, `text-xl` 28/36, `text-2xl` 40/48, `text-3xl` 56/64. `packages/ui/src/globals.css` and the terminal `@theme` declare the same values and `typography-scale-contract` keeps them equal; the terminal alone shrinks `xl` / `2xl` / `3xl` at 1000px. Relative sizes such as `text-[0.9em]` are ratcheted separately from `text-[Npx]` and are only for text that must scale with its parent, like inline code.
- Every `text-[Npx]` that carried its own `leading-*` in the same class string now uses the named size. What the ratchet still counts either inherits its line height, so the named size would change it and its children and needs a visual check, or has no named equivalent (7, 8, 9, 15, 17, 18, 32px) and needs a design decision. `text-[28px]`, `text-[40px]` and `text-[56px]` are not `text-xl` / `text-2xl` / `text-3xl`, because those three shrink at 1000px.
- Write `leading-*` after the font size it belongs to. `cn()` treats a font size as replacing any earlier `leading-*` of the same variant, so `cn("leading-5 text-2sm")` renders `text-2sm` with its default 18px line height while `cn("text-2sm leading-5")` keeps 20px.

### Brand logo
- `--logo-signal`, `--logo-choice`, `--logo-wordmark`: the three parts of the logo kit v1.3, per theme (light `#176b64` / `#99621f` / `#08262e`, dark `#86e5d3` / `#e6b766` / `#ffffff`), equal to `logo` in `brand/brand.json`. Only `BrandLogo`, `BrandPageLoader` and the mark inside `BrandMotion` illustrations use them; they are not UI accents.
- `--logo-loader-floor`: the darkest opacity of the page-loading motion (light `0.78`, dark `0.55`), the kit's 3:1 contrast floor; looping status motions follow it through `--srm-floor`.
- Status motion (`StatusGlyph`, `BrandMotion`, `ButtonLoading`; ADR 0029) adds no colour token: `styles.css` maps `data-tone` to `--status-tone` from the existing text tokens (success → `--text-success`, error → `--text-error`, attention → `--text-warning`, neutral → `--text-weak`, info → `--text-info`), the badge cut-out `--status-on` to `--on-action`, and `--srm-floor` to `--logo-loader-floor` (mono button indicator `0.78`). A looping in-flight glyph or motion never takes the success tone, for the same reason as the waiting spinners above; the kit's `submitting` (drawn in its success colour) renders neutral. Keep the kit's own palette out of the terminal; `status-motion-contract` pins the mapping.
- See [docs/brand-assets.md](../../docs/brand-assets.md) for the logo sizes and the components.

### Market / Trading Extensions
- Order-book tokens are scoped to `apps/terminal/src/styles.css`: `--orderbook-depth-bid/ask` for 15% solid depth fills, `--orderbook-price-bid/ask` for price text, `--orderbook-flash-bid/ask` for quantity changes, `--orderbook-level-pulse-bid/ask` for full-row pulses, and `--orderbook-muted` for secondary text. Do not replace these with global market colors. Both themes and all desktop/mobile layouts share their semantic roles; palettes and composed contrast requirements are documented in `docs/orderbook-new-level-animation.md`.
- `text-market-up` / `bg-market-up` positive PnL, price up (green)
- `text-market-down` / `bg-market-down` negative PnL, price down (red)
- `text-market-neutral` / `bg-market-neutral` unchanged
- `bg-scope-perp` / `bg-scope-spot` / `bg-scope-builders` DEX category colors
- `bg-sel` selection highlight

### Border Radius
- Use named radius utilities so `--radius-factor` can tune the product consistently; never use arbitrary pixel radii.
- Shared controls default to the radius provided by `@sairn/ui` (currently `rounded-8`). Dashboard pages use `rounded-24` for page surfaces and `rounded-16` for the cards and notices inside them (`style-ui-guide.md`, Dashboard page gutters); dialogs keep `rounded-32` and menus `rounded-24`.
- Use `rounded-full` only for pills, tags, and circular indicators. Document and test any design exception instead of embedding a raw pixel value.
