# Circle CCTP Deposits

The terminal follows Hyperliquid's runtime `usdcRouting.depositRoute`; it does
not offer Bridge2 and CCTP as interchangeable user choices. A failed, missing,
or malformed route response blocks submission, and a route change after review
requires the user to review and submit again.

## Supported Path

When the route is `cctp`, a connected external wallet may submit Circle's
`CctpExtension.batchDepositForBurnWithAuth` transaction on Arbitrum. The same
wallet address owns the USDC, signs EIP-3009 `ReceiveWithAuthorization`, pays
the source-chain gas, broadcasts the transaction, and receives the HyperCore
credit. Agent/API-wallet addresses are signing delegates rather than accounts
and are rejected as recipients. Activation is independently fail-closed for
mainnet and testnet through `VITE_CCTP_EXTERNAL_DEPOSIT_MAINNET_ENABLED` and
`VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED`; neither defaults to enabled.

The implementation uses:

- Circle native USDC for the selected Arbitrum environment;
- a fresh Fast Transfer fee quote and allowance before signature and again
  before broadcast;
- source domain `3` and destination domain `19`;
- the official `CctpForwarder` as both `mintRecipient` and
  `destinationCaller`;
- the 56-byte `cctp-forward` hook for the connected HyperCore recipient;
- strict `BatchDepositForBurn` source-receipt validation.

The application keeps a conservative 5 USDC product minimum. It also rejects
transfers above Circle's 10,000,000 USDC per-burn contract limit. On testnet it
adds a 1,000 USDC per-transfer application cap and requires an existing
Hyperliquid mainnet account; Circle's published 1,000-USDC testnet policy may
also apply beyond a single transfer, which the client cannot independently
enforce.

## Embedded Wallet Boundary

Embedded/email CCTP deposits are deliberately unavailable. Circle's
`CctpExtensionV2` sponsored flow requires the integrator or a partner to run a
relayer; Circle does not provide that source-chain relayer. The repository has
no production relayer, durable idempotency store, or verified sponsorship
policy, so the terminal fails closed instead of treating the existing Privy
smart-wallet client as an approved substitute.

Enabling this path later requires funded Arbitrum Sepolia and small-value
mainnet end-to-end evidence covering EOA authorization, relayer submission,
paymaster behavior, the exact success event (and skipped-event rejection),
Circle attestation, forwarding, refresh recovery, and final HyperCore credit.

## Recovery Semantics

The source hash is stored per environment and owner after broadcast. A
confirmed Arbitrum revert or a successful receipt without the exact expected
burn event is terminal and removes the recovery item. Receipt timeouts and
unknown RPC outcomes retain it so a reload can continue checking Circle's
messages API.

A Circle `forwardTxHash` is displayed as a submitted-forwarding state. It is
not described as final HyperCore credit because Circle may return a forward
hash while forwarding is still pending. The user acknowledges that state to
remove the local recovery item.

## Official References

- [Circle: Transfer USDC from Arbitrum to HyperCore](https://developers.circle.com/cctp/howtos/transfer-usdc-from-arbitrum-to-hypercore)
- [Circle: CctpExtensionV2 interface](https://developers.circle.com/cctp/references/cctp-extension-v2-contract-interface)
- [Circle: Get messages and attestations](https://developers.circle.com/api-reference/cctp/all/get-messages-v2)
- [Hyperliquid: Nonces and API wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets)
- [nktkas SDK: `usdcRouting`](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/info/_methods/usdcRouting.ts)
