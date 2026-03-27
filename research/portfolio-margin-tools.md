# Portfolio Margin on Hyperliquid: Research & Product Opportunities

## Table of Contents

1. [Portfolio Margin Mechanics](#1-portfolio-margin-mechanics)
2. [Isolated vs Cross vs Portfolio Margin](#2-isolated-vs-cross-vs-portfolio-margin)
3. [Hyperliquid's Implementation](#3-hyperliquids-implementation)
4. [Manual Tasks Traders Do Today](#4-manual-tasks-traders-do-today)
5. [Benefits for Traders](#5-benefits-for-traders)
6. [Risks & Failure Modes](#6-risks--failure-modes)
7. [Product Vision: Portfolio Margin Dashboard & Auto-Risk Manager](#7-product-vision-portfolio-margin-dashboard--auto-risk-manager)

---

## 1. Portfolio Margin Mechanics

Portfolio margin is a risk-based margining methodology that calculates margin requirements based on the **net risk of an entire portfolio** rather than summing individual position requirements. It evaluates how positions interact, recognizing hedges, offsets, and correlations between assets.

### Risk Calculation Models

| Model | Origin | Approach | Status |
|-------|--------|----------|--------|
| **SPAN** | CME, 1988 | Grid simulation across 16 scenarios of price/volatility moves; treats correlations as static | Legacy, being phased out |
| **SPAN 2** | CME, 2022+ | Historical VaR + Stress VaR + liquidity/concentration charges | Replacing SPAN at CME |
| **VaR** | Industry standard | Statistical estimation of portfolio loss at a confidence level over a time horizon | Modern standard for crypto |
| **TIMS** | OCC, 1986 | Black-Scholes theoretical values under multiple market scenarios | Used by OCC |

The industry transition from SPAN to VaR accelerated in 2023. Most crypto exchanges with portfolio margin now use VaR-based models.

### How Offsets Work

- **Same-asset offset**: Long BTC spot + short BTC perp = net exposure near zero, margin drops dramatically
- **Correlated-asset offset**: Long ETH + short BTC -- if historically correlated, partial offset recognized
- **Options offsets**: Long calls + short underlying = covered call, much lower margin than naked positions separately
- **Basis trade offset**: Long spot + short futures = basis position, margin reflects only basis risk, not directional risk

Offset amounts are determined by stress testing: the portfolio is valued under multiple scenarios and margin = worst-case loss.

### Traditional Finance Benchmarks (FINRA/OCC)

- High-cap broad-based indexes stressed: -8% to +6%
- Non-high-cap broad-based indexes: -10% to +10%
- Sector indexes and individual equities: -15% to +15%
- Minimum equity requirement: $100K-$500K depending on broker
- Maximum margin reduction capped at 80% in some jurisdictions
- Typical margin reduction: 30-78% depending on portfolio composition

---

## 2. Isolated vs Cross vs Portfolio Margin

| Feature | Isolated Margin | Cross Margin | Portfolio Margin |
|---------|----------------|--------------|-----------------|
| **Collateral scope** | Per-position | Shared within account | Shared + cross-asset offsets |
| **Hedge recognition** | None | None | Full (same-asset + correlated) |
| **Liquidation blast radius** | Single position | Entire account | Entire account (multi-asset) |
| **Capital efficiency** | Lowest | Medium | Highest (30-78% improvement) |
| **Leverage capacity** | Base | ~2x improvement | ~3.35x improvement |
| **Complexity** | Simple | Moderate | Complex |
| **Ideal user** | Beginners, risk-isolated bets | Active traders | Institutions, sophisticated traders |
| **Cross-asset offsets** | No | No | Yes |
| **Auto yield on collateral** | No | No | Yes (on Hyperliquid) |

**Key insight**: Cross margin shares collateral across positions but does NOT recognize hedging relationships. A trader long BTC spot and short BTC perp still pays full margin on both legs under cross margin. Portfolio margin recognizes this as a near-zero-risk basis position and margins it accordingly.

---

## 3. Hyperliquid's Implementation

### Timeline

| Date | Milestone |
|------|-----------|
| Dec 13, 2025 | Portfolio margin announced alongside BLP Earn vaults |
| Dec 15, 2025 | Pre-alpha deployed on testnet |
| Dec 2025 | Pre-alpha on mainnet -- gated to accounts with >$5M all-time volume |
| Mar 10, 2026 | Alpha phase announced (next network upgrade) |
| 2026 | Full launch expected |

### Pre-Alpha Constraints

- HYPE-only collateral
- USDC-only borrowable asset
- $1K USDC per-user borrow cap
- $1M USDC global borrow cap
- 200 HYPE global supply cap

### Alpha Phase (March 2026)

| Asset | LTV | User Supply Cap | User Borrow Cap | Global Supply Cap | Global Borrow Cap |
|-------|-----|-----------------|-----------------|-------------------|-------------------|
| USDC | -- | 5M | 1M | 500M | 100M |
| USDH | -- | 5M | 1M | 500M | 100M |
| HYPE | 0.5 | 50K tokens | N/A | 1M tokens | N/A |
| BTC | TBD | 20 BTC | N/A | 400 BTC | N/A |

Access: Master accounts with >$5M weighted trading volume. Sub-accounts margined separately.

### Core Design

- Unifies spot and perpetual trading within a single account
- Spot and perp P&L offset each other, protecting against liquidation
- Margin requirements set for net risk of entire portfolio
- Accounts automatically earn yield on idle borrowable assets
- Borrowing is automatic: insufficient balances trigger loans when placing orders

### Interest Rate Model

```
APY = 0.05 + 4.75 * max(0, utilization - 0.80)
```

| Utilization | APY |
|-------------|-----|
| 0-80% | 5% |
| 90% | 7.375% |
| 95% | 8.5625% |
| 100% | 29.75% |

The steep curve above 80% discourages full utilization and protects lenders. Protocol retains 10% of interest as a liquidation buffer.

### Liquidation Framework

**Trigger**: `portfolio_margin_ratio > 0.95`

```
portfolio_margin_ratio = max across borrowable tokens of:
    portfolio_maintenance_requirement / portfolio_liquidation_value
```

Maintenance requirement includes:
- Minimum borrow offset: 20 USDC
- Cross-margin requirements per DEX
- Borrowed size * oracle price

Liquidation value includes:
- Portfolio balance + borrowing capacity
- Liquidation threshold: `0.5 + 0.5 * LTV(token)`

Oracle price: median of (spot USDC price, perp mark price, perp oracle price) -- triple-oracle median mitigates manipulation.

### Design Philosophy (Jeff Yan)

> "Best margining design is simple, canonical, explainable, and works in a wide variety of pathological scenarios"

Key properties:
- Profitable manipulation requires moving mark price ~20%, making attacks infeasible
- Any liquidated position is either (a) a loss relative to entry price, or (b) at least an 18.3% loss relative to last margin transfer out (at 20x leverage)
- Mathematical solvency guarantees -- no centralized behavioral detection
- ADL (Auto-Deleveraging) as last-resort backstop; has only fired once in 2+ years
- During that event: 100% uptime, zero bad debt

---

## 4. Manual Tasks Traders Do Today

Without portfolio margin, traders on Hyperliquid (and other venues) resort to extensive manual work:

### 4.1 Spreadsheet-Based Hedging Calculations

- Manually track positions across multiple pairs/products in spreadsheets
- Calculate net exposure by hand ("long 2 BTC spot, short 1.5 BTC perp, net long 0.5 BTC")
- No real-time updates -- snapshots become stale during volatile markets
- Error-prone: missed positions, wrong prices, formula errors
- No integrated P&L tracking across hedged positions
- Hours spent reconciling across tabs and exchange UIs

### 4.2 Manual Exposure Tracking

- Track delta exposure across spot, perps, and options separately
- Manually sum USD-denominated exposure per asset
- No automated alerts when exposure drifts from targets
- Maintain a mental model of total risk during fast-moving markets
- Multiple browser tabs open across different exchange products

### 4.3 Over-Collateralization (Double-Collateralization Problem)

- Long BTC spot + short BTC perp requires full margin on **both** legs
- Capital locked up that represents near-zero directional risk
- Basis trade might require 2x the capital needed for actual basis risk
- Estimated 30-78% excess capital locked vs what portfolio margin would require
- Opportunity cost: locked capital cannot earn yield or be deployed in other strategies

### 4.4 Manual Delta Hedging

- Options traders manually calculate portfolio delta across all positions
- Place hedge orders by hand when delta drifts beyond tolerance
- Slow reaction time during fast-moving markets
- **70-80% of retail delta-neutral positions experience forced liquidations during flash crashes** (per derivatives risk managers)
- Hedging incurs fees and slippage, especially during high volatility or thin liquidity
- No automated threshold-based rebalancing

### 4.5 Fragmented Risk Views

- Risk metrics scattered across different exchange interfaces
- No unified view of total portfolio risk across spot + perps
- Cannot easily assess correlation risk between positions
- Stress testing done ad-hoc in spreadsheets, or not at all
- Liquidation prices calculated per-position, not portfolio-wide
- No visibility into how one position's liquidation cascades to others

### 4.6 Manual Collateral Management

- Moving collateral between isolated positions to avoid liquidation
- Monitoring margin ratios across multiple positions independently
- No automated optimization of which asset to use as collateral
- No visibility into interest rate optimization across collateral types

---

## 5. Benefits for Traders

### Capital Efficiency

| Metric | Improvement |
|--------|-------------|
| Typical margin reduction | 30% |
| Best-case margin reduction (well-hedged) | Up to 78% |
| Leverage capacity increase | ~3.35x |
| Reg T to portfolio margin comparison (equities) | ~5x |

### Reduced Margin Requirements

- Hedged positions recognized as lower risk = lower margin
- Basis trades require margin only on the basis risk
- Delta-neutral portfolios margined on actual net Greeks, not gross notional
- Cash-futures arbitrage positions receive significant margin offsets

### Better Hedging Incentives

- Margin system rewards reducing risk -- hedging costs less in margin than it saves
- Unified account makes it easier to see and manage net exposure
- Enables strategies that are capital-prohibitive under isolated/cross margin:
  - Long-short hedging across correlated assets
  - Cash-futures arbitrage
  - Options combinations and spreads
  - Statistical arbitrage
  - Relative value strategies
  - Cross-asset pairs trading

### Market Quality Improvements

- Deeper order books from freed-up capital
- Tighter bid-ask spreads
- Increased trading volume (one exchange saw volume double after implementing portfolio margin)
- More market makers willing to participate with lower capital requirements

### Integrated Yield

- Idle collateral automatically earns interest on Hyperliquid
- Lending/borrowing integrated into margin system
- No need to manually move funds between trading and yield products
- Rates determined by utilization curves

---

## 6. Risks & Failure Modes

### 6.1 Liquidation Cascades

Unified account liquidations trigger **simultaneous selling of multiple positions across markets**:
- Multi-asset automated selling creates "algorithm-driven liquidation spirals"
- Single liquidation event depresses prices across multiple related markets
- During crypto market stress, order books thin rapidly, widening bid-ask spreads
- Record-level leverage across asset classes increases systemic fragility
- In Oct 2025 and Feb 2026 crashes, cascading liquidations amplified market moves significantly

### 6.2 Correlation Breakdown

- Historical correlations used for offsets can break exactly when they matter most
- Crypto-to-crypto correlations tend toward 1.0 during severe stress (everything sells together)
- Cross-asset hedges (ETH hedged with BTC) can fail catastrophically if correlation drops
- "During widespread market declines, less correlated assets fall in tandem, hedging strategies may instantly fail"

### 6.3 Model Risk

- VaR models rely on historical data that may not represent future tail events
- Interest rate model assumptions may break during extreme utilization
- Static LTV ratios may not reflect real-time asset volatility
- Oracle manipulation risk (mitigated by Hyperliquid's triple-oracle median)

### 6.4 Complexity Risk

- More complex system = harder for traders to understand true risk
- Margin requirements change dynamically as correlations and volatilities shift
- Difficult to predict exact liquidation prices for complex portfolios
- New users may take on excessive risk without understanding portfolio-level implications

### 6.5 Systemic/Contagion Risk

- Portfolio margin integration with HyperEVM lending protocols means "a collapse could spread beyond the trading layer, potentially causing a broader liquidity crunch"
- DeFi has no lender of last resort (unlike TradFi with central banks)
- Insurance fund may be insufficient during extreme events (hence ADL as backstop)
- Interest rate spikes during high utilization can erode collateral rapidly

---

## 7. Product Vision: Portfolio Margin Dashboard & Auto-Risk Manager

### Overview

A dedicated Portfolio Margin module in HypeTerminal that provides institutional-grade risk management tools, replacing the spreadsheets, mental math, and manual monitoring that traders currently rely on. The goal: make portfolio margin's complexity manageable and its capital efficiency accessible.

---

### 7.1 Live Portfolio Greeks

**What it does**: Real-time calculation and display of portfolio-level risk sensitivities.

| Metric | Description | Update Frequency |
|--------|-------------|-----------------|
| Delta | Net directional exposure per asset and total | Real-time (WebSocket) |
| Gamma | Rate of delta change -- exposure to large moves | Real-time |
| Vega | Sensitivity to implied volatility changes | Per-minute |
| Theta | Time decay across all positions | Per-hour |

**Features**:
- Per-asset and aggregate portfolio Greeks
- Greeks decomposition showing contribution from each position
- Historical Greeks evolution chart (sparklines)
- Delta drift alerts when exposure exceeds user-defined thresholds
- Target delta input with auto-hedging suggestions
- Visual breakdown: stacked bar chart of each position's contribution to total delta

**Implementation notes**: Greeks calculations via `big.js` for precision. Perps have delta = 1 per unit, so most of the value is in aggregation and offset visualization. Options Greeks require Black-Scholes or similar (relevant if Hyperliquid adds options).

---

### 7.2 Real-Time VaR Engine

**What it does**: Continuously estimates portfolio loss at configurable confidence levels.

**Methods**:
- **Parametric VaR** (variance-covariance): fastest, assumes normal distribution
- **Historical VaR**: uses recent market data, captures fat tails
- **Monte Carlo VaR**: configurable simulations (1K-100K paths), most robust

**Display**:
- Multiple confidence levels: 95%, 99%, 99.5%
- Multiple time horizons: 1-day, 5-day, 30-day
- **Component VaR**: each position's contribution to total portfolio risk
- **Incremental VaR**: marginal risk of adding/removing a position (critical for trade decisions)
- **Conditional VaR (Expected Shortfall)**: average loss beyond VaR threshold -- better tail risk measure

**Implementation notes**: VaR calculations should run in a Web Worker to avoid blocking the UI. Historical price data fetched from Hyperliquid's API. Correlation matrices computed from rolling windows of mark price data.

---

### 7.3 Margin Utilization Monitor

**What it does**: Real-time tracking of the portfolio margin ratio with visual alerts.

**Display**: Gauge/thermometer visualization of `portfolio_margin_ratio`:

| Zone | Ratio | Color | Action |
|------|-------|-------|--------|
| Safe | 0.00 - 0.50 | Green | Normal operation |
| Caution | 0.50 - 0.70 | Yellow | Monitor closely |
| Warning | 0.70 - 0.85 | Orange | Consider reducing exposure |
| Danger | 0.85 - 0.90 | Red | Actively reduce risk |
| Critical | 0.90 - 0.95 | Flashing red | Imminent liquidation |
| Liquidation | > 0.95 | -- | Positions being liquidated |

**Features**:
- Per-asset borrowing utilization vs caps (user and global)
- Margin buffer: how much margin headroom remains in USD terms
- Historical margin utilization trend (line chart, 24h/7d/30d)
- Projected margin under different market scenarios (mini stress test)
- Alert system: configurable thresholds for push/sound/visual notifications
- "What if" calculator: simulate adding a new position and see the margin impact before trading

---

### 7.4 Hedging Suggestions Engine

**What it does**: Analyzes current portfolio and suggests specific trades to reduce risk or improve margin efficiency.

**Logic**:
1. Calculate current net delta per asset
2. Identify unhedged directional exposure
3. Generate trade suggestions to neutralize or reduce exposure
4. Calculate cost of hedge (fees + spread + funding) vs margin benefit
5. Rank suggestions by margin-efficiency ratio (margin saved per dollar of hedge cost)

**Suggestions displayed**:

```
Portfolio Delta: +2.3 BTC, -15.7 ETH, +$12,400 net USD exposure

Suggested Hedges:
  1. Short 2.3 BTC-PERP  -->  Margin freed: $4,200  |  Cost: $8.50/day funding
  2. Long 15.7 ETH-PERP  -->  Margin freed: $3,800  |  Cost: $12.30/day funding
  3. Partial: Short 1.5 BTC-PERP  -->  Margin freed: $2,900  |  Residual delta: +0.8 BTC
```

**Features**:
- Optimal hedge ratio using correlation data
- "One-click hedge" buttons for common strategies (delta neutral, basis trade)
- Show margin reduction achievable from each suggested hedge
- Factor in funding rates -- sometimes being partially hedged is cheaper than fully hedged
- Prioritize hedges that reduce margin ratio the most per dollar of cost

---

### 7.5 Stress Testing Suite

**What it does**: Shows portfolio P&L, margin ratio, and liquidation status under various market scenarios.

**Pre-Built Scenarios**:

| Scenario | Description |
|----------|-------------|
| BTC Flash Crash | BTC -30% in 1 hour, alts -40-50% |
| Correlation Spike | All crypto correlations spike to 1.0 |
| Stablecoin Depeg | USDC or USDH drops to $0.95 |
| Funding Rate Spike | Funding rates jump to 0.1%/hour across all perps |
| Liquidity Crisis | Spreads widen 10x, depth drops 90% |
| March 2020 Replay | BTC -50% in 48 hours |
| May 2021 Replay | BTC -35%, alts -50-70% |
| FTX Nov 2022 Replay | BTC -25%, exchange contagion pricing |

**Custom Scenario Builder**: User sets price moves per asset, volatility multiplier, correlation override, and funding rate changes.

**Reverse Stress Testing**: "What market move would liquidate me?"
- Solve for the price move(s) that push `portfolio_margin_ratio > 0.95`
- Display as: "You would be liquidated if BTC drops 42% while ETH holds steady"

**Output per scenario**: P&L in USD, new margin ratio, liquidation Y/N, which positions liquidate first, cascade effects.

---

### 7.6 Correlation Matrix View

**What it does**: Live heatmap of correlations between all portfolio assets.

**Features**:
- Multiple timeframes: 24h, 7d, 30d, 90d rolling correlations
- Color-coded heatmap (red = high positive, blue = high negative, white = uncorrelated)
- Highlight correlation changes: arrows showing increasing/decreasing trends
- Compare current correlations vs stress-period correlations (Mar 2020, Nov 2022)
- Alert when correlations deviate significantly from assumptions used in margin calculation
- Show how portfolio risk changes if correlations shift to stress-period levels
- Regime detection: flag when correlation regime appears to be changing

**Why this matters**: Portfolio margin offsets depend on correlations. If BTC-ETH correlation drops from 0.85 to 0.40, hedges stop working and margin requirements increase. Traders need to see this coming.

---

### 7.7 Liquidation Surface Heatmap

**What it does**: 2D visualization showing liquidation risk across simultaneous price moves in two assets.

**Display**: Heatmap where:
- X-axis: BTC price change (-50% to +50%)
- Y-axis: ETH price change (-50% to +50%)
- Color: portfolio margin ratio at each point (green = safe, red = liquidated)
- Contour line at 0.95 = liquidation boundary

**Features**:
- Select any two assets for the axes
- Current position marked on the heatmap
- "Distance to liquidation" metric in both price and percentage terms
- Compare liquidation surface under cross margin vs portfolio margin
- Animate: show how the surface changes as you add/remove a position
- Multi-asset extension: tabbed views for different asset pairs

---

### 7.8 Collateral Optimizer

**What it does**: Suggests optimal collateral composition across USDC, USDH, HYPE, and BTC.

**Factors**:
- LTV ratios per asset (HYPE = 0.5, BTC = TBD)
- Interest costs on borrowed assets
- Price volatility of collateral (HYPE is more volatile than USDC, so LTV is lower)
- Liquidation threshold impact: `0.5 + 0.5 * LTV(token)`
- Current utilization rates (affects borrow APY)

**Output**:
```
Current Collateral: 100% USDC ($50,000)
Suggested: 60% USDC ($30,000) + 20% HYPE ($10,000) + 20% BTC ($10,000)

Impact:
  - Margin ratio: 0.62 --> 0.58  (improved)
  - Annual interest cost: $2,500 --> $1,800  (saved $700)
  - Liquidation distance: 34% --> 31%  (slightly worse due to volatile collateral)
  - HYPE/BTC collateral earns additional yield exposure
```

**Features**:
- Auto-rebalance suggestions when one asset's LTV or price changes significantly
- Factor in user's existing spot holdings (use what you already own)
- Show trade-off clearly: capital efficiency vs liquidation distance

---

### 7.9 P&L Attribution

**What it does**: Breaks down portfolio P&L by source.

| Source | Description |
|--------|-------------|
| Directional | P&L from price movements on net exposure |
| Basis | P&L from spot-perp basis convergence/divergence |
| Funding | Net funding received minus funding paid |
| Interest | Interest earned on supplied assets minus interest paid on borrows |
| Fees | Trading fees paid |
| Liquidation | Losses from partial liquidations (if any) |

**Features**:
- Per-strategy P&L tracking (tag positions by strategy)
- Risk-adjusted returns: Sharpe ratio, Sortino ratio per sub-strategy
- Compare actual vs expected P&L based on model
- Time-series view: daily, weekly, monthly attribution
- Identify which strategies are generating alpha vs just collecting yield

---

### 7.10 Interest Rate & Funding Dashboard

**What it does**: Tracks all yield-related metrics in one view.

**Features**:
- Current borrow rates per asset with utilization curve visualization
- Projected interest costs at current and stressed utilization levels
- Funding rate tracker across all perp positions (real-time)
- Net carry calculation: funding received - interest paid - fees
- Optimal collateral allocation to minimize interest costs
- Historical funding rate charts with statistical summaries
- Alert on funding rate spikes or inversions

---

### 7.11 Auto-Rebalancing Engine

**What it does**: Monitors portfolio drift from target allocations and suggests rebalancing trades.

**Features**:
- Define target allocations (e.g., 50% BTC, 30% ETH, 20% stables)
- Configurable rebalancing bands (rebalance when 5% off target)
- Fee-aware optimization: minimize trading costs during rebalance
- Show impact on margin utilization post-rebalance
- Trigger modes: threshold-based, schedule-based (daily/weekly), or manual
- Preview mode: see all suggested trades before executing

---

### 7.12 Risk Alerts & Notifications

**What it does**: Configurable alert system for all risk metrics.

| Alert Category | Triggers |
|---------------|----------|
| Margin ratio | Crosses 0.70, 0.85, 0.90 thresholds |
| Delta drift | Net delta exceeds user-defined tolerance |
| Correlation regime | Correlation shift > 0.2 in rolling window |
| Funding rate | Spike above/below threshold |
| Interest rate | APY exceeds threshold on borrowed assets |
| Position concentration | Single asset > X% of portfolio |
| Global cap utilization | Platform approaching borrow/supply caps |

**Delivery**: In-app notifications, browser push, optional Telegram/Discord webhook integration.

---

### 7.13 Margin Mode Comparison Tool

**What it does**: Side-by-side comparison of the same portfolio under isolated, cross, and portfolio margin.

**Display**:
```
                    Isolated    Cross    Portfolio
Total Margin Req:   $48,200    $31,500    $18,900
Capital Freed:        --       $16,700    $29,300
Max Leverage:        2.1x       3.2x       5.3x
Liq Distance:        12%        22%        38%
Strategies Enabled:   3          5          9
```

**Use case**: Help traders understand the benefit of upgrading to portfolio margin. Useful as an educational/onboarding tool.

---

### Architecture Notes for HypeTerminal Integration

| Concern | Approach |
|---------|----------|
| Real-time data | Hyperliquid WebSocket subscriptions (existing `useSubL2Book`, `useSubTrades` patterns) |
| Precision | `big.js` for all margin/Greeks/VaR calculations (strings in, strings out) |
| Performance | VaR and Monte Carlo in Web Workers to avoid UI blocking |
| State management | Zustand stores with `persist` for user preferences, alert thresholds, targets |
| Correlation matrices | Computed from rolling windows of mark price data via Hyperliquid API |
| Liquidation formula | `portfolio_margin_ratio = portfolio_maintenance_requirement / portfolio_liquidation_value` |
| Oracle price | Median of (spot USDC price, perp mark price, perp oracle price) -- already available |
| SSR safety | All dashboard components wrapped in `ClientOnly` (heavy browser-only computation) |
| Domain logic | `src/domain/portfolio-margin/` for calculations, keep components clean |

---

## Sources

### Hyperliquid
- [Portfolio Margin Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/portfolio-margin)
- [Margining Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining)
- [CoinDesk: Next Upgrade (Mar 2026)](https://www.coindesk.com/markets/2026/03/10/hyperliquid-s-new-upgrade-to-let-traders-take-bigger-bets-with-less-capital)
- [The Defiant: Portfolio Margin & BLP Launch](https://thedefiant.io/news/defi/hyperliquid-launches-portfolio-margin-and-blp-pre-alpha)
- [CryptoTimes: Unveils Portfolio Margin (Dec 2025)](https://www.cryptotimes.io/2025/12/13/hyperliquid-unveils-long-awaited-portfolio-margin-auto-yield-features/)
- [CryptoTimes: Plans Upgrade (Mar 2026)](https://www.cryptotimes.io/2026/03/10/hyperliquid-plans-upgrade-to-boost-leverage-for-experienced-traders/)
- [PANews: Killer Feature or Deadly Weapon?](https://www.panewslab.com/en/articles/50780375-cff1-4b10-96e7-e91e3c6861f2)
- [jeff.hl on Margin Design](https://x.com/chameleon_jeff/status/1900218435562578130)
- [jeff.hl on ADL During Volatility](https://x.com/chameleon_jeff/status/1977066751717429516)

### Portfolio Margin Mechanics
- [CME SPAN Methodology](https://www.cmegroup.com/solutions/risk-management/performance-bonds-margins/span-methodology-overview.html)
- [CME SPAN 2 Framework (PDF)](https://www.cmegroup.com/clearing/files/cme-span-2-margin-framework.pdf)
- [FINRA Portfolio Margin FAQ](https://www.finra.org/rules-guidance/key-topics/portfolio-margin/faq)
- [Capital Efficiency & Portfolio Margin](https://www.machow.ski/posts/capital_efficiency_and_portfolio_margin/)
- [OpenGamma: SPAN to VaR Impact](https://opengamma.com/span-to-var/)

### Risk & Stress Testing
- [OKX: BTC Liquidation Cascades](https://www.okx.com/en-us/learn/btc-liquidation-dollar-market-fragility)
- [FTI: Crypto Crash Oct 2025](https://www.fticonsulting.com/insights/articles/crypto-crash-october-2025-leverage-met-liquidity)
- [Coinchange: Liquidation Cascade Analysis](https://www.coinchange.io/blog/bitcoins-2-billion-reckoning-how-novembers-liquidations-cascade-exposed-cryptos-structural-fragilities)
- [Correlation Stress Testing (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S0167268122004061)
