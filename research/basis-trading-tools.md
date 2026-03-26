# Basis Trading in Crypto Perps: Research & Feature Blueprint

## 1. What Is Basis Trading?

Basis = futures price minus spot price. In crypto, "basis trading" refers to a family of delta-neutral strategies that capture the spread between spot and derivatives prices — or between derivatives on different venues — without taking directional risk.

Three core variants:

| Strategy | Long Leg | Short Leg | Yield Source |
|---|---|---|---|
| **Cash-and-carry** | Spot (buy & hold) | Perp short | Funding payments |
| **Calendar spread** | Far-dated future | Near-dated future | Time-value decay / basis convergence |
| **Cross-venue funding arb** | Perp long (venue A, negative/low funding) | Perp short (venue B, positive/high funding) | Funding rate differential |

---

## 2. Mechanics Deep Dive

### 2.1 Cash-and-Carry (Spot-Perp Basis)

The dominant retail and semi-pro strategy:

1. **Buy spot** — acquire the underlying (e.g., 1 ETH on Hyperliquid spot or self-custody).
2. **Short perp** — open an equal-notional short on a perp venue.
3. **Collect funding** — when funding is positive (more longs than shorts), shorts receive payments. This is the primary yield source.
4. **Unwind** — close both legs simultaneously when funding flips or the basis compresses.

**Return math:**
- Funding is paid hourly on Hyperliquid (vs 8h on Binance/Bybit).
- A 0.01% per-8h rate = ~10.95% APY (0.01% x 3 x 365).
- Hyperliquid's hourly payments compound faster: 0.00125%/hr x 24 x 365 = ~10.95% APY equivalent but with 24 compounding events/day.
- In bull markets, rates routinely hit 0.03-0.05% per 8h = 30-55% APY.
- SOL and XRP front-month basis spiked to 50%+ annualized in mid-2025.

**Historical context (BIS Working Paper 1087):**
- BTC carry reached or exceeded 40% p.a. during three distinct periods (early 2019, early 2020, March 2021).
- CME carry ranged from -50% (FTX collapse, Nov 2022) to +45% (pre-spot ETF, Jan 2024).
- 2025 H1: Short-BitMEX / long-Hyperliquid delivered ~15.6% annualized on SOL and ~15.7% on AVAX before leverage, with 2-3x leverage pushing toward 25-30%.

### 2.2 Calendar Spreads

Simultaneously buy and sell futures contracts on the same asset with different expiration dates:

- **Bull calendar:** Long far-dated, short near-dated — profits when basis widens (contango steepening).
- **Bear calendar:** Short far-dated, long near-dated — profits when basis flattens or inverts.
- Crypto-specific edge: extreme volatility means time-value decay and basis swings are much larger than in TradFi, creating more frequent opportunities.
- Calendar spreads are less common on Hyperliquid since it primarily offers perps (no expiring futures), but they can be constructed cross-venue (e.g., Hyperliquid perp vs Deribit/CME quarterly future).

### 2.3 Cross-Venue Funding Arbitrage

Each exchange calculates funding independently. When one platform shows stronger long demand than another, rates diverge:

1. **Monitor funding** across Hyperliquid, Binance, Bybit, OKX, dYdX, BitMEX.
2. **Identify divergence** > 0.01% per 8h (the minimum profitable threshold after fees).
3. **Go long** on the venue with lower/negative funding, **short** on the venue with higher positive funding.
4. **Collect the differential** until rates converge.

Profitability threshold on Hyperliquid: funding rate > 0.11%/hr (with maker orders) to overcome fees. Tactical approach: enter 10-15 minutes before funding payment, exit after — requires rates > 0.15%/hr and tight spreads.

---

## 3. Risk Framework

### 3.1 Primary Risks

| Risk | Description | Mitigation |
|---|---|---|
| **Funding flip** | Rates turn negative in bear markets; shorts pay longs | Monitor 24h/7d funding averages, set alerts, auto-unwind triggers |
| **Liquidation** | Perp leg gets liquidated during a price spike despite being hedged | Use low leverage (1-2x), maintain buffer margin, set stop-loss on perp side |
| **Execution slippage** | Legs don't fill simultaneously; creates temporary directional exposure | Use atomic/simultaneous execution, limit orders, or TWAP entry |
| **Exchange/counterparty risk** | CEX insolvency, bridge exploit, smart contract bug | Prefer on-chain venues (Hyperliquid), diversify across venues |
| **Basis blowout** | Extreme dislocation between spot and perp during black swan events | Position sizing limits, max drawdown circuit breakers |
| **Withdrawal delays** | Capital locked when needing to rebalance across venues | Pre-stage capital on both legs, monitor bridge/withdrawal times |

### 3.2 Funding Rate Regime Analysis

- **Sustained positive (>48h):** Indicates entrenched long positioning. Good for basis traders but watch for liquidation cascades.
- **Elevated + rising OI:** Overcrowded long trade, vulnerable to pullback. Basis trade is profitable but risky — tighten stops.
- **Negative sustained:** Rare; typically during capitulation. Basis trade reverses (long perp, short spot via lending).
- **Divergence between funding and price:** Prices rising while funding turns negative suggests smart accumulation — potential regime change incoming.

---

## 4. Hyperliquid-Specific Opportunities

### 4.1 Platform Advantages for Basis Trading

- **Hourly funding** — 24 payments/day vs 3 on Binance. More granular carry capture, faster compounding.
- **Funding cap: 4%/hr** — Much higher than Binance's variable caps. Extreme dislocations are more profitable to capture.
- **On-chain order book** — Full transparency on orders, positions, and liquidations. No exchange manipulation risk.
- **Sub-second finality** — Execution speed approaching CEX levels, critical for simultaneous leg entry.
- **USDC-settled** — All perps settled in USDC simplifies accounting and margin management.
- **Spot + perp on same venue** — Enables same-venue cash-and-carry with atomic execution potential.
- **HIP-2 (Hyperliquidity)** — Autonomous market-making integrated at L1 consensus level guarantees 0.3% spread every 3 seconds for spot markets. Ensures spot leg liquidity.
- **Vaults** — Basis strategies can be deployed as vaults, allowing others to deposit and share returns.
- **Builder codes** — Frontends can capture up to 1% on spot and 0.1% on perps for facilitating trades.

### 4.2 Available API Infrastructure

| Endpoint | Use Case |
|---|---|
| `POST /info` (type: `meta`) | Fetch all available markets, funding rates, mark prices |
| `POST /info` (type: `fundingHistory`) | Historical funding rates per asset |
| `POST /info` (type: `allMids`) | Current mid prices for all assets |
| `POST /info` (type: `userState`) | Account state, positions, margin |
| `wss://api.hyperliquid.xyz/ws` | Real-time order book, trades, funding updates |
| `POST /exchange` | Place orders (market, limit, trigger), cancel, modify |
| Funding comparison UI | `app.hyperliquid.xyz/fundingComparison` — native cross-asset funding comparison |

### 4.3 Cross-Venue Pairings

Hyperliquid's "clean price" status (deep liquidity, predictable funding, on-chain transparency) makes it an ideal leg for cross-venue arb:

- **HL perp vs Binance perp** — Most liquid pairing. HL funding often differs from Binance by 0.005-0.02%.
- **HL perp vs HL spot** — Same-venue cash-and-carry. Minimizes counterparty risk and withdrawal delays.
- **HL perp vs Deribit quarterly** — Calendar-like spread using HL as the perp leg and Deribit as the expiring future.
- **HL perp vs CEX spot** — For traders who want spot on a CEX for faster fiat off-ramp.

---

## 5. Tools Used by Professional Basis Traders (2025-2026)

### 5.1 Monitoring & Analytics

| Tool | Function |
|---|---|
| **CoinGlass** | Funding rate comparison across exchanges, heatmaps, OI data, liquidation maps. Industry standard. |
| **Laevitas** | Quantitative derivatives analytics — basis curves, term structure, vol surface, skew data. |
| **Velo Data** | Institutional-grade derivatives dashboards, funding rate time series, basis analysis. |
| **CryptoQuant** | On-chain flows, exchange reserves, whale tracking — contextualizes basis regime shifts. |
| **Hyperliquid native** | `/fundingComparison` page for cross-asset HL funding rates; `/info` API for programmatic access. |
| **Dune Analytics** | Custom dashboards for on-chain Hyperliquid data (positions, liquidations, vault performance). |
| **TradingView** | Charting with custom indicators for basis visualization. |

### 5.2 Execution & Automation

| Tool | Function |
|---|---|
| **Hummingbot** | Open-source bot framework with built-in funding rate arbitrage strategy. Native Hyperliquid connector. Supports vault-based execution. |
| **Paradigm** | Institutional block trading across venues. Pre-trade negotiation, post-trade settlement. |
| **BitSpreader** | Low-latency spread trading with auto-spreading across exchanges. Cloud-based. |
| **Custom Python bots** | Most pro desks run custom scripts using Hyperliquid Python SDK (`hyperliquid-python-sdk`). |
| **Chainstack nodes** | Dedicated Hyperliquid RPC endpoints for lower latency API access. |

### 5.3 Risk Management

| Tool | Function |
|---|---|
| **CoinGlass Pro** | Real-time funding + OI + liquidation composite dashboards. |
| **Arkham Intelligence** | Wallet tracking — see what whales/funds are doing with their basis positions. |
| **Portfolio trackers (DeBank, CoinStats)** | Cross-venue position aggregation for monitoring total delta exposure. |
| **Custom spreadsheets/scripts** | P&L tracking, margin utilization, funding accrual logs. |

---

## 6. Feature Ideas: HypeTerminal Basis Trading Monitor & Executor

### 6.1 Basis Monitor Dashboard

**Core metrics panel:**
- Real-time funding rate for every Hyperliquid perp (hourly rate + annualized APY).
- Cross-exchange funding comparison matrix (HL vs Binance vs Bybit vs OKX vs dYdX).
- Funding rate heatmap (assets x time, color-coded by rate intensity).
- Historical funding chart per asset (1h, 8h, 1d, 7d, 30d averages).
- Cumulative funding earned over rolling periods.
- Basis (perp price - spot price) as absolute value and percentage.

**Opportunity scanner:**
- Auto-detect when funding rate exceeds configurable threshold (e.g., >0.01%/8h).
- Auto-detect cross-venue funding divergence above threshold.
- Rank assets by annualized carry opportunity (funding rate x leverage factor).
- "Best trades right now" widget showing top 5 basis opportunities across assets.
- Calendar spread opportunities when cross-referencing HL perps with Deribit quarterly futures.
- Alert system: push/telegram/webhook notifications when opportunities appear or positions need attention.

**Regime indicators:**
- Funding regime classification: sustained positive, sustained negative, volatile, mean-reverting.
- Open interest overlay — show OI alongside funding to identify crowded trades.
- Liquidation proximity indicators — how close large positions are to liquidation (from on-chain data).
- Sentiment divergence: funding direction vs price direction (early warning for regime shifts).

### 6.2 Basis Trade Executor

**One-click basis trade setup:**
- Select asset, pick strategy type (cash-and-carry, cross-venue, or manual).
- Configure position size (USDC amount), max leverage, funding threshold to enter/exit.
- Simultaneous leg execution: atomic entry for spot buy + perp short on HL (or cross-venue via API).
- Slippage protection: configurable max slippage per leg, abort if exceeded.
- Preview panel showing estimated APY, margin requirements, liquidation price, break-even funding rate.

**Position management:**
- Live P&L tracker for each basis position (funding accrued, unrealized basis P&L, fees paid).
- Delta monitor — show net exposure (should be ~0 for basis trades). Alert if delta drifts.
- Margin health indicator per position.
- Auto-rebalance: if spot/perp notional diverges beyond threshold, auto-adjust to restore delta neutrality.
- Partial unwind: close a percentage of both legs proportionally.

**Auto-pilot rules:**
- Auto-enter when funding exceeds threshold for N consecutive hours.
- Auto-exit when funding drops below threshold or flips negative.
- Auto-exit on max drawdown trigger.
- Auto-rotate: close position on asset A, open on asset B when asset B's carry exceeds A's by configurable margin.
- Compounding mode: reinvest accrued funding into position size.
- Schedule: only run during specific hours/days (e.g., avoid entries around volatile macro events).

### 6.3 Cross-Venue Arbitrage Module

**Multi-exchange integration:**
- Connect Hyperliquid + Binance + Bybit + OKX + dYdX accounts.
- Unified balance/position view across all connected venues.
- Cross-venue order routing: place both legs across venues from a single interface.
- Latency monitor: show round-trip times to each venue's API.

**Funding rate arbitrage workflow:**
- Scan for funding divergences across all connected venues.
- One-click entry: long on low-funding venue, short on high-funding venue.
- Continuous monitoring of the funding differential.
- Auto-close when differential compresses below break-even (accounting for fees on both venues).

### 6.4 Vault Integration

**Basis strategy vaults:**
- Package basis trading strategies as Hyperliquid Vaults.
- Dashboard showing vault performance: cumulative return, Sharpe ratio, max drawdown, funding earned.
- Depositor management: track deposits/withdrawals, fee distribution.
- Strategy transparency: show open positions, historical trades, funding accrual to depositors.

### 6.5 Analytics & Backtesting

**Historical analysis:**
- Backtest cash-and-carry returns for any asset over any historical period.
- Simulate different leverage levels, entry/exit thresholds, and position sizing.
- Compare returns across strategies: cash-and-carry vs cross-venue vs calendar spreads.
- Factor in historical fee structures and slippage estimates.

**Risk analytics:**
- Maximum adverse excursion (MAE) for basis positions — worst-case unrealized loss before recovery.
- Funding rate distribution analysis (mean, std dev, skew, kurtosis) per asset.
- Correlation analysis: which assets' funding rates move together vs independently (diversification benefit).
- Stress test: simulate returns during historical black swan events (Luna, FTX, etc.).

### 6.6 UI/UX Concepts

**Dashboard layout:**
- Top bar: total basis P&L across all positions, active positions count, current best opportunity.
- Left panel: asset selector with funding rate spark lines.
- Center: selected asset deep-dive (funding chart, basis chart, OI, execution panel).
- Right panel: active positions list with live P&L and delta exposure.
- Bottom: alerts feed and execution log.

**Key interactions:**
- Click any asset in the opportunity scanner to see full analysis + one-click trade setup.
- Drag to adjust position size, leverage sliders update estimated APY and liquidation price in real-time.
- Toggle between "Monitor" (read-only) and "Execute" (trading enabled) modes.
- Dark mode optimized for extended monitoring sessions (consistent with HypeTerminal design system).

---

## 7. Competitive Landscape

| Product | Strengths | Gaps HypeTerminal Can Fill |
|---|---|---|
| **CoinGlass** | Best funding rate data aggregation | No execution, no Hyperliquid-native features, no vault integration |
| **Hummingbot** | Open-source bot with HL connector | CLI-only, no visual dashboard, complex configuration |
| **Paradigm** | Institutional block trading | No retail access, no basis-specific tooling |
| **BitSpreader** | Low-latency spread execution | No Hyperliquid support, no funding-focused features |
| **Hyperliquid native UI** | Funding comparison page | No cross-venue comparison, no automation, no position management |
| **Laevitas** | Deep derivatives analytics | No execution, limited DEX data |

**HypeTerminal's edge:** Combine monitoring + execution + vault management in a single Hyperliquid-native interface. No existing tool offers all three with a polished UI. The combination of real-time basis monitoring with one-click execution and vault packaging is a clear gap in the market.

---

## 8. Implementation Priority

### Phase 1: Monitor (Read-Only)
1. Funding rate dashboard (all HL assets, hourly + annualized).
2. Cross-exchange funding comparison (HL vs top 3 CEXs).
3. Opportunity scanner with configurable alerts.
4. Historical funding charts and basis visualization.

### Phase 2: Single-Venue Executor
5. Cash-and-carry trade builder (HL spot + HL perp).
6. Position management (live P&L, delta monitor, margin health).
7. Auto-exit rules (funding threshold, max drawdown).

### Phase 3: Cross-Venue & Advanced
8. Multi-exchange account connection.
9. Cross-venue funding arb execution.
10. Backtesting engine.
11. Vault-based strategy packaging.

---

## Sources

- [CME Group: Spot ETFs Give Rise to Crypto Basis Trading](https://www.cmegroup.com/openmarkets/equity-index/2025/Spot-ETFs-Give-Rise-to-Crypto-Basis-Trading.html)
- [AlphaNode: Crypto Basis Trade Explained](https://alphanode.global/insights/crypto-basis-trade-guide/)
- [BIS Working Paper 1087: Crypto Carry](https://www.bis.org/publ/work1087.pdf)
- [BSIC: Perpetual Future Arbitrage Mechanics](https://bsic.it/perpetual-complexity-an-introduction-to-perpetual-future-arbitrage-mechanics-part-1/)
- [BitMEX: Harvest Funding Payments on Hyperliquid](https://www.bitmex.com/blog/harvest-funding-payments-on-hyperliquid)
- [Chainspot: Basis, Funding & Cross-Venue Arbitrage on Hyperliquid](https://news.chainspot.io/2025/11/18/basis-funding-cross-venue-arbitrage-trading-hyperliquid-vs-cex-and-l2-dexs/)
- [Hummingbot: Funding Rate Arbitrage on Hyperliquid](https://hummingbot.org/blog/funding-rate-arbitrage-and-creating-vaults-on-hyperliquid/)
- [Chainstack: Implementing Spot-Perp Funding Rate Arbitrage](https://docs.chainstack.com/docs/hyperliquid-funding-rate-arbitrage)
- [Hyperliquid Docs: Funding](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding)
- [Hyperliquid Docs: WebSocket API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket)
- [Hyperliquid Docs: HIP-2 Hyperliquidity](https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-2-hyperliquidity)
- [CoinGlass: Funding Rate Data](https://www.coinglass.com/FundingRate)
- [Laevitas: Crypto Derivatives Analytics](https://app.laevitas.ch/)
- [Cube Exchange: What is Basis?](https://www.cube.exchange/what-is/basis)
- [Mudrex: Calendar Spread Trading for Crypto Futures](https://mudrex.com/learn/calendar-spread-trading-for-crypto-futures/)
- [CoinGape: Crypto Perpetual Futures Trading Strategies](https://coingape.com/blog/crypto-perpetual-futures-trading-strategies/)
- [Wharton: Perpetual Futures Pricing (Ackerer, Hugonnier, Jermann)](https://finance.wharton.upenn.edu/~jermann/AHJ-main-10.pdf)
- [Hyperliquid: Funding Comparison UI](https://app.hyperliquid.xyz/fundingComparison)
