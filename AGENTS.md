# HypeTerminal Codex Guidance

This file contains durable project instructions for Codex. Read `agent.md` for the broader architecture, commands, and coding conventions. Keep this file limited to stable rules that future tasks must preserve; do not add temporary investigation notes, commit hashes, or one-off status updates.

## Change discipline

- Preserve unrelated changes in a dirty worktree and stage only files that belong to the current task.
- Keep business calculations out of components and use `Big.js` for financial arithmetic.
- Follow the existing TypeScript, React, Tailwind, Biome, and Conventional Commit conventions described in `agent.md`.
- Do not change behavior outside the requested surface while making visual-alignment changes.

## Trading terminal visual contract

- The dark terminal and chart canvas use `#0F1A1F` (`rgb(15, 26, 31)`) as the main background.
- Application modals and drawers use the dedicated `bg-modal` surface, which resolves to `#0F1A1F` in the terminal dark theme. Do not change `bg-overlay` to achieve this; tooltips, toasts, and selection indicators still depend on its raised contrast.
- Raised or interactive TradingView layers use `#1D1E26`; do not flatten those layers into the canvas color.
- TradingView theme CSS runs inside an iframe, so application CSS variables do not automatically inherit into it. Define its semantic background variables inside `tradingview-theme.css`.
- Keep the single theme-aware TradingView stylesheet used by runtime theme switching; changing CSS URLs on theme changes would require rebuilding the iframe.
- Keep theme colors in shared tokens or existing style abstractions where possible instead of scattering new literals.

## Order book contract

- Bid depth uses `#1FA67D`; ask depth uses `#ED7088`. Depth bars are solid fills at `0.15` opacity, not gradients.
- A row's depth width is its cumulative total divided by the largest visible cumulative total on that side. Bid and ask rows must therefore have independently varying lengths.
- Desktop and compact depth bars are left-aligned. Preserve the existing mirrored direction in the mobile split layout.
- Size-change feedback is a one-shot `1.8s ease` color fade: increases start at `#0A9981`, decreases start at `#ED7088`, then return to the normal text color. It must restart for every qualifying value update and must not loop.
- Reset size-change comparison state when the market or grouping identity changes so stale values cannot flash after switching context.
- In the mobile split layout, cumulative `Total` is static data; do not animate or color it from the individual level `size`.
- Order-book rows use a `23px` row height and a `2px` gap. If either value changes, update every visible-row and panel-height formula that depends on them in the same change.

## Verification

Run checks proportional to the touched surface before committing:

```bash
pnpm exec biome check <changed TypeScript/TSX files>
pnpm --filter @gatu/terminal typecheck
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/orderbook.test.ts \
  src/lib/tests/orderbook-size-cell.test.tsx \
  src/lib/tests/orderbook-rows.test.ts
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/chart-theme-colors.test.ts \
  src/lib/tests/tradingview-chart.test.tsx
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/modal-surface-contract.test.ts
```

When a visual contract changes, also inspect the affected desktop, compact, and mobile layouts where applicable.
