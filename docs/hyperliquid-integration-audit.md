# Hyperliquid Integration Audit

Date: 2026-04-09

## Scope

This audit reviews every direct Hyperliquid `Info`, `Subscription`, and `Exchange` call path under `apps/terminal/src`.

## Source of truth

Primary sources used for protocol checks:

- Hyperliquid websocket subscriptions docs: <https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions>
- Hyperliquid info endpoint docs: <https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint>
- Hyperliquid exchange endpoint docs: <https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint>
- Hyperliquid asset IDs docs: <https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids>

Secondary code references used to confirm local assumptions:

- `packages/hl-react/src/asset-id.ts`
- `/tmp/hyper-skill-research/hyperliquid-ts/src/utils/_symbolConverter.ts`

## Summary

Most of the integration is structurally correct:

- market bootstrap uses the right `Info` and websocket feeds
- order book and trade tape use the right market-data subscriptions
- historical fills, fundings, and historical orders use the correct user feeds
- exchange write paths use the correct asset-id shape for perps, builder perps, and spot

The main problems are concentrated in:

- mobile flows that collapse `allDexsClearinghouseState` down to the default perp dex and then treat that as the whole account
- a shared leverage hook that was subscribing to a perp-only feed on spot markets
- chart and badge surfaces that were not consistently using cross-dex open-order scope
- one TradingView datafeed shortcut that is still only partially builder-perp aware

## Findings

### Open

1. `apps/terminal/src/components/trade/mobile/mobile-trade-view.tsx`
   The mobile trade form still derives `availableBalance` from `perpSummary` and looks up the current position from `perpPositions` in `useAccountBalances()`. That helper only exposes the default perp dex from `allDexsClearinghouseState`, so builder-perp balances and positions are invisible here. The position lookup also compares against `baseToken`, while builder perps are identified as `{dex}:{coin}` in the official asset-id model. This means max-size, available-balance, and position-offset calculations can be wrong on builder perps.

2. `apps/terminal/src/components/trade/mobile/mobile-trade-view.tsx`
   The mobile trade form still assumes perp semantics even when the selected market is spot. It renders Long/Short language, always shows leverage, and uses perp-account availability instead of spot balances. The desktop trade panel does not have this issue because it routes through `useOrderEntryData()` and `deriveOrderEntry()`.

3. `apps/terminal/src/components/trade/chart/datafeed.ts`
   TradingView price-scale inference uses `getInfoClient().allMids()` without a dex parameter. The official docs say omitted `dex` uses the first perp dex and only includes spot mids there. For builder-perp coins this means `inferPriceScale()` can fall back to the default price scale instead of using a verified mid. Candle fetching itself is correct because the app passes the required `dex:coin` prefix for HIP-3 markets.

### Resolved during this audit

1. `apps/terminal/src/hooks/trade/use-asset-leverage.ts`
   `activeAssetData` is documented as perp-only. The hook was subscribing to it for every selected market, including spot. The hook now only subscribes when the selected market is `perp` or `builderPerp`, and the leverage update actions now early-return outside perp markets.

2. `apps/terminal/src/components/trade/chart/kline-chart.tsx`
   The order-overlay subscription was reading `openOrders` without a `dex` parameter, which defaults to the first perp dex. It now requests cross-dex open orders, so builder-perp orders can appear on the chart overlay.

3. `apps/terminal/src/components/trade/mobile/mobile-terminal.tsx`
   The bottom-nav badge was undercounting in two different ways:
   - it subscribed to `openOrders` without cross-dex scope
   - it counted positions from `useAccountBalances()`, which only exposes the default perp dex
   It now uses cross-dex open orders and `useUserPositions()` for position counts.

4. `apps/terminal/src/components/trade/mobile/mobile-positions-view.tsx`
   The mobile positions-tab count was using default-dex `perpPositions` instead of `useUserPositions()`. It now counts positions from the cross-dex user-positions hook.

## Method-by-method assessment

### Subscription

| Method | Files | Status | Notes |
| --- | --- | --- | --- |
| `allDexsAssetCtxs` | `lib/hyperliquid/hooks/useMarketsInfo.ts` | Verified | Correct feed for unified perp + builder-perp market contexts. |
| `spotAssetCtxs` | `lib/hyperliquid/hooks/useMarketsInfo.ts` | Verified | Correct spot market context feed. |
| `allDexsClearinghouseState` | `hooks/trade/use-account-balances.ts`, `packages/hl-react/src/account/use-user-positions.ts` | Mixed | `useUserPositions()` uses it correctly across all dexs. `useAccountBalances()` intentionally narrows it to the default dex and must not be treated as whole-account state. |
| `spotState` | `hooks/trade/use-account-balances.ts` | Verified | Correct user spot balance feed. |
| `activeAssetCtx` | `market-overview.tsx`, `use-document-title.ts`, `position-limit-close-modal.tsx` | Verified | Correct for perp and builder-perp market context. |
| `activeSpotAssetCtx` | `market-overview.tsx`, `use-document-title.ts` | Verified | Correct spot context feed. |
| `activeAssetData` | `hooks/trade/use-asset-leverage.ts` | Fixed | Now restricted to perp markets only. |
| `allMids` | `positions-tab.tsx`, `mobile-positions-tab.tsx`, `balances-tab.tsx`, `mobile-balances-tab.tsx` | Verified | Current app uses cross-dex scope here. |
| `openOrders` | `orders-tab.tsx`, `mobile-orders-tab.tsx`, `positions-tab.tsx`, `positions-panel.tsx`, `mobile-positions-tab.tsx`, `mobile-positions-view.tsx`, `mobile-terminal.tsx`, `chart/kline-chart.tsx` | Mixed | The main tabs are correct after the recent fixes. Chart overlay and mobile terminal were fixed in this audit. |
| `twapStates` | `twap-tab.tsx`, `mobile-twap-tab.tsx`, `positions-panel.tsx` | Verified | Correct cross-dex scope in current app. |
| `userFills` | `history-tab.tsx`, `mobile-history-tab.tsx` | Verified | Correct user feed. `aggregateByTime` usage is supported. |
| `userFundings` | `funding-tab.tsx`, `mobile-funding-tab.tsx` | Verified | Correct user feed. |
| `userHistoricalOrders` | `orders-history-tab.tsx`, `mobile-orders-history-tab.tsx` | Verified | Correct user feed. |
| `l2Book` | `orderbook-panel.tsx`, `mobile-book-view.tsx` | Verified | Correct feed and optional `nSigFigs` / `mantissa` usage. |
| `trades` | `orderbook/trades-panel.tsx` | Verified | Correct per-coin trade feed. |
| `candle` | `chart/kline-chart.tsx` | Verified | Correct per-coin candle stream. |

### Info

| Method | Files | Status | Notes |
| --- | --- | --- | --- |
| `meta` | `lib/hyperliquid/markets/use-markets.tsx`, `chart/datafeed.ts` | Verified | Correct for default perps. Builder-perp metadata is sourced separately via `allPerpMetas` in market bootstrap. |
| `spotMeta` | `lib/hyperliquid/markets/use-markets.tsx` | Verified | Correct spot market bootstrap. |
| `perpDexs` | `lib/hyperliquid/markets/use-markets.tsx` | Verified | Correct builder-dex discovery. |
| `allPerpMetas` | `lib/hyperliquid/markets/use-markets.tsx` | Verified | Correct builder-perp universe bootstrap. |
| `userFees` | `hooks/trade/use-fee-rates.ts` | Verified | Correct request shape. |
| `allMids` | `chart/datafeed.ts` | Note | Works for default perp + spot mids, but builder-perp price-scale inference is incomplete without dex-aware mids. |
| `candleSnapshot` | `chart/datafeed.ts`, `chart/kline-chart.tsx` | Verified | Correct request shape. HIP-3 candles are fetched with the required `dex:coin` naming. |

### Exchange

| Method | Files | Status | Notes |
| --- | --- | --- | --- |
| `order` | `tradebox/trade-panel.tsx`, `mobile/mobile-trade-view.tsx`, `positions/positions-tab.tsx`, `mobile/mobile-positions-tab.tsx`, `position-limit-close-modal.tsx`, `position-tpsl-modal.tsx`, `components/spot-swap-modal.tsx` | Mixed | Request shapes are correct. The remaining risk is mobile trade-flow state derivation, not the `order` payload itself. |
| `twapOrder` | `tradebox/trade-panel.tsx` | Verified | Correct `twap` payload shape. |
| `cancel` | `orders-tab.tsx`, `mobile-orders-tab.tsx` | Verified | Correct `{ a, o }` cancel payloads using asset ids from market mapping. |
| `updateLeverage` | `hooks/trade/use-asset-leverage.ts` | Fixed | Request shape is correct. Hook no longer subscribes to perp-only state on spot markets. |
| `sendAsset` | `positions/send-dialog.tsx`, `positions/transfer-dialog.tsx` | Verified | Correct for default-perp and spot transfer flows the UI currently exposes. |
| `spotSend` | `positions/send-dialog.tsx` | Verified | Correct request shape. |
| `withdraw3` | `tradebox/deposit-modal.tsx` | Verified | Correct withdrawal action usage. |

## Notes

1. Asset-id mapping is correct in the current app.
   - main perps: `asset = index in meta`
   - builder perps: `asset = 100000 + perpDexIndex * 10000 + indexInMeta`
   - spot: `asset = 10000 + spotIndex`

2. Builder-perp naming is consistently modeled as `{dex}:{coin}` in the official asset-id docs and in the local typed SDK helper. That means any code path that strips the dex prefix too early is suspect.

3. The app relies on `dex: "ALL_DEXS"` across websocket subscriptions.
   - This is not described in the official HTTP docs.
   - A quick live check on 2026-04-09 showed `POST /info` with `{"type":"allMids","dex":"ALL_DEXS"}` returns `null`.
   - A quick websocket check on the same date showed the server accepts the subscription ack for `{"type":"allMids","dex":"ALL_DEXS"}`.
   - Treat `ALL_DEXS` as websocket-specific and undocumented unless Hyperliquid documents it explicitly.

## Recommended next steps

1. Refactor `mobile-trade-view.tsx` to reuse the same spot/perp-aware derivation path as the desktop trade panel.
2. Split `useAccountBalances()` into two explicit helpers:
   - `useDefaultDexBalances()` for main perp + spot summary
   - `useAllDexsAccountState()` for whole-account builder-aware views
3. Make the TradingView datafeed builder-aware for price-scale inference instead of falling back to the default scale.
