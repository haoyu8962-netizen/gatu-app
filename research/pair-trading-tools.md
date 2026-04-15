# Pair Trading Strategies & Tools for Perpetual Futures (2026)

## Table of Contents

1. [How Pair Trading Works](#how-pair-trading-works)
2. [Why Pair Trading in Crypto Perps](#why-pair-trading-in-crypto-perps)
3. [Statistical Methods](#statistical-methods)
4. [Best Pairs for Crypto Perps](#best-pairs-for-crypto-perps)
5. [Existing Tools & Platforms](#existing-tools--platforms)
6. [HypeTerminal Pair Trading Suite — Feature Design](#hypeterminal-pair-trading-suite--feature-design)
7. [UI Dashboard Ideas](#ui-dashboard-ideas)
8. [Risk Management Framework](#risk-management-framework)
9. [Technical Implementation on Hyperliquid](#technical-implementation-on-hyperliquid)
10. [Sources](#sources)

---

## How Pair Trading Works

Pair trading is a market-neutral strategy that profits from the **relative performance** between two correlated assets rather than predicting absolute market direction. The core mechanism:

1. **Identify a pair** of assets with a stable historical relationship (e.g., ETH and SOL)
2. **Go long** the underperforming asset (expected to strengthen)
3. **Go short** the overperforming asset (expected to weaken)
4. **Profit** when the spread between the two assets reverts to its historical mean

The strategy is **delta-neutral by construction** — broad market moves (up or down) affect both legs similarly, so the trader's P&L depends primarily on the *relative* movement between assets.

### Simple Example

- You believe SOL will outperform ETH over the next week
- Long $10,000 SOL-PERP, Short $10,000 ETH-PERP
- If crypto rallies 10%: SOL up 15%, ETH up 10% → net +5% on long leg, -0% on short leg → profit
- If crypto dumps 10%: SOL down 8%, ETH down 10% → net -8% + 10% = +2% → still profit
- You only lose if ETH outperforms SOL

### Key Terminology

| Term | Definition |
|------|-----------|
| **Spread** | The price difference or ratio between two assets |
| **Hedge Ratio** | The weighting applied to each leg (e.g., 1 BTC short = 1.5 ETH long) |
| **Z-Score** | Standard deviations the current spread is from its mean — used as entry/exit signal |
| **Mean Reversion** | The tendency of the spread to return to its historical average |
| **Convergence Trade** | Entering when spread widens, expecting it to narrow |
| **Divergence Trade** | Entering when spread is tight, expecting a breakout in relative performance |

---

## Why Pair Trading in Crypto Perps

### The Problem with Directional Trading

Most traders in crypto lose money. Structural disadvantages include fees, funding costs, slippage, and poor timing. Directional bets require being right about both *direction* and *timing* — a double burden that compounds losses.

### Advantages of Pair Trading with Perpetual Futures

1. **Market-Neutral**: Works in bull, bear, and sideways markets. No need to predict BTC direction.
2. **Reduced Volatility**: Net exposure is near-zero, dramatically reducing portfolio variance.
3. **Leverage Efficiency**: Perps allow 5-50x leverage on each leg. Because the pair is hedged, effective risk per dollar of capital is lower than a single directional position.
4. **No Expiry**: Perpetual futures have no settlement date — pairs can be held indefinitely (unlike traditional futures calendar spreads).
5. **Funding Rate Capture**: Sometimes both legs earn funding (long the asset paying funding, short the asset receiving it), creating a carry component.
6. **24/7 Execution**: Crypto perps trade around the clock — no gap risk from market closures.
7. **Narrative Trading**: Crypto rotates on narratives (L1 vs L2, AI vs DePIN, meme vs blue-chip). Pair trading lets you express a narrative view without directional market exposure.
8. **Skill-Based Alpha**: Your edge matters more than beta. Pair trading rewards research and conviction about *relative* value, not market-timing ability.

### Market Context (2026)

- Perpetual futures dominate crypto derivatives: **93%+ of all derivatives volume** ($61.8T in 2025)
- Hyperliquid alone processes significant on-chain perp volume with 184+ trading pairs
- Cross-asset correlations are elevated (BTC-SOL reached 0.99 in late 2025), making pair selection and timing critical
- Institutional adoption is accelerating, bringing more sophisticated relative-value strategies on-chain

---

## Statistical Methods

### 1. Correlation Analysis

**What it measures**: How closely two price series move together over a given window.

- **Pearson correlation** (ρ): Ranges from -1 to +1
- ρ > 0.8: Strong positive correlation
- ρ > 0.6: Moderate correlation
- ρ < 0.3: Weak correlation

**Limitations**: Correlation measures *co-movement* but says nothing about *convergence*. Two assets can be highly correlated yet drift apart permanently. Correlation can break down during regime changes (market crashes, narrative shifts).

**Use in pair trading**: Useful as a **screening filter** (find candidate pairs) but insufficient alone for trade signals.

### 2. Cointegration Analysis (Superior Method)

**What it measures**: Whether a linear combination of two non-stationary price series produces a **stationary** (mean-reverting) spread.

**Why it matters**: Cointegration guarantees that deviations from equilibrium are *temporary* and will revert. This is the mathematical foundation for reliable pair trading. Two assets can have low short-term correlation but be cointegrated (and vice versa).

#### Key Tests

**Augmented Dickey-Fuller (ADF) Test**
- Tests whether the spread between two assets is stationary
- Null hypothesis: spread has a unit root (non-stationary, no mean reversion)
- p-value < 0.05 → reject null → spread is stationary → pair is cointegrated
- Implementation: Run OLS regression of Asset A on Asset B, then ADF test on residuals

**Engle-Granger Two-Step Method**
1. Regress Y on X to get the hedge ratio (β): `Y = α + βX + ε`
2. Test residuals (ε) for stationarity using ADF
3. If residuals are stationary → cointegrated pair

**Johansen Test**
- Multivariate cointegration test (can test more than 2 assets simultaneously)
- Useful for finding cointegrated baskets or multi-leg pairs

#### Hurst Exponent

Measures the degree of mean reversion in a time series:

| Value | Interpretation |
|-------|---------------|
| H < 0.5 | **Mean-reverting** — ideal for pair trading |
| H ≈ 0.5 | Random walk — no edge |
| H > 0.5 | Trending — avoid for mean reversion strategies |

The lower the Hurst exponent below 0.5, the stronger the mean reversion and the more suitable the pair.

### 3. Z-Score Trading Signals

Once a cointegrated pair is identified:

```
spread = price_A - (hedge_ratio × price_B)
z_score = (spread - mean(spread)) / std(spread)
```

**Entry signals**:
- Long spread (long A, short B) when z_score < -2.0
- Short spread (short A, long B) when z_score > +2.0

**Exit signals**:
- Close when z_score reverts to 0 (or ±0.5 for conservative exit)
- Stop-loss at z_score ±3.0 or ±4.0 (spread diverging further)

### 4. Copula-Based Methods (Advanced)

Recent academic research shows copula approaches outperform linear cointegration for crypto pairs:

- Models the full dependency structure between assets (not just linear relationships)
- Captures tail dependencies (how assets co-move during extreme events)
- More robust to regime changes common in crypto
- Academic results show higher Sharpe ratios and lower max drawdowns vs. traditional methods

### 5. Rolling Window Analysis

All statistical relationships in crypto are non-stationary over long periods. Best practice:

- Use **rolling windows** (30-90 days) for correlation and cointegration tests
- Re-estimate hedge ratios periodically (daily or weekly)
- Monitor for **regime breaks** (when a previously cointegrated pair loses its relationship)
- Set alerts when cointegration confidence drops below threshold

### 6. Half-Life of Mean Reversion

Measures how quickly the spread reverts to its mean:

```
half_life = -log(2) / log(β)
```

Where β is the autoregression coefficient of the spread. Practical interpretation:
- Half-life < 7 days: Fast-reverting, suitable for short-term pair trades
- Half-life 7-30 days: Medium-term holding period
- Half-life > 30 days: Slow reversion, requires patience and larger stop-losses

---

## Best Pairs for Crypto Perps

### Tier 1: Major Pairs (Highest Liquidity)

| Pair | Rationale | Typical Correlation | Notes |
|------|-----------|-------------------|-------|
| **BTC/ETH** | Store-of-value vs smart-contract platform | 0.83-0.88 | The "classic" crypto pair. ETH/BTC ratio is the most-watched relative metric. |
| **ETH/SOL** | Established L1 vs high-performance L1 | 0.80-0.90 | Strong narrative pair — "Ethereum killer" thesis |
| **BTC/SOL** | Bitcoin vs alt-L1 | 0.90-0.99 | Very high correlation — requires precise timing |

### Tier 2: Sector Pairs (Narrative-Driven)

| Category | Example Pairs | Rationale |
|----------|--------------|-----------|
| **L1 vs L1** | SOL/AVAX, ETH/NEAR, SOL/SUI | Same sector, different execution bets |
| **L1 vs L2** | ETH/ARB, ETH/OP, ETH/STRK | Parent chain vs rollup performance |
| **DeFi vs DeFi** | AAVE/COMP, UNI/SUSHI, MKR/AAVE | Protocol-level relative value |
| **AI Tokens** | FET/RNDR, TAO/FET, NEAR/FET | AI narrative rotation |
| **Meme vs Meme** | DOGE/SHIB, PEPE/WIF, BONK/WIF | High-vol pairs for aggressive strategies |
| **Infra** | LINK/PYTH, GRT/LINK | Oracle/indexing sector bets |

### Tier 3: Cross-Sector Pairs (Macro Themes)

| Pair | Theme |
|------|-------|
| **BTC/DOGE** | Hard money vs meme (risk-on/risk-off gauge) |
| **ETH/BNB** | Decentralized vs centralized DeFi |
| **SOL/MATIC** | Monolithic L1 vs modular scaling |
| **LINK/ETH** | Infrastructure vs platform |

### Pair Selection Criteria

1. **Cointegration p-value < 0.05** (mandatory)
2. **Hurst exponent < 0.45** (strong mean reversion)
3. **Half-life < 21 days** (reasonable holding period)
4. **Both assets have perp liquidity** on Hyperliquid (>$1M daily volume)
5. **Funding rate differential** not excessively one-sided
6. **Sector proximity** — pairs within the same sector tend to have more stable relationships

---

## Existing Tools & Platforms

### Pear Protocol

The leading dedicated pair trading platform in crypto DeFi.

**Key Features**:
- Native integration with **Hyperliquid** and **SYMM** orderbooks
- One-click simultaneous long/short execution
- Up to **60x leverage** on some pairs
- USDC-only collateral (stablecoin-margined)
- Take-profit and stop-loss **on the ratio itself** (not individual legs)
- TWAP (Time-Weighted Average Price) orders for large pair entries
- Limit orders on pair ratios
- Dashboard showing P&L, net funding costs, and position metrics
- $4.1M strategic round led by Castle Island Ventures (with Electric Capital, ParaFi)
- Approaching $1B in cumulative trading volume, 4,000+ traders

**Limitations**:
- Limited statistical tools (no cointegration scanner, no z-score alerts)
- No backtesting engine
- No custom hedge ratios (assumes 1:1 dollar-neutral)
- Limited pair suggestions (manual selection only)

### TradingView

**Pair Trading Features**:
- Spread charts: `BINANCE:SOLUSDT - BINANCE:ETHUSDT` syntax
- Ratio charts: `BINANCE:SOLUSDT / BINANCE:ETHUSDT`
- Community indicators for pair trading (z-score overlays, Bollinger Bands on spreads)
- Chart overlay for visual correlation comparison
- No execution — visualization and analysis only

### MultiCharts

**Professional Spread Trading Software**:
- Dedicated spread/pair trading module
- Custom spread formulas with backtesting
- Real-time spread charting with boundary indicators
- Strategy development in PowerLanguage
- Portfolio-level spread analysis

### GMX

**DEX Perpetual Exchange**:
- Long/short on 100+ perp markets with up to 100x leverage
- Delta-neutral strategies possible (e.g., ETH collateral + ETH short = delta-neutral)
- No dedicated pair trading UI
- Manual execution of both legs separately
- Available on Arbitrum, Avalanche, Botanix, MegaETH

### Professional/Institutional Tools

- **QuantConnect**: Pairs trading strategy notebooks with cointegration analysis in Python
- **Hummingbot**: Open-source bot framework with Hyperliquid connector for automated pair trading
- **SpreadCharts**: Professional spread analysis with ratio charts, seasonality, and historical analysis
- **NinjaTrader**: Spread/pairs trading indicators and chart overlays

### Gap Analysis — What's Missing

| Feature | Pear | TradingView | GMX | Institutional |
|---------|------|-------------|-----|---------------|
| One-click pair execution | ✅ | ❌ | ❌ | ❌ |
| Cointegration scanner | ❌ | ❌ | ❌ | ✅ |
| Z-score alerts | ❌ | Partial | ❌ | ✅ |
| Spread charting | ❌ | ✅ | ❌ | ✅ |
| Ratio-based TP/SL | ✅ | ❌ | ❌ | ✅ |
| Backtesting | ❌ | Partial | ❌ | ✅ |
| Custom hedge ratios | ❌ | ❌ | ❌ | ✅ |
| Real-time pair suggestions | ❌ | ❌ | ❌ | ❌ |
| Funding rate integration | Partial | ❌ | ❌ | ❌ |
| On-chain execution | ✅ | ❌ | ✅ | ❌ |

**The opportunity**: No existing tool combines statistical rigor (cointegration, z-scores, backtesting) with seamless on-chain execution on Hyperliquid in a single interface.

---

## HypeTerminal Pair Trading Suite — Feature Design

### Feature 1: Real-Time Pair Suggester

**Concept**: Automatically scan all Hyperliquid perp markets and surface the best pair trading opportunities ranked by statistical confidence and expected profit.

**Core Logic**:
1. Pull price history for all 184+ Hyperliquid perps
2. Run pairwise cointegration tests (ADF) on rolling 30/60/90-day windows
3. Calculate Hurst exponent, half-life, and current z-score for each cointegrated pair
4. Rank by composite score: `score = (1 - p_value) × (0.5 - hurst) × z_score_magnitude / half_life`
5. Filter for minimum liquidity ($1M+ daily volume per leg)

**UI Output**:
- "Top Pairs" feed showing highest-conviction opportunities
- Each card shows: pair name, z-score, direction (convergence/divergence), confidence %, half-life, current funding rates
- Color-coded: green for strong opportunities, yellow for moderate, neutral for watchlist
- Filterable by sector, leverage range, holding period

**Update Frequency**: Recalculate every 5 minutes for z-scores, hourly for cointegration stats.

### Feature 2: Correlation & Cointegration Checker

**Concept**: Interactive tool for deep-diving into any pair's statistical relationship.

**Panels**:

1. **Correlation Matrix Heatmap**
   - All-vs-all matrix for selected assets (or full market)
   - Toggle between 7d, 30d, 90d, 180d windows
   - Click any cell to drill into the pair

2. **Pair Deep Dive Dashboard**
   - Dual price chart (normalized/overlaid)
   - Spread chart (absolute difference)
   - Ratio chart (A/B price ratio)
   - Z-score chart with entry/exit bands (±1.5, ±2.0, ±2.5, ±3.0)
   - Rolling correlation line chart
   - Cointegration confidence over time
   - Half-life indicator
   - Hurst exponent gauge

3. **Statistical Summary Card**
   - Correlation (ρ): 0.87
   - Cointegration p-value: 0.003
   - Hurst exponent: 0.38
   - Half-life: 12.4 days
   - Current z-score: -2.14
   - Verdict: "Strong mean reversion — spread oversold"

### Feature 3: One-Click Long/Short Execution

**Concept**: Execute both legs of a pair trade simultaneously with a single confirmation.

**Execution Flow**:
1. User selects pair (e.g., SOL/ETH)
2. Choose direction: "Long SOL vs ETH" or "Long ETH vs SOL"
3. Set total notional size (e.g., $10,000)
4. System calculates hedge ratio and splits across legs
5. Optional: Set leverage per leg (default: matched leverage)
6. Optional: Custom hedge ratio override (default: cointegration-derived β)
7. Preview shows: entry prices, estimated funding, margin required, liquidation distances
8. One-click confirm → both orders submitted atomically

**Order Types**:
- **Market pair entry**: Both legs at market immediately
- **Limit on spread**: Enter when spread hits target z-score
- **TWAP pair entry**: Slice both legs over N minutes to reduce impact
- **Ratio limit**: Enter when A/B ratio hits a specific level

**Technical Requirement**: Both orders must be submitted in the same block on Hyperliquid to prevent leg risk (one leg filling, other not).

### Feature 4: Position Monitor

**Concept**: Unified dashboard for tracking all open pair positions with real-time spread P&L.

**Position Card (per pair)**:

```
┌─────────────────────────────────────────────┐
│ SOL ↗ / ETH ↘                     Active    │
│                                              │
│ Long Leg: SOL-PERP  +$5,200 @ $148.20 (10x) │
│ Short Leg: ETH-PERP -$5,200 @ $3,420  (10x) │
│                                              │
│ Spread P&L:  +$312.40 (+6.01%)    ▲         │
│ Funding P&L: +$18.20                         │
│ Net P&L:     +$330.60                        │
│                                              │
│ Entry Z-Score: -2.14  → Current: -0.83      │
│ Entry Ratio: 0.0433   → Current: 0.0447     │
│                                              │
│ TP @ Z=0.0 ($+520)  SL @ Z=-3.5 ($-280)    │
│                                              │
│ [Adjust] [Close Pair] [Flip Direction]       │
└─────────────────────────────────────────────┘
```

**Aggregate View**:
- Total pair portfolio P&L
- Net market exposure (should be near zero if properly hedged)
- Funding rate income/cost across all pairs
- Margin utilization
- Correlation drift alerts (pair relationship breaking down)

### Feature 5: P&L Attribution

**Concept**: Break down exactly where profits and losses come from in each pair trade.

**Attribution Components**:

| Component | Description |
|-----------|------------|
| **Spread P&L** | Profit from the spread converging/diverging as expected |
| **Funding P&L** | Net funding rate income or cost across both legs |
| **Slippage Cost** | Difference between expected and actual entry/exit prices |
| **Fee Cost** | Trading fees for opening and closing both legs |
| **Residual Beta** | P&L from imperfect hedging (net market exposure) |
| **Hedge Ratio Drift** | P&L from the optimal hedge ratio changing over the trade duration |

**Visualization**:
- Waterfall chart: Entry → Spread P&L → Funding → Fees → Slippage → Final P&L
- Time series: Cumulative P&L broken into components over the trade's lifetime
- Historical pair trade performance table with attribution per trade

---

## UI Dashboard Ideas

### Main Pair Trading Dashboard Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [Pair Suggester]  [Correlation Matrix]  [My Positions]      │
├──────────────────────┬───────────────────────────────────────┤
│                      │                                       │
│   PAIR SELECTOR      │      SPREAD / RATIO CHART             │
│                      │                                       │
│   SOL / ETH    ★     │   ┌─────────────────────────────┐    │
│   BTC / ETH    ★     │   │  Ratio: 0.0447              │    │
│   ARB / OP           │   │  ~~~~~~~~/\~~~~~/\~~~~~~~    │    │
│   DOGE / SHIB        │   │  --------- mean ----------   │    │
│   AVAX / SOL         │   │  ~~~/\~~~~~    ~~~\~~~~~/    │    │
│   ...                │   │  +2σ ---- -2σ ---- entry     │    │
│                      │   └─────────────────────────────┘    │
│   Filter: [Sector▾]  │                                       │
│   Sort: [Z-Score▾]   │   Z-SCORE CHART                      │
│                      │   ┌─────────────────────────────┐    │
│                      │   │  +3 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │    │
│   STATS PANEL        │   │  +2 ┄┄┄┄┄┄┄┄┄┄/\┄┄┄┄┄┄┄┄  │    │
│   ────────────       │   │   0 ──────────────────────  │    │
│   Corr: 0.87         │   │  -2 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\__┄┄  │    │
│   Coint: 0.003       │   │  -3 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │    │
│   Hurst: 0.38        │   └─────────────────────────────┘    │
│   Half-life: 12d     │                                       │
│   Z-Score: -2.14     │   EXECUTION PANEL                    │
│                      │   ┌─────────────────────────────┐    │
│   [▶ TRADE PAIR]     │   │  Long SOL / Short ETH       │    │
│                      │   │  Size: $10,000  Leverage: 5x │    │
│                      │   │  TP: Z=0  SL: Z=-3.5        │    │
│                      │   │  [Execute Pair Trade]        │    │
│                      │   └─────────────────────────────┘    │
├──────────────────────┴───────────────────────────────────────┤
│  OPEN POSITIONS                                              │
│  ┌───────┬──────┬───────┬────────┬────────┬──────┬────────┐ │
│  │ Pair  │ Dir  │ Size  │Sprd P&L│Fund P&L│Z-Now │ Action │ │
│  ├───────┼──────┼───────┼────────┼────────┼──────┼────────┤ │
│  │SOL/ETH│Long A│$10.2k │+$312   │+$18    │-0.83 │[Close] │ │
│  │ARB/OP │Long A│$5.0k  │-$45    │+$7     │+1.24 │[Close] │ │
│  └───────┴──────┴───────┴────────┴────────┴──────┴────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Correlation Matrix Heatmap View

- Full NxN grid of all Hyperliquid assets
- Color scale: deep blue (-1) → white (0) → deep red (+1)
- Click any cell to open pair deep-dive
- Toggle: Correlation / Cointegration p-value / Hurst exponent
- Row/column sorting by sector, market cap, or volume

### Spread Chart Features

- **Dual overlay**: Both asset prices normalized to 100 at chart start
- **Ratio line**: A/B price ratio with Bollinger Bands
- **Z-score overlay**: With horizontal bands at ±1, ±2, ±3
- **Trade markers**: Show entry/exit points on the spread chart
- **Funding rate differential**: Plotted as histogram below spread chart
- **Volume bars**: For each leg, shown as stacked bars
- **Timeframes**: 1H, 4H, 1D, 1W

### Mobile-Optimized View

- Swipeable pair cards with key metrics
- Simplified spread chart (ratio + z-score)
- Quick-action buttons: Trade, Alert, Watchlist
- Push notifications for z-score threshold crossings

---

## Risk Management Framework

### Position-Level Risk

| Risk | Mitigation |
|------|-----------|
| **Spread divergence** (pair breaks down) | Stop-loss on z-score (e.g., ±3.5). Maximum loss per pair capped at 2-5% of portfolio. |
| **Liquidation risk** (leverage on individual legs) | Monitor margin per leg independently. Alert at 50% margin consumed. Auto-deleverage if either leg approaches liquidation. |
| **Leg risk** (one order fills, other doesn't) | Atomic execution — submit both orders in same block. If one fails, cancel the other immediately. |
| **Funding rate risk** (negative carry) | Display net funding projection. Alert if net funding exceeds threshold. Factor funding into P&L targets. |
| **Correlation breakdown** | Real-time cointegration monitoring. Alert when p-value rises above 0.10. Suggest closing pair if relationship deteriorates. |

### Portfolio-Level Risk

| Metric | Target |
|--------|--------|
| **Net beta exposure** | < 5% of total notional (near market-neutral) |
| **Max single pair allocation** | ≤ 20% of pair trading capital |
| **Max sector concentration** | ≤ 40% in any one sector (e.g., L1s) |
| **Max total leverage** | ≤ 3x effective leverage across all pairs |
| **Correlation across pairs** | Monitor inter-pair correlation — avoid pairs that are effectively the same bet |
| **Drawdown limit** | Pause new pair entries if portfolio drawdown exceeds 10% |

### Automated Risk Controls

1. **Delta Monitor**: Continuously calculate net market exposure across all pairs. Flash warning if delta exceeds ±10% of notional.
2. **Margin Health**: Traffic-light system per leg (green/yellow/red) based on distance to liquidation.
3. **Regime Detection**: Alert when rolling cointegration confidence drops below 95% for any active pair.
4. **Funding Rate Scanner**: Highlight pairs where net funding cost exceeds expected spread profit.
5. **Auto-Rebalance**: Option to auto-adjust hedge ratios when they drift beyond threshold (e.g., >5% from target).

### Risk Dashboard Widget

```
PORTFOLIO RISK SUMMARY
──────────────────────────────────
Net Delta:      +$420 (0.8%)     ● Green
Margin Used:    34.2%            ● Green
Active Pairs:   4/10 max         ● Green
Max Drawdown:   -2.1% (today)   ● Green
Funding (24h):  +$47.30 net     ● Green
Regime Alerts:  0                ● Green
──────────────────────────────────
```

---

## Technical Implementation on Hyperliquid

### Architecture Overview

```
┌─────────────────────────────────────────────┐
│              HypeTerminal Frontend           │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │Pair       │  │Spread    │  │Execution  │ │
│  │Suggester  │  │Charts    │  │Engine     │ │
│  └─────┬────┘  └────┬─────┘  └─────┬─────┘ │
│        │            │              │         │
│  ┌─────▼────────────▼──────────────▼──────┐ │
│  │         Pair Trading Store              │ │
│  │  (Zustand: pairs, positions, stats)     │ │
│  └─────────────────┬──────────────────────┘ │
└────────────────────┼────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│Hyperliquid│  │Stats     │  │Price     │
│Exchange   │  │Worker    │  │WebSocket │
│API        │  │(Coint.)  │  │Feed      │
└──────────┘  └──────────┘  └──────────┘
```

### Hyperliquid API Integration Points

#### 1. Market Data (Info API + WebSocket)

```typescript
// REST: Fetch all available perp markets
POST https://api.hyperliquid.xyz/info
{ "type": "meta" }
// Returns: list of all perps with size decimals, price decimals, etc.

// REST: Historical candles for spread calculation
POST https://api.hyperliquid.xyz/info
{ "type": "candleSnapshot", "coin": "SOL", "interval": "1h", "startTime": <ms>, "endTime": <ms> }

// WebSocket: Real-time price feed for spread monitoring
ws://api.hyperliquid.xyz/ws
Subscribe: { "method": "subscribe", "subscription": { "type": "allMids" } }
// Streams mid prices for all assets — perfect for real-time spread calculation

// WebSocket: L2 orderbook for execution quality
Subscribe: { "method": "subscribe", "subscription": { "type": "l2Book", "coin": "SOL" } }
```

#### 2. Order Execution (Exchange API)

```typescript
// Atomic pair trade execution — two orders in one request
POST https://api.hyperliquid.xyz/exchange
{
  "action": {
    "type": "order",
    "orders": [
      {
        "a": 0,           // asset index (SOL)
        "b": true,         // is_buy = true (long leg)
        "p": "148.20",     // price
        "s": "35.0",       // size
        "r": false,        // reduce_only
        "t": { "limit": { "tif": "Ioc" } }  // immediate-or-cancel
      },
      {
        "a": 1,           // asset index (ETH)
        "b": false,        // is_buy = false (short leg)
        "p": "3420.00",    // price
        "s": "1.52",       // size (hedge-ratio adjusted)
        "r": false,
        "t": { "limit": { "tif": "Ioc" } }
      }
    ],
    "grouping": "na"
  },
  "nonce": <timestamp>,
  "signature": <signed>
}
```

#### 3. Position Tracking

```typescript
// Fetch current positions for P&L calculation
POST https://api.hyperliquid.xyz/info
{ "type": "clearinghouseState", "user": "0x..." }
// Returns: all open positions with entry price, size, unrealized PnL, margin

// WebSocket: Real-time position updates
Subscribe: { "method": "subscribe", "subscription": { "type": "userEvents", "user": "0x..." } }
```

#### 4. Funding Rate Data

```typescript
// Current funding rates for all assets
POST https://api.hyperliquid.xyz/info
{ "type": "meta" }
// Returns funding rate per asset in the universe array

// Historical funding for P&L attribution
POST https://api.hyperliquid.xyz/info
{ "type": "fundingHistory", "coin": "SOL", "startTime": <ms>, "endTime": <ms> }
```

### Frontend Implementation

#### Zustand Store Structure

```typescript
interface PairTradingStore {
  // Pair selection & analysis
  watchlist: PairConfig[]
  activePair: PairConfig | null
  pairStats: Record<string, PairStatistics>

  // Positions
  openPairs: PairPosition[]
  closedPairs: PairPosition[]

  // Settings
  defaultLeverage: number
  riskLimits: RiskLimits
  alertThresholds: AlertThresholds
}

interface PairConfig {
  assetA: string
  assetB: string
  hedgeRatio: number
  window: 30 | 60 | 90
}

interface PairStatistics {
  correlation: number
  cointegrationPValue: number
  hurstExponent: number
  halfLife: number
  currentZScore: number
  spreadMean: number
  spreadStd: number
  lastUpdated: number
}

interface PairPosition {
  id: string
  assetA: string
  assetB: string
  direction: "longA" | "longB"
  sizeA: string
  sizeB: string
  entryPriceA: string
  entryPriceB: string
  entryZScore: number
  entryRatio: number
  leverageA: number
  leverageB: number
  tpZScore: number | null
  slZScore: number | null
  openedAt: number
}
```

#### Statistical Computation (Web Worker)

Heavy statistical calculations (cointegration, correlation matrix) should run in a **Web Worker** to avoid blocking the UI:

```typescript
// lib/pair-trading/worker.ts
// Runs in dedicated Web Worker

// 1. Fetch historical prices for all assets
// 2. Compute pairwise cointegration (ADF test)
// 3. Calculate correlation matrix
// 4. Compute z-scores, Hurst exponents, half-lives
// 5. Post results back to main thread

// Libraries: mathjs or simple-statistics for regression
// ADF test: custom implementation or port from statsmodels
```

#### Real-Time Spread Updates

```typescript
// Subscribe to allMids WebSocket
// On each tick:
// 1. Update spread = priceA - (hedgeRatio × priceB)
// 2. Recalculate z-score using stored mean/std
// 3. Check against alert thresholds
// 4. Update position P&L
// 5. Push to spread chart
```

### Key Technical Decisions

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Statistical library | `simple-statistics` + custom ADF | Lightweight, no heavy deps. ADF is ~50 lines of code. |
| Computation location | Web Worker | Cointegration matrix is O(n²) — must not block UI thread |
| Price data storage | IndexedDB via `idb` | Cache historical candles locally for fast recalculation |
| Chart library | Existing charting setup (Lightweight Charts / TradingView) | Reuse existing chart infra, add spread/ratio as custom series |
| Hedge ratio method | OLS regression with rolling window | Simple, well-understood, matches academic literature |
| Execution | Hyperliquid multi-order in single request | Minimizes leg risk — both orders in same block |
| Position tracking | Zustand store synced with Hyperliquid clearinghouse API | Single source of truth with real-time WS updates |

### Data Flow for Pair Suggester

```
Every 5 minutes:
  1. Worker fetches latest 90-day candles for top 50 assets (cached, only fetch new)
  2. Compute 50×49/2 = 1,225 pairwise cointegration tests
  3. Filter: p-value < 0.05, Hurst < 0.5, volume > $1M
  4. Rank by composite score
  5. Post top 20 pairs to main thread
  6. UI updates "Pair Suggester" panel

Every tick (real-time):
  1. allMids WebSocket delivers new prices
  2. For each watchlisted pair: recalculate z-score
  3. Flash alert if z-score crosses ±2.0 threshold
  4. Update all open position P&L
```

---

## HypeTerminal Architecture Decision (April 2025)

This section documents the architectural research and final decisions made for implementing pair trading in HypeTerminal. It supersedes the earlier "Technical Implementation" section above where the two conflict.

---

### What Pear Protocol Actually Does

Deep research into Pear Protocol's documentation (`docs.pearprotocol.io/llms-full.txt`) revealed their actual technical architecture — significantly different from what their marketing implies.

**Position isolation: none at the protocol level.** Pear does not use sub-accounts, smart contracts, or vaults for Hyperliquid integration. Hyperliquid merges all exposures to the same coin into one position with a weighted-average entry price. Pear's own docs acknowledge this:

> "Hyperliquid aggregates all exposures of the same asset across all pairs and maintains a global average entry price."
> "PnL discrepancy between Pear UI and Hyperliquid UI [will exist] until all related positions are closed."

Their solution: an off-chain database that records entry price per asset per pair trade (using a UUID `positionId`). P&L is calculated synthetically against live mark prices, not read from the exchange.

**Their explicit workaround for contamination:**
> "It is highly recommended that you trade on Pear using a wallet that has not or is not currently placing trades on Hyperliquid directly."

They cannot solve position isolation at the protocol level, so they tell users to use a dedicated separate wallet.

**Pear is server-side, not client-side.** The agent wallet private key is held on Pear's servers. Limit orders on ratios, TWAP pair orders, and TP/SL monitoring are all executed by their backend infrastructure — not the browser. When the user approves an agent, they are authorizing Pear's server key, not a local browser key.

**Closing with shared coin exposure:** When two pair trades both hold SOL and one is closed, Pear's backend issues a reduce-only order for exactly the dollar value of SOL in that specific pair's record. Example from their docs:

> "If you hold a BTC/ETH position worth $100 in BTC and a BTC/HYPE position worth $200 in BTC, and you choose to close the BTC/ETH position, we will reduce your BTC holdings by $100—not the total $300."

---

### Why Sub-Account-Per-Pair Doesn't Work

The initial architecture proposal was one sub-account per pair trade. This fails for two reasons:

1. **Sub-accounts are permanent.** There is no `deleteSubAccount` in the Hyperliquid SDK or protocol. They appear in the HL UI dropdown forever. With 500 markets and potentially hundreds of pair combinations traded over time, this creates an unusable account state.

2. **Sub-accounts are not needed per-trade anyway.** Isolation is an app-layer concern, not a per-trade protocol concern. Trying to solve attribution at the sub-account level is the wrong abstraction.

---

### HypeTerminal's Architecture: One Shared Sub-Account + App-Layer Records

HypeTerminal improves on Pear's approach by combining their app-layer record keeping with one permanent shared sub-account — solving the "dedicated wallet" problem at the protocol level without managing a second wallet.

**Account structure:**

```
Your Main Wallet (0xYou)
│
├── Main Account                 ← existing terminal, untouched
│   ├── ETH long (manual trade)
│   └── BTC short (manual trade)
│
└── Sub-account: "HT Pairs"      ← created once, reused forever
    ├── SOL long  (pair #1: SOL/ETH)
    ├── ETH short (pair #1: SOL/ETH)
    ├── ARB long  (pair #2: ARB/OP)
    └── OP short  (pair #2: ARB/OP)
```

One sub-account per user. Created on first use. Never created again. This gives protocol-level isolation between pair trades and regular trades — something Pear cannot offer.

---

### Data Model

Pair trade records live in Zustand + localStorage. This is the canonical attribution layer.

```typescript
interface PairTradeLeg {
  coin: string
  size: string      // exact size placed — authoritative for closing
  entryPx: string   // recorded from order fill response
  isBuy: boolean
  leverage: number
}

interface PairTrade {
  id: string           // uuid, local only
  legA: PairTradeLeg
  legB: PairTradeLeg
  hedgeRatio: string   // OLS β at entry time
  entryZScore: number
  tpZScore: number | null
  slZScore: number | null
  openedAt: number
  status: "open" | "closing" | "closed"
}

interface PairTradingStore {
  subAccountAddress: `0x${string}` | null
  trades: PairTrade[]
  lockedCoins(): Set<string>  // derived: all coins in open trades
}
```

---

### Signing Flow

```
User wallet (MetaMask) — one-time only
  ├── approveAgent(agentAddress)           ← existing, already done
  └── createSubAccount({ name: "HT Pairs" })
        └── returns 0xPairsAcct → stored in localStorage

Agent wallet (browser session) — all pair operations
  ├── subAccountTransfer({ subAccountUser: 0xPairsAcct, isDeposit: true, usd: N })
  ├── order({ orders: [legA, legB], vaultAddress: 0xPairsAcct })
  └── order({ orders: [closeA, closeB], reduce_only: true, vaultAddress: 0xPairsAcct })
```

No MetaMask popups after initial setup. No gas. The existing agent wallet is reused.

---

### Opening a Pair Trade

Both legs in one API request, same block. Atomic by construction.

```typescript
await placeOrder({
  orders: [
    { a: solAssetId, b: true,  p: solMarkPx, s: legA.size, r: false, t: { limit: { tif: "FrontendMarket" } } },
    { a: ethAssetId, b: false, p: ethMarkPx, s: legB.size, r: false, t: { limit: { tif: "FrontendMarket" } } },
  ],
  grouping: "na",
  vaultAddress: subAccountAddress
})
// Record fill prices from order response statuses → persist PairTrade to store
```

---

### Closing a Pair Trade

`reduce_only: true` is load-bearing, not optional. Without it, a size mismatch caused by funding adjustments can accidentally open a new opposite position. With it, the protocol guarantees the order can only reduce the existing position.

```typescript
await placeOrder({
  orders: [
    { a: solAssetId, b: false, p: solMarkPx, s: trade.legA.size, r: true, t: { limit: { tif: "FrontendMarket" } } },
    { a: ethAssetId, b: true,  p: ethMarkPx, s: trade.legB.size, r: true, t: { limit: { tif: "FrontendMarket" } } },
  ],
  grouping: "na",
  vaultAddress: subAccountAddress
})
```

---

### P&L Calculation

Synthetic. Uses local entry records against live `allMids` WebSocket prices. No exchange reads needed for display.

```
spreadPnL = (currentPxA - entryPxA) × sizeA   [long leg]
          + (entryPxB - currentPxB) × sizeB   [short leg]

fundingPnL = cumFunding.sinceOpen from clearinghouseState
             (read via useInfo("clearinghouseState", { user: subAccountAddress }))

totalPnL = spreadPnL + fundingPnL
```

---

### Coin Collision Within the Sub-Account

Two pair trades sharing a coin produce one merged position in the sub-account. Attribution is handled by the local records.

Example: SOL/ETH pair has legA.size = "35.0", SOL/BTC pair has legA.size = "40.0". Sub-account shows SOL +75.0.

Closing SOL/ETH: place reduce-only sell for "35.0". Closing SOL/BTC: place reduce-only sell for "40.0". Because both are reduce-only, neither can create an unintended short even if executed in any order.

---

### localStorage Persistence Risk and Mitigation

If the user clears browser data, the local `PairTrade` records are gone. The sub-account still holds the open positions on-chain, but the app no longer knows what size belongs to which pair trade.

Mitigation: encode pair ID into the `cloid` (client order ID) field on each open order. Hyperliquid stores `cloid` on every fill and returns it in fill history. If local records are lost, pair trades can be reconstructed by scanning `userFills` for the sub-account address and decoding the embedded pair IDs.

```typescript
// cloid = 0x + first 8 bytes of uuid + 1 byte leg flag (00 = legA, 01 = legB)
const cloid = encodePairCloid(trade.id, "legA")
```

---

### TP/SL Limitation

Pear monitors ratios server-side 24/7. HypeTerminal's monitoring is client-side — it only fires while the tab is open. This must be disclosed in the UI at the feature level, not just in docs:

```
TP @ Z=0.0   SL @ Z=-3.5   [● Active while app is open]
```

Server-side monitoring (Nitro endpoint or Cloudflare Worker) can be added as an opt-in in a later phase.

---

### Main Terminal Integration

Since pair trades live in the sub-account, main account positions are physically isolated — no protocol-level contamination is possible. The coin lock in the main terminal is informational only, warning the user not to work against their own pair thesis.

```typescript
const locked = usePairTradingStore(s => s.lockedCoins())
if (locked.has(selectedCoin)) {
  // "SOL has active pair trade exposure (SOL/ETH #1). Manage via Pairs tab."
  // Show warning — do not hard-block, user can override
}
```

---

### Comparison with Pear Protocol

| Concern | Pear Protocol | HypeTerminal |
|---------|--------------|--------------|
| Position isolation from manual trades | None — tells users to use a separate wallet | Protocol-level via shared sub-account |
| Agent key custody | Pear's servers hold it | User's browser (same as existing terminal) |
| Off-chain state | Pear's database | User's localStorage + Zustand |
| State recovery if data lost | Server has it | Reconstruct from cloid-encoded fill history |
| Limit / TWAP pair orders | Pear's backend 24/7 | Client-side for MVP |
| TP/SL on ratio | Server-side monitoring 24/7 | Client-side while tab is open |
| Failure mode | Pear server down → no automation | Tab closed → no automation (disclosed) |

---

### SDK Capabilities Confirmed (v0.31.0)

The `@nktkas/hyperliquid` SDK already supports everything needed:

| Operation | SDK Method | Client |
|-----------|-----------|--------|
| Create sub-account | `exchange.createSubAccount({ name })` | Agent (trading) |
| Fund sub-account | `exchange.subAccountTransfer({ subAccountUser, isDeposit, usd })` | Agent (trading) |
| Rename sub-account | `exchange.subAccountModify({ subAccountUser, name })` | Agent (trading) |
| Place orders on sub-account | `exchange.order({ orders, vaultAddress })` | Agent (trading) |
| Read sub-account list | `info.subAccounts({ user })` | Info (read-only) |
| Read sub-account positions | `info.clearinghouseState({ user: subAccountAddress })` | Info (read-only) |

`vaultAddress` is an optional top-level field on `order`, `cancel`, `batchModify`, `twapOrder`, `updateLeverage`, and `updateIsolatedMargin`. The existing `useExchange` hook passes params through as-is — no changes to `useExchange` itself are needed.

---

### Implementation Phases

**Phase 1 — Core Execution**

| File | Purpose |
|------|---------|
| `stores/use-pair-trading-store.ts` | Zustand + localStorage: `PairTrade[]`, `subAccountAddress`, `lockedCoins()` |
| `domain/pairs/pair-order-intent.ts` | `buildPairOpenPlan`, `buildPairClosePlan` — extends order intent with `vaultAddress` and `reduce_only` |
| `domain/pairs/cloid.ts` | Encode/decode pair ID into `cloid` for record recovery |
| `hooks/pairs/use-pair-setup.ts` | `createSubAccount` + `subAccountTransfer` flow |
| `components/pairs/pair-setup-modal.tsx` | One-time setup: create sub-account, fund it |
| `components/pairs/pair-execution-panel.tsx` | Coin selector, size, direction, preview, confirm |
| `components/pairs/pair-positions.tsx` | Open pairs list with live synthetic P&L |
| `components/pairs/pair-position-card.tsx` | Per-pair card: legs, P&L, z-score progress, close button |
| `routes/pairs.tsx` | New top-level route |

**Phase 2 — Spread Analytics**

Historical candle fetch → rolling z-score, correlation, OLS hedge ratio via Web Worker. Spread chart and z-score chart reusing existing charting infrastructure. Entry signal display.

**Phase 3 — Automated Monitoring (opt-in)**

Client-side Web Worker watcher (fires while tab is open). Optional Nitro server endpoint for 24/7 ratio monitoring and TP/SL triggers.

---

## Sources

- [Pear Protocol — Why Pair Trading Matters](https://docs.pearprotocol.io/introduction/why-pair-trading-matters)
- [Pear Protocol — Home](https://www.pear.garden/)
- [Pear Protocol — Hyperliquid Integration](https://docs.pearprotocol.io/integration-infrastructure/hyperliquid)
- [Pear Protocol $4.1M Funding — Yahoo Finance](https://finance.yahoo.com/news/pear-protocol-goes-live-hyperliquid-170500600.html)
- [Amberdata — Crypto Pairs Trading: Why Cointegration Beats Correlation](https://blog.amberdata.io/crypto-pairs-trading-why-cointegration-beats-correlation)
- [Copula-Based Trading of Cointegrated Cryptocurrency Pairs — Springer](https://link.springer.com/article/10.1186/s40854-024-00702-7)
- [QuantInsti — Pairs Trading Basics](https://blog.quantinsti.com/pairs-trading-basics/)
- [Interactive Brokers — Pairs Trading: Correlation, Cointegration](https://www.interactivebrokers.com/campus/ibkr-quant-news/pairs-trading-basics-correlation-cointegration-and-strategy-part-i/)
- [Hyperliquid API Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api)
- [Hyperliquid WebSocket Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket)
- [Hyperliquid Python SDK](https://github.com/hyperliquid-dex/hyperliquid-python-sdk)
- [Hummingbot — Hyperliquid Connector](https://hummingbot.org/exchanges/hyperliquid/)
- [DeFiLlama — Crypto Correlations BTC-SOL 0.99](https://cryptopotato.com/defillama-crypto-correlations-hit-record-highs-as-btc-sol-reaches-0-99/)
- [WunderTrading — Crypto Pairs Trading Strategy](https://wundertrading.com/journal/en/learn/article/crypto-pairs-trading-strategy)
- [Cube Exchange — Delta Neutral Strategy](https://www.cube.exchange/what-is/delta-neutral-strategy)
- [Coinbase — Delta Hedging in Crypto](https://www.coinbase.com/learn/advanced-trading/what-is-delta-hedging-and-how-does-it-work-in-crypto)
- [GMX — Decentralized Perpetual Exchange](https://gmx.io/)
- [MultiCharts — Spread & Pair Trading Software](https://www.multicharts.com/trading-software/index.php?title=Spread_and_Pair_Trading)
- [TradingView — Spread Charts](https://www.tradingview.com/support/solutions/43000502298-spread-charts/)
- [SpreadCharts — Commodity Spread Analysis](https://spreadcharts.com/)
- [CoinGape — Crypto Perpetual Futures Trading Strategies](https://coingape.com/blog/crypto-perpetual-futures-trading-strategies/)
- [AlphaPoint — Perpetual Futures in 2025](https://alphapoint.com/blog/perpetual-futures-in-2025-a-strategic-advantage-for-crypto-exchanges)
