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
| Account equity | Account-abstraction-aware balance summary | Unified and portfolio-margin modes use the Spot account value shared by every DEX; separate accounts use the selected DEX `marginSummary.accountValue` | `apps/terminal/src/domain/trade/balances.ts`, `apps/terminal/src/components/trade/positions/positions-panel.tsx` |
| Account maintenance-margin ratio | Mode-dependent derivation | Separate accounts use `crossMaintenanceMarginUsed / accountEquity`; unified accounts use the official maximum, per collateral token, of `crossMaintenanceMarginUsed / (spot total - isolated margin used)`; portfolio margin remains unavailable because the protocol does not expose an equivalent scalar | `apps/terminal/src/domain/trade/balances.ts`, `apps/terminal/src/components/trade/positions/positions-panel.tsx` |
| Position maintenance-margin ratio | Not returned by `clearinghouseState` | **Unresolved:** the prototype's `risk` value is fixture data and must not be treated as an API field | Hyperliquid `ClearinghouseStateResponse`, `packages/hl-react/src/account/use-user-positions.ts` |
| Unrealized PnL | `unrealizedPnl` | Prefer the exchange value for a whole position | `packages/hl-react/src/account/use-user-positions.ts` |
| ROE | `returnOnEquity` | Prefer the exchange value for a whole position | `packages/hl-react/src/account/use-user-positions.ts` |
| Price-change return | `unrealizedPnl / (abs(szi) * entryPx)` | Derived with `Big.js`; return unavailable for a zero denominator | Toolbar domain view model |
| Estimated partial-close PnL | Pro-rate whole-position `unrealizedPnl`; fallback `(markPx - entryPx) * closeSize * direction` | Long direction is `+1`; short direction is `-1` | `apps/terminal/src/domain/trade/position-market-close.ts` |
| Cumulative funding | `cumFunding.sinceOpen` | Preserve the existing UI sign convention and derive `-sinceOpen` with `Big.js` | `apps/terminal/src/domain/trade/position-toolbar.ts` |

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
| Child orders | `children` | Attached TP/SL orders |
| Client order id | `cloid` | Nullable 128-bit hex identifier |
| Remaining order value | Non-trigger: `limitPx * sz`; trigger: `triggerPx * sz` | Derived with `Big.js`; the toolbar intentionally shows the remaining, not original, notional |
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
| Whole-position market TP/SL | Opposite side, `s: "0"`, `r: true`, market trigger, grouping `positionTpsl` | `apps/terminal/src/domain/trade/order-intent.ts`, `apps/terminal/src/components/trade/positions/position-tpsl-modal.tsx` |
| Modify order | `batchModify({ modifies: [{ oid, order: { a, b, p, s, r, t, c? } }] })` | `apps/terminal/src/domain/trade/open-order-modification.ts`, `apps/terminal/src/domain/trade/open-order-modification-form.ts` |
| Cancel order(s) | `cancel({ cancels: [{ a, o }] })` | Desktop and mobile open-order tabs |
| Cancel TWAP | `twapCancel({ a, t })` | `apps/terminal/src/hooks/trade/use-twap-cancel.ts` |
| Pause or resume TWAP | Not available | Keep the designed pause affordance disabled with an explicit protocol-capability explanation; never emulate pause with cancel/recreate |
| Adjust isolated margin | `updateIsolatedMargin({ asset, isBuy, ntli })`, where `ntli` is signed micro-USD | `apps/terminal/src/domain/trade/isolated-margin.ts`, `apps/terminal/src/components/trade/positions/position-isolated-margin-modal.tsx` |

Official action schema: [Exchange endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint).

The reverse action has no dedicated endpoint and the exchange does not return a pre-trade reverse liquidation price. The production flow therefore shows the estimate as unavailable. It binds the confirmed position size, owner, environment, DEX and asset metadata; obtains a fresh clearinghouse snapshot under an exclusive asset lock; rejects active/pending TWAP or order coordination; and requires a filled exchange confirmation before reporting success.

Close all captures every unfiltered open position for the active owner and environment; a table filter never narrows the destructive action. The preview expires after 30 seconds. Submission acquires an exclusive cross-tab reservation for every asset, refreshes `clearinghouseState` and `metaAndAssetCtxs` separately for every DEX, validates the encoded asset ID, context index, DEX, size precision, side, margin mode, collateral token, and current size, then submits the existing reduce-only `FrontendMarket` shape. A batch is final only when every response is terminal, every `filled.totalSz` exactly equals its requested size, and a post-fill `clearinghouseState` refresh reports every target size as zero. Mixed, resting, ambiguous, stale, or post-fill-residual results remain in reconciliation with their reservations retained; a terminal mixed success/error result is reported as partial and requires a fresh preview before retrying.

Because HIP-3 DEXs may use different collateral assets, the close-all summary never adds unlike currencies. It groups total notional and estimated PnL with `Big.js` by the verified market quote token and formats each group with the locale-aware quote formatter. Missing collateral metadata fails the preview closed.

Ordinary order modification is also fail-closed. The UI exposes only ordinary limit orders and the four supported trigger-order shapes. It withholds direct modification for client-order-id orders, grouped orders, position TP/SL, market/system/TWAP-slice orders, and unsupported TIF values. Both desktop inline editing and the mobile bottom sheet preserve raw input, reconstruct a complete exchange order, revalidate the live subscription and market binding at the execution boundary, and report success only after the open-orders subscription confirms the requested value. A 15-second subscription timeout never reports success and leaves cancellation available.

The whole-position TP/SL dialog also keeps position size, entry/mark/trigger prices, estimated PnL, risk/reward, and the 10% trigger-market protection price as decimal strings through its `Big.js` path. Its SDK output remains a reduce-only market trigger with size `"0"`; this precision change does not add partial-size or trigger-limit behavior.

### PnL sharing

The share snapshot uses the exchange position's `unrealizedPnl` and `returnOnEquity`, the current joined mark-price snapshot, the position entry price, direction, leverage, full market identity, DEX, environment, and verified quote token. The browser renders a local Canvas PNG after fonts and QR generation are ready; no position or account data is sent to an image service. Mainnet links use the canonical market route and preserve only an explicit `scope=all` query value. Testnet exports are visibly labelled and intentionally omit the link and QR rather than silently opening a Mainnet route. Closing the dialog or switching the selected snapshot invalidates in-flight exports. Mobile prefers Web Share with a PNG file and falls back to the local download path.

## Desktop grid behavior

At the compact-desktop breakpoint the account table owns the fixed ten-column left region and can be resized vertically from its south edge, but not horizontally. Its default height is a stable table viewport rather than the full height of the stacked right column. The account-information panel now occupies the useful ten-column region directly below it, while trading remains at the upper right and market data remains below trading. This removes ten grid rows (330px at the configured row height and gutters) of empty document scroll without remounting any keyed panel or changing the required 14-column geometry. Account information may be resized east/south within a ten-column maximum. Storage key `v6` invalidates the former expanded-table geometry; valid user table expansions and the corresponding pushed-down account panel continue to restore.

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
| Design scrim | `bg-scrim/60` | Existing theme overlay token; modal shadows remain component-local design values |

The remaining non-exact badge, warning, underlay, and shadow rows continue to reuse project semantics. Adding new shared theme tokens still requires explicit approval.

## Internationalization

Lingui source messages remain English. The existing catalogs cover English, Chinese, Hindi, Spanish, French, and Arabic.

Existing keys cover the seven tabs and most base field labels, including `Balances`, `Positions`, `Open Orders`, `TWAP`, `Trade History`, `Funding History`, `Order History`, `Account Value`, `Margin Ratio`, `Entry Price`, `Mark Price`, `Liquidation Price`, `Funding`, `TP/SL`, `Limit Close`, `Market Close`, `Reverse`, `Cancel All`, and `Export CSV`.

The toolbar messages include:

- account-summary labels, PnL display-mode labels, and the four column-help tooltips;
- expand/collapse-all controls, asset/type/direction/status filters, and empty-state copy;
- close-all, cancel-all, reverse, modify-order, isolated-margin, TP/SL, and PnL-share confirmation copy;
- remaining order value, distance to mark, TWAP progress/frequency/remaining time, and operation results;
- interpolated quantities, symbols, order counts, and submission toasts.

`pnpm --filter @gatu/terminal i18n:extract` and `i18n:compile` are part of the verification pass. English source messages and Chinese translations are registered, including close-all lifecycle/error states, the disabled TWAP explanation, margin-mode filtering, and PnL-share/Testnet states. Existing untranslated Arabic, Spanish, French, and Hindi entries continue to use the project's English fallback rather than hard-coded UI text.

## Production decisions

- The TWAP pause control remains present but disabled with an explanation because the exchange has no pause/resume action.
- Isolated-margin removal continues to use the exchange-validated maximum; the prototype's fixed 50% fixture is not production data.
- Close all uses a short-lived all-position snapshot, cross-DEX refresh and reservations, exact filled-size checks, post-fill zero-position verification, and a fresh-preview retry requirement.
- PnL sharing uses a local Canvas/QR lifecycle, preserves full DEX and quote identity, and disables ambiguous Testnet market links. Its fixed inverse canvas tokens are an intentional branded-export exception to theme switching.

## Decisions pending confirmation

1. Replace the unavailable position-level margin ratio with a documented liquidation-distance metric using the project's existing 10% warning and 5% danger thresholds, or omit the row-level bar.
2. Extend TP/SL to fixed partial-size and trigger-limit orders as a separately tested order path.
3. Replace the reverse liquidation-price placeholder only if a verified margin model becomes available.
4. Add the missing shared semantic theme tokens, or accept small light-mode visual differences by using the closest existing tokens.
