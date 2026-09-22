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
- [Privy authentication tokens and session restoration](https://docs.privy.io/authentication/user-authentication/tokens)
- [Privy login callbacks](https://docs.privy.io/authentication/user-authentication/ui-component)
- [Privy embedded-wallet confirmation UI](https://docs.privy.io/recipes/react/manage-wallet-UIs)
- [TanStack Query `useQuery` status contract](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery)
- [TanStack Query focus refetching](https://tanstack.com/query/latest/docs/framework/react/guides/window-focus-refetching)
- [WebKit page cache lifecycle](https://webkit.org/blog/516/webkit-page-cache-ii-the-unload-event/)

Hyperliquid's public API documentation does not currently describe
`legalCheck` or `acceptTerms2`. The pinned SDK exposes `legalCheck`, while the
application maintains the typed `acceptTerms2` adapter. Treat both as a
version-locked frontend contract: validate every response strictly, fail
closed on unknown restriction codes or schema changes, and run contract
checks whenever the SDK is upgraded.

## Required Sequence

The terminal must preserve this ordering:

1. **Connect and authenticate the owner wallet.** Privy or the selected wallet
   provider owns the wallet connection and authentication prompts.
2. **Verify legal status.** Query Hyperliquid `legalCheck` for the selected
   owner. Unknown, failed, or restricted responses fail closed and must not
   fall through to trading setup. The dialog is presentation only: every
   `ExchangeClient` write revalidates the exact master owner at the shared SDK
   execution boundary, including Agent-only sessions and direct embedded-wallet
   Agent approval.
3. **Accept required policies.** The blocking legal dialog requires both
   policy acknowledgements. Acceptance signs and submits Hyperliquid's
   `acceptTerms2` request, then re-queries `legalCheck` before continuing.
   Email sessions sign through Privy's exact embedded-wallet address after the
   application policy review, with the duplicate per-call confirmation UI hidden.
   Identity and environment are rechecked
   before signing, after signing, after server confirmation, and before the
   legal cache is updated.
4. **Select the trading signer.** An authenticated email session uses its exact
   active Privy embedded owner wallet directly for L1 trading and user-signed
   actions. It does not create or approve a local Agent for ordinary trading,
   and Agent storage or `extraAgents` availability cannot authorize or block
   that signer. Missing or mismatched embedded wallets fail closed without
   falling back to a connected wallet or stored Agent. External wallets and
   Agent-only sessions retain the Agent flow below.

   **Establish an external-wallet trading connection.** A user must explicitly invoke
   **Enable Trading** before the connection dialog is presented. Only a
   completed `extraAgents` response may establish that no locally available
   Agent is approved for this exact owner and environment. Loading, refreshing,
   absent, and failed responses remain non-definitive and must not trigger
   `approveAgent`. This onboarding dialog applies to external-wallet trading.
   Explicit API-wallet management and desktop linking remain separate
   owner-approved operations. An embedded wallet may hide a duplicate Privy
   confirmation only when that entry point already completed its own application
   permission review; other Agent approvals retain confirmation by default.
   Page load and status checks never sign. Agent registration is separate from
   builder-fee approval.
5. **Verify a requested new Agent (external-wallet flow).** Before opening the
   wallet signing request, persist
   the generated key in the selected storage scope as approval-pending and
   therefore unverified. Refetch the server-side Agent status after approval,
   confirm the exact generated public address and deployment-scoped Agent name,
   and only then clear the pending marker and report success.
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

The legal gate has priority over signer readiness, Agent setup and trading or
funds dialogs. Preference-only dialogs, including Settings and the command
menu, remain available while legal status is being checked; they do not grant
any trading or signing capability. A required HIP-3 deployer disclaimer retains
priority over ordinary trading dialogs once legal review and signer setup are
complete.

## Stay Connected

Email sessions use Privy authentication persistence and do not show the Agent
connection dialog or generate a trading key. Existing locally stored Agents are
not selected by an email session. Explicit API-wallet management and desktop
linking remain separate owner-approved operations with real Agent verification.

`Stay connected in this browser` controls only the storage lifetime of the
generated Agent private key. It does not change the owner wallet or Agent
permissions.

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
origins (including a different host or port), browser profiles, or devices.
The matching owner/master EOA authorizes the Agent but cannot reconstruct its
locally generated private key. Runtime verification must therefore match both
the stored public key and the exact deployment Agent name returned by
`extraAgents`.

Hyperliquid deregisters an existing named Agent when another `approveAgent`
uses the same name. Production reserves `gatu`; local development defaults to
`gatu-dev`. A mainnet preview or staging build must set its own stable
`VITE_HYPERLIQUID_AGENT_NAME` (maximum 16 characters) and must not reuse the
production slot. Names are finite deployment slots, not random per-session
identifiers, because an account supports only three named Agents.
When the expected name points to another public key, the connection dialog
must distinguish a replaced local key from a browser that has no local key.
Both cases warn that reconnecting here will replace the other same-name
connection before requesting approval.

Both the onboarding dialog and direct trading-action authorization must honor
the same preference. A future entry point must not call Agent registration
with an implicit persistent default.

## Mobile Wallet Lifecycle

External mobile wallets commonly background the browser while the wallet app
is open. Wallet-approval timeouts must pause while the document is hidden and
resume only when it becomes visible. A late wallet result may complete only
while the original owner, registration epoch, and generated Agent still match.
Wallet changes and stale registration epochs fail closed. They remove an
unverified key only before the submission boundary; once submission has
started, shared coordination remains under the old owner/environment scope for
later reconciliation. The private key remains only as long as its selected
storage scope; the default session-scoped key can disappear when its tab is
discarded. That mismatch fails closed and requires a user-authorized, verified
trading-connection reset before a replacement Agent can be created.

Wallet-backed signing waits for both `usePrivy().ready` and
`useWallets().ready`. Linked wallet metadata proves ownership but does not make
an embedded or external wallet available for signing; the exact wallet must
also be present in Privy's connected-wallet directory and active in Wagmi.
While the exact signer is being restored, trading remains disconnected and
must not fall back to a different wallet or a persisted agent-only owner. This
transient state also must not delete the last confirmed owner's Agent. Agent
cleanup belongs to verified explicit logout, confirmed owner replacement, or
an explicit security reset for ordinary keys; an uncertain submitted candidate
remains preserved until it can be reconciled or explicitly removed.

Authentication UI uses `usePrivy().ready` separately from signing readiness.
Once authentication is ready, the logged-in identity menu remains accessible
while the wallet directory initializes; an unauthenticated login entry does
not wait for `useWallets().ready`. This does not make a signer ready.

After 30 seconds of unresolved authentication, or unresolved
wallet-directory initialization for an authenticated user, offer an explicit
**Reload page** action; the authenticated menu uses a neutral wallet
indicator until ready. Readiness or identity changes reset the timer. Wallet
reconnection and secure disconnect remain disabled while the wallet
directory is unresolved. This is an application recovery affordance, not a
Privy SDK retry/deadline or a reproduced Hyperliquid timeout. Only the
user's click reloads the page through normal Privy session restoration;
never automatically reload, log out, remount the provider, or mark readiness
complete. Keep raw errors and warning banners hidden, and preserve every
signing, approval and funding gate. See [mobile presentation
rules](mobile-data-presentation.md).

Login intent is recorded only from Privy's public login callback in an
application-owned, `user.id`-bound `sessionStorage` record. Do not read or scan
Privy's private storage keys. A record for another user or an unknown login
method is ignored, and wallet selection still requires the exact address in
Privy's connected-wallet directory.

Legal query data uses a short successful-result TTL. A background refetch
failure may retain the last successful result for read-only presentation, but
it never authorizes a write: the execution guard forces a fresh check after a
failed or paused query. Focus and network reconnect revalidate normally. A
persisted `pageshow` (Safari/iOS BFCache restore) invalidates every in-memory
owner/environment legal query immediately so a wallet event delivered after
resume cannot expose an authorization captured before suspension.
Legal-status queries, pre-submit checks, and terms requests each enforce a
dedicated ten-second deadline without changing the shared HTTP transport;
only network, timeout, 408, 429, and 5xx failures receive bounded retries.

## State Boundaries

- Wallet connection, embedded-owner signer readiness, legal acceptance, Agent approval, local Agent key,
  builder-fee approval, and account funding are separate states.
- Agent/API wallet keys can trade but cannot withdraw. Withdrawals and other
  user-signed actions continue to require the matching owner wallet.
- A legal-status error is not equivalent to unaccepted terms.
- A previous successful legal response is read-only after a refetch failure,
  offline pause, or BFCache invalidation; it must not authorize an Exchange
  write until a new check succeeds.
- A balance-loading or balance-error state is not equivalent to an empty
  account.
- A successful `approveAgent` response is not enough by itself; post-write
  storage and server verification of the newly generated public address are
  required. Verification failure must not report onboarding success. A key
  whose approval write succeeded but cannot yet be confirmed remains stored
  but inert; only a later successful exact-address check may make it usable.
- An `extraAgents` error, absent response, or cached miss being refreshed is
  not proof that an Agent is missing and must not initiate Agent approval.
- Agent-status failures preserve their underlying cause and the registration
  phase. A preflight failure states that no signature was requested; a
  post-approval verification failure warns that approval may already have
  completed. Rate limiting, timeout, service availability, and network errors
  remain distinguishable. A locally persisted `approvalPendingAtMs` marker is
  written before the approval request can be signed. At the signed transport
  boundary, `approvalSubmissionStartedAtMs` is written under the same Web Lock
  that revalidates the exact owner, environment, epoch, and public key, and the
  exchange request starts before that lock is released. This binds a lost
  response, timeout, or later verification failure to the exact candidate, so
  closing the dialog, remounting the route, refreshing, or retrying cannot turn
  an uncertain result into another approval. Any failure before that atomic
  boundary removes the candidate without inferring behavior from error names
  or messages. Cross-tab coordination is stored in `localStorage` as only the
  candidate public address and timestamps; it never contains the private key.
  The private key remains in the selected Agent storage scope. Another tab may
  resume only when it already holds that exact candidate; otherwise it fails
  closed while the attempt is pending. Lock-protected progress by a tab holding
  the exact candidate refreshes the shared activity timestamp. A tab without
  that candidate receives an in-progress result throughout the five-minute
  coordination window and cannot reset the active attempt; only after that
  window becomes stale may it request an explicit reset. Approval cancellation
  and timeout signals apply only before the signed transport boundary; after
  the boundary, the in-flight exchange request is allowed to finish and its
  late result is reconciled against the exact candidate. Once the boundary is
  recorded, a later remote miss never proves non-submission and therefore never
  automatically expires or replaces the key. If the exact local candidate is
  no longer available, or repeated exact-key reconciliation remains ambiguous,
  the connection dialog offers an explicit reset. A single uncertain result or
  an `approval_unconfirmed` status alone never enables it; the exact stored key
  must first be retried and remain ambiguous. The dialog requires a second,
  owner-and-environment-bound confirmation that warns an already approved key
  may require another signature. That reset must remove the
  coordinated local record and close the matching owner/environment session
  under the registration lock before a replacement can be created. The reset
  rechecks recent cross-tab activity under that same lock, closing the race
  between showing and confirming the action. Only an old pending record that
  never reached the boundary may have its marker cleared after the five-minute
  reconciliation window; that cleanup performs a lock-protected compare-and-set
  and succeeds only
  while both the shared and local submission markers are still absent. It
  still fails without signing, and only a later explicit action may replace
  the candidate. Retries recheck the same key and move all pending metadata to
  the selected storage scope without generating a replacement.
- Registration revalidates both owner and environment after every asynchronous
  boundary. If either changes, cleanup is limited to the exact stored key for
  the captured registration epoch. Unreadable or invalid storage fails closed
  before any approval request. Final preflight and retry checks read the latest
  cross-tab storage value instead of relying on an earlier React render
  snapshot. The direct owner-wallet approval lease is also bound to that exact
  pending public key before signing, after signing, and atomically when the
  transport request starts, preventing an older tab from replacing a newer
  Agent registration. Registration supplies no generic `useExchange` fallback:
  a host approval provider that enforces the wallet-signing contract is
  required, and the registration mutation explicitly disables automatic retry.
- A confirmed owner or environment change removes an unsubmitted candidate but
  preserves a candidate whose submission boundary was already recorded under
  its old owner/environment scope. The new identity cannot use that key, while
  returning to the old identity can reconcile the exact candidate. Automatic
  session lifecycle cleanup follows the same rule; explicit disconnect remains
  the user-authorized path that removes the scoped key.
- Keep that verification state separate from action-level loading UI. An
  initial Agent query may block the action, but background revalidation must
  not repeatedly disable the explicit Enable Trading entry; registration
  still refetches the definitive status before requesting a signature.
- Trading-page load, refresh, and route remount must not automatically present
  the connection dialog. An explicit Enable Trading request owns the modal
  session. Once requested, the dialog remains mounted while Agent verification
  moves through missing, loading, or error states; it closes when the user
  cancels, wallet access is lost, or the Agent becomes ready.
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
- A new CCTP source transaction revalidates the selected Hyperliquid owner's
  legal status after its authorization signature and immediately before the
  exact source wallet submits the transaction. LI.FI creation and uncommitted
  retries do the same before every transaction request. Once a source swap or
  cross-chain transaction is committed, recovery and status tracking must
  remain available even if a later legal-status request is unavailable; this
  does not authorize a new write.
- LI.FI gasless, relayer, Permit, and other message-signing execution paths are
  intentionally unsupported. New routes, dynamically updated routes, and
  uncommitted retries fail closed if they require typed-data signing, and every
  SDK execution disables message signing. A sanitized route with an already
  committed source transaction may still resume read-only receipt and
  destination tracking without a new legal gate or signing request.
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
| Final legal execution guard | `packages/hl-react/src/internal/exchange/legal-execution.ts`, `hooks/useExchange.ts` |
| Legal UI state | `apps/terminal/src/hooks/trade/use-legal-gate.ts` |
| Blocking policy dialog | `apps/terminal/src/components/trade/components/legal-acceptance-modal.tsx` |
| Privy login intent | `apps/terminal/src/lib/wallet/privy-login-method.ts`, `providers/privy-login-method-observer.tsx` |
| Email terms signer | `apps/terminal/src/hooks/wallet/use-explicit-terms-acceptance.ts`, `lib/wallet/privy-legal-signer.ts` |
| Agent storage and preference | `packages/hl-react/src/signing/agent-storage.ts` |
| Agent registration | `packages/hl-react/src/signing/use-agent-registration.ts` |
| Builder-fee approval | `packages/hl-react/src/signing/use-builder-fee-approval.ts` |
| Action authorization | `packages/hl-react/src/signing/use-trading-authorization.ts` |
| Funding-state derivation | `apps/terminal/src/domain/trade/onboarding.ts` |
| Deposit capability derivation | `apps/terminal/src/domain/trade/deposit-availability.ts`, `apps/terminal/src/hooks/trade/use-deposit-availability.ts` |
| Geo parsing and fail-closed query | `apps/terminal/src/lib/geo/ipdata-geo.ts`, `get-geo.ts`, `apps/terminal/src/hooks/use-geo-restriction.ts` |
| USDC routing validation | `apps/terminal/src/domain/trade/usdc-routing.ts` |
| USDC routing query and pre-submit guard | `apps/terminal/src/hooks/trade/use-usdc-routing.ts` |
| Fresh funds-write legal guard | `apps/terminal/src/hooks/trade/use-fresh-legal-action-guard.ts` |
| Runtime flow orchestration | `apps/terminal/src/components/trade/components/trading-onboarding-gate.tsx` |
| Manual deposit and withdrawal surface | `apps/terminal/src/components/trade/tradebox/deposit-modal.tsx` |
| Circle CCTP construction and recovery | `apps/terminal/src/lib/trade/cctp-deposit.ts`, `cctp-deposit-tracking.ts` |
| LI.FI per-transaction guard and committed-route recovery | `apps/terminal/src/lib/lifi/use-bridge.ts`, `bridge-execution-persistence.ts` |
| Cross-tab funds serialization | `packages/hl-react/src/internal/exchange/funds-action-lock.ts` |
| Automatic embedded-wallet deposit | `apps/terminal/src/components/trade/tradebox/embedded-deposit-auto-bridge.tsx` |
| Modal precedence | `apps/terminal/src/components/trade/components/global-modals.tsx` |

## Regression Checklist

At minimum, changes to this flow must cover:

- legal status: inactive, checking, required, submitting, blocked,
  wallet-required, error, and accepted;
- while legal status is `checking`, preference dialogs remain available while
  trading and funds dialogs stay suppressed;
- initial legal failure, background refetch failure with retained read-only
  data, offline action rejection, focus/reconnect refresh, BFCache invalidation,
  schema drift, bounded retry, and exact-owner Exchange write enforcement;
- email and external login intent, cross-user session isolation, exact embedded
  wallet selection, and silent Privy terms signing after explicit application confirmation;
- both policy checkboxes and the non-dismissible blocking dialog;
- an existing approved Agent without a redundant signature;
- new Agent verification using the newly generated address;
- Agent status errors, unknown results, and cached misses during refresh;
- page load, refresh, and route remount never automatically presenting Agent
  approval, with an explicitly requested dialog remaining mounted through
  missing, loading, and error states until cancellation or readiness;
- independent authentication/menu and wallet-signing readiness; the 30-second
  explicit reload entry, readiness/identity timer resets, and no automatic
  reload, logout, provider remount, signing or funding side effects;
- session-only and persistent Agent storage;
- temporary signer loss and restoration, confirmed wallet changes, explicit
  logout, duplicate registration, timeout, and background/foreground transitions;
- funded, empty, loading, and failed account snapshots;
- a post-connection deposit intent remaining bound to the exact owner and
  environment while funding and geo checks resolve, and being discarded after
  either identity changes;
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

## Email Registration and Direct Signing

Follow [Email trading design](email-trading-signing.md). Login and registration
share Privy's email OTP flow and create embedded Ethereum wallets only for
users without a wallet. Authentication alone never establishes a signer. Wait
for the exact wallet directory entry and active account, then verify legal
status before allowing actions. Do not add a second registration form, create
wallets for external-wallet users, or imitate the official site's signing
prewarm. Page load and session restoration never sign.

A fresh successful email login creates an in-memory, user-bound onboarding
intent. Once its exact owner and environment resolve, legal and funding checks
may consume that intent once to guide a confirmed empty account to an eligible
deposit surface. The intent does not survive refresh, logout, a different user,
owner, or environment. Failed or incomplete legal, funding, geo, or routing
checks never imply acceptance or an empty account. Passive failures stay quiet;
manual Deposit remains available under the same capability checks.

Direct signing retains the shared write scheduler, fresh legal enforcement,
identity invalidation, account-mode policy, funds locks, and uncertain-outcome
handling. The embedded owner must be revalidated before and after asynchronous
signing and before submission. Ordinary L1 writes and explicitly requested
builder-fee approval use the same owner wallet; builder approval remains tied
to the first action needing the configured builder, never login or registration.


## Mobile Agent QR client-only transfer (envelope v3)

Optional Link Desktop moves the desktop-approved Agent key to the phone without any server state ([ADR 0015](adr/0015-link-device-alignment.md) D7, option B; [implementation plan](mobile-sync-ticketless-transfer-plan.md)). On reveal the desktop generates a random 16-byte `syncId` locally, encrypts the AES-GCM fragment envelope (v3, AAD-bound to `syncId`, creation and expiry; plaintext bound to origin, network and owner) with a 2-minute TTL, and shows the QR for 60 seconds measured on the local monotonic clock, never beyond the envelope expiry. The phone imports in this order: decrypt, local duplicate check on `syncId` (per network and owner, kept until envelope expiry plus skew), exact `extraAgents` verification, registration-epoch capture, persistence, owner activation and verification; cancellation keeps the existing epoch-aware rollback. The duplicate check runs before any registration epoch is captured, so a QR this phone already imported is refused without touching the access it already holds. That duplicate, an expired envelope, an envelope dated ahead of the phone beyond the clock skew, or a v2 envelope from the retired ticket protocol (answered with a refresh-both-devices message on the import page and in the in-app scanner) clears only the current QR draft. The phone holds a loaded QR for at most the envelope TTL plus the skew, whatever timestamps it carries. Network failures during approval verification retain the bounded draft for retry.

Two properties of the former server ticket are deliberately given up: a second phone redeeming the same code is no longer rejected, and a server restart no longer invalidates outstanding codes. Neither stopped a captured QR; they are replaced by the 60-second visible window, the 2-minute envelope, the screen-sharing warning, the 4-second hold and desktop revocation, and the phone's success panel tells the user to revoke from desktop if they did not import it themselves. These limits bind honest clients only. The fragment carries both the ciphertext and its AES key, so anyone who obtains the complete QR or URL (a screenshot, a photo, or a system-camera scan that leaves the URL in browser history or history sync) can decrypt it at any time and holds the Agent private key until the Agent expires (30 days) or the desktop revokes it. This was equally true with the ticket; the in-app scanner never navigates to the QR URL and is the recommended path.

Reveal, import, verification, refresh and QR recovery never sign or approve a builder fee. Explicit Mobile Agent approval still requires the exact master on desktop; the importing phone does not connect the master or enter a pairing code. Ordinary email trading continues to use the exact active Privy embedded owner without generating an Agent. QR recovery is limited to an existing approved-unrevealed desktop record; after rendering or losing that record a replacement needs an explicit new flow.

The transfer works on the static CloudFront + S3 host; `/mobile-agent-sync-ticket` no longer exists (the viewer-request function and the Lambda handler answer 404). Both pairing build flags (`VITE_MOBILE_PAIRING_CREATE_ENABLED`, `VITE_MOBILE_PAIRING_IMPORT_ENABLED`) still default off and must stay off in production until the acceptance in the [implementation plan](mobile-sync-ticketless-transfer-plan.md) is complete: the [physical-device matrix](mobile-phone-access-device-validation.md) remains not run. Draft v1 is unchanged.
