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

The contract only requires the gross amount to exceed the forwarding fee. To match the official terminal's current UX guard, this application requires a gross amount of at least twice the live fee. The recipient amount is the gross amount minus the forwarding fee.

## Account activation

Before either withdrawal route is enabled, the terminal calls:

```ts
preTransferCheck({ user: walletAddress, source: walletAddress })
```

The response fields are handled independently:

- `isSanctioned` blocks the action.
- `fee` is the one-time HyperCore account activation fee. It is charged by Hyperliquid on the first outbound action and is separate from the route fee.
- `userExists` and `userHasSentTx` are informational; the protocol-provided `fee` remains the source of truth for balance validation.

The maximum withdrawable gross amount is therefore `withdrawable - activationFee`. A request is rejected locally when `amount + activationFee > withdrawable`.

## Legacy route

When `usdcRouting.withdrawalRoute` is `bridge`, the terminal uses the SDK's
user-signed `withdraw3` method. Its current fee and minimum are 1 USDC. Legacy
is not exposed as a manual fallback: using it when Hyperliquid reports `cctp`
would change the signed action and fee outside the protocol-selected route.

## Request and completion semantics

Both SDK methods return an acknowledgement that Hyperliquid accepted the action; they do not return an Arbitrum transaction hash and do not prove destination-chain completion. The success screen therefore says `Withdrawal submitted`, not `Withdrawal completed`.

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
