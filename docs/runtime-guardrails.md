# Runtime Guardrails

This document records the runtime boundaries that must not be broken when
changing the terminal. It exists because several bugs came from treating core
runtime state as ordinary React UI state.

When a change touches any section below, update the matching tests or this
document in the same PR.

## 1. Wallet, Agent, And Session State

### Boundary

These runtime states are separate:

| State | Meaning | Source |
|---|---|---|
| Privy authentication | A user identity session exists | Privy |
| Active signing wallet | The exact owner wallet is available and selected for signing | Privy + wagmi |
| Legal access | Hyperliquid terms are accepted and the owner may perform actions | Hyperliquid `legalCheck` / `acceptTerms2` |
| Hyperliquid agent approval | Hyperliquid has approved an agent address for the owner | Hyperliquid `approveAgent` / `extraAgents` |
| Local agent key | Browser-local private key used for trading signatures | `sessionStorage` or `localStorage` key `hyperliquid_agent_{env}_{owner}` |
| Builder-fee approval | Owner has approved the configured builder fee | Hyperliquid builder-fee status / `approveBuilderFee` |
| Funding classification | Complete perp and spot snapshots establish funded or empty | all-DEX clearinghouse state + spot state |

Do not collapse these states into one boolean.

### Rules

- Connecting a wallet must not imply a fresh agent approval if a valid local
  approved agent already exists for the same owner.
- Legal checks fail closed. A failed or unknown status must not expose Agent
  setup or ordinary global dialogs.
- Preserve the onboarding order documented in `docs/trading-onboarding.md`.
- Agent registration and builder-fee approval are separate. First-time setup
  approves only the Agent; builder-fee approval is deferred until an action
  requires it.
- `Stay Connected` is off by default. Session-only Agent records use
  `sessionStorage`; persistent Agent records use `localStorage`. Both paths are
  keyed by environment and exact owner identity.
- Do not classify an account as empty until both complete all-DEX perpetual
  and spot snapshots have loaded successfully.
- Normal wallet disconnect must clear only the active agent-only owner
  (`hyperliquid_active_agent_owner`). It must not delete
  `hyperliquid_agent_{env}_{owner}`.
- Delete a local agent key only for explicit reset/revoke/rotation flows, not
  for ordinary disconnect.
- Connected wallet sessions always win over agent-only sessions. Agent-only is
  only for imported mobile access or explicitly active local-agent sessions.
- L1 trading actions (`order`, `cancel`, `updateLeverage`, etc.) must use the
  trading client backed by the local agent.
- User-signed actions (`approveAgent`, `withdraw3`, `usdSend`, `spotSend`,
  `usdClassTransfer`, etc.) must use the connected owner wallet.
- Mobile wallet approval timeouts pause while the document is hidden. Late
  approvals must revalidate the owner and registration epoch before storage.

### Privy Authentication And Connection UI

- A Privy-authenticated session is not proof that the expected signing wallet
  is active. Email and reconnect flows must select the exact wallet associated
  with the current user and fail closed when that wallet is unavailable.
- `WalletModal` owns the primary interactive Connect surface. Surfaces outside
  `MOBILE_QR_SURFACE_MEDIA_QUERY` launch Privy directly; matching surfaces use
  the application drawer first and must close it before launching Privy.
  Existing reconnect and funding controls may call the shared reconnect hook
  directly.
- Privy owns the managed external-wallet directory. Do not add a second
  Reown/AppKit chooser or reimplement the catalog in application components.
- `PRIVY_WALLET_LIST` is the single source for recommended-wallet ordering.
  Keep named wallets ahead of detected/fallback entries and use
  `wallet_connect` for Privy's long-tail catalog.
- Login methods remain `wallet` and `email`; Passkey login is intentionally
  disabled. Embedded Ethereum wallets are created only for users without a
  wallet, and Privy's embedded wallet UI remains hidden.
- Dark/light Privy configuration changes appearance only. Preserve
  `PwaInstallProvider > PrivyProvider > SmartWalletsProvider >`
  `PersistQueryClientProvider > @privy-io/wagmi WagmiProvider`, keep
  Ethereum-only wallet selection, and customize radius through Privy's
  supported public CSS variables rather than generated DOM classes.

### Important Files

- `apps/terminal/src/config/privy.ts`
- `apps/terminal/src/providers/root.tsx`
- `apps/terminal/src/components/trade/components/wallet-modal.tsx`
- `apps/terminal/src/lib/wallet/privy-wagmi.ts`
- `packages/hl-react/src/signing/agent-storage.ts`
- `packages/hl-react/src/signing/agent-registration-session.ts`
- `packages/hl-react/src/legal.ts`
- `packages/hl-react/src/signing/use-agent-registration.ts`
- `packages/hl-react/src/signing/use-builder-fee-approval.ts`
- `packages/hl-react/src/signing/use-trading-authorization.ts`
- `packages/hl-react/src/signing/agent-session.ts`
- `packages/hl-react/src/signing/use-agent-wallet.ts`
- `packages/hl-react/src/hooks/useClients.ts`
- `packages/hl-react/src/registries/exchange.ts`
- `apps/terminal/src/domain/trade/onboarding.ts`
- `apps/terminal/src/components/trade/components/trading-onboarding-gate.tsx`
- `apps/terminal/src/hooks/wallet/use-wallet-session.ts`
- `docs/trading-onboarding.md`

### Regression Coverage

- `apps/terminal/src/lib/tests/privy-config.test.ts`
- `apps/terminal/src/lib/tests/wallet-modal.test.tsx`
- `apps/terminal/src/lib/tests/privy-wagmi.test.ts`
- `apps/terminal/src/lib/tests/wallet-session.test.tsx`
- `apps/terminal/src/lib/tests/mobile-agent-lifecycle.test.ts`
- `apps/terminal/src/lib/tests/l1-agent-signing.test.ts`
- `apps/terminal/src/lib/tests/legal-gate.test.ts`
- `apps/terminal/src/lib/tests/trading-onboarding-domain.test.ts`
- `apps/terminal/src/lib/tests/trading-onboarding-gate.test.tsx`
- `apps/terminal/src/lib/tests/trading-authorization.test.tsx`
- `apps/terminal/src/lib/tests/agent-storage-scope.test.ts`

## 2. Funding Paths

### Boundary

External wallet, Privy embedded EOA, and Privy Smart Wallet are different
funding paths. Do not hide those differences behind one generic "deposit"
implementation.

### Rules

- External wallet deposits use Arbitrum native USDC and require the wallet to
  have ETH for gas unless the path is explicitly sponsored.
- Privy embedded EOA can sign, but it still needs gas for EVM transactions.
- Smart Wallet sponsorship is a Privy/paymaster concern and must be configured
  per chain. UI must not claim sponsorship is available unless the chain is
  configured and the transaction path uses the smart wallet client.
- Bridge2 deposits must follow the Hyperliquid Bridge2 path and the correct
  chain/USDC contract for the active environment.
- Hyperliquid SDK `usdcRouting` is the sole runtime source for deposit and
  withdrawal protocol selection. Validate the response as unknown data and
  accept only exact `bridge` or `cctp` values for both fields.
- Routing queries and cache keys must remain isolated by environment. Loading,
  failed, missing, and malformed responses fail closed and must not reuse a
  route observed on another environment.
- Refetch and validate `usdcRouting` immediately before requesting a signature
  or submitting a transaction. If the route changed after the user reviewed
  the action, abort and require renewed review; never silently switch protocol
  or fall back after an error.
- Both manual and automatic Bridge2 execution paths require a fresh
  `depositRoute === "bridge"` hard guard at the execution boundary. A reported
  `cctp` route remains blocked until the complete Circle CCTP deposit executor
  is implemented; it must never enter Bridge2 as a compatibility fallback.
- Map `withdrawalRoute === "cctp"` to `sendToEvmWithData` and `bridge` to
  `withdraw3`. The user does not independently override the protocol-selected
  withdrawal route.
- Deposit UI must distinguish:
  - transaction not submitted,
  - submitted but not confirmed,
  - confirmed on Arbitrum,
  - credited on Hyperliquid,
  - timed out or failed.
- Withdrawal amounts shown to users must account for Hyperliquid withdrawal
  fees when showing net received values.

### Important Files

- `apps/terminal/src/lib/hyperliquid/use-deposit.ts`
- `apps/terminal/src/domain/trade/usdc-routing.ts`
- `apps/terminal/src/hooks/trade/use-usdc-routing.ts`
- `apps/terminal/src/components/trade/tradebox/deposit-modal.tsx`
- `apps/terminal/src/components/trade/tradebox/embedded-deposit-auto-bridge.tsx`
- `docs/hyperliquid-signing.md`
- `docs/withdrawals.md`

### Regression Coverage

- Route normalization rejects missing, malformed, and unknown values.
- Mainnet and testnet routing state cannot cross-contaminate each other.
- Manual and automatic deposits remain blocked during loading/error states and
  for `cctp`; Bridge2 may execute only after a fresh `bridge` result.
- Withdrawals use only the protocol-selected route. A pre-submit route change
  aborts before signing and requires the user to review the updated fees and
  action.

## 3. Market, Symbol, And Perp Dex Mapping

### Boundary

Human display symbols, Hyperliquid API coin identifiers, TradingView symbols,
spot `@index` symbols, and builder-deployed perp dex symbols are not
interchangeable.

### Rules

- The selected market is the source of truth. Do not parse business semantics
  from display text.
- Spot markets must use spot metadata to map `@index` to display base/quote and
  to the Hyperliquid candle/API coin.
- Builder-deployed perp markets must preserve their dex namespace for API calls
  when required, but icon/display fallbacks may use a stripped base symbol.
- Current-dex account fields must come from `clearinghouseState` for that dex:
  - main perp: omit `dex`,
  - builder-deployed perp: include `dex: currentDexName`.
- Do not show default perp account balances on a builder-deployed perp market.
- `withdrawable` is the source for available/withdrawable perp funds. Do not
  substitute spot `USDC.total`, `accountValue`, or `totalRawUsd`.

### Important Files

- `apps/terminal/src/lib/markets/*`
- `apps/terminal/src/components/trade/chart/datafeed.ts`
- `apps/terminal/src/components/trade/chart/tradingview-chart.tsx`
- `apps/terminal/src/hooks/account/*`
- `docs/architecture/market-system.md`

## 4. TradingView Lifecycle

### Boundary

TradingView is infrastructure, not a disposable React view. Recreating it on
ordinary UI changes causes blank charts, stale symbols, iframe failures, and
mobile regressions.

### Rules

- Initialize the widget only when the chart container genuinely mounts.
- Symbol changes should use TradingView's symbol change API where possible, not
  React unmount/remount.
- Theme changes must use `widget.changeTheme(...)`; do not include theme in the
  widget initialization effect dependency list.
- Locale changes must not force a route reload. If TradingView cannot hot-swap
  a locale, isolate the smallest possible chart-only refresh and keep app state
  stable.
- Mobile tab switches must not destroy the chart widget unless the whole market
  surface is leaving.
- Chart datafeed callbacks must not capture stale symbols. Use stable refs or
  request-scoped guards for async responses.
- The widget iframe must remain interactive on mobile. Do not apply
  `pointer-events: none` to the loaded TradingView iframe.
- CSP changes must keep the main document strict while allowing the
  charting-library same-origin iframe mode.

### Important Files

- `apps/terminal/src/components/trade/chart/tradingview-chart.tsx`
- `apps/terminal/src/components/trade/chart/datafeed.ts`
- `apps/terminal/src/config/chart.ts`
- `apps/terminal/src/config/security-headers.ts`
- `apps/terminal/vite.config.ts`

## 5. Mobile Runtime Layout

### Boundary

Mobile Markets, Trade, and Account views are view states inside the terminal,
not separate app sessions.

### Rules

- Keep shared mobile shell elements stable: top market selector, bottom nav,
  chart shell, and WebSocket-backed data stores should not churn on tab switches.
- Prefer same-route view state over full route replacement for Markets/Trade
  tabs.
- Do not use hidden mounted views if they continue expensive subscriptions or
  effects. If a view is mounted for continuity, guard its effects by active
  state.
- Scroll behavior must be owned by one clear container. Avoid nested vertical
  overflow chains that fight each other.
- Orderbook and chart transitions should retain the previous valid frame until
  the next symbol snapshot arrives. Avoid blank skeleton flashes for normal
  symbol switches.

### Important Files

- `apps/terminal/src/components/trade/mobile/mobile-terminal.tsx`
- `apps/terminal/src/components/trade/mobile/mobile-trade-view.tsx`
- `apps/terminal/src/components/trade/mobile/mobile-chart-view.tsx`
- `apps/terminal/src/components/trade/mobile/mobile-account-view.tsx`
- `apps/terminal/src/components/trade/orderbook/*`

## 6. WebSocket And Account Data

### Boundary

Market data and account data are separate subscription domains sharing the same
transport. Adding account subscriptions must not disturb market subscriptions.

### Rules

- Reuse the shared WebSocket connection. Do not open a separate socket for
  account data without an explicit architecture decision.
- On symbol/dex/address changes, unsubscribe the exact old subscription before
  subscribing to the new one.
- Do not clear visible orderbook/chart state until a first snapshot for the new
  symbol has arrived, unless the UI explicitly marks a transition state.
- Account realtime state should use account-level subscriptions where available
  and keep REST `/info` only as initial snapshot / reconnect fallback.
- All subscription handlers must route strictly by channel/type to avoid account
  payloads entering market stores or vice versa.

### Important Files

- `packages/hl-react/src/internal/websocket/*`
- `packages/hl-react/src/registries/subscription.ts`
- `apps/terminal/src/hooks/account/*`
- `apps/terminal/src/components/trade/orderbook/*`

## 7. I18n, Theme, And UI Tokens

### Rules

- Language switching must be client-side hot switching. Do not reload the route
  just to change locale.
- Store locale preference in localStorage and update Lingui/i18n state in place.
- Use semantic design tokens and Tailwind utilities. Do not hard-code hex colors
  in app components.
- Tooltip/popover layers must render above terminal panels and clamp to the
  viewport on mobile.
- `aria-label`, button labels, and empty states must use i18n strings.

### Important Files

- `apps/terminal/src/i18n/*`
- `apps/terminal/src/components/settings/*`
- `packages/ui/*`
- `.claude/rules/design-tokens.md`
- `.claude/rules/ui-library.md`

## 8. Mobile Connection And PWA Installation

### Boundary

Terminal layout, wallet-connection presentation, and PWA installation are
three independent decisions. A device can require the mobile connection
surface without using the mobile terminal layout, and a mobile device may not
have an install capability.

### Rules

- `MOBILE_MEDIA_QUERY` controls the terminal layout at `1000px` and below.
  `MOBILE_QR_SURFACE_MEDIA_QUERY` additionally covers coarse pointers and
  standalone display mode; do not use it to switch the terminal layout.
- The Link Desktop scanner is optional and fail closed. Render it only when
  `MOBILE_PAIRING_FEATURES.importFromQr` is enabled, and accept only the
  terminal's validated desktop-approved Agent payload.
- The mobile Email and WalletConnect entries launch Privy with explicit login
  methods; wallet selection remains Ethereum-only. An authenticated user takes
  the explicit reconnect path instead of starting a new login flow.
- The PWA entry is capability-driven. Show it only for a captured browser
  install prompt or supported iOS instructions, and hide it when installed or
  unsupported.
- A captured `beforeinstallprompt` event is single-use. Clear it before
  prompting and after installation. Do not intercept the native install flow
  on wide desktop surfaces.
- Keep the PWA manifest and browser theme color aligned with the terminal dark
  canvas (`#0F1A1F`).
- Installation support does not imply offline navigation support. Do not
  advertise the terminal as offline-capable unless the service worker gains a
  tested application-shell/navigation strategy.

### Important Files

- `apps/terminal/src/hooks/use-mobile.ts`
- `apps/terminal/src/config/mobile-pairing.ts`
- `apps/terminal/src/config/privy.ts`
- `apps/terminal/src/components/trade/components/wallet-modal.tsx`
- `apps/terminal/src/components/trade/components/mobile-agent-qr-scanner.tsx`
- `apps/terminal/src/providers/pwa-install.tsx`
- `apps/terminal/src/config/seo.ts`
- `apps/terminal/public/manifest.json`
- `apps/terminal/public/sw.js`

### Regression Coverage

- `apps/terminal/src/lib/tests/desktop-grid-layout.test.ts`
- `apps/terminal/src/lib/tests/wallet-modal.test.tsx`
- `apps/terminal/src/lib/tests/pwa-install.test.tsx`
- `apps/terminal/src/lib/tests/pwa-manifest.test.ts`
- `apps/terminal/src/lib/tests/privy-config.test.ts`

## Required Review Checklist

Before merging any change that touches the areas above:

1. Identify which guardrail section applies.
2. Confirm whether the change affects wallet session, agent storage, market
   symbol mapping, TradingView lifecycle, WebSocket subscriptions, or funding.
3. Add or update a targeted test when the behavior is stateful.
4. Verify the mobile path separately from desktop.
5. Run focused `biome check` on changed files.
6. Run the smallest relevant Vitest test(s).
7. For terminal-facing changes, run `pnpm --filter @gatu/terminal build`.
8. Keep generated or unrelated files out of the commit.

## Known Anti-Patterns

- Deleting local agent keys on normal disconnect.
- Falling back from trading actions to wallet signatures.
- Passing display symbols directly to Hyperliquid candle/orderbook APIs.
- Recreating TradingView because of theme, locale, tab, or small layout changes.
- Treating builder-deployed perp dex state as default perp state.
- Showing spot USDC totals as perp withdrawable funds.
- Clearing mobile orderbook/chart to an empty skeleton during ordinary symbol
  switches.
- Hiding mobile UI state behind full route reloads.
- Treating Privy authentication as proof that the expected signing wallet is
  active.
- Rendering the application wallet drawer underneath a Privy modal.
- Adding a second managed wallet catalog or mixing Agent QR import with Privy's
  external-wallet directory.
- Re-enabling Passkey login without explicit enrollment, recovery, and support
  behavior.
- Using the mobile connection-surface media query as the terminal layout
  breakpoint.
- Suppressing the browser-owned PWA install flow on wide desktop surfaces.
