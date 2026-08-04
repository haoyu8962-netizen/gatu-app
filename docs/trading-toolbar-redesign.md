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
| Account equity | Existing account-abstraction-aware balance summary | Do not blindly add values from independent DEX accounts | `apps/terminal/src/domain/trade/balances.ts`, `apps/terminal/src/components/trade/tradebox/account-panel.tsx` |
| Account maintenance-margin ratio | `crossMaintenanceMarginUsed / accountEquity` | Reuse the account-panel meaning and handle a zero denominator | `apps/terminal/src/domain/trade/balances.ts`, `apps/terminal/src/components/trade/tradebox/account-panel.tsx` |
| Position maintenance-margin ratio | Not returned by `clearinghouseState` | **Unresolved:** the prototype's `risk` value is fixture data and must not be treated as an API field | Hyperliquid `ClearinghouseStateResponse`, `packages/hl-react/src/account/use-user-positions.ts` |
| Unrealized PnL | `unrealizedPnl` | Prefer the exchange value for a whole position | `packages/hl-react/src/account/use-user-positions.ts` |
| ROE | `returnOnEquity` | Prefer the exchange value for a whole position | `packages/hl-react/src/account/use-user-positions.ts` |
| Price-change return | `unrealizedPnl / (abs(szi) * entryPx)` | Derived with `Big.js`; return unavailable for a zero denominator | Toolbar domain view model |
| Estimated partial-close PnL | Pro-rate whole-position `unrealizedPnl`; fallback `(markPx - entryPx) * closeSize * direction` | Long direction is `+1`; short direction is `-1` | `apps/terminal/src/domain/trade/position-market-close.ts` |
| Cumulative funding | `cumFunding.sinceOpen` | Preserve the existing UI sign convention and display `-sinceOpen` | `apps/terminal/src/components/trade/positions/position-row.tsx`, `apps/terminal/src/components/trade/mobile/mobile-position-card.tsx` |

Official schema: [Perpetuals info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals).

### Open orders

| Design field | `FrontendOpenOrder` field | Production meaning |
| --- | --- | --- |
| Time | `timestamp` | Millisecond timestamp |
| Market | `coin` | Preserve the HIP-3 DEX-qualified identity |
| Side | `side` | `B` means buy and `A` means sell; this is not always equivalent to long/short because a reduce-only buy can close a short |
| Remaining size | `sz` | The design's current quantity |
| Original size | `origSz` | Never changes when the remaining order is modified or partially filled |
| Limit price | `limitPx` | For a trigger-market order this may be an execution-protection price, not the trigger price |
| Trigger price | `triggerPx` | Use with `triggerCondition` and `isTrigger` |
| Reduce only | `reduceOnly` | Direct boolean |
| Display type | `orderType` | Display metadata only; it cannot be passed back as an exchange order type |
| Time in force | `tif` | Rebuild `Gtc`, `Ioc`, or `Alo` limit parameters when modifying |
| Position TP/SL | `isPositionTpsl` | Position-level TP/SL orders commonly use size `0` |
| Child orders | `children` | Attached TP/SL orders |
| Client order id | `cloid` | Nullable 128-bit hex identifier |
| Remaining order value | Non-trigger: `limitPx * sz`; trigger: `triggerPx * sz` | Derived with `Big.js`; **pending product confirmation** |
| Distance to mark | `abs(orderPrice - markPx) / markPx` | Derived with `Big.js`; unavailable for a zero mark |

SDK type: `@nktkas/hyperliquid` `FrontendOpenOrder`. Official schema: [Info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint).

### Exchange actions

Hyperliquid does not have a standalone `type: "market"` order parameter. The production market path uses a slippage-protected aggressive limit order.

| Action | Exchange order shape | Existing production source |
| --- | --- | --- |
| Market close | Opposite side, `r: true`, `t: { limit: { tif: "FrontendMarket" } }` | `apps/terminal/src/domain/trade/order-intent.ts`, `apps/terminal/src/hooks/trade/use-position-market-close-submit.ts` |
| Limit close | Opposite side, `r: true`, `t: { limit: { tif: "Gtc" } }` | `apps/terminal/src/domain/trade/order-intent.ts`, `apps/terminal/src/hooks/trade/use-position-limit-close-submit.ts` |
| Reverse | Opposite side, size `2 * abs(szi)`, `r: false`, `FrontendMarket` | `apps/terminal/src/domain/trade/order-intent.ts` |
| Whole-position market TP/SL | Opposite side, `s: "0"`, `r: true`, market trigger, grouping `positionTpsl` | `apps/terminal/src/domain/trade/order-intent.ts`, `apps/terminal/src/components/trade/positions/position-tpsl-modal.tsx` |
| Modify order | `batchModify({ modifies: [{ oid, order: { a, b, p, s, r, t, c? } }] })` | Exchange registry and the existing TP/SL modification path |
| Cancel order(s) | `cancel({ cancels: [{ a, o }] })` | Desktop and mobile open-order tabs |
| Cancel TWAP | `twapCancel({ a, t })` | `apps/terminal/src/hooks/trade/use-twap-cancel.ts` |
| Pause or resume TWAP | Not available | **Unresolved:** do not emulate pause with a cancel/recreate sequence |
| Adjust isolated margin | `updateIsolatedMargin({ asset, isBuy, ntli })`, where `ntli` is signed micro-USD | `apps/terminal/src/domain/trade/isolated-margin.ts`, `apps/terminal/src/components/trade/positions/position-isolated-margin-modal.tsx` |

Official action schema: [Exchange endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint).

The reverse action has no dedicated endpoint and the exchange does not return a pre-trade reverse liquidation price. The design fixture's estimated liquidation price must not be used in production without a separately verified margin model.

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
| `#EFC3BF` pale danger stroke | No exact semantic token | Unresolved |
| `#EAF5EF`, `#EDF1F5` badge fills | Closest are `success-soft` and `fill-weak` | Not pixel-exact |
| `#EEF1F5` desktop underlay | `bg-grid-container` is required by the desktop layout contract | Existing value differs slightly |
| Fixed dark share card colors | No suitable theme-aware token set | Unresolved |
| Design scrim and shadows | No exact existing token | Unresolved |

The project currently cannot satisfy both "no new tokens" and exact light-mode reproduction for the unresolved rows. New shared semantic tokens require explicit approval.

## Internationalization

Lingui source messages remain English. The existing catalogs cover English, Chinese, Hindi, Spanish, French, and Arabic.

Existing keys cover the seven tabs and most base field labels, including `Balances`, `Positions`, `Open Orders`, `TWAP`, `Trade History`, `Funding History`, `Order History`, `Account Value`, `Margin Ratio`, `Entry Price`, `Mark Price`, `Liquidation Price`, `Funding`, `TP/SL`, `Limit Close`, `Market Close`, `Reverse`, `Cancel All`, and `Export CSV`.

New messages are required for:

- account-summary labels, PnL display-mode labels, and the four column-help tooltips;
- expand/collapse-all controls, asset/type/direction/status filters, and empty-state copy;
- close-all, cancel-all, reverse, modify-order, isolated-margin, TP/SL, and PnL-share confirmation copy;
- remaining order value, distance to mark, TWAP progress/frequency/remaining time, and operation results;
- interpolated quantities, symbols, order counts, and submission toasts.

Run `pnpm i18n:extract` after implementation, fill the English and Chinese catalog entries, and leave explicit English fallbacks for untranslated non-Chinese locales rather than hard-coding UI text.

## Decisions pending confirmation

1. Replace the unavailable position-level margin ratio with a documented liquidation-distance metric using the project's existing 10% warning and 5% danger thresholds, or omit the row-level bar.
2. Remove the unsupported TWAP pause action, or display it disabled with an explanation.
3. Display remaining order value rather than original order value.
4. Extend TP/SL to fixed partial-size and trigger-limit orders as a separately tested order path.
5. Hide the reverse liquidation-price estimate until a verified margin model is available.
6. Keep the existing exchange-validated margin-removal behavior instead of the prototype's fixed 50% maximum.
7. Add the missing shared semantic theme tokens, or accept small light-mode visual differences by using the closest existing tokens.
