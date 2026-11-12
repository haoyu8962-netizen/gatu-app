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
| Hyperliquid agent approval | Hyperliquid has approved an agent address for the owner | Hyperliquid `approveAgent`; verified with `userRole` for the unnamed default Agent key, `extraAgents` for a named Mobile Agent ([ADR 0038](adr/0038-unnamed-default-agent-for-trading-connection.md)) |
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
- An explicit wallet disconnect closes the owner's Agent registration session,
  removes that owner's local Agent key (`hyperliquid_agent_{env}_{owner}`) and
  clears the matching active agent-only owner (`hyperliquid_active_agent_owner`)
  before logging out of Privy (`use-wallet-session.ts`,
  `closeAgentRegistrationSessionAndRemove`). If the key cannot be removed, the
  disconnect fails and does not log out. The next connection generates and
  approves a new Agent, which follows Hyperliquid's advice never to reuse API
  wallet addresses; a same-name approval deregisters the previous one. Ordinary
  email trading keeps no local Agent, so this affects external-wallet and
  Agent-only sessions. (Decided 2026-10-04: the code is authoritative; this
  section used to say the opposite.) In an Agent-only session Disconnect
  removes the imported key and owner but does not log out of Privy; an
  env-matching Agent-only owner takes precedence over a wallet session and
  masks its Privy identity ([ADR 0039](adr/0039-link-mobile-device-builder-fee-and-session-priority.md)).
- Apart from explicit disconnect, delete a local Agent key only for explicit
  reset, revocation or rotation, never during transient signer restoration
  (`docs/trading-onboarding.md`).
- An env-matching agent-only owner (imported mobile access) wins over a
  connected wallet session; a wallet session applies only when no such owner is
  active ([ADR 0039](adr/0039-link-mobile-device-builder-fee-and-session-priority.md)).
  Agent-only is only for imported mobile access or explicitly active
  local-agent sessions.
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
- Card funding ([ADR 0034](adr/0034-privy-card-funding.md)) calls Privy's
  `useFiatOnramp` with an explicit destination that
  `resolvePrivyFiatFundingDestination` derives from the exact Hyperliquid owner
  and Privy's connected-wallet list; never call a Privy funding hook without
  that destination, because Privy then defaults to the first embedded wallet.
  The deposit dialog closes before Privy's window opens, the page-level
  `PrivyFiatFundingHost` owns the request, and both networks stay behind
  their own fail-closed flags. The deposit dialog's chunk loads that host
  (`launchPrivyFiatFunding`, and a warm-up while the purchase entry is on
  screen); `PrivyFiatFundingHostGate` only renders it once loaded, so the
  application's purchase host, its notice card and the import's chunk list
  stay out of runtime startup. Privy's own funding module is part of Privy's
  main chunk, which the static trade startup already loads with or without
  the flag; Privy loads the purchase screen itself when the window opens. Right
  before it opens Privy the host resolves the destination again from the
  current session and refuses when it is no longer the wallet the purchase
  was requested for. The purchase entry is released when `fund()` settles or
  when Privy's window, once seen open for that attempt, has closed: `fund()`
  itself waits for its first quote request, and a window that Privy closes
  without ending the flow (a logout) never settles it. A result that arrives
  later is still reported. `patches/@privy-io__react-auth@3.46.0.patch` also
  gives the result promise inside `fund()` a rejection handler when it is
  created, so that closing the window before the first quotes return does
  not raise an unhandled rejection; `privy-fiat-funding.test.ts` runs the
  installed hook and fails without that hunk, and must be re-derived on
  every Privy upgrade. Each result is stored with the owner and network
  that started it. A notice is
  a custom Sonner card that checks its presentation, the current owner and
  the current network every time it renders and translates in place, so it
  never shows to another identity, not even when Sonner inserts it after it
  was withdrawn, and a removal it asked for itself is never taken for the
  owner closing the notice. Stripe's embedded onramp is the only provider that
  runs inside the page; its documented script, frame and connect origins are
  the only card-funding entries in the CSP, and `permissions-policy` keeps
  `payment=()` and `camera=(self)` until a separate decision.
- `PRIVY_WALLET_LIST` is the single source for recommended-wallet ordering.
  Keep named wallets ahead of detected/fallback entries and use
  `wallet_connect` for Privy's long-tail catalog; do not substitute
  `wallet_connect_qr` or label an unrelated catalog identifier as SafePal.
- Login methods remain `wallet` and `email`; Passkey login is intentionally
  disabled. Privy's login window never creates a wallet (`createOnLogin:
  "off"`): after login, `EmailEmbeddedWalletProvider` creates the embedded
  Ethereum wallet of an email session that has none, once per session through
  Privy's `createWallet()`
  ([ADR 0033](adr/0033-silent-email-wallet-creation.md)). That call shows no
  Privy screen only while the wallet proxy is ready and the Privy application
  keeps user-owned recovery on creation off. External-wallet sessions never
  get one, and Privy's embedded wallet UI remains hidden.
- Dark/light Privy configuration changes appearance, accent color and the
  login-window logo only. The logo is the brand lockup for that theme, a
  same-origin file (`/brand/lockup-on-dark.svg`, `/brand/lockup-on-light.svg`)
  that `pnpm brand:sync` copies from `brand/svg`; it overrides the dashboard
  `logo_url`, so the dashboard logo is never the source of truth. Wallet ordering and authentication behavior stay identical across themes,
  and the authentication provider is never remounted merely to change theme.
  Preserve `PwaInstallProvider > PrivyProvider > EmailEmbeddedWalletProvider >`
  `SmartWalletsProvider > PersistQueryClientProvider > @privy-io/wagmi WagmiProvider`, keep
  Ethereum-only wallet selection, and customize radius through Privy's
  supported public CSS variables rather than generated DOM classes.
- `ClientRootProvider` passes `PRIVY_CONFIG_BY_THEME[theme]` from the live
  theme store, following Privy's documented system-theme recipe, so the login
  window follows a theme toggle without a reload
  ([ADR 0026](adr/0026-privy-follows-theme-after-upgrade.md)). Re-rendering
  `PrivyProvider` is safe only while `useWallets()` keeps the same array
  across theme-only provider renders: `@privy-io/wagmi` answers every new array with
  `reconnect()` on the `setActiveWalletForWagmi` path, and `useWalletSession`
  drops the address while wagmi reports `reconnecting`. `@privy-io/react-auth`
  3.46.0 preserves the array for unchanged nonempty embedded-wallet lists;
  `patches/@privy-io__react-auth@3.46.0.patch` does the same for an empty
  embedded list (external-wallet and logged-out sessions). Before upgrading
  Privy, run `privy-theme-switch-wallet-stability.test.tsx` against the new
  version and drop that hunk only when the test passes without it. The same
  file carries a second, unrelated hunk for card funding (`fund()`'s result
  promise, below), so remove hunks, not the file.
- The nonempty embedded-wallet path (ordinary email trading) has no behavioral
  test: no test can log in a real embedded owner. The same test file only
  checks that the SDK's field comparison (address, chain, connector type and
  connection time) is still present in both builds. An upgrade that fails that
  check needs a manual theme toggle with a logged-in email account before it
  ships. The comparison also fails when `connectedAt` falls back to
  `Date.now()` because the connection history could not be stored, so such a
  session still reconnects on every theme toggle.

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

Use the same Sairn origin in a system browser if the export interface cannot open.
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
- Send (`sendAsset` / `spotSend`) uses the same funds-action availability as
  withdrawals (owner wallet session, supported account mode, current balances,
  region) on the balances table and in the dialog, and re-checks the region in
  each pre-execution guard. Before submitting, the dialog asks `preTransferCheck`
  about the destination, as the official terminal does: a sanctioned destination
  is refused; an activation fee, or a destination that has never sent a
  transaction on Hyperliquid, opens a review step in the same dialog with the fee
  and a loss warning, and its static `Send` / `Send with Fee` control stays
  disabled until the user acknowledges that this is not a withdrawal to another
  chain; a failed or malformed answer sends nothing. The draft is locked while
  the check runs, and an answer that arrives after the account, network or
  draft changed is dropped. The review belongs to the account it was checked
  for: an account change discards it and its acknowledgement, and confirming
  re-checks that identity. Max does not reserve the activation fee, as on the
  official terminal (its Max is the withdrawable balance floored to 2 decimals,
  or to the token's decimals for spot). Max, the available label and the
  over-balance check read the exact balance string, the same one the execution
  guard compares with Big.js; a JavaScript number rounds a large balance (such
  as `999999999.99999999`) up, so a Max taken from it could exceed the balance
  and be refused on every retry (2026-10-31, P2 D8).
- Email-wallet withdrawals name their Arbitrum destination. Refuse the wallet's
  own address (the automatic email-wallet deposit would put it straight back)
  and the native USDC token contracts of both networks, in the form and again at
  submission.
- Spot Swap and position Reverse trade, so they follow the trading region gate
  (`useGeoRestriction().actionsBlocked`) like order entry: the balances table
  hides Swap, the swap dialog disables its control and names the restriction, the
  position rows disable Reverse, and the reverse submission re-checks the region
  inside its asset lock. Both also refuse in their SDK execution guard when the
  live region check has turned restricted or unverified since the click, so a
  request waiting for a lock or the legal check cannot be signed after the
  region changed. Closing actions keep their current availability.
- Exits stay open under this terminal's own region check: when only
  `useGeoRestriction()` reports a restricted or unverified region, closing a
  position (market, limit, Close All), TP/SL, cancelling and isolated-margin
  changes remain available; opening trades, Swap, Reverse and funds actions are
  blocked. The exchange's own verdict still blocks everything: `legalCheck`
  `restrictions: "a"` makes `canPerformActions` false, and every signed action
  fails closed on it. The official terminal goes further and hides its close and
  cancel columns and the order form while its IP check is blocked or still
  loading (bundle of 2026-10-30); that is not copied here, because a wrong or
  failed lookup of the terminal's own check would then leave positions that
  cannot be closed, and exchanges that withdraw from a region usually keep a
  close-only mode.
- Privy embedded EOA can sign, but it still needs gas for EVM transactions.
- Smart Wallet sponsorship is a Privy/paymaster concern and must be configured
  per chain. UI must not claim sponsorship is available unless the chain is
  configured and the transaction path uses the smart wallet client.
- Bridge2 is retired for deposits: never request a Bridge2 signature or
  submission. The app never stored recovery data for Bridge2 deposits; past ones
  appear in the account ledger like any other deposit.
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
- Mainnet and Testnet email sessions share the automatic full-balance flow,
  independently controlled by each environment's sponsored flag
  ([ADR 0040](adr/0040-automatic-email-wallet-deposits.md)).
  The root host checks the exact active embedded owner, route, balance, fee and
  recovery state, then refreshes the balance inside an exclusive browser lock
  before calling the automatic execution scope. The modal explains automatic
  funding and has no second Deposit action; Done only closes it.
- Automatic execution preserves the funds-action lock and fresh route, geo,
  legal, exact-owner, fee, allowance, chain and paymaster checks. Existing
  pending or unknown submissions must prevent a new authorization. Mainnet
  manual sponsored callers still require exact reviewed balance and fee values
  and fail on drift; automatic callers do not require a manual review, but the
  execution boundary treats the submitted full balance as the locked value:
  it re-reads the native-USDC balance inside the funds-action lock before
  signing and again before broadcasting, and any difference aborts (the host
  then retries with the refreshed balance). Automatic callers also verify the
  owner's fresh legal status before signing, because no dialog gate ran. The
  host reports a no-hash submission or an unconfirmed submitted one as a
  persistent unknown status, not as a failure. The host is eligible only while
  the legal status is known and allows actions, the legal check at the
  execution boundary is bound to the account that signs, and no automatic
  attempt starts while an earlier sponsored authorization is unresolved.
  Session restoration may process an existing eligible balance. This requires
  the application page to be running and does not promise offline initiation.
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
  automatic path available to every eligible email-wallet user.
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
- Sponsored tests exercise both environments' automatic full-balance flow:
  disabled flags, invalid identity, route/fee/balance failures, exclusive locks,
  StrictMode replay, persisted recovery and unknown outcomes. The real Mainnet
  auto host is tested with the real deposit hook and simulated external clients,
  without a modal or click; a remount must not duplicate the pending deposit.
  Email modal/form tests require no second Deposit action. Manual execution
  review checks and external-wallet submission regressions remain covered.
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
  `@sairn/ui` `TabsContent` (its `[&[hidden]]:!hidden` rule removes the chart), and
  never remount the widget for a view change. The strip has a fixed height for
  every market kind so the widget height does not change on spot/perp switches.
  `docs/market-funding-history.md` owns the view.
- Chart datafeed callbacks must not capture stale symbols. Use stable refs or
  request-scoped guards for async responses.
- The datafeed declares `has_weekly_and_monthly: false`, as the official
  terminal does, so the library requests daily bars for 1W and 1M charts and
  builds those bars itself. The history-target guard compares a request with
  the resolution the library asks for (`getDatafeedRequestResolution`: `1D` for
  daily, weekly and monthly charts), never with the chart's own resolution;
  comparing with `1W` or `1M` drops every request and leaves those charts, and
  the daily chart opened after them, without bars (2026-10-30 audit, C1).
  `chart-datafeed.test.ts` covers history and realtime;
  `node apps/terminal/tests/browser/chart-resolution-probe.mjs <origin>` checks
  the real library against a running server.
- Overlay line text comes from translated labels and the number formatters
  (`use-tradingview-overlay-lines.ts`); the position size goes through
  `formatDecimalString`, never `Big#toString`.
- The widget iframe must remain interactive on mobile. Do not apply
  `pointer-events: none` to the loaded TradingView iframe.
- CSP changes must keep the main document strict while allowing the
  charting-library same-origin iframe mode.
- The vendored loader (`charting_library.js` and its esm/cjs/standalone
  copies) carries one local patch in `_create`: the `innerWindowLoad`
  listener is registered after `document.open()` and before
  `document.write(...)` through `_listenInnerWindowLoad`; the blob-iframe
  branch, which writes nothing, and the missing-`contentWindow` warning branch
  call the same helper where the upstream code registered it, so those paths
  keep their behaviour (the warning branch still throws on the null window).
  The upstream order (listener after `document.close()`) loses the event on WebKit whenever every inner bundle is
  already in the page's memory cache, which is the second widget of a page on
  production (immutable bundles, ADR 0006): the inner document dispatches the
  event synchronously during the write, `onChartReady` never fires and the
  chart ends in "Something went wrong" after the ready watchdog. The listener
  cannot move before `document.open()`, which removes every listener on the
  inner window. `chart-library-loader-handshake-contract` pins the source
  order in all four copies and `chart-library-loader-handshake` runs the real
  loader against a stub iframe whose write dispatches the event synchronously
  (with the upstream order as a negative control); both are in the CI
  TradingView step through its `chart-*` glob. Re-apply the patch and
  regenerate `deploy/manifests/tradingview-charting-library.json` on every
  library upgrade; `chart-rebuild-webkit-probe.mjs` with
  `serve-immutable-build.mjs` reproduces the failure on a local build.
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
- Chart price precision is a function of the market, never of the digits a
  price string happens to have. `getChartSymbolInfo` derives `pricescale` and
  `variable_tick_size` from `szDecimals` and the market kind under
  Hyperliquid's tick rules (`apps/terminal/src/lib/chart/price-format.ts`).
  `variable_tick_size` gives every value the decimals of its rounding to five
  significant figures, so a price crossing a power of ten never rebuilds the
  widget. `pricescale` is the band of the reference price: it does not format
  values in the default price format, but it sets the smallest price-axis step
  and the drawing price step, and TradingView caches it per symbol for the
  widget's lifetime. `docs/adr/0035-chart-price-precision-from-market-rules.md`
  owns the band limits and the tradeoffs. The limits rely on the vendored library
  giving a price equal to a band limit that band's tick, which unit tests can
  only mirror: re-check after every library upgrade with
  `node apps/terminal/tests/browser/chart-price-format-probe.mjs <origin>`.
- Candle history goes through `apps/terminal/src/lib/chart/candle-gate.ts`, the
  only gate for `candleSnapshot`. It is keyed per network, shares identical
  in-flight requests, and backs off only on HTTP 429 (`Retry-After`, otherwise
  10 to 60 seconds, never under one second), with a single probe request while
  the gate is half open. Keep the three invariants of the 2026-08-20
  rate-limit fix: a consumer never aborts the shared HTTP request (a sent
  request counts against the limit anyway); closing and reopening the gate go
  through the episode guard, so a late response from an earlier rate-limit
  episode cannot reopen or re-escalate a newer one; failures other than 429
  never enter the cooldown. Recovery is event-driven: the chart re-arms a
  pending data reset and lifecycle or gate events flush it; there is no retry
  timer, so a non-429 failure followed by no event is not retried. Not built:
  a cooldown shared across tabs, scheduling for all info requests, and a
  backend proxy. `candle-gate.test.ts` and `chart-datafeed.test.ts` pin the
  behavior.
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
- `apps/terminal/src/lib/chart/price-format.ts`
- `apps/terminal/src/lib/chart/candle-gate.ts`
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
- Subscription staleness is measured on the local monotonic clock
  ([ADR 0022](adr/0022-subscription-staleness-monotonic-clock.md)). Every frame
  carries two receipt times (`FrameReceipt` in
  `internal/websocket/frame-receipt.ts`): the wall-clock `receivedAt`, which the
  store exposes as `lastMessageAt`, and a `performance.now()` receipt, which it
  exposes as `monotonicLastMessageAt`. The watchdog, the commit of a value
  buffered while the page was hidden, the foreground-resume expiry, the socket
  inactivity check (`transport-monitor.ts`) and the five-second wait of the
  incremental `l2` gate (`subscriptions/l2-subscription-gate.ts`) all use
  `getReceiptAgeMs`, the larger of the monotonic and the wall-clock age.
  Setting the system clock back therefore cannot keep a silent stream fresh,
  while a forward jump, or a device sleep that `performance.now()` may not
  count, still ages the data as it did before. A negative wall-clock age on its
  own is not stale: otherwise setting the clock back would mark every periodic
  stream that has not received a frame since then stale on the next check, and
  several at once reconnect the shared socket. Thresholds, keys and recovery
  paths are unchanged.
- A transport that hands over a frame it received earlier (the order-book pool
  replay) passes both receipt times through `markFrameReceivedAt`, and throttled
  delivery (`createThrottledUpdater`) measures the time since its last delivery
  with the same `getReceiptAgeMs`, so setting the clock back neither holds a
  throttled stream back nor makes a late frame look new, and a forward jump or a
  sleep still releases the next frame at once.
- `lastMessageAt` stays wall-clock for display and for consumers that compare it
  with `Date.now()`. Those consumers must treat a negative age as not fresh, as
  the execution guards in `domain/trade/market-price.ts`,
  `domain/trade/funds-execution-guard.ts`, `domain/trade/order/reduce-only.ts`
  and `domain/trade/order/liquidation.ts` do. Never compare `lastMessageAt` with
  `performance.now()`.
- To decide whether a frame arrived after a local event, compare
  `monotonicLastMessageAt` with a `performance.now()` reading taken at that
  event in the same document, and nothing else. Order and TWAP reconciliation
  record `monotonicRequestStartedAt`, `monotonicConfirmationStartedAt` and
  `monotonicUnconfirmedAt` next to the wall-clock fields and order snapshots
  with `wasReceivedAfter` (`stores/use-pending-trading-action-store.ts`). Do not
  take the larger of the two clocks for ordering: a snapshot received before a
  request would still count as newer after the clock was set back. Durations,
  such as the 15-second trading-action confirmation timeout, use the larger of
  the two ages. Never persist a monotonic reading or pass it to another tab.
- Timestamps written to storage or shared between tabs (pending order and TWAP
  submissions with their `nextCheckAt` backoff, and order-asset reservations)
  stay wall-clock, because `performance.now()` restarts in every document. After
  the clock is set back, their confirmation windows and reservations extend
  until a WebSocket result arrives or the wall clock catches up; they never
  confirm early ([ADR 0022](adr/0022-subscription-staleness-monotonic-clock.md)).
- Recovery starts when the page returns to the foreground or the network
  returns, not on the next timer ([ADR 0050](adr/0050-websocket-recovery-on-resume.md)).
  A phone suspends a hidden page, so timers stop and a connection can be closed,
  dead without a close event, or sleeping out a backoff; while the data is stale
  the page shows placeholders, so every second of recovery is a second without
  data. Four rules, each with its own owner:
  - `transport-monitor.ts` (the shared socket): a socket that is not open has its
    backoff skipped; an open socket that has been silent for the inactivity
    threshold is replaced at once; any other open socket is sent a heartbeat and
    replaced only if no frame arrives within `resumeProbeTimeoutMs`. A socket
    that keeps receiving frames is never replaced because the page became
    visible: a desktop tab switch must not reset every stream and the chart.
  - `store.ts`: a subscription waiting out its retry backoff or its cooldown
    retries at once, and its failure count starts over, as it does when a
    cooldown ends: a retry that fails backs off from the first delay instead of
    opening a new cooldown. The waits still apply between attempts while the
    page stays visible. A store that attaches while the page is hidden records
    that state, so it flushes its buffer when the page first becomes visible.
  - `l2-book-transport-pool.ts`: a pooled order-book transport that has received
    no `l2Book` frame for its stream's staleness threshold is closed, and its
    consumers subscribe again on a new connection inside the pool's connection
    budget. An `l2Book` frame for any coin on the connection counts; heartbeat
    answers and subscription confirmations do not.
  - `patches/@nktkas__rews@4.1.0.patch`: `reconnect()` and `close()` do not wait
    for the old socket's `close` event, which Chromium fires for a half-open
    connection only after sixty seconds. Never add a path that waits for a
    browser `close` event before opening a replacement.
  `apps/terminal/tests/browser/websocket-half-open-probe.mjs` measures both in
  real engines. Re-run it, and `websocket-half-open-reconnect.test.ts`, when
  `@nktkas/rews` or the SDK changes: the patch is pinned to rews 4.1.0, and pnpm
  refuses to install when it no longer applies.

### Important Files

- `packages/hl-react/src/internal/websocket/*`
- `packages/hl-react/src/store.ts`
- `packages/hl-react/src/subscriptions/l2-book-transport-pool.ts`
- `patches/@nktkas__rews@4.1.0.patch`
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
  (`lib/mobile-sync/sync-core.ts`, version 5), bound to one network, one owner
  and a 2-minute window. The phone parses it before its first paint, removes
  it from the address bar with `history.replaceState`, verifies the approval
  once through `extraAgents` and imports only on an explicit tap; a reload
  after the scrub asks for a new scan. The retired `/mobile-agent-sync-ticket`
  path answers 404 everywhere and must not be reintroduced. By the
  operator decision of 2026-10-11 (all three release gates open by default)
  production builds from release p30 onward set the single
  `VITE_MOBILE_PAIRING_ENABLED` build flag on; the live `build-meta.json` and
  the release records say what is shipped, and the checklist in
  `docs/mobile-phone-access-device-validation.md` is still to be run and
  recorded against a published build.
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
- The PWA manifest `theme_color` and `background_color` stay on the terminal
  dark canvas (`#0F1A1F`): a manifest holds one value and cannot follow the
  in-app theme setting. The browser `<meta name="theme-color">` follows the
  applied theme instead: `#0F1A1F` (dark `--bg-base`) or `#FFFFFF` (light
  `--bg-base`, the header surface), from `brand.json` `pwa.themeColor` and
  `pwa.lightThemeColor` through `lib/theme-color.ts`. The theme is chosen in
  Settings, not by the OS, so a `media` attribute cannot express it. Three
  writers share that module: the head bootstrap script sets the class and the
  meta from one read before first paint; `applyThemeClass` sets both on every
  theme change and every `<html>` class mutation, syncing the meta before its
  early return; and the root route's `head()` derives the content from the
  `<html>` theme class. TanStack runs `head()` again in the browser before
  hydration, and React 19 claims an existing `<meta>` only when its `content`
  matches, so a `head()` value that differs from the bootstrap's would append
  a second, stale tag. `pwa-manifest.test.ts` pins both literals against each
  theme's `--bg-base`; `theme-bootstrap.test.ts` and
  `theme-document-sync.test.tsx` cover the bootstrap, the hydration value and
  the store. The logo kit's icon background `#0A3038` only fills the icons
  themselves.
- Install icons come from `brand/web` through `pnpm brand:sync`
  ([brand assets](brand-assets.md)): `favicon.ico` carries the kit's 16, 32
  and 48 px frames and is declared as such in the manifest and the head;
  `icon-maskable-192.png` and `icon.svg` are derived from the kit geometry by
  `pnpm brand:derive-icons`. The manifest keeps `"id": "/"`, relative icon
  paths and no `lang`, because the interface language changes at runtime.
- Installation support does not imply offline navigation support. Do not
  advertise the terminal as offline-capable unless the service worker gains a
  tested application-shell/navigation strategy.
- The service worker swaps the cached application shell only after every
  startup asset the new shell references is stored
  ([ADR 0051](adr/0051-service-worker-startup-asset-cache.md)): same-origin
  immutable `/assets/` files are answered cache-first from the versioned asset
  cache, a navigation's background refresh prefetches the new shell's preloads,
  stylesheets, scripts and the two surface `<meta>` lists before replacing the
  shell, and any failure, time-out or storage error keeps the previous shell.
  A release switch keeps only the assets of the new and the previous shell.
  The worker does not precache the whole build, does not intercept the
  TradingView files, and keeps the navigation bypass list, the `?lang=`
  network-first rule and the cacheable-shell checks. A font or asset response
  is cloned before it is handed to the page, never afterwards. The current
  cache names, limits and the release-switch probe live in the ADR.

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
- `apps/terminal/src/lib/tests/sw-asset-cache.test.ts`
- `apps/terminal/src/lib/tests/chart-asset-cache-policy.test.ts`
- `apps/terminal/tests/browser/sw-release-switch-probe.mjs` (real engines,
  run from a normal shell; not part of CI)

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
`UserMenu` reads no pairing flag, so the fixture's Vite configuration pins
`VITE_MOBILE_PAIRING_ENABLED` to `"true"` through `define` and the test checks
that premise before asserting that the recovered account menu lists no Link
mobile device item (§8); the shell environment cannot change that premise. At
desktop width the test opens the single dialog `UserMenu` hosts the way the
header QR icon does (warm the chunk, ignoring a failed preload, then open the
modal store); the icon's own visibility rule belongs to `top-nav.test.tsx`,
because the fixture renders no `TopNav`.

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

The connected header fixture uses the sibling cache `node_modules/.vite-top-nav-connected`
and serves its page from memory (`/top-nav-connected.html`), so the shared optimizer's
`**/*.html` scan never reaches its TopNav graph. Run it with
`pnpm --dir apps/terminal test:browser:top-nav-connected`; `TOP_NAV_CONNECTED_MATRIX=full`
measures every locale, session, deposit and pairing state, and `TOP_NAV_CONNECTED_OUT`
chooses where its JSONL measurements go. It mounts the real `TopNav`, `UserMenu`, deposit
availability, catalogs and stylesheet; the wallet session, geo verdict, pairing flag and
modals are stubs, and nothing signs. The shared config excludes `top-nav-connected.pw.ts`;
the regression matrix runs in both CI browser shards.

The brand surface fixture uses the sibling cache `node_modules/.vite-brand-surfaces` and also
serves its page from memory (`/brand-surfaces.html`). Run it with
`pnpm --dir apps/terminal test:browser:brand-surfaces`; `BRAND_SURFACES_ENGINES=webkit,firefox`
adds WebKit and Firefox locally (`BRAND_SURFACES_FIREFOX` must point at an installed Firefox
executable; nothing is downloaded), and `BRAND_SURFACES_OUT` keeps its screenshots. It renders the
real logo, chart loader, status glyphs, motions, button indicator and Sonner icons in both themes
and compares computed fills with the terminal tokens and the running animations with reduced
motion on and off. The shared config excludes `brand-surfaces.pw.ts`; CI runs it in Chromium in
both browser shards.

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
  As in the official drawer, neither drawer group shows a visible heading: a full-width divider
  starts the More section, whose `nav` keeps the accessible name `More` (`mobile-nav-drawer` pins
  this). The drawer's hidden `Navigation` title stays as the dialog's accessible name.
  `lib/navigation/desktop-nav.ts` derives the top-level list and the More menu with
  `resolveDesktopNavLayout` and the current entry with `isDesktopNavItemActive`; `TopNav` only
  renders that result and mounts one More dropdown.
- Mobile drawer route links preload their destination on an ordinary primary click, close the
  drawer, then navigate only from `onOpenChangeComplete(false)`. Preloading runs concurrently
  and must not gate navigation; never substitute a fixed animation timeout. Keep native modified
  clicks, new-tab links and external destinations intact, including Trade's search parameters.
  Reopening, explicit cancellation, another navigation or unmount invalidates the queued target;
  one close completion can consume it only once. This keeps the route-owned drawer mounted through
  its exit without moving the shared header/provider hierarchy. A persistent route-independent
  drawer is a larger alternative, not required for this behavior. Verify actual Router links,
  duplicate/cancelled completions and a browser transition at the reported 946 × 891 viewport;
  mocked Drawer tests alone cannot prove exit animation continuity.
- Breakpoints are named in `config/layout.ts`: `DESKTOP_NAV_COMPACT_MAX_PX` (1379; 1181 until
  the connected header was measured, ADR 0013 addendum 2026-10-01) and
  `DESKTOP_NAV_NARROW_MAX_PX` (1150; 1100 until Earn became a top-level link, ADR 0021 D8). The `nav-compact` Tailwind variant in `styles.css` must equal
  the compact constant (`desktop-nav-layout` pins it); never write a literal `max-[…px]` for it.
- An unavailable deposit button (for any reason: region restricted or still unresolved, or the
  deposit path disabled for the wallet or network) shows only its icon, centred, at every desktop
  width, with the unavailable label as its accessible name and the reason as its title; an
  available one keeps its `Deposit` label above the compact width. The
  unavailable labels are 39–80px longer than `Deposit`, and a visible label that differs from the
  accessible name would fail WCAG 2.5.3.
- Above the compact width every connected combination must keep 16px between the navigation and
  the wallet controls; `tests/browser/top-nav-connected.pw.ts` measures it. Re-run the full matrix
  before adding a locale, lengthening a header label, adding a header control or widening the
  account chip.
- Collapse rule: at or below the compact width a Soon placeholder (none today; Earn links to `/earn`
  since ADR 0021) leaves the top level and appears disabled in More; the lower entries move into More when the account chip is visible at the compact
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
- Evidence after Earn became a top-level link (2026-09-27, local dev server, disconnected, `/earn`):
  at 1101px without collapsing the gap is en 124px, zh 237px, hi 243px, es 50px, fr 6px, ar 146px,
  so the narrow width moved to 1150px; at 1151px fr keeps 56px and es 100px, at 1001px (collapsed)
  fr keeps 226px. The connected header was not measured.
- Evidence after the Sairn logo moved to the logo kit's 24px minimum (2026-10-01, local dev server,
  disconnected, `/earn`; each width loaded fresh, because the in-app browser's viewport emulation
  does not deliver media-query change events to an open page): the desktop lockup is 90.5px wide
  (81.4px before). en 1182px 154px, 1151px 165px, 1150px (collapsed) 467px, 1001px 318px;
  fr 1182px 29px, 1151px 47px (56px before), 1001px 217px; es 1182px 76px, 1151px 91px (100px
  before). zh, hi and ar were not re-measured. The connected header is still unmeasured: at 1182px
  French leaves 29px for any extra width of the deposit button and account chip over
  `Connecter le portefeuille` (183px).
- Evidence for the connected header before the fix (2026-10-01, fixture
  `tests/browser/top-nav-connected.*` mounting the real `TopNav` and `UserMenu` with a stubbed
  wallet session, local Vite dev server, Chrome 154 on macOS, each width loaded fresh; its
  disconnected calibration reproduced the figures above within 0.5px). With an external wallet
  (`0x8a3f...1d3e`), `Deposit` available and pairing off, the gap at 1182px was en 55px, zh 180px,
  hi 199px, es −36px, fr −34px, ar 104px: in Spanish and French the deposit button covered More,
  and a hit test at the centre of More landed on the deposit button. A long ENS name or e-mail
  (capped at 11rem) added 65–92px, `Deposit unavailable` 39–80px and the Link mobile device icon
  44px; Settings was pushed out of the viewport in 27 of 72 combinations at 1182px. Above the
  compact width the gap changes by exactly one pixel per viewport pixel. WebKit 26.4 and
  Firefox 140 agreed within 0.2px.
- Evidence after the fix (2026-10-01, same fixture and browser). A first full matrix with the
  compact width at 1369px (804 measurements: six locales, address/ENS/e-mail, deposit
  available/unavailable, pairing on/off, ten widths, plus English and French in the light theme)
  showed the widest connected case (es, e-mail, `Deposit`, pairing on) keeping 16.3px at 1370px,
  so the compact width moved to 1379px for 10px of headroom. The full matrix was then re-run at
  1379px with the icon-only button centred (all 75 tests passed, 804 measurements, none
  overlapping, wrapping or off screen): the widest connected case keeps 26.3px at 1380px (es) and
  28px (fr); at the compact width and below every connected case keeps at least 294px (fr,
  1001px); the icon-only deposit button is centred in all 660 icon-only measurements. The
  disconnected header gains the compact language trigger from 1379px down: fr keeps 78px at
  1182px (29px before) and 47px at 1151px (unchanged), es 122px and 91px. Windows fonts, real
  devices and a real-wallet session were not measured.

### Important Files

- `apps/terminal/src/config/desktop-nav.ts`
- `apps/terminal/src/config/layout.ts`
- `apps/terminal/src/lib/navigation/desktop-nav.ts`
- `apps/terminal/src/components/trade/header/top-nav.tsx`
- `apps/terminal/src/lib/tests/desktop-nav-layout.test.ts`
- `apps/terminal/tests/browser/top-nav-connected.pw.ts`
- `apps/terminal/src/components/trade/mobile/mobile-nav-drawer.tsx`
- `apps/terminal/src/lib/tests/mobile-nav-drawer.test.tsx`
- `apps/terminal/src/lib/tests/mobile-nav-drawer-navigation.test.tsx`
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
7. For terminal-facing changes, run `pnpm --filter @sairn/terminal build`.
8. Keep generated or unrelated files out of the commit.

## Known Anti-Patterns

- Deleting a local Agent key during transient signer restoration instead of on explicit disconnect, reset, revocation or rotation.
- Falling back from trading actions to wallet signatures.
- Passing display symbols directly to Hyperliquid candle/orderbook APIs.
- Recreating TradingView because of theme, locale, tab, or small layout changes.
- Treating builder-deployed perp dex state as default perp state.
- Showing spot USDC totals as perp withdrawable funds.
- Clearing mobile orderbook/chart to an empty skeleton during ordinary symbol
  switches.
- Hiding mobile UI state behind full route reloads.
- Waiting for a timer, a backoff or a dead socket's `close` event before
  recovering market data after the page or the network returns.
- Reconnecting a socket that still receives frames because the tab became
  visible.
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
