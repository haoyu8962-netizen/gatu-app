# Correlation & Pair Trading Suite

## How Traders Manually Track Correlations & Set Up Pair Trades

### The Excel & Spreadsheet Workflow

Traders build custom Excel/Google Sheets workbooks to manage pair trades end-to-end. A typical workflow:

1. **Data collection** — Copy-paste OHLCV data from exchange CSVs or API exports into a spreadsheet. This data goes stale immediately and requires manual refreshing.
2. **Ratio computation** — Calculate price ratios (Asset A / Asset B) across historical data. Track the ratio as a time series.
3. **Rolling correlation** — Compute 30/60/90-day rolling Pearson correlation between returns. Filter for pairs above 0.7.
4. **Cointegration testing** — Run Engle-Granger two-step method (OLS regression → ADF test on residuals). Most traders skip this because Excel makes it painful — they rely on correlation alone, which is weaker.
5. **Z-score computation** — Calculate z-score of the current spread: `(spread - mean) / std_dev`. Entry at ±2.0σ, exit at ±0.5σ or 0.
6. **Signal monitoring** — Manually refresh the sheet, check if z-score has crossed a threshold, then switch to the exchange to trade.

Popular templates: Trading Tuitions Pair Trading Sheet, Algoji Pairs Trading Spreadsheet. Both require manual data refresh and provide no real-time signals.

### The Multi-Chart Window Setup

TradingView is the primary visual tool. Traders:

- Open 4-8 browser tabs: one per asset chart, one for the spread chart (e.g., `BINANCE:BTCUSDT/BINANCE:ETHUSDT`), one for the exchange, one for the spreadsheet.
- TradingView spread charts are limited to 10 symbols per expression and provide no z-score overlay, no cointegration testing, no execution.
- Some traders use Pine Script to build custom spread indicators, but these can't trigger orders.
- Split-screen monitors showing both legs side by side, manually eyeballing divergence.

### Fragmented Execution (The Biggest Pain Point)

The most dangerous part of manual pair trading is **leg risk**:

- Trader identifies a signal in their spreadsheet or chart
- Opens the exchange, places the long leg order
- Switches to the short leg, places that order
- **Problem**: Between placing the two legs, prices have moved. One leg fills, the other doesn't. The trader now has unhedged directional exposure — the exact opposite of what pair trading is supposed to achieve.
- Professional hedge funds (per FlexTrade research) spend significant resources on leg management, balance monitoring, and partial fill handling.

### Summary of Pain Points

| Pain Point | Current Workaround | Impact |
|---|---|---|
| No single tool for discovery → monitoring → execution | 3-5 different tools/tabs | Context switching, missed signals |
| Stale data in spreadsheets | Manual refresh | Signals lag by minutes to hours |
| No real-time z-score alerts | Periodic manual checking | Missed entry/exit points |
| Leg execution risk | Place orders separately | Unhedged directional exposure |
| No cointegration monitoring | One-time test, hope it holds | Strategy invalidation goes undetected |
| Liquidity asymmetry between legs | Manual size adjustment | Slippage on the illiquid leg |
| No integrated backtesting | Separate Python scripts | Strategy validation is disconnected from execution |
| Tracking multiple pairs | Multiple spreadsheet tabs | Cognitive overload, errors |

---

## Pair Trading Mechanics

### Cointegration vs. Correlation

**Correlation** measures short-term co-movement of returns. Two assets can be 0.95 correlated but drift apart permanently.

**Cointegration** measures a long-term equilibrium relationship between prices. If the spread between two cointegrated assets deviates, it reverts to the mean. This is the actual statistical foundation for pair trading.

- **Test**: Engle-Granger two-step — regress Price_A on Price_B, test residuals for stationarity (ADF test). p-value < 0.05 = cointegrated.
- **Key insight**: Correlation is neither necessary nor sufficient for profitable pair trading. Cointegration is what matters.

### Signal Generation

| Signal Type | Entry | Exit | Notes |
|---|---|---|---|
| Z-score thresholds | z = ±2.0 | z = 0 or ±0.5 | Most common approach |
| Bollinger Bands on spread | Touch outer band (2σ) | Touch moving average | Visual, intuitive |
| Half-life of mean reversion | Enter when half-life < N bars | Time-based exit | Measures reversion speed |

### Position Sizing Methods

- **Dollar-neutral**: Equal USD on each leg. Simple but ignores volatility differences.
- **Beta-adjusted**: Weight by beta to achieve market-neutrality. Must recalculate daily.
- **Volatility-adjusted**: Weight by inverse realized volatility so each leg contributes equal risk.
- **Hedge ratio (OLS/TLS)**: Use regression coefficient as the ratio. TLS (Total Least Squares) is preferred — symmetric regardless of which asset is dependent.

### Risk Management

- **Stop loss on spread**: Exit at 3σ if entry was at 2σ
- **Cointegration health monitoring**: Rolling ADF test. If cointegration breaks, exit immediately — the thesis is dead.
- **Time-based stops**: Exit if spread hasn't reverted within N periods
- **Max divergence cap**: Hard limit on spread deviation regardless of z-score
- **Regime detection**: Wider thresholds (3σ entry) in high-vol regimes, tighter (2σ) in normal regimes

---

## Opportunities on Hyperliquid

### Why Hyperliquid Is Ideal for Pair Trading

| Feature | Benefit for Pair Trading |
|---|---|
| Sub-second finality | Near-simultaneous leg execution, minimizing leg risk |
| 313+ trading pairs | Large universe for pair discovery (crypto, equities, commodities via HIP-3) |
| Cross-margin | Shared margin across both legs reduces capital requirements |
| Up to 50x leverage | Capital-efficient pair positions |
| Low fees | Higher-frequency pair strategies become viable |
| 70%+ perp DEX market share | Best on-chain liquidity for execution |
| Both perp and spot markets | Basis trades (perp vs spot) on same platform |
| Builder codes | Third-party pair trading tools can monetize via per-fill fees |
| Vaults | Pair trading strategies can be packaged as community vaults |

### Natural Pair Opportunities

**Crypto Layer 1s**
- ETH/SOL — competing smart contract platforms
- SOL/AVAX — alt-L1 narrative
- ETH/AVAX — different market cap tiers, shared fundamentals

**Layer 2s**
- OP/ARB — same technology (Optimistic rollups), different execution and ecosystem

**Sector Pairs**
- DeFi: AAVE/COMP, UNI/SUSHI
- Meme: DOGE/SHIB, PEPE/WIF
- AI: FET/RENDER

**Equity Perps (via HIP-3)**
- NVDA/AMD — semiconductor competition
- COIN/HOOD — crypto-exposed equities
- META/GOOGL — big tech ad revenue

**Cross-Asset**
- BTC perp vs equity perps — macro correlation trades
- Crypto vs commodity perps — inflation hedge narratives

**Basis Trades**
- Same-asset perp vs spot on Hyperliquid — capture funding + basis convergence
- Cross-exchange funding rate arbitrage (Hyperliquid vs CEX)

### What's Missing in the Ecosystem

No dedicated pair trading UI exists for Hyperliquid. All current pair trading is done via:
- Custom Python bots using the Hyperliquid SDK
- Hummingbot with Hyperliquid connector (requires coding)
- Manual execution (the painful multi-tab workflow described above)

**This is the gap HypeTerminal can fill.**

---

## Full Pair Trading Suite Spec for HypeTerminal

### Overview

A pair trading module integrated into HypeTerminal that provides discovery, analysis, execution, and monitoring — the complete workflow in a single interface. Eliminates the spreadsheet + multi-chart + manual execution workflow.

### Module 1: Pair Scanner & Discovery

**Purpose**: Find tradeable pairs from Hyperliquid's 313+ markets without manual screening.

**Features**:

1. **Correlation Matrix**
   - NxN heat map of rolling correlations across all (or filtered) Hyperliquid markets
   - Configurable lookback: 7d, 30d, 90d, 180d
   - Click any cell to drill into the pair
   - Color scale: green (high positive) → white (uncorrelated) → red (high negative)
   - Filter by category: All, Perp, Spot, Builders, Equities
   - Filter by minimum correlation threshold (e.g., > 0.7)

2. **Pair Screener Table**
   - Columns: Pair, Correlation, Cointegration p-value, Current Z-score, Half-life, 30d Spread Vol, Combined Volume, Combined OI
   - Sort by any column
   - Filter: min correlation, max cointegration p-value, z-score range, min volume
   - One-click to open pair in the Pair Analyzer

3. **Pair Suggestions**
   - Pre-computed "interesting pairs" based on:
     - High cointegration + current z-score near ±2
     - Recently diverged pairs (z-score spike in last 24h)
     - Sector-matched assets with high correlation
   - Updated every 5 minutes

**Data Requirements**:
- Historical candle data via `useInfoCandleSnapshot` for all markets
- `useSubAllMids` for real-time price updates
- Computation: Pearson correlation, Engle-Granger cointegration (ADF test), z-score, half-life of mean reversion
- Heavy computation should happen in a Web Worker to avoid UI blocking

### Module 2: Pair Analyzer

**Purpose**: Deep analysis of a selected pair with spread charting, statistics, and signal visualization.

**Features**:

1. **Dual Price Chart**
   - Two overlaid price series (normalized to percentage change from period start)
   - Shared x-axis, dual y-axes
   - Highlight divergence periods
   - Same interval options as main chart: 1m to 1M

2. **Spread Chart**
   - Price ratio (A/B) or log spread as a time series
   - Overlays:
     - Z-score (secondary axis)
     - Bollinger Bands (20-period, 2σ)
     - Moving average of spread
     - Entry/exit threshold lines (configurable, default ±2.0σ and ±0.5σ)
   - Visual signal markers: green arrows (entry long spread), red arrows (entry short spread), white arrows (exit)

3. **Statistics Panel**
   - Current spread value & z-score
   - Rolling correlation (7d, 30d, 90d)
   - Cointegration p-value (with traffic light: green < 0.01, yellow < 0.05, red ≥ 0.05)
   - Half-life of mean reversion (in bars/hours/days)
   - Hedge ratio (OLS and TLS)
   - Spread volatility (annualized)
   - Current funding rates for both legs
   - Combined notional volume

4. **Cointegration Health Monitor**
   - Rolling 30-day ADF test displayed as a time series
   - Alert when p-value rises above 0.05 (cointegration breaking down)
   - Historical cointegration stability visualization

**Data Requirements**:
- `useInfoCandleSnapshot` for both assets
- `useSubAllMids` for real-time spread updates
- All statistical computations in Web Worker
- KLineCharts custom series for spread chart (or Recharts for simpler implementation)

### Module 3: Pair Trade Execution

**Purpose**: Execute both legs of a pair trade simultaneously with a single action, eliminating leg risk.

**Features**:

1. **Pair Order Entry**
   - Single form to configure both legs:
     - Asset A: market/symbol, side (auto-determined from spread direction)
     - Asset B: market/symbol, side (auto-determined, opposite of A)
     - Sizing mode: Dollar-neutral, Beta-adjusted, Custom ratio
     - Total notional (USD) — automatically split between legs
     - Leverage (applies to both legs)
     - Order type: Market (both legs), Limit (both legs with configurable prices)
   - "Long Spread" button: buy A, sell B
   - "Short Spread" button: sell A, buy B
   - Preview showing: size per leg, estimated fees, margin required, hedge ratio

2. **Simultaneous Execution**
   - Both legs submitted in rapid succession via `useExchangeOrder`
   - "Lean leg" option: fill the less-liquid leg first, then execute the liquid leg
   - If one leg fails: automatic cancel of the other (or configurable behavior — hold, retry, or cancel)
   - Execution report showing fill prices, slippage, and achieved spread vs. target

3. **Quick Entry from Analyzer**
   - When z-score crosses threshold on the Spread Chart, a "Trade This Signal" button appears
   - Pre-fills the Pair Order Entry with the correct direction and suggested sizing
   - One-click execution

4. **Ratio/Spread Orders** (Advanced)
   - Place an order that triggers when the spread reaches a target value
   - "Buy spread at z = -2.0" — system monitors and executes when z-score hits -2.0
   - Implemented as client-side monitoring with automatic execution (not on-chain conditional orders)

**Data Requirements**:
- `useExchangeOrder` for both legs
- `useSubBbo` for both assets (execution price estimation)
- `useSubAllMids` for spread monitoring (ratio orders)
- `useClearinghouseState` for margin validation

### Module 4: Pair Position Manager

**Purpose**: Monitor and manage open pair trades as unified positions, not individual legs.

**Features**:

1. **Pair Positions Table**
   - Each row represents a pair trade (not individual positions):
     - Pair name (e.g., "ETH/SOL")
     - Entry spread & current spread
     - Spread P&L (USD and %)
     - Current z-score
     - Individual leg details (expandable): size, entry price, current price, unrealized PnL
     - Funding received/paid (net across both legs)
     - Time held
   - Color coding: green when spread is reverting toward mean, red when diverging further

2. **Pair TP/SL**
   - Set take-profit and stop-loss on the spread (not on individual prices)
   - TP: "Close when z-score reaches ±0.5" or "Close when spread P&L reaches +$500"
   - SL: "Close when z-score exceeds ±3.0" or "Close when spread P&L reaches -$200"
   - Time-based exit: "Close after 48 hours if not in profit"
   - Cointegration-based exit: "Close if rolling cointegration p-value > 0.10"

3. **Pair Close**
   - Single button to close both legs simultaneously
   - Same execution logic as entry (simultaneous, lean leg option)
   - Partial close: reduce both legs proportionally

4. **Rebalancing**
   - Alert when the hedge ratio drifts beyond a threshold (e.g., > 5% from target)
   - One-click rebalance: adjust leg sizes to restore the target hedge ratio
   - Auto-rebalance option: system adjusts automatically at configurable intervals

**Data Requirements**:
- `useSubOpenOrders` for both legs
- `useSubClearinghouseState` for positions
- `useSubAllMids` for spread tracking
- Custom pair position tracking in a Zustand store (pairs are a UI concept, not native to the exchange)

### Module 5: Alerts & Notifications

**Purpose**: Never miss a signal or risk event.

**Features**:

1. **Z-Score Alerts**
   - Set alerts on any pair: "Notify when z-score crosses ±2.0"
   - Browser notifications (Notification API)
   - Sound alerts (configurable)
   - Visual badge on the pair in the scanner

2. **Cointegration Breakdown Alerts**
   - "Notify when cointegration p-value rises above 0.05"
   - Critical for risk management — the pair trade thesis is invalidated

3. **Spread P&L Alerts**
   - "Notify when pair P&L reaches +$X or -$X"

4. **Custom Alert Builder**
   - Combine conditions: "Z-score > 2.0 AND volume > $1M AND correlation > 0.8"

### Module 6: Backtest Engine (Phase 2)

**Purpose**: Validate pair strategies before risking capital.

**Features**:

1. **Strategy Configuration**
   - Select pair
   - Entry/exit z-score thresholds
   - Position sizing method
   - Lookback period for statistics
   - Trading fees (use Hyperliquid's actual fee schedule)
   - Leverage

2. **Backtest Results**
   - Equity curve
   - Total return, Sharpe ratio, max drawdown, win rate
   - Number of trades, average holding period
   - Spread chart with entry/exit markers
   - Drawdown chart
   - Monthly returns heatmap

3. **Optimization** (Optional)
   - Grid search over z-score entry/exit thresholds
   - Optimal lookback period detection
   - Walk-forward analysis to avoid overfitting

**Data Requirements**:
- `useInfoCandleSnapshot` for historical data
- All computation in Web Worker
- Results cached in memory or IndexedDB

---

### Architecture & Integration

#### Route Structure

```
/pairs                    → Pair Scanner (correlation matrix + screener)
/pairs/:pairId            → Pair Analyzer (e.g., /pairs/ETH-SOL)
```

The Pair Trade Execution panel and Position Manager integrate as panels within the existing trade terminal layout, accessible when a pair is selected.

#### State Management

```
src/stores/use-pair-store.ts
├── activePairs: PairConfig[]           // Pairs being tracked
├── pairPositions: PairPosition[]       // Open pair trades (UI-level grouping)
├── alerts: PairAlert[]                 // Active alerts
├── scannerFilters: ScannerFilters      // Correlation/cointegration filters
└── analyzerSettings: AnalyzerSettings  // Z-score thresholds, lookback, etc.
```

#### Domain Logic

```
src/domain/pairs/
├── correlation.ts          // Pearson correlation computation
├── cointegration.ts        // Engle-Granger, ADF test
├── spread.ts               // Spread calculation, z-score, half-life
├── hedge-ratio.ts          // OLS, TLS hedge ratio computation
├── sizing.ts               // Dollar-neutral, beta-adjusted sizing
├── backtest.ts             // Backtest engine
└── workers/
    ├── correlation.worker.ts   // Web Worker for matrix computation
    └── backtest.worker.ts      // Web Worker for backtesting
```

#### Components

```
src/components/pairs/
├── correlation-matrix.tsx      // NxN heat map
├── pair-screener.tsx           // Filterable/sortable pair table
├── pair-analyzer.tsx           // Spread chart + statistics
├── pair-order-entry.tsx        // Dual-leg order form
├── pair-positions.tsx          // Pair position manager
├── pair-alerts.tsx             // Alert configuration
├── spread-chart.tsx            // KLineChart or Recharts spread visualization
└── pair-suggestions.tsx        // AI/algorithmic pair recommendations
```

#### Key Technical Decisions

1. **Statistical computation**: Use Web Workers for correlation matrix (O(n²) pairs × lookback period), cointegration tests (ADF is iterative), and backtesting. The main thread must stay responsive.

2. **Data fetching**: Batch-fetch candle snapshots for the filtered universe. Cache aggressively in memory. Real-time updates via `useSubAllMids` (single subscription for all mid prices — already exists).

3. **Pair positions are a UI concept**: Hyperliquid doesn't have native pair orders. The app groups two individual positions into a "pair position" in the Zustand store. The user sees a unified pair; the exchange sees two independent positions.

4. **Execution**: Use existing `useExchangeOrder` hook for each leg. Submit both legs as fast as possible. For "lean leg" execution, use `useSubUserFills` to detect the first fill before submitting the second.

5. **Charts**: Use KLineCharts (already in the project) for spread charts with custom series. The dual-price overlay chart may require a custom KLineCharts plugin or a separate Recharts component.

6. **ADF test implementation**: Port a lightweight ADF test to TypeScript (no heavy stats library). The test is essentially an OLS regression on lagged differences — implementable with basic linear algebra. Consider using `jstat` or `simple-statistics` npm packages for distribution critical values.

---

### Implementation Phases

**Phase 1 — Discovery & Analysis** (Core Value)
- Correlation matrix (top 50 markets by volume)
- Pair screener table with sorting/filtering
- Pair analyzer with spread chart, z-score, and statistics panel
- Cointegration test and health monitoring
- Basic alerts (z-score threshold, browser notification)

**Phase 2 — Execution** (Monetizable via Builder Codes)
- Pair order entry form
- Simultaneous dual-leg execution
- Pair position grouping and display
- Spread-based TP/SL
- Pair close (simultaneous)

**Phase 3 — Advanced** (Differentiation)
- Backtest engine with walk-forward analysis
- Ratio/spread orders (client-side conditional)
- Auto-rebalancing
- Pair suggestions engine
- Multi-pair portfolio view with aggregate risk
- Funding rate arbitrage mode (perp vs spot basis trades)

---

### Competitive Positioning

| Feature | Excel + TradingView | PairTrade Finder | Python Bots | HypeTerminal |
|---|---|---|---|---|
| Pair discovery | Manual | Yes (equities) | Custom code | Yes (crypto + equities) |
| Correlation matrix | Manual | Yes | Custom code | Yes, real-time |
| Spread chart with z-score | TradingView (limited) | Yes | Matplotlib | Yes, integrated |
| Cointegration testing | Manual (painful) | Yes | Yes | Yes, continuous |
| Simultaneous execution | No | IB only | Yes | Yes, native |
| Leg risk management | No | Basic | Custom code | Yes, lean-leg + auto-cancel |
| Spread-based TP/SL | No | No | Custom code | Yes |
| Hyperliquid native | No | No | SDK only | Yes |
| No code required | Spreadsheet skills | Yes | Python required | Yes |
| Real-time monitoring | No | Delayed | Custom | Yes, WebSocket |

**HypeTerminal's edge**: The only tool that combines pair discovery, analysis, and execution natively on Hyperliquid with no code required. Builder codes provide a revenue model. The existing trading infrastructure (order entry, position management, real-time data) means pair trading is an incremental feature, not a ground-up build.
