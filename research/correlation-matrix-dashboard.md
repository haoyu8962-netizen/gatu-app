# Correlation Matrix & Heatmap Dashboard Research

> Comprehensive research for building a live Correlation Matrix tool in HypeTerminal
> Date: 2026-03-23

---

## Table of Contents

1. [Modern Trading Terminal Examples](#1-modern-trading-terminal-examples)
2. [Pair Selection & Risk Management](#2-pair-selection--risk-management)
3. [HypeTerminal Feature Design Ideas](#3-hypeterminal-feature-design-ideas)
4. [Technical Calculation Methods](#4-technical-calculation-methods)
5. [2025-2026 Trends](#5-2025-2026-trends)
6. [Architecture & Implementation](#6-architecture--implementation)
7. [Sources & References](#7-sources--references)

---

## 1. Modern Trading Terminal Examples

### 1.1 TradingView

TradingView hosts the most diverse ecosystem of community-built correlation matrix indicators. Key implementations include:

**Correlation Heatmap (Official TradingView Indicator)**
- Displays correlation coefficients for each pair of assets in a matrix format
- Rows and columns represent assets being compared
- Cell color corresponds to correlation coefficient strength
- Supports up to 10-20 symbols depending on the variant

**Community Variants:**

| Indicator | Author | Key Features |
|-----------|--------|--------------|
| Correlation Matrix + Heatmap | LeviathanCapital | Dual-mode: standard table + heatmap gradient |
| Correlation HeatMap Matrix Data | TFlab (TradingFinder) | 20-asset support, variable timeframes |
| Ticker Correlation Matrix Table | Steversteves | Table format with color thresholds |
| Multi-Period Correlation | V_Rebelo | 3 configurable periods (20, 50, 200 bars) |
| Crypto Correlations Heatmap | everget | Crypto-specific asset pairs |
| Dynamic Pair Correlation | itsKraken | Real-time pair tracking |

**Common TradingView Features:**
- Timeframe selection (1m to 1M charts)
- Configurable bar lookback (20, 50, 100, 200)
- Symbol customization (manually input tickers)
- Color gradient from negative (red) to positive (green/blue)
- Neatly aligned matrix with auto-display of symbol names

### 1.2 Bloomberg Terminal

Bloomberg offers institutional-grade correlation tools through several functions:

**CORR Function (Correlation Matrix)**
- Create custom correlation matrices comparing global assets
- Supports equities, fixed income, commodities, FX, and crypto
- Historical timeframe selection with rolling window analysis
- Critical during volatile market periods (correlations spike in crises)

**PC Function (Peer Correlation)**
- Return correlation matrix between a security and its peer companies
- Peer groups: predefined Bloomberg peers, industry peers, or user-defined
- Useful for sector-level diversification analysis

**PORT Function (Portfolio & Risk Analytics)**
- Comprehensive portfolio analytics platform
- Heat maps for portfolio risk visualization
- Multi-tab interface: holdings, characteristics, attribution
- Intraday and historical timeframe analysis
- Risk measurement, scenario analysis, and factor exposure

**PORT Visual Features:**
- Scatter plots, distribution charts, and heat maps
- Color-coded risk factor exposures
- Interactive drill-down into individual positions
- Cross-asset correlation overlay

### 1.3 Koyfin

Koyfin provides financial data analysis with advanced graphing capabilities:
- Analyze price, correlation, beta, or any technical indicator
- Fully customizable dashboards with modular panels
- Cryptocurrency data coverage alongside traditional assets
- Model portfolio holdings matrix for correlation-aware allocation
- Clean, modern web UI with institutional-quality data

### 1.4 QuantConnect

QuantConnect offers algorithmic correlation analysis:
- Cloud-based backtesting with correlation-based strategies
- Multi-asset class support (equities, futures, options, forex, crypto)
- Integration with Coinbase Pro, Binance, Kraken, Bitget
- Community-shared strategies including "Cointegration-Enhanced Crypto"
- Python/C# notebook environments for custom correlation research
- Historical data spanning 20+ years for long-term correlation studies

### 1.5 Crypto-Specific Platforms

**Sharpe AI Crypto Correlation Matrix**
- Interactive heatmap with color-coded correlation strength
- Timeframes: 1 day, 1 week, 1 month, 3 months, 6 months, 1 year
- Assets: BTC, ETH, SOL, BNB, XRP, ADA, AVAX, MATIC, DOGE, USDT + hundreds more
- Cross-asset: S&P 500, Gold, DXY, NASDAQ, Dow Jones, Treasury Yields
- Rolling correlation charts tracking relationship changes over time
- Pearson correlation coefficient calculations
- Dark theme interface
- Free access, no signup required
- Data from CoinGecko and Stooq

**CryptoDataDownload Analytics**
- Interactive correlation heatmap covering 50+ cryptocurrency pairs by market cap
- Three correlation types: Pearson, Spearman, Kendall
- Toggle between multiple timeframes
- Clean, research-focused interface

**COIN360**
- Real-time cryptocurrency heatmap (price/market cap based, not correlation)
- Treemap layout with size proportional to market cap
- Color coding for 24h price changes
- Real-time news integration

**CoinGecko / CoinMarketCap / CoinCodex**
- Market cap heatmaps (treemap style)
- Price change visualization
- Sector-level grouping
- Not true correlation matrices but related visual paradigm

**Pineify Market Correlation Matrix**
- Free stock/crypto correlation matrix calculator
- Web-based heatmap visualization
- Customizable symbol lists

### 1.6 MQL5 (MetaTrader) Correlation Dashboard

The most feature-rich open-source reference implementation comes from the MQL5 community (Parts 11-12 of MQL5 Trading Tools):

**Core Features:**
- Three statistical methods: Pearson, Spearman, Kendall
- Configurable timeframe and bar count
- Two display modes: Standard and Heatmap

**Standard Mode:**
- Predefined thresholds to categorize correlation strength
- Distinct colors for strong positive, weak positive, neutral, weak negative, strong negative
- P-value significance stars (*, **, ***) overlaid on cells
- Clear categorical visual interpretation

**Heatmap Mode:**
- Continuous color gradient from negative to positive
- Finer visualization of correlation intensities
- More nuanced than threshold-based categories
- Subtle variations become apparent

**Interactive Features (Part 12):**
- Panel dragging and minimizing via mouse events
- Button hover effects for visual feedback
- Symbol sorting by correlation strength (ascending/descending)
- Toggle between correlation and p-value views
- Light/dark theme switching with dynamic color updates
- Cell tooltips for detailed information (coefficient, p-value, method)

---

## 2. Pair Selection & Risk Management

### 2.1 Portfolio Diversification

Correlation matrices are the foundation of modern portfolio theory (Markowitz). Their practical applications:

**Identifying Diversification Opportunities:**
- Assets with low correlation (< 0.3) provide genuine diversification
- Negative correlations (-1 to -0.3) provide hedging benefits
- High correlations (> 0.7) indicate risk concentration

**Crypto-Specific Diversification Challenges:**
- Most altcoins are highly correlated with BTC (0.6-0.9 in bull markets)
- Correlations spike during market crashes (convergence to 1.0)
- Stablecoins provide near-zero correlation anchor points
- DeFi tokens may exhibit sector-specific correlation clusters
- Cross-chain assets (SOL vs ETH ecosystem) can offer some decorrelation

**Portfolio Construction Rules of Thumb:**
- Target average portfolio correlation below 0.5
- Include at least 2-3 assets with negative or near-zero correlation to BTC
- Monitor correlation stability over 30d+ windows
- Rebalance when correlation regimes shift

### 2.2 Risk Concentration Warnings

A correlation dashboard should alert traders to:

| Risk Signal | Threshold | Action |
|-------------|-----------|--------|
| Portfolio correlation > 0.8 average | High concentration | Diversify or hedge |
| Sudden correlation spike (> 0.3 increase in 24h) | Regime shift | Reduce exposure |
| All positions positively correlated | Tail risk | Add hedges |
| Correlation breakdown in hedged pair | Hedge failure | Adjust or exit |
| Cross-sector correlation rising | Systemic risk | Reduce leverage |

### 2.3 Hedging Applications

**Delta-Neutral Hedging:**
- Use correlation matrix to find negatively correlated assets
- Size hedges inversely proportional to correlation strength
- Monitor hedge effectiveness through rolling correlation

**Cross-Asset Hedging for Hyperliquid:**
- Perps against perps (e.g., long BTC short ETH when correlation weakens)
- Perps against spot (basis trading)
- Sector hedging (DeFi basket vs L1 basket)

### 2.4 Pair Trading Signals

**The Pair Trading Workflow:**

```
1. Screen Universe     → Correlation matrix identifies candidates (|r| > 0.7)
2. Test Cointegration  → Engle-Granger or Johansen test confirms long-run equilibrium
3. Calculate Spread    → Spread = log(Asset1) - β * log(Asset2)
4. Validate Mean Reversion → ADF test + Hurst exponent (H < 0.5)
5. Compute Z-Score     → Z = (Spread_t - μ_spread) / σ_spread
6. Generate Signals    → |Z| > 2 entry, |Z| < 0.5 exit
7. Risk Management     → Stop loss at |Z| > 4, position sizing by volatility
```

**Signal Rules (Z-Score Based):**

| Z-Score | Signal | Action |
|---------|--------|--------|
| Z > +3 | Strong short spread | Sell Asset1, Buy Asset2 (proportional to hedge ratio) |
| Z > +2 | Short spread | Sell Asset1, Buy Asset2 |
| Z ~ 0 | Neutral | Exit all positions |
| Z < -2 | Long spread | Buy Asset1, Sell Asset2 |
| Z < -3 | Strong long spread | Buy Asset1, Sell Asset2 (increased size) |

**Hedge Ratio Computation:**
- OLS regression: regress log(Asset1) on log(Asset2)
- The slope coefficient (beta) is the hedge ratio
- For every 1 unit of Asset1, hold beta units of Asset2
- Verify ratio stability with rolling regression

**Quality Filters:**
- Cointegration p-value < 0.05
- ADF test on spread: reject unit root at 5% significance
- Hurst exponent < 0.5 (mean-reverting)
- Filter out extremely large or tiny hedge ratios
- Verify ratio stability across rolling windows

### 2.5 Risk Concentration Dashboard Integration

The correlation matrix should integrate with position data to show:

- **Portfolio Heat Score**: Weighted average correlation of all open positions
- **Concentration Vectors**: Which assets contribute most to correlated risk
- **Marginal Correlation**: How adding a new position changes portfolio correlation
- **Stress Test**: What happens to portfolio if correlations converge to 1.0 (crisis scenario)
- **Correlation-Adjusted VaR**: Value at Risk incorporating correlation structure

---

## 3. HypeTerminal Feature Design Ideas

### 3.1 Color Coding Schemes

**Diverging Palette (Primary Recommendation):**

The standard for correlation matrices is a diverging color palette with a neutral center:

```
-1.0          -0.5           0            +0.5          +1.0
 ████████████  ████████████  ████████████  ████████████  ████████████
 Strong Neg    Weak Neg      Neutral       Weak Pos      Strong Pos
```

**Recommended Color Tokens (using HypeTerminal design system):**

| Correlation Range | Color Token | Description |
|-------------------|-------------|-------------|
| -1.0 to -0.7 | `market-down-600` | Strong negative (primary red) |
| -0.7 to -0.3 | `market-down-500` | Moderate negative (muted red) |
| -0.3 to +0.3 | `market-neutral` | Weak/no correlation |
| +0.3 to +0.7 | `market-up-500` | Moderate positive (muted green) |
| +0.7 to +1.0 | `market-up-600` | Strong positive (primary green) |

**Alternative: Blue-White-Red Diverging (Colorblind-Safe):**

Since red-green colorblindness (deuteranopia/protanopia) affects ~8% of males, an alternative palette:

| Correlation Range | Color | Hex |
|-------------------|-------|-----|
| -1.0 | Deep blue | `#2166AC` |
| -0.5 | Light blue | `#67A9CF` |
| 0 | White/neutral | `#F7F7F7` |
| +0.5 | Light orange | `#F4A582` |
| +1.0 | Deep red-orange | `#B2182B` |

This blue-orange/red diverging scheme is recommended by ColorBrewer and is safe for all common forms of color vision deficiency.

**Continuous Gradient Implementation:**

For heatmap mode, use OKLCH color interpolation (consistent with HypeTerminal's OKLCH Zinc+Blue token system):

```css
/* CSS custom property approach */
--correlation-color: oklch(
  calc(0.65 + var(--corr-abs) * 0.2)    /* lightness */
  calc(var(--corr-abs) * 0.15)            /* chroma */
  calc(var(--corr-sign) * 30 + 250)       /* hue: blue(neg) → neutral → red(pos) */
);
```

**Accessibility Considerations:**
- Always show numeric values alongside colors
- Support a "high contrast" mode with pattern fills (hatching for negative, solid for positive)
- Minimum contrast ratio of 4.5:1 for text on colored cells
- Use the Okabe-Ito palette as a fallback (recommended by Nature journals)
- Test with Sim Daltonism or similar tools

### 3.2 Sortable Pairs

**Sort Dimensions:**

| Sort Option | Description | Use Case |
|-------------|-------------|----------|
| By correlation strength (absolute) | Strongest correlations first | Find hedging pairs |
| By correlation strength (signed) | Most negative first | Find inverse relationships |
| By asset name (alphabetical) | Standard ordering | Quick lookup |
| By market cap | Largest assets first | Focus on liquid pairs |
| By category | Group perps/spot/builders | Category analysis |
| By 24h volume | Most traded first | Liquidity-aware analysis |
| By correlation change | Biggest changes first | Detect regime shifts |
| Custom drag-and-drop | User-defined order | Personalized watchlist |

**Interactive Sort Implementation:**
- Click column/row headers to sort
- Shift+click for secondary sort
- Visual indicator (caret icon from @phosphor-icons/react) showing sort direction
- Ascending/descending toggle
- "Reset to default" option

### 3.3 Integration with Pair Trading Workflows

**Spread Chart Panel:**
When a user clicks a cell in the correlation matrix, open a dedicated spread chart:

```
┌─────────────────────────────────────────────────┐
│  BTC/ETH Spread    [1h] [4h] [1d] [7d] [30d]  │
│                                                   │
│  ─────────── Mean ──────────────────────────────  │
│  ╱╲    ╱╲                         ╱╲              │
│ ╱  ╲  ╱  ╲        ╱╲            ╱  ╲             │
│╱    ╲╱    ╲      ╱  ╲     ╱╲  ╱    ╲            │
│              ╲  ╱    ╲   ╱  ╲╱      ╲           │
│               ╲╱      ╲ ╱            ╲          │
│  ─────────── -2σ ──────────────────────────────  │
│                                                   │
│  Z-Score: -1.84    Hedge Ratio: 0.0534            │
│  Corr (30d): 0.87  Cointegration p: 0.023         │
│  Half-life: 4.2d   Hurst: 0.38                    │
│                                                   │
│  [Open Long Spread]  [Open Short Spread]           │
└─────────────────────────────────────────────────┘
```

**Key Metrics to Display:**
- Current Z-score with visual gauge
- Rolling correlation coefficient
- Cointegration test p-value
- Spread half-life (mean-reversion speed)
- Hurst exponent
- Hedge ratio with confidence interval
- Historical spread distribution

**Entry/Exit Signal Overlay:**
- Color-coded Z-score bands on the spread chart
- Visual markers where entry/exit signals fire
- Alert zones highlighted (e.g., Z > 2 shaded red, Z < -2 shaded green)

**One-Click Trade Integration:**
- "Open Long Spread" button pre-fills both legs with correct hedge ratio
- "Open Short Spread" button for the inverse
- Position sizing suggestions based on account balance and risk parameters
- Link to the trade execution panel in HypeTerminal

### 3.4 Timeframe Selection

**Rolling Window Options:**

| Timeframe | Bars | Use Case |
|-----------|------|----------|
| 1 hour | 60 x 1m bars | Ultra-short-term scalping correlation |
| 4 hours | 48 x 5m bars | Intraday momentum correlation |
| 1 day | 288 x 5m or 24 x 1h bars | Day trading reference |
| 7 days | 168 x 1h bars | Swing trading standard |
| 30 days | 720 x 1h or 30 x 1d bars | Position trading reference |
| 90 days | 90 x 1d bars | Medium-term trend correlation |
| Custom | User-defined | Advanced analysis |

**Implementation Pattern:**

```
┌──────────────────────────────────────────┐
│  Correlation Matrix                       │
│  ┌─────┬─────┬─────┬─────┬─────┬──────┐ │
│  │ 1H  │ 4H  │ 1D  │ 7D  │ 30D │ 90D  │ │
│  └─────┴─────┴─────┴─────┴─────┴──────┘ │
│  Method: [Pearson ▾]  Assets: [Top 20 ▾] │
└──────────────────────────────────────────┘
```

**Multi-Timeframe View:**
- Side-by-side comparison of correlations at different timeframes
- Highlight cells where short-term and long-term correlations diverge significantly
- Color-code divergence: if 1D correlation is 0.9 but 7D is 0.3, flag as "unstable"

### 3.5 Filtering by Asset Category

For Hyperliquid's DexCategory system:

| Category | Filter | Assets |
|----------|--------|--------|
| Perps | `dexCategory === "perp"` | BTC, ETH, SOL, etc. perpetual futures |
| Spot | `dexCategory === "spot"` | Spot market pairs |
| Builders Perps | `dexCategory === "builders-perp"` | Builder-launched perpetuals |
| Cross-Category | Custom | Compare perps vs spot of same underlying |

**Category-Aware Features:**
- Default view shows intra-category correlation (e.g., all perps)
- "Cross-Category" toggle shows correlation between perps and builders
- Category badges on row/column headers
- Filter chips at top: `[All] [Perps] [Spot] [Builders] [Custom]`

**Smart Filtering:**
- "Top N by Volume" filter (show only most liquid assets)
- "My Positions" filter (show only assets user has open positions in)
- "Watchlist" filter (show user's watchlisted assets)
- Search/autocomplete to add specific assets

### 3.6 Clustering Algorithms

**Hierarchical Clustering for Asset Grouping:**

The standard approach uses agglomerative hierarchical clustering on a correlation-distance matrix:

1. **Compute Distance Matrix:**
   ```
   d(i,j) = sqrt(0.5 * (1 - ρ(i,j)))
   ```
   where ρ(i,j) is the correlation between assets i and j

2. **Apply Agglomerative Clustering:**
   - Start with each asset as its own cluster
   - Merge closest clusters iteratively
   - Linkage methods: Ward's (recommended), complete, average, single

3. **Quasi-Diagonalize the Correlation Matrix:**
   - Reorder rows/columns based on dendrogram leaf order
   - Correlated assets appear as blocks along the diagonal
   - Makes cluster structure visually obvious

**Visualization Ideas:**

```
┌─────────────────────────────────────┐
│  Clustered Correlation Matrix       │
│                                     │
│  ┌──────┐                           │
│  │ BTC  │ 1.00  0.87  0.72  ...    │
│  │ ETH  │ 0.87  1.00  0.69  ...    │   Cluster 1: "L1 Majors"
│  │ SOL  │ 0.72  0.69  1.00  ...    │
│  ├──────┤                           │
│  │ UNI  │ 0.45  0.52  0.38  ...    │
│  │ AAVE │ 0.41  0.55  0.35  ...    │   Cluster 2: "DeFi"
│  │ CRV  │ 0.38  0.48  0.31  ...    │
│  ├──────┤                           │
│  │ DOGE │ 0.55  0.42  0.38  ...    │
│  │ SHIB │ 0.52  0.39  0.35  ...    │   Cluster 3: "Memes"
│  └──────┘                           │
└─────────────────────────────────────┘
```

**Dendrogram Side Panel:**
- Collapsible dendrogram alongside the matrix
- Click a branch to highlight the corresponding cluster
- Adjustable "cut height" slider to control number of clusters
- Auto-label clusters based on common attributes (sector, market cap tier)

**Optimal Cluster Count:**
- Gap statistic method (Tibshirani et al., 2001)
- Silhouette score visualization
- Let users manually set K or use auto-detection

### 3.7 Real-Time Updates and Performance

**Data Pipeline Architecture:**

```
Hyperliquid WebSocket  →  Price Buffer  →  Returns Calculation  →  Correlation Engine  →  UI Update
     (10-100ms)           (in-memory)        (on tick)              (Web Worker)          (requestAnimationFrame)
```

**Update Strategy:**

| Component | Update Frequency | Method |
|-----------|-----------------|--------|
| Raw prices | Real-time (WebSocket) | Ring buffer in main thread |
| Return series | Every 1s (batched) | Calculate from price buffer |
| Correlation matrix | Every 5-30s | Web Worker computation |
| Heatmap render | On correlation update | React state update |
| Clustering | Every 60s or on-demand | Web Worker (expensive) |
| Cointegration tests | On-demand only | Web Worker (very expensive) |

**Performance Optimization for N Assets:**

The correlation matrix has N*(N-1)/2 unique pairs. Computation scales as O(N^2 * T) where T is the lookback window:

| N Assets | Unique Pairs | Computation Time (est.) |
|----------|-------------|------------------------|
| 10 | 45 | < 1ms |
| 20 | 190 | ~5ms |
| 50 | 1,225 | ~50ms |
| 100 | 4,950 | ~200ms |
| 200 | 19,900 | ~1s |

**Web Worker Strategy:**

```
Main Thread                          Web Worker Pool
─────────────                        ─────────────────
                                     Worker 1: Pearson computation
PriceBuffer ──→ postMessage() ──→    Worker 2: Spearman ranks
                                     Worker 3: Clustering
UI Render   ←── onmessage() ←──     Worker 4: Cointegration
```

- Use `SharedArrayBuffer` for zero-copy price data transfer
- Worker pool size: `Math.min(navigator.hardwareConcurrency - 1, 4)`
- Partition matrix computation across workers (rows 0-N/2 on Worker 1, N/2-N on Worker 2)
- Use `Transferable` objects for result arrays
- Debounce updates: skip computation if previous result is < 5s old
- Progressive rendering: update visible cells first, off-screen cells lazily

**Memory Optimization:**
- Use `Float64Array` for price/return data (typed arrays)
- Ring buffer for sliding window (avoid array shifting)
- Reuse pre-allocated result matrices
- Clear old data beyond the maximum lookback window

### 3.8 Mini Correlation Sparklines

**Concept:** Tiny inline charts showing how the correlation between two assets has evolved over time.

**Placement Options:**
1. **In-Cell Sparklines**: Inside each matrix cell, below the correlation number
2. **Row Sparklines**: At the end of each row, showing that asset's average correlation trend
3. **Tooltip Sparklines**: Appear on hover over any cell
4. **Sidebar Sparklines**: Selected pair's correlation history in a detail panel

**Design:**

```
┌────────────────────┐
│  0.87              │
│  ╱╲╱╲─╱╲─ sparkline│  ← 30-day correlation trend
│  30d rolling       │
└────────────────────┘
```

**Implementation:**
- Canvas-based for performance (SVG too heavy for N^2 sparklines)
- 30-50 data points per sparkline (one per day for 30d window)
- Height: 12-16px, width: 40-60px
- Color: use the cell's correlation color
- Optional: highlight significant changes with a dot marker

**Sparkline Interaction:**
- Hover to see exact value at that time point
- Click to expand into full rolling correlation chart
- Dimmed when correlation is stable, bright when volatile

### 3.9 Alerts When Correlation Breaks Down

**Alert Types:**

| Alert | Trigger | Severity |
|-------|---------|----------|
| Correlation Spike | Δρ > 0.3 in 24h window | Warning |
| Correlation Collapse | Δρ < -0.3 in 24h window | Warning |
| Decorrelation Event | Previously correlated pair (ρ > 0.7) drops below 0.3 | High |
| Convergence Event | Previously uncorrelated pair (ρ < 0.3) rises above 0.7 | Medium |
| Regime Shift | Cluster structure changes significantly | High |
| Pair Trade Signal | Z-score crosses entry threshold for cointegrated pair | Actionable |
| Hedge Breakdown | Hedged pair correlation drops below threshold | Critical |

**Alert Delivery:**
- In-app notification badge on the Correlation Matrix tab
- Toast notification with summary
- Optional browser push notification
- Sound alert (configurable)
- Alert history log with timestamps

**Alert Configuration UI:**

```
┌─────────────────────────────────────────────┐
│  Correlation Alerts                          │
│                                               │
│  ☑ Notify when any pair changes by > [0.3▾]  │
│    in [24h ▾] window                          │
│                                               │
│  ☑ Notify when BTC/ETH correlation < [0.5▾]  │
│                                               │
│  ☑ Pair trade signals for watched pairs       │
│    Z-score threshold: [2.0 ▾]                 │
│                                               │
│  ☑ Portfolio concentration warning             │
│    Average correlation > [0.8 ▾]              │
│                                               │
│  Delivery: [In-App ▾]  [Sound: Off ▾]        │
└─────────────────────────────────────────────┘
```

**Zustand Store for Alert State:**
```
interface CorrelationAlert {
  id: string
  type: "spike" | "collapse" | "decorrelation" | "convergence" | "regime" | "pair-signal" | "hedge-breakdown"
  pair: [string, string]
  previousCorrelation: string
  currentCorrelation: string
  timestamp: number
  acknowledged: boolean
}
```

---

## 4. Technical Calculation Methods

### 4.1 Pearson Correlation Coefficient

**Formula:**

```
        Σ(xᵢ - x̄)(yᵢ - ȳ)
ρ = ─────────────────────────────
    √[Σ(xᵢ - x̄)²] × √[Σ(yᵢ - ȳ)²]
```

Or equivalently:

```
        n·Σxᵢyᵢ - Σxᵢ·Σyᵢ
ρ = ───────────────────────────────────
    √[n·Σxᵢ² - (Σxᵢ)²] × √[n·Σyᵢ² - (Σyᵢ)²]
```

**Properties:**
- Range: [-1, +1]
- Measures linear relationship only
- Sensitive to outliers
- Assumes normal distribution of variables
- Undefined when variance is zero

**Assumptions:**
1. Linear relationship between variables
2. Both variables are continuous
3. Both variables are approximately normally distributed
4. No significant outliers
5. Homoscedasticity (constant variance)

**Limitations for Crypto:**
- Crypto returns are fat-tailed (non-normal), violating assumption 3
- Flash crashes create extreme outliers, violating assumption 4
- Relationships may be non-linear (e.g., leverage-driven cascade effects)
- Crypto exhibits heteroscedasticity (volatility clustering)

**Efficient Computation (Welford's Online Algorithm):**

For streaming/rolling calculation, use numerically stable single-pass:

```
Initialize: n=0, mean_x=0, mean_y=0, M2_x=0, M2_y=0, C=0

For each new (x, y) pair:
  n += 1
  dx = x - mean_x
  mean_x += dx / n
  mean_y += (y - mean_y) / n  // note: use old mean_y for dy below
  dy = y - mean_y
  M2_x += dx * (x - mean_x)
  M2_y += dy * (y - mean_y)  // note: this uses NEW mean_y
  C += dx * (y - mean_y)      // note: uses old mean_x (dx) and new mean_y

Correlation:
  ρ = C / sqrt(M2_x * M2_y)
```

This avoids numerical instability from computing large sums.

### 4.2 Spearman Rank Correlation

**When to Use:**
- When data is non-normally distributed (common in crypto)
- When relationship is monotonic but not linear
- When outlier resistance is needed
- When ordinal relationships matter more than exact magnitudes

**Formula:**

```
        6 × Σdᵢ²
ρₛ = 1 - ─────────────
        n(n² - 1)
```

where dᵢ = rank(xᵢ) - rank(yᵢ)

**For tied ranks, use the Pearson formula applied to ranks:**

```
        Σ(Rᵢ - R̄)(Sᵢ - S̄)
ρₛ = ─────────────────────────────
    √[Σ(Rᵢ - R̄)²] × √[Σ(Sᵢ - S̄)²]
```

where Rᵢ and Sᵢ are the ranks of xᵢ and yᵢ

**Advantages for Crypto:**
- Robust to outliers (flash crashes, wicks)
- No normality assumption
- Captures monotonic relationships (e.g., when BTC goes up, ETH goes up, but not necessarily proportionally)
- Less sensitive to extreme returns
- Works well with the heavy-tailed distributions typical of crypto

**Computational Cost:**
- Requires sorting to compute ranks: O(N log N) per pair
- Total for matrix: O(N² × T × log T) where T is window size
- More expensive than Pearson by a factor of log(T)

**Practical Recommendation:**
Spearman should be the **default** for crypto correlation in HypeTerminal, with Pearson as an option. The non-normality and outlier prevalence in crypto makes Spearman more reliable.

### 4.3 Kendall Tau

**Formula:**

```
        (concordant pairs) - (discordant pairs)
τ = ───────────────────────────────────────────────
                    n(n-1) / 2
```

A pair (xᵢ, yᵢ), (xⱼ, yⱼ) is:
- **Concordant** if (xᵢ - xⱼ)(yᵢ - yⱼ) > 0
- **Discordant** if (xᵢ - xⱼ)(yᵢ - yⱼ) < 0

**Properties:**
- Range: [-1, +1]
- More robust than Pearson
- Based on concordance/discordance of pairs
- Better statistical properties for small samples
- Direct probabilistic interpretation: P(concordant) - P(discordant)

**Computational Complexity:**
- Naive: O(N²) per pair — expensive
- Optimized (merge sort variant): O(N log N) per pair
- Total for matrix: O(N² × T × log T) or O(N² × T²) naive

**When to Prefer Kendall Over Spearman:**
- Small sample sizes (< 50 data points)
- When you need confidence intervals (Kendall has better asymptotic properties)
- When many tied values exist
- For statistical testing (more powerful test of independence)

### 4.4 Rolling Correlation Windows

**Concept:** Compute correlation over a sliding window of fixed size, moving forward one step at a time.

**Parameters:**
- Window size W (number of data points)
- Step size S (usually 1)
- Minimum data points required (typically W/2)

**Implementation Strategy:**

For efficient rolling computation, maintain running sums and update incrementally:

```
When adding new point (x_new, y_new) and removing oldest (x_old, y_old):
  sum_x  += x_new - x_old
  sum_y  += y_new - y_old
  sum_xy += x_new*y_new - x_old*y_old
  sum_x2 += x_new² - x_old²
  sum_y2 += y_new² - y_old²

  ρ = (n*sum_xy - sum_x*sum_y) / sqrt((n*sum_x2 - sum_x²)*(n*sum_y2 - sum_y²))
```

This gives O(1) per update instead of O(W) for recomputation.

**Window Size Guidelines for Crypto:**

| Window | Best For | Notes |
|--------|----------|-------|
| 20 bars | Short-term scalping correlation | Very noisy, high variance |
| 50 bars | Intraday momentum | Moderate noise |
| 100 bars | Swing trading reference | Good balance |
| 200 bars | Position trading | Smoothest, most lagging |
| 500+ bars | Structural analysis | Very stable, misses regime changes |

**Rolling Correlation Visualization:**
- Time series chart with correlation on Y-axis [-1, +1]
- Horizontal reference lines at +0.7, 0, -0.7
- Shaded confidence bands
- Mark regime change points

### 4.5 Exponentially Weighted Moving Correlation (EWMC)

**Core Formula (EWMA Covariance):**

```
Σₜ₊₁ = (1-λ) × εₜεₜ' + λ × Σₜ
```

where:
- Σₜ is the conditional covariance matrix at time t
- εₜ = rₜ - μ (demeaned returns)
- λ is the decay parameter (0 < λ < 1)

**Expanded Form:**

```
Σₜ₊₁ = (1-λ)εₜεₜ' + λ(1-λ)εₜ₋₁εₜ₋₁' + λ²(1-λ)εₜ₋₂εₜ₋₂' + ...
```

**Converting Covariance to Correlation:**

```
ρₜⁱʲ = Σₜⁱʲ / √(Σₜⁱⁱ × Σₜʲʲ)
```

Or in matrix form: Γₜ = Dₜ⁻¹ Σₜ Dₜ⁻¹ where Dₜ is a diagonal matrix of conditional volatilities.

**Lambda Parameter:**
- λ = 0.94: RiskMetrics standard for daily data
- λ = 0.97: Smoother, longer effective memory
- λ = 0.90: More responsive, shorter memory
- Effective window ≈ 1/(1-λ): λ=0.94 → ~17 days effective window

**Advantages over Rolling Window:**
- No hard cutoff — all past data contributes
- Smooth weight decay avoids "echo effects" when old data falls out of window
- Single parameter (λ) to tune
- More responsive to regime changes (recent data weighted more)
- Connections to IGARCH(1,1) framework

**Disadvantages:**
- Requires initialization (first estimate from sample covariance)
- Lambda selection is somewhat arbitrary
- Not as robust to outliers as rank-based methods

**Recommended for HypeTerminal:**
EWMC should be offered alongside rolling Pearson/Spearman as an advanced option, especially for:
- Users interested in how correlations are evolving right now
- Risk management (following RiskMetrics methodology)
- Detecting correlation regime changes faster than fixed windows

### 4.6 Distance Correlation

**Concept:** Measures both linear and non-linear dependencies between variables. Unlike Pearson, dCor = 0 implies independence (for continuous random variables).

**Formula:**

```
dCor(X, Y) = dCov(X, Y) / √(dVar(X) × dVar(Y))
```

where dCov is the distance covariance:

```
dCov²(X, Y) = (1/n²) × Σᵢ Σⱼ Aᵢⱼ × Bᵢⱼ
```

where:
- Aᵢⱼ = aᵢⱼ - āᵢ. - ā.ⱼ + ā.. (doubly centered Euclidean distance matrix)
- aᵢⱼ = |xᵢ - xⱼ| (pairwise Euclidean distances)

**Properties:**
- Range: [0, 1] (no sign — detects dependence but not direction)
- dCor = 0 iff X and Y are independent (for continuous variables)
- Detects non-linear relationships that Pearson misses
- More computationally expensive: O(N²) per pair

**Use in HypeTerminal:**
- Advanced screening mode for detecting hidden non-linear dependencies
- Flag pairs where Pearson correlation is low but distance correlation is high
- Useful for finding complex lead-lag relationships in crypto markets

### 4.7 Mutual Information

**Formula:**

```
I(X; Y) = Σₓ Σᵧ p(x,y) × log(p(x,y) / (p(x) × p(y)))
```

For continuous variables (with kernel density estimation or k-nearest neighbors):

```
I(X; Y) = H(X) + H(Y) - H(X, Y)
```

where H is Shannon entropy.

**Properties:**
- Range: [0, ∞) — unbounded
- Captures all dependencies (linear, non-linear, complex)
- MI = 0 iff X and Y are independent
- No distributional assumptions
- Symmetric: I(X; Y) = I(Y; X)

**Advantages for Crypto:**
- Captures complex dependencies in volatile markets
- Non-parametric — works with any distribution
- Better at detecting sector-level clustering than Pearson
- Useful for lead-lag analysis

**Challenges:**
- Estimation is computationally expensive and noisy
- Requires careful parameter selection (bin size, bandwidth, k)
- Small sample sizes lead to biased estimates
- No sign information (can't distinguish positive vs negative correlation)
- Results are harder to interpret than correlation coefficients

**Practical Use in HypeTerminal:**
- Offer as an "advanced" or "research" mode
- Normalize to [0, 1] using MI / max(H(X), H(Y)) for comparability
- Use k-NN estimator (Kraskov-Stogbauer-Grassberger) for better finite-sample performance
- Display alongside Pearson to highlight non-linear relationships

### 4.8 Cointegration Tests

Cointegration is fundamentally different from correlation: two assets can be highly correlated but not cointegrated, or cointegrated but with varying short-term correlation.

**Engle-Granger Two-Step Method:**

Step 1: Estimate the cointegrating regression:
```
Y_t = α + β × X_t + ε_t
```

Step 2: Test the residuals (ε_t) for stationarity using the Augmented Dickey-Fuller (ADF) test:
```
Δε_t = φ × ε_{t-1} + Σ γᵢ × Δε_{t-i} + u_t
```

Test H₀: φ = 0 (unit root / no cointegration)
Reject H₀ if test statistic < critical value → pair is cointegrated.

**Critical Values (Engle-Granger, 2 variables):**

| Significance | Critical Value |
|-------------|---------------|
| 1% | -3.90 |
| 5% | -3.34 |
| 10% | -3.04 |

**Johansen Test:**

More powerful, handles multiple cointegrating relationships:
- Estimates a VAR model and tests for reduced rank
- Returns number of cointegrating vectors (0, 1, ..., N-1)
- Two test statistics: Trace test and Maximum Eigenvalue test
- Better for systems of 3+ assets

**When to Use Each:**

| Method | Best For | Limitations |
|--------|----------|-------------|
| Engle-Granger | Two-asset pairs, simple implementation | Only one cointegrating vector, variable ordering matters |
| Johansen | Multi-asset systems, robust | More complex, computationally expensive |
| KSS (Kapetanios-Snell-Shin) | Non-linear cointegration, crypto | Newer method, less widely tested |

**Integration in HypeTerminal:**

```
Correlation Matrix → Click cell → "Test Cointegration" button
                                  → Results panel:
                                    - Engle-Granger p-value
                                    - ADF statistic on spread
                                    - Hedge ratio (β)
                                    - Half-life of mean reversion
                                    - Hurst exponent
                                    - Visual: spread chart with Z-score
```

**Hurst Exponent for Validation:**

```
H = log(R/S) / log(T)
```

where R/S is the rescaled range statistic.

| Hurst (H) | Interpretation |
|-----------|---------------|
| H < 0.5 | Mean-reverting (good for pairs trading) |
| H = 0.5 | Random walk (no predictability) |
| H > 0.5 | Trending (bad for pairs trading, good for momentum) |

### 4.9 Computational Complexity Summary

| Method | Per Pair | Full Matrix (N assets) | Real-Time Feasibility |
|--------|----------|----------------------|----------------------|
| Pearson | O(T) | O(N² × T) | Excellent (< 10ms for 50 assets) |
| Spearman | O(T log T) | O(N² × T log T) | Good (< 50ms for 50 assets) |
| Kendall | O(T log T) | O(N² × T log T) | Good (same as Spearman) |
| EWMC | O(1) per update | O(N²) per update | Excellent (recursive) |
| Distance Correlation | O(T²) | O(N² × T²) | Poor (Web Worker only, on-demand) |
| Mutual Information | O(T log T) to O(T²) | O(N² × T²) | Poor (Web Worker only, on-demand) |
| Engle-Granger | O(T) | O(N² × T) | Moderate (on-demand per pair) |
| Johansen | O(T × p²) | Not practical for matrix | On-demand only |

### 4.10 Web Worker Strategies

**Worker Architecture:**

```
┌─────────────────────────────────────────────────┐
│  Main Thread                                     │
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ Price Buffer  │  │ React UI (Correlation    │ │
│  │ (Ring Buffer) │  │ Matrix, Charts, Alerts)  │ │
│  └──────┬───────┘  └──────────▲───────────────┘ │
│         │                      │                  │
│    postMessage             onmessage              │
│    (Transferable)          (Transferable)          │
│         │                      │                  │
├─────────┼──────────────────────┼──────────────────┤
│         ▼                      │                  │
│  ┌──────────────────────────────────────────────┐│
│  │  Worker Pool (correlation-worker.ts)         ││
│  │                                              ││
│  │  Worker 1: Pearson/EWMC matrix computation   ││
│  │  Worker 2: Spearman ranking + correlation    ││
│  │  Worker 3: Clustering + dendrogram           ││
│  │  Worker 4: Cointegration tests (on-demand)   ││
│  └──────────────────────────────────────────────┘│
│  Web Worker Thread(s)                             │
└─────────────────────────────────────────────────┘
```

**Data Transfer Optimization:**

1. **SharedArrayBuffer**: Zero-copy shared memory for price data
   - Requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers
   - Falls back to Transferable ArrayBuffers if COOP/COEP not available

2. **Transferable Objects**: For result matrices
   ```
   worker.postMessage({ type: "compute", data: resultBuffer }, [resultBuffer])
   ```

3. **Delta Updates**: Only send changed prices, not entire history
   - Track last-sent index in price buffer
   - Send only new data points since last computation

**Debounce & Scheduling:**
- Minimum 5s between full matrix recomputations
- Cancel pending computation if new data arrives
- Priority queue: user-visible pairs computed first
- Background pairs computed in idle time via `requestIdleCallback`

**Stateful Workers:**
- Workers maintain their own copy of return series
- Main thread sends only incremental updates
- Avoids re-serializing full history on each computation
- Workers track their own rolling window state

---

## 5. 2025-2026 Trends

### 5.1 AI-Driven Anomaly Detection

**Current State (2025-2026):**

AI-powered data integration frameworks combine entity recognition, transactional pattern mining, and sentiment-weighted event analysis to model user behavior, asset interdependencies, and protocol vulnerabilities.

**Key Developments:**
- Unsupervised anomaly detection modules can trigger alerts hours before exploits occur
- Outlier activity in pool imbalance scores and smart contract invocation frequency serve as early warning signals
- AI models process large datasets and deliver intelligent features: automated analytics, machine learning pipelines, anomaly detection
- Real-time risk score visualization where node color intensity reflects risk levels

**Application to Correlation Dashboards:**
- Train anomaly detection models on historical correlation matrices
- Flag unusual correlation patterns (e.g., previously uncorrelated assets suddenly moving together)
- Detect wash trading or manipulation through abnormal correlation signatures
- Predict correlation regime shifts before they fully materialize
- Use LSTM or transformer models to forecast correlation evolution

### 5.2 Regime Detection

**Hidden Markov Models (HMMs):**

HMMs are the leading approach for crypto market regime detection in 2025-2026:

- Effectively model non-stationary cryptocurrency markets
- Incorporate variables: market sentiment, regulatory developments, technological advancements, macroeconomic conditions
- Detect transitions among bullish, bearish, and neutral phases
- Outperform other models in forecasting regime shifts

**Hybrid Approaches:**
- K-Means + HMM: Superior performance vs standalone models
- Gaussian Mixture Models: Direct clustering of return distributions without assuming time-dependent transitions
- Bayesian MCMC + HMM: Integrates 16+ macroeconomic and crypto-specific factors

**Correlation-Based Regime Detection:**
1. Calculate correlation matrices for sliding time windows
2. Estimate pairwise similarities between correlation snapshots
3. Apply PCA to the similarity matrix
4. Cluster dates using K-Means or spectral clustering
5. Identify 5-7 distinct market regimes

**Application in HypeTerminal:**
- Display current detected regime label (e.g., "High Correlation / Risk-Off")
- Show regime transition probabilities
- Color-code the correlation matrix background by regime
- Alert when regime transition is detected
- Historical regime overlay on price charts

### 5.3 Dynamic Timeframes

**Adaptive Window Selection:**
- Instead of fixed windows, automatically adjust based on market volatility
- High volatility → shorter windows (more responsive)
- Low volatility → longer windows (more stable)
- Use GARCH-estimated volatility to determine optimal window size

**Multi-Scale Analysis:**
- Wavelet decomposition of correlation at different time scales
- Show correlation at multiple resolutions simultaneously
- Identify which time scale dominates the current relationship

### 5.4 Cross-Chain Correlation in DeFi

**2025-2026 Context:**
- Cross-chain bridges and interoperability protocols increase correlation between chains
- Ethereum, Solana, Avalanche, Polygon ecosystems developing independent dynamics
- Bridge exploits (Ronin, Harmony) demonstrate cascading cross-chain risk

**Key Correlation Patterns:**
- Same-protocol tokens across chains (USDC on Ethereum vs USDC on Solana)
- Native L1 tokens vs their ecosystem DeFi tokens
- Stablecoin depegging correlation (when one stablecoin depegs, others may follow)
- NFT market correlation with underlying chain tokens

**HypeTerminal Opportunity:**
- Hyperliquid-specific: correlate builder-launched tokens with underlying protocols
- Track how Hyperliquid-native tokens correlate with their CEX-listed counterparts
- Monitor HLP (Hyperliquid Liquidity Pool) correlation with individual assets
- Cross-category analysis: how do builders-perp correlations differ from standard perps?

### 5.5 Natural Language Correlation Queries

Emerging trend: AI-powered natural language interfaces for correlation analysis:
- "Show me assets that are decorrelating from BTC this week"
- "Which pairs have the strongest mean-reversion signal right now?"
- "Alert me if my portfolio correlation exceeds 0.8"
- "Find crypto assets correlated with gold but not S&P 500"

### 5.6 On-Chain Correlation Signals

Beyond price correlation, 2025-2026 platforms are exploring:
- Wallet activity correlation (are the same whales trading both assets?)
- TVL correlation (do DeFi protocols gain/lose TVL together?)
- Gas usage correlation (network activity patterns)
- Social sentiment correlation (are communities discussing both assets?)

---

## 6. Architecture & Implementation

### 6.1 Suggested File Structure

```
src/
├── domain/
│   └── correlation/
│       ├── pearson.ts            # Pearson correlation computation
│       ├── spearman.ts           # Spearman rank correlation
│       ├── kendall.ts            # Kendall tau computation
│       ├── ewmc.ts               # Exponentially weighted moving correlation
│       ├── cointegration.ts      # Engle-Granger, ADF test, Hurst exponent
│       ├── clustering.ts         # Hierarchical clustering, quasi-diagonalization
│       ├── z-score.ts            # Z-score, spread, hedge ratio
│       └── types.ts              # CorrelationMatrix, CorrelationMethod, etc.
├── workers/
│   ├── correlation-worker.ts     # Web Worker for matrix computation
│   └── cointegration-worker.ts   # Web Worker for on-demand cointegration
├── stores/
│   └── correlation-store.ts      # Zustand store for settings, alerts, state
├── components/
│   └── correlation/
│       ├── correlation-matrix.tsx       # Main matrix/heatmap component
│       ├── correlation-cell.tsx         # Individual cell with sparkline
│       ├── correlation-toolbar.tsx      # Timeframe, method, filter controls
│       ├── correlation-dendrogram.tsx   # Cluster visualization
│       ├── spread-chart.tsx             # Pair spread chart panel
│       ├── pair-detail-panel.tsx        # Detailed pair analysis
│       └── correlation-alerts.tsx       # Alert configuration and history
└── lib/
    └── correlation/
        ├── ring-buffer.ts        # Efficient sliding window data structure
        ├── format-correlation.ts # Display formatting utilities
        └── color-scale.ts        # Correlation-to-color mapping
```

### 6.2 Core Data Types

```typescript
type CorrelationMethod = "pearson" | "spearman" | "kendall" | "ewmc"

type Timeframe = "1h" | "4h" | "1d" | "7d" | "30d" | "90d"

interface CorrelationResult {
  asset1: string
  asset2: string
  coefficient: string      // keep as string per Hyperliquid data principles
  pValue: string | null    // null if not computed
  method: CorrelationMethod
  timeframe: Timeframe
  timestamp: number
}

interface CorrelationMatrix {
  assets: string[]
  coefficients: Float64Array  // flattened N×N matrix
  method: CorrelationMethod
  timeframe: Timeframe
  computedAt: number
}

interface PairAnalysis {
  pair: [string, string]
  correlation: CorrelationResult
  cointegration: {
    pValue: string
    adfStatistic: string
    hedgeRatio: string
    halfLife: string
    hurstExponent: string
  } | null
  zScore: string | null
  spread: Float64Array | null
}

interface ClusterResult {
  clusters: { label: string; assets: string[] }[]
  dendrogram: DendrogramNode
  ordering: number[]  // quasi-diagonalization order
}

interface DendrogramNode {
  left: DendrogramNode | string   // string = leaf (asset name)
  right: DendrogramNode | string
  distance: number
  count: number
}
```

### 6.3 Zustand Store Design

```typescript
interface CorrelationStore {
  // Settings
  method: CorrelationMethod
  timeframe: Timeframe
  assets: string[]
  category: DexCategory | "all"
  sortBy: "name" | "correlation" | "volume" | "change"
  sortDirection: "asc" | "desc"
  showClusters: boolean

  // Data
  matrix: CorrelationMatrix | null
  clusters: ClusterResult | null
  selectedPair: [string, string] | null
  pairAnalysis: PairAnalysis | null

  // Alerts
  alerts: CorrelationAlert[]
  alertConfig: AlertConfig

  // Actions
  setMethod: (method: CorrelationMethod) => void
  setTimeframe: (timeframe: Timeframe) => void
  setAssets: (assets: string[]) => void
  selectPair: (pair: [string, string]) => void
  acknowledgeAlert: (id: string) => void
}
```

### 6.4 Rendering Strategy

**For the Heatmap Grid:**

Given that a 50-asset matrix has 2,500 cells, and each cell may contain a value + mini sparkline:

| Approach | Cell Count Limit | Notes |
|----------|-----------------|-------|
| CSS Grid + DOM | ~400 cells (20x20) | Simple, accessible, good for default |
| HTML Canvas | ~10,000 cells (100x100) | Best performance for large matrices |
| WebGL (via deck.gl or regl) | ~50,000+ cells | Overkill unless 200+ assets |

**Recommendation:** Start with CSS Grid for up to 30 assets (900 cells). If performance becomes an issue or user demand requires 50+ assets, switch the cell rendering to Canvas while keeping the axis labels in DOM for accessibility.

**Virtualization:** For large matrices, only render visible cells. Use a scroll container with virtual rows/columns.

**React Component Pattern:**

```tsx
// correlation-matrix.tsx
interface Props {
  matrix: CorrelationMatrix
  clusters: ClusterResult | null
  onCellClick: (pair: [string, string]) => void
}

function CorrelationMatrix({ matrix, clusters, onCellClick }: Props) {
  const ordering = clusters?.ordering ?? matrix.assets.map((_, i) => i)
  const orderedAssets = ordering.map(i => matrix.assets[i])
  // render grid with orderedAssets as both row and column headers
  // each cell reads matrix.coefficients[i * N + j]
}
```

### 6.5 Color Scale Implementation

```typescript
// color-scale.ts
function correlationToColor(value: number, scheme: "diverging" | "sequential" = "diverging"): string {
  // Clamp to [-1, 1]
  const clamped = Math.max(-1, Math.min(1, value))

  if (scheme === "diverging") {
    // Blue (negative) → White (zero) → Red (positive)
    // Using OKLCH for perceptual uniformity
    const lightness = 0.95 - Math.abs(clamped) * 0.35
    const chroma = Math.abs(clamped) * 0.15
    const hue = clamped >= 0 ? 25 : 250  // red-orange vs blue
    return `oklch(${lightness} ${chroma} ${hue})`
  }
  // ...
}

function correlationToToken(value: number): string {
  const abs = Math.abs(value)
  if (abs > 0.7) return value > 0 ? "market-up" : "market-down"
  if (abs > 0.3) return value > 0 ? "market-up/60" : "market-down/60"
  return "market-neutral"
}
```

### 6.6 Web Worker Communication Protocol

```typescript
// Messages from main thread to worker
type WorkerInput =
  | { type: "init"; assets: string[]; method: CorrelationMethod; windowSize: number }
  | { type: "update"; prices: Float64Array; timestamp: number }
  | { type: "compute"; }
  | { type: "cointegration"; pair: [string, string] }
  | { type: "cluster"; }

// Messages from worker to main thread
type WorkerOutput =
  | { type: "matrix"; data: Float64Array; assets: string[]; computedAt: number }
  | { type: "cointegration"; result: PairAnalysis }
  | { type: "clusters"; result: ClusterResult }
  | { type: "alert"; alert: CorrelationAlert }
  | { type: "progress"; percent: number }
```

### 6.7 Performance Budget

| Operation | Target | Max Acceptable |
|-----------|--------|---------------|
| Matrix computation (20 assets, Pearson) | < 5ms | 20ms |
| Matrix computation (50 assets, Spearman) | < 50ms | 200ms |
| Heatmap render (20x20) | < 16ms (60fps) | 33ms (30fps) |
| Sparkline render (per cell) | < 0.5ms | 2ms |
| Clustering (20 assets) | < 100ms | 500ms |
| Cointegration test (1 pair) | < 200ms | 1s |
| Total UI update cycle | < 100ms | 300ms |

### 6.8 Data Source Integration

**From Hyperliquid WebSocket:**
- Subscribe to `allMids` for real-time mid prices of all assets
- Subscribe to `candle` for historical OHLC data
- Use REST API `/info` endpoint for initial historical data load

**Price Data Buffer:**

```typescript
// ring-buffer.ts
class RingBuffer {
  private buffer: Float64Array
  private head: number = 0
  private size: number = 0
  private capacity: number

  constructor(capacity: number) {
    this.capacity = capacity
    this.buffer = new Float64Array(capacity)
  }

  push(value: number): void {
    this.buffer[this.head] = value
    this.head = (this.head + 1) % this.capacity
    if (this.size < this.capacity) this.size++
  }

  toArray(): Float64Array {
    // return ordered array from oldest to newest
  }
}
```

**Return Calculation:**
```typescript
function logReturns(prices: Float64Array): Float64Array {
  const returns = new Float64Array(prices.length - 1)
  for (let i = 1; i < prices.length; i++) {
    returns[i - 1] = Math.log(prices[i] / prices[i - 1])
  }
  return returns
}
```

### 6.9 Testing Strategy

| Component | Test Type | Tool |
|-----------|----------|------|
| Pearson/Spearman/Kendall | Unit tests with known values | Vitest |
| EWMC | Unit tests against reference implementation | Vitest |
| Ring Buffer | Unit tests for correctness | Vitest |
| Web Worker | Integration tests | Vitest + happy-dom |
| Heatmap render | Visual regression | Playwright |
| Full dashboard | E2E with mock WebSocket | Playwright |
| Numerical accuracy | Property-based tests | fast-check |

---

## 7. Sources & References

### Platform Examples
- [TradingView Correlation Heatmap (Official)](https://www.tradingview.com/script/Y3PnzG2q-Correlation-Heatmap/)
- [TradingView Correlation Matrix + Heatmap by Leviathan](https://www.tradingview.com/script/uy1LMmRg-Correlation-Matrix-Heatmap-By-Leviathan/)
- [TradingView Correlation HeatMap Matrix by TradingFinder](https://www.tradingview.com/script/KJpdu0Rc-Correlation-Heatmap-Matrix-TradingFinder-20-Assets-Variable/)
- [TradingView Multi-Period Correlation](https://www.tradingview.com/script/6fqiSq4Z-Multi-Period-Correlation/)
- [Sharpe AI Crypto Correlation Matrix](https://sharpe.ai/crypto-correlation)
- [Sharpe AI Correlation Tool](https://sharpe.ai/correlation)
- [CryptoDataDownload Correlation Heatmap](https://www.cryptodatadownload.com/analytics/correlation-heatmap/)
- [COIN360 Cryptocurrency Heatmap](https://coin360.com)
- [CoinGecko Cryptocurrency Heatmap](https://www.coingecko.com/en/cryptocurrency-heatmap)
- [CoinCodex Crypto Heatmap](https://coincodex.com/heatmap/)
- [Pineify Market Correlation Matrix](https://pineify.app/market-correlation-matrix)
- [Koyfin Financial Data Analysis](https://www.koyfin.com/)
- [QuantConnect Algorithmic Trading Platform](https://www.quantconnect.com/terminal/)

### MQL5 Reference Implementations
- [MQL5 Trading Tools Part 11: Correlation Matrix Dashboard](https://www.mql5.com/en/articles/20945)
- [MQL5 Trading Tools Part 12: Enhancing with Interactivity](https://www.mql5.com/en/articles/20962)
- [MQL5 Price Action Analysis Part 22: Correlation Dashboard](https://www.mql5.com/en/articles/18052)

### Bloomberg & Institutional
- [Bloomberg PORT Help Guide (PDF)](http://somfin.gmu.edu/courses/fnan311/PORT_guide.pdf)
- [Bloomberg Portfolio & Risk Analytics Brochure](https://data.bloomberglp.com/professional/sites/4/Portfolio_and_Risk_Analytics_Brochure4.pdf)
- [OANDA Correlation Tool](https://www.oanda.com/bvi-en/lab-education/tools/correlation-tool/)

### Correlation Methods & Statistics
- [Pearson vs Spearman Correlation - GeeksforGeeks](https://www.geeksforgeeks.org/maths/pearson-vs-spearman-correlation-coefficient/)
- [Pearson vs Spearman Correlation - Analytics Vidhya](https://www.analyticsvidhya.com/blog/2021/03/comparison-of-pearson-and-spearman-correlation-coefficients/)
- [V-Lab EWMA Correlation Documentation (NYU Stern)](https://vlab.stern.nyu.edu/docs/correlation/EWMA-COV)
- [Exponentially Weighted Moving Models (Stanford, Boyd)](https://web.stanford.edu/~boyd/papers/pdf/ewmm.pdf)
- [EWMA - Corporate Finance Institute](https://corporatefinanceinstitute.com/resources/career-map/sell-side/capital-markets/exponentially-weighted-moving-average-ewma/)
- [Correlation in Portfolio Risk Management](https://www.thepredictiveinvestor.com/p/correlation-in-portfolio-risk-management)
- [TradingView: How to Use Crypto Correlation](https://www.tradingview.com/news/cointelegraph:9835ae7ec094b:0-how-to-use-crypto-correlation-for-better-risk-management/)
- [Mutual Information vs Correlation: Finding Nonlinear Alpha](https://blog.gopenai.com/mutual-information-vs-correlation-finding-nonlinear-alpha-e21ac0d7c836)
- [Mutual Information in Financial Time Series (PLOS One)](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0195941)
- [Analyzing US Stock Correlations with Heat Maps (Twelve Data)](https://twelvedata.com/news/analyzing-the-correlation-of-u-s-stocks-using-heat-maps)

### Pair Trading & Cointegration
- [Constructing Pair Trading Strategy with Z-Scores (Amberdata)](https://blog.amberdata.io/constructing-your-strategy-with-logs-hedge-ratios-and-z-scores)
- [Pairs Trading Basics (QuantInsti)](https://blog.quantinsti.com/pairs-trading-basics/)
- [Pairs Trading Basics (Interactive Brokers)](https://www.interactivebrokers.com/campus/ibkr-quant-news/pairs-trading-basics-correlation-cointegration-and-strategy-part-i/)
- [QuantConnect Intraday Dynamic Pairs Trading](https://www.quantconnect.com/research/15347/intraday-dynamic-pairs-trading-using-correlation-and-cointegration-approach/)
- [Copula-Based Trading of Cointegrated Crypto Pairs (Springer)](https://link.springer.com/article/10.1186/s40854-024-00702-7)
- [Dynamic Cointegration Pairs Trading in Crypto (arXiv)](https://arxiv.org/abs/2109.10662)
- [Statistical Arbitrage on Digital Assets (Medium)](https://medium.com/digital-alpha-research/using-a-pairs-trading-statistical-arbitrage-approach-on-digital-assets-e29b10c6c651)

### Hierarchical Clustering & Portfolio Optimization
- [Hierarchical Clustering and Dendrograms - Portfolio Optimization Book](https://portfoliooptimizationbook.com/book/12.2-hierarchical-clustering-and-dendrograms.html)
- [Hierarchical Clustering-Based Portfolios](https://portfoliooptimizationbook.com/book/12.3-hierarchical-clustering-based-portfolios.html)
- [Hierarchical Risk Parity Portfolio (MATLAB)](https://www.mathworks.com/help/finance/create-hierarchical-risk-parity-portfolio.html)
- [HRP - Hierarchical Risk Parity (BSIC)](https://bsic.it/advanced-portfolio-optimization-hrp-hierarchical-risk-parity/)
- [Stock Correlation Clustering Visualization](https://silburt.github.io/blog/stock_correlation.html)

### Regime Detection & AI
- [Bitcoin Price Regime Shifts: Bayesian MCMC and HMM (MDPI)](https://www.mdpi.com/2227-7390/13/10/1577)
- [HMM for Regime Changes in Bitcoin Markets (AJPAS)](https://journalajpas.com/index.php/AJPAS/article/view/781)
- [Market Regime using Hidden Markov Model (QuantInsti)](https://blog.quantinsti.com/regime-adaptive-trading-python/)
- [Market Regime Change Detection with ML (QuestDB)](https://questdb.com/glossary/market-regime-change-detection-with-ml/)
- [Identifying Market Regimes via Asset Class Correlations (Macrosynergy)](https://macrosynergy.com/research/identifying-market-regimes-via-asset-class-correlations/)
- [Market Regime Classification Using Correlation Networks (UNC)](https://econ.unc.edu/wp-content/uploads/sites/1423/2025/03/2019-Mayo-Zhu_Nam.pdf)
- [AI-Powered Risk Assessment in DeFi (WJARR)](https://wjarr.com/content/leveraging-ai-powered-data-streams-predictive-risk-assessment-cross-protocol-defi-lending)
- [Anomaly Detection in Blockchain (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S209672092400040X)
- [Correlation Breakdowns During Market Volatility (BIS)](https://www.bis.org/publ/confer08k.pdf)
- [Algorithmic Trading via Correlation Analysis (Anodot)](https://www.anodot.com/blog/algotrading-correlation-analysis/)

### Color & Accessibility
- [Color Palettes and Accessibility for Data Viz (Carbon Design)](https://medium.com/carbondesign/color-palettes-and-accessibility-features-for-data-visualization-7869f4874fca)
- [Colorblind-Friendly Palettes (Venngage)](https://venngage.com/blog/color-blind-friendly-palette/)
- [Data Visualization Design Considerations (UC Berkeley)](https://guides.lib.berkeley.edu/data-visualization/design)
- [Leonardo Color Tool](https://leonardocolor.io/)

### React & Rendering
- [Best Heatmap Libraries for React](https://digitalthriveai.com/en-us/resources/web-development/best-heatmap-libraries-react/)
- [Data Visualization Libraries Comparison (Capital One)](https://www.capitalone.com/tech/software-engineering/comparison-data-visualization-libraries-for-react/)
- [React Heatmap with D3](https://www.react-graph-gallery.com/heatmap)
- [Top React Chart Libraries 2026 (Querio)](https://querio.ai/articles/top-react-chart-libraries-data-visualization)
- [Rendering 1M Datapoints with D3 and WebGL](https://blog.scottlogic.com/2020/05/01/rendering-one-million-points-with-d3.html)
- [Web Workers: Parallel Processing (Medium)](https://medium.com/@artemkhrenov/web-workers-parallel-processing-in-the-browser-e4c89e6cad77)
- [Optimizing Performance with Web Workers (Salesforce)](https://engineering.salesforce.com/optimizing-performance-with-web-workers-612b48621d8d/)

### Hyperliquid API
- [Hyperliquid API Documentation](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api)
- [Hyperliquid Perpetuals Info Endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals)
- [Hyperliquid Futures Data (Amberdata)](https://docs.amberdata.io/changelog/hyperliquid-futures-data-now-available)
- [Hummingbot Hyperliquid Integration](https://hummingbot.org/exchanges/hyperliquid/)
