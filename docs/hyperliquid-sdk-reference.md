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
3. The declarations and implementation installed in this repository are the version-locked compile-time and runtime contract. The terminal and `@sairn/hl-react` currently pin `@nktkas/hyperliquid` `0.33.3`. Online documentation may describe a newer patch release.

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
- SDK `0.33.3` declares `userTwapSliceFillsByTime({ user, startTime, endTime? })` and returns `UserTwapSliceFillsResponse`, an array of `{ fill, twapId }`. The request schema has no `aggregateByTime`: TypeScript rejects it and the SDK's schema parse drops it before sending, so the flag the official terminal sends cannot reach the server without a deliberate SDK patch. The Info endpoint page documents only `userTwapSliceFills` (at most the 2,000 most recent fills, newest first) and gives no page size or order for the by-time variant. The rate-limits page does name `userTwapSliceFillsByTime`: it is one of the Info requests that add weight per 20 items returned on top of the base Info weight of 20, all within the per-IP REST budget of 1,200 per minute, so a 2,000-row page costs about 120 and about ten such pages exhaust a minute. A read-only mainnet probe during the 2026-09-27 scouting (two public addresses, not repeated for the implementation) observed ascending pages of at most 2,000 rows starting at the inclusive `startTime`; treat that as observed behavior, not a contract. The TWAP fill export therefore sets no `pageLimit`, requires ascending pages, stops on an empty or overlap-only page, paces every attempt (retries included) through one pacer per network that lives for the tab, so the exports in a tab together stay at or below 720 weight in any 60-second window even when one is aborted and restarted, and waits 60 seconds before retrying a 429 that carries no `Retry-After` ([TWAP export](twap-regression-tests.md#export)).
- A TWAP with history status `waitingForTrigger` is live and must retain its asset reservation. `stopped` is terminal and releases it. `TwapState.stopPx` and `TwapState.trigger` are required nullable response fields.
- SDK `0.33.3` declares `userAbstraction` responses as `default`, `disabled`, `unifiedAccount`, or `portfolioMargin`. Preserve those read states exactly, and defensively recognize the historical `dexAbstraction` value if an older response still returns it. Reject compact agent-action codes, object wrappers, `null`, and other shapes as unknown Info responses; the SDK validates the request but not the runtime response. Hyperliquid describes DEX abstraction as discontinued, and does not define `default` as equivalent to Standard/Separate; neither state may be silently projected onto a supported mode or used to infer balance routing.
- Read `userAbstraction` through the SDK Info client, refresh it periodically, and treat a disagreement with a concurrently available `webData3` mode as unresolved until the sources converge. This prevents a stale REST cache or stale stream snapshot from silently selecting a balance model.
- `userSetAbstraction` accepts only `disabled`, `unifiedAccount`, or `portfolioMargin`. Changing mode is an explicit user-signed action. Never activate Unified automatically from a read result; `default`, legacy `dexAbstraction`, and unknown future responses must require an explicit supported-mode selection and fail closed for mode-dependent balance totals and funds actions.
- When account mode selects a different SDK action, source DEX, or transfer direction, capture the supported mode used to build the request and query `userAbstraction` again under the signing-session lock. Reject unavailable, unsupported, or changed results before calling the SDK. Ordinary order parameters do not branch on account mode and should not incur this extra request; their balance availability still fails closed until a supported mode is known.
- Funds preflight and final execution checks are separate. `useExchange` can await fresh legal access after `preExecutionGuard`, so withdrawals, sends, and internal transfers use its synchronous `executionGuard` to revalidate the original submission and current balance immediately before SDK entry. Bind the enqueue-time request object to its submission; a later same-amount request must not authorize the old one. Modal cleanup invalidates attempts but does not revoke signatures or transactions already handed to the SDK. Trading-signed methods reject `preExecutionGuard`, except the opted-in `TRADING_PRE_EXECUTION_GUARD_METHODS` in `useExchange` (currently `borrowLend`, which must also be a funds-lock method): their guard runs inside the funds lock after the fresh legal check and inside the signing-session lock, so its fresh requests start only after any funds action another tab was running has settled (whether the info endpoint reflects that action immediately is unverified). While the guard runs, every queued request on the same trading client waits, including urgent cancels and reduce-only orders; the guard itself is bounded at 10 seconds (ADR 0021 D12).
- CCTP withdrawal balance checks include the reviewed [`preTransferCheck.fee`](https://nktkas.gitbook.io/hyperliquid/api-reference/info-methods/pretransfercheck) activation debit in addition to the requested amount; Hyperliquid documents the separate [account activation fee](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/activation-gas-fee). The route fee is deducted from the requested amount, so do not add it again. Keep this arithmetic in the Big.js domain layer, reject invalid fees, and leave legacy withdrawals free of a CCTP activation debit. Asynchronous fee and eligibility checks remain remote snapshots, not a guarantee that remote state cannot change afterward.
- Deposit route-preflight errors must retain an explicit retry action even when the cached routing query is still ready. Retry refreshes routing only; a recovered route must not automatically resubmit a funds mutation. Keep uncertain post-signing outcomes on the existing reconciliation path.
- `fundingHistory({ coin, startTime, endTime })` returns one market's hourly funding records in ascending time order, at most 500 per response, with `startTime` inclusive; `coin` is the market name, and HIP-3 records keep their dex prefix (`xyz:AAPL`). Page with `fetchTimeRangeHistory` (cursor = last record time, deduplicate by `time`, `requireAscending`), pass an explicit `endTime`, validate that every record's `coin` equals the request, and require a complete snapshot before deriving cumulative values. Checked against the public endpoint on 2026-09-27 (a BTC 30-day window returned exactly 500 ascending rows). [Market funding history](market-funding-history.md) owns the terminal use.
- `activateOutcomeDeployer` is an L1 action and therefore uses the trading/Agent client, not the principal user-signed client.
- `userFees.stakingLink` is `null` or a discriminated union. The `requested` and `tradingUser` variants carry `stakingUser`; the `stakingUser` variant carries `tradingUser`. Narrow on `type` before reading either address.
- HTTP 429 is a deterministic rate-limit response and must not enter ambiguous-delivery reconciliation. Transport failures without a response, HTTP 408, and HTTP 5xx remain ambiguous.
- `maxMarketOrderNtls` takes no parameters and no user. SDK `0.33.3` declares the response as `[maxLeverage: number, maxMarketOrderNtl: string][]` with the notional matching `^[0-9]+(\.[0-9]+)?$`, and validates only the request. On 2026-09-27 Mainnet and Testnet both returned `[[25,"30000000.0"],[20,"5000000.0"],[10,"2000000.0"],[1,"500000.0"]]` in descending leverage order. Hyperliquid's [contract specifications](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/contract-specifications) tier the maximum market order value by the asset's max leverage (`>= 25` $30M, `[20, 25)` $5M, `[10, 20)` $2M, otherwise $500k; limit orders 10x). The terminal uses it only for the position TP/SL slippage advisory and, for parity with the official frontend, selects the tier by the position's current leverage (`docs/position-tpsl-slippage-warning.md`). Treat a non-array response or any malformed entry (anything other than an exactly two-element `[number, string]` tuple, including one with extra elements) as an unusable table rather than guessing. The archived `0.33.1` OpenAPI snapshot in `hyperliquid-sdk-1.md` describes the tuple as `[string, string]` with asset symbols; that is wrong for the installed contract and the live data.
- The SDK does not document whether `batchModify` preserves `positionTpsl` grouping for `s: "0"`. Keep this as a testnet verification requirement; do not replace or endorse that path based on inference alone.
- `webData3.perpDexStates[].perpsAtOpenInterestCap` is optional in SDK `0.33.3` and the array entries carry no dex name, so take the union across all entries and ignore missing fields or non-string items. Derive it from the existing account `webData3` subscription with identical params, options and `refreshKey`; a separately built key opens a second stream. Treat the set as known only for an active, non-stale snapshot whose `userState.user` matches the connected account; every other state is unknown and must not be presented or enforced as a cap. The client check is advisory: the exchange still rejects or cancels orders at the cap. See [open-interest cap](open-interest-cap.md) and [ADR 0023](adr/0023-open-interest-cap-advisory-check.md).
- `predictedFundings` takes no parameters and no user. SDK `0.33.3` declares the response as `[asset, [venue, { fundingRate, nextFundingTime, fundingIntervalHours? } | null][]][]`. Hyperliquid documents that predicted rates cover only the first perp dex, so asset names are main-dex names and HIP-3 markets never appear. On 2026-09-27 Mainnet returned 234 assets (about 64 KB) with the venues `HlPerp`, `BinPerp` and `BybitPerp`; `HlPerp` always reported a 1-hour interval, Binance 4 or 8 hours and Bybit 1, 4 or 8 hours, 69 venue entries were `null`, and 20 Binance entries had no `fundingIntervalHours` (all `"0.0"` rates on delisted coins). Each rate is per its own interval, so convert to an hourly rate before comparing venues. The terminal treats a missing Hyperliquid interval as 1 hour but shows a CEX rate without an interval as unavailable rather than guessing (the official frontend falls back to hard-coded coin lists), ignores unknown venue names, treats `null` as an unavailable venue, and rejects the whole snapshot when any asset or venue entry is malformed or duplicated. [Funding comparison](funding-comparison.md) owns the terminal use.
- `perpDexLimits({ dex })` returns `null` for the main dex and, for a HIP-3 dex, `coinToOiCap` as `[coin, oiCap]` tuples with dex-prefixed coin names (for example `km:AAPL`), matching `BuilderPerpMarket.name`. The SDK validates the request only, so parse the response as unknown and accept only an exact coin with a positive protocol decimal. The semantics of `totalOiCap`, `oiSzCapPerPerp` and `maxTransferNtl` are unverified; do not display or enforce them.

## Measured behavior the documentation does not state

These were measured against Mainnet while reviewing the history and onboarding work around commit `1d895685` (2026-08-27 to 2026-08-30). They were moved here from an agent's private notes on 2026-10-08 without being measured again; re-check them before relying on them for a new pagination, history or funds path.

- `userFillsByTime` with `aggregateByTime: true` applies its 2,000-row page limit after aggregation: the same window aggregated covers more time and still returns exactly 2,000 rows. The `userFills` snapshot is also exactly 2,000 rows after aggregation, so `length === 2000` is a reliable "limit reached" signal.
- The documented "only the most recent 10,000 fills" is not a hard cap for cursor paging: walking the time cursor returned 13,800 unique fills.
- `userFunding` returns exactly 500 rows per page in ascending time order (several coins can share one timestamp), and `(time, coin)` is unique. `userFillsByTime` is ascending by default; `reversed` flips it.
- A self-trade produces no fill (the resting order is canceled), so `(time, coin, tid)` identifies a user's fills without collisions.
- `fastAssetCtxs` sends one full snapshot and then only the coins that changed. A coin missing from later frames still has its last value; a per-coin staleness check is wrong for this stream. The compact `pac`/`sac` channels follow the same snapshot-then-delta pattern ([ADR 0008](adr/0008-compact-market-context-channels.md)).
- Trigger orders carry no time-in-force field; do not add TIF controls or validation to them.

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
