# Circle CCTP Deposits

The terminal is CCTP-only for new USDC deposits. Hyperliquid's runtime
`usdcRouting.depositRoute` remains an execution guard: only an exact, fresh
`cctp` response permits a new deposit. A `bridge` response, failed, missing, or
malformed response blocks submission. The application never falls back to
Bridge2, and a route change after review requires the user to review and submit
again.

## Supported Paths

When the route is `cctp`, a connected external wallet may submit Circle's
`CctpExtension.batchDepositForBurnWithAuth` transaction on Arbitrum. The same
wallet address owns the USDC, signs EIP-3009 `ReceiveWithAuthorization`, pays
the source-chain gas, broadcasts the transaction, and receives the HyperCore
credit. Agent/API-wallet addresses are signing delegates rather than accounts
and are rejected as recipients.

For a Privy email session, the exact embedded EOA that owns the USDC signs the
same EIP-3009 authorization for Circle's `CctpExtensionV2`. The authorization
nonce deterministically binds the owner, amount, validity window, and complete
deposit parameters. The Privy Smart Wallet submits
`batchSponsorDepositForBurn`, and its configured Arbitrum paymaster/bundler
sponsors the source-chain gas. Authentication alone is insufficient: the
embedded EOA must match the selected Hyperliquid owner exactly.

Direct external-wallet deposits on Mainnet are a permanent product capability
and do not have a build-time activation gate. Activation remains independently
fail-closed for the other path/environment combinations:

- `VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED`
- `VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED`
- `VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED`

These three flags default to disabled. A sponsored flag does not enable the
other environment, and the Testnet external flag does not alter Mainnet. When
enabled, an eligible email session automatically deposits its available native
USDC through the page-level host in either environment. The product decision
and runtime limits are recorded in [ADR 0040](adr/0040-automatic-email-wallet-deposits.md).

Production supports two Mainnet release modes. External is enabled in both. The
sponsored Mainnet build flag selects the mode, and the release upload requires a
matching acknowledgement:

| Release mode | External | Sponsored flag | `deploy.mjs sync --execute` |
|---|---:|---:|---|
| `external-only` | always enabled | empty | no extra option; `--allow-sponsored-mainnet-deposits` is refused |
| `both` | always enabled | `true` | requires `--allow-sponsored-mainnet-deposits` |

The build records the three gated paths in `build-meta.json` under
`cctpDeposits`, resolved by the same `resolveCctpDepositFeatureFlags` the
application uses, so the record describes what was baked into the bundle rather
than what an environment file says at upload time. The
[CloudFront release](../deploy/cloudfront/README.md) reads that record:
`sync --execute` refuses a build whose sponsored Mainnet gate and the operator's
option disagree in either direction, refuses a build that records no gates, and
`verify` fails when the live origin's gates differ from the local build. This
replaces the second acknowledgement (`GATU_CCTP_MAINNET_RELEASE_MODE`) that the
retired EC2 release script enforced; the Testnet gates are recorded and compared
but need no acknowledgement.

The application ignores the retired
`VITE_CCTP_EXTERNAL_DEPOSIT_MAINNET_ENABLED` build switch; an empty or false
legacy value cannot disable Mainnet external deposits. The release gate cannot
prove that a funded end-to-end exercise has been completed: operators should
still review funded testnet evidence and run controlled, small-value Mainnet
deposit and recovery exercises before exposing the sponsored path with
`VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true`, then rebuild and publish.

Every deposit entry point uses the same fail-closed capability decision before
opening the modal or starting empty-account onboarding. That decision first
classifies the authenticated owner's exact wallet path as either
external-wallet or sponsored embedded-wallet, then requires the applicable
release policy and a completed, unrestricted geo verdict.
The external path additionally requires its exact owner signer to be ready, so
Agent-only and disconnected external sessions remain unavailable. An eligible,
authenticated email session may open the modal before its exact embedded signer
has been created or activated. The root `EmailEmbeddedWalletProvider` owns the
silent creation ([ADR 0033](adr/0033-silent-email-wallet-creation.md)); the modal
waits for it, never starts a creation by itself, offers an explicit Retry after a
failure, and still withholds the funding address until readiness succeeds. Unresolved-geo, restricted-geo,
and disabled controlled-path states must not open a modal that can only fail
later. A release flag for another environment never satisfies this check.

The implementation uses:

- Circle native USDC for the selected Arbitrum environment;
- a fresh Fast Transfer fee quote and allowance before signature and again
  before broadcast;
- source domain `3` and destination domain `19`;
- the official `CctpForwarder` as both `mintRecipient` and
  `destinationCaller`;
- the 56-byte `cctp-forward` hook for the connected HyperCore recipient;
- strict `BatchDepositForBurn` source-receipt validation for direct deposits;
- strict, per-authorization `SponsoredDepositForBurn` validation for sponsored
  deposits. A matching `SponsoredDepositForBurnSkipped` is a definitive
  failure even when the outer transaction itself succeeded.

Circle sets no minimum for a CCTP deposit to HyperCore: its documentation says a
deposit of any size succeeds, the forwarding fee is deducted from the amount, and
the 1 USDC HyperCore activation fee is charged on the account's first outbound
action, not on the deposit. The 5 USDC minimum belongs to the retired Bridge2
route, where a smaller deposit was lost, and the application no longer applies or
displays it (product decision, 2026-10-04). The contract only needs the amount to
exceed the fee; the application requires at least twice the current maximum fee,
the same guard as [CCTP withdrawals](withdrawals.md). `calculateCctpDepositFee`
enforces it for the reviewed amount and again at execution with the fresh quote,
throwing `CctpDepositBelowMinimumError` with the smallest amount at or above the
rejected one that the same quote accepts. Because the fee is rounded up and may
grow with the amount, that value is searched for (each candidate is raised to what
it requires until one passes) rather than read off the rejected amount, so the
amount a user is told to enter is itself accepted. The search is bounded, and the
bound is sufficient only because a Fast Transfer rate above
`CCTP_DEPOSIT_MAX_FEE_BPS` (1,000 bps, 10% of the amount) is rejected as an
unusable quote, both when Circle's response is normalized and when a fee is
calculated: at or below that rate the search provably ends within its limit
(`findCctpDepositMinimumRaw` states the argument). Circle's published Fast
Transfer rates are far below it; the ceiling exists to fail closed on a quote the
application cannot reason about, and a deposit is not offered while it applies.
Running out of search rounds is treated as an unusable quote too, never as proof
that no amount can be deposited.
`reviewCctpDepositFee` turns the failure into a result a surface can show: the
amount field is marked invalid with "Minimum deposit is N USDC", the email form
names the same amount, and a fee that rises between review and click so that the
amount no longer reaches it is reported as a fee change, never as a routing
failure. The form's "Minimum N USDC" note is `getCctpDepositMinimumRaw` of the
current quote, the smallest amount that quote accepts, shown whenever a usable
quote is known, and the email automatic path waits for a balance that meets the rule. The
official terminal still applies 5 USDC to its Arbitrum routes; that is its own
choice, not a CCTP rule. The funding-address notice tells the user to send only
native USDC on Arbitrum and that other assets or networks are not credited; it
does not claim that funds are lost, because the address is the user's own wallet.
The application also rejects
transfers above Circle's 10,000,000 USDC per-burn contract limit. On testnet it
adds a 1,000 USDC per-transfer application cap and requires an existing
Hyperliquid mainnet account; Circle's published 1,000-USDC testnet policy may
also apply beyond a single transfer, which the client cannot independently
enforce.

## Wallet Network

The deposit form never gates on the wallet's current network and shows no
"switch to Arbitrum" screen. The official terminal behaves the same way once a
Privy session is authenticated: its chain-mismatch helper returns false for an
authenticated session, and the Arbitrum USDC deposit handler calls wagmi's
`switchChainAsync` right before `writeContractAsync` when the connected chain is
not Arbitrum (evidence captured from the production bundle on 2026-10-08, see
[the task record](work-memory/sessions/2026-10-08-deposit-on-demand-chain-switch.md)).
Sairn's external-wallet submit path in `lib/hyperliquid/use-deposit.ts` does the
same work in `getDepositProviderForChain`:

1. Read `eth_chainId` from the wallet's EIP-1193 provider and normalise it with
   `parseChainId`. Comparison is numeric: injected wallets answer with a hex
   string, while WalletConnect's provider answers with a number. Comparing the
   raw value with a hex literal made every WalletConnect wallet look like it was
   on the wrong network, including one that was already on Arbitrum. This is
   the confirmed defect; whether it was the cause of the reported phone
   incident depends on that wallet's connector, which was not recorded
   (a wallet's in-app browser injects a provider that answers with a hex string
   and would not have hit it).
2. When the chain differs, mark the execution `networkSwitchPending` (the status
   screen heading becomes "Switching network") and ask for the switch once:
   through Privy's `wallet.switchChain` when Privy's own record disagrees with
   Arbitrum, or directly with `wallet_switchEthereumChain` (plus
   `wallet_addEthereumChain` on an unknown-chain error) when Privy already
   believes the wallet is on Arbitrum, because `switchChain` returns without
   sending anything in that case.
3. Wait for the wallet to report Arbitrum: a `chainChanged` listener plus
   `eth_chainId` polling every `DEPOSIT_CHAIN_SWITCH_POLL_INTERVAL_MS`, with an
   independent `DEPOSIT_CHAIN_SWITCH_SETTLE_MS` deadline timer that ends the
   wait even while a chain query is still pending (late answers and events are
   ignored once it has ended). Wallets commonly resolve the switch request
   before the new chain is observable, so an immediate re-read is not evidence.
   Once a switch request has been accepted, the wait never repeats it because
   the chain has not changed yet; the only extra requests are the
   unknown-chain recovery (`wallet_addEthereumChain` followed by one more
   `wallet_switchEthereumChain`, inside Privy, in the direct path, or in both
   when Privy's own recovery still reports an unknown chain). A wallet
   that never reports Arbitrum before the deadline fails with "Wallet is not
   connected to Arbitrum One", a rejected request with "Arbitrum network switch
   was rejected", and either is reported through the deposit failure
   notification. The deadline bounds only this observation phase: the wallet's
   own answer to the switch request is awaited before it, and a backgrounded
   page may delay the timer.
4. Re-check the chain (numerically) right before the EIP-3009 authorization is
   signed and again right before `writeContract`, after the gas estimate and
   the fresh legal check, so a wallet that moved away in between still fails
   closed.

Device acceptance for this flow has not been recorded yet. It needs a phone with
a real external wallet and a small USDC balance on Arbitrum, and covers three
cases: a wallet already on Arbitrum must see no switch prompt at all and go
straight to the transaction request; a wallet on another network that already
knows Arbitrum must see one switch prompt, then the transaction request, with
the status screen reading "Switching network" in between (a wallet that does
not know Arbitrum goes through the add-network recovery above, so record the
exact prompt order instead); and declining the switch must close the attempt
with the "Arbitrum network switch was rejected" notification and no transaction
request. Record the wallet, its connection path (WalletConnect or
in-app browser) and the outcome in the task record before relying on this flow.

`useDepositWalletProvider` only reports whether the wallet provider answers at
all (the "Wallet connection unavailable" screen); it no longer interprets the
chain. `use-deposit-routing-guard.test.tsx` ("wallet network") pins the numeric
comparison, the two switch paths, the unknown-chain recovery sequence (in
the direct path, and after Privy itself reports an unknown chain, while a
rejection never falls back), the event channel (a `chainChanged` for another
chain keeps the wait going), the deadline (including a query that never answers, and answers
or events that arrive after it), a query that fails during the observation,
listener and timer cleanup, the `networkSwitchPending` lifecycle as the hook
returns it, the rejection and both pre-signing and pre-broadcast re-checks.

## Card Funding Before A Deposit

When the per-network card funding flag is on and the session has an exact owner
([ADR 0034](adr/0034-privy-card-funding.md)), the deposit dialog opens on a choice
between two separate entries, as the official terminal's does: "Transfer USDC"
leads to the paths below (with a back control to the choice), and "Buy USDC with a
card" buys USDC by card or bank transfer through Privy's fiat onramp. With the flag
off, or without an exact owner, the dialog opens directly on the transfer form. The purchase only delivers native USDC on Arbitrum One to
the exact Hyperliquid owner (the embedded EOA of an email session, or the
connected external wallet); it is not a deposit. An active eligible email session
automatically deposits that USDC; an external wallet uses the manual deposit form.
The sponsored or external-wallet gates, the
routing guard and the geo check still decide whether it can reach HyperCore.
An external wallet needs Arbitrum ETH for that second step. The entry closes
the deposit dialog before Privy's window opens, and a provider's `confirmed` or
`submitted` result is reported as a purchase, never as an arrival or a deposit.
On Testnet the purchase runs the provider sandbox, which charges nothing and
delivers nothing, and its notice says so instead of pointing to a deposit.
While the purchase entry is on screen and can start, the dialog loads the
page-level host ahead of the click; if the host cannot be loaded when the
purchase is started, the attempt ends with a fixed notice. What has to be
verified before the flag is turned on is listed in the
[launch checklist](privy-card-funding-launch-checklist.md).

## Sponsored Wallet Boundary

Circle does not operate the `CctpExtensionV2` source-chain relayer. In this
application, the configured Privy Smart Wallet and paymaster/bundler provide
that submitting and gas-sponsoring role. The embedded EOA remains the USDC
owner and authorization signer; the outer Arbitrum transaction sender may be a
Smart Wallet or account-abstraction entry point and must not be treated as the
depositor identity.

Before enabling the sponsored path in a public release, operators should use
funded Arbitrum Sepolia and a controlled, non-public production-candidate
Mainnet run to cover exact-wallet activation, authorization binding, paymaster
submission, the exact success event, matching skipped-event rejection, Circle
attestation, forwarding, refresh recovery, and final HyperCore credit. A
successful unrelated sponsored transaction is not release evidence for CCTP.
The current build flag has no user or wallet allowlist: enabling it in a public
bundle makes the automatic mainnet path available to every eligible
email-wallet user.

Before the UI reveals the exact embedded-wallet funding address, it performs a
read-only readiness check for that exact embedded wallet: Privy must construct
its Smart Wallet client for the selected Arbitrum chain, the client must report
that same target chain, and a paymaster must be configured. The address remains
hidden while the check is pending or after any of those checks fails. The
execution path repeats the exact-owner, chain, paymaster, routing, fee,
allowance, balance, and release checks inside the funds-action boundary before
any signature or broadcast.

This readiness check does not sign, send, or move funds. It also does not prove
that the ZeroDev contract-selector policy is correct, that sponsorship quota or
rate limits have capacity, or that the complete UserOperation-to-HyperCore path
works. Those properties still require dashboard review, monitoring, and a
funded end-to-end release check.

The email form explains in both environments that USDC sent to the displayed
address is automatically deposited into the trading account. There is no second
Deposit action. Asset and
network are fixed route details, not selectable dropdowns; each shows its icon
beside the value, and the same row is used by the withdrawal form. The email form
and the external-wallet form both open with the USDC mark above the title, so the
two kinds of account see the same header. The QR code
carries the USDC mark in its centre and is generated at error-correction level H
so the covered modules stay recoverable; it keeps dark modules on a white field in
both themes. The address sits in one field with its copy control. The layout
follows the official terminal's deposit dialog (fixed header, body that scrolls
without a visible scrollbar, one component for the desktop modal and the phone
sheet). Done closes the form without submitting or cancelling a deposit.

Passive balance, fee, wallet-readiness and route failures render numeric placeholders
or the address skeleton, with neutral retry controls where recovery is available.
Unknown balances never enable Max or submission. Read-only data retries may show
request feedback if they fail, never sign, and discard results from an older modal
context. Submitted-action failures and confirmed restrictions remain visible.

With the network's sponsored flag enabled, the application-wide
`EmbeddedDepositAutoBridge` handles both Mainnet and Testnet. It requires the
exact active email owner, a verified CCTP route, a current eligible balance and
fee, and no unresolved earlier submission. Inside an exclusive browser lock it
refreshes the native-USDC balance and submits that full refreshed amount through
`useDeposit` with `executionScope: "automatic"`. The execution boundary retains
fresh route, geo, legal, exact-owner, fee, allowance, amount-limit, chain and
paymaster checks. Manual Mainnet sponsored callers still need exact reviewed
balance and fee values; automatic deposits do not require a synthetic UI review.

The host stays mounted outside the dialog: closing Done does not cancel its
work, and restoring an eligible email session also processes an existing balance.
It runs only while the application page is running; closing all pages does not
provide server-side forwarding. Submitted transactions continue through the
protocol. Persisted recovery records and unknown-submission intents block a new
authorization until the earlier outcome is resolved; a failed attempt is not
blindly resubmitted. External-wallet and Agent-only sessions do not enter this
automatic email path. Testnet automation remains independently gated and is not
proof of successful Mainnet funding.

The application never stores an EIP-3009 authorization signature in browser
storage.

## Geo Enforcement

Deposit capability requires a resolved, unrestricted server geo verdict. The
deposit execution path does not rely only on that cached UI state: after it has
acquired the per-owner funds lock and before requesting an EIP-3009 signature,
it freshly refetches the verdict. A provider error, timeout, missing client IP,
missing credential, malformed payload, invalid country code, proxy/Tor/
anonymous signal, or restricted jurisdiction fails closed for the funds
action. Browsing remains available.

IPdata responses are parsed through one strict shared schema. Every accepted
response requires a two-letter uppercase country code and the core proxy, Tor,
and anonymous boolean threat fields. When IPdata returns its separate VPN or
iCloud Private Relay signals, either one also blocks the action. Countries with
region-specific restrictions require a valid region code; in particular, a
Canada response without a region is unresolved and cannot permit a deposit.

Production deployment preflight validation requires `IPDATA_API_KEY` in the
runtime environment. Its value must be non-empty and unquoted. Operators must
configure and periodically rotate this credential through the deployment
secret store; the real value must never be committed, logged, placed in a
client build variable, or copied into this document.

## Paymaster Production Policy

Resolve the active Arbitrum Smart Wallet Bundler and Paymaster URLs from the
deployed Privy app configuration before checking ZeroDev. A migrated app can
point to a different project than a previously inspected dashboard. A nonempty
Paymaster URL, enabled CCTP build flag, or registered contract ABI does not prove
that sponsorship is available; the active project needs an applicable policy.

The ZeroDev project used by the sponsored mainnet path must not sponsor every
transaction. Before any mainnet candidate, disable `Sponsor all transactions`
and restrict the Arbitrum One Contract Policy to the mainnet `CctpExtensionV2`
proxy `0x3289e443a95B28Bcedacc4B33C689b0C9b84ffAB` and
`batchSponsorDepositForBurn` selector `0x300fb2a3`. Contract policy is defense
in depth for gas sponsorship; it does not limit the amount of USDC covered by
an EIP-3009 authorization and does not replace the exact-owner, amount, fee and
recovery checks above.

The Bundler and Paymaster must use compatible provider routes. ZeroDev supports
an explicit provider query and recommends the same provider for both URLs
([RPC documentation](https://docs.zerodev.app/api-and-toolings/infrastructure/rpcs)).
The [2026-10-10 investigation](work-memory/sessions/2026-10-10-zerodev-deposit-sponsorship-policy.md)
observed gas-only responses without Paymaster data on the default route even
after adding the required contract policy; the same project's explicit
`?provider=PIMLICO` route returned Paymaster data through both standard
`pm_getPaymasterStubData` and `pm_getPaymasterData` preparation calls.
The operator subsequently reported a successful real deposit on the unchanged
production frontend; a read-only UI check confirmed credited account value and
cleared pending records. The task record distinguishes that acceptance from
an independently captured source receipt or production-capacity verification.

The repair goal is to restore the existing Privy Smart Wallet submission path
through dashboard routing, preserving the project, chain, narrow policy and
approved budget. It does not require an SDK fork, a self-funded gas fallback,
or relaxed authorization guards. Apply the same explicit route to both
Arbitrum URLs only after operator approval. Verify the saved public app
configuration and a fresh client's standard Paymaster preparation; then obtain
a user-submitted source confirmation and final HyperCore credit. An unsigned
zero-balance probe exercises the contract's skip path, so it cannot validate
actual USDC burn cost, the chosen gas budget, or successful credit. `AA21`
alone does not identify a billing, quota, or CCTP feature-flag problem.

Project and contract request, per-transaction gas, aggregate gas, and gas-price
limits must be sized from observed production and canary traffic rather than
copied from testnet. Reaching a ZeroDev sponsorship or account limit makes the
UserOperation fail. It must never fall back to an unrelated contract or to a
browser-managed email wallet paying gas. Capacity exhaustion therefore needs
monitoring and alerting with enough headroom for wallet deployment, estimation,
Bundler, and Paymaster request patterns.

After those policies and production-sized limits are active, operators should
run the smallest Mainnet E2E in an access-controlled production-candidate
environment using the same commit and the `both` bundle intended for release.
This is release evidence rather than a condition the deployment validator can
verify. If traffic cannot be isolated, add a real
runtime allowlist or equivalent access control first; do not describe the
global build flag as a canary allowlist.

A rejected sponsored submission without a source hash remains an unknown
outcome. The unresolved authorization intent stays fail-closed until recovery
proves the source result or the authorization expires; operators must not
clear it merely because a Paymaster policy appears to have rejected the
request.

## Recovery Semantics

The source hash is stored per environment and owner after broadcast. Sponsored
records additionally store the non-secret authorization nonce and mode, but
never the EIP-3009 signature. Legacy version-one records are read as direct
deposits.

Immediately before a sponsored Smart Wallet submission, the application also
persists a minimal unresolved intent containing the environment, exact owner,
amount, authorization nonce, and expiry. If the Bundler or Paymaster call ends
without returning a source hash, reloads remain fail-closed and cannot sign a
second authorization until that intent expires. The intent is removed only
after the exact source-chain success described below; no authorization
signature or transaction calldata is persisted. Returning a Bundler hash does
not clear this tombstone: it remains until the exact
`SponsoredDepositForBurn` success receipt proves that EIP-3009 authorization
was consumed. Reverts and skipped entries retain it until expiry so an exposed
authorization cannot later succeed alongside a newly signed deposit.

A confirmed Arbitrum revert or a successful receipt without the exact expected
burn event is terminal and removes the recovery item. Sponsored recovery
matches `owner + amount + authNonce` in the V2 event and does not assume that
the outer transaction `from`, `to`, or calldata directly represents the user.
Receipt timeouts and unknown RPC outcomes retain the record so a reload can
continue checking Circle's messages API.

Because a Privy Bundler may include multiple users in one account-abstraction
transaction, Circle status tracking never aggregates every message returned
for the outer source hash. It selects exactly one raw CCTP V2 message by source
and destination domains, native USDC, mode-specific Extension, amount,
Forwarder fields, and the owner-bound hook. Other users' messages are ignored;
no match remains pending and multiple exact matches fail closed.

A Circle `forwardTxHash` is displayed as a submitted-forwarding state. It is
not described as final HyperCore credit because Circle may return a forward
hash while forwarding is still pending. The application-wide embedded-wallet
tracker remains active when the deposit modal is closed and removes the local
recovery item at this state so a completed automatic deposit cannot block the
next deposit. The modal uses the same query key, so opening it does not create a
second network request for the same recovery record.

### Submission diagnostics and unknown outcomes

Implemented locally on 2026-10-10, not released; the design was recorded before
implementation. Verification and the unresolved live failure are tracked in the
[work-memory investigation](work-memory/sessions/2026-10-10-deposit-unknown-submission-diagnostics.md). A wallet submission
without a source hash is not evidence of an Arbitrum broadcast or Circle processing.
Its notification must say that the wallet returned no transaction hash. An unresolved
signed authorization blocks another deposit until recovery or expiry, with a distinct
message from a deposit that has an actual source-chain tracking record.

Before resetting the dialog, caught submission failures use the existing privacy-filtered
client error reporting channel with kind `deposit_submission`, stage
`before_source_hash` or `source_confirmation`, and an allowlisted reason derived from
at most eight nested causes. Reasons identify error families, not verified chain outcomes:
`paymaster`, `bundler`, `nonce_conflict`, `wallet_rejected`, `network`, `timeout`, or `unknown`.
No wallet address, amount, nonce, signature, calldata, endpoint, or original error message
is included. Existing reporting limits, deduplication and failure isolation apply. Deploy
the shared server validator with the frontend: an older endpoint rejects the new report
kind, without affecting deposit execution.

This avoids a second diagnostic transport or persisting raw SDK errors. Retrying or
clearing an authorization on a Paymaster/Bundler error alone is rejected because an
exposed authorization may still execute. Verification must cover no-hash versus
known-hash copy, retained authorization/retry prevention, reporting before dialog
reset, nested-error classification and server rejection of unrecognized fields/reasons.
These checks cannot establish the cause of a historical response that was not captured,
or prove a real deposit was credited.

## Bridge2 Retirement

No new manual or automatic Bridge2 deposit may be signed or submitted. The app
never stored recovery data for Bridge2 deposits, and past ones appear in the
account ledger like any other deposit; the leftover Bridge2 success notification
and configuration were removed on 2026-09-29. Hyperliquid's independent legacy
withdrawal route may still use `withdraw3`; stopping Bridge2 deposits must not
disable or reinterpret that withdrawal operation. If runtime routing later
reports `bridge`, deposits pause rather than reverting to the retired path.

## Official References

- [Circle: Transfer USDC from Arbitrum to HyperCore](https://developers.circle.com/cctp/howtos/transfer-usdc-from-arbitrum-to-hypercore)
- [Circle: Transfer with CctpExtensionV2](https://developers.circle.com/cctp/howtos/transfer-usdc-from-arbitrum-to-hypercore-with-cctp-extension-v2)
- [Circle: CctpExtensionV2 interface](https://developers.circle.com/cctp/references/cctp-extension-v2-contract-interface)
- [Circle: Get messages and attestations](https://developers.circle.com/api-reference/cctp/all/get-messages-v2)
- [ZeroDev: Gas policies](https://docs.zerodev.app/api-and-toolings/infrastructure/gas-policies)
- [ZeroDev: Sponsoring gas](https://docs.zerodev.app/smart-accounts/sponsor-gas/evm)
- [Hyperliquid: Nonces and API wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets)
- [nktkas SDK: `usdcRouting`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/info/_methods/usdcRouting.ts)
