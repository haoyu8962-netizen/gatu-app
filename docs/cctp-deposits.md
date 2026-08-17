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

Activation remains independently fail-closed for path and environment:

- `VITE_CCTP_EXTERNAL_DEPOSIT_MAINNET_ENABLED`
- `VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED`
- `VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED`
- `VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED`

None defaults to enabled. The sponsored flag does not enable the external path
or the other environment. These flags authorize a release to expose a path;
they are not themselves user consent to move funds. In particular, enabling
the sponsored mainnet flag must not make the application-wide recovery host
sign or broadcast a deposit.

Production supports four explicit Mainnet release modes, and the deployment
validator requires the mode to match the two Mainnet flags exactly:

| Release mode | External flag | Sponsored flag |
|---|---:|---:|
| `disabled` | empty | empty |
| `external-only` | `true` | empty |
| `sponsored-only` | empty | `true` |
| `both` | `true` | `true` |

The validator does not hard-disable the external Mainnet path. It validates the
declared release shape; it cannot prove that a funded end-to-end exercise has
been completed. Operators should still review funded testnet evidence and run
a controlled, small-value Mainnet deposit and recovery exercise for each path
they intend to enable. The current host can expose both paths by setting both
Mainnet flags to `true` and `GATU_CCTP_MAINNET_RELEASE_MODE=both` before
rebuilding and deploying.

Every deposit entry point uses the same fail-closed capability decision before
opening the modal or starting empty-account onboarding. That decision first
classifies the authenticated owner's exact wallet path as either
external-wallet or sponsored embedded-wallet, then requires that path's
independent environment release flag and a completed, unrestricted geo verdict.
The external path additionally requires its exact owner signer to be ready, so
Agent-only and disconnected external sessions remain unavailable. An eligible,
authenticated email session may open the modal before its exact embedded signer
has been created or activated; the modal owns that activation and still withholds
the funding address until readiness succeeds. Unresolved-geo, restricted-geo,
and disabled-path states must not open a modal that can only fail later. A
release flag for the other wallet path or environment never satisfies this
check.

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

The application keeps a conservative 5 USDC product minimum. It also rejects
transfers above Circle's 10,000,000 USDC per-burn contract limit. On testnet it
adds a 1,000 USDC per-transfer application cap and requires an existing
Hyperliquid mainnet account; Circle's published 1,000-USDC testnet policy may
also apply beyond a single transfer, which the client cannot independently
enforce.

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
bundle makes the explicitly confirmed mainnet path available to every eligible
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

Sending USDC to the displayed embedded-wallet address does not by itself
authorize a mainnet CCTP deposit. After funds arrive, the modal reviews the
complete available native-USDC balance and current Circle fee. The user must
explicitly select the amount-labelled `Deposit … USDC` action before the exact embedded EOA
signs the amount- and destination-bound EIP-3009 authorization. Immediately
before signing and broadcasting, the funds-action critical section reads the
balance again and requires it to equal the reviewed balance exactly; a change
aborts the attempt and requires a new review. Mainnet recovery remains mounted
outside the modal, but it must never initiate a new signature or broadcast.
The execution boundary independently rejects every automatic mainnet sponsored
scope, a missing balance or fee review, and any amount that differs from the
reviewed complete balance; the modal guard is not the only enforcement point.

The funded testnet workflow intentionally retains automatic forwarding so it
can exercise background, reload, and cross-tab recovery. Testnet automation
rechecks the balance inside the exclusive browser lock and submits that full
refreshed balance. This testnet behavior is not release authorization for a
mainnet background deposit.

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

The ZeroDev project used by the sponsored mainnet path must not sponsor every
transaction. Before any mainnet candidate, disable `Sponsor all transactions`
and restrict the Arbitrum One Contract Policy to the mainnet `CctpExtensionV2`
proxy `0x3289e443a95B28Bcedacc4B33C689b0C9b84ffAB` and
`batchSponsorDepositForBurn` selector `0x300fb2a3`. Contract policy is defense
in depth for gas sponsorship; it does not limit the amount of USDC covered by
an EIP-3009 authorization and does not replace the explicit mainnet user action
above.

Project and contract request, per-transaction gas, aggregate gas, and gas-price
limits must be sized from observed production and canary traffic rather than
copied from testnet. Reaching a ZeroDev sponsorship or account limit makes the
UserOperation fail. It must never fall back to an unrelated contract or to a
browser-managed email wallet paying gas. Capacity exhaustion therefore needs
monitoring and alerting with enough headroom for wallet deployment, estimation,
Bundler, and Paymaster request patterns.

After those policies and production-sized limits are active, operators should
run the smallest Mainnet E2E in an access-controlled production-candidate
environment using the same commit and the `sponsored-only` or `both` bundle
intended for release. This is release evidence rather than a condition the
deployment validator can verify. If traffic cannot be isolated, add a real
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

## Bridge2 Retirement

No new manual or automatic Bridge2 deposit may be signed or submitted. Existing
Bridge2 history and already-broadcast recovery data remain readable while they
are reconciled. Hyperliquid's independent legacy withdrawal route may still use
`withdraw3`; stopping Bridge2 deposits must not disable or reinterpret that
withdrawal operation. If runtime routing later reports `bridge`, deposits pause
rather than reverting to the retired path.

## Official References

- [Circle: Transfer USDC from Arbitrum to HyperCore](https://developers.circle.com/cctp/howtos/transfer-usdc-from-arbitrum-to-hypercore)
- [Circle: Transfer with CctpExtensionV2](https://developers.circle.com/cctp/howtos/transfer-usdc-from-arbitrum-to-hypercore-with-cctp-extension-v2)
- [Circle: CctpExtensionV2 interface](https://developers.circle.com/cctp/references/cctp-extension-v2-contract-interface)
- [Circle: Get messages and attestations](https://developers.circle.com/api-reference/cctp/all/get-messages-v2)
- [ZeroDev: Gas policies](https://docs.zerodev.app/api-and-toolings/infrastructure/gas-policies)
- [ZeroDev: Sponsoring gas](https://docs.zerodev.app/smart-accounts/sponsor-gas/evm)
- [Hyperliquid: Nonces and API wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets)
- [nktkas SDK: `usdcRouting`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/info/_methods/usdcRouting.ts)
