# HyperCore USDC withdrawals

The terminal supports the CCTP and legacy withdrawal protocols, but they are
not user-selectable alternatives. Hyperliquid's SDK `usdcRouting` response is
the sole source of truth: `cctp` selects the CCTP action and `bridge` selects
the legacy action.

The route is queried when the withdrawal surface opens and refetched
immediately before signing. Loading, failed, malformed, or unknown responses
fail closed. If the fresh route differs from the route the user reviewed, the
request is aborted and must be reviewed again; the terminal never changes
routes or falls back after an error without renewed user intent.

The shared desktop/mobile form keeps passive route discovery quiet: preserve
the form and draft, disable submission, and expose loading through `aria-busy`
rather than a warning banner or a Processing action label. A failed passive
lookup may retain a neutral Retry entry. Failures encountered during an actual
submission preflight and route changes still require visible feedback; do not
infer whether the user submitted from the query status alone. Follow
[mobile data presentation](mobile-data-presentation.md).

## Sending and withdrawing

Send transfers tokens between accounts on Hyperliquid (HyperCore). Its dialog names
the network and directs users wanting Arbitrum USDC to Withdraw. It does not bridge
to Arbitrum; `signatureChainId` identifies the signing domain, not the destination
network. Withdraw keeps its route-selected Arbitrum behavior described below.

## Account funding entries and amount units

Desktop account actions open the existing shared surfaces; opening Deposit,
Perps / Spot, or Withdraw must not sign or submit a transaction. Moving these
controls does not change the protocol or account identity.

| Entry | Execution | Amount and source |
| --- | --- | --- |
| Deposit | EIP-3009 authorization and Circle CCTP contracts; see [CCTP deposits](cctp-deposits.md) | Convert native USDC with `parseUnits(amount, 6)` only for the on-chain amount; require the exact owner wallet |
| Perps / Spot | User-signed `usdClassTransfer({ amount, toPerp })` | Decimal USDC string; `true` means Spot to Perps, `false` means Perps to Spot |
| Withdraw | Route-selected user-signed `withdraw3` or `sendToEvmWithData` | Decimal USDC string; destination is the verified owner for the external-wallet flow, or the validated explicit recipient in the email flow |

Separate-account withdrawals use `clearinghouseState.withdrawable`; shared
unified/portfolio-margin withdrawals use available Spot USDC (`total - hold`).
Shared modes hide Perps / Spot entries while the execution guard continues to
reject internal transfers. User-signed funds actions continue
to revalidate identity, legal status, account mode, region and current balances
at the execution boundary and never use an Agent key as the owner signer.

The UI's two-decimal `USDC_TRANSFER_DECIMALS` limit is a product policy, not an
SDK precision constraint. Max must floor the original decimal string with
Big.js helpers before assigning the form value; never round through a
JavaScript number first. Presentation formatting must not feed back into the
submitted amount.

The shared form displays one visible heading and static Asset / Network details;
fixed protocol values are not disabled dropdowns. Minimum amount is visible
before entry. The destination label remains visible with the value: external
wallets show the exact owner address read-only, while email sessions retain the
explicit editable recipient. Fees come from the selected route, not from the
reference application's Across bridge. Estimated arrival is confirmation-dependent;
neither the form nor the success screen promises a fixed five-minute arrival.
Passive prerequisite failures keep values quiet, preserve drafts and disable submission.
A data retry never signs; an earlier retry cannot overwrite a newly opened context.

## CCTP route

The CCTP route uses the user-signed Hyperliquid SDK method `sendToEvmWithData` with this protocol contract:

| Field | Value |
| --- | --- |
| `token` | `USDC` |
| `amount` | User-entered decimal string |
| `sourceDex` | `spot` for unified/portfolio-margin balances; `""` for separate perp balances |
| `destinationRecipient` | Validated EVM address |
| `addressEncoding` | `hex` |
| `destinationChainId` | `3`, the Arbitrum CCTP domain |
| `gasLimit` | `200000` |
| `data` | `0x`, enabling automatic forwarding |

`destinationChainId` is a CCTP domain, not the Arbitrum EVM chain ID `42161`. The installed SDK schema accepts any unsigned integer, so the application test suite locks this value to `3`.

The automatic-forwarding fee is read from `CoreDepositWallet.calculateCrossChainWithdrawalFee(true, 3)` on HyperEVM when the withdrawal form opens and again immediately before submission. Contract addresses and RPC endpoints are environment-specific and come from Circle's published HyperCore deployment list. The UI fails closed if the current fee cannot be read.

The fee the form displays is the reviewed fee, and it bounds the submission ([confirmation surfaces](confirmation-surfaces.md) invariant 3). The read at the click and the read at the SDK signing boundary must each equal it exactly (`assertWithdrawalRouteFeeMatchesReview` in `lib/trade/withdrawal.ts`). Any difference, higher or lower, aborts with `withdrawal-fee-changed` before signing. At the click-time read no exchange request has started: the form stays open with the draft amount and now shows the updated fee and `Circle fees changed before submission. Review the updated fee and retry.`, so the user can review it and submit again. At the signing-boundary read the request has already started, so, like the other guards there, the dialog closes and the same message is reported through an error notification. A lower fee is rejected as well: exact equality is the rule the signing-boundary check and the activation-fee check already use, and it keeps the amount in the success notification equal to the form's estimate at the click. Accepting a lower fee would need a second rule to save one click after a rare fee change. The signed `sendToEvmWithData` action carries no fee or minimum-received field, so these checks bound the fee the user submits against; they cannot bind the fee deducted after signing.

The contract only requires the gross amount to exceed the forwarding fee. To match the official terminal's current UX guard, this application requires a gross amount of at least twice the live fee. The recipient amount is the gross amount minus the forwarding fee.

## Account activation

For the CCTP route, the terminal derives HyperCore's canonical USDC system
address from the latest `spotMeta` token index and calls:

```ts
preTransferCheck({ user: usdcSystemAddress, source: ownerWalletAddress })
```

The metadata lookup and pre-transfer check both fail closed. They are repeated
before submission, and the pre-transfer check runs once more at the SDK signing
boundary while the account's cross-tab funds lock is held. A sanction result or
fee change aborts the request so the user can review the current state.

The response fields are handled independently:

- `isSanctioned` blocks the action.
- `fee` is the one-time HyperCore account activation fee. It is charged by Hyperliquid on the first outbound action and is separate from the route fee.
- `userExists` and `userHasSentTx` are informational; the protocol-provided `fee` remains the source of truth for balance validation.

The maximum withdrawable gross amount is therefore `withdrawable - activationFee`. A request is rejected locally when `amount + activationFee > withdrawable`.

The legacy route does not use this CCTP account-activation check and treats the
activation fee as zero.

## Legacy route

When `usdcRouting.withdrawalRoute` is `bridge`, the terminal uses the SDK's
user-signed `withdraw3` method. Its current fee and minimum are 1 USDC. Legacy
is not exposed as a manual fallback: using it when Hyperliquid reports `cctp`
would change the signed action and fee outside the protocol-selected route.

## Request and completion semantics

Both SDK methods return an acknowledgement that Hyperliquid accepted the action; they do not return an Arbitrum transaction hash and do not prove destination-chain completion. The success screen therefore says `Withdrawal submitted`, not `Withdrawal completed`. Its notification keeps to the facts the user still needs: the title `Withdrawal submitted` and one sentence with the amount the destination account will receive once Arbitrum confirms, computed from the withdrawal amount and the route fee used for the submission. The route fee is not listed separately because the form showed it before the user confirmed. The forwarding fee is read again at the click and at the signing boundary, and a change from the fee the form displayed at either read aborts the request (see [CCTP route](#cctp-route)), so the amount in the notification equals the form's estimate at the click. A one-time account activation fee is added as a second line only when it was actually charged.

HTTP timeouts, status 408, and 5xx responses are ambiguous: the request may already have been accepted. The UI instructs the user to check balances and transfer history and does not offer an immediate retry. Deterministic rejections, including HTTP 429, may return to the form for a fresh attempt.

The application does not depend on Hyperliquid's private frontend transfer-status service. End-to-end CCTP completion tracking requires a project-owned indexer that correlates the HyperCore action, HyperEVM burn, Circle attestation, and Arbitrum mint.

## Primary references

- [Circle: Withdraw USDC from HyperCore to EVM chains](https://developers.circle.com/cctp/howtos/withdraw-usdc-from-hypercore-to-evm)
- [Circle: CCTP-enabled HyperCore transfers](https://developers.circle.com/cctp/concepts/cctp-on-hypercore)
- [Circle: HyperCore contract addresses](https://developers.circle.com/cctp/references/hypercore-contract-addresses)
- [Hyperliquid exchange endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)
- [nktkas SDK: `usdcRouting`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/info/_methods/usdcRouting.ts)
- [nktkas SDK: preTransferCheck](https://nktkas.gitbook.io/hyperliquid/api-reference/info-methods/pretransfercheck)
- [nktkas SDK: signing](https://nktkas.gitbook.io/hyperliquid/utilities/signing)
