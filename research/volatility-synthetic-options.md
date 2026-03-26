# Volatility Trading & Synthetic Options with Perpetual Futures

## Table of Contents

1. [Synthetic Options Construction with Perps](#1-synthetic-options-construction-with-perps)
2. [Delta-Neutral Strategies](#2-delta-neutral-strategies)
3. [Funding Rate Arbitrage as Volatility Play](#3-funding-rate-arbitrage-as-volatility-play)
4. [Synthetic Gamma via Dynamic Hedging](#4-synthetic-gamma-via-dynamic-hedging)
5. [Volatility Estimation Methods](#5-volatility-estimation-methods)
6. [Volatility Regime Strategies](#6-volatility-regime-strategies)
7. [Synthetic Covered Calls & Protective Puts](#7-synthetic-covered-calls--protective-puts)
8. [Hyperliquid-Specific Mechanics](#8-hyperliquid-specific-mechanics)
9. [Risk Management for Synthetic Positions](#9-risk-management-for-synthetic-positions)
10. [Mathematical Foundations](#10-mathematical-foundations)
11. [Practical Implementation](#11-practical-implementation)
12. [Advanced Concepts](#12-advanced-concepts)
13. [Real-World Desk Implementation](#13-real-world-desk-implementation)
14. [DeFi Protocols & Prior Art](#14-defi-protocols--prior-art)
15. [Existing Tools & Platform UX Analysis](#15-existing-tools--platform-ux-analysis)
16. [HypeTerminal Feature Ideas](#16-hypeterminal-feature-ideas)

---

## 1. Synthetic Options Construction with Perps

### Core Principle

Real options provide convex payoffs (limited downside, unlimited upside for calls). Perpetual futures are linear instruments. The gap is bridged through **stop-loss orders** (creating limited downside) and **take-profit orders** (capping upside), combined with **dynamic rebalancing**.

### Synthetic Call (Long)

**Construction:** Long perp + stop-loss below entry

- Buy 1 ETH-PERP at $3,000
- Set stop-loss at $2,800
- "Strike" = $2,800, "premium" = max loss ($200) + cumulative funding paid
- Payoff: Unlimited upside above $3,000, max loss = $200 + funding

**Key difference from real call:** Gap risk. If price gaps through stop-loss (e.g., flash crash), actual loss exceeds the "premium." Real options have contractual max loss; synthetic calls have *intended* max loss.

### Synthetic Put (Long)

**Construction:** Short perp + stop-loss above entry

- Short 1 ETH-PERP at $3,000
- Set stop-loss at $3,200
- "Strike" = $3,200, "premium" = max loss ($200) + cumulative funding paid/received
- Payoff: Profits as price falls below $3,000, max loss = $200 + funding

### Synthetic Straddle (Long Volatility)

**Construction:** Two sub-positions entered simultaneously

- Long 0.5 ETH-PERP with stop at entry - X
- Short 0.5 ETH-PERP with stop at entry + X
- Net delta at entry ≈ 0
- Profits from large moves in either direction

**Better approach — Dynamic Straddle:**
- Start delta-neutral (no perp position)
- Set buy-stop above current price and sell-stop below
- When one triggers, you have directional exposure
- If price reverses, the other stop triggers creating the opposite position
- Net effect: You accumulate positions in the direction of breakouts

**Equivalent premium:** Total funding cost + transaction costs over the holding period

### Synthetic Strangle

**Construction:** Wider stops than straddle

- Buy-stop at entry + Y (where Y > X from straddle)
- Sell-stop at entry - Y
- Cheaper "premium" (less likely to trigger) but needs bigger move to profit
- Lower funding cost because you're flat until a stop triggers

### Synthetic Bull Call Spread

**Construction:** Long perp + stop-loss + take-profit

- Long 1 ETH-PERP at $3,000
- Stop-loss at $2,800 (lower strike)
- Take-profit at $3,400 (upper strike)
- Max profit: $400, Max loss: $200, Risk/reward: 2:1
- Payoff shape mimics a bull call spread

### Synthetic Bear Put Spread

**Construction:** Short perp + stop-loss + take-profit

- Short 1 ETH-PERP at $3,000
- Stop-loss at $3,200
- Take-profit at $2,600
- Max profit: $400, Max loss: $200

### Synthetic Iron Condor

**Construction:** Combination of bull put spread + bear call spread

- Short perp A: Entry $3,000, stop $3,300, TP $2,800
- Long perp B: Entry $3,000, stop $2,700, TP $3,200
- Profits when price stays in range $2,800-$3,200
- "Premium received" = funding income while positions are open (if funding favorable)

### Limitations vs Real Options

| Feature | Real Options | Synthetic (Perps) |
|---------|-------------|-------------------|
| Max loss guarantee | Contractual | Stop-loss dependent (gap risk) |
| Convexity (gamma) | Built-in | Must be manufactured via rebalancing |
| Time decay (theta) | Known at entry | Approximated by funding rate |
| Vega exposure | Direct | Indirect (funding rate sensitivity) |
| Strike precision | Exact | Approximate (stop-loss levels) |
| Liquidation risk | None (for buyers) | Yes, if under-margined |
| Capital efficiency | Premium only | Margin requirement (higher) |
| Expiry | Fixed | None (perpetual, but funding accrues) |

---

## 2. Delta-Neutral Strategies

### Spot-Perp Basis Trade

**The most established delta-neutral strategy in crypto:**

- Buy 1 ETH spot
- Short 1 ETH-PERP
- Net delta = 0 (immune to price moves)
- Profit from: Positive funding rate (longs pay shorts)

**Returns:** Historically 12-25% APY in bull markets (when funding is consistently positive), Sharpe ratio 3-6 in favorable conditions.

**Capital allocation with leverage:**
- Spot leg: Full notional (e.g., $3,000 for 1 ETH)
- Perp leg: Margin only (e.g., $600 at 5x leverage)
- Total capital: $3,600 for $3,000 notional exposure
- Funding yield on capital: `(funding_rate * notional) / total_capital`

**Rebalancing triggers:**
- Delta drift > 5% of notional
- Funding rate turns negative for > 4 consecutive periods
- Margin ratio drops below 2x maintenance

### Perp-Perp Basis Trade (Cross-Exchange)

- Long ETH-PERP on Exchange A (lower funding)
- Short ETH-PERP on Exchange B (higher funding)
- Capture funding rate differential
- Risk: Different liquidation engines, exchange counterparty risk

### Multi-Leg Delta-Neutral

- Long ETH-PERP + Short BTC-PERP (beta-adjusted)
- If ETH beta to BTC = 1.3, short 1.3 BTC per 1 ETH
- Captures relative performance + funding differential
- More complex — requires continuous beta estimation

---

## 3. Funding Rate Arbitrage as Volatility Play

### Hyperliquid Funding Mechanics

- **Calculation:** Premium = (Mark Price - Oracle Price) / Oracle Price
- **Sampling:** Every 5 seconds, averaged over the funding interval
- **Payment:** Every 1 hour
- **Cap:** ±4% per hour (extreme markets)
- **Direction:** Positive funding = longs pay shorts, negative = shorts pay longs

### Funding Rate as Volatility Signal

Funding rate encodes market sentiment and positioning:

- **High positive funding** → Excessive long leverage → Market overheated → Higher probability of mean reversion (crash)
- **High negative funding** → Excessive short leverage → Market oversold → Higher probability of bounce
- **Low/neutral funding** → Balanced positioning → Lower vol expected

**Empirical finding:** 14+ consecutive days of elevated positive funding has historically preceded major corrections in crypto.

### Funding-Implied Volatility

**The key insight:** Funding rate is analogous to the cost of carry for a synthetic forward. This cost encodes an implied volatility:

```
Annualized Funding Rate = Hourly Rate × 24 × 365

Funding-Implied Vol ≈ √(2π) × Annualized Funding Rate
```

More precisely, using variance swap replication theory:

```
σ²_implied ≈ 2 × |r_funding_annual| / T
```

Where T is the time horizon in years.

**Cross-Asset Funding Vol Table:**
For every Hyperliquid market, compute:
- Current hourly funding rate
- Annualized rate
- Funding-implied volatility
- Trailing 30D realized volatility
- IV-RV spread (positive = vol expensive, negative = vol cheap)
- IV percentile (where current IV sits vs historical)

### Funding Mean-Reversion Strategy

**Entry signals (Z-score based):**
- Compute rolling mean and standard deviation of funding rate (lookback: 7-30 days)
- Z-score = (current_funding - mean) / stdev
- Enter short when Z > 2.0 (funding unsustainably high, expect mean reversion)
- Enter long when Z < -2.0 (funding unsustainably negative)

**Exit signals:**
- Z-score returns to ±0.5 (mean reversion complete)
- Stop-loss: Z-score exceeds ±3.0 (regime change, not mean-reverting)

---

## 4. Synthetic Gamma via Dynamic Hedging

### How It Works

Real gamma = rate of change of delta with respect to price. Synthetic gamma is created by **rebalancing a perp position as price moves**, buying more as price rises and selling as it falls (for long gamma) or vice versa (for short gamma).

### Gamma Scalping with Perps

**Long synthetic gamma (profits from volatility):**
1. Start delta-neutral
2. When price moves up by ΔS, sell ΔS worth of perp (lock in profit)
3. When price moves down by ΔS, buy ΔS worth of perp (lock in profit)
4. Each rebalance captures a small profit proportional to the move squared
5. Cost: Transaction fees + funding rate (the "theta" of the synthetic option)

**Profit per rebalance:**
```
P&L ≈ 0.5 × Γ × (ΔS)² - θ × Δt
```

Where:
- Γ (gamma) is determined by position size and rebalancing frequency
- ΔS is the price move between rebalances
- θ (theta) is funding cost per unit time

**Critical tradeoff:** More frequent rebalancing = higher gamma (more profit from vol) but higher transaction costs. Less frequent = lower gamma but lower costs.

### Scale Orders as Passive Gamma

Instead of actively rebalancing, place a grid of limit orders:

- Sell limit at +1%, +2%, +3% from current price
- Buy limit at -1%, -2%, -3% from current price
- Each filled order is a "rebalance event"
- Passive execution = lower fees (maker rebates on Hyperliquid)

This creates synthetic gamma without active monitoring.

### Hedging Error

The gap between synthetic and real gamma:

```
Hedging Error = Σ [0.5 × Γ × (ΔS)² - actual P&L per interval]
```

Minimized by:
- More frequent rebalancing (but higher cost)
- Smaller position sizes (but lower absolute return)
- Using TWAP for rebalances (reduces market impact)

---

## 5. Volatility Estimation Methods

### Realized Volatility Estimators

**1. Close-to-Close (Standard)**
```
σ_CC = √(252/n × Σ(ln(C_i/C_{i-1}))²)
```
Simple but misses intraday volatility.

**2. Parkinson (High-Low)**
```
σ_P = √(1/(4n×ln2) × Σ(ln(H_i/L_i))²)
```
5x more efficient than close-to-close. Uses high-low range.

**3. Garman-Klass**
```
σ_GK = √(1/n × Σ[0.5×(ln(H/L))² - (2ln2-1)×(ln(C/O))²])
```
Most efficient for non-trending markets. Combines open, high, low, close.

**4. Yang-Zhang**
```
σ_YZ = √(σ²_overnight + k×σ²_CC + (1-k)×σ²_RS)
```
Handles overnight gaps (relevant for crypto when exchanges have outages or during chain halts). Combines overnight returns, close-to-close, and Rogers-Satchell estimator.

**5. Realized Variance / Bipower Variation**
```
RV = Σ r²_i (sum of squared high-frequency returns)
BV = (π/2) × Σ |r_i| × |r_{i-1}| (robust to jumps)
```
Jump component: J = RV - BV. Separates continuous volatility from discrete jumps.

### Funding-Rate Implied Volatility Proxies

**Method 1: Direct Annualization**
```
IV_funding = √(2π × |funding_annual|)
```

**Method 2: Rolling Window Average**
```
IV_funding = √(2π × mean(|funding_rate|) × periods_per_year)
```

**Method 3: Cross-Reference with Options Markets**
Use Deribit DVOL or BVIV as ground truth, regress against Hyperliquid funding rates to build a calibrated model:
```
IV_estimated = α + β × funding_rate + γ × funding_rate² + ε
```

### External IV Sources (for comparison)
- **DVOL (Deribit):** 30-day implied vol index for BTC/ETH
- **BVIV (Block Scholes):** Bitcoin Implied Volatility Index
- **Volmex EVIV/BVIV:** On-chain tradeable vol indices

---

## 6. Volatility Regime Strategies

### Regime Classification

| Regime | RV Level | Characteristics | Strategy |
|--------|----------|-----------------|----------|
| Low vol | < 30% ann. | Tight ranges, low funding | Sell synthetic strangles, collect funding |
| Normal vol | 30-60% | Trending markets | Momentum with vol-adjusted sizing |
| High vol | 60-100% | Breakouts, liquidation cascades | Long gamma (dynamic hedging) |
| Crisis vol | > 100% | Black swan events | Reduce exposure, collect funding spikes |

### Hurst Exponent for Regime Detection

```
H = log(R/S) / log(n)
```

- H > 0.5: Trending (momentum regime)
- H ≈ 0.5: Random walk
- H < 0.5: Mean-reverting

Use trailing Hurst exponent to dynamically switch between momentum and mean-reversion strategies.

### Combined Volatility + Momentum Strategy

**Entry rules:**
1. Compute 20-day realized vol and its percentile rank
2. Compute 20-day momentum (return)
3. If vol is low (< 25th percentile) AND momentum is positive → Long perp (trending breakout likely)
4. If vol is high (> 75th percentile) AND momentum is negative → Short perp (panic selling, expect mean reversion)
5. If vol is extreme (> 90th percentile) → Go flat or long gamma only

---

## 7. Synthetic Covered Calls & Protective Puts

### Synthetic Covered Call

**Real covered call:** Long stock + short call (collect premium, cap upside)

**Synthetic equivalent:**
- Long 1 ETH spot
- Short 0.3 ETH-PERP (partial hedge)
- Take-profit on the short at target price (the "strike")
- "Premium collected" = funding income from the short perp + partial upside capture

**Revenue decomposition:**
- Spot appreciation (up to TP level): 0.7 × ΔS (you're 70% long)
- Funding income: 0.3 × hourly_funding × hours_held
- Max upside: TP level - entry + total funding collected

### Synthetic Protective Put

**Real protective put:** Long stock + long put (pay premium, limit downside)

**Synthetic equivalent:**
- Long 1 ETH spot
- Short 0.5 ETH-PERP with stop-loss above entry (so it stays short)
- Net position: 0.5 delta long
- If price drops, the short perp profits offset half the spot loss
- "Premium paid" = funding cost on the short perp (if funding positive, you're receiving; if negative, paying)

### Synthetic Collar

- Long 1 ETH spot
- Short 0.5 ETH-PERP (protective put component)
- Take-profit on spot at upper target (covered call component)
- Zero-cost if funding income ≈ transaction costs

---

## 8. Hyperliquid-Specific Mechanics

### Funding Formula

```
Premium = (Impact Bid + Impact Ask) / 2 - Oracle Price) / Oracle Price
Funding Rate = Average Premium + clamp(Oracle - Mark, -0.5%, +0.5%)
Capped at: ±4% per hour
```

Impact price is calculated using order book depth, making it resistant to manipulation.

### Key Advantages for Vol Trading

1. **Hourly funding** — More frequent than most CEXs (8h), providing:
   - More granular vol data
   - Faster convergence to fair value
   - More opportunities for funding arb

2. **On-chain order book** — Fully transparent:
   - Can derive market microstructure signals
   - Order book depth informs impact price → funding rate
   - Visible liquidation levels

3. **Low fees** — Makes frequent rebalancing (dynamic hedging) economically viable:
   - Maker: 0.01%
   - Taker: 0.035%
   - Gamma scalping with 10-20 rebalances/day is feasible

4. **Cross-margin** — All positions share collateral:
   - Multi-leg strategies don't multiply margin requirements
   - Can run multiple synthetic options simultaneously

5. **100+ perp markets** — Rich universe for:
   - Cross-asset correlation strategies
   - Dispersion trading (index vol vs component vol)
   - Sector rotation based on vol regimes

6. **Vault system** — Automated strategy execution:
   - 100 USDC minimum for followers
   - 10% leader fee, 5% stake requirement
   - Could build vol strategy vaults (e.g., "Gamma Scalping Vault," "Funding Arb Vault")

### HLP as Implicit Short-Vol Position

Hyperliquid's HLP (liquidity provider pool) is implicitly short volatility:
- It market-makes, profiting from bid-ask spread in calm markets
- It loses when price moves sharply (adverse selection)
- Understanding HLP's vol exposure helps predict market microstructure behavior

---

## 9. Risk Management for Synthetic Positions

### Gap Risk

**The #1 risk for synthetic options.** A stop-loss at $2,800 doesn't guarantee execution at $2,800.

**Mitigation:**
- Use wider stops than "strike" (accept higher "premium")
- Size positions so gap-through-stop doesn't exceed max acceptable loss
- Avoid holding synthetic options through known high-risk events (listings, delistings, upgrades)

### Liquidation-Before-Stop Risk

With leverage, liquidation price may be CLOSER than stop-loss:

**Example:**
- Long 1 ETH-PERP at $3,000 with 10x leverage
- Margin: $300
- Stop-loss at $2,800 (intended max loss: $200)
- But liquidation at $2,730 (margin fully consumed at ~$270 loss)
- Problem: If price moves fast, you get liquidated at $2,730 before stop at $2,800 fills

**Rule:** Always ensure `liquidation_price` is BELOW `stop_loss_price` for longs (above for shorts). This means using lower leverage or wider stops.

### Funding Drag (Theta Equivalent)

Cumulative funding cost erodes positions over time:

```
Total Funding Cost = Σ (position_size × hourly_funding_rate) over holding period
```

**Mitigation:**
- Track cumulative funding as a running P&L component
- Set "max funding budget" per strategy (like max theta)
- Close positions when funding cost exceeds expected vol profit

### Position Sizing — Kelly Criterion

```
f* = (p × b - q) / b
```

Where:
- f* = fraction of capital to risk
- p = probability of winning
- q = 1 - p
- b = win/loss ratio

**Recommendation:** Use quarter-Kelly (f*/4) for synthetic options strategies due to:
- Non-normal return distributions
- Gap risk not captured in Kelly assumptions
- Correlation between positions

### Portfolio-Level Limits

- Max 25% of capital in any single synthetic options strategy
- Max 50% of capital in all vol strategies combined
- Max 2% of capital at risk per individual "synthetic option"
- Daily drawdown limit: 5% — close all positions if hit
- Correlation limit: No two positions with > 0.8 correlation

---

## 10. Mathematical Foundations

### Perpetual Pricing Theory (Ackerer-Hugonnier-Jermann)

A perpetual futures contract has no expiry. Its price satisfies:

```
F_perp = S × exp(r - q + λ)
```

Where:
- S = spot price
- r = risk-free rate
- q = convenience yield
- λ = funding rate adjustment

In equilibrium, the funding rate forces convergence: F_perp → S.

### Power Perpetuals (Squeeth)

A power perpetual tracks S^p (e.g., ETH²):

```
Price = S^p × exp(funding_adjustment)
Funding ≈ p × (p-1) × σ² / 2 (for p=2: σ²)
```

This gives **constant gamma** — the holy grail for vol traders. No rebalancing needed for gamma exposure. Squeeth (p=2) directly tracks variance.

### Everlasting Options (Paradigm Research)

Theoretical construction of options without expiry using a portfolio of short-dated options:

```
Everlasting Option = Σ (w_i × Option_i(T_i))
```

With weights chosen so the portfolio self-renews. Funding mechanism similar to perps maintains the option exposure perpetually.

### Greeks Approximation for Synthetic Positions

**Delta:** Direct from position size
```
Δ_synthetic = position_size / notional
```

**Gamma:** From rebalancing frequency
```
Γ_synthetic ≈ 2 × rebalance_size / (trigger_band × S²)
```

**Theta:** From funding rate
```
θ_synthetic ≈ -position_size × funding_rate × S
```

**Vega:** From funding rate sensitivity to vol changes
```
ν_synthetic ≈ ∂(funding_rate) / ∂(σ) × position_size
```

### Modified Put-Call Parity for Perps

```
Synthetic Call - Synthetic Put = Perp Position + PV(Cumulative Funding)
```

The funding component acts like the interest rate differential in traditional put-call parity.

---

## 11. Practical Implementation

### Entry Signals

1. **IV/RV Divergence:** Funding-implied vol > 1.5 × 30D realized vol → sell vol (short gamma). Funding-implied vol < 0.7 × 30D realized vol → buy vol (long gamma).

2. **Funding Z-Score:** |Z| > 2.0 on funding rate → mean reversion trade.

3. **Bollinger Squeeze:** Bollinger Band width < 20th percentile → breakout imminent → long gamma.

4. **Liquidation Heatmap:** Large liquidation clusters nearby → expect vol spike → long gamma.

5. **OI Divergence:** Open interest rising + price flat → positions accumulating → expect breakout.

### Exit Signals

1. IV/RV spread normalizes (returns to 1.0 ratio)
2. Funding Z-score returns to ±0.5
3. Cumulative funding cost exceeds budget
4. Position age exceeds max holding period
5. Drawdown limit hit

### Rebalancing Frequency by Strategy

| Strategy | Rebalance Frequency | Trigger |
|----------|-------------------|---------|
| Gamma scalp | 1-4 hours | Price moves > 1% |
| Delta-neutral funding | 4-24 hours | Delta drift > 5% |
| Synthetic straddle | On stop trigger | Stop-loss/TP hit |
| Funding arb | 1-8 hours | Funding rate change |
| Basis trade | Daily | Basis drift > 0.1% |

### Execution Infrastructure

1. **WebSocket feeds** for real-time price + funding data
2. **Order management** with conditional (stop/TP) and limit orders
3. **Position tracker** computing live Greeks and P&L
4. **Risk engine** checking limits before each trade
5. **Rebalancing engine** monitoring triggers and executing hedges

---

## 12. Advanced Concepts

### Variance Swap Replication via Perps

A variance swap pays realized variance minus a fixed strike. Replicate with:

1. Start delta-neutral
2. Continuously rebalance to maintain delta-neutral
3. The P&L of the rebalancing = realized variance
4. Subtract funding cost = net variance swap payoff

```
Var Swap P&L = Σ (r_i² - 2 × r_i × Δ_{i-1}) ≈ Realized Variance - 2 × Funding Cost
```

### Volatility Surface from Perp Data

Construct a pseudo-vol surface using:
- **X-axis (strike equivalent):** Distance from current price to major order book levels
- **Y-axis (tenor equivalent):** Different lookback windows for realized vol (1D, 7D, 30D, 90D)
- **Z-axis (vol):** Funding-implied vol at each point

This gives a "perp-implied vol surface" without real options data.

### Term Structure Analysis

Using different realized vol lookback windows as a proxy for term structure:

```
1D RV → Ultra-short vol (intraday)
7D RV → Short-term vol
30D RV → Medium-term vol
90D RV → Long-term vol
```

When short-term vol > long-term vol → Inverted term structure (expect mean reversion).
When short-term vol < long-term vol → Normal term structure (expect continuation).

### Cross-Asset Dispersion Trading

- Compute vol of an equal-weighted basket of Hyperliquid perps
- Compare to average of individual asset vols
- If individual vols > basket vol → Correlation is low → Sell individual vol, buy basket vol
- Implementation: Short gamma on individual perps, long gamma on a basket position

### Volatility-of-Volatility

```
VolOfVol = σ(σ_realized) over rolling window
```

High VolOfVol → Unstable regimes → Wider hedging bands needed.
Low VolOfVol → Stable regime → Tighter hedging, more aggressive positions.

---

## 13. Real-World Desk Implementation

### Institutional Desk Allocation

| Strategy | Allocation | Target Return | Sharpe |
|----------|-----------|---------------|--------|
| Funding arbitrage | 40% | 15-25% APY | 3-6 |
| Gamma scalping | 25% | 20-40% APY | 1-2 |
| Directional vol | 20% | 30-80% APY | 0.5-1.5 |
| Reserve/tail hedge | 15% | -5% (insurance) | N/A |

### Professional Workflow

1. **Pre-market:** Review overnight funding, check IV/RV spreads, update regime classification
2. **Morning:** Set delta-neutral positions, place gamma scalp grid orders
3. **Intraday:** Monitor delta drift, execute rebalances, adjust stops
4. **End of day:** Reconcile P&L by component (delta, gamma, theta/funding, vega)
5. **Weekly:** Rebalance strategy allocations, update vol models, review performance attribution

### Infrastructure Requirements

- **Latency:** < 100ms for order placement (hedge rebalancing)
- **Data:** Real-time price, funding, OI, order book depth
- **Compute:** Vol estimation models running continuously
- **Risk:** Pre-trade checks, position limits, margin monitoring
- **Backup:** Failover for auto-hedging if primary system fails

---

## 14. DeFi Protocols & Prior Art

### Panoptic
- Built on Uniswap v3 concentrated liquidity
- LP positions = short options (providing liquidity in a range = selling a strangle)
- "Streaming premium" — continuous funding-like mechanism replaces discrete premium
- Empirically: Panoptic option prices track Black-Scholes with ~82% coefficient of variation
- **Key insight for HypeTerminal:** The idea that LP positions and perp positions can synthesize options payoffs is well-validated

### Opyn Squeeth (ETH²)
- Power perpetual: constant gamma, no strikes, no expiry
- Funding rate ≈ σ² (realized variance)
- "Crab Strategy" vault = short squeeth + long ETH = delta-neutral short vol
- **Key insight:** Single-instrument vol exposure without the complexity of options chains

### Derive (formerly Lyra v2)
- Portfolio margin for options: 75x capital efficiency
- Combined order book for spot, perps, and options
- **Key insight:** Unified margin across instrument types enables complex synthetic strategies

### Volmex
- Tradeable volatility indices (BVIV, EVIV)
- Derived from options market data
- **Key insight:** A dedicated "vol instrument" is valuable even without the full options infrastructure

---

## 15. Existing Tools & Platform UX Analysis

### How Professional Platforms Present Options/Vol Analytics

**Bloomberg Terminal:**
- OVME: Price any option, scenario analysis, what-if on vol/price/time
- OMON: Live options chain with Greeks
- SKEW: Vol skew across strikes
- Key pattern: Everything is linked — click a strike, it populates the pricer

**TradingView:**
- Options chain overlay on charts
- Community scripts for vol smile, term structure
- Key strength: Overlaying vol indicators on price charts

**Tastytrade / Thinkorswim:**
- Best-in-class strategy builder with visual drag-on-number-line UX
- Risk profile graph that updates in real-time
- Probability analysis, historical backtesting
- ThinkBack: "What would this strategy have done on date X?"

**Deribit:**
- Options chain table with inline Greeks
- Vol smile chart, term structure chart
- Multi-leg strategy builder with combined payoff diagram

**Laevitas.ch:**
- Gold standard for crypto vol analytics
- DVOL index, term structure, skew, vol surface
- Realized vs implied vol, funding rates cross-exchange
- Cross-asset funding rate comparison

### What's Missing in Hyperliquid Ecosystem

1. No tool converts Hyperliquid funding rates to volatility metrics
2. No synthetic options builder exists for any perp DEX
3. No cross-asset correlation/spread tools
4. No dynamic hedging automation
5. No vol dashboard specific to Hyperliquid's 100+ markets
6. No payoff visualization for perp strategies

---

## 16. HypeTerminal Feature Ideas

### Tier 1 — High Impact, Feasible Now

#### 1. Funding Rate Volatility Dashboard

**The killer feature.** Convert all Hyperliquid funding rates to implied volatility.

**Components:**
- **Cross-Asset Funding Vol Table:** All perps with columns: Current Funding, Annualized Rate, Implied Vol, 30D Realized Vol, IV-RV Spread, IV Percentile. Sortable, filterable.
- **Funding-Vol Gauge:** Speedometer-style gauge showing current IV from funding (green/yellow/red zones).
- **Funding vs Realized Vol Chart:** Two lines with shaded area between them. Red area = vol expensive, green = vol cheap.
- **Funding Heatmap Calendar:** GitHub contribution graph style — each cell = one funding period, color intensity = rate magnitude, red = positive, blue = negative.
- **IV Percentile Ranking:** Where current implied vol sits relative to last 30/90/365 days.

#### 2. Position Payoff Visualizer

For any existing or planned position, show the payoff diagram including funding cost projections.

**Components:**
- **Payoff curve** at multiple time horizons (T+1d, T+7d, T+30d) showing funding erosion
- **Probability overlay** on X-axis from historical vol distribution
- **Breakeven point** with probability estimate
- **Scenario matrix:** Price change × time grid with color-coded P&L
- **Liquidation distance indicator:** Visual gauge with green/yellow/red zones

#### 3. Synthetic Strategy Templates

Pre-built templates that lower the barrier to entry:

- **Synthetic Call:** Long perp + stop-loss. User sets "strike" (stop level) and size.
- **Synthetic Put:** Short perp + stop-loss.
- **Synthetic Straddle:** Delta-neutral with breakout stops in both directions.
- **Bull/Bear Spread:** Perp + stop + take-profit.
- **Delta-Neutral Yield:** Spot + short perp, harvest funding.
- **Gamma Scalp:** Grid of limit orders around current price.

Each template shows: equivalent Greeks, expected funding cost, max risk, capital required.

#### 4. Hedge Monitor Widget

For users running hedged strategies:

```
┌─────────────────────────────────────┐
│ HEDGE MONITOR                       │
│                                     │
│ Target Delta: 0.00 (delta neutral)  │
│ Current Delta: +0.35 ETH            │
│ Drift: ▓▓▓▓▓▓░░░░ 35%              │
│                                     │
│ ⚡ REBALANCE NEEDED                  │
│ Action: SELL 0.35 ETH-PERP          │
│ Est. Cost: $0.42 (slippage + fees)  │
│                                     │
│ [Rebalance Now]  [Set Auto-Hedge]   │
└─────────────────────────────────────┘
```

Features:
- Delta drift visualization
- One-click rebalance with pre-populated order
- Auto-hedge mode (configurable: time-based, threshold-based, band-based)
- Hedge history timeline showing all rebalances + cumulative cost

### Tier 2 — High Impact, More Complex

#### 5. Synthetic Options Builder (Multi-Leg)

**Visual drag builder:**
- Price axis with draggable stop/TP markers
- Add legs (long/short perp with different sizes)
- Combined payoff diagram updates live
- Margin calculator for the combined position
- Funding estimator (daily/weekly projected cost)
- One-click execution of all legs

**Template-based flow:**
1. Select strategy type (call, put, straddle, spread, etc.)
2. Set parameters (size, "strike" levels, hedge ratio)
3. Review payoff + risk metrics
4. Execute

#### 6. Dynamic Hedge Advisor

- Real-time delta tracking across all positions
- Rebalancing recommendations with configurable strategies
- Hedge efficiency score (actual vs theoretical)
- Alert system: drift warnings, funding spikes, regime changes, liquidation proximity
- P&L attribution: delta, gamma, theta (funding), vega components

#### 7. Realized Volatility Suite

- Multiple estimators: Close-to-Close, Parkinson, Garman-Klass, Yang-Zhang
- Adjustable lookback windows
- Vol cone: Historical percentiles with current level marked
- Vol regime indicator: Low / Normal / High / Crisis with Hurst exponent

#### 8. Cross-Asset Correlation Matrix

- Pairwise correlation heatmap for all Hyperliquid perps
- Rolling correlation with adjustable window
- Identify decorrelating pairs for spread trades
- Sector groupings (L1s, DeFi, memes, etc.)

### Tier 3 — Differentiating, Advanced

#### 9. Vol Surface Visualization

3D surface with:
- X-axis: Distance from spot (strike proxy)
- Y-axis: Lookback window (tenor proxy)
- Z-axis: Volatility level
- Interactive rotation and zoom

#### 10. Backtest Engine

"How would this synthetic straddle have performed over the last 30/90/180 days?"
- Historical funding rates applied
- Historical price moves for payoff calculation
- P&L decomposition (delta + gamma + theta)
- Win rate, max drawdown, Sharpe ratio

#### 11. Automated Strategy Vaults

Build on Hyperliquid's vault system:
- **Gamma Scalping Vault:** Automated grid-based gamma scalping
- **Funding Arb Vault:** Spot-perp basis trade with auto-rebalancing
- **Vol Targeting Vault:** Dynamically adjust position size to maintain constant vol exposure
- Users deposit USDC, vault executes the strategy

#### 12. Dispersion Trading Tool

- Compute basket vol vs individual asset vols
- Identify correlation breakdowns
- Suggest dispersion trades (short basket gamma, long individual gammas)
- Track implied correlation across Hyperliquid assets

### Recommended MVP

For initial release, prioritize these four features:

1. **Funding Rate Vol Dashboard** — Unique in the ecosystem, converts funding to IV, shows IV-RV spreads across all assets
2. **Position Payoff Visualizer** — Show payoff diagrams with funding cost projections for any position
3. **Synthetic Strategy Templates** — Pre-built strategies with one-click execution
4. **Hedge Monitor Widget** — Delta drift tracking with one-click rebalance

These create the first volatility intelligence layer for any Hyperliquid trading terminal.

---

## References

### Academic & Theoretical
- Ackerer, Hugonnier, Jermann — "Perpetual Futures Pricing" (2023)
- Dave White, Dan Robinson — "Power Perpetuals" (Paradigm Research, 2021)
- Dave White, Sam Bankman-Fried — "Everlasting Options" (Paradigm Research, 2021)
- Garman, Klass — "On the Estimation of Security Price Volatilities from Historical Data" (1980)
- Yang, Zhang — "Drift Independent Volatility Estimation Based on High, Low, Open, and Close Prices" (2000)
- Parkinson — "The Extreme Value Method for Estimating the Variance of the Rate of Return" (1980)

### Protocol Documentation
- Hyperliquid Docs — Funding Rate Mechanism
- Panoptic — Perpetual Options on Uniswap v3
- Opyn Squeeth — Power Perpetuals Whitepaper
- Derive (Lyra v2) — Portfolio Margin Documentation
- Volmex — Volatility Index Methodology

### Strategy & Implementation
- Paradigm Research — "Gamma Swaps and Variance Swaps" (2022)
- Deribit Insights — "Funding Rate as a Volatility Signal"
- Laevitas — Crypto Volatility Analytics Methodology
- Greeks.live — Options Flow Analysis Framework

### Trading Platform References
- Bloomberg Terminal — OVME, OMON, GIV documentation
- Tastytrade — Strategy builder UX patterns
- Thinkorswim — Risk profile and probability analysis
- Deribit — Options chain and vol tools interface
