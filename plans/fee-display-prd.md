# Fee Display — Transparent, API-Sourced, HIP-3-Aware

## Problem Statement

Traders placing orders in HyperTerminal see fee information that is wrong or confusing in three distinct ways:

1. **Wrong numbers on HIP-3 markets.** The `Est. Fee` row shows the validator-dex rate even when the user is trading a builder-deployed perpetual (e.g. `brentoil`). HIP-3 markets apply a multiplier of `2 × deployerFeeScale × (growthMode ? 0.1 : 1)` on top of the user's validator rate. Subsidized (growth-mode) markets can be ~5× cheaper than what we currently display, while non-subsidized HIP-3 markets are up to 2× more expensive. Users see the wrong number either way.
2. **No account for the user's actual fee tier.** The `userFees` endpoint already returns the user's personalized `userCrossRate` / `userAddRate` (reflecting VIP tier, staking discount, and referral discount), but when that fetch hasn't resolved we fall back to hardcoded `ORDER_FEE_RATE_*` constants. A user who would actually pay `0.0086%` may briefly see `0.0450%`.
3. **Builder fee is unexplained.** The row reads `Builder Fee  0.01%`. Users ask "0.01% of what?" — they cannot tell whether it is a percentage of the exchange fee, of the order value, or something else. The value proposition (who this goes to, why it exists) is invisible.

Collectively, these make the fee area feel opaque. Traders do not trust the displayed numbers, and those who look closely find they are sometimes provably wrong on HIP-3 markets.

## Solution

Replace the current two-row fee block with a single **Fee** row that shows one honest, API-sourced total, with a hover/tap tooltip that reveals the breakdown.

From the user's perspective:

- Only one number on the trade summary: the total they will pay, both as a percentage and as a dollar amount.
- On hover (desktop) or tap (mobile), a compact tooltip shows: the exchange fee (taker / maker), a strikethrough tier-0 reference rate when their effective rate is discounted or subsidized, the builder fee with a single-line explanation, and the grand total.
- HIP-3 markets like `brentoil` display their actual effective rate — the same number a user would see in Hyperliquid's own UI. Subsidized markets show the strikethrough so the saving is visible.
- When the wallet is disconnected, the Fee row is hidden entirely — personalized rates require an address, and showing generic tier-0 numbers would be misleading.

## User Stories

1. As a connected trader on BTC-PERP, I want to see my actual fee (including my VIP tier and staking discount), so that I know what I will pay before I click Buy.
2. As a connected trader on a HIP-3 subsidized market like `brentoil`, I want to see the subsidized rate (not the validator rate), so that I do not overestimate my costs and skip a profitable trade.
3. As a connected trader on a HIP-3 non-subsidized market, I want to see the higher rate I will actually pay, so that I am not surprised by a larger-than-expected fee.
4. As a trader on any HIP-3 market, I want to see the tier-0 rate struck through next to my effective rate, so that I can visually confirm I am getting a subsidy or discount.
5. As a trader placing a limit order, I want the tooltip to show both taker and maker rates, so that I can reason about which side of the book I want to post on.
6. As a trader placing a market order, I want the row to show the taker number (not maker), so that the displayed amount matches what I will actually be charged.
7. As a curious user, I want to hover over the Fee row and see a breakdown, so that I understand how the total was computed.
8. As a user on a mobile device, I want to tap the Fee row to toggle the tooltip open, so that I can read the breakdown without a hover event.
9. As a user reading the tooltip, I want a one-line explanation of the builder fee, so that I understand what I am paying for without having to read a paragraph.
10. As a user who is not connected, I want the Fee row to be hidden, so that I am not shown a generic rate that would not apply to me.
11. As a user whose `userFees` / `perpDexs` / `meta` responses are still loading, I want the Fee row to render a skeleton, so that I do not briefly see a stale or validator-only number before it corrects.
12. As a user whose effective rate equals the tier-0 rate (no discount, no subsidy), I want the strikethrough line hidden, so that the tooltip does not lie to me by striking through an identical number.
13. As a user trading a spot market, I want the tooltip to use the spot base rates as the strikethrough baseline, so that the comparison is apples-to-apples.
14. As a user trading a builder-perp market in growth mode, I want a "Subsidized market" hint in the tooltip, so that I understand why the rate is much lower than tier-0.
15. As a developer maintaining the fee code, I want HIP-3 math extracted into a pure function, so that I can write unit tests that assert the formula directly without needing React, the DOM, or network mocks.
16. As a developer debugging a fee mismatch vs. Hyperliquid's own UI, I want the fee pipeline to be a single pure function that takes well-typed inputs, so that I can reproduce the calculation in a test instead of scrubbing through a render tree.
17. As a future contributor adding a new market type (e.g. spot HIP-3), I want the effective-fee function to accept a clear shape, so that I can add a new branch without ripping out the surrounding code.
18. As a user who has approved a non-default builder fee for this address, I want the tooltip to show the actual builder fee in effect, so that the number matches what the exchange will charge.
19. As a user on a build where the builder config has fee `0`, I want the builder line suppressed entirely, so that the tooltip does not show an empty row.
20. As a trader opening a partial-fill scenario, I want the total to reflect the current size × price at entry, so that the displayed dollar amount tracks what I am about to submit.

## Implementation Decisions

**Data sourcing (single source of truth: the Hyperliquid API).**
- All fee inputs come from live API responses. The hardcoded `ORDER_FEE_RATE_*` constants are removed; they are no longer used as fallbacks when the wallet is connected.
- `userFees` provides `userCrossRate`, `userAddRate`, `userSpotCrossRate`, `userSpotAddRate`, and the full `feeSchedule` (including tier-0 rates used as strikethrough baseline).
- `perpDexs[dexIndex].deployerFeeScale` provides the per-HIP-3-dex multiplier.
- `meta.universe[assetIndex].growthMode === "enabled"` provides the per-asset growth-mode flag.
- A HIP-3 market is identified by `UnifiedMarket.kind === "builderPerp"`, which already exposes `dex` and `dexIndex`.
- The `MarketsProvider` already fetches `perpDexs` and `allPerpMetas`; no new top-level fetches are required.

**Deep module: effective-fee calculator.**
- A new pure function computes the effective taker and maker rates. Inputs: the user's base rate (taker and maker), tier-0 base rate (for strikethrough), market kind, a flag indicating HIP-3, `deployerFeeScale` (when HIP-3), and `growthMode` (when HIP-3). Output: `{ effective, base, isDiscounted, isSubsidized }`.
- Formula: `effective = userRate × 2 × deployerFeeScale × (growthMode ? 0.1 : 1)` on HIP-3 markets; `effective = userRate` on validator markets. Multiplication is performed with `big.js` on string inputs; the output rates are returned as strings and converted to `number` only at the display seam.
- The function has no React, no data-fetching, no DOM dependency. It is a pure transformation from typed inputs to typed outputs.

**Orchestrator: `useFeeRates` rewrite.**
- Signature changes from `useFeeRates(marketKind?)` to `useFeeRates(market)` where `market` is the current `UnifiedMarket` (or `undefined`).
- Pulls `userFees`, `perpDexs`, and `allPerpMetas` from existing providers (`MarketsProvider`, `useInfo("userFees")`).
- Returns `null` when the wallet is disconnected or when any of `userFees` / `perpDexs` / `allPerpMetas` is still loading.
- Returns `{ effective: { taker, maker }, base: { taker, maker }, flags: { isHip3, isGrowthMode, isDiscounted, isSubsidized }, builderBps }` otherwise.
- The hook is thin: it composes the effective-fee calculator with data fetching. It does not contain fee math itself.

**Updated order-metrics function.**
- `getOrderMetrics` accepts `{ sizeValue, price, leverage, exchangeRate, builderBps }` and returns `{ orderValue, marginRequired, exchangeFee, builderFee, totalFee }`.
- Remains a pure function; existing tests in `domain/trade/` continue to cover the non-fee outputs.

**UI: single Fee row + tooltip.**
- `OrderSummary` renders one row labeled `Fee`, value `<effective%> (<$ amount>)`. The label is underline-dotted to signal the tooltip affordance (matches the existing pattern on the trade-details "Fees" row).
- When `useFeeRates` returns `null`, the row is not rendered at all (wallet disconnected) or renders a skeleton (still loading).
- A new `FeeTooltip` component renders the breakdown:
  - `Exchange fee  <taker%> / <maker%>`
  - strikethrough tier-0 row, shown only when `isDiscounted || isSubsidized`
  - `Builder fee  <bps%> ($<amount>)` with a single short line: "Supports interface development"
  - divider + `Total (taker)  <total%> ($<amount>)`
  - A small "Subsidized market" hint when `isHip3 && isGrowthMode`
- The tooltip uses `@hypeterminal/ui`'s existing `<Tooltip>`, which handles hover on desktop and tap on mobile.

**Verification gate before merge.**
- Implementer opens Hyperliquid's own frontend for (a) a validator market, (b) a HIP-3 growth-mode market, (c) a HIP-3 non-growth market. Our tooltip's "Your rate" must match Hyperliquid's displayed rate to four decimals for the connected wallet. If a mismatch is found, the formula is wrong and the PR does not merge.

## Testing Decisions

**What makes a good test here:** tests assert external behavior of the pure effective-fee function. Given a concrete set of inputs (user rate, tier-0 rate, dex scale, growth flag), the output rates are deterministic. Tests do not mount components, do not mock hooks, and do not touch the DOM.

**Covered by tests.**
- The effective-fee pure function. Cases: (1) validator market with zero discount, (2) validator market with staking + referral + VIP discount, (3) HIP-3 market with `deployerFeeScale = 1` and no growth mode, (4) HIP-3 market with `deployerFeeScale = 1` and growth mode on, (5) HIP-3 market with `deployerFeeScale > 1`, (6) spot validator market, (7) string-precision cases where floating-point would drift (e.g. very small rates near `1e-6`), (8) edge case where the user's base rate is `"0"`.
- Prior art: existing Vitest tests in `apps/terminal/src/lib/tests/` and `apps/terminal/src/domain/trade/`; follow the same conventions.

**Not covered by tests (deliberately).**
- `useFeeRates` hook — thin orchestration, churns often, mostly glue.
- `FeeTooltip` and `OrderSummary` components — presentational, churn with design iterations, visual regressions are better caught by eye than by a test harness.

## Out of Scope

- Tier ladder and progress-to-next-tier UI (e.g. "You are on Tier 2 — $18M volume to Tier 3"). That belongs on a dedicated Account > Fees page and is a separate PR.
- Displaying active staking-discount tier names ("Gold", "Diamond") in the trade tooltip.
- Referral-discount attribution in the tooltip (we show the net effective rate only; the user's referral status is already accounted for by the API).
- Redesigning the disconnected-wallet trade summary beyond "hide the Fee row".
- Any change to the builder approval flow (`approveBuilderFee`, `maxBuilderFee`) or to the default builder address / fee in `config/hyperliquid.ts`.
- Spot HIP-3 markets — not yet a product; adding a branch for them is speculative.
- Localization / translation of the single-line builder fee hint. It inherits the existing `t`` ` macro from lingui.

## Further Notes

- The strikethrough baseline is the tier-0 validator rate (`0.0450% / 0.0150%` perp; `0.0700% / 0.0400%` spot). This matches the convention used by Hyperliquid's own UI and frames the display as "savings relative to a new account", which is the most intuitive frame for most users.
- The tooltip stays tight on purpose. Longer prose invites the very "what is this fee for?" confusion the user currently experiences; minimal value-first rows are the cure.
- The verification step (comparing our rate against Hyperliquid's UI on three markets) is cheap and catches the formula being wrong at `×2` instead of `÷2`, or any other sign-of-mistake reversal.
- This PRD will be broken into sub-issues once approved: (a) effective-fee module + tests, (b) `useFeeRates` rewrite + constant removal, (c) `OrderSummary` + tooltip UI, (d) verification pass.
