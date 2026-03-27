# Delta Neutral Builder — Research & Product Spec

## 1. Delta Neutral Strategy Mechanics

### 1.1 Core Concept

A delta-neutral portfolio maintains net zero exposure to price direction. USD value stays constant regardless of market moves — price could triple then drop 90% and portfolio value is unaffected (outside momentary spot-perp dislocations).

The profit source is **funding rate payments**: in positive-funding environments, longs pay shorts. By holding long spot + short perp of equal notional, the trader is price-neutral and collects funding as yield.

### 1.2 Spot + Perp Hedging (Funding Rate Capture)

**Mechanism:**
- Buy 1 BTC spot, simultaneously short 1 BTC perp
- BTC rises $5k → spot +$5k, perp -$5k → net $0
- Profit = cumulative funding payments minus trading fees

**When it works:**
- Bullish or sideways markets (perps trade at premium → positive funding)
- Funding rate exceeds round-trip fee threshold (~0.11% maker, ~0.23% taker on Hyperliquid)

**Practical flow:**
1. Monitor funding rates across venues
2. When funding is positive and above fee threshold, enter both legs simultaneously
3. Collect hourly funding payments (Hyperliquid pays every 1 hour)
4. Exit both legs when funding turns negative or opportunity diminishes

### 1.3 Cross-Exchange Delta Neutral

**CEX Spot + DEX Perp:**
- Buy spot on CEX (deeper liquidity, tighter spreads)
- Short perp on Hyperliquid (cleaner funding, transparent orderbook)
- Captures funding rate differential between venues

**DEX-to-DEX:**
- Long on one DEX perp, short on another
- Exploits funding rate divergence between venues
- Hyperliquid funding shifts predict CEX changes 15–30 minutes earlier

**Tri-Venue Framework:**

| Pair | Characteristics | Opportunity |
|------|----------------|-------------|
| Hyperliquid ↔ CEX | Most liquid | Perp basis and funding spread differences |
| CEX ↔ L2 DEX | Most exploitable | L2s priced 20–50 bps off fair value |
| Hyperliquid ↔ L2 DEX | Highest alpha | Capture oracle lag and AMM mispricing |

CEXs dominate price discovery (61% higher integration than DEXs). Information flows CEX→DEX with zero reverse causality. Hyperliquid sits uniquely between CEX efficiency and DEX transparency.

### 1.4 Funding Rate Farming Variants

**Passive:** Hold long spot + short perp continuously. Yield = cumulative funding minus fees.

**Tactical (just-in-time):** Enter 10–15 min before funding, exit immediately after. Minimizes price exposure to <15 min. Requires funding >0.15%/hour and spreads <0.05%.

**Multi-asset rotation:** Monitor funding across all assets, rotate into highest-yielding pairs. HL-Delta bot uses 5% annualized yield threshold before entering.

### 1.5 Basis Trade (Cash and Carry) On-Chain

Perpetual futures are the most traded crypto product: >$12T volume in 2025, >$154B in liquidations. On-chain cash-and-carry uses perps instead of expiring futures, with funding as the carry yield. Now extends beyond crypto: S&P 500 perps, gold, and silver perps trade on Hyperliquid.

---

## 2. Hyperliquid-Specific Details

### 2.1 Funding Rate Mechanism

**Formula:**
```
F = avg(Premium) + clamp(interestRate - Premium, -0.0005, 0.0005)
```

**Premium Index:**
```
premium = impact_price_difference / oracle_price
impact_price_difference = max(impact_bid - oracle, 0) - max(oracle - impact_ask, 0)
```

**Parameters:**
- Premium sampled every 5 seconds, averaged over 1 hour
- Interest rate: 0.01% per 8 hours (0.00125%/hour, 11.6% APR)
- Payment frequency: **every 1 hour** (1/8 of 8-hour rate per payment)
- Cap: 4% per hour across all assets
- Uses spot oracle price (weighted median of CEX spot prices)

**HL vs other venues:** Most volatile funding rates among major venues. Direct result of 1-hour calculation window → hyper-responsive to basis. Higher mean and standard deviation.

### 2.2 Spot Market (HIP-1, HIP-2)

- **448 spot tokens, 282 pairs** (March 2026)
- HIP-1: native token standard with on-chain spot orderbook paired with USDC
- HIP-2: protocol-level automated two-sided liquidity (0.3% spread, updates every ~3s)
- USDC has atomic transfer between perps and spot wallets

**Best candidates for delta neutral (both spot + perp, deep liquidity):**
- UBTC (index 197) — tokenized BTC via Hyperunit bridge
- UETH (index 221) — tokenized ETH via Hyperunit bridge
- USOL (index 254) — tokenized SOL via Hyperunit bridge
- HYPE (index 150) — native token, also has staking yield

**Fee structure:**
- Spot: 0.070% taker / 0.040% maker
- Perps: 0.045% taker / 0.015% maker
- Round-trip maker: 0.040 + 0.015 + 0.040 + 0.015 = **0.11%**
- Round-trip taker: **~0.23%**
- Volume-based fee tiers shared across spot and perps per address

### 2.3 Margin & Leverage

**Modes:** Cross (shared collateral), Isolated (per-asset), Strict Isolated (no margin removal).

**Max leverage / maintenance margin:**
| Asset | Max Leverage | Maintenance Margin |
|-------|-------------|-------------------|
| BTC | 40x | 1.25% |
| ETH | 25x | 2% |
| SOL | varies | varies |
| Most alts | 3–5x | 10–16.7% |

For delta neutral: **use 2–5x leverage with isolated margin**. Lower leverage = wider liquidation buffer = safer for a hedged strategy where the yield is in basis points.

### 2.4 Liquidation Mechanics

```
liq_price = price - side * margin_available / position_size / (1 - l * side)
where l = 1 / MAINTENANCE_LEVERAGE, side = -1 for shorts
```

**Waterfall:** Book liquidation → Partial (>100k: 20% first, 30s cooldown) → Backstop (HLP vault takes over below 2/3 maintenance) → ADL.

**Delta neutral relevance:** Short perp liquidation is the primary risk. The spot leg gains value but that doesn't help the perp margin unless using cross margin (which exposes other positions).

### 2.5 Auto-Deleveraging (ADL)

Triggers when account value turns negative after liquidation waterfall fails. Ranks profitable traders on opposite side:
```
ranking = (mark_price / entry_price) * (notional / account_value)
```
Higher unrealized PnL + higher leverage = higher in ADL queue. Position closed at mark price. **First activated November 2025.** For delta neutral: a profitable short could be forcibly closed, leaving unhedged long spot exposure.

### 2.6 Key API Endpoints

All via `POST https://api.hyperliquid.xyz/info`:

| Type | Purpose |
|------|---------|
| `metaAndAssetCtxs` | Live funding rates, markPx, oraclePx, OI, premium |
| `fundingHistory` | Historical funding rates per coin |
| `predictedFundings` | Predicted rates for HL + Binance + Bybit per asset |
| `userFunding` | User's funding payment history |
| `clearinghouseState` | Positions, margin, liquidation prices |
| `spotClearinghouseState` | Spot balances per coin |
| `l2Book` | Orderbook depth for spread analysis |
| `activeAssetData` | Max trade sizes, available margin |
| `perpsAtOpenInterestCap` | Assets at OI cap (can't open new positions) |

`predictedFundings` returns multi-venue comparison (Binance 8h, Bybit 8h, HL 1h) — this is the key data source for cross-venue arb.

### 2.7 Existing Vault Strategies

| Protocol | APY | TVL | Notes |
|----------|-----|-----|-------|
| Liminal | ~15% | $30M+ | Native HL, automated DN funding arb, optional 1.5–2x leverage |
| Harmonix | ~15–19% | $6.3M | HYPE vault, deployed on Arbitrum |
| HLP | varies | protocol | Community-owned market-making with DN lean |
| Ethena (USDe) | ~3.7% | $14B peak | Largest DN stablecoin, multi-CEX hedging |
| BFUSD | ~4.8% | — | Binance yield-bearing stablecoin |
| Kamino CASH | varies | ~$140M | Solana, managed by Gauntlet |

**Open-source:** HL-Delta (Python+React, 70/30 spot/perp allocation, 60s check interval, 5% APY threshold).

---

## 3. Risks

### 3.1 Funding Rate Reversal (PRIMARY RISK)
Funding can turn negative (shorts pay longs). In bear markets, often persistently negative. HL's hourly payments mean faster exposure to rate changes. Liminal reports yields can go to zero or briefly negative during downturns.

**Mitigation:** Monitor predicted fundings, exit when rates approach zero, set minimum yield thresholds, backtest against historical funding data.

### 3.2 Liquidation on Perp Leg
Sharp spot price rise → short perp unrealized loss grows → liquidation. Despite being hedged overall, the perp leg has its own liquidation price. At 40x BTC, only ~1.25% adverse move hits maintenance margin.

**Mitigation:** Use low leverage (2–5x), isolated margin, maintain excess collateral, auto-add margin alerts.

### 3.3 Spot-Perp Basis Risk
Spot and perp prices can temporarily diverge significantly during volatility. If forced to exit during dislocation, realized loss. Execution timing matters: wide spreads destroy PnL.

**Mitigation:** Only trade liquid pairs (BTC, ETH, SOL), verify spread <0.05% before entry.

### 3.4 Smart Contract / Bridge Risk
Hyperliquid runs its own L1. Bridge risk moving USDC. Hyperunit bridge for native assets (uBTC/uETH/uSOL) adds trust assumptions. Protocol bugs in matching engine, margin, or liquidation logic.

**Mitigation:** Limit allocation per venue, use established bridges, monitor protocol health.

### 3.5 Execution Risk (Slippage)
Both legs must enter simultaneously. Slippage eats into thin funding yield. Illiquid spot markets have wider spreads than perps.

**Mitigation:** Use limit orders (maker), verify orderbook depth >500 units at top 5 levels, TWAP for large sizes.

### 3.6 ADL Risk
Profitable short positions rank higher in ADL queue. Forcible closure leaves unhedged long spot = instant directional exposure.

**Mitigation:** Monitor ADL ranking, avoid extreme leverage, diversify across assets/venues.

### 3.7 Operational Risks
API downtime during rebalancing, bot failures, clock sync issues, oracle manipulation, OI cap blocking new positions.

---

## 4. Delta Neutral Builder — Product Ideas for HypeTerminal

### 4.1 Delta Neutral Calculator

**Purpose:** Before entering a position, calculate expected yield, fees, liquidation distance, and breakeven funding rate.

**Inputs:**
- Asset (BTC, ETH, SOL, HYPE)
- Notional size (USDC)
- Leverage on perp leg (1x–10x slider, default 3x)
- Entry method (maker/taker toggle)
- Current funding rate (auto-populated from `predictedFundings`)

**Outputs:**
- Hourly / daily / annualized projected yield (USDC + %)
- Round-trip fee cost (entry + exit)
- Breakeven time (hours until fees are recovered)
- Liquidation price on perp leg
- Liquidation distance (% from current price)
- Margin required (USDC)
- Capital efficiency comparison: 1x vs 2x vs 3x vs 5x

**Key calculations:**
```
hourly_yield = notional * funding_rate
daily_yield = hourly_yield * 24
annualized_yield = daily_yield * 365
round_trip_fees = notional * (spot_fee + perp_fee) * 2
breakeven_hours = round_trip_fees / hourly_yield
liq_price = entry_price * (1 + margin / notional)  // simplified for short
liq_distance_pct = (liq_price - current_price) / current_price * 100
```

**UI elements:**
- Compact card layout, fits in sidebar or modal
- Green/red yield indicator based on current environment
- Warning badge when funding is below breakeven threshold
- Historical funding sparkline (last 7 days) for the selected asset
- Comparison row showing same calculation at different leverage levels

### 4.2 One-Click Setup

**Purpose:** Execute both legs of a delta neutral position in a single action.

**Flow:**
1. User selects asset + size + leverage in the calculator
2. "Open Delta Neutral" button becomes active when:
   - Funding rate > breakeven threshold
   - Orderbook depth sufficient (>$50k at top 5 levels)
   - Spread < 0.1%
   - User has sufficient USDC balance
3. On click:
   - Transfer USDC from perp to spot wallet (if needed, atomic on HL)
   - Place spot buy order (limit at mid or market)
   - Place perp short order (limit at mid or market)
   - Both legs target maker fills with 30s timeout → fallback to taker
4. Confirmation modal shows:
   - Both fill prices
   - Actual delta (should be ~0, show residual)
   - Effective entry cost
   - Projected yield at current rates

**Close flow:**
- "Close Delta Neutral" button on active positions
- Simultaneously closes spot sell + perp close
- Shows realized PnL: funding collected - fees - slippage

**Implementation notes:**
- Use Hyperliquid exchange API for order placement
- Spot and perp orders are separate API calls — need to handle partial fills
- If one leg fills and other doesn't within timeout, auto-cancel and alert user
- Store position metadata in zustand store with `persist` for page reload safety
- Need to track: entry prices (both legs), entry time, cumulative funding, fees paid

### 4.3 Live Delta Tracker

**Purpose:** Real-time monitoring of all active delta neutral positions.

**Dashboard columns:**
| Column | Source |
|--------|--------|
| Asset | position metadata |
| Spot Size / Avg Price | `spotClearinghouseState` |
| Perp Size / Avg Price | `clearinghouseState` |
| Net Delta | `spot_notional - abs(perp_notional)` |
| Delta % | `net_delta / gross_notional * 100` |
| Cumulative Funding | `userFunding` aggregated |
| Current Funding Rate | `metaAndAssetCtxs` |
| Projected APY | `current_rate * 8760 / notional` |
| Liq Distance | `(liq_price - mark_price) / mark_price` |
| Total PnL | `funding_collected - fees - unrealized_basis` |
| Time Open | `now - entry_time` |

**Visual indicators:**
- Delta badge: green when |delta| < 1%, yellow 1–5%, red >5%
- Funding rate: green when positive, red when negative, with trend arrow
- Liq distance: color gradient from green (>20%) to red (<5%)
- PnL: green/red with daily breakdown chart

**Real-time updates:**
- Funding rate: poll `metaAndAssetCtxs` every 30s
- Positions: poll `clearinghouseState` + `spotClearinghouseState` every 15s
- Funding payments: poll `userFunding` every 5 min
- Predicted funding: poll `predictedFundings` every 60s

**Alerts (in-app toast + optional notification):**
- Funding rate turned negative
- Funding rate dropped below breakeven threshold
- Delta drift exceeded 5%
- Liquidation distance below 10%
- ADL ranking entered top 20%

### 4.4 Auto-Rebalance Suggestions

**Purpose:** When delta drifts from zero (due to partial fills, price moves affecting margin, or manual trades), suggest corrective actions.

**Delta drift sources:**
- Spot price moved → notional values diverged (minor, perp tracks)
- Partial liquidation on perp leg
- Manual adjustment to one leg
- Funding payments changing margin balance
- Spot balance changed (staking rewards for HYPE)

**Rebalance logic:**
```
target_delta = 0
current_delta = spot_notional - abs(perp_notional)
drift_pct = current_delta / gross_notional * 100

if abs(drift_pct) > threshold (default 2%):
  if current_delta > 0:  // over-hedged on spot
    suggestion = "Sell {delta_amount} spot OR increase perp short by {delta_amount}"
  else:  // under-hedged
    suggestion = "Buy {delta_amount} spot OR reduce perp short by {delta_amount}"
```

**UI:**
- Yellow banner on position card when drift > threshold
- "Rebalance" button that pre-fills the corrective order
- One-click rebalance (places the corrective order)
- Rebalance history log

**Advanced suggestions:**
- "Funding turned negative. Close position? (Projected loss: -$X/day)"
- "Higher yield available on ETH (+0.05%/hr). Rotate?"
- "Liquidation distance below 10%. Add $X margin or reduce size by Y%"
- "OI cap approaching on {asset}. Consider reducing position"

### 4.5 Funding Rate Scanner (Supporting Feature)

**Purpose:** Dashboard showing funding rates across all Hyperliquid assets + cross-venue comparison.

**Columns:**
| Column | Source |
|--------|--------|
| Asset | `metaAndAssetCtxs` |
| HL Funding (1h) | `metaAndAssetCtxs` → funding |
| HL Annualized | funding * 8760 |
| Binance Funding | `predictedFundings` |
| Bybit Funding | `predictedFundings` |
| HL vs Binance Δ | difference |
| HL vs Bybit Δ | difference |
| 7d Avg Funding | `fundingHistory` aggregated |
| OI | `metaAndAssetCtxs` → openInterest |
| Spot Available | boolean (has spot pair) |

**Filters:** Only assets with spot pairs, minimum funding threshold, minimum OI, sort by annualized yield.

**Visual:** Heatmap coloring on funding rates. Sparkline for 7-day funding history per asset.

### 4.6 Historical Backtest View

**Purpose:** Show what a delta neutral position would have yielded historically.

**Inputs:** Asset, date range, leverage, entry method.

**Outputs:**
- Cumulative funding chart over time
- Net PnL after fees
- Max drawdown (from funding reversals)
- % of time funding was positive
- Annualized yield for the period
- Comparison: HL vs Binance vs Bybit funding for same period

**Data source:** `fundingHistory` API, cached locally.

---

## 5. UI/UX Design Notes

### 5.1 Information Architecture

```
Delta Neutral (top-level tab or route)
├── Scanner          — funding rate table across all assets + venues
├── Calculator       — input params → projected yield + risks
├── Builder          — one-click open/close positions
├── Tracker          — live monitoring of active DN positions
├── History          — past DN positions + realized PnL
└── Backtest         — historical what-if analysis
```

**Progressive disclosure:** Scanner is the entry point (low commitment, just data). Calculator lets users model. Builder executes. Tracker monitors. Users naturally flow left→right as they commit.

### 5.2 Layout

- Scanner and Tracker are **table-based** — use existing table patterns from the trading view
- Calculator is a **compact form** — sidebar panel or modal, similar density to order entry
- Builder integrates into Calculator as a CTA button
- Backtest is a **chart view** — cumulative funding line chart with overlays

### 5.3 Component Patterns

- Reuse existing `Table` component for scanner/tracker
- Reuse existing input/slider components from order entry for calculator
- Position cards in tracker follow same visual language as existing position rows
- Alerts use existing toast system
- Color tokens: `market-up` for positive funding/PnL, `market-down` for negative, `market-neutral` for near-zero

### 5.4 Key UX Principles

1. **Show risk prominently.** Liquidation distance, breakeven time, and funding direction are always visible. No hiding risk behind tabs.
2. **No jargon without context.** First-time tooltip explaining "delta neutral", "funding rate", "basis" — but keep the UI clean for repeat users.
3. **Actionable data.** Every number in the scanner should be clickable to pre-fill the calculator. Every calculator output should flow into the builder.
4. **Conservative defaults.** Default leverage 3x (not max). Default to maker orders. Default rebalance threshold 2%.
5. **Exit is as easy as entry.** Close button always visible, one-click unwind, clear PnL summary.

### 5.5 Mobile Considerations

- Scanner: horizontal scroll with sticky asset column
- Calculator: stacked form layout
- Tracker: card-based layout instead of table rows
- Alerts: push notifications for critical events (funding flip, liq warning)

---

## 6. Implementation Notes

### 6.1 Data Layer

**New API hooks (in `src/lib/` or `src/domain/`):**
```
useFundingRates()        — polls metaAndAssetCtxs, extracts funding
usePredictedFundings()   — polls predictedFundings, returns multi-venue
useFundingHistory(coin)  — fetches fundingHistory for backtest
useUserFunding(user)     — polls userFunding for tracker
useDeltaPositions()      — derives DN positions from clearinghouse + spot state
```

**Zustand store (`src/stores/delta-neutral.ts`):**
```ts
interface DeltaNeutralStore {
  positions: DeltaNeutralPosition[]
  settings: {
    rebalanceThreshold: number  // default 0.02
    minFundingThreshold: number // default 0.0001
    defaultLeverage: number     // default 3
    entryMethod: 'maker' | 'taker'
  }
  // actions
  addPosition: (pos: DeltaNeutralPosition) => void
  removePosition: (id: string) => void
  updateSettings: (settings: Partial<Settings>) => void
}
```

**Position type:**
```ts
interface DeltaNeutralPosition {
  id: string
  asset: string
  spotEntryPrice: string
  perpEntryPrice: string
  spotSize: string
  perpSize: string
  leverage: number
  entryTime: number
  cumulativeFunding: string
  totalFeesPaid: string
  status: 'active' | 'closed'
}
```

### 6.2 Calculation Utilities (`src/domain/delta-neutral/`)

All math via `big.js` with string inputs/outputs per project convention:

```
calculateProjectedYield(notional, fundingRate, leverage)
calculateBreakevenTime(notional, fundingRate, fees)
calculateLiquidationPrice(entryPrice, margin, size, maintenanceMargin)
calculateLiquidationDistance(liqPrice, currentPrice)
calculateNetDelta(spotNotional, perpNotional)
calculateDeltaDrift(netDelta, grossNotional)
annualizeFundingRate(hourlyRate)
calculateRebalanceAction(spotNotional, perpNotional, threshold)
```

### 6.3 Order Execution

**Simultaneous entry challenge:**
- Hyperliquid spot and perp are separate order endpoints
- No atomic multi-leg execution available
- Strategy: place both orders in rapid succession, monitor fills
- If one leg fails: cancel the other within timeout, alert user
- For maker orders: place both as limit orders at mid price, monitor for 30s
- Fallback: convert unfilled to market order after timeout

**Risk safeguards:**
- Pre-flight checks: balance, OI cap, spread, depth
- Maximum position size guard (% of account)
- Rate limiting on rebalance actions (prevent rapid-fire)
- Kill switch: close all DN positions immediately

### 6.4 Polling Strategy

| Data | Interval | Priority |
|------|----------|----------|
| Funding rates | 30s | High |
| Positions | 15s | High |
| Predicted fundings | 60s | Medium |
| User funding payments | 5 min | Low |
| L2 book (for spread) | 30s | Medium (only for open positions) |
| Funding history | On-demand | Low |

Use existing subscription patterns from `hl-react`. Avoid polling data that isn't being displayed.

### 6.5 File Structure

```
src/
├── domain/delta-neutral/
│   ├── calculations.ts          — pure math utilities
│   ├── types.ts                 — DeltaNeutralPosition, Settings, etc.
│   └── funding.ts               — funding rate normalization/comparison
├── stores/delta-neutral.ts      — zustand store with persist
├── components/delta-neutral/
│   ├── funding-scanner.tsx       — funding rate table
│   ├── dn-calculator.tsx         — calculator form
│   ├── dn-builder.tsx            — one-click open/close
│   ├── dn-tracker.tsx            — live position monitoring
│   ├── dn-history.tsx            — closed positions
│   ├── dn-backtest.tsx           — historical analysis chart
│   ├── rebalance-banner.tsx      — drift warning + action
│   └── funding-sparkline.tsx     — mini chart for funding history
└── routes/delta-neutral.tsx      — page route
```

### 6.6 Phased Rollout

**Phase 1 — Read-only (1–2 weeks):**
- Funding rate scanner with cross-venue comparison
- Calculator (no execution)
- Historical funding charts
- Zero risk, immediate value for users evaluating strategies

**Phase 2 — Position tracking (1 week):**
- Detect existing DN positions from user's spot + perp state
- Live delta tracker
- Funding payment tracking
- Rebalance suggestions (manual execution)

**Phase 3 — Execution (2–3 weeks):**
- One-click open/close
- Auto-rebalance suggestions with pre-filled orders
- Position management (add margin, adjust size)

**Phase 4 — Advanced (ongoing):**
- Multi-asset rotation suggestions
- Cross-venue comparison with actionable routing
- Backtest view
- Alert system (notifications)

---

## 7. Competitive Landscape & Differentiation

### 7.1 Existing Tools

| Tool | Type | Limitation |
|------|------|-----------|
| Liminal | Automated vault | No user control, 10% performance fee, opaque rebalancing |
| Harmonix | Automated vault | Only HYPE, Arbitrum dependency, fees |
| HL-Delta | Open-source bot | Python CLI, no GUI, requires self-hosting |
| Loris Tools | Scanner only | No execution, no position tracking |
| CoinGlass | Scanner only | CEX-focused, no HL-specific features |
| Ethena | Stablecoin | Abstracted away, ~3.7% yield, no control |

### 7.2 HypeTerminal Differentiation

1. **Integrated into existing trading UI** — not a separate app or vault deposit. Users see DN alongside their regular trading.
2. **Transparency** — every calculation visible, no black-box vault. Users understand exactly what they're paying and earning.
3. **Control** — users choose asset, leverage, timing. Can exit anytime. No lockups beyond standard settlement.
4. **Education through UI** — the calculator teaches the mechanics. Scanner shows the opportunity. Progressive disclosure from passive viewing to active execution.
5. **Hyperliquid-native** — purpose-built for HL's 1-hour funding, spot+perp ecosystem, and API. Not a generic multi-exchange tool.

---

## Sources

- [Hyperliquid Funding Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding)
- [Hyperliquid Liquidations Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/liquidations)
- [Hyperliquid ADL Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/auto-deleveraging)
- [Hyperliquid Margining Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining)
- [Hyperliquid Perpetuals API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals)
- [Hyperliquid Spot API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot)
- [HIP-1 Token Standard](https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-1-native-token-standard)
- [HIP-2 Hyperliquidity](https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-2-hyperliquidity)
- [Chainstack: Funding Rate Arbitrage on Hyperliquid](https://docs.chainstack.com/docs/hyperliquid-funding-rate-arbitrage)
- [Liminal / Nansen Research](https://research.nansen.ai/articles/liminal-capturing-real-yield-via-funding-rate-arbitrage)
- [HL-Delta Bot (GitHub)](https://github.com/cgaspart/HL-Delta)
- [Hummingbot: Funding Rate Arb on Hyperliquid](https://hummingbot.org/blog/funding-rate-arbitrage-and-creating-vaults-on-hyperliquid/)
- [Cross-Venue Arbitrage: HL vs CEX/L2](https://news.chainspot.io/2025/11/18/basis-funding-cross-venue-arbitrage-trading-hyperliquid-vs-cex-and-l2-dexs/)
- [Delta Neutral Strategies (Cryptowisser, Jan 2026)](https://www.cryptowisser.com/index.php/guides/delta-neutral-strategies/)
- [Ethena USDe Docs](https://docs.ethena.fi/solution-overview/usde-overview/delta-neutral-stability)
- [Ethena Q1 2026 Report](https://stablecoininsider.org/ethena-usde-q1-2026-report/)
- [Delta Neutral on Hyperliquid (Mitosis Guide)](https://university.mitosis.org/my-personal-guide-to-mastering-delta-neutral-strategies-on-hyperliquid/)
- [BIS Working Paper: Crypto Carry](https://www.bis.org/publ/work1087.pdf)
- [Perpetual Arbitrage Mechanics (BSIC)](https://bsic.it/perpetual-complexity-an-introduction-to-perpetual-future-arbitrage-mechanics-part-1/)
- [Hyperliquid ADL Activation (WuBlockchain)](https://wublockchain.medium.com/hyperliquid-activates-cross-margin-auto-deleveraging-for-the-first-time-what-are-hlp-and-adl-9eb811418e9b)
- [BitMEX: Harvest Funding on Hyperliquid](https://www.bitmex.com/blog/harvest-funding-payments-on-hyperliquid)
- [CoinGlass Funding Rates](https://www.coinglass.com/FundingRate)
- [Hyperliquid Funding Comparison Tool](https://app.hyperliquid.xyz/fundingComparison)
