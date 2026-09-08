# HypeTerminal Codex Guidance

This file contains durable project instructions for Codex. Read `agent.md` for the broader architecture, commands, and coding conventions. Keep this file limited to stable rules that future tasks must preserve; do not add temporary investigation notes, commit hashes, or one-off status updates.

## Change discipline

- Preserve unrelated changes in a dirty worktree and stage only files that belong to the current task.
- Keep business calculations out of components and use `Big.js` for financial arithmetic.
- Follow the existing TypeScript, React, Tailwind, Biome, and Conventional Commit conventions described in `agent.md`.
- Do not change behavior outside the requested surface while making visual-alignment changes.

## Wallet signing contract

- Treat the active wallet account as the signing identity. Before creating a user-signed Hyperliquid client, require its address to match the selected Hyperliquid user address exactly, case-insensitively; fail closed on missing or mismatched accounts.
- For Privy email sessions, activate only the exact embedded wallet belonging to that user. Never fall back to the first connected or first embedded wallet when the expected address is unavailable.
- Hyperliquid Agent/API Wallet keys may be stored locally, but Agent approval must always be signed by the matching master wallet. Missing local Agent state may trigger re-registration; it must never trigger a different browser wallet.

## First-use trading onboarding contract

- Preserve this order: connect owner wallet, verify/accept legal terms, approve and verify the Agent/API wallet, classify complete account funding snapshots, then open deposit only for a definitively empty account.
- Legal status, Agent approval, local Agent key, builder-fee approval, and funding state are separate gates. Errors or missing snapshots must fail closed and must not be treated as acceptance, approval, or an empty account.
- Agent registration must not approve the builder fee. Builder-fee approval belongs to the first trading action that requires the configured builder code.
- `Stay Connected` is off by default. Off stores the generated Agent in `sessionStorage`; on stores it in `localStorage`. Every Agent-registration entry point must honor the same `hyperliquid.persist_trading_connection` preference.
- Mobile wallet approval timeouts pause while the page is hidden. A late approval may be committed only after revalidating the owner, registration epoch, stored key, and server-approved Agent address.
- Keep `docs/trading-onboarding.md` synchronized with changes to this flow.

## Wallet connection UI contract

- Privy is the sole managed authentication and external-wallet directory. Do not add a parallel Reown/AppKit wallet chooser; the application owns only the surrounding terminal drawer and desktop-link flow.
- Keep Privy login limited to `wallet` and `email`. Passkey login is intentionally disabled, and embedded Ethereum wallets are created only for users who log in without a wallet. Re-enabling Passkeys requires an explicit enrollment, recovery, and support design.
- Keep recommended-wallet ordering in `PRIVY_WALLET_LIST`. Use `wallet_connect` as the long-tail catalog entry; do not substitute `wallet_connect_qr` or label an unrelated catalog identifier as SafePal.
- `WalletModal` owns the primary interactive Connect surface. Surfaces outside `MOBILE_QR_SURFACE_MEDIA_QUERY` launch Privy directly; matching surfaces use the application drawer first. Close the drawer before launching Privy. Existing reconnect and funding controls may call the shared reconnect hook directly.
- Privy authentication is not proof that the required signing wallet is active. Reconnect and email-wallet flows must activate the exact expected wallet and continue to enforce the wallet signing contract above.
- Privy dark/light configuration may change only appearance and accent color. Keep wallet ordering and authentication behavior identical across themes, customize radius only through Privy's public CSS variables, preserve the provider hierarchy, and do not remount the authentication provider merely to change theme.

## Mobile connection and PWA contract

- Keep the terminal layout breakpoint (`MOBILE_MEDIA_QUERY`, at `1000px` and below) separate from the broader mobile connection-surface query (`MOBILE_QR_SURFACE_MEDIA_QUERY`, which also includes coarse pointers and standalone display mode).
- Offer Link Desktop only when its fail-closed feature flag is enabled. Keep email login and the Ethereum-only Privy wallet directory as the ordinary mobile connection paths; authenticated sessions use the explicit reconnect path.
- Show PWA installation only when a real browser install prompt or supported iOS instructions are available. Installed and unsupported states must hide the entry, a captured install prompt is single-use, and wide desktop `beforeinstallprompt` behavior must remain browser-owned.

## Mobile data presentation contract

- Follow `docs/mobile-data-presentation.md` before changing mobile loading, reconnect, empty, or error states, including shared dialogs used on mobile.
- Passive data fetching must not render loading, stale, unavailable, paused-update, or raw transport-error text, warning icons, warning banners, or error labels in action buttons. Use stable numeric placeholders, blank lists, or skeletons; `aria-busy` and screen-reader-only loading descriptions are allowed.
- A subscription being active is not proof that its first snapshot arrived. Show empty-list conclusions and deposit suggestions only after a complete, current, successful snapshot. Stale, failed, missing, or mismatched snapshots are never confirmed empty states.
- Numeric zero placeholders belong only to presentation. Preserve all signing, account-mode, funding, regional, freshness, and action-availability guards; disable actions using availability booleans, never the presence of a displayed explanation.
- Show confirmed restrictions only after the relevant identity or policy has resolved. Preserve feedback for actions the user actually requested, including uncertain transaction outcomes; do not infer a broken connection, unsupported account, or missing funds from an unfinished request.
- Cover initial subscription without data, stale/error recovery, genuine empty snapshots, and disabled-action behavior in regression tests. Update this document before introducing a new category of passive data notice.

## Trading terminal visual contract

- The dark terminal and chart canvas use `#0F1A1F` (`rgb(15, 26, 31)`) as the main background.
- Application modals and drawers use the dedicated `bg-modal` surface, which resolves to `#0F1A1F` in the terminal dark theme. Do not change `bg-overlay` to achieve this; tooltips, toasts, and selection indicators still depend on its raised contrast.
- Raised or interactive TradingView layers use `#1D1E26`; do not flatten those layers into the canvas color.
- TradingView theme CSS runs inside an iframe, so application CSS variables do not automatically inherit into it. Define its semantic background variables inside `tradingview-theme-{dark,light}.css`.
- Keep the single theme-aware TradingView stylesheet used by runtime theme switching; changing CSS URLs on theme changes would require rebuilding the iframe.
- Keep theme colors in shared tokens or existing style abstractions where possible instead of scattering new literals.

## Order book contract

- Order-book prices, depth bars, and view-mode icons use the shared `--orderbook-depth-bid` and `--orderbook-depth-ask` tokens. The dark theme resolves them to `#1FA67D` and `#ED7088`; the light theme resolves them to the WCAG-AA `--text-success` (`#067A57`) and `--text-error` (`#C73A3A`) colors. Depth bars are solid fills at `0.15` opacity, not gradients.
- A row's depth width is its cumulative total divided by the largest visible cumulative total on that side. Bid and ask rows must therefore have independently varying lengths.
- Desktop and compact depth bars are left-aligned. Preserve the existing mirrored direction in the mobile split layout.
- Size-change feedback is a one-shot `1.8s ease` color fade: increases start at `#0A9981`, decreases start at `#ED7088`, then return to the normal text color. It must restart for every qualifying value update and must not loop.
- Reset size-change comparison state when the market or grouping identity changes so stale values cannot flash after switching context.
- In the mobile split layout, cumulative `Total` is static data; do not animate or color it from the individual level `size`.
- Preserve WebSocket `px` and `sz` values as decimal strings. Use Big.js outside React components for cumulative base size and cumulative quote notional; quote `Total` is the running sum of each level's `size * price`, not cumulative base size multiplied by the current row price.
- Compact order books derive their layout from one measured ladder height: both-side mode reserves the mid price and its two gaps, then covers each half independently; single-side modes use the full height and omit the mid price. Render enough slots to cover the container, independently of the feed depth, and fill sparse snapshots with non-interactive placeholders so the footer stays fixed. Keep the twenty-level incremental `l2` feed primary and the public five-level `l2Book + fast` stream as the feature-gated and automatic fallback; full books continue using the default `l2Book` feed. Filter same-coin fast/full cross-talk before writing subscription state because the pinned SDK does not distinguish those callbacks itself.
- Error, stale, cached, or market/grouping-mismatched snapshots must never be interactive. Cache identity includes network, market, grouping, and the actual feed source (`l2`, fast `l2Book`, or full `l2Book`), and cache expiry uses local receipt time rather than comparing the user's wall clock with exchange timestamps.
- Follow `docs/orderbook-layout.md` before changing ladder geometry. Full-width order-book rows use a `23px` row height and a `2px` gap; the compact split mobile book uses a `24px` row height and a `4px` gap. Round coverage up and clip overflow only at the far edge, keeping best prices anchored toward the spread/mid price (or at the top of each side-by-side ladder). Do not distribute spare height between rows or add vertical ladder padding. Only completely visible rows may be interactive. Update real rows, skeletons, placeholders, coverage and interaction calculations together, and verify resizing and all view modes.
- Compact order-book headers respond to the order-book container width, not the page viewport, when deciding whether asset unit labels fit.
- Desktop resizing uses react-grid-layout grid units. Preserve panel min/max constraints and container-aware compact order-book behavior so manual resizing cannot reintroduce overlap.

## Recent trades contract

- Desktop order book and recent trades share one full-width, mutually exclusive tab panel. Do not mount duplicate book or trade subscriptions to simulate a stacked layout. Below `240px`, hide the visible tab labels while preserving their accessible names.
- Desktop recent-trade rows display `Price / Size / Time`; their header and rows share the same grid definition. At widths below `200px`, hide `Time` and preserve the two-column `Price / Size` layout.
- At normal desktop width, use the `1fr / 2fr / 2fr` column proportion and a `24px` recent-trade row height to match the terminal's stable data density.
- Derive trade price precision from the selected market instead of hard-coding decimal places. Keep WebSocket `px` and `sz` values as strings until formatting or Big.js calculation.
- Apply both Hyperliquid price constraints when deriving grouping and display precision: at most five significant figures and at most `6 - szDecimals` decimal places for perps or `8 - szDecimals` for spot.
- Format trade times as local 24-hour `HH:mm:ss` values. Use `(time, coin, tid)` for trade identity in both processed UI data and subscription accumulation.
- Quote-denominated trade sizes use Big.js outside React components; do not multiply JavaScript numbers in the row renderer.

## Desktop trading layout contract

- The terminal switches to its mobile surface at `1000px` and below. Keep the runtime media query, skeleton visibility, navigation visibility, mobile-only typography, and bottom-navigation-aware overlays on the same inclusive breakpoint.
- At widths above `1420px`, use the 16-column three-column desktop grid. From `1001px` through `1420px`, use a 14-column `8 / 3 / 3` top row so the chart, market data, and trading panel remain visible together; use an `11 / 3` lower row for account panels.
- Keep favorites, market information, chart, market data, trading interface, account table, and account information as stable keyed grid children. Responsive desktop changes must move and resize those instances rather than conditionally remounting them.
- Persist desktop grid geometry in grid units and validate stored geometry against current panel constraints before restoring it. Do not let stale persisted data override panel identities or min/max constraints.
- Desktop grid item gutters and outer container spacing are both `3px`. Keep `margin` and react-grid-layout `containerPadding` aligned; the latter is geometry, not CSS padding.
- The desktop grid underlay uses `#F1F3F6` behind white panels in the light theme and `#1B2429` behind `#0F1A1F` panels in the dark theme. Keep react-grid-layout transparent so the underlay remains visible through every gutter; do not replace this separation with panel borders.
- Bump the desktop grid storage key when default geometry changes incompatibly, and preserve a user-visible reset path for valid but unwanted saved layouts.

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
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/privy-config.test.ts \
  src/lib/tests/wallet-modal.test.tsx \
  src/lib/tests/wallet-session.test.tsx \
  src/lib/tests/pwa-install.test.tsx \
  src/lib/tests/pwa-manifest.test.ts
```

When a visual contract changes, also inspect the affected desktop, compact, and mobile layouts where applicable.

<!-- BEGIN CODEX AUTO-COMMIT -->
For every task that may modify repository files, use the `$auto-commit` skill from the beginning of the task. After completing and validating the requested work, create a Git commit before the final response. Do not commit only when the user explicitly says not to commit or when the skill's safety exceptions apply. Never push unless the user explicitly requests it.
<!-- END CODEX AUTO-COMMIT -->
