# Portfolio Delta & Risk Manager — Research

Comprehensive research on portfolio-level risk tools, dashboard design patterns, and specific implementation ideas for HypeTerminal.

---

## Table of Contents

1. [Delta Exposure Tools](#1-delta-exposure-tools)
2. [Beta Exposure & Benchmarking](#2-beta-exposure--benchmarking)
3. [Value at Risk (VaR)](#3-value-at-risk-var)
4. [Hedging Suggestions Engine](#4-hedging-suggestions-engine)
5. [Crypto-Specific Risk Metrics](#5-crypto-specific-risk-metrics)
6. [Dashboard Design Patterns](#6-dashboard-design-patterns)
7. [Data Visualization for Risk](#7-data-visualization-for-risk)
8. [Real-Time Risk UI Patterns](#8-real-time-risk-ui-patterns)
9. [Platform Analysis](#9-platform-analysis)
10. [HypeTerminal Implementation Ideas](#10-hypeterminal-implementation-ideas)
11. [Existing Codebase Infrastructure](#11-existing-codebase-infrastructure)
12. [Sources](#12-sources)

---

## 1. Delta Exposure Tools

### What is Portfolio Delta

Delta measures directional exposure — how much a portfolio's value changes per $1 move in the underlying asset. For perpetual futures (no options gamma), delta is straightforward:

- **Long 1 BTC perp** = +1.0 delta (in BTC terms)
- **Short 0.5 ETH perp** = -0.5 delta (in ETH terms)
- **Net portfolio delta** = sum of all position deltas

### How Trading Terminals Display Delta

**Per-Asset Delta**
- Each position shows its delta contribution in USD terms: `szi × markPx`
- Displayed as a column in the positions table
- Color coded: green for long (positive), red for short (negative)

**Net Portfolio Delta**
- Aggregated across all positions
- Shown as a single headline number in the risk summary
- Often displayed as "Net Exposure" or "Net Notional"
- Formula: `Σ(position_size × mark_price)` for each asset

**Delta Breakdown Visualization**
- Horizontal stacked bar chart showing long vs short delta by asset
- Each bar = one asset's delta contribution
- Green bars extend right (long), red bars extend left (short)
- Net delta line/marker shows overall portfolio lean

**Bloomberg PORT**
- Shows delta decomposition by factor: market, sector, stock-specific
- Aggregated delta across multi-asset portfolios
- Drill-down from total to per-position

**ThinkorSwim**
- Positions tab with Beta Weighting checkbox
- Converts all position deltas to a single benchmark (SPX)
- Shows net total delta at bottom of position statement
- Portfolio delta visible as a single aggregated number

**Interactive Brokers Risk Navigator**
- Real-time delta per position and portfolio aggregate
- P&L plot: shows projected P&L across a +/-30% price range (customizable to 100%)
- Delta-based scenario analysis with what-if trades

### Delta-Neutral Strategy Visualization

For delta-neutral strategies (common in crypto carry/basis trades):
- Buy 1 BTC spot + Short 1 BTC perp = Net delta ≈ 0
- Show a gauge or indicator centered at 0
- Green zone = near-neutral, yellow/red = drifting
- Drift threshold: typically ±0.10 delta before rebalancing

### Calculation Details

For perpetual futures specifically:
```
position_delta_usd = position_size × mark_price × side_multiplier
  where side_multiplier = +1 for long, -1 for short

net_delta_usd = Σ position_delta_usd  (across all positions)

net_delta_btc = net_delta_usd / btc_mark_price
  (for BTC-denominated delta view)
```

For spot holdings:
```
spot_delta = spot_balance × spot_price  (always positive)
```

Combined portfolio:
```
total_delta = Σ perp_deltas + Σ spot_deltas
```

---

## 2. Beta Exposure & Benchmarking

### Portfolio Beta for Crypto

Beta measures systematic risk — how much an asset moves relative to a benchmark. In crypto, the benchmarks are:

- **BTC** — the "S&P 500 of crypto" (most common)
- **ETH** — for DeFi/L2-heavy portfolios
- **Total crypto market cap** — for diversified portfolios

### Beta Calculation

```
β_asset = Cov(R_asset, R_benchmark) / Var(R_benchmark)
```

Where R = returns over a rolling window (typically 30-90 days).

**Key findings from research:**
- BTC's beta to traditional markets has escalated from 0.032 to 0.834 between 2015-2023
- Optimal estimation window for crypto beta: 5-7 months
- Use 60-minute sampling frequency to avoid microstructure noise (present until 4-minute intervals)
- A single principal component explains >41% of variance in crypto — the "market direction" factor

### Beta-Weighted Delta

The core concept: convert all positions' delta into "equivalent BTC delta" using beta:

```
beta_weighted_delta_btc = Σ (position_delta_usd × β_asset_vs_btc) / btc_price
```

**ThinkorSwim Implementation:**
- Select benchmark symbol (SPX, BTC, etc.)
- Each position's delta is converted: `position_delta × (asset_beta / benchmark_delta)`
- Portfolio total shows "If BTC moves 1%, portfolio moves approximately X%"
- Users see a single aggregated risk number

**Interpretation:**
- Beta-weighted delta of +5.0 BTC = portfolio behaves like being long 5 BTC
- Useful for: "How much BTC would I need to short to neutralize my market risk?"
- If beta-weighted delta is +10 BTC, shorting 10 BTC perp neutralizes systematic risk

### Beta Display in UI

- Column in positions table: β (vs BTC) per asset
- Rolling beta chart: sparkline showing beta stability over time
- Portfolio beta: single number in risk summary header
- Beta-weighted P&L: project portfolio P&L for a given BTC % move

### Crypto-Specific Beta Considerations

- Altcoin betas to BTC are often >1 (higher volatility, amplified moves)
- Beta is not stable — it spikes during sell-offs (beta convergence to 1)
- During "alt season", betas can decouple significantly
- Cross-correlations spike in crashes, reducing diversification benefit
- Rolling beta should use at least 30-day window, refreshed daily

---

## 3. Value at Risk (VaR)

### VaR Approaches for Crypto

**Historical VaR (Most Practical for HypeTerminal)**
1. Collect last N days of returns for each asset (e.g., 252 trading days)
2. Apply current portfolio weights to historical returns
3. Generate distribution of hypothetical portfolio returns
4. VaR = the X-th percentile loss (e.g., 5th percentile for 95% VaR)

```
portfolio_return_t = Σ (weight_i × return_i_t)  for each historical day t
VaR_95 = -percentile(portfolio_returns, 5)
```

**Parametric VaR (Variance-Covariance)**
- Assumes normally distributed returns (poor fit for crypto!)
- Uses covariance matrix of asset returns
- `VaR = z_score × σ_portfolio × portfolio_value`
- z = 1.645 for 95%, 2.326 for 99%
- Fast to compute, but underestimates tail risk in crypto

**Monte Carlo VaR**
- Simulate thousands of price paths
- Apply portfolio weights
- Measure percentile losses
- Can incorporate fat tails, jumps, regime changes
- Most accurate but computationally expensive
- Usually done server-side, not in-browser

### Conditional VaR (CVaR / Expected Shortfall)

CVaR answers: "When we lose more than VaR, how bad is the average loss?"

```
CVaR_95 = average of all losses worse than VaR_95
```

- More informative than VaR for tail risk (crypto's fat tails)
- Regulators increasingly prefer CVaR over VaR
- Shows the expected loss in the worst 5% of scenarios

### VaR Display in Trading Terminals

**Interactive Brokers Risk Navigator:**
- Dashboard fields: VaR, Expected Shortfall, Portfolio Beta, Average Beta
- VaR shown as dollar amount and percentage of portfolio
- Stress test scenarios alongside VaR

**Professional Conventions:**
- Time horizon: 1-day VaR (most common), also 10-day for regulatory
- Confidence levels: 95% and 99%
- Display format: "$12,345 (2.1% of portfolio)"
- Stressed VaR: VaR computed over a crisis period (e.g., March 2020 crash)

**VaR Visualization:**
- Line chart of rolling VaR over time with actual P&L overlay
- VaR breaches marked with red dots (days when loss exceeded VaR)
- Histogram of portfolio returns with VaR threshold marked
- Confidence band (95% to 99%) shown as shaded area

### Crypto VaR Considerations

- Crypto returns are NOT normally distributed — heavy left tails
- 24/7 trading means "1-day" VaR uses 24h returns
- High correlation during crashes reduces diversification benefit
- Funding rate costs can add to losses beyond price VaR
- Liquidation cascades create tail risks beyond what VaR captures
- Historical VaR with at least 1 year of data recommended
- Consider using 99% CVaR instead of 95% VaR for crypto

---

## 4. Hedging Suggestions Engine

### Automated Hedge Recommendations

**Delta-Neutral Hedge Sizing:**
```
hedge_size = -net_delta_usd / hedge_instrument_price
```

Example: Portfolio has +$50,000 net delta → suggest shorting $50,000 worth of BTC perp.

**Cross-Asset Hedging (BTC as Hedge for Altcoins):**
- Altcoins typically have beta > 1 to BTC
- To hedge altcoin exposure: `btc_short_size = altcoin_delta × β_alt_vs_btc`
- Example: $10,000 SOL long, SOL beta to BTC = 1.8
  → Hedge: short `$10,000 × 1.8 = $18,000` worth of BTC perp
- BTC is preferred hedge because: deepest liquidity, lowest funding, most correlated

**Hedge Instrument Selection:**
1. Same-asset perp (best: perfect hedge, but funding costs)
2. BTC perp (good: deep liquidity, but basis risk)
3. ETH perp (alternative benchmark for DeFi-heavy portfolios)
4. Cross-margin spot sales (no funding, but reduces portfolio)

### Hedging Suggestion UI Ideas

**"Quick Hedge" Button:**
- One-click suggestion: "Short X BTC to neutralize delta"
- Shows projected portfolio metrics after hedge
- "Apply" button creates the order

**Hedge Recommendation Card:**
```
┌─────────────────────────────────────────┐
│ 🔄 Hedge Suggestion                     │
│                                         │
│ Your portfolio is +$125,000 net long    │
│                                         │
│ Recommended: Short 1.25 BTC-PERP        │
│ Projected net delta: ~$0                │
│ Funding cost: ~$45/day                  │
│                                         │
│ [Preview Impact]  [Place Order]          │
└─────────────────────────────────────────┘
```

**Scenario Preview:**
- Before/after comparison showing:
  - Delta change
  - Margin impact
  - Projected VaR change
  - Funding rate cost/income change

### Dynamic Hedging / Rebalancing

- Set a delta threshold (e.g., ±$10,000)
- Alert when portfolio delta drifts beyond threshold
- Show rebalancing trade needed to return to target
- Delta threshold default: 0.10 (portfolio delta fluctuates -0.10 to +0.10)
- Any breach triggers hedge suggestion

### Hedge Effectiveness Tracking

- Track realized vs expected hedge performance
- Show "hedge drag" from funding rate costs over time
- Alert when correlation breakdown reduces hedge effectiveness
- Display rolling correlation between hedged assets

---

## 5. Crypto-Specific Risk Metrics

### Liquidation Risk

**Per-Position Liquidation Price:**
```
liq_price = entry_price - side × margin_available / position_size / (1 - l × side)
  where l = 1 / MAINTENANCE_LEVERAGE
```

**Liquidation Distance:**
```
liq_distance_pct = abs(mark_price - liq_price) / mark_price × 100
```

**Cross-Margin Liquidation (Hyperliquid):**
- Triggered when `account_value < maintenance_margin × total_notional`
- All positions liquidated simultaneously in cross margin
- Mark price uses external CEX prices + Hyperliquid book state

**Portfolio Margin Liquidation (Hyperliquid):**
- Triggered when `portfolio_margin_ratio > 0.95`
- Spot and perp PnL offset each other
- More capital efficient for hedged positions

### Margin Utilization

```
margin_ratio = total_margin_used / account_value
cross_leverage = abs(total_notional_position) / account_value
available_balance = account_value - total_margin_used
```

Display as: gauge (0-100%), progress bar with threshold markers

### Funding Rate Exposure

```
daily_funding_cost = Σ (position_notional_i × funding_rate_i × 3)
  // 3 funding intervals per day (every 8 hours on Hyperliquid)

annualized_funding = daily_funding_cost × 365
funding_as_pct_equity = daily_funding_cost / account_value × 100
```

**Display ideas:**
- "Projected daily funding: -$45.20"
- Per-position funding column in positions table
- Cumulative funding history chart
- Alert when aggregate funding exceeds threshold (e.g., >1% of equity/day)

### Concentration Risk

**Herfindahl-Hirschman Index (HHI):**
```
HHI = Σ (weight_i)²  where weight_i = position_notional_i / total_notional
```

- Range: 0 to 1 (or 0 to 10,000 if using percentages)
- HHI < 0.15 = diversified
- HHI 0.15-0.25 = moderate concentration
- HHI > 0.25 = high concentration
- Single position portfolio: HHI = 1.0

**Crypto-Modified HHI:**
- Weight by market cap (larger cap = less risky per unit exposure)
- Weight by volatility (more volatile = more risk per unit exposure)
- Adjusted: `HHI_adjusted = Σ (weight_i × vol_i / avg_vol)²`

**Display:** Donut chart where even segments = diversified, one dominant segment = concentrated

### Correlation Risk

- Show rolling pairwise correlations between positions
- Heatmap: assets on both axes, color = correlation strength
- Alert when high correlation means positions are effectively "the same bet"
- Crypto correlations spike to ~0.9 during sell-offs (diversification disappears)

### Open Interest & Liquidity Risk

- Position size relative to total market OI for that asset
- Large positions (>1% of OI) face slippage and impact risk
- Display: position size as % of market OI per asset
- Warning when position exceeds liquidity thresholds

---

## 6. Dashboard Design Patterns

### Information Hierarchy (3-Tier)

**Tier 1 — Glanceable Summary (Top Row)**
- 4-5 KPI cards spanning full width
- Net equity, total P&L, margin utilization, VaR, account health score
- Each card: label, large value, change indicator, optional sparkline
- 10-second scan for overall risk posture
- Place most critical data top-left (F-pattern scanning)

**Tier 2 — Drivers & Breakdown (Middle)**
- Exposure breakdown chart (bar/treemap/donut)
- Delta summary with per-asset contributions
- Greeks table (for options, or simplified for perps)
- Margin breakdown: initial vs maintenance vs available

**Tier 3 — Diagnostics & Action (Bottom)**
- Detailed positions table with risk columns
- Scenario analysis / stress test panel
- Historical risk charts
- Hedging suggestions
- Alert log

### Layout Models

**Bloomberg PORT Model:**
- Summary bar at top
- Tabbed sections: Performance, Risk, Attribution, Characteristics
- Within Risk tab: VaR, factor decomposition, stress tests, correlation
- Click-through drill-down

**IBKR Risk Navigator Model:**
- Portfolio view with positions + Greeks
- Separate panels: Dashboard, P&L plot, Risk summary
- Menu-driven: Portfolio, Edit, Report, Metrics, View, Settings

**Modern Fintech Model (for HypeTerminal):**
- Clean dark-theme grid layout
- Modular card/panel system
- Progressive disclosure: summary → details on click
- Responsive columns: 4-5 cards top, 2-3 panels middle, full-width table bottom

### Key Design Principles

1. **Progressive disclosure** — summary first, details on demand
2. **5-metric limit** — no more than 5 KPI cards visible simultaneously
3. **Decision-first design** — each element answers "what should I do?"
4. **Consistent visual language** — same color semantics everywhere
5. **Real-time without noise** — smooth transitions, not flickering numbers
6. **F-pattern layout** — critical info top-left, secondary right/below

### Hudson River Trading UX Insights

- Only 20% of features are actually used — ruthless prioritization
- Sub-second data updates require careful render optimization
- Tab-based navigation fails at scale: too many tabs = features hard to find
- Solution: build around user **workflows** and mental models
- Start with user dialogue: understand their thought process
- Unified dashboards: traders completed actions 61% faster vs fragmented layouts

---

## 7. Data Visualization for Risk

### Exposure Breakdown

**Horizontal Bar Chart (Recommended Default)**
- Sorted by absolute exposure size (largest first)
- Green bars right (long), red bars left (short)
- Net line marker shows overall portfolio lean
- Compact: fits in a side panel
- Best for quick "where am I exposed?" scan

**Treemap**
- Rectangle size = position size
- Color = PnL (green/red divergent)
- Great for spotting overexposed positions at a glance
- Nested: asset class > individual position
- Click to drill down

**Donut Chart**
- Center number = total exposure
- Segments = per-asset allocation
- Max 7 segments + "Other"
- Toggle between: notional, margin, risk contribution views
- Best for allocation overview

### Correlation Heatmap

- Grid: assets on both axes
- Color: blue (negative) → white (zero) → red (positive)
- Diagonal = 1.0 (self-correlation)
- Lower triangle masked to reduce noise
- Hover for exact values
- Significant to show during market stress (correlations spike)

### P&L Attribution Waterfall

- Start: opening equity → contributions from each position → ending equity
- Floating columns for each contributor
- Green = positive, red = negative
- Categories: market moves, funding, fees, new trades
- Running total line overlay

### Margin Gauge

**Arc Gauge (Primary):**
- 270-degree arc
- Zones: green (0-50%), yellow (50-75%), orange (75-90%), red (90-100%)
- Center: large percentage + "Margin Used"
- Below: available margin, maintenance margin values
- Threshold markers at 75%, 90%
- Spring-physics animation on value change

**Progress Bar (Inline):**
- For compact contexts (table rows, sidebar)
- Three color zones
- Liquidation threshold marker
- "X% used" label

### Sparklines

- Inline in table rows next to positions
- 60-80px wide, 16-24px tall
- Last 24h or 7d price trend
- Green for uptrend, red for downtrend
- Area fill with gradient opacity
- No axes or labels — pure trend indication
- Hover for value at cursor

### Liquidation Heatmap (CoinGlass-Inspired)

- Price chart with overlaid liquidation density
- Color: purple (low) → yellow (high concentration)
- Shows where cascading liquidations cluster
- Timeframes: 12h to 1 year
- Unique differentiator for a trading terminal

---

## 8. Real-Time Risk UI Patterns

### Color Coding

**Semantic Risk Colors (Dark Theme):**
- **Safe/Profit**: `market-up` green (~60% lightness)
- **Warning**: Amber/yellow (#F59E0B range)
- **Danger/Loss**: `market-down` red (not too saturated)
- **Neutral/Info**: Blue accent
- **Highlight**: Orange `highlight` (#F7931A) for attention

**Accessibility:**
- Minimum 4.5:1 contrast ratio for text
- Never use color alone — always pair with icons/shapes
- Up arrows + green, down arrows + red
- Colorblind-safe: supplement with patterns/textures
- 8% of men have red-green colorblindness

### Animation Patterns

**Value Changes:**
- Counter animation: smooth numeric roll from old to new
- Color flash: brief highlight on significant change
- Pulse: subtle 1.0 → 1.05 → 1.0 scale on update
- Direction micro-arrows that fade in/out

**Chart Updates:**
- Smooth line extension for real-time data
- Bar height transitions with easing
- Gauge needle with spring physics

**State Transitions:**
- Risk level change: smooth color interpolation
- Card expansion: animated height for drill-down
- Tab content: crossfade between panels

### Alert Hierarchy

1. **Critical** (red): Background tint + icon + sound + modal → margin call, liquidation proximity
2. **Warning** (yellow): Border + icon + inline banner → approaching limits
3. **Info** (blue): Subtle indicator + tooltip → informational
4. **Success** (green): Brief flash + toast → hedge placed successfully

### Threshold Indicators

- Color state change (green → red) when threshold crossed
- Animated border or glow effect
- Historical marker on charts where breach occurred
- Conditional text label appears: "ABOVE LIMIT"
- Pulsing red glow when liquidation < 10% away

---

## 9. Platform Analysis

### Bloomberg PORT
- Portfolio value, benchmark, tracking error, active risk
- Tabbed: Performance, Risk, Attribution, Characteristics, Optimization
- Risk tab: VaR summary, factor decomposition, stress tests, correlation
- Click any metric → see underlying drivers
- Gold standard for institutional risk analytics

### Interactive Brokers Risk Navigator
- Net liquidity, P&L, maintenance margin, initial margin, VaR, expected shortfall
- Portfolio Beta, Average Beta
- P&L Plot with +/-30% to +/-100% price range scenarios
- What-if trades: test impact before executing
- Beta-weighted performance (S&P 500 default, customizable)
- Real-time updating positions with Greeks

### ThinkorSwim
- Beta Weighting tool: converts position deltas to benchmark-relative
- Net total delta at bottom of position statement
- Risk Profile view: P&L graph across price scenarios
- Price Slices for multi-scenario analysis
- Can beta-weight entire portfolio to see aggregate risk to 10% crash

### Deribit Portfolio Margin
- Risk Matrix: price × volatility scenario grid
- Cell values: estimated P&L under each scenario
- Worst-case scenario highlighted
- Parameters: price movement %, IV change
- Asset grouping (e.g., stETH grouped with ETH)

### OKX Portfolio Margin
- Risk Unit Merge: perps + futures + options merged per underlying
- Spot auto-included in margin
- Reduced margin for hedged positions
- Dynamic margin call warnings
- Smart liquidation engine to minimize forced closures

### Bybit Unified Trading Account
- Three modes: Isolated, Cross, Portfolio Margin
- All risks calculated in USD
- Gauge visualization for margin utilization
- Green = sufficient, Red = critical
- Liquidation at maintenance margin rate = 100%

### CoinGlass
- Liquidation Heatmap: most distinctive visualization
- Color: purple → yellow (low → high liquidation concentration)
- Overlaid on price chart
- Market depth, OI, funding rates, volume data
- 15+ exchanges, 300+ cryptocurrencies

### Amberdata AD Derivatives
- Delta, gamma, vega portfolio management
- VaR calculation with daily risk limits
- Proprietary SVI TrueLine volatility calibration
- Real-time risk monitoring
- Stress testing: simulate extreme scenarios
- Term structure, gamma profiles, volatility footprints

---

## 10. HypeTerminal Implementation Ideas

### Feature Tiers

**P0 — Portfolio Risk Summary Panel**

A new panel/tab showing aggregated portfolio risk at a glance:

```
┌─ Portfolio Risk ──────────────────────────────────────────────┐
│                                                               │
│  Equity          Net Delta       Margin Used      VaR (95%)   │
│  $125,430        +$48,200        62%              $8,240      │
│  +$2,340 (+1.9%) ▲ net long      ████████░░       6.6% of eq  │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Exposure by Asset              │  Margin Gauge               │
│  BTC  ████████████▓  +$32,000   │      ╭─────╮               │
│  ETH  █████████▓     +$18,500   │    ╭─╯ 62% ╰─╮            │
│  SOL  ████▓          -$2,300    │  ──╯         ╰──           │
│  DOGE ██▓            +$1,200    │  0%    ▲     100%          │
│  NET  ─────────────► +$49,400   │                             │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Position Risk Table                                          │
│  Asset  Side  Size   Entry    Mark     Liq     UPnL    Risk%  │
│  BTC    Long  0.5    95,200   96,400   78,100  +$600   64%    │
│  ETH    Long  5.0    3,200    3,340    2,450   +$700   28%    │
│  SOL    Short 15.0   155      148      198     +$105   5%     │
│  DOGE   Long  50000  0.18     0.182    0.12    +$100   3%     │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

**Components:**
1. **KPI Row** (4-5 cards): Equity, Net Delta, Margin Used %, VaR
2. **Exposure Bar Chart**: Per-asset long/short breakdown with net total
3. **Margin Arc Gauge**: 270° gauge with color zones
4. **Position Risk Table**: Positions with risk-relevant columns

**P1 — Delta & Exposure Analytics**

- Net delta in USD and BTC-equivalent
- Per-asset delta contribution bar chart
- Long/short breakdown donut chart
- Beta-weighted delta (vs BTC benchmark)
- Delta drift alert: notification when delta exceeds user-set threshold

**P2 — Hedging Suggestions**

- "Quick Hedge" card: "Short X BTC to neutralize delta"
- Before/after preview of portfolio metrics
- Funding cost projection for the hedge
- One-click order creation from suggestion
- Rebalancing alerts when delta drifts past threshold

**P3 — VaR & Stress Testing**

- Historical VaR (95%, 99%) computed from recent returns
- CVaR / Expected Shortfall
- Scenario sliders: "What if BTC drops 30%?"
- Preset scenarios: "March 2020 crash", "FTX collapse", "Bull run 2x"
- Scenario grid (Deribit-style): price × vol change matrix

**P4 — Advanced Analytics**

- Correlation heatmap between portfolio assets
- Concentration score (HHI) with diversification suggestions
- P&L attribution waterfall
- Funding rate exposure tracker with projected costs
- Liquidation heatmap overlay on price chart

### Specific Component Designs

**Account Health Score (0-100)**

Composite metric combining:
- Margin utilization (30% weight)
- Distance to liquidation (25% weight)
- Concentration risk HHI (15% weight)
- Leverage ratio (15% weight)
- Funding rate exposure (10% weight)
- Unrealized PnL drawdown (5% weight)

Display: Arc gauge with zones — green (70-100), yellow (40-70), red (0-40)

**Liquidation Proximity Indicator**

Per-position inline element:
```
Current ──────[========|====]────── Liq
$96,400       ▓▓▓▓▓▓▓▓▓ 78%       $78,100
```
- Green gradient → red as approaching liquidation
- Alert at <10%, critical at <5%
- Inline in positions table (100-200px wide)

**Funding Rate Dashboard Row**

```
Daily Funding Cost: -$45.20  │  Annualized: -$16,498  │  % of Equity: -0.036%/day
BTC: +$12.30 (receiving)  ETH: -$38.50 (paying)  SOL: -$19.00 (paying)
```

**Delta Drift Monitor**

```
Target: Neutral (±$5,000)
Current: +$48,200 ⚠️ EXCEEDS THRESHOLD
Suggested Rebalance: Short 0.50 BTC-PERP
[Preview] [Auto-Rebalance]
```

### Data Sources (Available in Codebase)

All data needed is available through existing Hyperliquid SDK hooks:

| Metric | Data Source | Hook |
|--------|-----------|------|
| Positions | Clearinghouse state | `useSubClearinghouseState` |
| Position sizes, entry prices | Position data | `useUserPositions` |
| Mark prices | All mids | `useSubAllMids` |
| Liquidation prices | Position data | `position.liquidationPx` |
| Account value | Cross margin summary | `perpSummary.accountValue` |
| Margin used | Cross margin summary | `perpSummary.totalMarginUsed` |
| Total notional | Cross margin summary | `perpSummary.totalNtlPos` |
| Spot balances | Spot state | `useSubSpotState` |
| Funding payments | User fundings | `useSubUserFundings` |
| Funding rates | Market meta/info | `useInfoMeta` |
| Market data | Markets info | `useMarketsInfo` |

**Calculations to build (in `src/domain/risk/`):**
- `getNetDelta(positions, midPrices)` — aggregate delta across positions
- `getPerAssetDelta(positions, midPrices)` — delta per asset
- `getMarginUtilization(perpSummary)` — margin ratio
- `getLiquidationDistance(position, markPrice)` — % to liquidation
- `getConcentrationHHI(positions, midPrices)` — Herfindahl index
- `getDailyFundingCost(positions, fundingRates)` — projected funding
- `getHistoricalVaR(returns, weights, confidence)` — historical VaR
- `getBetaWeightedDelta(positions, betas, btcPrice)` — BTC-equivalent delta
- `getAccountHealthScore(metrics)` — composite 0-100 score
- `getHedgeSuggestion(netDelta, targetDelta, hedgeInstrument)` — hedge sizing

### Technical Architecture

```
WebSocket Subscriptions (existing)
       ↓
Risk Domain Logic (new: src/domain/risk/)
       ↓
Risk Store (new: src/stores/use-risk-store.ts)
       ↓
Risk Dashboard Components (new: src/components/risk/)
  ├── risk-summary-cards.tsx  (KPI row)
  ├── exposure-chart.tsx      (bar/donut/treemap)
  ├── margin-gauge.tsx        (arc gauge)
  ├── position-risk-table.tsx (enhanced positions)
  ├── hedge-suggestion.tsx    (hedge recommendations)
  ├── scenario-panel.tsx      (stress testing)
  ├── funding-tracker.tsx     (funding exposure)
  └── correlation-heatmap.tsx (asset correlations)
```

### Routing

New route: `/risk` or as a tab within the existing trade layout

### Differentiation from Competitors

Most crypto terminals show position-level data but NOT portfolio-level risk analytics. HypeTerminal can differentiate by:

1. **Beta-weighted delta** — no crypto terminal does this today
2. **VaR / CVaR** — institutional-grade risk metric, unprecedented in DeFi
3. **Automated hedging suggestions** — one-click hedge with preview
4. **Account health score** — single composite metric for portfolio risk
5. **Stress testing** — "what if BTC drops 30%?" with full portfolio impact
6. **Concentration score** — diversification guidance
7. **Funding cost projection** — annualized cost of carrying positions
8. **Liquidation heatmap** — CoinGlass-style but integrated with positions

---

## 11. Existing Codebase Infrastructure

### Available Data Structures

**Position Data (`src/lib/hyperliquid/account/use-user-positions.ts`):**
```typescript
interface Position {
  coin: string
  szi: string          // size (string from API)
  entryPx: string      // entry price
  unrealizedPnl: string
  returnOnEquity: string
  liquidationPx: string | null
  cumFunding: { sinceOpen: string; allTime: string }
}
```

**Account Summary (`src/hooks/trade/use-account-balances.ts`):**
```typescript
type PerpSummary = {
  accountValue: string
  totalNtlPos: string
  totalMarginUsed: string
  totalRawUsd: string
}
```

**Balance Data (`src/domain/trade/balances.ts`):**
```typescript
type BalanceRow = {
  coin: string
  available: string
  inOrder: string
  total: string
  usdValue: string
  entryNtl: string
}
```

### Existing Risk Features

- Liquidation price per position (`liquidationPx`)
- Positions within 10% of liq price highlighted
- Margin metrics: `totalMarginUsed`, `accountValue`, derived `crossLeverage`
- Available balance: `accountValue - totalMarginUsed`
- TP/SL orders for per-position risk management

### Key Hooks Available

| Category | Hooks |
|----------|-------|
| Positions | `useSubClearinghouseState`, `useUserPositions` |
| Prices | `useSubAllMids`, `useMarketsInfo` |
| Balances | `useSubSpotState`, `useAccountBalances` |
| Orders | `useSubOpenOrders` |
| Funding | `useSubUserFundings`, `useInfoUserFunding` |
| History | `useSubUserFills`, `useInfoUserFills` |
| Market Meta | `useInfoMeta`, `useInfoMarginTable` |
| Risk | `useInfoLiquidatable` |

### Architecture Patterns to Follow

- Keep strings from API (no premature conversion)
- Use `big.js` only for math, then back to string
- Domain logic in `src/domain/risk/` (not in components)
- Zustand store for risk UI state
- React 19 compiler handles memoization
- `cn()` for conditional classes
- Design tokens from `src/styles.css` (no hardcoded colors)
- Phosphor icons with `Icon` suffix

---

## 12. Sources

### TradFi Risk Platforms
- [Bloomberg Portfolio Analytics (PORT)](https://www.bloomberg.com/professional/products/bloomberg-terminal/portfolio-analytics/)
- [Interactive Brokers Risk Navigator](https://www.interactivebrokers.com/campus/trading-lessons/introduction-to-ibkrs-risk-navigator/)
- [IBKR Risk Navigator Dashboard Guide](https://www.interactivebrokers.com/en/software/tws/usersguidebook/priceriskanalytics/risk_navigator_dashboard.htm)
- [ThinkorSwim Beta Weighting](https://toslc.thinkorswim.com/center/howToTos/thinkManual/Monitor/Activity-and-Positions/Beta-Weighting)
- [Beta Weighting on ThinkorSwim - Ticker Tape](https://tickertape.tdameritrade.com/tools/assess-risk-with-beta-weighting-thinkorswim-16105)
- [Refinitiv Eikon Portfolio Risk Analytics](https://solutions.refinitiv.com/portfolio-risk-analytics)

### Crypto Exchanges Risk Features
- [Hyperliquid Margining Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining)
- [Hyperliquid Portfolio Margin](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/portfolio-margin)
- [Hyperliquid Liquidations](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/liquidations)
- [Deribit Portfolio Margin](https://support.deribit.com/hc/en-us/articles/25944756247837-Portfolio-Margin)
- [OKX Portfolio Margin Mode](https://www.okx.com/en-us/help/portfolio-margin-mode-cross-margin-trading-risk-unit-merge)
- [Bybit Unified Trading Account](https://www.bybit.com/en/help-center/article/Introduction-to-Bybit-Unified-Trading-Account)
- [CoinGlass Liquidation Heatmap](https://www.coinglass.com/pro/futures/LiquidationHeatMap)

### Risk Analytics & Data
- [Amberdata Risk & Portfolio Management](https://www.amberdata.io/risk-and-portfolio-management)
- [Amberdata Risk Management Metrics in Crypto Derivatives](https://blog.amberdata.io/risk-management-metrics-in-crypto-derivatives-trading-amberdata)
- [Amberdata Institutional Crypto Portfolio Construction](https://blog.amberdata.io/institutional-crypto-portfolio-construction-risk-management-strategie)
- [CryptoToolbox Portfolio Risk Score](https://cryptotoolbox.io/portfolio-risk-score)
- [Kaiko Risk Solutions](https://www.kaiko.com/)

### Dashboard Design & UX
- [Optimizing UX/UI Design for Trading at HRT](https://www.hudsonrivertrading.com/hrtbeat/optimizing-ux-ui-design-for-trading/)
- [From Data To Decisions: UX Strategies for Real-Time Dashboards - Smashing Magazine](https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/)
- [Dashboard Design Principles - UXPin](https://www.uxpin.com/studio/blog/dashboard-design-principles/)
- [Best Color Palettes for Financial Dashboards](https://www.phoenixstrategy.group/blog/best-color-palettes-for-financial-dashboards)
- [Top Financial Data Visualization Techniques 2025](https://chartswatcher.com/pages/blog/top-financial-data-visualization-techniques-for-2025)
- [Risk Analysis Visuals - ChartExpo](https://chartexpo.com/blog/risk-analysis)

### Hedging & Portfolio Theory
- [Delta Neutral Strategies - Knowisser](https://knowisser.com/guides/delta-neutral-strategies/)
- [Bybit Dynamic Delta Hedge](https://www.bybit.com/en/help-center/article/Dynamic-Delta-Hedge)
- [Systematic Hedging of the Cryptocurrency Portfolio - QuantPedia](https://quantpedia.com/systematic-hedging-of-the-cryptocurrency-portfolio/)
- [Hedging in Crypto - dYdX](https://www.dydx.xyz/crypto-learning/hedging)
- [Crypto Hedging Strategies - Binance Academy](https://www.binance.com/en/academy/articles/how-hedging-works-in-crypto-and-seven-hedging-strategies-you-need-to-know)

### Concentration & Diversification
- [HHI Risk Assessment - FasterCapital](https://fastercapital.com/content/Herfindahl-Hirschman-Index-Risk-Assessment--How-to-Measure-the-Concentration-of-Your-Investment-Portfolio.html)
- [Concentration Risk & Portfolio Diversification - FasterCapital](https://fastercapital.com/content/Concentration-Risk--Concentration-Risk-and-How-to-Reduce-It-with-Portfolio-Diversification.html)
- [Crypto Portfolio Risk Analysis - SAGE Journals](https://journals.sagepub.com/doi/full/10.1177/21582440231193600)

### Greeks & Options Risk
- [Portfolio Greeks Dashboard - Pineify](https://pineify.app/portfolio-greeks-dashboard)
- [Greeks and Option Risk Management - Interactive](https://mbrenndoerfer.com/writing/greeks-option-risk-management-delta-gamma-theta-vega)
- [Options Greeks for Risk Management in Crypto - Pi42](https://pi42.com/blog/options-greeks-for-risk-management/)
- [Options Greeks Explained - Amberdata](https://blog.amberdata.io/options-greeks-explained-managing-risk-in-crypto-derivatives)

### Beta & Systematic Risk
- [Beta Weighting - Option Alpha](https://optionalpha.com/learn/beta-weighting)
- [Portfolio Beta Weighted - The Lazy Trader](http://www.the-lazy-trader.com/2012/07/what-is-beta-weighted-portfolio.html)
- [Is My Portfolio Too Bullish? - Trading Justice](https://tradingjustice.com/investing-theory-is-my-portfolio-too-bullish/)
