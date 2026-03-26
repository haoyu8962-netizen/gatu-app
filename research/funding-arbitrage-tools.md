# Funding Rate Arbitrage Tools & Monitors: Comprehensive Research

> **Date:** 2026-03-23
> **Scope:** Hyperliquid funding mechanics, cross-DEX arbitrage, existing tools, and HypeTerminal integration plan

---

## Table of Contents

1. [Funding Rate Basics & Mechanics](#1-funding-rate-basics--mechanics)
2. [Best Practices for Funding Rate Arbitrage](#2-best-practices-for-funding-rate-arbitrage)
3. [APR Calculation Methods](#3-apr-calculation-methods)
4. [Cross-Exchange Opportunities](#4-cross-exchange-opportunities)
5. [Existing Tools & Monitors](#5-existing-tools--monitors)
6. [Delta-Neutral Setups](#6-delta-neutral-setups)
7. [HypeTerminal Feature Ideas](#7-hypeterminal-feature-ideas)
8. [UI Ideas](#8-ui-ideas)
9. [Hyperliquid Integration](#9-hyperliquid-integration)
10. [Risk Factors](#10-risk-factors)

---

## 1. Funding Rate Basics & Mechanics

### 1.1 What Are Funding Rates?

Funding rates are periodic payments between long and short holders of perpetual futures contracts. They serve as the mechanism that keeps perpetual contract prices anchored to the underlying spot price. When perp price > spot price, longs pay shorts (positive funding). When perp price < spot price, shorts pay longs (negative funding).

### 1.2 Hyperliquid-Specific Mechanics

#### Payment Interval
- **Funding is paid every 1 hour** on Hyperliquid
- This is significantly more frequent than CEXs (Binance/Bybit/OKX use 8-hour intervals)
- 24 funding payments per day vs 3 on most CEXs
- The system computes an **8-hour rate** but distributes it across hourly intervals at **1/8 of the computed rate per hour**

#### Core Formula

```
F = Average Premium Index (P) + clamp(interest_rate - P, -0.0005, 0.0005)
```

Where:
- `F` is the funding rate (expressed as an 8-hour rate, paid at 1/8 per hour)
- `P` is the Average Premium Index
- Interest rate is fixed at **0.01% per 8 hours** (0.00125% per hour, ~11.6% APR)
- The clamp constrains the interest rate adjustment to +/- 0.05%

#### Premium Calculation

The premium is **sampled every 5 seconds** and averaged over the hour:

```
premium = impact_price_difference / oracle_price

impact_price_difference = max(impact_bid_px - oracle_px, 0) - max(oracle_px - impact_ask_px, 0)
```

This captures the deviation between the perpetual contract's impact price and the oracle (spot) price.

#### Funding Payment Formula

```
funding_payment = position_size * oracle_price * funding_rate
```

Key detail: The **oracle price** (not mark price) is used to convert position size to notional value for payment calculations.

#### Funding Rate Cap

- **Capped at 4% per hour** across all assets
- This cap does not depend on the asset
- At 4%/hour, the annualized rate would be a staggering 35,040% (theoretical max)

#### Peer-to-Peer Settlement

- Funding is purely **peer-to-peer** -- no protocol fees are extracted from funding payments
- Longs pay shorts when funding is positive, shorts pay longs when negative
- Zero-sum between long and short holders

### 1.3 Hyperps (Pre-Listing Perpetuals)

Hyperps are a unique Hyperliquid innovation -- perpetual contracts that **don't require an underlying spot oracle** to exist.

#### Key Differences from Standard Perps

| Feature | Standard Perps | Hyperps |
|---------|---------------|---------|
| Oracle | External spot oracle | 8-hour EMA of mark prices |
| Premium weight | 100% of clamped formula | **1% of clamped formula** |
| Price samples | External oracle | 1,440 minutely mark prices (24h) |
| Mark price cap | N/A | 3x the 8-hour EMA |
| Conversion | N/A | Auto-converts to standard perp when asset lists on major CEX |

#### Hyperps Oracle Calculation
- Uses an **8-hour exponentially weighted moving average** of the last day's minutely mark prices
- Samples taken on the first block after each Unix minute
- 1,440 historical samples (one per minute over 24 hours)
- When fewer than 480 samples exist, the initial mark price pads the remaining slots

#### Hyperps Price Safeguards
- Mark price capped at 3x the 8-hour EMA
- For externally listed hyperps: 1.5x the median external perp price
- Oracle price restricted to 4x the one-month average mark price

### 1.4 Comparison: Hyperliquid vs CEX Funding

| Exchange | Interval | Payments/Day | Rate Volatility | Max Observed BTC Rate |
|----------|----------|-------------|-----------------|----------------------|
| **Hyperliquid** | 1 hour | 24 | Highest | 0.067% |
| Binance | 8 hours | 3 | Lowest | ~0.02% |
| Bybit | 8 hours | 3 | Low-Medium | ~0.025% |
| OKX | 8 hours | 3 | Low-Medium | ~0.025% |
| dYdX | 1 hour | 24 | High | ~0.05% |
| BitMEX | 8 hours | 3 | Most Stable | ~0.015% |

Hyperliquid's **1-hour calculation window** makes it hyper-responsive to basis changes, creating larger rate swings and more arbitrage opportunities.

---

## 2. Best Practices for Funding Rate Arbitrage

### 2.1 Core Strategy: Delta-Neutral Positioning

The fundamental approach: simultaneously hold offsetting positions that cancel out directional exposure while capturing funding rate payments.

**Basic setup:**
1. Buy spot (or go long on low-funding-rate exchange)
2. Short perp on high-funding-rate exchange
3. Collect the differential between the two positions

### 2.2 Position Sizing

- **Capital allocation:** Use 2-5x leverage on the perpetual side to maximize capital efficiency while maintaining safe margin levels
- **Example with $100k capital:**
  - Buy $100k BTC spot
  - Short $100k BTC perp with 2x leverage (requiring $50k margin)
  - Remaining $50k acts as buffer for volatility
- **1:1 hedge ratio is critical:** Monitor delta exposure daily and rebalance when positions drift beyond 2-5% tolerance

### 2.3 Entry Timing

- **Enter when funding rates are elevated and persistent** -- not during one-off spikes
- Look for funding rates that have been consistently positive for 24-72+ hours
- Avoid entering during extreme market volatility when rates may reverse rapidly
- Best entry: after a sustained move (e.g., BTC up 15% in a week) when funding is consistently high
- Monitor the **predicted funding rate** (available via Hyperliquid API) before the next settlement

### 2.4 Exit Timing

- Exit when funding rates compress toward zero or turn negative
- Exit if basis spread diverges beyond 2-3% (indicating potential funding reversal)
- Close positions if annualized yield drops below a threshold (e.g., 5% APR) after fees
- Use rolling 7-day average funding to avoid exiting on temporary dips

### 2.5 Risk Management Rules

1. **Never exceed 3-5x leverage** on the perp leg
2. **Maintain minimum margin ratio** of 2x the maintenance margin requirement
3. **Set automated alerts** for funding rate reversals
4. **Diversify across 3-5 assets** to reduce single-asset risk
5. **Account for fees** in all profitability calculations (trading fees can easily exceed funding income on low-spread trades)
6. **Monitor basis spread** -- if spot-perp price diverges significantly, the position may need rebalancing
7. **Keep reserves** for margin calls (20-30% of capital as buffer)

### 2.6 When NOT to Arbitrage

- Funding rate differentials < trading fees (round trip)
- During extreme volatility events (flash crashes, liquidation cascades)
- When open interest is low (harder to enter/exit without slippage)
- When the predicted funding is trending toward reversal

---

## 3. APR Calculation Methods

### 3.1 Simple Annualization

The most common method -- multiply the per-interval rate by the number of intervals per year:

**For Hyperliquid (1-hour intervals):**
```
APR = hourly_rate * 24 * 365 = hourly_rate * 8,760
```

**For 8-hour exchanges (Binance, Bybit):**
```
APR = 8h_rate * 3 * 365 = 8h_rate * 1,095
```

**Example:** Hyperliquid hourly rate of 0.005%:
```
APR = 0.00005 * 8,760 = 0.438 = 43.8%
```

### 3.2 Compounding APY

If you reinvest funding payments:

```
APY = (1 + rate_per_interval)^(intervals_per_year) - 1
```

**Hyperliquid example (0.005% hourly):**
```
APY = (1 + 0.00005)^8760 - 1 = 0.5477 = 54.77%
```

**Important note:** In practice, funding payments **do not automatically compound** -- they are added to margin but don't automatically increase position size. Compounding requires manual position resizing.

### 3.3 Fee-Adjusted APR

The critical calculation that most beginners miss:

```
Net APR = Gross Funding APR - (Entry Fee APR + Exit Fee APR)
```

**Hyperliquid fee structure (VIP 0):**
- Taker: 0.045% per side
- Maker: 0.015% per side
- Round-trip taker cost: 0.09% (both legs)
- Round-trip maker cost: 0.03% (both legs)

**For a spot-perp arb (both legs on Hyperliquid):**
```
Entry cost = spot_taker (0.07%) + perp_maker (0.015%) = 0.085%
Exit cost = spot_taker (0.07%) + perp_maker (0.015%) = 0.085%
Total round-trip = 0.17%
```

**Break-even calculation:**
If holding for 30 days with 0.005% hourly funding:
```
Gross funding = 0.005% * 24 * 30 = 3.6%
Net = 3.6% - 0.17% = 3.43%
Annualized net = 3.43% * (365/30) = 41.7%
```

**Minimum hold time to break even:**
```
min_hours = total_fees / hourly_funding_rate
= 0.0017 / 0.00005
= 34 hours (1.4 days)
```

### 3.4 Rolling Window APR

More realistic than point-in-time snapshots:

```typescript
// Calculate 7-day rolling average APR
function rolling7dAPR(fundingHistory: { rate: string; time: number }[]): string {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentFundings = fundingHistory.filter(f => f.time >= sevenDaysAgo);
  const totalRate = recentFundings.reduce((sum, f) => sum + parseFloat(f.rate), 0);
  const avgHourlyRate = totalRate / recentFundings.length;
  return Big(avgHourlyRate).times(8760).times(100).toFixed(2); // Annualized %
}
```

### 3.5 Cross-Exchange Normalized APR

When comparing rates across exchanges with different intervals:

```typescript
function normalizeToAnnual(rate: string, intervalHours: number): string {
  const intervalsPerYear = 8760 / intervalHours;
  return Big(rate).times(intervalsPerYear).times(100).toFixed(2);
}

// Hyperliquid: 0.005% hourly -> 43.8% APR
normalizeToAnnual("0.00005", 1);

// Binance: 0.01% per 8h -> 10.95% APR
normalizeToAnnual("0.0001", 8);
```

---

## 4. Cross-Exchange Opportunities

### 4.1 Primary Arbitrage Pairs

#### Hyperliquid vs Binance
- **Opportunity:** Hyperliquid's 1-hour settlements create more volatile rates vs Binance's 8-hour
- **Edge:** When Hyperliquid funding is significantly higher, short perp on HL + long perp on Binance (or long spot)
- **Challenges:** Different settlement times, need to normalize rates for comparison

#### Hyperliquid vs dYdX
- **Opportunity:** Both use 1-hour funding, creating more direct comparison
- **Edge:** Structural differences in OI and user base create persistent differentials
- **Advantage:** Same funding interval simplifies comparison and timing

#### Hyperliquid vs Bybit/OKX
- **Opportunity:** 1h vs 8h interval mismatch creates frequent temporary dislocations
- **Edge:** Hyperliquid rates often overshoot during momentum, mean-reverting over 8h windows

#### Cross-DEX (Hyperliquid vs GMX/Drift/Synthetix)
- **Opportunity:** DEX-to-DEX arbitrage has less competition than CEX arbitrage
- **Edge:** On-chain execution is transparent; different oracle mechanisms create structural rate differences
- **Challenges:** Cross-chain bridging adds latency and cost

### 4.2 Basis Trading (Cash-and-Carry)

The classic institutional strategy adapted for crypto:

```
Basis = Perp Price - Spot Price
Annualized Basis = (Basis / Spot Price) * (365 / days_to_funding) * 100
```

**On Hyperliquid specifically:**
- Buy spot on HyperEVM (or via spot markets on Hyperliquid)
- Short equal notional in perps
- Collect hourly funding while remaining delta-neutral
- Advantage: same-platform execution eliminates cross-exchange counterparty risk

### 4.3 Rate Differential Thresholds

Based on analysis of 2025 data, profitable cross-exchange arbitrage typically requires:

| Holding Period | Minimum Rate Differential (APR) | Rationale |
|---------------|--------------------------------|-----------|
| < 1 day | > 50% APR | Must overcome round-trip fees quickly |
| 1-7 days | > 20% APR | Moderate hold allows fee amortization |
| 7-30 days | > 10% APR | Longer hold, lower minimum threshold |
| 30+ days | > 5% APR | Long-term carry, minimal fee impact |

### 4.4 Structural Advantages of Hyperliquid for Arb

1. **No gas fees** for trading on HyperCore (gasless L1)
2. **Low maker fees** (0.015% base tier, 0% at VIP 6)
3. **Same-platform spot + perp** reduces execution complexity
4. **Sub-second block times** for faster position entry/exit
5. **On-chain transparency** -- all positions visible, no hidden liquidity
6. **Vault infrastructure** for managing arb strategies programmatically

---

## 5. Existing Tools & Monitors

### 5.1 CoinGlass

**URL:** https://www.coinglass.com/FundingRate

**Features:**
- Real-time funding rate comparison across Binance, OKX, Bybit, Bitget, dYdX, BitMEX, Bitfinex, Gate.io, and Hyperliquid
- Funding Rate Heatmap (https://www.coinglass.com/FundingRateHeatMap) -- visual grid of rates by asset x exchange
- Funding Rate Arbitrage scanner (https://www.coinglass.com/ArbitrageList) -- identifies top cross-exchange spreads
- Historical funding rate charts per asset per exchange
- API access for programmatic data retrieval
- BTC-specific dashboard (https://www.coinglass.com/FundingRate/BTC)

**Limitations:** Focused on data display, no execution capability. API requires paid subscription for full access.

### 5.2 Loris Tools

**URL:** https://loris.tools

**Features:**
- Real-time funding rates across **25+ exchanges** (CEX and DEX), updated every minute
- Automatic cross-exchange arbitrage spread calculation
- **Backtester** (https://loris.tools/backtester) -- simulate token-exchange pair performance over historical periods
- Historical funding rate charts and heatmaps (https://loris.tools/funding/historical)
- Markets overview with price, volume, OI, and funding (https://loris.tools/markets)
- **Funding Rate API** (https://loris.tools/api-docs) for developers
- Embeddable widgets for external sites
- Free, no account required

**Supported exchanges include:** Binance, Bybit, OKX, Hyperliquid, Drift, BingX, Bitget, KuCoin, Gate.io, MEXC, Phemex, Crypto.com, HTX, Vest, Lighter, Bluefin, Paradex, Aster, EdgeX, Ethereal, Hibachi, Pacifica, Variational, WOOFi Pro

**Strengths:** Best DEX coverage. Normalization across different funding intervals (1h, 4h, 8h). Free access.

### 5.3 Hyperliquid Native

**URL:** https://app.hyperliquid.xyz/fundingComparison

- Native funding rate comparison page on Hyperliquid
- Shows current and historical funding rates for all listed perps
- Comparison with major CEX rates
- Integrated with the trading interface

### 5.4 Coinalyze

**URL:** https://coinalyze.net/hyperliquid/funding-rate/

- Aggregated funding rate charts with customizable timeframes
- Predicted funding rate display
- Multi-exchange comparison views
- Free tier available with basic charts

### 5.5 Blockworks Research

**URL:** https://blockworks.com/analytics/hyperliquid/hyperliquid-perps/hyperliquid-annualized-funding-rates

- Annualized funding rate dashboard for Hyperliquid perps
- Part of broader Hyperliquid analytics suite
- Institutional-grade data presentation

### 5.6 ASXN / stats.hyperliquid.xyz

**URL:** https://stats.hyperliquid.xyz/

- Community-maintained Hyperliquid analytics dashboard
- Sources data from ASXN's node, Hyperliquid API, Dune, CoinGecko, and Hypurrscan
- Updated daily
- Includes funding rate alongside volume, OI, and user metrics

### 5.7 Thunderhead Labs / hyperliquid-stats

**URL:** https://github.com/thunderhead-labs/hyperliquid-stats

- Open-source API for Hyperliquid data and metrics
- Funding rate chart endpoint
- Liquidity data by coin
- Developer-focused with API access

### 5.8 ArbitrageScanner

**URL:** https://arbitragescanner.io/funding-rates

- Cross-exchange funding rate comparison
- Supports perpetual swaps across major exchanges
- Real-time rate monitoring

### 5.9 CoinAnk

**URL:** https://coinank.com/fundingRate/current

- Perpetual swap funding rate analysis
- Current and historical data
- Multi-exchange comparison

### 5.10 PerpDashboard

**URL:** https://perpdashboard.com/tools/funding-rate-calculator/

- Funding rate calculator tool
- Helps calculate perpetual futures funding costs
- Visual cost estimation

### 5.11 Pandabull

**URL:** https://pandabull.io

- Per-asset funding rate statistics on Hyperliquid
- Detailed historical rate charts
- Good for individual asset analysis

---

## 6. Delta-Neutral Setups

### 6.1 Strategy A: Same-Exchange Spot-Perp (Hyperliquid Native)

The simplest and lowest-risk approach:

```
Long Spot (Hyperliquid) + Short Perp (Hyperliquid)
```

**Advantages:**
- No cross-exchange risk or bridging delays
- Same margin system, easy to manage
- Hyperliquid has both spot and perp markets
- Gasless execution on HyperCore

**Execution flow:**
1. Deposit USDC to Hyperliquid
2. Allocate funds: ~50% to spot account, ~50% to perp account
3. Buy spot asset (e.g., ETH)
4. Open short perp of equal notional value
5. Collect funding every hour (when positive)
6. Rebalance when delta drifts > 2%

**Fee impact (VIP 0):**
- Spot buy: 0.07% taker (or 0.04% maker)
- Perp short: 0.045% taker (or 0.015% maker)
- Round-trip total: 0.23% taker / 0.11% maker

### 6.2 Strategy B: Cross-Exchange Funding Rate Arb

```
Short Perp (Hyperliquid, high funding) + Long Perp (Binance, low funding)
```

**Advantages:**
- Can be more capital efficient (leverage on both sides)
- Larger rate differentials possible
- No spot exposure needed

**Disadvantages:**
- Counterparty risk on both exchanges
- Capital locked on two platforms
- Different settlement times require careful normalization
- Cross-exchange margin calls are harder to manage

**Execution flow:**
1. Monitor normalized funding rates across exchanges
2. When Hyperliquid rate > Binance rate by > 20% APR (after fees)
3. Short on Hyperliquid, long on Binance (equal notional)
4. Monitor both positions for margin health
5. Close when spread compresses below threshold

### 6.3 Strategy C: Perpetual-Perpetual Same Exchange

For assets with both standard perps and hyperps on Hyperliquid:

```
Short Standard Perp (high funding) + Long Hyperp (low funding)
```

Since hyperps use 1% of the clamped funding formula, their rates tend to be much lower, creating a natural spread.

### 6.4 Strategy D: HyperEVM DeFi + Perp Hedge

```
Provide liquidity in HyperEVM DeFi protocol + Short Perp hedge
```

- Earn LP fees + potentially token incentives on HyperEVM
- Hedge impermanent loss with perp short
- Collect funding if perp funding is positive

### 6.5 Existing Automated Tools

#### HL-Delta (Open Source)
**URL:** https://github.com/cgaspart/HL-Delta

- Automated delta-neutral position management on Hyperliquid
- Identifies best funding rates for optimal yield
- Monitors and rebalances positions automatically
- RESTful API for remote control
- Configurable yield threshold (default: 5% APR minimum)
- Auto-closes positions when yield drops and opens better ones

#### Liminal
**URL:** https://liminal.money

- DeFi protocol for automated delta-neutral strategies on Hyperliquid
- Deposit USDC, select custom portfolio mix (e.g., 30% HYPE, 30% ETH, 30% BTC, 10% USDe)
- Automated rebalancing and risk management
- 10% performance fee, no management fee
- Double-digit APY historically
- Audited by Quantstamp, Halborn, Offside Labs

#### Neutral Trade
**URL:** https://neutral.trade

- Market-neutral strategy vaults
- Hyperliquid Funding Arb vault earns up to 21% APY on USDC
- Fully automated delta-neutral trading
- Exploits inter-exchange funding rate gaps
- Audited by Quantstamp, Halborn, Offside Labs

#### Hummingbot
**URL:** https://hummingbot.org

- Open-source market making and arbitrage bot
- Funding Rate Arbitrage V2 strategy
- Direct integration with Hyperliquid perpetual connector
- Supports Hyperliquid vault mode (trade as vault leader)
- Configurable parameters for rate thresholds, position sizing, etc.

#### 50shadesofgwei/funding-rate-arbitrage
**URL:** https://github.com/50shadesofgwei/funding-rate-arbitrage

- DEX-DEX focused funding rate arbitrage searcher
- Backtesting framework for strategy validation
- Trade tracking with database logging
- PnL and accrued funding tracking per trade
- Currently targets GMX + Synthetix v3

#### ARBOT
**URL:** https://github.com/IrakliXYZ/ARBOT

- Spot-futures funding rate arbitrage bot
- Market-neutral position management
- Claims 15-30% annual returns
- Open source

---

## 7. HypeTerminal Feature Ideas

### 7.1 Real-Time Funding Rate Scanner

**Core feature:** A cross-exchange funding rate scanner that identifies arbitrage opportunities in real time.

```
Data Sources:
- Hyperliquid: predictedFundings API + fundingHistory API + assetCtxs subscription
- External: CoinGlass API, Loris Tools API, or direct exchange APIs
```

**Scanner table columns:**
| Asset | HL Rate | HL APR | Binance Rate | Binance APR | Spread APR | Net APR (after fees) | OI (HL) | Signal |
|-------|---------|--------|-------------|-------------|------------|---------------------|---------|--------|

**Implementation using existing hooks:**
```typescript
// Already in codebase
import { useInfoPredictedFundings } from "@/lib/hyperliquid/hooks/info/useInfoPredictedFundings";
import { useInfoFundingHistory } from "@/lib/hyperliquid/hooks/info/useInfoFundingHistory";
import { useSubAssetCtxs } from "@/lib/hyperliquid/hooks/subscription/useSubAssetCtxs";

// New: fetch external exchange rates
// Could use CoinGlass API or Loris Tools API
```

### 7.2 Opportunity Alerts

**Configurable alert system:**
- Threshold-based: "Alert me when any asset has > 30% APR spread between HL and Binance"
- Asset-specific: "Alert me when BTC funding on HL exceeds 0.01%/hour"
- Reversal alerts: "Alert me when funding for my open position approaches zero"
- Duration-based: "Alert me when funding stays above X for Y hours"

**Implementation options:**
- Browser notifications (Notification API)
- Sound alerts
- Zustand store for alert state management
- Optional webhook/Telegram integration

### 7.3 Position Manager

Track open arbitrage positions with real-time P&L:

**Position data model:**
```typescript
interface ArbPosition {
  id: string;
  asset: string;
  strategy: "spot-perp" | "cross-exchange" | "perp-perp";

  // Leg 1
  leg1Exchange: string;
  leg1Side: "long" | "short";
  leg1Size: string;
  leg1EntryPrice: string;
  leg1CurrentPrice: string;

  // Leg 2
  leg2Exchange: string;
  leg2Side: "long" | "short";
  leg2Size: string;
  leg2EntryPrice: string;
  leg2CurrentPrice: string;

  // Funding collected
  totalFundingCollected: string;
  fundingCollectedToday: string;

  // P&L
  unrealizedPnl: string;       // from price movement
  realizedFundingPnl: string;  // from funding payments
  totalFees: string;
  netPnl: string;

  // Risk
  deltaExposure: string;       // should be ~0
  marginRatio: string;
  liquidationDistance: string;

  // Metadata
  openedAt: number;
  lastRebalancedAt: number;
  currentAPR: string;
}
```

### 7.4 Historical Funding Rate Analytics

**Charts and visualizations:**
- Per-asset funding rate time series (using `fundingHistory` API)
- Average funding rate heatmap across all assets (similar to CoinGlass heatmap)
- Funding rate distribution histogram (what % of time is rate > X%)
- Rolling 7-day, 30-day, 90-day average APR per asset
- Cross-exchange funding rate correlation charts

**Unique to HypeTerminal:**
- Overlay funding rate with price action (already have chart infrastructure via trading-view)
- Show funding rate alongside open interest changes
- Funding rate vs volume correlation

### 7.5 APR Calculator with Fee Estimation

**Interactive calculator widget:**

```
Inputs:
- Asset (dropdown with all HL perps)
- Position size (USDC notional)
- Strategy type (spot-perp / cross-exchange)
- Expected holding period (days)
- Leverage (for margin estimation)
- Fee tier (auto-detected from connected wallet, or manual)
- Current funding rate (auto-filled from API)
- Use rolling average (7d/30d toggle)

Outputs:
- Gross funding income (hourly / daily / projected total)
- Total trading fees (entry + exit)
- Net profit after fees
- Annualized APR / APY
- Break-even holding period
- Required margin
- Estimated liquidation price
```

### 7.6 One-Click Delta-Neutral Execution

**Same-exchange spot-perp setup:**

```
Flow:
1. User selects asset and notional size
2. System calculates optimal split (spot allocation vs perp margin)
3. Preview shows: entry fees, expected APR, liquidation prices, required margin
4. User confirms
5. System executes simultaneously:
   a. Buy spot (via spot order API)
   b. Open short perp (via order API)
6. Position tracked in Position Manager
```

**Using existing SDK methods:**
```typescript
// Place spot buy + perp short in one action
await exchangeClient.order({
  orders: [
    // Short perp
    {
      a: assetIndex,
      b: false, // sell/short
      p: aggressivePrice,
      s: perpSize,
      r: false,
      t: { limit: { tif: "Ioc" } },
    },
  ],
  grouping: "na",
});

// Spot buy would use the spot market
// Need to handle usdClassTransfer to move funds between perp and spot accounts
```

### 7.7 Risk Monitoring Dashboard

**Real-time risk metrics per position:**

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Delta | Net directional exposure | > 2% of notional |
| Margin Ratio | Current margin / maintenance | < 2x maintenance |
| Liquidation Distance | % price move to liq | < 15% |
| Funding Rate Trend | Direction of rate change | Approaching zero |
| Basis Spread | Spot-perp price differential | > 3% divergence |
| Correlation Break | Spot-perp price correlation | < 0.95 |
| Rebalance Needed | Delta drift requiring adjustment | When delta > threshold |

**Implementation:**
```typescript
// Already available via clearinghouseState subscription
// Provides: positions, margin, liquidation prices, cumulative funding
import { useSubClearinghouseState } from "@/lib/hyperliquid/hooks/subscription";
```

### 7.8 P&L Tracking Per Arb Position

**Track breakdown of returns:**
- Funding P&L (main revenue source)
- Price P&L (should be ~0 for delta-neutral)
- Fee costs (entry, exit, rebalancing)
- Net P&L over time
- Cumulative funding history chart
- Comparison vs simple holding

**Data source:** `useSubUserFundings` subscription (already implemented in codebase) provides real-time funding payment events per asset.

---

## 8. UI Ideas

### 8.1 Dashboard Layout

```
+------------------------------------------------------------------+
|  FUNDING RATE SCANNER                              [Settings] [?] |
+------------------------------------------------------------------+
|                                                                    |
|  +------------------------+  +----------------------------------+ |
|  | TOP OPPORTUNITIES      |  | FUNDING RATE HEATMAP             | |
|  |                        |  |                                  | |
|  | 1. HYPE  +48% APR  [] |  |  [Grid: Assets x Exchanges]     | |
|  | 2. SOL   +32% APR  [] |  |  Color: Green=positive           | |
|  | 3. ETH   +28% APR  [] |  |        Red=negative              | |
|  | 4. BTC   +22% APR  [] |  |        Intensity=magnitude       | |
|  | 5. DOGE  +18% APR  [] |  |                                  | |
|  +------------------------+  +----------------------------------+ |
|                                                                    |
|  +--------------------------------------------------------------+ |
|  | FULL SCANNER TABLE                      [Filter] [Sort] [APR]| |
|  |                                                              | |
|  | Asset  | HL Rate | HL APR | Bin Rate | Spread | Net APR | OI | |
|  | BTC    | 0.005%  | 43.8%  | 0.002%   | +26.3% | +24.1%  | $2B| |
|  | ETH    | 0.004%  | 35.0%  | 0.001%   | +26.3% | +24.1%  | $1B| |
|  | ...    | ...     | ...    | ...      | ...    | ...     | ...| |
|  +--------------------------------------------------------------+ |
|                                                                    |
+------------------------------------------------------------------+
```

### 8.2 Position Manager Layout

```
+------------------------------------------------------------------+
|  ACTIVE POSITIONS                              [+ New Position]   |
+------------------------------------------------------------------+
|                                                                    |
|  +--------------------------------------------------------------+ |
|  | ETH Spot-Perp | Opened 3d ago | Net P&L: +$342.50           | |
|  |------------------------------------------------------------ | |
|  | Spot Long  | 5.2 ETH @ $3,450 | $17,940                     | |
|  | Perp Short | 5.2 ETH @ $3,455 | $17,966                     | |
|  |                                                              | |
|  | Funding: +$380.20  | Fees: -$37.70  | Delta: 0.02%          | |
|  | APR: 24.3%         | Margin: 45%    | Liq: -42%             | |
|  |                                                              | |
|  | [Rebalance] [Close Position] [Add Margin]                    | |
|  +--------------------------------------------------------------+ |
|                                                                    |
|  +--------------------------------------------------------------+ |
|  | CUMULATIVE FUNDING CHART                                     | |
|  |                                                              | |
|  |  $400 |                                          ____/       | |
|  |  $300 |                               _____/---/            | |
|  |  $200 |                    _____/----/                       | |
|  |  $100 |         _____/---/                                   | |
|  |    $0 |___/----/                                             | |
|  |       +--+--+--+--+--+--+--+--+--+--+--+--+--+            | |
|  |       Day 1     Day 2     Day 3                             | |
|  +--------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

### 8.3 APR Calculator Layout

```
+------------------------------------------------------------------+
|  FUNDING RATE CALCULATOR                                          |
+------------------------------------------------------------------+
|                                                                    |
|  Asset: [ETH ▼]     Strategy: [Spot-Perp ▼]                      |
|  Size:  [$10,000]    Leverage: [3x ▼]                             |
|  Hold:  [30 days]    Fee Tier: [VIP 0 - Auto]                    |
|                                                                    |
|  Current Rate: 0.0045%/hr    7d Avg: 0.0038%/hr                  |
|  Predicted:    0.0051%/hr    30d Avg: 0.0042%/hr                  |
|                                                                    |
|  +----------------------------+  +------------------------------+ |
|  | PROJECTED RETURNS          |  | RISK METRICS                 | |
|  |                            |  |                              | |
|  | Gross Funding:   $315.36   |  | Required Margin:  $3,333    | |
|  | Trading Fees:    -$17.00   |  | Liq Distance:     -33.3%   | |
|  | Net Profit:      $298.36   |  | Break-even:       1.6 days | |
|  | Net APR:         35.8%     |  | Max Drawdown:     ~2-3%    | |
|  | Net APY:         43.0%     |  |                              | |
|  +----------------------------+  +------------------------------+ |
|                                                                    |
|  [Execute Position]                                               |
+------------------------------------------------------------------+
```

### 8.4 Data Visualization Ideas

1. **Funding Rate Sparklines** -- tiny inline charts next to each asset in the scanner table showing 24h funding trend
2. **Rate Distribution Bell Curve** -- histogram showing what percentage of time an asset's funding rate falls within different buckets
3. **Cross-Exchange Spread Chart** -- line chart overlaying HL rate vs Binance rate with shaded area showing the spread
4. **Funding Revenue Waterfall** -- stacked bar chart showing daily funding income per position, with fee deductions
5. **Opportunity Score Badge** -- composite metric (rate magnitude + persistence + liquidity + low fees) shown as a colored badge per asset
6. **Heatmap Calendar** -- daily average funding rate heatmap (like GitHub contribution graph) to show seasonal patterns

### 8.5 Alert System UI

```
+-------------------------------------------+
|  ALERT: HYPE Funding Spike      [X]      |
|                                           |
|  Rate: 0.025%/hr (219% APR)              |
|  Duration: 4 hours at elevated level      |
|  Current OI: $450M                        |
|                                           |
|  [View Details] [Open Position] [Dismiss] |
+-------------------------------------------+
```

### 8.6 Mobile Considerations

- Condensed scanner table with horizontal scroll
- Swipeable position cards
- Critical alerts as push notifications
- Simplified calculator with fewer inputs
- Quick-action buttons for position management
- Funding rate ticker at the top of the screen

---

## 9. Hyperliquid Integration

### 9.1 Available API Endpoints

#### Info Endpoints (Read-only, no wallet needed)

| Endpoint | Purpose | SDK Method | Existing Hook |
|----------|---------|------------|---------------|
| `predictedFundings` | Get predicted next funding rates for all assets | `info.predictedFundings()` | `useInfoPredictedFundings` |
| `fundingHistory` | Historical funding rates per asset | `info.fundingHistory({coin, startTime, endTime?})` | `useInfoFundingHistory` |
| `metaAndAssetCtxs` | Current funding rate + OI + prices for all assets | `info.metaAndAssetCtxs()` | `useInfoMetaAndAssetCtxs` |
| `clearinghouseState` | User positions, margin, cumulative funding | `info.clearinghouseState({user})` | Yes (existing) |
| `userFunding` | User's funding payment history | `info.userFunding({user, startTime, endTime?})` | N/A (need to add) |

#### Subscription Endpoints (WebSocket, real-time)

| Subscription | Purpose | SDK Method | Existing Hook |
|-------------|---------|------------|---------------|
| `assetCtxs` | Stream funding rate + OI changes | `subscription.assetCtxs(...)` | `useSubAssetCtxs` |
| `userFundings` | Stream user funding payments | `subscription.userFundings({user})` | `useSubUserFundings` |
| `clearinghouseState` | Stream position + margin updates | `subscription.clearinghouseState({user})` | Yes (existing) |

#### Exchange Endpoints (Requires wallet)

| Endpoint | Purpose | SDK Method |
|----------|---------|------------|
| `order` | Place spot/perp orders | `exchange.order({orders, grouping, builder?})` |
| `cancel` | Cancel orders | `exchange.cancel({cancels})` |
| `usdClassTransfer` | Move funds between perp and spot | `exchange.usdClassTransfer({amount, toPerp})` |
| `updateLeverage` | Set leverage for perp | `exchange.updateLeverage({asset, isCross, leverage})` |

### 9.2 Key Response Structures

#### predictedFundings Response

```typescript
// Response: Array of [coin, Array<[venue, FundingData | null]>]
type PredictedFundingsResponse = Array<[
  string,  // coin symbol, e.g., "BTC"
  Array<[
    string,  // venue identifier
    {
      fundingRate: string;           // e.g., "0.00005"
      nextFundingTime: number;       // ms since epoch
      fundingIntervalHours?: number; // e.g., 1
    } | null
  ]>
]>;
```

#### fundingHistory Response

```typescript
// Response: Array of historical funding records
type FundingHistoryResponse = Array<{
  coin: string;         // "BTC"
  fundingRate: string;  // "0.00005123"
  premium: string;      // "0.00003456"
  time: number;         // ms since epoch
}>;
```

#### metaAndAssetCtxs -- Asset Context (per asset)

```typescript
// Each asset context includes:
{
  dayNtlVlm: string;    // Daily notional volume
  funding: string;       // Current funding rate
  impactPxs: string[];   // Impact prices [bid, ask]
  markPx: string;        // Mark price
  midPx: string;         // Mid price
  openInterest: string;  // Open interest
  oraclePx: string;      // Oracle price
  premium: string;       // Current premium
  prevDayPx: string;     // Previous day price
}
```

#### clearinghouseState -- Position Data

```typescript
// Each position in assetPositions:
{
  position: {
    coin: string;
    szi: string;              // Signed size (negative = short)
    entryPx: string;
    leverage: { type: string; value: number };
    liquidationPx: string;
    marginUsed: string;
    maxLeverage: number;
    unrealizedPnl: string;
    returnOnEquity: string;
    cumFunding: {
      allTime: string;        // Total funding collected/paid
      sinceChange: string;    // Since last position change
      sinceOpen: string;      // Since position opened
    };
  }
}
```

### 9.3 Implementation Architecture

```
src/
  features/
    funding-arb/
      components/
        funding-scanner.tsx           # Main scanner table
        funding-heatmap.tsx           # Cross-exchange heatmap
        funding-calculator.tsx        # APR calculator widget
        funding-chart.tsx             # Historical rate chart
        position-manager.tsx          # Active arb positions
        position-card.tsx             # Individual position display
        opportunity-alerts.tsx        # Alert configuration & display
        risk-monitor.tsx              # Risk metrics dashboard
      lib/
        funding-math.ts              # APR calculations, normalization
        cross-exchange.ts            # External rate fetching/normalization
        position-tracker.ts          # Arb position state management
        alert-engine.ts              # Alert threshold checking
      stores/
        funding-arb-store.ts         # Zustand store for arb state
        alert-store.ts               # Alert configuration persistence
      hooks/
        use-funding-scanner.ts       # Combined funding data hook
        use-arb-position.ts          # Position management hook
        use-funding-alerts.ts        # Alert system hook
```

### 9.4 New Hooks Needed

```typescript
// Hook: Fetch user's funding payment history (not yet in codebase)
function useInfoUserFunding(params: {
  user: string;
  startTime: number;
  endTime?: number;
}) {
  const { info } = useHyperliquid();
  return useQuery({
    queryKey: infoKeys.method("userFunding", params),
    queryFn: ({ signal }) => info.userFunding(params, signal),
  });
}

// Hook: Combined funding scanner data
function useFundingScanner() {
  const predictedFundings = useInfoPredictedFundings();
  const metaAndCtxs = useInfoMetaAndAssetCtxs({});

  // Combine predicted rates with current asset context
  // Add external exchange rates (CoinGlass/Loris API)
  // Calculate spreads and net APRs
}
```

### 9.5 Execution Flow for One-Click Delta-Neutral

```typescript
async function openDeltaNeutralPosition(params: {
  coin: string;
  notionalUsd: string;
  leverage: number;
}) {
  const { coin, notionalUsd, leverage } = params;

  // 1. Transfer USDC from perp to spot if needed
  const spotAllocation = Big(notionalUsd).div(2);
  await exchangeClient.usdClassTransfer({
    amount: spotAllocation.toFixed(2),
    toPerp: false,
    signatureChainId: "0xa4b1",
    hyperliquidChain: "Mainnet",
    nonce: Date.now(),
  });

  // 2. Set leverage on perp side
  await exchangeClient.updateLeverage({
    asset: assetIndex,
    isCross: true,
    leverage,
  });

  // 3. Calculate sizes
  const spotPrice = await getSpotPrice(coin);
  const spotSize = Big(spotAllocation).div(spotPrice);
  const perpSize = spotSize; // Equal size for delta-neutral

  // 4. Execute both legs (as close to simultaneously as possible)
  // Perp short
  await exchangeClient.order({
    orders: [{
      a: perpAssetIndex,
      b: false,
      p: aggressiveShortPrice,
      s: perpSize.toFixed(szDecimals),
      r: false,
      t: { limit: { tif: "Ioc" } },
    }],
    grouping: "na",
  });

  // Spot buy
  await exchangeClient.order({
    orders: [{
      a: spotAssetIndex,
      b: true,
      p: aggressiveBuyPrice,
      s: spotSize.toFixed(szDecimals),
      r: false,
      t: { limit: { tif: "Ioc" } },
    }],
    grouping: "na",
  });

  // 5. Track in position manager
  await saveArbPosition({ coin, spotSize, perpSize, entryPrices: { spot, perp } });
}
```

---

## 10. Risk Factors

### 10.1 Funding Rate Volatility

- Funding rates can **reverse direction** within a single hour on Hyperliquid
- A position earning +0.005%/hr can flip to paying -0.01%/hr during sentiment shifts
- **Mitigation:** Use rolling averages for entry decisions, set stop-loss on funding rate direction

### 10.2 Liquidation Risk

- Even "delta-neutral" positions can be liquidated if one leg moves against you faster than funding income accumulates
- **Especially dangerous:** Leverage above 5x, low liquidity assets, flash crashes
- On Hyperliquid: Funding is capped at 4%/hr but price moves are not capped
- **Mitigation:** Keep leverage at 2-3x, maintain 2x maintenance margin buffer, set automated deleveraging alerts

### 10.3 Execution Risk

- **Leg risk:** One leg fills but the other doesn't (partial execution)
- **Slippage:** Large orders on low-liquidity assets may get worse fills
- **Timing:** Between entering the two legs, price may move
- **Mitigation:** Use IOC orders for both legs, start with high-liquidity assets (BTC, ETH), keep position sizes reasonable relative to order book depth

### 10.4 Smart Contract Risk (DEX-Specific)

- Hyperliquid runs on HyperCore (its own L1), not EVM smart contracts for core trading
- However, HyperEVM spot contracts carry standard smart contract risks
- Cross-chain bridging to/from Hyperliquid introduces bridge risk
- **Mitigation:** Stay within Hyperliquid ecosystem when possible, minimize bridge usage

### 10.5 Oracle Manipulation

- Funding is based on oracle prices -- if oracles are manipulated, funding payments could be distorted
- Hyperliquid uses its own oracle system derived from spot prices
- Hyperps use EMA-based internal oracles, which are harder to manipulate but can lag
- **Mitigation:** Avoid highly illiquid assets where oracles are easier to manipulate

### 10.6 Counterparty Risk

- **CEX risk:** Centralized exchanges can freeze withdrawals, halt trading, or become insolvent
- **DEX risk:** Smart contract bugs, governance attacks, oracle failures
- **Hyperliquid-specific:** As a newer chain, there's inherent platform risk despite strong track record
- **Mitigation:** Diversify across venues, don't allocate more than 25% of capital to any single platform

### 10.7 Fee Erosion

- Trading fees eat into funding income, especially for short holding periods
- Rebalancing costs add up over time
- Spot trading fees on Hyperliquid (0.07% taker) are higher than perp fees (0.045% taker)
- **Mitigation:** Use maker orders when possible, target high-spread opportunities, minimize rebalancing frequency

### 10.8 Negative Funding Regime

- During bear markets, funding tends to go negative (shorts pay longs)
- A spot-perp strategy designed for positive funding will hemorrhage money
- Rate regime can persist for weeks or months
- **Mitigation:** Close positions when 7-day rolling average approaches zero, consider flipping to long-perp/short-spot in negative regimes (higher risk)

### 10.9 Capital Efficiency

- Delta-neutral strategies require capital on both sides (spot + perp, or exchange A + exchange B)
- Effective leverage on capital is lower than raw numbers suggest
- Opportunity cost vs other yield sources (lending, staking, LP)
- **Mitigation:** Compare risk-adjusted returns (Sharpe ratio) against alternatives; typical arb Sharpe ratios of 3-6 are favorable

### 10.10 Regulatory Risk

- Perpetual futures face increasing regulatory scrutiny globally
- DEX trading may face new compliance requirements
- Cross-jurisdiction arbitrage adds legal complexity
- **Mitigation:** Stay informed on regulatory developments, maintain compliance posture

---

## Appendix A: Quick Reference -- Hyperliquid Funding Rate Facts

| Parameter | Value |
|-----------|-------|
| Funding interval | 1 hour |
| Payments per day | 24 |
| Rate formula basis | 8-hour rate, paid at 1/8 per hour |
| Interest rate component | 0.01% per 8 hours (0.00125%/hr, 11.6% APR) |
| Max funding rate | 4% per hour |
| Premium sampling | Every 5 seconds, averaged over 1 hour |
| Payment basis | position_size * oracle_price * rate |
| Protocol fee on funding | None (pure P2P) |
| Perp taker fee (VIP 0) | 0.045% |
| Perp maker fee (VIP 0) | 0.015% |
| Spot taker fee (VIP 0) | 0.070% |
| Spot maker fee (VIP 0) | 0.040% |
| Perp maker fee (VIP 6) | 0.000% |
| Fee volume basis | Rolling 14-day weighted volume |
| Builder fee max (perps) | 0.1% (10 bps) |

## Appendix B: Key URLs

| Resource | URL |
|----------|-----|
| Hyperliquid Funding Docs | https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding |
| Hyperliquid Funding Comparison | https://app.hyperliquid.xyz/fundingComparison |
| Hyperliquid Fee Docs | https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees |
| Hyperliquid Hyperps Docs | https://hyperliquid.gitbook.io/hyperliquid-docs/trading/hyperps |
| Hyperliquid API Perpetuals | https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals |
| CoinGlass Funding Rates | https://www.coinglass.com/FundingRate |
| CoinGlass Arbitrage List | https://www.coinglass.com/ArbitrageList |
| CoinGlass Heatmap | https://www.coinglass.com/FundingRateHeatMap |
| Loris Tools Scanner | https://loris.tools |
| Loris Backtester | https://loris.tools/backtester |
| Loris API Docs | https://loris.tools/api-docs |
| Coinalyze HL Funding | https://coinalyze.net/hyperliquid/funding-rate/ |
| Blockworks HL Annualized | https://blockworks.com/analytics/hyperliquid/hyperliquid-perps/hyperliquid-annualized-funding-rates |
| ASXN HL Dashboard | https://stats.hyperliquid.xyz/ |
| ArbitrageScanner | https://arbitragescanner.io/funding-rates |
| CoinAnk Rates | https://coinank.com/fundingRate/current |
| PerpDashboard Calculator | https://perpdashboard.com/tools/funding-rate-calculator/ |
| Liminal (DN Vaults) | https://liminal.money |
| Neutral Trade (Arb Vaults) | https://neutral.trade |
| HL-Delta (Open Source Bot) | https://github.com/cgaspart/HL-Delta |
| Hummingbot FR Arb | https://hummingbot.org/blog/funding-rate-arbitrage-and-creating-vaults-on-hyperliquid/ |
| 50shadesofgwei Arb Bot | https://github.com/50shadesofgwei/funding-rate-arbitrage |
| ARBOT | https://github.com/IrakliXYZ/ARBOT |
| @nktkas/hyperliquid SDK | https://nktkas.gitbook.io/hyperliquid |

## Appendix C: Existing Codebase Hooks (Already Implemented)

| Hook | File | Purpose |
|------|------|---------|
| `useInfoPredictedFundings` | `src/lib/hyperliquid/hooks/info/useInfoPredictedFundings.ts` | Fetch predicted next funding rates |
| `useInfoFundingHistory` | `src/lib/hyperliquid/hooks/info/useInfoFundingHistory.ts` | Fetch historical funding rates per coin |
| `useInfoMetaAndAssetCtxs` | `src/lib/hyperliquid/hooks/info/useInfoMetaAndAssetCtxs.ts` | Fetch all asset metadata + current funding/OI |
| `useSubUserFundings` | `src/lib/hyperliquid/hooks/subscription/useSubUserFundings.ts` | Stream user funding payments (real-time) |
| `useSubAssetCtxs` | `src/lib/hyperliquid/hooks/subscription/useSubAssetCtxs.ts` | Stream asset context updates (funding, OI) |
| `FundingTab` | `src/components/trade/positions/funding-tab.tsx` | Existing UI for user funding payment history |

## Appendix D: Competitive Analysis Summary

| Tool | Scanner | Historical | Backtester | Execution | Position Mgmt | Alerts | API |
|------|---------|-----------|-----------|-----------|---------------|--------|-----|
| CoinGlass | Yes | Yes | No | No | No | No | Yes (paid) |
| Loris Tools | Yes (25+ exchanges) | Yes | Yes | No | No | No | Yes |
| Coinalyze | Yes | Yes | No | No | No | No | No |
| HL-Delta | Partial | No | No | Yes (auto) | Yes (auto) | No | REST |
| Hummingbot | No | No | No | Yes | Basic | No | No |
| Liminal | No | No | No | Yes (vault) | Yes (vault) | No | No |
| Neutral Trade | No | No | No | Yes (vault) | Yes (vault) | No | No |
| **HypeTerminal (proposed)** | **Yes** | **Yes** | **Planned** | **Yes** | **Yes** | **Yes** | **N/A (UI)** |

**HypeTerminal's differentiation:** No existing tool combines scanning + historical analytics + one-click execution + position management + alerts in a single integrated UI. Most tools are either data-only (CoinGlass, Loris) or execution-only (HL-Delta, Hummingbot). HypeTerminal can be the first all-in-one funding rate arbitrage workstation.
