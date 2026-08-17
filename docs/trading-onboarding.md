# First-Time Trading Onboarding

This document is the canonical runtime contract for the first-time trading
flow. Keep it aligned with the terminal implementation and its regression
tests whenever wallet connection, legal status, Agent registration, balance
loading, or deposit behavior changes.

## Official References

- [How to start trading](https://hyperliquid.gitbook.io/hyperliquid-docs/onboarding/how-to-start-trading)
- [Exchange endpoint (`approveAgent` and `approveBuilderFee`)](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)
- [Nonces and API wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets)
- [Builder codes](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes)
- [Bridge2](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/bridge2)
- [nktkas SDK `usdcRouting`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/info/_methods/usdcRouting.ts)
- [Circle: Transfer USDC from Arbitrum to HyperCore](https://developers.circle.com/cctp/howtos/transfer-usdc-from-arbitrum-to-hypercore)
- [Circle: Transfer USDC with CctpExtensionV2](https://developers.circle.com/cctp/howtos/transfer-usdc-from-arbitrum-to-hypercore-with-cctp-extension-v2)
- [Circle: CCTP-enabled HyperCore transfers](https://developers.circle.com/cctp/concepts/cctp-on-hypercore)
- [Circle: USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [Privy React setup](https://docs.privy.io/basics/react/setup)
- [Privy connected-wallet lifecycle](https://docs.privy.io/wallets/wallets/get-a-wallet/get-connected-wallet)

## Required Sequence

The terminal must preserve this ordering:

1. **Connect and authenticate the owner wallet.** Privy or the selected wallet
   provider owns the wallet connection and authentication prompts.
2. **Verify legal status.** Query Hyperliquid `legalCheck` for the selected
   owner. Unknown, failed, or restricted responses fail closed and must not
   fall through to trading setup.
3. **Accept required policies.** The blocking legal dialog requires both
   policy acknowledgements. Acceptance signs and submits Hyperliquid's
   `acceptTerms2` request, then re-queries `legalCheck` before continuing.
4. **Establish the trading connection.** Only a completed `extraAgents`
   response may establish that no locally available Agent is approved for
   this exact owner and environment. Loading, refreshing, absent, and failed
   responses remain non-definitive and must not trigger `approveAgent`. Agent
   registration is separate from builder-fee approval.
5. **Verify the new Agent.** Persist the generated Agent key only in the
   selected storage scope, refetch the server-side Agent status, and confirm
   the freshly generated public address and deployment-scoped Agent name
   before reporting success.
6. **Classify account funding.** Wait for both the complete all-DEX perpetual
   snapshot and the spot-state snapshot. Any positive perpetual account value
   or spot balance means funded. Missing or failed snapshots never mean empty.
7. **Guide an empty account to deposit.** Open the deposit dialog only after
   both snapshots definitively establish that the account is empty. Enabling
   a deposit first requires the shared capability decision to classify the
   authenticated owner's exact wallet path as external-wallet or sponsored
   embedded-wallet. It then requires that exact path's independent environment
   release flag and a completed, unrestricted geo verdict. The external path
   also requires its exact owner signer to be ready. An eligible authenticated
   email session may open the modal before its embedded signer is activated so
   the modal can create or activate that exact wallet, but it must not reveal a
   funding address before readiness succeeds. Any other unavailable capability
   must not open a dead-end deposit dialog. A successful, runtime-validated
   `usdcRouting` response is also required for the active environment. New
   deposits are CCTP-only: an exact, fresh `depositRoute === "cctp"` is
   required. A `bridge` response pauses deposits and must not reactivate
   retired manual or automatic Bridge2 submission. A connected external wallet
   may use Circle's self-submitted `CctpExtension` flow after dynamic fee and
   Fast Transfer allowance checks. An email wallet may sign for
   `CctpExtensionV2`, with the configured Privy Smart Wallet and Arbitrum
   paymaster/bundler sponsoring submission. Before exposing its real funding
   address, the UI read-only preflights the exact embedded wallet's Smart Wallet
   client, target Arbitrum chain, and paymaster. Execution repeats those checks;
   the preflight does not prove paymaster policy, quota, or end-to-end success.
   Loading, failed, or malformed routing or geo data never permits submission.
8. **Approve the builder fee when needed for an action.** Do not add this
   signature to first-time Agent setup. `useTradingAuthorization` requests it
   before the first action that needs the configured builder code.

The legal gate has priority over Agent setup and ordinary global dialogs. A
required HIP-3 deployer disclaimer retains priority over ordinary dialogs once
legal and Agent onboarding are complete.

## Stay Connected

`Stay Connected` controls only the storage lifetime of the generated Agent
private key. It does not change the owner wallet or Agent permissions.

| Choice | Agent key storage | Lifetime |
|---|---|---|
| Unchecked (default) | `sessionStorage` | Current browser tab/session |
| Checked | `localStorage` | Across restarts of this browser and origin until reset/revocation |

The preference is stored under
`hyperliquid.persist_trading_connection`. Agent records remain keyed by
environment and lowercase owner address:
`hyperliquid_agent_{env}_{owner}`. A session record takes precedence over a
persistent record for that identity. Invalid higher-priority data fails closed
instead of falling back to stale data, and reads never cross owners or
environments.

The persistent choice does not synchronize an Agent private key between
origins, browser profiles, or devices. The owner Smart Wallet authorizes the
Agent but cannot reconstruct its locally generated private key. Runtime
verification must therefore match both the stored public key and the exact
deployment Agent name returned by `extraAgents`.

Hyperliquid deregisters an existing named Agent when another `approveAgent`
uses the same name. Production reserves `gatu`; local development defaults to
`gatu-dev`. A mainnet preview or staging build must set its own stable
`VITE_HYPERLIQUID_AGENT_NAME` (maximum 16 characters) and must not reuse the
production slot. Names are finite deployment slots, not random per-session
identifiers, because an account supports only three named Agents.

Both the onboarding dialog and direct trading-action authorization must honor
the same preference. A future entry point must not call Agent registration
with an implicit persistent default.

## Mobile Wallet Lifecycle

External mobile wallets commonly background the browser while the wallet app
is open. Wallet-approval timeouts must pause while the document is hidden and
resume only when it becomes visible. A late wallet result may complete only
while the original owner, registration epoch, and generated Agent still match.
Wallet changes and stale registration epochs fail closed and remove the
unverified local key.

Wallet-backed sessions wait for both Privy's authentication readiness and
`useWallets().ready`. Linked wallet metadata proves ownership but does not make
an embedded or external wallet available for signing; the exact wallet must
also be present in Privy's connected-wallet directory and active in Wagmi.
While the exact signer is being restored, trading remains disconnected and
must not fall back to a different wallet or a persisted agent-only owner. This
transient state also must not delete the last confirmed owner's Agent. Agent
cleanup belongs to verified explicit logout, confirmed owner replacement, or
an explicit security reset.

## State Boundaries

- Wallet connection, legal acceptance, Agent approval, local Agent key,
  builder-fee approval, and account funding are separate states.
- Agent/API wallet keys can trade but cannot withdraw. Withdrawals and other
  user-signed actions continue to require the matching owner wallet.
- A legal-status error is not equivalent to unaccepted terms.
- A balance-loading or balance-error state is not equivalent to an empty
  account.
- A successful `approveAgent` response is not enough by itself; post-write
  storage and server verification of the newly generated public address are
  required. Verification failure must not report onboarding success. A key
  whose approval write succeeded but cannot yet be confirmed remains stored
  but inert; only a later successful exact-address check may make it usable.
- An `extraAgents` error, absent response, or cached miss being refreshed is
  not proof that an Agent is missing and must not open the automatic prompt.
- Keep that verification state separate from action-level loading UI. An
  initial Agent query may block the action, but background revalidation must
  not repeatedly disable the explicit Enable Trading entry; registration
  still refetches the definitive status before requesting a signature.
- Closing the automatic Agent prompt is remembered by environment and owner
  for the current SPA session. A verified ready state clears that dismissal;
  an explicit user request always remains available.
- Builder-fee approval must not be coupled back into `useAgentRegistration`.
- `usdcRouting` is the sole source of truth for deposit and withdrawal routes.
  Route cache and requests remain isolated by environment, and the route must
  be fetched again immediately before a signature or submission.
- A route change between review and submission aborts the action and requires
  renewed review. A routing error never falls back to another protocol.
- The manual and automatic Bridge2 paths are retired for new deposits. Keep
  existing history/recovery and independent `withdraw3` withdrawal behavior,
  but a `bridge` route never permits a new Bridge2 signature or submission.
- External CCTP deposits use route-specific Circle native USDC, EIP-3009,
  current fees and allowance, the official forwarder hook, strict receipt
  validation, and source-hash recovery. Sponsored email deposits additionally
  use `CctpExtensionV2`, a deterministic deposit-bound `authNonce`, and the
  Privy Smart Wallet/paymaster submission path. Recovery validates the exact
  V2 event by owner, amount, and nonce; it does not infer the owner from the
  account-abstraction outer transaction.
- Every deposit surface uses the shared exact-wallet capability decision.
  Wallet path, environment-specific release flag, and resolved geo verdict are
  independent gates; a state that fails any gate is unavailable and must not
  open the deposit modal from onboarding, desktop, mobile, portfolio, or empty
  balance views. External paths also require the exact owner signer to be
  ready. Eligible authenticated email paths may enter the modal before signer
  activation only because that modal creates or activates the exact embedded
  wallet and continues to hide its funding address until readiness succeeds.
- Sponsored-email funding addresses remain hidden until the exact embedded
  wallet can construct a Smart Wallet client for the target Arbitrum chain and
  exposes a configured paymaster. This read-only check does not establish
  ZeroDev selector policy, quota capacity, or funded end-to-end correctness.
- After acquiring the per-owner funds-action lock and before requesting a
  deposit signature, refetch geo and fail closed on provider failure, timeout,
  invalid or incomplete IPdata data, proxy signals, or a restricted verdict.
  IPdata parsing is strict; region-scoped countries such as Canada do not pass
  without a valid region.
- Account-mode changes and mode-dependent funds actions acquire one Web Lock
  scoped by Hyperliquid environment and owner. The lock is held until the SDK
  request settles. Lock acquisition times out after ten seconds; an acquired
  action is never aborted by that waiting timeout.

## Implementation Map

| Responsibility | Primary implementation |
|---|---|
| Privy/Wagmi wallet readiness | `apps/terminal/src/hooks/wallet/use-wallet-session.ts` |
| Wallet/agent-only identity bridge | `apps/terminal/src/providers/root.tsx`, `packages/hl-react/src/provider.tsx` |
| Legal API contract | `packages/hl-react/src/legal.ts` |
| Legal query and acceptance hooks | `packages/hl-react/src/signing/use-legal-status.ts`, `use-terms-acceptance.ts` |
| Legal UI state | `apps/terminal/src/hooks/trade/use-legal-gate.ts` |
| Blocking policy dialog | `apps/terminal/src/components/trade/components/legal-acceptance-modal.tsx` |
| Agent storage and preference | `packages/hl-react/src/signing/agent-storage.ts` |
| Agent registration | `packages/hl-react/src/signing/use-agent-registration.ts` |
| Builder-fee approval | `packages/hl-react/src/signing/use-builder-fee-approval.ts` |
| Action authorization | `packages/hl-react/src/signing/use-trading-authorization.ts` |
| Funding-state derivation | `apps/terminal/src/domain/trade/onboarding.ts` |
| Deposit capability derivation | `apps/terminal/src/domain/trade/deposit-availability.ts`, `apps/terminal/src/hooks/trade/use-deposit-availability.ts` |
| Geo parsing and fail-closed query | `apps/terminal/src/lib/geo/ipdata-geo.ts`, `get-geo.ts`, `apps/terminal/src/hooks/use-geo-restriction.ts` |
| USDC routing validation | `apps/terminal/src/domain/trade/usdc-routing.ts` |
| USDC routing query and pre-submit guard | `apps/terminal/src/hooks/trade/use-usdc-routing.ts` |
| Runtime flow orchestration | `apps/terminal/src/components/trade/components/trading-onboarding-gate.tsx` |
| Manual deposit and withdrawal surface | `apps/terminal/src/components/trade/tradebox/deposit-modal.tsx` |
| Circle CCTP construction and recovery | `apps/terminal/src/lib/trade/cctp-deposit.ts`, `cctp-deposit-tracking.ts` |
| Cross-tab funds serialization | `packages/hl-react/src/internal/exchange/funds-action-lock.ts` |
| Automatic embedded-wallet deposit | `apps/terminal/src/components/trade/tradebox/embedded-deposit-auto-bridge.tsx` |
| Session-scoped prompt dismissal | `apps/terminal/src/stores/use-trading-onboarding-store.ts` |
| Modal precedence | `apps/terminal/src/components/trade/components/global-modals.tsx` |

## Regression Checklist

At minimum, changes to this flow must cover:

- legal status: inactive, checking, required, submitting, blocked, error, and
  accepted;
- both policy checkboxes and the non-dismissible blocking dialog;
- an existing approved Agent without a redundant signature;
- new Agent verification using the newly generated address;
- Agent status errors, unknown results, and cached misses during refresh;
- session-only and persistent Agent storage;
- temporary signer loss and restoration, confirmed wallet changes, explicit
  logout, duplicate registration, timeout, and background/foreground transitions;
- funded, empty, loading, and failed account snapshots;
- external and embedded wallet-path classification, each environment release
  flag, disconnected and Agent-only external sessions, authenticated email
  sessions awaiting exact embedded-wallet activation, restricted geo, and
  unresolved geo across every desktop, mobile, portfolio, and onboarding
  deposit entry;
- `usdcRouting` loading, error, malformed, `cctp`, and `bridge` responses in
  both mainnet and testnet query scopes;
- a route change immediately before deposit or withdrawal aborting without a
  signature or submission and requiring renewed review;
- manual and automatic Bridge2 paths remaining blocked for new deposits in
  every routing state, with no CCTP-to-Bridge2 fallback, while existing
  Bridge2 recovery and independent `withdraw3` withdrawals remain available;
- external CCTP fee/allowance changes, testnet mainnet-state and 1,000-USDC
  gates, receipt mismatch, and recovery after refresh;
- sponsored CCTP exact-wallet activation, deterministic nonce binding,
  environment gates, address-hiding Smart Wallet/chain/paymaster readiness,
  paymaster failure, success/skipped event discrimination, account-abstraction
  outer transaction shape, and refresh recovery;
- a fresh geo refetch occurring inside the funds lock before signature, with
  IPdata timeout, provider error, malformed response, proxy signals, and Canada
  without a region all failing closed;
- same-owner funds actions serializing across tabs until the first SDK promise
  settles, with unavailable Web Locks and bounded acquisition waits failing
  closed;
- builder-fee approval remaining separate from Agent registration;
- desktop and mobile modal presentation.

Production deployment preflight validation also requires a non-empty, unquoted
`IPDATA_API_KEY`. Configure and rotate it in the runtime secret store; never
commit, log, or expose its value through a `VITE_` client variable.
