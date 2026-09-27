# Hyperliquid SDK reference workflow

Use this workflow whenever a trading, account, or subscription change depends on Hyperliquid API behavior. Do not infer protocol semantics from UI behavior or from an SDK method name alone.

## Source priority

1. Hyperliquid's official documentation defines exchange and info-endpoint semantics:
   - <https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint>
   - <https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint>
   - <https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/error-responses>
   - <https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits>
2. The maintained community SDK reference defines the public TypeScript client surface:
   - <https://nktkas.gitbook.io/hyperliquid>
   - <https://nktkas.gitbook.io/hyperliquid/api-reference/info-methods>
   - <https://nktkas.gitbook.io/hyperliquid/api-reference/exchange-methods>
3. The declarations and implementation installed in this repository are the version-locked compile-time and runtime contract. The terminal and `@gatu/hl-react` currently pin `@nktkas/hyperliquid` `0.33.3`. Online documentation may describe a newer patch release.

When these sources differ, preserve the installed contract until the SDK is upgraded deliberately and its migration is tested. Never silently code against an online signature that is absent from the pinned package.

## MCP-assisted lookup

Published GitBook sites expose a read-only HTTP MCP server by appending `/~gitbook/mcp` to the site root. This repository configures both sources in `.mcp.json`:

- Hyperliquid protocol documentation: `https://hyperliquid.gitbook.io/hyperliquid-docs/~gitbook/mcp`
- nktkas TypeScript SDK documentation: `https://nktkas.gitbook.io/hyperliquid/~gitbook/mcp`

Restart or reload the MCP client after changing `.mcp.json`. If the client does not expose either server in the current session, use the Web MCP search/open capability with domain restrictions to the same documentation hosts. See GitBook's [MCP server documentation](https://gitbook.com/docs/publishing-documentation/mcp-servers-for-published-docs) for the transport contract.

For each API-dependent change:

1. Search the Hyperliquid documentation for the endpoint or action and record its protocol meaning.
2. Open the corresponding `nktkas` API-reference page and verify the method name, arguments, response, and documented errors.
3. Inspect the installed declarations before editing:

   ```bash
   pnpm why @nktkas/hyperliquid
   rg "methodName|RelevantType" \
     apps/terminal/node_modules/@nktkas/hyperliquid/esm \
     node_modules/.pnpm/@nktkas+hyperliquid@*/node_modules/@nktkas/hyperliquid/esm
   ```

4. Add a regression test using the exact installed response shape. Mock only the transport boundary, not the business rule being tested.
5. Recheck the official documentation immediately before changing any funds or order path because statuses, limits, and supported actions can change.

## Audited contracts

- `orderStatus` accepts an oid or 16-byte cloid and returns either `unknownOid` or an order with an `OrderProcessingStatus`.
- `open`, `filled`, and `triggered` indicate accepted orders. `canceled`, `outcomeSettledCanceled`, `internalCancel`, and the other `*Canceled` statuses indicate orders accepted and later canceled; they must not be reported as placement rejections. `rejected`, `tooManyOpenOrdersRejected`, and the other `*Rejected` statuses indicate rejection at placement.
- `SubscriptionClient.webData2` was removed in `0.33.2`; use `webData3` for the real-time account stream. `InfoClient.webData2` remains a supported REST info method.
- A TWAP with history status `waitingForTrigger` is live and must retain its asset reservation. `stopped` is terminal and releases it. `TwapState.stopPx` and `TwapState.trigger` are required nullable response fields.
- SDK `0.33.3` declares `userAbstraction` responses as `default`, `disabled`, `unifiedAccount`, or `portfolioMargin`. Preserve those read states exactly, and defensively recognize the historical `dexAbstraction` value if an older response still returns it. Reject compact agent-action codes, object wrappers, `null`, and other shapes as unknown Info responses; the SDK validates the request but not the runtime response. Hyperliquid describes DEX abstraction as discontinued, and does not define `default` as equivalent to Standard/Separate; neither state may be silently projected onto a supported mode or used to infer balance routing.
- Read `userAbstraction` through the SDK Info client, refresh it periodically, and treat a disagreement with a concurrently available `webData3` mode as unresolved until the sources converge. This prevents a stale REST cache or stale stream snapshot from silently selecting a balance model.
- `userSetAbstraction` accepts only `disabled`, `unifiedAccount`, or `portfolioMargin`. Changing mode is an explicit user-signed action. Never activate Unified automatically from a read result; `default`, legacy `dexAbstraction`, and unknown future responses must require an explicit supported-mode selection and fail closed for mode-dependent balance totals and funds actions.
- When account mode selects a different SDK action, source DEX, or transfer direction, capture the supported mode used to build the request and query `userAbstraction` again under the signing-session lock. Reject unavailable, unsupported, or changed results before calling the SDK. Ordinary order parameters do not branch on account mode and should not incur this extra request; their balance availability still fails closed until a supported mode is known.
- Funds preflight and final execution checks are separate. `useExchange` can await fresh legal access after `preExecutionGuard`, so withdrawals, sends, and internal transfers use its synchronous `executionGuard` to revalidate the original submission and current balance immediately before SDK entry. Bind the enqueue-time request object to its submission; a later same-amount request must not authorize the old one. Modal cleanup invalidates attempts but does not revoke signatures or transactions already handed to the SDK.
- CCTP withdrawal balance checks include the reviewed [`preTransferCheck.fee`](https://nktkas.gitbook.io/hyperliquid/api-reference/info-methods/pretransfercheck) activation debit in addition to the requested amount; Hyperliquid documents the separate [account activation fee](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/activation-gas-fee). The route fee is deducted from the requested amount, so do not add it again. Keep this arithmetic in the Big.js domain layer, reject invalid fees, and leave legacy withdrawals free of a CCTP activation debit. Asynchronous fee and eligibility checks remain remote snapshots, not a guarantee that remote state cannot change afterward.
- Deposit route-preflight errors must retain an explicit retry action even when the cached routing query is still ready. Retry refreshes routing only; a recovered route must not automatically resubmit a funds mutation. Keep uncertain post-signing outcomes on the existing reconciliation path.
- `fundingHistory({ coin, startTime, endTime })` returns one market's hourly funding records in ascending time order, at most 500 per response, with `startTime` inclusive; `coin` is the market name, and HIP-3 records keep their dex prefix (`xyz:AAPL`). Page with `fetchTimeRangeHistory` (cursor = last record time, deduplicate by `time`, `requireAscending`), pass an explicit `endTime`, validate that every record's `coin` equals the request, and require a complete snapshot before deriving cumulative values. Checked against the public endpoint on 2026-09-27 (a BTC 30-day window returned exactly 500 ascending rows). [Market funding history](market-funding-history.md) owns the terminal use.
- `activateOutcomeDeployer` is an L1 action and therefore uses the trading/Agent client, not the principal user-signed client.
- `userFees.stakingLink` is `null` or a discriminated union. The `requested` and `tradingUser` variants carry `stakingUser`; the `stakingUser` variant carries `tradingUser`. Narrow on `type` before reading either address.
- HTTP 429 is a deterministic rate-limit response and must not enter ambiguous-delivery reconciliation. Transport failures without a response, HTTP 408, and HTTP 5xx remain ambiguous.
- The SDK does not document whether `batchModify` preserves `positionTpsl` grouping for `s: "0"`. Keep this as a testnet verification requirement; do not replace or endorse that path based on inference alone.

## Review 3965ddff / 0bc72134 disposition

- F1, F2, F4, and F7 were already closed by later bounded reconciliation, deterministic 429 handling, per-submission storage merging, and terminal unconfirmed queue states.
- F3 was valid. Accepted-then-canceled statuses now have a distinct terminal state and warning instead of being reported as placement rejection.
- F5 was valid for ordinary wallet deposits. A delayed wallet request may be hidden without resetting its in-flight state. Manual and automatic deposit executions use separately scoped module-level state, so the amount, pending lock, and eventual result survive modal and route remounts without cross-resetting each other.
- F6 was valid. Reopening Bridge restores active routes to foreground interaction, while routes that halted specifically because they were backgrounded resume from their latest LI.FI route. Genuine execution errors remain on the manual retry path.
- F8 was only partially valid. The no-hash timeout copy was wrong and is corrected, but `stopRouteExecution` is not a safe cancellation primitive for an unresolved wallet request in the installed SDK. The application must retain the execution lock and may only hide the UI.
- F9 was valid. Rejecting a retry keeps a visible error and retry context instead of silently returning to asset selection.
- F10 was not reproducible in the current UI because Retry is not exposed without a recoverable route.
- F11 and F12 were valid. App-generated order-plan and batch fallback messages now pass through Lingui-backed formatters, the bridge halt message is localized, and the component comment was removed.
- Position TP/SL modification semantics remain unresolved and require the testnet check below; no production behavior was changed based on an undocumented assumption.

LI.FI bridge execution is a separate SDK contract. Validate it against <https://docs.li.fi/sdk/execute-routes> and the installed `@lifi/sdk` source. Background execution halts before the next required wallet interaction, and foreground recovery uses the latest route with `resumeRoute`.

In the installed LI.FI 3.16.3 implementation, `stopRouteExecution` disables subsequent executor work and removes the in-memory execution entry. It does not abort an already pending wallet promise and cannot undo a signed or broadcast transaction. Do not expose it as a funds-safe Cancel action or clear the local execution lock while a wallet request is unresolved.
