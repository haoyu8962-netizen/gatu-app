# Synthetic Options & Volatility Analytics for HypeTerminal

## Executive Summary

Hyperliquid has the liquidity, execution speed, and order primitives to support synthetic options — but no native options product. With HIP-4 Outcomes on testnet and Deribit's $2.9B Coinbase acquisition validating the market, 2026 is the inflection year for options-like products on perp-native platforms. HypeTerminal can fill this gap with two features: a **Volatility Dashboard** (analytics) and a **Synthetic Options Builder** (execution).

---

## 1. Hyperliquid Primitives Available

### Order Types (from `src/lib/trade/order-types.ts`)

| Primitive | Synthetic Options Use |
|-----------|----------------------|
| Market / Limit | Position entry |
| Stop Market / Stop Limit | Downside cap ("strike") |
| Take Profit Market / Limit | Upside cap (spread construction) |
| Position TP/SL (`isPositionTpsl`) | Auto-attach risk bounds to position |
| TWAP | Gradual delta-hedging |
| Scale Orders | Layered entry = synthetic gamma |
| Reduce-Only | Exit-only triggers for legs |

### Data Endpoints

| Endpoint | Use |
|----------|-----|
| `candleSnapshot` (1m → 1M intervals) | Realized vol calculation |
| `metaAndAssetCtxs` (funding, OI, markPx, impactPxs) | Funding-implied vol, skew proxy |
| `fundingHistory` | Historical vol regime analysis |
| `predictedFundings` (cross-venue) | Funding term structure, arb signals |
| `perpsAtOpenInterestCap` | Vol catalyst detection |
| `liquidatable` | Liquidation heatmap data |
| `l2Book` (with `nSigFigs` aggregation) | Depth-based skew proxy |

### Existing Hooks (from `@nktkas/hyperliquid`)

**Data**: `useInfoCandleSnapshot`, `useInfoMetaAndAssetCtxs`, `useInfoFundingHistory`, `useInfoPredictedFundings`, `useInfoPerpsAtOpenInterestCap`, `useInfoLiquidatable`

**Real-time**: `useSubAssetCtxs`, `useSubL2Book`, `useSubTrades`, `useSubCandle`, `useSubClearinghouseState`, `useSubOpenOrders`, `useSubUserFills`, `useSubUserFundings`

**Execution**: `useExchangeOrder`, `useExchangeBatchModify`, `useExchangeUpdateLeverage`, `useExchangeUpdateIsolatedMargin`, `useExchangeCancel`, `useExchangeScheduleCancel`

---

## 2. Synthetic Options Construction

### Core Strategies

#### Synthetic Long Call (Bullish, Capped Downside)
- **Build**: Long perp + Stop Market below entry
- **Example**: Long 1 BTC at $60,000, SL at $58,000
- **Payoff**: Max loss = $2,000 ("premium"), unlimited upside
- **HL implementation**: `market` order + `stopMarket` with `isPositionTpsl: true, reduceOnly: true`

#### Synthetic Long Put (Bearish, Capped Downside)
- **Build**: Short perp + Stop Market above entry
- **Example**: Short 1 BTC at $60,000, SL at $62,000
- **Payoff**: Max loss = $2,000, unlimited downside profit

#### Synthetic Straddle (Volatility Bet)
- **Build**: Breakout entries in both directions
- Stop Buy at $61,000 (SL at $60,500) + Stop Sell at $59,000 (SL at $59,500)
- First breakout direction triggers, other leg provides hedge
- **Cost**: Sum of stop distances on both legs = "premium"

#### Synthetic Strangle
- Same as straddle, wider entry points (cheaper, needs bigger move)
- Stop Buy at $63,000, Stop Sell at $57,000

#### Bull/Bear Spread Approximation
- **Bull call**: Long perp with SL below + TP above (bounded profit, bounded loss)
- **Bear put**: Short perp with SL above + TP below

#### Iron Condor Approximation
- Combine bull put + bear call with narrow profit zone
- Two smaller positions creating range-bound payoff

#### Covered Call Equivalent (Funding Yield)
- Hold spot on HyperEVM + short partial perp
- TP on short leg = "call strike"
- Collect positive funding on short leg

#### Delta-Neutral Funding Arbitrage
- Long spot + short perp (basis trade)
- Revenue: funding payments (up to 4%/hr cap on HL in extreme cases)
- `predictedFundings` endpoint enables cross-venue funding arb identification

### Limitations vs Real Options

| Factor | Real Options | Synthetic (Perps + Stops) |
|--------|-------------|--------------------------|
| Convexity | True non-linear payoff | Linear until stop triggers |
| Gap Risk | Premium = guaranteed max loss | Stop can slip in fast markets |
| Time Decay | Defined theta, known upfront | Ongoing funding, unpredictable |
| Greeks | Well-defined, continuous | Approximated, discontinuous |
| Liquidation | No liquidation on long options | Can be liquidated before stop triggers |
| Vega | Benefits from vol increase | No vega; must manually re-hedge |

---

## 3. Volatility Dashboard — Specification

### 3.1 Realized Volatility Panel

**Timeframes**: 1h, 4h, 1d, 7d, 30d, 90d

**Estimators**:

1. **Close-to-Close** (primary):
   ```
   RV = sqrt(1/(N-1) × Σ(ln(close_i / close_{i-1})²)) × sqrt(periods_per_year)
   ```

2. **Parkinson High-Low** (more efficient):
   ```
   PV = sqrt(1/(4×N×ln2) × Σ(ln(high_i/low_i)²)) × sqrt(periods_per_year)
   ```

3. **Garman-Klass OHLC** (most efficient):
   ```
   GK = sqrt(1/N × Σ(0.5×(ln(h/l))² − (2ln2−1)×(ln(c/o))²)) × sqrt(periods_per_year)
   ```

**Annualization**: Crypto trades 24/7/365 → use 365 days (not 252).

**Data source**: `useInfoCandleSnapshot` with appropriate interval per timeframe.

**Display**: Annualized %, time series chart of rolling RV at each timeframe.

### 3.2 Funding-Implied Volatility

**Core insight**: High funding magnitude = market pricing in directional vol.

```
Annualized_Funding = hourly_rate × 24 × 365
Vol_proxy = sqrt(abs(Annualized_Funding) × 2)
```

**IV/RV Ratio**: When > 1 → market expects vol expansion. When < 1 → vol compression expected.

**Cross-venue funding spread** (from `predictedFundings`): HL funding >> Binance funding signals HL-specific positioning/demand.

### 3.3 Vol Regime Indicator

Classify against trailing 90-day RV distribution:

| Regime | Percentile | Label |
|--------|-----------|-------|
| Low | < 25th | Compression — breakout likely |
| Medium | 25th–75th | Normal |
| High | 75th–95th | Elevated — trend/event-driven |
| Extreme | > 95th | Crisis/capitulation — mean reversion likely |

**Display**: Color-coded gauge (green → yellow → orange → red).

### 3.4 Vol Term Structure

Plot RV at different lookback windows (1h, 4h, 1d, 7d, 30d) on same chart.

- **Contango** (short < long): Normal, calm market
- **Backwardation** (short > long): Recent shock, event-driven
- Overlay: Funding-implied vol as forward-looking data point

### 3.5 Vol Smile Proxy (Order Book Depth)

Using L2 book data, measure bid vs ask depth at 1%, 2%, 5%, 10% from mid:

```
Skew_proxy = (ask_depth − bid_depth) / (ask_depth + bid_depth)
```

- Symmetric → flat smile
- More bid depth → put skew (downside protection demand)
- More ask depth → call skew (upside demand)

**Display**: Depth asymmetry chart resembling vol smile curve.

### 3.6 Historical Vol Percentile Rank

Current RV ranked against trailing 1-year distribution.

> "Current 30d RV of 45% is at the 72nd percentile of the past year"

**Display**: Histogram of RV distribution with current value highlighted.

### 3.7 Correlation Matrix

Rolling correlations between top assets (BTC, ETH, SOL, etc.).

- **High correlation** (> 0.8): Systematic risk, diversification fails
- **Low correlation** (< 0.3): Idiosyncratic moves, pair trading opportunities

**Display**: Heatmap matrix with color gradient.

### 3.8 Liquidation Heatmap

Map price levels where liquidations cluster:

- Dense zone above price → short squeeze fuel (upward vol catalyst)
- Dense zone below price → long cascade risk (downward vol catalyst)

**Data**: `useInfoLiquidatable` + clearinghouse state analysis.

**Display**: Heat zones overlaid on price chart.

---

## 4. Synthetic Options Builder — Specification

### 4.1 Strategy Templates

**Basic**:
- Synthetic Long Call — asset, entry, stop distance ("strike"), size
- Synthetic Long Put — reversed direction
- Synthetic Straddle — center price, wing width, size per leg
- Synthetic Strangle — wider wings

**Advanced**:
- Bull/Bear Spread — bounded profit + bounded loss
- Iron Condor — range-bound profit zone
- Funding Yield (Covered Call) — spot + partial short perp
- Calendar Spread Proxy — different stop distances per leg

### 4.2 Greeks Approximation

| Greek | Perp Approximation | Source |
|-------|-------------------|--------|
| Delta | `position_size / notional` (always ±1 per unit) | Position data |
| Gamma | Zero for perps. Proxy: scale order layering changes effective delta as fills occur | Scale order config |
| Theta | `daily_funding_rate × notional` (cost of carry) | `useSubUserFundings` |
| Vega | None direct. Proxy: funding rate sensitivity to vol changes | Funding history analysis |
| Rho | Funding rate IS the interest rate component | Asset context |

### 4.3 P&L Simulation

- **Payoff diagram**: Price (x) vs P&L (y) showing kinked payoff at stop levels
- **Comparison overlay**: Ideal option payoff (dashed) vs synthetic (solid)
- **Time erosion**: Show funding cost impact over 1d, 7d, 30d
- **Monte Carlo**: Simulate price paths with gap risk probability distribution

### 4.4 Auto Stop-Loss Placement

Given user inputs (max loss, position size, current price):

```
stop_distance = max_loss / position_size
stop_price = entry_price − stop_distance  // for longs
```

Logic:
- Round to valid tick size
- Warn if stop < 0.5% from entry (noise trigger risk)
- Warn if stop > 10% from entry (large max loss, weak payoff shaping)
- Suggest placement at order book support/resistance from L2 depth

### 4.5 Risk Warnings (Required Display)

1. **Gap risk**: Stops are not guaranteed. Fast markets can gap through stop levels.
2. **Funding drag**: "Position costs ~$X/day at current funding. Over 30d, breakeven shifts by Y%."
3. **Liquidation before stop**: "At current leverage, liquidation at $X is BEFORE stop at $Y. Reduce leverage."
4. **Slippage**: "At your size, market stop would experience ~Z% slippage based on current book depth."
5. **No convexity**: "Unlike real options, this position has linear payoff — no acceleration of gains."

---

## 5. Market Context — 2026 Demand

### Why Now

- **Deribit acquisition** ($2.9B by Coinbase) validates crypto options as a major market
- **DeFi derivatives** market cap grew 654% in 2025, reaching ~$18.9B
- **Perp DEX share** now 4-6% of global perpetual volume (from 1% in 2022)
- **RWA perpetuals** surged 162% from $11.8B → $31B in a single month (Dec 2025 → Jan 2026)
- **S&P 500 licensed** for perpetual contracts on Hyperliquid (March 2026)
- **HIP-4 Outcomes** on testnet — HL itself is building bounded/options-like instruments

### The Gap

| Platform | Options | Liquidity | Self-Custody | UX |
|----------|---------|-----------|-------------|-----|
| Deribit | Full chain | Deep | No (CEX) | Pro |
| Lyra/Derive | AMM-based | Thin | Yes | Complex |
| Aevo | Orderbook | Medium | Hybrid | Good |
| Hyperliquid | None (perps only) | Very deep | Yes | Good |
| **HypeTerminal** | **Synthetic via perps** | **HL liquidity** | **Yes** | **Guided** |

### Competitive Advantage

HypeTerminal's synthetic options builder would be **the first UI layer** that turns Hyperliquid's perp primitives into structured, risk-defined positions — without requiring protocol changes. This captures the demand for:

1. Defined-risk positions without full options complexity
2. Funding rate monetization strategies (selling vol)
3. Institutional-grade risk bounding (required for fund mandates)
4. Volatility analytics currently unavailable on any perp DEX dashboard

---

## 6. Implementation Priority

### Phase 1 — Volatility Dashboard (analytics, no execution)
1. Realized volatility panel (multi-timeframe, Garman-Klass)
2. Funding-implied vol + IV/RV ratio
3. Vol regime indicator
4. Historical vol percentile rank

### Phase 2 — Enhanced Analytics
5. Vol term structure chart
6. Correlation matrix heatmap
7. Order book depth skew (vol smile proxy)
8. Liquidation heatmap overlay

### Phase 3 — Synthetic Options Builder (execution)
9. Strategy templates (call, put, straddle)
10. Payoff diagram with funding cost overlay
11. Auto stop-loss placement with risk warnings
12. Greeks approximation display

### Phase 4 — Advanced Strategies
13. Multi-leg strategies (spreads, iron condor)
14. Funding yield / covered call builder
15. Monte Carlo P&L simulation
16. Delta-hedging TWAP automation

---

## References

- [Hyperliquid Perpetuals API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals)
- [Hyperliquid Funding Mechanics](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding)
- [HIP-4 Outcomes Announcement](https://www.coindesk.com/markets/2026/02/02/hyperliquid-s-hype-higher-by-10-on-plans-to-add-prediction-markets-and-options)
- [HIP-4 Technical Details](https://www.blocmates.com/articles/hip-4-explained-why-hyperliquid-is-cryptos-only-glimmer-of-hope)
- [S&P 500 Licensed for HL Perps](https://www.prnewswire.com/news-releases/sp-dow-jones-indices-licenses-sp-500-to-tradexyz-for-perpetual-contracts-on-hyperliquid-302717487.html)
- [DeFi Derivatives Market 2025 Report](https://pi42.com/blog/crypto-derivatives-market-2025-report/)
- [Perp DEX Market Share Growth](https://defi-planet.com/2025/12/perp-dex-season-how-on-chain-derivatives-quietly-ate-the-casino/)
- [Deribit Acquisition by Coinbase](https://www.theblock.co/post/388023/hyperliquid-outcome-prediction-markets-limited-risk-options-trading)
