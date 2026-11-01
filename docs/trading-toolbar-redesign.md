# Trading toolbar redesign handoff

This document records the production data and theme mappings for the desktop and mobile trading toolbar redesign. The visual reference is
`design_handoff_trading_toolbar/交易工具栏 Redesign.dc.html`; API behavior is defined by the installed Hyperliquid SDK, the official API documentation, and the existing production order paths.

## Data mapping

Financial values remain decimal strings until they reach the locale formatter. Derived values use `Big.js` in the domain layer.

### Positions and account summary

| Design field | Official SDK field or derivation | Production usage | Source |
| --- | --- | --- | --- |
| Closable size | `abs(assetPositions[].position.szi)` | Quantize down to the market `szDecimals`; there is no separate `availableToClose` field | `packages/hl-react/src/account/use-user-positions.ts`, `apps/terminal/src/domain/trade/position-market-close.ts` |
| Entry price | `entryPx` | Preserve the SDK decimal string | `packages/hl-react/src/account/use-user-positions.ts` |
| Mark price | `PerpAssetCtx.markPx` | Join the position to the live market context; this field is not part of `Position` | `apps/terminal/src/components/trade/positions/positions-tab.tsx`, `apps/terminal/src/lib/hyperliquid` |
| Liquidation price | `liquidationPx` | Preserve the nullable decimal string | `packages/hl-react/src/account/use-user-positions.ts` |
| Position value | `positionValue` | Preserve the SDK decimal string | `packages/hl-react/src/account/use-user-positions.ts` |
| Position margin | `marginUsed` | Preserve the SDK decimal string | `packages/hl-react/src/account/use-user-positions.ts` |
| Account equity | Account-abstraction-aware balance summary | Unified and portfolio-margin modes use the Spot account value shared by every DEX, valued as the official portfolio value (`Ig`): an outcome balance `+N` at the mid of its market `#N`, and a token with no price at 0 (never at its entry notional), so one unpriced token no longer leaves the whole value unavailable. Prices count as complete only when the `allMids` snapshot is current and the spot catalog that maps tokens to markets has loaded; without both, the value stays unavailable (2026-10-31, P2 D5). Two differences remain: the official terminal uses spot mark prices where this terminal uses mids, and it skips fallback outcomes, which it reads from `info` `outcomeMeta`; this terminal does not load outcome metadata, so a fallback outcome that has a `#N` mid is counted; separate accounts use the selected DEX `marginSummary.accountValue` | `apps/terminal/src/domain/trade/balances.ts`, `apps/terminal/src/components/trade/positions/positions-panel.tsx` |
| Account maintenance-margin ratio | Mode-dependent derivation | Separate accounts use `crossMaintenanceMarginUsed / accountEquity`; unified accounts use the official maximum, per collateral token, of `crossMaintenanceMarginUsed / (spot total - isolated margin used)`; portfolio margin remains unavailable because the protocol does not expose an equivalent scalar | `apps/terminal/src/domain/trade/balances.ts`, `apps/terminal/src/components/trade/positions/positions-panel.tsx` |
| Position maintenance-margin ratio | Not returned by `clearinghouseState` | **Unresolved:** the prototype's `risk` value is fixture data and must not be treated as an API field | Hyperliquid `ClearinghouseStateResponse`, `packages/hl-react/src/account/use-user-positions.ts` |
| Maximum adjustable isolated margin | No standalone scalar is returned by the position or market schema | Do not display the prototype's fixture maximum. Removal is offered only when both the captured and live market constraints allow it, and the submitted delta remains subject to exchange validation | `apps/terminal/src/domain/trade/isolated-margin.ts`, `apps/terminal/src/components/trade/positions/position-isolated-margin-modal.tsx` |
| Unrealized PnL | `unrealizedPnl` | Prefer the exchange value for a whole position | `packages/hl-react/src/account/use-user-positions.ts` |
| ROE | `returnOnEquity` | Prefer the exchange value for a whole position | `packages/hl-react/src/account/use-user-positions.ts` |
| Price-change return | `unrealizedPnl / (abs(szi) * entryPx)` | Derived with `Big.js`; return unavailable for a zero denominator | Toolbar domain view model |
| Estimated partial-close PnL | Pro-rate whole-position `unrealizedPnl`; fallback `(markPx - entryPx) * closeSize * direction` | Long direction is `+1`; short direction is `-1` | `apps/terminal/src/domain/trade/position-market-close.ts` |
| Cumulative funding | `cumFunding.sinceOpen` | Preserve the existing UI sign convention and derive `-sinceOpen` with `Big.js` | `apps/terminal/src/domain/trade/position-toolbar.ts` |
| Hide small balances | Official `a3`: shown when the toggle is off, the token is HYPE, or the USDC value is at least $5. A balance row's USDC value is its total at the current price and 0 for a token without a price, as in the official balances table; the entry notional is what the token cost, not what it is worth, and is no longer used as a fallback (2026-11-01). A zero, negative or unreadable price counts as no price. The sums built on the same value (`getAccountEquityValue` and the unified-account spot value of `getAccountBalanceSummary`) count such a token as zero too; no surface displays those sums today, so the balances table's USDC Value and this filter are where the change shows | Balances tab rows under `SMALL_BALANCE_THRESHOLD_USD` ($5) are hidden while the toggle is on, except HYPE (2026-10-31, P2 B9; the threshold was $1 without a recorded reason). The official PNL (ROE %) and Contract columns are not shown: the balances table's visual contract (2026-08-05) excludes PNL, and changing it waits for an operator decision | `apps/terminal/src/config/trade.ts`, `apps/terminal/src/domain/trade/balances.ts` |

Official schemas: [Perpetuals info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals) and [account abstraction modes](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/account-abstraction-modes).

The summary fails closed while account-abstraction metadata, collateral-token metadata, or a complete account snapshot is unavailable. It never substitutes liquidation distance for a maintenance-margin ratio. Decimal aggregation is performed with `Big.js`; only the locale formatter receives the final string.

### Open orders

| Design field | `FrontendOpenOrder` field | Production meaning |
| --- | --- | --- |
| Time | `timestamp` | Millisecond timestamp |
| Market | `coin` | Preserve the HIP-3 DEX-qualified identity |
| Side | `side` plus `reduceOnly` | Ordinary `B/A` displays Buy/Sell; reduce-only `B` displays Close Short and reduce-only `A` displays Close Long. No long/short opening direction is inferred. |
| Remaining size | `sz` | The design's current quantity |
| Original size | `origSz` | Never changes when the remaining order is modified or partially filled |
| Limit price | `limitPx` | For a trigger-market order this may be an execution-protection price, not the trigger price |
| Trigger price | `triggerPx` | Use with `triggerCondition` and `isTrigger` |
| Reduce only | `reduceOnly` | Direct boolean |
| Display type | `orderType` | Display metadata only; it cannot be passed back as an exchange order type |
| Time in force | `tif` | Rebuild `Gtc`, `Ioc`, or `Alo` limit parameters when modifying |
| Position TP/SL | `isPositionTpsl` | Position-level TP/SL orders commonly use size `0` |
| Child orders | `children` | Attached TP/SL orders: the desktop TP/SL column and, since 2026-10-31 (P2 B20/D9), the TP/SL row of the expanded phone card show the take-profit and stop-loss trigger prices, as the official card's TP/SL field does |
| Client order id | `cloid` | Nullable 128-bit hex identifier |
| Remaining order value | Non-trigger: `limitPx * sz`; trigger: `triggerPx * sz` | Derived with `Big.js`; the toolbar intentionally shows the remaining, not original, notional. Default perps use the existing USD formatter, while spot and HIP-3 markets use their verified quote token instead of labelling every value USDC |
| Distance to mark | `abs(orderPrice - markPx) / markPx` | Derived with `Big.js`; unavailable for a zero mark |

SDK type: `@nktkas/hyperliquid` `FrontendOpenOrder`. Official schema: [Info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint).

### Exchange actions

Hyperliquid does not have a standalone `type: "market"` order parameter. The production market path uses a slippage-protected aggressive limit order.

| Action | Exchange order shape | Existing production source |
| --- | --- | --- |
| Market close | Opposite side, `r: true`, `t: { limit: { tif: "FrontendMarket" } }` | `apps/terminal/src/domain/trade/order-intent.ts`, `apps/terminal/src/hooks/trade/use-position-market-close-submit.ts` |
| Close all | One market-close child per open position, submitted as one `grouping: "na"` batch; every child remains opposite-side, reduce-only, and `FrontendMarket` | `apps/terminal/src/domain/trade/position-close-all.ts`, `apps/terminal/src/hooks/trade/use-position-close-all-submit.ts` |
| Limit close | Opposite side, `r: true`, `t: { limit: { tif: "Gtc" } }` | `apps/terminal/src/domain/trade/order-intent.ts`, `apps/terminal/src/hooks/trade/use-position-limit-close-submit.ts` |
| Reverse | Opposite side, size `2 * abs(szi)`, `r: false`, `FrontendMarket` | `apps/terminal/src/domain/trade/position-reverse.ts`, `apps/terminal/src/hooks/trade/use-position-reverse-submit.ts` |
| Position TP/SL, whole-position trigger-market | `{ a: assetId, b: !isLong, p: protectedPx, s: "0", r: true, t: { trigger: { isMarket: true, triggerPx, tpsl } } }`, grouping `positionTpsl`; `protectedPx` is the existing 10%-protected execution price | `apps/terminal/src/domain/trade/order-intent.ts`, `apps/terminal/src/components/trade/positions/position-tpsl-modal.tsx` |
| Position TP/SL, fixed partial size | The same complete position-TP/SL shape, but `s` is a positive size quantized down to `szDecimals`; the execution guard also requires it to be no greater than the current live position | `apps/terminal/src/domain/trade/order-intent.ts`, `apps/terminal/src/components/trade/positions/position-tpsl-modal.tsx` |
| Position TP/SL, trigger-limit | `{ a: assetId, b: !isLong, p: limitPx, s, r: true, t: { trigger: { isMarket: false, triggerPx, tpsl } } }`, grouping `positionTpsl` for new legs; buy limits must be at or above the trigger and sell limits at or below it | `apps/terminal/src/domain/trade/order-intent.ts`, `apps/terminal/src/components/trade/positions/position-tpsl-modal.tsx` |
| Modify order | `batchModify({ modifies: [{ oid, order: { a, b, p, s, r, t, c? } }] })` | `apps/terminal/src/domain/trade/open-order-modification.ts`, `apps/terminal/src/domain/trade/open-order-modification-form.ts` |
| Cancel order(s) | `cancel({ cancels: [{ a, o }] })` | Desktop and mobile open-order tabs |
| Cancel TWAP | `twapCancel({ a, t })` | `apps/terminal/src/hooks/trade/use-twap-cancel.ts` |
| Pause or resume TWAP | Not available | Keep the designed pause affordance disabled with an explicit protocol-capability explanation; never emulate pause with cancel/recreate |
| Adjust isolated margin | `updateIsolatedMargin({ asset, isBuy, ntli })`, where `ntli` is signed micro-USD | `apps/terminal/src/domain/trade/isolated-margin.ts`, `apps/terminal/src/components/trade/positions/position-isolated-margin-modal.tsx` |

Official action schema: [Exchange endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint).

The reverse action has no dedicated endpoint and the exchange does not return a pre-trade reverse liquidation price. The production flow therefore shows the estimate as unavailable. It binds the confirmed position size, owner, environment, DEX and asset metadata; obtains a fresh clearinghouse snapshot under an exclusive asset lock; rejects active/pending TWAP or order coordination; and requires a filled exchange confirmation before reporting success.

Close all captures every unfiltered open position for the active owner and environment; a table filter never narrows the destructive action. The preview expires after 30 seconds. Submission acquires an exclusive cross-tab reservation for every asset, refreshes `clearinghouseState` and `metaAndAssetCtxs` separately for every DEX, validates the encoded asset ID, context index, DEX, size precision, side, margin mode, collateral token, and current size, then submits the existing reduce-only `FrontendMarket` shape. A batch is final only when every response is terminal, every `filled.totalSz` exactly equals its requested size, and a post-fill `clearinghouseState` refresh reports every target size as zero. Mixed, resting, ambiguous, stale, or post-fill-residual results remain in reconciliation with their reservations retained; a terminal mixed success/error result is reported as partial and requires a fresh preview before retrying.

Because HIP-3 DEXs may use different collateral assets, the close-all summary never adds unlike currencies. It groups total notional and estimated PnL with `Big.js` by the verified market quote token and formats each group with the locale-aware quote formatter. Missing collateral metadata fails the preview closed.

Ordinary order modification is also fail-closed. The UI exposes ordinary limit orders, whose size and limit price can change (2026-10-30 audit, B3), and reduce-only Stop and Take Profit orders, whose size and trigger price can change. A trigger replacement is sent with `batchModify` `a: true`, which places it even when canceling the original failed (the original may have just triggered); the official terminal sends every modification that way. Only reduce-only triggers are offered, so such a replacement cannot open a position; a trigger that can open one stays cancel-and-replace (`unsupported-order-type`), and limit replacements keep the exchange's default, which refuses a GTC replacement that would execute at once. Orders with a client order id, which this terminal attaches to every order it places, can be modified like any other: as on the official terminal, the replacement is sent without a client order id, and confirmation compares the order id, size, trigger and limit price, never the client order id. A malformed client order id still fails closed. Grouped orders, position TP/SL, market/system/TWAP-slice orders and unsupported TIF values stay withheld. A new limit price must already sit on the market's tick; an off-tick price is refused with the same price-precision message the trigger editor uses. Both desktop inline editing and the mobile bottom sheet preserve raw input, reconstruct a complete exchange order, revalidate the live subscription and market binding at the execution boundary, and report success only after the open-orders subscription confirms the requested value. Confirmation waits only for the fields the user changed: an unedited size is not a condition, so a price change followed by a partial fill is still confirmed. When size and price change together and the order then shows the new price with less than the new size, fills after the replacement and a change made elsewhere both explain it; that result is left unconfirmed, never reported as failed. A 15-second subscription timeout never reports success and leaves cancellation available.

The TP/SL dialog keeps position size, entry/mark/trigger/limit prices, estimated PnL, risk/reward, and the 10% trigger-market protection price as decimal strings through its `Big.js` path. Whole-position trigger-market remains the backwards-compatible default (`s: "0"`, `isMarket: true`). Enabling a fixed amount emits a positive, precision-floored `s`; enabling trigger-limit emits `isMarket: false` and preserves the explicit per-leg limit in `p`. New legs are submitted with `grouping: "positionTpsl"`; existing legs are reconciled with a complete `batchModify` order shape, and removed legs use their captured asset and order IDs.

The official exchange schema and the installed SDK both accept the complete trigger order inside `batchModify`, but neither documents whether modifying an existing `positionTpsl` order preserves its grouping semantics. The project retains its already-established modify path while keeping whole-position, partial-size, market-trigger, and limit-trigger modification as a Testnet verification gate before release; the UI must not describe that grouping behavior as protocol-guaranteed.

The open-order aggregation records each TP/SL leg's trigger, order ID, size, market/limit execution flag, limit price, and side. Duplicate legs are marked ambiguous. A pair is incompatible when its leg sizes, execution modes, or sides differ, or when a leg is not reduce-only, has invalid prices, or violates the close-side trigger-limit relationship. Ambiguous or incompatible configurations fail closed: the dialog does not choose one duplicate or silently normalize a mixed pair, and instead requires the user to cancel the conflicting orders individually.

TP/SL execution is bound to the immutable target captured when the dialog opens: owner, environment, market/Dex, encoded asset ID, size precision, position side, and margin mode. The active wallet must still equal that owner. Before create or modify, the execution guard requires a fresh active-asset-context mark snapshot; cancellation remains available without a mark. Every request also requires non-stale position and open-order data, revalidates the live market binding and a non-zero position with the same side and margin mode, and rejects a positive fixed size above the current live position. A multi-leg workflow accepts only the initial order snapshot or an exact successful prefix reconstructed from exchange `resting.oid` responses. If a create or modify response cannot identify every resting order needed by a later step, the workflow stops for reconciliation and never guesses which order to cancel. External changes, partial failures, and uncertain responses block retry until a fresh dialog is opened.

Stop-loss validation uses the live mark boundary and, when available, the position liquidation boundary. A long stop must satisfy `liquidationPx < stopPx < markPx`; a short stop must satisfy `markPx < stopPx < liquidationPx`. If the liquidation price is missing or non-positive, the implementation still enforces the mark-side boundary and does not invent a liquidation estimate.

The isolated-margin dialog uses the same immutable execution-identity rule. Its target captures owner, environment, coin, Dex, asset ID, side, and market constraint. Submission requires the current wallet to match the owner and revalidates the live market metadata, non-stale isolated position, side, constraint, and action parameters. This does not create an unsupported precomputed maximum-adjustable-margin field: strict-market removal capability and exchange validation remain authoritative.

Cancel All is deliberately independent of visible table filters. Opening the confirmation requires an active, non-stale open-orders snapshot whose subscription owner equals both the active trading owner and wallet, and captures the environment plus the exact sorted set of `(coin, oid)` identities and the corresponding full orders. Confirming recomputes that identity snapshot. Any account, wallet, environment, readiness, order-set membership, order identity, or duplicate-identity change blocks submission and requires a fresh confirmation; only the captured unfiltered order list is sent after validation. Changes to non-identity display fields do not alter the cancel target because the exchange cancel shape is only `{ a, o }`.

### Mobile filter mappings

Mobile filters are backed by real SDK fields and reset with owner-keyed component state. Filtered rows drive the visible count, expand/collapse scope, exports, and applicable summaries; destructive Cancel All continues to use the unfiltered live order snapshot.

| Surface | Filter | SDK/production field mapping |
| --- | --- | --- |
| Open orders | Type | `FrontendOpenOrder.isTrigger`: trigger vs ordinary limit |
| Open orders | Direction | `FrontendOpenOrder.side`: `B` = buy, `A` = sell; display labels still combine `side` with `reduceOnly` |
| Trade history | Type | The account's own or a protocol liquidation first (see History values: a fill against another account's liquidation is an ordinary trade), otherwise ordinary trade. TWAP slice fills are not part of this list: `userFills` does not return them (measured 2026-11-01, see `hyperliquid-sdk-reference.md`); they appear under the TWAP tab's Fill History, as on the official terminal. The earlier wording that labeled a numeric `twapId` was left over from a removed 2026-08-05 filter option |
| Trade history | Direction | `UserFillsResponse[].side`: `B` = buy, `A` = sell |
| Trade history | Role | `UserFillsResponse[].crossed`: `true` = taker, `false` = maker |
| Funding history | Position direction | Sign of `userFundings.fundings[].szi`, parsed with `Big.js`: positive = long, negative = short; zero/invalid values do not match either direction |
| Order history | Type | Exact `HistoricalOrdersResponse[].order.orderType`, displayed through the existing order-type label helper |
| Order history | Direction | `HistoricalOrdersResponse[].order.side`: `B` = buy, `A` = sell |
| Order history | Status | Exact `status` grouped into open, filled, triggered, canceled (via the production canceled-status helper), rejected, or other |

The trade history filters search past the live window (2026-11-01). The `userFills` subscription list holds the latest 30 fills, so while any trade-history filter is on, the phone tab also loads the `userFills` Info snapshot (up to 2,000 fills, `useTradeHistory` with `enabled`, the query the trade history page uses) and merges it with the live fills by `(time, coin, tid)`, keeping the live copy of a fill; the list still shows at most 30 matching fills, and View all and Export CSV cover the rest. Clearing every filter returns the list to the live fills and stops reading the snapshot. This follows the official terminal, whose filter row calls `ensureCompleteHistory` as soon as a filter is set and merges the complete `userFills` answer with the subscription by the same key (production bundle of 2026-10-31, `config-BhZylSmU.js`). Unlike the official terminal, which shows "No results match your filters." while that answer is still loading or after it failed, the no-match message appears only once the snapshot has loaded for the current owner and network and the live fills are current, and it names the 2,000-fill boundary when the snapshot reached it; the loading, failure and retry presentation is in [mobile data presentation](mobile-data-presentation.md). The order history and funding filters still search only their latest 30 rows; the official terminal backfills `historicalOrders` and `userFunding` the same way, and closing that gap is a separate change.

### History values

The desktop panel, the mobile cards and the full history pages follow the official terminal here (audit of 2026-10-30, items B1, B2, B5, B10, B16, B19 and D3).

- **Fill direction** (`lib/trade/fill-direction.ts`). A fill is the account's own liquidation only when `liquidation.liquidatedUser` is absent or equals the owner, compared without case; it reads "Market Order Liquidation: {direction}" in the danger colour. A fill against another account's liquidation keeps its side's colour and reads "{direction} (Price Improved)". Protocol directions keep their names: `Liquidated …` reads "Backstop Liquidation: …", `Backstop Borrow Liquidation` reads "Full Borrow Liquidation", and `Partial Borrow Liquidation` and `Auto-Deleveraging` stay as sent. `Buy`, `Sell`, `Long > Short` and `Short > Long` are translated; an unknown direction is shown as sent.
- **Prices** (`lib/trade/market-price-format.ts`). Fill, order, trigger and protection prices use `formatPrice` with the market's `szDecimals` and type (Hyperliquid's 6 or 8 minus `szDecimals` decimals), never the compact or two-decimal dollar format. A market missing from the catalog keeps up to six decimals.
- **Funding** (`lib/trade/funding-position.ts`). The position shows its side (Long or Short, from the sign of `szi`) beside the absolute size, and the payment is in the market's collateral: the HIP-3 DEX quote token for `builderPerp` markets, otherwise USDC. A HIP-3 payment whose market is no longer listed, or whose quote token has not loaded, shows the amount without a token (`-` in the CSV) instead of guessing USDC.
- **Positions** (`lib/trade/collateral-amount.ts`). Unrealized PnL, margin and funding of a HIP-3 DEX position are amounts of its collateral token, like its position value; USDC markets keep the dollar format.
- **Closed PNL** (`getUserFillNetClosedPnl` in `lib/trade/user-fills.ts`). Trade rows on the desktop tab, the phone cards and the trade history page show the fill's closed PNL net of its fee, as the official terminal does (`l4`): the exchange's `closedPnl` leaves the fee out, so a fee paid in the market's quote or collateral token is subtracted as is and any other fee (a spot buy pays in the base token) at the fill price; an opening fill therefore shows its fee as a loss. An outcome's fee token counts as its quote. When a fee was paid and the catalog cannot tell the market's quote token (a delisted HIP-3 or spot market), the cell stays empty rather than guessing. The CSV keeps the exchange's `closedPnl` and `fee` columns as sent (this contract), unlike the official CSV, which exports the net value. The official tables also have a Trade Value column; adding it changes the layout and waits for the same operator decision as the order history columns (audit of 2026-10-30, item B8).
- **Order statuses** (`getHistoricalOrderStatusPresentation`, `components/trade/positions/historical-order-status-badge.tsx`). As on the official terminal, the canceled and rejected statuses fold into Canceled and Rejected, each with its own reason (`lib/trade/order-status-reasons.ts`, the same wording as the notifications): in a tooltip and a screen-reader description on the desktop tables, and as a line under the status on the phone cards. `marginCanceled` reads Margin Canceled, and a `filled` order with size still open reads Partially filled. The status filter keeps its categories, and the CSV status column uses the same label. The official order history also has Direction, Filled Size, Order Value, Reduce Only, Trigger Conditions, TP/SL and Order ID columns and shows the remaining size; adding them changes this table's layout and waits for an operator decision (audit of 2026-10-30, item B7).
- **Order types** (`hooks/trade/use-order-display-labels.ts`, `lib/trade/historical-orders.ts`). The known types are translated; `Trailing Stop Market`, which the official terminal places with its `trailingStop` action, reads Trailing Stop; any other `orderType` is shown exactly as the exchange sends it. An order type the terminal does not know never makes an order-history snapshot invalid (it used to blank the whole table and fail the CSV export), and a trailing stop is never treated as a position TP/SL (`buildTpSlOrdersByCoin` skips it, as the official terminal does). Its trigger condition follows the official terminal's reading of `triggerCondition` (`retracement X`, optional `activation above|below Y`, `best Z` or `best waiting`; `lib/trade/trailing-stop-condition.ts`): Activation: price / Retracement before activation, Trigger: price / Retracement after it, where the trigger is the best price minus the retracement for a sell and plus it for a buy (a `%` retracement is a share of the best price), and Watermark: best price in the desktop tooltip and after the text on the phone card. A condition outside that grammar is shown as sent. The grammar comes from the official terminal's parser; no live sample was available to test against (audit of 2026-10-30, item B11).
- **Dates** (2026-11-01). Desktop history tables (trades, orders, funding, TWAP history and fill history, deposits and withdrawals, the trade and funding history pages) and their CSV exports write the full date with the year, `formatDateTime(time, { locale, dateStyle: "short", timeStyle: "short" })` (the deposits and withdrawals export keeps the ISO 8601 UTC time it has always written, which includes the year), as the official terminal's history tables do (`toLocaleString` with the year, and the same formatter for funding, interest, transfer and TWAP rows in its 2026-10-31 bundle). A history that spans a new year, or an export read later, cannot be dated without it. The full trade and funding history pages use the same date on their phone cards; the Trade page's phone account cards keep the compact `formatDateTimeShort`, which leaves out the year to fit the card.
- **Token names** (2026-11-01, [ADR 0048](adr/0048-official-spot-display-names-and-addresses.md)). Balances, the fee token of a fill (desktop tab, phone cards, TWAP fill history, the trade history page) and the amounts and fees of deposits and withdrawals name a spot token by the official terminal's display name (`getTokenDisplayName`, `AssetDisplay isToken`): a `UBTC` fee reads BTC, a balance of the protocol token `PUMP` reads PUMP-26. Their CSV exports keep the protocol names (`coin`, `feeToken`, the ledger token), under the next rule; the official trade-history CSV writes display names. [Spot market names](spot-market-names.md) owns the table.
- **CSV exports** carry the exchange's values unformatted, as the trade-history export already did. Funding exports Side, Size (the absolute `szi`), Rate (`fundingRate`), Payment (`usdc`) and Payment Token; order history exports the raw `limitPx`, trigger price and size. Headers and labels are translated; numbers are never localized, rounded or compacted.
- **Deposits and withdrawals** (`lib/trade/account-ledger.ts`). A `send` to USDC's spot system address (`0x2000…0000`) on the spot DEX is a CCTP withdrawal, and a `send` to the owner from the network's CoreDepositWallet (USDC's linked HyperEVM contract, `config/cctp.ts`) is a CCTP deposit. Any other `send` or `spotTransfer` through a HyperCore system address (`0x2222…` for HYPE, `0x2000…` plus the token index otherwise), and a `send` between the owner's own balances, is a Transfer. A system address on the spot DEX shows as HyperEVM. The official terminal reads the chain beyond HyperEVM from Across's `hyperliquid-transfers` API; this terminal does not call it, so a CCTP row shows HyperEVM where the official shows Arbitrum or another chain, as the official itself does when that API has no record for the transfer. Transfers with the owner's own sub-accounts (`subAccountTransfer`, and an `internalTransfer`, `spotTransfer` or `send` whose other side is one of them) read Sub-account Transfer; the sub-accounts come from `info.subAccounts`, and while that list is missing these rows keep their ordinary label. An `internalTransfer` sent by one of the two accounts that pay open interest rewards (`0x995e…82ba`, `0x4e8b…9d0f`, as the official terminal lists them) reads Open Interest Reward.

### PnL sharing

The share snapshot uses the exchange position's `unrealizedPnl` and `returnOnEquity`, the current joined mark-price snapshot, the position entry price, direction, leverage, full market identity, DEX, environment, and verified quote token. The browser renders a local Canvas PNG after fonts and QR generation are ready; no position or account data is sent to an image service. Mainnet links use the canonical market route and preserve only an explicit `scope=all` query value. Testnet exports are visibly labelled and intentionally omit the link and QR rather than silently opening a Mainnet route. Closing the dialog or switching the selected snapshot invalidates in-flight exports. Mobile prefers Web Share with a PNG file and falls back to the local download path.

## Desktop grid behavior

At the compact-desktop breakpoint the account table owns the fixed ten-column left region and can be resized vertically from its south edge, but not horizontally. Its default 26.4-row height provides an approximately 868px table viewport, so the full current position set uses the page's document scroll instead of introducing a nested table scrollbar. Trading remains at the upper right; market data and account information form the right-side stack. All seven keyed panels remain mounted and the 14-column geometry is unchanged. Storage key `v7` invalidates the former compact geometry, including `v6`, so stale saved dimensions cannot restore the double-scroll layout.

## Theme-token mapping

Light-mode values below are exact where the existing market-close tokens are used; their dark values already follow the terminal semantic contrast system.

| Design reference | Existing token / utility | Status |
| --- | --- | --- |
| `#FFFFFF` panel and dialog | `bg-surface`, `bg-modal` | Exact |
| `#1A2330` strong text | `text-market-close-fg` | Exact in light; theme-aware in dark |
| `#6B7686` secondary text | `text-market-close-muted` | Exact in light; theme-aware in dark |
| `#98A2B0` subtle text | `text-market-close-subtle` | Exact in light; theme-aware in dark |
| `#E3E8EE` card stroke | `border-market-close-stroke-card` | Exact in light; theme-aware in dark |
| `#D8DFE7` input stroke | `border-market-close-stroke-input` | Exact in light; theme-aware in dark |
| `#C6CFD9` control stroke | `border-market-close-stroke-control` | Exact in light; theme-aware in dark |
| `#F7F9FB` card surface | `bg-market-close-card` | Exact in light; theme-aware in dark |
| `#F1F4F8` hover surface | `bg-market-close-hover` | Exact in light; theme-aware in dark |
| `#1F8A5A` long/profit | `text-market-close-success` | Exact in light; theme-aware in dark |
| `#D6453D` short/loss/danger | `text-market-close-danger`, `bg-market-close-danger` | Exact in light; theme-aware in dark |
| Selected dark control | `bg-market-close-control`, `text-market-close-on-control` | Exact in light; theme-aware in dark |
| `#D98E1F` warning | Closest existing semantic token is `warning` | Not pixel-exact |
| `#EFC3BF` pale danger / disabled action | `market-close-danger-disabled` | Exact in light; dark uses the existing disabled-fill contrast token |
| `#EAF5EF`, `#EDF1F5` badge fills | Closest are `success-soft` and `fill-weak` | Not pixel-exact |
| `#EEF1F5` desktop underlay | `bg-grid-container` is required by the desktop layout contract | Existing value differs slightly |
| Fixed dark share card colors | `position-share-*` inverse-canvas tokens | Intentionally fixed for identical on-screen and exported PNG branding in both themes |
| Design scrim | `bg-scrim/60` | Existing theme overlay token; modal shadows remain component-local design values. 2026-10-09: superseded by the shared `bg-scrim` / `bg-scrim-sheet` backdrops owned by the dialog primitives (`.claude/rules/style-ui-guide.md`, Dialog chrome); dialogs no longer set their own scrim |

The remaining non-exact badge, warning, underlay, and shadow rows continue to reuse project semantics. Adding new shared theme tokens still requires explicit approval.

## Internationalization

Lingui source messages remain English. The existing catalogs cover English, Chinese, Japanese, Hindi, Spanish, French, and Arabic.

Existing keys cover the seven tabs and most base field labels, including `Balances`, `Positions`, `Open Orders`, `TWAP`, `Trade History`, `Funding History`, `Order History`, `Account Value`, `Margin Ratio`, `Entry Price`, `Mark Price`, `Liquidation Price`, `Funding`, `TP/SL`, `Limit Close`, `Market Close`, `Reverse`, `Cancel All`, and `Export CSV`.

The toolbar messages include:

- account-summary labels, PnL display-mode labels, and the four column-help tooltips;
- expand/collapse-all controls, asset/type/direction/status filters, and empty-state copy;
- close-all, cancel-all, reverse, modify-order, isolated-margin, TP/SL, and PnL-share confirmation copy;
- remaining order value, distance to mark, TWAP progress/frequency/remaining time, and operation results;
- interpolated quantities, symbols, order counts, and submission toasts.

`pnpm --filter @sairn/terminal i18n:extract` and `i18n:compile` are part of the verification pass. English source messages and Chinese translations are registered, including close-all lifecycle/error states, the disabled TWAP explanation, margin-mode filtering, and PnL-share/Testnet states. Existing untranslated Arabic, Spanish, French, and Hindi entries continue to use the project's English fallback rather than hard-coded UI text.

Correction (2026-09-28): English fallback is not a standing policy for these maintained languages. The Arabic, Spanish, French and Hindi strings from this work that were still untranslated, including the mobile order book `Total ({sizeToken})` header and the TWAP trigger hints, are now translated. On that date 18 entries per language remained untranslated, mostly from the mobile pairing flow.

## Production decisions

- The TWAP pause control remains present but disabled with an explanation because the exchange has no pause/resume action.
- Isolated-margin removal continues to rely on live market capability and exchange validation; the prototype's fixed 50% or maximum-adjustable-margin fixture is not production data and is not rendered as an API-derived value.
- Close all uses a short-lived all-position snapshot, cross-DEX refresh and reservations, exact filled-size checks, post-fill zero-position verification, and a fresh-preview retry requirement.
- Cancel All uses the exact unfiltered `(coin, oid)` set captured for the active owner, wallet, and environment; any order-set identity or session identity change invalidates the confirmation.
- Position TP/SL supports whole or fixed partial size and trigger-market or trigger-limit execution while preserving whole-position trigger-market as the default. Mixed, duplicate, stale, or identity-mismatched live configurations fail closed.
- PnL sharing uses a local Canvas/QR lifecycle, preserves full DEX and quote identity, and disables ambiguous Testnet market links. Its fixed inverse canvas tokens are an intentional branded-export exception to theme switching.

## Decisions pending confirmation

1. Replace the unavailable position-level margin ratio with a documented liquidation-distance metric using the project's existing 10% warning and 5% danger thresholds, or omit the row-level bar.
2. Replace the reverse liquidation-price placeholder only if a verified margin model becomes available.
3. Add the missing shared semantic theme tokens, or accept small light-mode visual differences by using the closest existing tokens.
