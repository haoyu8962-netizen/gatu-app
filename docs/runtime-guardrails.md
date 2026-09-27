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
- Account-mode changes and mode-dependent funds actions share an exclusive
  Web Lock scoped by environment and owner. The lock is acquired before the
  registration-session lock and remains held until the SDK request settles.
  A ten-second limit applies only while waiting to acquire it; never time out
  or replay an action that has already started.
- Mobile wallet approval timeouts pause while the document is hidden. Late
  approvals must revalidate the owner and registration epoch before storage.

### Privy Authentication And Connection UI

- A Privy-authenticated session is not proof that the expected signing wallet
  is active. Email and reconnect flows must select the exact wallet associated
  with the current user and fail closed when that wallet is unavailable.
- Before Privy reports ready, the header shows `Connect Wallet` unless this
  browser holds a Privy session (`lib/wallet/privy-session-hint.ts` checks the
  SDK's local-storage token keys) or auth-initialization recovery is due; only
  those cases show `Connecting...`. The connect button may open `WalletModal`
  before readiness because the modal itself waits for `ready` to launch Privy.
- `WalletModal` owns the primary interactive Connect surface. Surfaces outside
  `MOBILE_QR_SURFACE_MEDIA_QUERY` launch Privy directly; matching surfaces use
  the application drawer first and must close it before launching Privy.
  Existing reconnect and funding controls may call the shared reconnect hook
  directly.
- Privy owns the managed external-wallet directory. Do not add a second
  Reown/AppKit chooser or reimplement the catalog in application components.
- `PRIVY_WALLET_LIST` is the single source for recommended-wallet ordering.
  Keep named wallets ahead of detected/fallback entries and use
  `wallet_connect` for Privy's long-tail catalog; do not substitute
  `wallet_connect_qr` or label an unrelated catalog identifier as SafePal.
- Login methods remain `wallet` and `email`; Passkey login is intentionally
  disabled. Embedded Ethereum wallets are created only for users without a
  wallet, and Privy's embedded wallet UI remains hidden.
- Dark/light Privy configuration changes appearance and accent color only.
  Wallet ordering and authentication behavior stay identical across themes,
  and the authentication provider is never remounted merely to change theme.
  Preserve `PwaInstallProvider > PrivyProvider > SmartWalletsProvider >`
  `PersistQueryClientProvider > @privy-io/wagmi WagmiProvider`, keep
  Ethereum-only wallet selection, and customize radius through Privy's
  supported public CSS variables rather than generated DOM classes.

### Email Wallet Identity And Export

Email sessions retain their email label at desktop, compact and mobile widths;
truncate the label instead of substituting the wallet address. Copy Address still
copies the account address. Accounts without email retain their ENS/address labels.

The account menu and Settings expose Export email wallet independently of Across,
funding, account mode and trading approval. The shared export hook requires a ready,
authenticated email session with embedded intent and an unambiguous exact owner
matching the current Privy user. Agent-only/external/ambiguous sessions cannot export.
Only explicit clicks call Privy's `exportWallet({ address: owner })`; never omit the
address or read, return, log or store the private key. Settings closes before opening
Privy. Privy owns verification/MFA and the isolated export interface. Closing that
interface is not proof that a key was copied or funds recovered. Duplicate clicks
are blocked and late failures after an identity change or unmount remain silent.

Use the same GATU origin in a system browser if the export interface cannot open.
An independent recovery entry is preferred over moving unverified Across funding
features into this runtime. Verify owner mismatch, logout, stale completion,
repeated clicks, settings dismissal and English/Chinese reactivity with mocks;
inspect entry visibility at 375, 1100 and 1440 pixels without exposing a real key.

### Provider Lifetime During Navigation

- Every application route, the Docs, Support, Terms, Privacy, Risk and
  Cookies pages included, renders inside the same client runtime gate.
  There is no document/app provider boundary to switch on the pathname
  ([ADR 0020](adr/0020-legal-pages-in-app-shell.md)); do not reintroduce a
  route surface that skips the wallet runtime without a new decision.
- Keep the current route's providers mounted throughout a pending or
  cancelled navigation, and preserve provider identity between routes:
  moving between trading, dashboard and legal pages must not remount the
  wallet or market runtime.
- A departing market title synchronizer may clear only its own last
  applied title. It must preserve a destination title already installed
  by the router's head renderer.
- Cover delayed navigation from trading and dashboard routes to every legal
  page, the reverse direction, cancellation and browser history with a real
  router. Mocking only a pathname cannot verify provider/Outlet alignment.

### Important Files

- `apps/terminal/src/config/privy.ts`
- `apps/terminal/src/routes/__root.tsx`
- `apps/terminal/src/providers/client-runtime.tsx`
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

- `apps/terminal/src/lib/tests/root-route-transition.test.tsx`
- `apps/terminal/src/lib/tests/root-provider-runtime.test.tsx`
- `apps/terminal/src/lib/tests/root-provider-split.test.ts`
- `apps/terminal/src/lib/tests/document-title.test.tsx`
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
- Bridge2 is retired for new deposits. Preserve read-only history and recovery
  for already-broadcast Bridge2 transactions, but never request a new Bridge2
  signature or submission.
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
- Both manual and automatic Bridge2 execution paths fail closed. A runtime
  `depositRoute === "bridge"` response pauses new deposits; it is not permission
  to re-enable the retired path and must never become a fallback after a CCTP
  error.
- An external wallet may use the self-submitted Circle `CctpExtension` flow
  only for a fresh `depositRoute === "cctp"`: use the route-specific native
  USDC contract, current fee and Fast Transfer allowance, EIP-3009
  `ReceiveWithAuthorization`, destination domain `19`, the official forwarder
  for both recipient fields, exact hook data, and strict source-receipt event
  validation. Reject Agent/API-wallet recipient addresses.
- Keep direct external-wallet CCTP permanently enabled on Mainnet. Testnet
  external CCTP remains independently gated until funded end-to-end evidence
  is reviewed. A route value is always an execution guard; it does not enable
  a controlled Testnet or sponsored release path.
- Embedded/email CCTP uses the exact embedded EOA for the EIP-3009 signature and
  `CctpExtensionV2` for the burn. The configured Privy Smart Wallet plus
  Arbitrum paymaster/bundler submits and sponsors the transaction. Gate this
  path independently per environment, require funded testnet and small-value
  mainnet evidence, and never infer readiness from Privy authentication or an
  unrelated sponsored transaction.
- Enabling sponsored mainnet makes the deposit path available; it is not user
  consent to move funds. The application-wide embedded-wallet host may track
  mainnet recovery but must never initiate a mainnet signature or broadcast.
  A mainnet email-wallet deposit requires the user to click the amount-labelled
  `Deposit … USDC` action in the open deposit modal after reviewing the complete
  available native-USDC balance and current Circle fee. Enforce this again at
  the execution boundary: reject automatic mainnet sponsored scope, missing
  balance or fee review, and any submitted amount that differs from the exact
  reviewed balance.
- At the mainnet sponsored execution boundary, re-read the native-USDC balance
  inside the owner-scoped funds-action lock and require it to equal the balance
  the user reviewed. Revalidate the reviewed fee at the same boundary. Any
  balance or fee change aborts before signature or broadcast and requires a
  new review. Testnet may retain the independently gated automatic full-balance
  flow for funded E2E and recovery testing; it is not evidence of mainnet user
  confirmation.
- ZeroDev mainnet sponsorship must use a narrow Arbitrum One contract policy
  for the official `CctpExtensionV2` proxy
  `0x3289e443a95B28Bcedacc4B33C689b0C9b84ffAB` and
  `batchSponsorDepositForBurn` selector `0x300fb2a3`; do not use `Sponsor all
  transactions`.
  Request, per-transaction gas, aggregate gas, and gas-price limits constrain
  sponsored infrastructure spend, not USDC value. Size them from measured
  production traffic with monitored headroom instead of copying testnet
  limits. Limit exhaustion must fail the UserOperation without falling back to
  another contract or to user-paid gas.
- The sponsored mainnet build flag is global and has no wallet or user
  allowlist. After ZeroDev is narrowed and production capacity limits are set,
  complete a small-value mainnet E2E in a controlled, non-public
  production-candidate environment using the release commit and bundle. If
  traffic cannot be isolated, add a real runtime allowlist or equivalent access
  control before calling the run a canary. A public `both` bundle makes the
  explicitly confirmed path available to every eligible email-wallet user.
- The V2 authorization nonce must bind owner, amount, validity window, and full
  deposit data. Verify the receipt per `owner + amount + authNonce`; a matching
  `SponsoredDepositForBurnSkipped` is a definitive failure even if the outer
  transaction succeeded. Do not validate the embedded owner from an
  account-abstraction outer transaction's sender or target.
- Persist the source transaction hash for CCTP recovery. Sponsored records also
  persist mode and `authNonce`, never the authorization signature. A confirmed
  source revert, invalid burn event, or matching skipped event is terminal and
  must remove that recovery item; an RPC timeout or unknown receipt must
  preserve it. A Circle `forwardTxHash` proves forwarding was submitted, not
  that HyperCore credit is complete.
- A Privy Bundler may include multiple users in one outer transaction. Match
  Circle's raw V2 message to the tracked environment, native USDC, direct or
  sponsored Extension, amount, Forwarder, and owner hook before accepting its
  forwarding hash. Ignore unrelated messages; zero or multiple exact matches
  must remain fail closed.
- Keep embedded-wallet recovery tracking mounted outside the deposit modal.
  Remove the local source record when Circle returns a `forwardTxHash` so a
  completed automatic deposit cannot block the next balance arrival; reuse the
  same TanStack Query key when the modal is open to avoid duplicate polling.
- Before a sponsored Smart Wallet broadcast, persist a minimal authorization
  intent (`env`, exact owner, amount, `authNonce`, expiry) without its signature
  or calldata. If the Bundler outcome is unknown and no source hash is returned,
  block another signature across modal close and reload until the authorization
  expires. Returning a Bundler hash is insufficient: remove the intent only
  after the exact sponsored success event proves the EIP-3009 authorization
  was consumed. Source reverts and skipped entries retain the tombstone until
  expiry.
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
- `apps/terminal/src/config/cctp-deposit.ts`
- `apps/terminal/src/lib/trade/cctp-deposit.ts`
- `apps/terminal/src/lib/trade/cctp-deposit-tracking.ts`
- `apps/terminal/src/components/trade/tradebox/deposit-modal.tsx`
- `apps/terminal/src/components/trade/tradebox/embedded-deposit-auto-bridge.tsx`
- `docs/hyperliquid-signing.md`
- `docs/withdrawals.md`

### Regression Coverage

- Route normalization rejects missing, malformed, and unknown values.
- Mainnet and testnet routing state cannot cross-contaminate each other.
- Manual and automatic Bridge2 deposits remain blocked for every routing state.
  External and sponsored CCTP may execute only after a fresh `cctp` result and
  their independent environment gate. A fresh `bridge` result pauses deposits
  instead of enabling Bridge2.
- CCTP tests cover fee/allowance changes, official addresses and domains,
  testnet recipient eligibility, Agent-address rejection, amount caps, direct
  and sponsored receipt mismatch, matching skipped events, AA outer-transaction
  independence, version-one recovery migration, refresh recovery, and terminal
  source failure cleanup.
- Sponsored tests prove that the testnet root host retains its automatic
  full-balance behavior while the mainnet root host never refreshes for a new
  deposit, signs, or broadcasts. Mainnet modal tests require the explicit
  amount-labelled `Deposit … USDC` action and pass the exact reviewed balance and
  fee to the execution boundary; balance or fee drift fails closed.
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
- The desktop chart panel hosts a `Chart | Funding` view strip
  (`ChartPanel showFundingTab`, enabled only by the main workspace). Showing
  Funding keeps the widget mounted: `TradingViewChart` receives `active={false}`
  and its layer is hidden with `invisible opacity-0 pointer-events-none` plus
  `aria-hidden`. Never hide that layer with `display:none`, never wrap it in the
  `@gatu/ui` `TabsContent` (its `[&[hidden]]:!hidden` rule removes the chart), and
  never remount the widget for a view change. The strip has a fixed height for
  every market kind so the widget height does not change on spot/perp switches.
  `docs/market-funding-history.md` owns the view.
- Chart datafeed callbacks must not capture stale symbols. Use stable refs or
  request-scoped guards for async responses.
- The widget iframe must remain interactive on mobile. Do not apply
  `pointer-events: none` to the loaded TradingView iframe.
- CSP changes must keep the main document strict while allowing the
  charting-library same-origin iframe mode.
- The vendored library samples 2% of chart loads to insert a Google Analytics
  loader from inside the iframe, gated by its internal feature flag `14851`.
  Keep `"14851"` in `CHART_DISABLED_FEATURES` and never add
  `www.google-analytics.com` to any policy; the chart CSP blocks the loader
  as a second line. Re-check after every library upgrade with
  `node apps/terminal/tests/browser/chart-analytics-probe.mjs <origin>`, which
  forces `Math.random` to `0` in every frame so the sampled branch would run.
- TradingView theme CSS runs inside the iframe, so application CSS variables
  do not inherit into it. Define its semantic background variables inside
  `apps/terminal/public/tradingview-theme-{dark,light}.css`: the canvas uses
  the terminal dark background `#0F1A1F`; raised or interactive layers use
  `#1D1E26` (the shared `bg-surface` dark value) and are never flattened into
  the canvas color.
- Keep the single theme-aware TradingView stylesheet used by runtime theme
  switching; changing CSS URLs on theme changes would require rebuilding the
  iframe.
- A rebuilt iframe paints the library's own light `body` background
  (`#e0e3eb`) as soon as the library stylesheet loads, some tens of
  milliseconds before `custom_css_url` applies the terminal theme. The
  `data-chart-initializing` mask must therefore be fully opaque at the commit
  that starts a rebuild: it never transitions in (only out), because a fade-in
  leaves the light body visible on the dark terminal during a locale rebuild.
  `tradingview-chart.test.tsx` pins the mask class at removal time.
- `numeric_formatting` (decimal sign and grouping separator) can only be given
  when the widget is created, so the chart follows the number-format setting
  through the same state-preserving rebuild as a locale change
  (`requestStatePreservingRebuild(widget, "numeric-format")`), never through a
  reload. The vendored library's `widget.save` calls back synchronously, so a
  second creation-option change in the same commit is collapsed by the
  not-ready branch rather than merged into a pending save;
  `docs/number-format-setting.md` owns the rule.
- Fonts are scoped to a document, so the `@font-face` rules in the application
  stylesheet do not reach the chart iframe. `CHART_CUSTOM_FONT_FAMILY` and the
  theme stylesheets use a system font stack and must not name an application
  webfont: a family the iframe cannot resolve silently falls through to the
  rest of the stack. Using a webfont in the chart requires declaring its
  `@font-face` inside both theme stylesheets with a stable URL;
  `chart-font-family-contract` pins this.

### Important Files

- `apps/terminal/src/components/trade/chart/tradingview-chart.tsx`
- `apps/terminal/src/components/trade/chart/chart-panel.tsx`
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
- The Markets view shows a fourth Funding tab for perpetual and HIP-3 markets
  only. While it is shown, `MobileChartView` and `MobileBookView` stay mounted
  with `active={false}`: the book layer is visible and active only for Order
  Book or Trades, and the funding query runs only while its own tab is shown.
  Disabling a TanStack query does not abort a request already in flight, so
  hiding the funding view cancels its current key when no other active observer
  uses it: the fetch signal aborts, pagination and page retries stop, and the
  previous cache is kept. The funding view mounts on first selection and then
  stays mounted; a switch to a spot market falls back to Chart.
- React `Activity` in `hidden` mode unmounts effects, which destroys the
  TradingView widget. The Markets view may start hidden to defer its first
  render, but once it has been shown it stays `visible` and hides through the
  existing wrapper classes, so the chart survives Markets/Trade/Account
  switches (see `use-has-been-active.ts`). The official terminal keeps one
  chart iframe across its Chart/Order Book/Trades tabs the same way.
- Scroll behavior must be owned by one clear container. Avoid nested vertical
  overflow chains that fight each other.
- Orderbook and chart transitions should retain the previous valid frame until
  the next symbol snapshot arrives. Avoid blank skeleton flashes for normal
  symbol switches.

### Important Files

- `apps/terminal/src/components/trade/mobile/mobile-terminal.tsx`
- `apps/terminal/src/components/trade/mobile/mobile-trade-view.tsx`
- `apps/terminal/src/components/trade/mobile/mobile-chart-view.tsx`
- `apps/terminal/src/components/trade/mobile/mobile-trade-layout.tsx`
- `apps/terminal/src/components/trade/mobile/mobile-account-view.tsx`
- `apps/terminal/src/components/trade/orderbook/*`

## 6. WebSocket And Account Data

Mobile presentation must follow [Mobile data presentation](mobile-data-presentation.md): subscription readiness and first-snapshot readiness are separate, passive loading/recovery stays quiet, and display placeholders never relax action guards.

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
- Numbers follow the number-format setting, dates follow the interface
  language with Latin digits, and components never call `toLocale*` or
  construct `Intl.*` formatters directly; `docs/number-format-setting.md` owns
  these rules and `locale-format-contract` pins the last one together with the
  decimal-input normalization rule.
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
  `MOBILE_PAIRING_FEATURES.enabled` is true, and accept only a same-origin
  `/mobile-agent-sync` link whose fragment parses as the terminal's payload.
  The scanner selects a back camera after `start()` (never before, which
  would open an unconstrained stream), excludes ultra-wide and telephoto
  labels, and then opens the scanned link itself; there is no draft storage.
- The desktop Link mobile device entry is one surface: the header QR icon,
  rendered when `hasWalletAccess && MOBILE_PAIRING_FEATURES.enabled` and kept
  visible at compact widths. The icon warms the dialog chunk on pointer enter
  and focus (`header/mobile-agent-sync-modal-loader.ts`) and opens the modal
  through the global modal store (`useMobileSyncModalOpen` /
  `useMobileSyncModalActions` in `stores/use-global-modal-store.ts`) only after
  that chunk has resolved, so the click never shows a loading shell; the lazy
  host, error boundary and retry stay in `UserMenu`, which no longer lists a
  menu item, and its fallback for this dialog is titled Link mobile device
  rather than Connecting. There is no compact
  menu entry and no revoke panel: approving again replaces the Mobile Agent,
  and the API wallet page removes it.
- The dialog has one sentence of instruction, one warning and one action. The
  approval button is the only signing action (`applicationReview:
  "confirmed"`, so an embedded wallet signs without a second prompt); success
  is the exchange's `status: "ok"`, with no `extraAgents` polling on desktop.
  Reveal keeps a 2 s hold that counts down on the button; the QR then closes after
  `MOBILE_SYNC_QR_VISIBLE_MS` (60 s), on window blur, page hide or a hidden
  document. A phone in an Agent-only session shows Deposit / Withdraw /
  Transfer disabled with the `agent-only-session` reason instead of hiding
  them ([ADR 0015](adr/0015-link-device-alignment.md) D8).
- Pairing is a client-only transfer with no server route (ADR 0015 D7 and
  D8): the payload is plain JSON in the fragment of `/mobile-agent-sync`
  (`lib/mobile-sync/sync-core.ts`, version 4), bound to one network, one owner
  and a 2-minute window. The phone parses it before its first paint, removes
  it from the address bar with `history.replaceState`, verifies the approval
  once through `extraAgents` and imports only on an explicit tap; a reload
  after the scrub asks for a new scan. The retired `/mobile-agent-sync-ticket`
  path answers 404 everywhere and must not be reintroduced. The single
  `VITE_MOBILE_PAIRING_ENABLED` build flag stays off in production until the
  checklist in `docs/mobile-phone-access-device-validation.md` has been run
  and recorded.
- The service worker never answers a pairing navigation, and the edge
  functions give that page `no-store` and `no-referrer`. Both predate the
  plain-fragment payload and are harmless, so they stay until the next edge
  release reviews them.
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
- `apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx`
- `apps/terminal/src/components/trade/header/top-nav.tsx`
- `apps/terminal/src/components/trade/header/desktop-utilities-menu.tsx`
- `apps/terminal/src/components/trade/header/user-menu.tsx`
- `apps/terminal/src/stores/use-global-modal-store.ts`
- `apps/terminal/src/routes/mobile-agent-sync.tsx`
- `apps/terminal/src/lib/mobile-sync/sync-core.ts`
- `apps/terminal/src/lib/mobile-sync/qr-classification.ts`
- `apps/terminal/src/edge/lambda-handler.ts`
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
- `apps/terminal/src/lib/tests/top-nav.test.tsx`
- `apps/terminal/src/lib/tests/user-menu.test.tsx`
- `apps/terminal/src/lib/tests/mobile-agent-sync-modal.test.tsx`
- `apps/terminal/src/lib/tests/mobile-agent-qr-scanner.test.tsx`
- `apps/terminal/src/lib/tests/mobile-agent-sync-route.test.tsx`
- `apps/terminal/src/lib/tests/mobile-sync-core.test.ts`
- `apps/terminal/src/lib/tests/qr-classification.test.ts`
- `apps/terminal/src/lib/tests/mobile-pairing-feature-gate.test.ts`
- `apps/terminal/src/lib/tests/sw-navigation-cache.test.ts`

## 9. Development And Browser Test Caches

### Boundary

The application dev server and the browser-fixture server have independent
dependency graphs and must not write to the same Vite optimizer cache. A
different HTML root or port does not isolate the cache: Vite resolves its
default beneath the nearest package directory.

Wallet initialization also depends on the browser allowing Privy's external
iframe. For local wallet validation, use a standalone browser with
`pnpm dev:browser --port 3006`, or open the existing server there. A local
embedded preview can block that iframe independently of Vite. Classify
`ERR_BLOCKED_BY_CLIENT` separately from optimizer HTTP 504 responses; do not
change signing readiness, proxy the wallet iframe, or patch the browser's
security policy to hide the failure. See
[wallet initialization troubleshooting](wallet-initialization-debugging.md).

### Rules

- Keep the application cache at its default `node_modules/.vite` and give
  `tests/browser/vite.config.ts` an explicit `node_modules/.vite-browser`
  cache under the terminal package. The paths must be distinct and neither
  may contain the other.
- Development responses use `Cache-Control: no-cache`, including optimized
  dependency modules. Browsers may retain response bodies and use ETags, but
  must revalidate them instead of reusing Vite's year-long immutable responses
  after the dependency graph changes. This is a dev-server setting only;
  production `/assets/**` responses remain immutable.
- Keep `server.strictPort` enabled. Do not start multiple application dev
  servers in the same checkout, even on different ports: they still share the
  optimizer cache. Use a separate checkout for another application instance.
- Ordinary startup uses `pnpm dev --port 3006`. Do not force re-optimization
  on every startup or delete the optimizer cache while a server is running.
  When migrating an existing browser from immutable caching, temporarily
  disable the HTTP cache in DevTools, reload and let all lazy modules finish
  loading, then restore normal caching and verify an ordinary reload. A hard
  reload alone may leave asynchronously imported modules using old responses.
- Do not work around an `Outdated Optimize Dep` response by changing wallet
  login methods, remounting authentication providers, patching SDK internals,
  or adding a second wallet chooser.
- If another server has already replaced the application cache, restart the
  development server to regenerate it, then reload the affected browser page.
  Do not clear wallet storage or credentials as part of cache recovery.
- Verify cache isolation using resolved Vite configurations. With the dev
  server still running, execute browser-fixture tests and then open a lazy
  application surface such as Privy login. Check actual dialog content and
  successful module responses, not merely an open backdrop or a mocked login
  callback. Repeat this check for desktop and mobile connection entry points.

The [Vite cacheDir option](https://vite.dev/config/shared-options#cachedir)
controls optimizer storage. Privy's screen loader can hide a failed dynamic
import, so a blank login overlay also requires checking its module requests.

The dedicated header-recovery fixture uses the separate sibling cache
`node_modules/.vite-user-menu-recovery` and runs with
`pnpm --dir apps/terminal test:browser:user-menu-recovery`. Its Vite configuration
scans only `user-menu-recovery.html`; the shared browser optimizer excludes that
entry, and the default Playwright suite excludes its dedicated test file so each
fixture runs with its own wallet mocks and server configuration. Its mock module
must cover every module the header imports that needs a provider or the real
`wagmi` package (`use-wallet-session`, `use-email-wallet-export`, `privy-wagmi`):
Vite's dependency scanner follows bare imports through the fixture graph and
applies `resolve.alias` to them, so one un-stubbed import of `@privy-io/wagmi`
makes the pre-bundle fail and the fixture render nothing. The fixture also seeds
the SDK session token key before rendering, because the header only shows
`Connecting...` for a returning session (see the connection UI rules above).

The real mobile order-entry fixture uses `node_modules/.vite-mobile-trade-all-orders`
and scans only `mobile-trade-all-orders.html`. Run it with
`pnpm --dir apps/terminal exec playwright test --config tests/browser/mobile-trade-all-orders.playwright.config.ts`.
The shared optimizer and default browser suite exclude this fixture's entry and
test file. Its cache must remain a sibling of the application and other fixture caches.

The desktop/mobile account funding fixture uses `node_modules/.vite-account-actions`
and scans only `account-actions.html`. Run it with
`pnpm --dir apps/terminal exec playwright test --config tests/browser/account-actions.playwright.config.ts`.
The shared optimizer and default browser suite exclude this fixture's entry and
test file. Validate dedicated fixtures from a cold fixture cache as well as a warm
cache: incomplete mock exports can break dependency scanning even when a warm
development run appears to pass. Never clear the application cache for this check.

The mobile/desktop close-all fixture uses the sibling cache
`node_modules/.vite-position-close-all` and scans only `position-close-all.html`.
Run it with
`pnpm --dir apps/terminal exec playwright test --config tests/browser/position-close-all.playwright.config.ts`.
The shared optimizer and default suite exclude this entry and test file. It uses
the real entry hook, dialog host, controller, submit hook and execution guards;
wallet readiness and exchange/data transport use synthetic fixtures. It exercises
responsive layout, filtered-account scope and pending submissions across list
unmounts and the 1000/1001px boundary without signing or sending real orders.

The notification fixture uses the sibling cache `node_modules/.vite-notifications`
and scans only `notifications.html`. Run it with
`pnpm --dir apps/terminal exec playwright test --config tests/browser/notifications.playwright.config.ts`.
The shared optimizer and default suite exclude this entry and test file. It mounts
the real Sonner, queue and lazy gate under root StrictMode; its buttons update
synthetic tasks without signing or sending exchange requests. The dedicated suite
checks repeated mounts, same-card result updates, late results and shared stack
geometry, and is included in both CI browser shards.

Shared desktop/mobile order summaries are emitted as separate implicit chunks
after the client runtime entry. The trade route imports them statically inside its
existing dynamic page boundary, and TanStack Start retains one client entry.
Rollup shares their transitive dependencies through the existing chunk graph.
Test this actual runtime-to-route topology when checking the chunk plugin.
Do not group application summaries with recursive `manualChunks`
assignments: they can absorb application state and vendor dependencies. See
[Rollup's manual-chunk dependency behavior](https://rollupjs.org/configuration-options/#output-manualchunks).
Validate the complete static chunk graph and startup-closure budgets after changing
these boundaries; a small named chunk alone does not prove safe startup behavior.
Do not introduce a lazy/Suspense boundary solely to shrink a measured form's bundle.

## 10. Trading Slider Sessions

Follow [slider-interactions.md](slider-interactions.md) for the shared quantity and
leverage interaction contract. A pointer session separates local visual position,
business previews throttled to one per 15ms, and the final synchronous commit. Every terminal
path clears pending work on cancellation, invalidation, and unmount. Preserve exact
business snapshots only in their original eligible identity. End callbacks run even
when a thumb was pressed without moving, so submission locks cannot remain stuck.
Dispose pointer work in layout cleanup before replacement forms run. Unmounted
quantity hooks must not restore or commit into the shared order-entry store; a
keyed market change must preserve the new form's reset and subsequent edits.

Quantity/close/TP-SL gestures must lock confirmation synchronously from pointer
start through end; leverage gestures edit drafts and never invoke an API directly.
The lock is a ref checked first in the submit path, not a disabled state: it must not
grey or otherwise restyle the submit control (`docs/slider-interactions.md`).
A value source that is only temporarily unreadable pauses an active gesture (`paused`):
nothing is published or committed until it recovers, and the gesture is not thrown
away. Reasons that end the editing context (`disabled`, identity, range or direction
changes) still cancel it at once. `lostpointercapture` never cancels: embedded
webviews report it a few milliseconds before `pointerup` with a real mouse, and the
release that follows must still commit. The control keeps the reason the last gesture
ended in `data-gesture-end`. Adding a cancellation path, and verifying any change to
the gesture lifecycle, follow [ADR 0018](adr/0018-slider-gestures-end-on-release.md):
injected pointer events do not prove operating-system event order, so such a change
is verified with physical input and a reported jump is diagnosed from the page first.
Slippage persistence requires explicit confirmation. These controls never replace
wallet, legal, funding, freshness, market identity, or SDK-boundary validation.
Market orders round protective prices inward to valid ticks, and the final
execution guard compares against the exact Big.js slippage bound. Rounding the
guard's bound outward would silently permit a price beyond the user's tolerance.

## 11. Desktop Top Navigation

[ADR 0013](adr/0013-desktop-navigation-collapse.md) owns these rules.

### Rules

- `config/desktop-nav.ts` is the single source of the desktop entries: `placement` is `primary`
  (always top level), `lower` (collapsible) or `more` (menu only); an entry has a router `path`,
  an external `href`, or `soon: true` for a disabled placeholder. The `more` entries live there
  too, in this order: Funding Comparison (`/fundingComparison`, see
  [funding comparison](funding-comparison.md)), Statistics and API Wallet; collapsed entries appear
  before them. The mobile drawer's More section lists the same three entries in the same order,
  followed by the drawer-only Docs and Support entries ([ADR 0020](adr/0020-legal-pages-in-app-shell.md)); the
  drawer matches its current entry on the lower-cased path, so `/fundingComparison` is compared as
  `/fundingcomparison`. `desktop-nav-layout`, `top-nav` and `mobile-nav-drawer` pin both lists.
  `lib/navigation/desktop-nav.ts` derives the top-level list and the More menu with
  `resolveDesktopNavLayout` and the current entry with `isDesktopNavItemActive`; `TopNav` only
  renders that result and mounts one More dropdown.
- Breakpoints are named in `config/layout.ts`: `DESKTOP_NAV_COMPACT_MAX_PX` (1181) and
  `DESKTOP_NAV_NARROW_MAX_PX` (1100). The `nav-compact` Tailwind variant in `styles.css` must equal
  the compact constant (`desktop-nav-layout` pins it); never write `max-[1181px]` again.
- Collapse rule: at or below the compact width the Soon placeholder leaves the top level and appears
  disabled in More; the lower entries move into More when the account chip is visible at the compact
  width or for every state at the narrow width. "Account chip visible" means `authenticated ||
  isConnected` from `useWalletSession`, the same condition under which `UserMenu` renders an
  identity instead of the Connect CTA, so Agent-only sessions collapse like wallet sessions;
  `hasWalletAccess` stays reserved for deposit and signing guards. Hidden links and More items
  always come from the same layout result. Headers with a visible account chip also shrink the
  logo, deposit button, address and utilities at the compact width through `nav-compact:*` classes,
  independently of market loading; while the market loads only the Settings entry of the utilities
  menu is disabled so theme and language stay reachable.
- The utilities menu trigger is named `Display and language` (`DESKTOP_NAV_LABELS.utilities`), never
  `More`, so it stays distinguishable from the navigation More button for assistive technology.
- `UserMenu` decides its first frame from `useState(() => hasPersistedPrivySession())`, not from a
  mount effect: visitors without a stored Privy session see `Connect Wallet` on the first rendered
  frame, and the compact label keeps the ENS name for accounts without email. Dashboard routes
  (including the `/join/$code` referral invitation, after its code check) await
  `bootDashboardRoute()` in `beforeLoad`, within `TRADE_ROUTE_REVEAL_BUDGET_MS`, so the
  account menu, the global modal host (and its Ctrl/⌘K listener) and the desktop footer are
  resolved before reveal. Dashboard pages render `DashboardHeader`, `FooterBar` and `GlobalModals`
  only from `components/dashboard/dashboard-chrome.tsx`, whose `preloadDashboardChrome()` preloads
  those exact lazy instances; a page-local `createLazyComponent` wrapper would not be preloaded.
  The footer is skipped when the mobile layout matches at the start of the preload and added
  if the viewport has become desktop once the account menu and the modal host have resolved.
  The header lives in the same module so the dynamically imported chrome chunk shares the pages'
  header closure; without it Rollup regroups the shared header chunks and the trade desktop
  runtime startup exceeded its bundle budget.
- Evidence for the narrow width (2026-09-17, local production build, disconnected, 1001px viewport,
  gap between the navigation and the wallet controls after removing Earn): en 78px, zh 189px,
  hi 185px, es 53px, fr 2px, ar 109px. French leaves no margin, so every state collapses at
  1100px. Re-run that measurement before adding a locale or lengthening a label.

### Important Files

- `apps/terminal/src/config/desktop-nav.ts`
- `apps/terminal/src/config/layout.ts`
- `apps/terminal/src/lib/navigation/desktop-nav.ts`
- `apps/terminal/src/components/trade/header/top-nav.tsx`
- `apps/terminal/src/lib/tests/desktop-nav-layout.test.ts`
- `apps/terminal/src/components/trade/mobile/mobile-nav-drawer.tsx`
- `apps/terminal/src/lib/tests/mobile-nav-drawer.test.tsx`
- `apps/terminal/src/lib/navigation/boot-dashboard-route.ts`
- `apps/terminal/src/components/dashboard/dashboard-chrome.tsx`
- `apps/terminal/src/lib/tests/preload-trade-terminal-surface.test.ts`

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
