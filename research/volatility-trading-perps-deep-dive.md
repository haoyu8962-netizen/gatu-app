# Volatility Trading & Synthetic Options via Perpetual Futures: Deep Technical Research

## Table of Contents

1. [Synthetic Options Construction Using Perpetual Futures](#1-synthetic-options-construction)
2. [Delta-Neutral Strategies with Perps](#2-delta-neutral-strategies)
3. [Funding Rate Arbitrage as a Volatility Play](#3-funding-rate-arbitrage)
4. [Synthetic Gamma Exposure via Dynamic Hedging](#4-synthetic-gamma-exposure)
5. [Volatility Estimation Methods](#5-volatility-estimation)
6. [Mean Reversion & Momentum in Volatility Regimes](#6-volatility-regimes)
7. [Synthetic Covered Calls & Protective Puts](#7-synthetic-covered-calls-and-puts)
8. [Hyperliquid-Specific Implementation](#8-hyperliquid-implementation)
9. [Risk Management for Synthetic Positions](#9-risk-management)
10. [Mathematical Foundations](#10-mathematical-foundations)
11. [Practical Implementation Details](#11-practical-implementation)
12. [Advanced Concepts](#12-advanced-concepts)
13. [Real-World Desk Implementation](#13-real-world-implementation)
14. [DeFi Protocols & On-Chain Analogues](#14-defi-protocols)

---

## 1. Synthetic Options Construction Using Perpetual Futures {#1-synthetic-options-construction}

### 1.1 Fundamental Principle

Options payoffs can be approximated using perpetual futures combined with stop-loss and take-profit orders. The key insight is that a stop-loss on a perp position creates a bounded-loss profile similar to an option premium, while the unbounded side retains directional exposure.

Unlike real options, these constructions are **piecewise linear** (not convex). They lack true gamma (the payoff doesn't curve) and are subject to gap risk (stops can be slipped). Understanding these limitations is essential.

### 1.2 Synthetic Long Call

**Construction**: Long 1 unit perp + stop-loss at strike distance below entry.

```
Entry:      Long 1 BTC perp at $100,000
Stop-loss:  $97,000 (reduce-only stop market)
"Premium":  $3,000 (max loss if stop triggers cleanly)
"Strike":   $100,000 (entry price)
```

**Payoff comparison:**

```
Price        Real Call (K=100k, C=3k)    Synthetic
$90,000      -$3,000                      -$3,000 (stopped out)
$97,000      -$3,000                      -$3,000 (stop trigger)
$100,000     -$3,000                      $0 (at entry, no funding)
$103,000     $0 (breakeven)               +$3,000
$110,000     +$7,000                      +$10,000
```

**Critical difference**: The real call has a curved payoff approaching the strike (positive gamma). The synthetic has a hard kink at the stop level. The real call also has defined time decay (theta); the synthetic has ongoing funding costs instead.

### 1.3 Synthetic Long Put

**Construction**: Short 1 unit perp + stop-loss above entry.

```
Entry:      Short 1 BTC perp at $100,000
Stop-loss:  $103,000 (reduce-only stop market)
"Premium":  $3,000 (max loss)
Profit:     Unlimited below $100,000
```

### 1.4 Synthetic Straddle (Long Volatility)

**Construction**: Two conditional entries that activate on breakout in either direction.

```
Stop-buy:   Buy at $102,000, SL at $101,000 (upside leg)
Stop-sell:  Sell at $98,000, SL at $99,000 (downside leg)
"Premium":  $1,000 per leg = $2,000 total
Breakeven:  Price moves > $2,000 from current mid ($100,000)
```

**Mechanics**: When price breaks above $102,000, the long leg activates. If price then reverses through $98,000, the short leg also activates (creating a net-flat or adding a hedge). The maximum loss scenario is whipsaw -- price triggers the long, gets stopped out, triggers the short, gets stopped out = $2,000 total.

**Limitation vs real straddle**: A real straddle profits from ANY move because of gamma. The synthetic only profits from a breakout BEYOND the entry levels. Consolidation within the $98k-$102k range produces zero P&L (real straddle would lose theta).

### 1.5 Synthetic Strangle

Same as straddle but with wider trigger levels:

```
Stop-buy:   Buy at $105,000, SL at $103,000
Stop-sell:  Sell at $95,000, SL at $97,000
"Premium":  $2,000 per leg = $4,000 total
```

Cheaper per-leg (tighter stops), requires larger move, lower probability of whipsaw loss.

### 1.6 Bull Call Spread Approximation

**Construction**: Long perp + stop-loss (floor) + take-profit (cap).

```
Entry:      Long 1 BTC at $100,000
Stop-loss:  $97,000 (max loss = $3,000)
Take-profit: $106,000 (max gain = $6,000)
Risk/Reward: 1:2
```

This replicates the bounded-profit, bounded-loss shape of a vertical spread.

### 1.7 Bear Put Spread Approximation

```
Entry:      Short 1 BTC at $100,000
Stop-loss:  $103,000 (max loss = $3,000)
Take-profit: $94,000 (max gain = $6,000)
```

### 1.8 Iron Condor Approximation

**Construction**: Two opposing spread-like positions creating a range-bound payoff.

```
Bull put leg:  Short at $100,000, SL at $103,000, TP at $97,000
Bear call leg: Long at $100,000, SL at $97,000, TP at $103,000
```

This creates a net-zero directional position that profits from range-bound markets through funding rate collection (if funding is favorable on both legs, which happens in contango environments).

**Alternative**: Sell two smaller positions:
- Short 0.5 BTC at $103,000 with SL at $105,000
- Long 0.5 BTC at $97,000 with SL at $95,000
- Profit zone: $97,000 - $103,000

### 1.9 Limitations Matrix: Synthetic vs Real Options

| Factor | Real Options | Synthetic (Perps + Stops) |
|--------|-------------|--------------------------|
| Payoff shape | Convex (curved) | Piecewise linear (kinked) |
| Gap risk | Premium = guaranteed max loss | Stop can slip, loss can exceed "premium" |
| Time decay | Known theta, decreasing daily | Ongoing funding, direction-dependent |
| Gamma | Positive for longs, negative for shorts | Zero; must use scale orders or dynamic hedging |
| Vega | Benefits from vol increase (long) | No direct vega; must manually adjust |
| Liquidation | Long options cannot be liquidated | Can be liquidated before stop triggers |
| Capital efficiency | Premium paid upfront | Margin required, potentially much larger |
| Exercise | At expiry or early (American) | No concept; position is continuous |
| Combinability | Complex multi-leg, defined risk | Limited to what order types allow |

---

## 2. Delta-Neutral Strategies with Perps {#2-delta-neutral-strategies}

### 2.1 The Spot-Perp Basis Trade

The foundational delta-neutral strategy: hold long spot + short perp of equal notional value.

```
Position A:  Buy 1 BTC spot at $100,000
Position B:  Short 1 BTC perp at $100,000
Net delta:   0
Revenue:     Funding rate payments (when positive)
```

**P&L decomposition:**

```
If BTC goes to $110,000:
  Spot P&L:    +$10,000
  Perp P&L:    -$10,000
  Net price:   $0
  Funding:     +$X (accumulated funding payments)
  Total P&L:   +$X
```

### 2.2 Funding Rate Income Mathematics

```
Daily funding income = Position_size x Oracle_price x Hourly_rate x 24

Example (Hyperliquid):
  Position: 1 BTC ($100,000 notional)
  Hourly rate: 0.00125% (0.01% / 8 hours)
  Daily: $100,000 x 0.0000125 x 24 = $30/day
  Annual: $30 x 365 = $10,950/year = 10.95% APY
```

**Realistic range**: Backtested annualized returns of 12-25% with Sharpe ratios of 3-6 during favorable conditions. Bull markets average ~0.05% per 8-hour cycle (~22% annually). Bear/neutral markets can see compressed or negative rates.

### 2.3 Capital Allocation with Leverage

Without leverage, capital split is 50/50 (spot/margin):

```
$200,000 capital:
  $100,000 -> buy 1 BTC spot
  $100,000 -> margin for 1 BTC short perp (1x)
```

With 2x leverage on perp side:

```
$150,000 capital:
  $100,000 -> buy 1 BTC spot
  $50,000  -> margin for 1 BTC short perp (2x leverage)
  Remaining $50,000 as buffer
```

**Capital efficiency formula:**

```
Required_capital = Spot_notional + (Perp_notional / Leverage) + Safety_buffer

With 3x leverage and 20% buffer:
  = $100,000 + ($100,000 / 3) + $26,667
  = $160,000 for $100,000 notional exposure
```

### 2.4 Rebalancing Triggers

The hedge ratio drifts as prices move. Rebalancing criteria:

1. **Delta threshold**: Rebalance when |net delta| > 2-5% of position
2. **Price threshold**: Rebalance at 5-10% price moves
3. **Time-based**: Check and rebalance every 4-8 hours
4. **Funding event**: Rebalance after each funding payment if significant

```
Delta drift example:
  Initial: Long 1 BTC spot, Short 1 BTC perp at $100,000
  Price moves to $105,000:
    Spot value: $105,000 (delta = 1)
    Perp value: -$105,000 notional (delta = -1)
    Net delta: ~0 (perp auto-adjusts in notional terms)

  But margin utilization changes:
    Unrealized loss on perp: -$5,000
    Available margin reduced by $5,000
    May need to add margin or reduce position
```

### 2.5 Multi-Leg Delta-Neutral

```
Advanced structure:
  Long 2 BTC spot
  Short 1.5 BTC perp (high-funding asset)
  Short 0.5 BTC-equivalent altcoin perp (correlated, different funding)

  Net delta: ~0 (if correlation holds)
  Revenue: Blended funding rate across two perps
  Risk: Correlation breakdown
```

### 2.6 Cross-Exchange Delta-Neutral

```
Exchange A (CEX): Short 1 BTC perp at 0.01% funding
Exchange B (DEX/Hyperliquid): Long 1 BTC perp at -0.005% funding

Net delta: 0
Revenue: 0.01% + 0.005% = 0.015% per period (spread)
Risk: Exchange counterparty, funding normalization (different intervals)
```

---

## 3. Funding Rate Arbitrage as a Volatility Play {#3-funding-rate-arbitrage}

### 3.1 Funding Rate Mechanics (Hyperliquid)

```
Funding Rate (F) = Average_Premium_Index(P) + clamp(Interest_Rate - P, -0.0005, 0.0005)

Where:
  Premium Index = Impact_Price_Difference / Oracle_Price
  Impact_Price_Difference = max(impact_bid - oracle, 0) - max(oracle - impact_ask, 0)
  Interest Rate = 0.01% per 8 hours (fixed)
  Sampling: Every 5 seconds, averaged over 1 hour
  Payment: Hourly (1/8 of computed 8-hour rate)
  Cap: 4% per hour
  Payment = Position_Size x Oracle_Price x Funding_Rate
```

### 3.2 Funding Rate as Volatility Signal

High absolute funding rates signal directional crowding, which historically precedes volatility events:

```
Funding Rate Signal Interpretation:

  |Rate| > 0.1% per 8h (>45% APR):  Extreme directional crowding
  |Rate| > 0.05% per 8h (>22% APR): Elevated sentiment, potential unwind
  |Rate| 0.01-0.05%:                 Normal market conditions
  |Rate| < 0.01%:                    Balanced/low conviction

Historical pattern (2025 data):
  14+ consecutive days of positive funding preceded October 2025 crash
  Annualized funding of 8.8% in R1 (Policy Euphoria) preceded R2 selloff
  Annualized funding of 6.1% in R4 preceded October crash
  Normalized funding of 4.1% in R6 indicated balanced market
```

### 3.3 Funding-Implied Volatility

There is no standard formula for extracting implied volatility from funding rates, but a useful proxy:

```
Annualized_Funding = Hourly_Rate x 24 x 365
Vol_Proxy = sqrt(|Annualized_Funding| x 2)
```

This is a heuristic, not a formal derivation. The logic: funding rates compensate for the cost of holding directional exposure, which is loosely proportional to expected variance. The factor of 2 normalizes for the two-sided nature of the payment.

**IV/RV Ratio from funding:**

```
Funding_Implied_Vol = Vol_Proxy (from above)
Realized_Vol = Standard RV calculation from candle data

IV_RV_Ratio = Funding_Implied_Vol / Realized_Vol

Interpretation:
  > 1.5: Market pricing in significantly more vol than realized -> sell vol
  1.0 - 1.5: Moderate premium -> neutral
  < 1.0: Market underpricing vol -> buy vol
  < 0.5: Extreme complacency -> strong buy vol signal
```

### 3.4 Cross-Venue Funding Arbitrage

Hyperliquid provides `predictedFundings` endpoint with cross-venue comparison.

```
Strategy:
  1. Monitor funding rates across exchanges (HL, Binance, Bybit, OKX)
  2. When HL funding >> Other exchange funding:
     - Short on HL (receive high funding)
     - Long on other exchange (pay lower funding)
     - Net income = HL_rate - Other_rate (minus fees and basis risk)

  3. Normalization required:
     - HL: hourly payments (1/8 of 8-hour rate)
     - Binance: 8-hour payments
     - Must compare on annualized basis

  APY calculation:
    Net_Rate = HL_Rate_Annual - Other_Rate_Annual - (2 x Trading_Fee_Annual)
    Capital = HL_Margin + Other_Margin + Buffer
    APY = Net_Rate x Notional / Capital
```

### 3.5 Funding Rate Mean Reversion Strategy

Funding rates are autoregressive and mean-reverting:

```
Entry signal (Bollinger Band / Z-score method):
  1. Compute 7-day EMA of funding rate
  2. Compute rolling standard deviation (7-day)
  3. Z-score = (Current_Rate - EMA) / StdDev

  Entry: |Z-score| >= 2 (rate is 2 std dev from mean)
  Direction: Short the high-funding side
  Exit: Z-score approaches 0 (mean reversion complete)

Position:
  If Z > 2 (funding extremely positive):
    Short perp (receive elevated funding)
    Long spot (delta hedge)
    Expectation: funding reverts to mean, collect excess during reversion

  If Z < -2 (funding extremely negative):
    Long perp (receive elevated funding from shorts)
    Short spot/other hedge
```

---

## 4. Synthetic Gamma Exposure via Dynamic Hedging {#4-synthetic-gamma-exposure}

### 4.1 The Core Problem

Perpetual futures have delta = +1 (long) or -1 (short). Gamma = 0. To replicate options-like gamma (convexity), you must dynamically adjust position size as price moves.

### 4.2 Discrete Delta-Hedging to Create Gamma

The Black-Scholes framework shows that a continuously rebalanced delta-neutral portfolio of stock and options replicates a risk-free bond. The inverse insight: continuously rebalancing a futures position to match the delta of a target option creates synthetic gamma.

```
Target: Replicate a long straddle (long call + long put at K = $100,000)

Step 1: Compute target delta at current price
  For ATM straddle: delta_call(ATM) ≈ 0.5, delta_put(ATM) ≈ -0.5
  Net delta ≈ 0

Step 2: As price moves, delta changes
  Price rises to $105,000:
    delta_call ≈ 0.65, delta_put ≈ -0.35
    Net delta ≈ +0.30
    Action: Buy 0.30 BTC perp to replicate

  Price rises to $110,000:
    delta_call ≈ 0.78, delta_put ≈ -0.22
    Net delta ≈ +0.56
    Action: Buy additional 0.26 BTC perp

  Price falls back to $100,000:
    Net delta ≈ 0
    Action: Sell the 0.56 BTC accumulated
    Realized P&L: Bought at higher prices, sold at lower -> LOSS

This loss = the "theta" you're paying for synthetic gamma.
```

### 4.3 Gamma Scalping with Perps

The reverse of the above: if you own actual options (long gamma), you dynamically hedge with perps to "scalp" gamma.

```
Position: Long BTC straddle (from Deribit or Derive)
Hedge: BTC perps on Hyperliquid

Process:
  1. Price rises $2,000 -> delta shifts to +0.3
     Action: Short 0.3 BTC perp on HL
  2. Price falls $1,000 -> delta shifts to +0.15
     Action: Buy back 0.15 BTC perp
  3. Price falls another $2,000 -> delta shifts to -0.2
     Action: Buy 0.35 BTC perp (go long)

Each hedge cycle: Buy dips, sell rips
Profit = Realized vol > Implied vol at entry
Loss = Realized vol < Implied vol (theta decays faster than gamma gains)
```

**Rebalancing frequency trade-off:**

```
More frequent rebalancing:
  + Better gamma capture
  + Closer to continuous-time theory
  - Higher transaction costs
  - More slippage

Less frequent rebalancing:
  + Lower costs
  - More replication error (discrete hedging error)
  - Path-dependent P&L variance

Optimal: Rebalance when delta drift > threshold (typically 0.05-0.10 delta units)

Hedging error (per rebalance period):
  Error ≈ 0.5 x Gamma x (dS)^2 - Theta x dt
  Where dS = price change, dt = time elapsed
```

### 4.4 Scale Orders as Passive Gamma

Hyperliquid's scale orders create layered entries that passively build position as price moves, approximating gamma:

```
Example: Synthetic long gamma via scale orders

Center: $100,000 (current price)

Buy scale:  10 orders from $99,000 to $95,000 (0.1 BTC each)
Sell scale: 10 orders from $101,000 to $105,000 (0.1 BTC each)

As price drops to $95,000: Accumulated 1.0 BTC long
As price rises to $105,000: Accumulated 1.0 BTC short

If price oscillates: Buy low, sell high -> profit from realized vol
If price trends: Build a directional position (loss vs theta analog)
```

This is a discrete approximation of continuous gamma. The "premium" is the slippage between scale order levels and the opportunity cost of committed margin.

### 4.5 TWAP-Based Delta Hedging

For larger positions where instant rebalancing would move the market:

```
Signal: Delta drift > 0.1
Action: TWAP buy/sell over 5-15 minutes
Benefit: Reduced market impact
Cost: Delta exposure during execution window
```

---

## 5. Volatility Estimation Methods {#5-volatility-estimation}

### 5.1 Close-to-Close Realized Volatility

The standard estimator:

```
Returns: r_i = ln(C_i / C_{i-1})
Variance: sigma^2 = (1/(N-1)) x SUM(r_i^2)    [zero-mean assumption]
RV = sqrt(sigma^2) x sqrt(Periods_Per_Year)

For crypto (24/7/365):
  1-minute candles: Periods_Per_Year = 525,600
  1-hour candles:   Periods_Per_Year = 8,760
  1-day candles:    Periods_Per_Year = 365
```

**Efficiency**: Uses only closing prices. Inefficient -- ignores intrabar information.

### 5.2 Parkinson High-Low Estimator

```
PV = sqrt((1 / (4 x N x ln(2))) x SUM(ln(H_i / L_i)^2)) x sqrt(Periods_Per_Year)

Efficiency: ~5x more efficient than close-to-close
Bias: Underestimates vol in trending markets (range < actual movement)
Best for: Range-bound, liquid markets
```

### 5.3 Garman-Klass OHLC Estimator

```
GK = sqrt((1/N) x SUM(0.5 x ln(H/L)^2 - (2ln2 - 1) x ln(C/O)^2)) x sqrt(Periods_Per_Year)

Efficiency: ~8x more efficient than close-to-close
Uses: Full OHLC information
Bias: Assumes no overnight jumps (less relevant for 24/7 crypto)
```

### 5.4 Yang-Zhang Estimator

Combines overnight (close-to-open) and intraday (Garman-Klass) components:

```
YZ = sqrt(sigma_overnight^2 + k x sigma_open-to-close^2 + (1-k) x sigma_RS^2)

Where:
  sigma_overnight = close-to-open variance
  sigma_RS = Rogers-Satchell estimator
  k = 0.34 / (1.34 + (N+1)/(N-1))

Most efficient for markets with opening gaps
Less critical for crypto (24/7), but useful for assets with session-based liquidity
```

### 5.5 Realized Variance and Bipower Variation

High-frequency estimators for sub-minute data:

```
Realized Variance (RV):
  RV_t = SUM(r_{i,t}^2)   for i = 1 to N intraday returns

Bipower Variation (BPV):
  BPV_t = (pi/2) x SUM(|r_{i,t}| x |r_{i-1,t}|)

Jump component:
  J_t = max(RV_t - BPV_t, 0)

Interpretation:
  RV = total variance (continuous + jumps)
  BPV = continuous variance only
  J = jump variance
```

### 5.6 Funding-Rate Implied Volatility Proxy

```
Method 1 (Simple):
  Annualized_Funding = Hourly_Rate x 24 x 365
  Funding_IV = sqrt(|Annualized_Funding| x 2)

Method 2 (Premium-based):
  Premium = (Perp_Price - Spot_Price) / Spot_Price
  Annualized_Premium = Premium x (365 / Funding_Period_Days)
  Premium_IV = sqrt(|Annualized_Premium| x 2)

Method 3 (Historical funding distribution):
  Compute rolling 30-day standard deviation of funding rates
  Higher funding volatility -> higher expected price volatility
  FundingVol_IV = StdDev(funding_rates_30d) x Scaling_Factor

Note: These are heuristic proxies, not formal implied volatilities.
True IV requires option prices (available from Deribit, Derive, BVIV index).
```

### 5.7 External IV Sources for Crypto

```
BVIV (Volmex Bitcoin Implied Volatility Index):
  - 30-day forward-looking implied volatility
  - Derived from live BTC options prices across strikes
  - Tradeable as perpetual contracts on gTrade
  - Analogous to VIX for traditional markets

EVIV (Volmex Ethereum Implied Volatility Index):
  - Same methodology for ETH

Deribit DVOL:
  - 30-day implied volatility from Deribit options
  - Most liquid crypto options venue
  - Available via API for real-time feeds

Usage in perp strategies:
  IV from BVIV/DVOL vs RV from candle data -> IV/RV ratio
  Drives buy/sell vol decisions for synthetic positions
```

---

## 6. Mean Reversion & Momentum in Volatility Regimes {#6-volatility-regimes}

### 6.1 Volatility is Mean-Reverting

Volatility is one of the most reliably mean-reverting metrics in financial markets:

```
Properties:
  - High vol periods eventually compress
  - Low vol periods eventually expand
  - Autocorrelation of squared returns decays slowly (long memory)
  - The GARCH(1,1) model captures this well:
    sigma^2_t = omega + alpha x r^2_{t-1} + beta x sigma^2_{t-1}
```

### 6.2 Regime Classification

```
Using trailing 90-day RV distribution:

  Regime 1 (Low Vol):     RV < 25th percentile
    - Compressed positioning, breakout likely
    - Strategy: Buy vol (synthetic straddles, wide scale orders)
    - Signal: Low funding rates, declining open interest

  Regime 2 (Normal Vol):  RV in 25th-75th percentile
    - Standard conditions
    - Strategy: Carry trades (funding arbitrage)
    - Signal: Moderate funding, stable OI

  Regime 3 (High Vol):    RV in 75th-95th percentile
    - Trend or event-driven
    - Strategy: Momentum following, reduce leverage
    - Signal: Elevated funding, rising OI, liquidation cascades

  Regime 4 (Extreme Vol):  RV > 95th percentile
    - Crisis / capitulation
    - Strategy: Mean reversion bets, fade extremes
    - Signal: Extreme funding (positive or negative), massive liquidations
```

### 6.3 Hurst Exponent for Regime Detection

```
H = Hurst Exponent (rolling 100-200 bar window)

  H > 0.5: Trending (momentum regime)
    - Price moves are persistent
    - Strategy: Trend-following with perps, pyramiding
    - Avoid mean reversion entries

  H = 0.5: Random walk
    - No edge from directional prediction
    - Strategy: Carry trades, funding arbitrage

  H < 0.5: Mean-reverting
    - Price moves tend to reverse
    - Strategy: Range trading, synthetic straddles that sell wings
    - Scale orders around mean

  Critical: H itself can shift, signaling regime transitions
  When H crosses 0.5 from below -> potential trend initiation
  When H crosses 0.5 from above -> potential range-bound period
```

### 6.4 Volatility Regime Switching Strategy

```
Step 1: Classify current regime (low/normal/high/extreme)
Step 2: Select strategy bucket
Step 3: Size positions based on regime confidence

Regime -> Strategy Mapping:

  Low Vol -> High Regime:
    Entry: Buy synthetic straddle (breakout orders both sides)
    Size: Large (cheap to enter, high expected move)
    Exit: First leg triggers and produces 3x "premium"

  High Vol -> Normal Regime:
    Entry: Sell vol (collect funding on delta-neutral basis trade)
    Size: Conservative (vol could spike further)
    Exit: Funding rate normalizes or vol compresses to target

  Extreme -> Mean Reversion:
    Entry: Fade the extreme move direction
    Size: Small, scaled entries (pyramid into position)
    Exit: Price returns to pre-event moving average
```

### 6.5 Combined Momentum + Volatility Filter

```
Signal generation:
  1. Compute 20-day momentum: Mom = (Price / Price_20d_ago) - 1
  2. Compute 20-day RV
  3. Compute Hurst exponent (100 bars)

Rules:
  If H > 0.55 AND Mom > 0 AND RV < 75th percentile:
    -> Long momentum trade (long perp, trailing stop)

  If H > 0.55 AND Mom < 0 AND RV < 75th percentile:
    -> Short momentum trade (short perp, trailing stop)

  If H < 0.45 AND RV > 50th percentile:
    -> Mean reversion (scale orders around 20-day MA)

  If RV > 95th percentile (any H):
    -> Reduce all positions to 50% or flat
    -> Wait for vol compression signal before re-entering
```

---

## 7. Synthetic Covered Calls & Protective Puts {#7-synthetic-covered-calls-and-puts}

### 7.1 Covered Call Equivalent via Perps

**Traditional covered call**: Own stock + sell call at strike K.

**Synthetic via perps**: Hold spot/stake + short perp (partial or full) with take-profit.

```
Construction:
  Long 1 BTC spot (or staked ETH, yield-bearing position)
  Short 0.3 BTC perp at $100,000
  Take-profit on short: $110,000 (the "call strike")

Payoff:
  Below $100,000: Full spot exposure down, partial hedge from short perp
  $100,000 - $110,000: Spot appreciates, short perp partially offsets
  Above $110,000: Short perp TP triggers, remaining 0.7 BTC spot runs free

Revenue streams:
  1. Spot appreciation (on unhedged portion)
  2. Funding income on short perp (if funding > 0)
  3. Staking yield on spot (if applicable)
  4. Basis capture (if perp > spot at entry)

"Premium" analog: Funding income + basis capture
"Strike": Take-profit level on short perp
```

### 7.2 Protective Put Equivalent via Perps

**Traditional protective put**: Own stock + buy put at strike K.

**Synthetic**: Hold spot + short perp (partial) as hedge + stop-loss on short.

```
Construction:
  Long 1 BTC spot
  Short 0.5 BTC perp at $100,000 (hedge)
  Stop-loss on hedge: If BTC > $110,000, close short (you want upside)

Payoff:
  Below $100,000: Spot loses but perp hedge gains (50% protected)
  Above $100,000: Spot gains but perp hedge costs (50% of upside lost)
  Above $110,000: Stop triggers, full spot exposure restored

Alternative (full protection):
  Long 1 BTC spot
  Short 1 BTC perp at $100,000 (full hedge, delta = 0)
  If price drops to $90,000: Close short, keep spot (locked in at $100,000)
  Cost: Missed upside while hedged + funding payments
```

### 7.3 Collar via Perps

```
Construction (simulate collar = protective put + covered call):
  Long 1 BTC spot at $100,000
  Short 0.5 BTC perp at $100,000
  Stop-loss on short: $95,000 (close short if price drops -> accept loss)
  Take-profit on short: $108,000 (close short if price rises -> cap upside)

  Between $95,000 and $108,000: Partially hedged, collect funding
  Below $95,000: Short closes, full spot exposure (worst case)
  Above $108,000: Short closes, full spot upside restored

  This is an imperfect collar -- gaps through stop/TP levels create risk.
```

---

## 8. Hyperliquid-Specific Implementation {#8-hyperliquid-implementation}

### 8.1 Hyperliquid Infrastructure for Volatility Strategies

```
Key features:
  - Hourly funding payments (vs 8-hour on most CEXs)
    -> More granular carry capture
    -> Faster signal from funding changes
  - Funding capped at 4%/hour (extremely loose vs CEX caps)
    -> Extreme dislocations possible -> larger arb opportunities
  - Cross-margin by default
    -> Capital efficient multi-leg positions
  - Oracle: weighted median of CEX spot prices
    -> Resistant to single-exchange manipulation
  - Premium sampling: every 5 seconds, averaged over hour
    -> Smooth funding calculation, less susceptible to manipulation
  - Impact price-based premium (liquidity-aware)
    -> Different from Binance's simpler (Mark - Index) / Index
  - Up to 50x leverage
    -> Capital efficient hedging
  - TWAP orders
    -> Gradual delta hedging without market impact
  - Scale orders
    -> Passive gamma approximation
```

### 8.2 Funding Rate Formula (Detailed)

```
F = Average_Premium_Index(P) + clamp(i - P, -0.0005, 0.0005)

Premium:
  premium = impact_price_difference / oracle_price
  impact_price_difference = max(impact_bid_px - oracle_px, 0)
                           - max(oracle_px - impact_ask_px, 0)

Interest Rate: i = 0.01% per 8 hours = 0.00125% per hour = 11.6% APR

Funding Payment:
  payment = position_size x oracle_price x funding_rate

Sampling: Premium sampled every 5 seconds, averaged over the funding hour
Cap: 4% per hour (max payment)
```

### 8.3 Vault-Based Strategy Deployment

```
Hyperliquid Vaults:
  - Minimum creation: 100 USDC
  - Leader stake: >= 5% of vault value (always)
  - Leader compensation: 10% of depositor profits
  - Lock-up: 24 hours (user vaults), 4 days (HLP)
  - Withdrawal: Proportional position closing if insufficient margin

Strategy deployment:
  1. Create vault with funding arb strategy
  2. Accept deposits from community
  3. Run delta-neutral basis trade or funding arb
  4. Revenue = funding income - fees, shared proportionally
  5. Leader earns 10% performance fee

Automation via Hummingbot:
  - Connect to vault via `connect hyperliquid_perpetual`
  - Execute strategies within vault account
  - Monitor delta, rebalance automatically
```

### 8.4 HLP (Hyperliquidity Provider) Mechanics

```
HLP provides:
  - Market making across all assets
  - Liquidation backstop
  - Trading fee revenue share

HLP risk profile:
  - Short gamma (providing liquidity = selling optionality)
  - Short vol (profits in calm markets, losses in volatile)
  - Liquidation revenue (countercyclical -- profits during cascades)

For volatility traders:
  - HLP depositors are implicitly short vol
  - When market realizes higher vol than HLP's spread captures -> loss
  - When market is calm -> steady fee income

ADL (Auto-Deleveraging):
  - Last resort when regular liquidations + HLP backstop fail
  - Forced deleveraging from profitable positions
  - Risk factor for all leveraged strategies on HL
```

### 8.5 Cross-Venue Arbitrage (HL vs CEX)

```
Normalization challenges:
  1. Funding intervals:
     HL: hourly (1/8 of 8-hour rate)
     Binance: 8-hourly
     Bybit: 8-hourly
     Must annualize for comparison

  2. Premium calculation differences:
     HL: premium = impact_price_diff / oracle (liquidity-aware)
     Binance: premium = (mark - index) / index (simpler)
     -> Same funding rate number means different things

  3. Fee structures:
     HL (DEX): Maker/taker fees + gas
     Binance (CEX): Tiered maker/taker fees
     Different fee structures create implicit pricing premiums

  4. Settlement currency risk:
     HL: USDC
     Binance: USDT or USDC
     Stablecoin depeg risk affects funding payment value

  5. Execution timing:
     HL: On-chain finality (sub-second on HyperBFT)
     CEX: API latency
     Timing mismatch creates basis risk during execution
```

---

## 9. Risk Management for Synthetic Positions {#9-risk-management}

### 9.1 Gap Risk

The most critical difference from real options: stops are NOT guaranteed fills.

```
Scenario: Long 1 BTC at $100,000, SL at $97,000
  Flash crash: Price gaps from $99,000 to $94,000 in one block
  Stop triggers at $94,000 (or worse), actual loss = $6,000 vs expected $3,000

Mitigation:
  1. Use limit stops (stop-limit) for better execution
     Downside: may not fill at all in fast markets
  2. Wider stops than "strike" distance suggests
     Build slippage buffer: set stop at $96,500 for $3,000 "premium"
  3. Monitor liquidation price vs stop price
     If liquidation < stop, position can be liquidated before stop triggers
  4. Reduce leverage to increase distance between liquidation and stop
```

### 9.2 Liquidation Risk

```
Liquidation formula (HL cross-margin):
  Liquidated when: Account_Value < Maintenance_Margin x Total_Notional

  Maintenance margin varies by asset and position size
  For BTC: typically 0.5-1% of notional for standard sizes

  Example:
    Account: $10,000
    Position: 5 BTC long at $100,000 = $500,000 notional (50x)
    Maintenance margin: 0.5% = $2,500
    Liquidation when account value < $2,500
    Price drop to liquidation: ($10,000 - $2,500) / 5 = $1,500
    Liquidation price: $98,500 (only 1.5% below entry)

  With stop at $97,000 (3% below): Stop is BELOW liquidation price!
  Position gets liquidated before stop can trigger.

  Fix: Reduce leverage until liquidation price is well below stop
    At 10x: $50,000 margin for 5 BTC
    Liquidation at ~$90,000 (10% below) -> stop at $97,000 triggers first
```

### 9.3 Funding Drag

```
Funding cost as "theta":
  Daily_Theta = Position_Notional x Daily_Funding_Rate

  Example: 1 BTC long at $100,000, funding = 0.01% / 8 hours
    Hourly cost: $100,000 x 0.00125% = $1.25/hour
    Daily cost: $30
    Monthly cost: $900
    Annual cost: $10,950

  Impact on breakeven:
    For synthetic call with $3,000 "premium" (stop distance):
    After 100 days of funding: additional $3,000 cost
    Effective premium doubles: $6,000 total cost
    Breakeven shifts from $103,000 to $106,000

  Mitigation:
    1. Use funding-aware position sizing
    2. Set maximum holding period based on funding budget
    3. Close positions when funding exceeds threshold
    4. Switch direction when funding favors the other side
```

### 9.4 Correlation Risk (Multi-Leg)

```
For strategies spanning multiple assets:
  Risk: Assumed correlation breaks down

  Example: Hedging SOL with BTC perps (correlated but not identical)
    Normal: SOL and BTC move together (rho ≈ 0.7)
    Stress: SOL-specific event causes divergence
    Loss: SOL drops 20%, BTC drops 5%, hedge underperforms by 15%

  Correlation monitoring:
    - Rolling 30-day correlation between assets
    - Alert when correlation drops below 0.5 for hedged pairs
    - Reduce position or switch to same-asset hedge
```

### 9.5 Position Sizing

**Kelly Criterion:**

```
f* = (p x b - q) / b

Where:
  f* = fraction of capital to risk
  p = probability of winning
  q = 1 - p (probability of losing)
  b = win/loss ratio (average win / average loss)

Example (funding arb):
  Win rate: 85% (historically, funding stays positive)
  Average win: 0.5% per week
  Average loss: 1.5% per week (when funding flips + slippage)
  b = 0.5 / 1.5 = 0.333

  f* = (0.85 x 0.333 - 0.15) / 0.333 = (0.283 - 0.15) / 0.333 = 0.40

  Full Kelly suggests 40% of capital -> too aggressive
  Half Kelly: 20% of capital per strategy
  Quarter Kelly: 10% of capital per strategy (conservative, recommended)
```

**Risk-of-Ruin considerations:**

```
Max position sizing rules:
  1. No single synthetic position > 5% of portfolio
  2. Total directional exposure < 20% of portfolio
  3. Total delta-neutral exposure < 50% of portfolio
  4. Maximum leverage: 3-5x for directional, 2-3x for delta-neutral
  5. Per-exchange limit: 25-30% of total capital (counterparty risk)
```

### 9.6 Drawdown Limits

```
Stop-loss rules at portfolio level:
  - Daily drawdown limit: 3-5% of total portfolio
  - Weekly drawdown limit: 7-10%
  - Monthly drawdown limit: 15%
  - Action: Close ALL positions if limit breached, reassess

Recovery sizing:
  After 10% drawdown: Reduce all position sizes by 50%
  After 20% drawdown: Close all active strategies, review only
  After recovery to 95% of peak: Resume at 75% normal sizing
```

---

## 10. Mathematical Foundations {#10-mathematical-foundations}

### 10.1 Perpetual Futures Pricing Theory

From Ackerer, Hugonnier, Jermann (2024):

```
General no-arbitrage price:

  f_t = E_t^Q [ SUM_{s=t}^{inf} ( PROD_{tau=t}^{s} 1/(1+kappa_tau) ) x (kappa_s - iota_s) x x_s ]

Where:
  f_t = perpetual futures price at time t
  x_s = spot price at time s
  kappa_tau = funding premium parameter at time tau
  iota_tau = interest rate parameter at time tau
  Q = risk-neutral pricing measure

Simplified (constant parameters, zero interest differential):

  f_t / x_t = kappa x (1 + r_b) / (kappa x (1 + r_b) - delta)

Where:
  delta = r_a - r_b (interest rate differential between currencies)
  r_a, r_b = borrowing rates in each currency

When iota = 0 (no interest component):
  f_t = E_t^Q [ x_{t+theta} ]
  Where theta ~ Geometric(kappa), mean = 1/kappa

  Interpretation: The perp price equals the expected spot price at a
  random future time, geometrically distributed with mean 1/kappa.
```

### 10.2 Zero-Basis Condition

For the perpetual to perfectly track spot (f_t = x_t):

```
iota_t = (r_at - r_bt) / (1 + r_bt) < kappa_t

This means the interest component must exactly offset the cost-of-carry
differential. When this holds, the perpetual is replicable by:
  - Borrowing x_t / (1 + r_bt) units in currency a at rate r_at
  - Investing the proceeds in currency b at rate r_bt
```

### 10.3 Black-Scholes Analogy for Synthetic Options

```
Standard Black-Scholes call price:
  C = S x N(d1) - K x e^(-rT) x N(d2)

  d1 = (ln(S/K) + (r + sigma^2/2) x T) / (sigma x sqrt(T))
  d2 = d1 - sigma x sqrt(T)

Synthetic call via perp + stop:
  There is NO closed-form solution because the payoff is path-dependent
  (depends on whether price hits stop before reaching target).

  Approximation using barrier option theory:
  The synthetic call is approximately a down-and-out call:
    C_do = C_vanilla - (S/H)^(1-2r/sigma^2) x C*(H^2/S, K, r, sigma, T)

  Where H = stop-loss level (barrier)

  For perpetuals (T -> infinity):
  The probability of hitting barrier H before reaching target K:
    P(hit H first | starting at S) = 1 - ((S - H) / (K - H))  [simplified, no drift]

  With drift mu (from funding rate):
    P(hit H) = exp(-2 x mu x (S - H) / sigma^2)  [for mu > 0]
```

### 10.4 Greeks Approximation for Synthetic Positions

```
For a perp position with stop-loss at H and take-profit at K:

Delta:
  delta_perp = +1 (long) or -1 (short)
  No modification -- perps always have unit delta per unit size

Gamma:
  gamma_perp = 0 (linear instrument)
  Effective gamma from scale orders:
    gamma_eff = (Size_per_level x N_levels) / (Price_range^2)
    Approximation only; not continuous

Theta:
  theta_perp = -Notional x Funding_Rate (per unit time)
  For long positions with positive funding: theta is negative (cost)
  For short positions with positive funding: theta is positive (income)

  Annualized theta = -Notional x Annual_Funding_Rate

Vega:
  vega_perp = 0 (no direct sensitivity to volatility)
  Indirect sensitivity: Higher vol -> more frequent stop triggers -> higher effective cost
  Approximate via Monte Carlo:
    vega_proxy = d(Expected_PnL) / d(sigma)

Rho:
  rho_perp = Sensitivity to funding rate changes
  rho = d(Position_Value) / d(Funding_Rate)
  = -Notional x Time_Remaining (for funding-paying positions)
  = +Notional x Time_Remaining (for funding-receiving positions)
```

### 10.5 Power Perpetuals and Squeeth

From Paradigm (2021):

```
Power perpetual: indexed to S^p (spot price raised to power p)

Pricing (under Black-Scholes):
  Price = S^p x [1 / (2 x exp(-f x (p-1) x (2r + p x sigma^2) / 2) - 1)]

Where:
  S = spot price
  p = power parameter (p=2 for squeeth)
  f = funding period in years
  r = risk-free rate
  sigma = volatility

For squeeth (p=2):
  Price = S^2 x [1 / (2 x exp(-f x (r + sigma^2)) - 1)]

Key property: CONSTANT GAMMA regardless of price level
  gamma = 2 (for S^2 power perp)

Convergence constraint:
  exp(f x (p-1) x (2r + p x sigma^2) / 2) / 2 < 1
  Higher power and volatility -> divergence risk
  Managed by shortening funding period f

Funding mechanism:
  Longs pay shorts: MARK - INDEX = MARK - S^p
  This "premium yield" compensates shorts for providing convexity
```

### 10.6 Everlasting Options (Theoretical)

From the academic literature on perpetual derivatives:

```
Everlasting call (perpetual call that never expires):

In continuous-time Black-Scholes setting:
  EC = S^(alpha+1) / (alpha + 1)     [for alpha = 2r/sigma^2]

Properties:
  - No theta (never expires)
  - Funding rate replaces time decay
  - Greeks are functions of spot only (no time variable)
  - Delta = (alpha + 1) x S^alpha / (alpha + 1) = S^alpha
  - Gamma = alpha x S^(alpha-1)

The everlasting option price is computed as:
  "a weighted sum of the prices of options of increasing expiries"
  E_price = SUM_n (w_n x Option(S, K, T_n))
  Where w_n = weights determined by funding specification
```

### 10.7 Put-Call Parity for Perpetuals

```
Traditional: C - P = S - K x e^(-rT)

For perpetuals (no expiry): The standard put-call parity doesn't directly apply.

Modified version:
  C_perp - P_perp = f_perp - K x PV_funding

Where PV_funding = present value of funding stream
  = K / (1 + continuous_funding_rate)  [in perpetual limit]

For power perpetuals:
  Long S^2 power perp - Short S^2 power perp = 0 (trivially)
  But: Long squeeth ≈ Long 2x leveraged exposure + long convexity
  Decomposition: squeeth = 2x perp + convexity_premium
```

---

## 11. Practical Implementation Details {#11-practical-implementation}

### 11.1 Entry Signals for Volatility Strategies

```
Signal 1: IV/RV Divergence
  Compute: BVIV (or funding-implied vol) vs 30-day realized vol
  If IV/RV > 1.5: Sell vol (short straddle equivalent, collect funding)
  If IV/RV < 0.8: Buy vol (long straddle equivalent, breakout orders)
  Confidence: Higher when supported by regime classification

Signal 2: Funding Rate Z-Score
  Compute: Z = (Current_Funding - 7d_EMA) / 7d_StdDev
  If Z > 2: Funding is extreme -> expect mean reversion
    Action: Short perp (receive elevated funding) + long spot
  If Z < -2: Funding is extremely negative
    Action: Long perp (receive funding from shorts)

Signal 3: Volatility Compression (Bollinger Band Squeeze)
  Compute: Bollinger Band Width = (Upper - Lower) / Middle
  If BBW < 20th percentile of 90-day history:
    Action: Set breakout orders (synthetic straddle)
    Expectation: Compression precedes expansion

Signal 4: Liquidation Heatmap Catalyst
  Monitor: Concentrated liquidation levels near current price
  If dense long liquidation zone 5% below: Short squeeze fuel above
  If dense short liquidation zone 5% above: Long cascade risk below
  Action: Position in direction of expected cascade

Signal 5: Open Interest Divergence
  If OI rising but price flat: Building tension, vol expansion likely
  If OI falling but price moving: Capitulation, vol peak likely
  If OI rising with price: Trend confirmation, momentum regime
```

### 11.2 Exit Signals

```
Exit 1: Target P&L reached
  For synthetic calls/puts: TP at 3x "premium" (risk/reward = 3:1)
  For funding arb: Exit when annualized return < cost of capital

Exit 2: Funding regime change
  For basis trade: Exit when funding flips sign for 3+ consecutive periods
  For arb: Exit when spread between venues compresses below breakeven

Exit 3: Volatility regime shift
  If carrying long vol position and RV drops to < 25th percentile: Exit
  If carrying short vol position and RV spikes to > 90th percentile: Exit

Exit 4: Correlation breakdown (multi-leg)
  If rolling 7d correlation drops below 0.4: Close cross-asset hedges

Exit 5: Time-based exit
  Synthetic options: Maximum holding period = Funding_Budget / Daily_Funding
  After this time, the accumulated funding cost exceeds the intended "premium"
```

### 11.3 Position Sizing Algorithm

```
function calculatePositionSize(strategy, portfolio, marketData):
  # Step 1: Determine strategy risk budget
  riskBudget = portfolio.equity * RISK_PER_TRADE  # typically 1-3%

  # Step 2: Calculate per-unit risk
  if strategy.type == "synthetic_call":
    perUnitRisk = abs(strategy.entry - strategy.stop) * (1 + SLIPPAGE_BUFFER)
  elif strategy.type == "delta_neutral":
    perUnitRisk = marketData.dailyVol * strategy.notional * MAX_HOLD_DAYS * 0.1
    # 10% of potential basis drift
  elif strategy.type == "funding_arb":
    perUnitRisk = abs(marketData.worstCaseFunding * 30) * strategy.notional

  # Step 3: Kelly-adjusted sizing
  kellyFraction = computeKelly(strategy.winRate, strategy.avgWin, strategy.avgLoss)
  adjustedFraction = kellyFraction * 0.25  # quarter Kelly

  # Step 4: Final size
  sizeFromRisk = riskBudget / perUnitRisk
  sizeFromKelly = portfolio.equity * adjustedFraction / strategy.entry
  positionSize = min(sizeFromRisk, sizeFromKelly)

  # Step 5: Leverage check
  requiredMargin = positionSize * strategy.entry / strategy.leverage
  if requiredMargin > portfolio.availableMargin * 0.4:
    positionSize *= (portfolio.availableMargin * 0.4) / requiredMargin

  return positionSize
```

### 11.4 Rebalancing Frequency

```
Strategy-specific rebalancing:

Delta-neutral basis trade:
  Frequency: Every 4-8 hours or when delta drift > 2%
  Method: Market order for small rebalances, TWAP for > 1% of position
  Cost: ~0.05% round-trip fees per rebalance

Dynamic gamma hedging:
  Frequency: When delta changes by > 0.05 units
  In practice: Every 15-60 minutes during volatile periods
  Method: Limit orders with 30-second timeout, then market if not filled
  Cost: 0.02-0.10% per rebalance depending on method

Funding arb cross-venue:
  Frequency: Hourly check, rebalance when spread inverts
  Method: Simultaneous market orders on both venues
  Cost: 0.05-0.10% per rebalance (both venue fees)

Scale order passive gamma:
  Frequency: Re-layer orders daily or when > 50% filled
  Method: Cancel remaining, place new grid around current price
  Cost: Maker fees only (limit orders)

Portfolio-level:
  Daily: Check all position deltas, correlations, margin utilization
  Weekly: Review strategy allocation, regime classification
  Monthly: Backtesting update, parameter adjustment
```

### 11.5 Execution Infrastructure

```
Required components:

1. Real-time data feeds:
   - WebSocket subscriptions: L2 book, trades, candles, funding
   - REST polling: Portfolio state, open orders, historical data
   - External: BVIV/EVIV, CEX funding rates for cross-venue

2. Computation layer:
   - Rolling volatility calculations (multi-estimator)
   - Funding rate analytics (Z-score, EMA, annualization)
   - Regime classification (Hurst exponent, percentile rank)
   - Greeks approximation (portfolio-level delta, theta, vega proxy)

3. Execution layer:
   - Order management (multi-leg coordination)
   - Automatic rebalancing with threshold triggers
   - TWAP execution for large delta adjustments
   - Stop-loss management with gap risk monitoring

4. Risk monitoring:
   - Real-time P&L tracking per strategy and portfolio
   - Margin utilization alerts
   - Liquidation distance monitoring
   - Drawdown tracking with automatic cutoffs
   - Correlation matrix updates
```

---

## 12. Advanced Concepts {#12-advanced-concepts}

### 12.1 Variance Swaps via Perps

A variance swap pays the difference between realized variance and a fixed strike variance. Replication with perps is theoretically possible but practically challenging:

```
Traditional variance swap replication:
  V = (2/T) x [SUM_i (w_i x C(K_i)) + SUM_j (w_j x P(K_j)) + Dynamic_Delta_Hedge]

  Where w_i = 1/K_i^2 (inverse of strike squared)

Without options (perps only):
  Approximate via realized variance tracking + daily settlement:

  Day-by-day:
    Compute daily return r_t = ln(S_t / S_{t-1})
    Daily variance contribution = r_t^2
    Accumulated RV = SUM(r_t^2) x (365/N)

  At settlement:
    Payout = Notional x (Realized_Variance - Strike_Variance) / Strike_Variance

  Implementation via perps:
    1. Trade a basket of perp positions that replicate the log contract:
       log(S_T/S_0) = integral(dS/S) = SUM of delta-hedged perp returns
    2. The P&L from continuous delta-hedging = realized variance (Ito's lemma)
    3. By holding a perp position and continuously rebalancing:
       Cumulative P&L ≈ 0.5 x Gamma x SUM((dS)^2) = 0.5 x integral(sigma^2 dt)

  Practical limitation:
    Requires continuous hedging (impossible)
    Discrete hedging introduces variance in the variance estimate
    Transaction costs eat into the variance capture

Alternative: Use power perpetuals (squeeth)
  Squeeth (S^2) has constant gamma = 2
  Daily P&L of long squeeth ≈ 2 x S x dS + (dS)^2
  The (dS)^2 term IS the realized variance
  So: squeeth_pnl - 2 x perp_pnl = variance
  This decomposes squeeth into a leveraged position + variance exposure
```

### 12.2 Volatility Surface Construction from Perp Data

```
Without native options, construct a volatility surface proxy:

Horizontal axis (moneyness/strike proxy):
  Use order book depth at various levels from mid
  Levels: 0.5%, 1%, 2%, 5%, 10% from mid
  "Moneyness" = distance from current price

Vertical axis (term proxy):
  Use different rolling windows of realized vol
  1h, 4h, 1d, 7d, 30d, 90d
  Analogous to different option expiries

Surface construction:
  For each (moneyness_level, term):
    Measure the local volatility of order flow at that level
    Higher depth changes -> higher local vol
    Asymmetric depth -> skew

  Skew proxy (at each term):
    skew = (RV_down_moves - RV_up_moves) / Total_RV
    If skew > 0: Downside vol > upside (put skew, typical for BTC)
    If skew < 0: Upside vol > downside (call skew, altcoins in bull)

  Smile proxy:
    kurtosis = E[(r^4)] / E[(r^2)]^2
    If kurtosis > 3: Fat tails -> vol smile (both wings elevated)

  Depth-based smile:
    For each distance d from mid:
      depth_ratio = ask_depth(d) / bid_depth(d)
    Plot depth_ratio vs d -> resembles vol smile shape
```

### 12.3 Term Structure Analysis

```
Using different lookback windows for RV as term structure proxy:

Short-term (1h, 4h RV):
  Represents current instantaneous volatility
  Most reactive to recent price action

Medium-term (1d, 7d RV):
  Smoothed view of recent volatility regime
  Less noise than short-term

Long-term (30d, 90d RV):
  Baseline volatility level
  Mean to which short-term reverts

Term structure shapes:
  Normal (contango): Short RV < Long RV
    - Market is calm, no recent shocks
    - Long-term includes past volatile periods
    - Interpretation: Vol expected to stay subdued

  Inverted (backwardation): Short RV > Long RV
    - Recent shock or event
    - Short-term vol elevated above long-term baseline
    - Interpretation: Vol spike likely to mean-revert

  Humped: Medium RV > both Short and Long
    - Transitional regime
    - Recent moderate volatility normalizing

  Flat: All terms roughly equal
    - Stable regime, no major transitions
    - Could precede either direction

Funding rate term structure:
  Use predicted fundings for multiple assets
  Compare current vs predicted vs historical
  Forward-looking component (market expectations)
```

### 12.4 Cross-Asset Volatility Dispersion

```
Dispersion trading via perps:
  Concept: Trade the difference between index vol and component vol

  Implementation:
    1. Compute implied vol of basket (e.g., equal-weight BTC+ETH+SOL)
    2. Compute individual implied vols
    3. If index_vol << avg(component_vols): Long dispersion (components will diverge)
       Short index perp, long individual component perps
    4. If index_vol >> avg(component_vols): Short dispersion (components will converge)
       Long index perp, short individual component perps

  On Hyperliquid:
    Use XYZ100 index perp vs individual perps
    Or construct synthetic basket using multiple perps

  Risk: Correlation changes invalidate dispersion assumptions
```

### 12.5 Volatility-of-Volatility (Vol-of-Vol)

```
Measure: Standard deviation of rolling RV

  volOfVol = StdDev(RV_t over trailing window)

  High vol-of-vol: Unstable regime, gamma strategies valuable
  Low vol-of-vol: Stable regime, carry strategies preferred

  Implementation:
    1. Compute daily 30d RV
    2. Compute rolling 30d standard deviation of the RV series
    3. Express as percentile rank against history

  Trading application:
    If volOfVol > 80th percentile AND current RV is low:
      -> High probability of vol explosion
      -> Position for breakout (synthetic straddles)
      -> Reduce carry positions (funding arb vulnerable)
```

---

## 13. Real-World Desk Implementation {#13-real-world-implementation}

### 13.1 Crypto Trading Desk Structure

```
Typical institutional crypto volatility desk:

  Instruments: Options (Deribit, Derive) + Perps (HL, Binance) + Spot
  Strategies:
    1. Vol arb (buy options, sell realized vol via delta hedging)
    2. Funding arb (delta-neutral basis trades)
    3. Gamma scalping (long options, hedge with perps)
    4. Skew trading (buy cheap wing, sell expensive wing)
    5. Cross-venue basis capture

  Capital allocation:
    40% -> delta-neutral funding arb (low risk, steady return)
    25% -> gamma scalping (medium risk, vol-dependent return)
    20% -> directional vol bets (higher risk, regime-dependent)
    15% -> cash reserve for margin and opportunities
```

### 13.2 Professional Volatility Desk Workflow

```
From "How Quant Hedge Funds Trade Volatility":

1. Keep option book delta-neutral at all times
2. Harvest volatility as underlying whipsaws
3. By continuously delta-hedging a straddle, transform risk profile:
   "Not betting on price direction, betting on how much it moves"

Daily workflow:
  Morning: Review overnight vol, funding changes, OI shifts
  Assess: Current regime, IV/RV ratio, funding Z-scores
  Adjust: Rebalance delta-hedges, adjust scale orders
  Monitor: Real-time P&L, margin utilization, correlation drift
  Close: End-of-day risk report, overnight position limits
```

### 13.3 Lemvi Fund Case Study

```
Lemvi (crypto hedge fund focused on arbitrage and relative value):

  Strategy types:
    - Statistical arbitrage between correlated crypto pairs
    - Funding rate arbitrage across exchanges
    - Basis trading (spot vs futures)
    - Cross-exchange market-making

  Key characteristics:
    - Market-neutral (zero net exposure)
    - High Sharpe ratio targeting (>3)
    - Automated execution with human oversight
    - Multi-venue execution for best prices
```

### 13.4 Practical Performance Benchmarks

```
Strategy performance ranges (backtested, not guaranteed):

  Delta-neutral funding arb:
    Annual return: 12-25% (bull market), 5-10% (bear market)
    Sharpe ratio: 3-6
    Max drawdown: < 5% (properly hedged)
    Volatility: 8-15% annualized
    Correlation to BTC: < 0.1

  Gamma scalping (options + perp hedging):
    Annual return: 15-40% (high vol environment), -5-10% (low vol)
    Sharpe ratio: 1-3
    Max drawdown: 10-15%
    Key dependency: RV > IV at entry

  Cross-venue funding arb:
    Annual return: 8-15%
    Sharpe ratio: 2-4
    Max drawdown: 3-7%
    Key risk: Execution timing, exchange counterparty

  Volatility regime switching:
    Annual return: 20-50% (if regimes identified correctly)
    Sharpe ratio: 1-2
    Max drawdown: 15-25%
    Key dependency: Correct regime classification
```

### 13.5 Infrastructure Requirements

```
For a production volatility trading operation:

  Latency: Sub-100ms for delta hedging, sub-1s for funding monitoring
  Data: Real-time feeds from 3+ exchanges + options venues
  Compute: Rolling vol calculations on 1-minute candles (5+ assets)
  Storage: Historical funding rates, order book snapshots, trade data
  Risk: Real-time portfolio Greeks, margin tracking, drawdown monitoring

  Estimated costs:
    Exchange API access: $0 (most exchanges) to $500/mo (premium)
    Server infrastructure: $200-1,000/mo (cloud compute)
    Data feeds: $100-500/mo (aggregators like Amberdata)
    Trading fees: 0.02-0.10% per trade (volume-dependent)
```

---

## 14. DeFi Protocols & On-Chain Analogues {#14-defi-protocols}

### 14.1 Panoptic: Perpetual Options via LP Positions

```
Core innovation: Uniswap v3 concentrated liquidity positions ARE options.

LP position at tick range [L, U] = short put option
  - LP earns fees (like premium collection)
  - LP loses if price moves out of range (like being assigned)
  - LP has negative gamma (like short options)

Panoptic enables:
  - Buying options by borrowing and relocating LP liquidity
  - Selling options by deploying LP liquidity near spot
  - Multi-leg strategies (up to 4 legs in single ERC1155 token)

Streaming premium model:
  Premium = integral(theta(S_t, K, sigma) dt)
  theta = (S x sigma / sqrt(8 x pi x t)) x exp(-(ln(S/K) + sigma^2 x t/2)^2 / (2 x sigma^2 x t))

Implied volatility from Uniswap:
  IV = 2 x feeRate x sqrt(Volume / tickLiquidity)

Collateral requirements:
  Sellers: 20% of notional + max(ITM, 0) - premiumAccrued
  Buyers: 10% of notional - max(ITM, 0) + premiumAccrued
  -> Up to 5x capital efficiency vs full collateralization

Key insight: Premium converges to Black-Scholes on average
  But individual paths show ~82% coefficient of variation
  ~33% of options cost zero (price never touches strike)
  ~16% cost 2x Black-Scholes prediction
```

### 14.2 Opyn Squeeth (Power Perpetuals)

```
ETH^2 power perpetual:
  Price tracks ETH_price^2 / normalization_factor
  Provides constant gamma exposure
  No strikes, no expiries, no liquidation for buyers

Properties:
  Long squeeth = Long vol + long ETH (with convexity)
  Short squeeth = Short vol + short ETH (funding income)

  For hedging: Short 2 ETH perps + long 1 squeeth = pure long vol
  Decomposition: squeeth_return = 2 x ETH_return + ETH_return^2
  The ETH_return^2 term is the realized variance component

Funding: Longs pay shorts based on (mark - index) premium
  This premium IS the implied volatility price
  Higher IV -> higher funding -> more expensive to be long vol
```

### 14.3 Derive (Lyra v2): Full Options + Perps

```
Combined spot, perps, and options on single platform:
  - Portfolio margin (scenario-based)
  - Cross-asset collateral
  - Up to 75x capital efficiency vs v1
  - Trustless on-chain settlement

Strategies enabled:
  - Covered calls on stETH with 1.25x margin
  - Delta-hedged options books
  - Cross-instrument portfolio margining
  - Automated vault strategies

Risk engine: Trustless, permissionless backend
  Margin, clearing, liquidations for both options and perps
  All natively on-chain
```

### 14.4 Volmex: Tradeable Volatility Index

```
BVIV and EVIV indices:
  30-day implied volatility from options prices
  Tradeable as perpetual contracts on gTrade
  Up to 100x leverage on volatility

Trading applications:
  Long BVIV perp: Bet on volatility increasing
  Short BVIV perp: Bet on volatility decreasing
  BVIV vs RV: If BVIV >> 30d RV, short BVIV (vol premium is rich)

Properties:
  - Volatility is persistent (positive autocorrelation)
  - Volatility is mean-reverting (reverts to long-term average)
  - BVIV tends to be higher than realized vol (volatility risk premium)
  - This premium provides a structural edge for vol sellers
```

### 14.5 Integration Opportunities for Perp-Based Strategies

```
Cross-protocol strategies:

1. Panoptic short option + HL perp delta hedge:
   Sell options on Panoptic, hedge delta with HL perps
   Revenue: Streaming premium from Panoptic + funding from HL
   Risk: Basis between Uniswap oracle and HL oracle

2. Derive options + HL perps gamma scalp:
   Buy options on Derive (long gamma)
   Delta-hedge with HL perps (deep liquidity)
   Revenue: Realized vol > implied vol

3. Squeeth + HL perp vol decomposition:
   Long squeeth (constant gamma)
   Short 2x ETH perp on HL (remove directional exposure)
   Net: Pure variance exposure
   Revenue: Realized variance > implied variance (squeeth funding)

4. BVIV perp + RV tracking:
   Short BVIV when BVIV >> recent RV (sell vol premium)
   Long BVIV when BVIV << recent RV (buy cheap vol)
   Hedge: Delta-neutral perp positions to isolate pure vol bet
```

---

## References & Sources

### Academic Papers
- [Perpetual Futures Pricing - Ackerer, Hugonnier, Jermann (2024)](https://finance.wharton.upenn.edu/~jermann/AHJ-main-10.pdf)
- [Fundamentals of Perpetual Futures - He, Manela (2022)](https://arxiv.org/html/2212.06888v5)
- [A Primer on Perpetuals - Angeris et al.](https://angeris.github.io/papers/perps.pdf)
- [Panoptic: Perpetual Oracle-Free Options Protocol](https://arxiv.org/html/2204.14232v3)
- [Power Perpetuals - Paradigm (2021)](https://www.paradigm.xyz/2021/08/power-perpetuals)
- [Robust Replication of Volatility Derivatives - Carr, Lee](https://math.uchicago.edu/~rl/rrvd.pdf)
- [Variance Swaps - Goldman Sachs (1999)](https://emanuelderman.com/wp-content/uploads/1999/02/gs-volatility_swaps.pdf)
- [Delta Hedging Bitcoin Options with a Smile](https://www.tandfonline.com/doi/full/10.1080/14697688.2023.2181205)
- [Pricing Cryptocurrency Options with Volatility of Volatility (2025)](https://onlinelibrary.wiley.com/doi/10.1002/fut.70029)
- [Implied Volatility Estimation of Bitcoin Options](https://pmc.ncbi.nlm.nih.gov/articles/PMC8418903/)

### Exchange Documentation
- [Hyperliquid Funding Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding)
- [Hyperliquid Margining Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining)
- [Hyperliquid Liquidation Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/liquidations)
- [Hyperliquid Protocol Vaults](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/vaults/protocol-vaults)

### Strategy Guides & Analysis
- [Perpetual Futures Arbitrage Mechanics - BSIC Bocconi](https://bsic.it/perpetual-complexity-an-introduction-to-perpetual-future-arbitrage-mechanics-part-1/)
- [Delta-Neutral Strategy with Crypto Perpetuals - Flipster](https://flipster.io/blog/how-to-build-a-delta-neutral-strategy-using-crypto-perps-and-spot)
- [Funding Rate Arbitrage Complete Guide 2025](https://coincryptorank.com/blog/funding-rate-arbitrage)
- [Gamma Scalping in Crypto Markets - MenthorQ](https://menthorq.com/guide/gamma-scalping-in-crypto-markets/)
- [The Volatility Framework: Crypto Stress Signals - Amberdata](https://blog.amberdata.io/the-volatility-framework-how-to-read-cryptos-stress-signals)
- [Funding Rate Arbitrage on Hyperliquid - Hummingbot](https://hummingbot.org/blog/funding-rate-arbitrage-and-creating-vaults-on-hyperliquid/)
- [Crypto Carry - BIS Working Papers](https://www.bis.org/publ/work1087.pdf)

### DeFi Protocols
- [Panoptic - LP = Options](https://panoptic.xyz/blog/uniswap-lp-equals-options)
- [Derive (Lyra v2)](https://www.derive.xyz/)
- [Volmex Volatility Indices](https://volmex.finance/)
- [DeFi Options Trading 2025 - Yellow Research](https://yellow.com/research/defi-options-trading-in-2025-how-lyra-dopex-and-panoptic-are-reshaping-derivatives)
- [Block Scholes x Panoptic: Perpetual Options](https://www.blockscholes.com/research/block-scholes-x-panoptic-perpetual-option)

### Market Data & Tools
- [Volmex BVIV Charts](https://charts.volmex.finance/symbol/BVIV)
- [Hyperliquid Funding Comparison](https://app.hyperliquid.xyz/fundingComparison)
- [FundingView - Cross-Exchange Rates](https://fundingview.app)
- [Glassnode Gamma Exposure](https://insights.glassnode.com/gamma-exposure/)
- [Binance Volatility Index](https://www.binance.com/en/futures/funding-history/perpetual/volatility-index)
