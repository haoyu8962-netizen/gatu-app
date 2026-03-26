# Funding Rate Arbitrage Automation: Manual Workflows, Pain Points & Blueprint

Research into how traders currently monitor and execute funding rate arb manually across Hyperliquid & other DEXs, with real user examples from 2025-2026 and a blueprint for automated Funding Scanner + Executor in HypeTerminal.

---

## 1. Current Manual Workflows

### The 5-Step Manual Process

**Step 1 — Scan for rate divergences.** Traders open CoinGlass, Loris Tools, or Sharpe AI to view a cross-exchange funding rate matrix. They look for divergences above ~0.01% per 8h (minimum profitable threshold after fees). Some run custom Python scripts polling exchange APIs into Google Sheets.

**Step 2 — Validate liquidity.** Switch to another tab to check order book depth and spreads (<0.05%) per asset per exchange. Comparing 5 assets across 3 venues = 15 separate order book checks.

**Step 3 — Calculate profitability.** Open a spreadsheet to compute gross funding income per interval, fee costs on both legs, break-even holding period, and annualized yield at different leverage levels.

**Step 4 — Execute both legs simultaneously.** Open exchange UIs for both venues. Place long on one, short on the other. Both must fill within seconds to avoid unhedged directional exposure.

**Step 5 — Monitor and manage.** Keep multiple tabs open for position P&L, funding rate changes, margin health, ADL rankings, and alerts. Institutional setups require hourly balance snapshots, full transaction reconciliation, and real-time rule violation alerts across Telegram/Slack/SMS.

### Tab Count

A typical manual funding arb setup requires **8-15 open browser tabs/windows**:

- 1-2 funding rate dashboards (CoinGlass, Loris)
- 2-4 exchange trading interfaces (one per venue)
- 1-2 order book depth views
- 1 portfolio tracker (DeBank, CoinStats)
- 1 spreadsheet for P&L calculations
- 1 TradingView chart for context
- 1-2 alert/communication channels (Telegram, Discord)
- 1 blockchain explorer or bridge interface (for cross-venue capital transfers)

---

## 2. Pain Points in Manual Funding Rate Arb

### Execution Speed

- **Leg risk**: Both sides must execute within seconds. Any delay creates unhedged directional exposure. "Slippage, thin order books, and delays in placing both legs of a trade may turn a hedge unprofitable."
- **Tactical timing**: Optimal entry window is 10-15 minutes before the funding payment. Missing it wastes fees.
- **Exit slippage**: Unwinding positions is harder. Passive winddown can leave delta risk lasting 10+ hours with unpredictable PnL, while aggressive liquidation incurs ~5% slippage loss.

### Monitoring Fatigue

- Funding rates change every hour on Hyperliquid (every 8h on Binance/Bybit). Rates can flip positive to negative during market stress.
- **40-60% of months experience extended negative funding periods** where the strategy bleeds 2-5% monthly.
- No single tool provides monitoring + execution + risk management in one place.

### Fee Erosion

- On Hyperliquid: spot 0.040% taker / 0.015% maker, perps 0.045% taker / 0.015% maker.
- Full round trip (open + close both legs) costs ~0.11% minimum with maker orders.
- Funding rate must exceed 0.11%/hr on HL (or 0.15%+ for meaningful profit) to be viable.
- "After fees, slippage, and borrowing costs, real yields often fall below 10%" annualized.

### Capital Inefficiency

- Capital must be pre-staged on both venues. Cross-venue strategies require separate margin on each exchange.
- Network congestion or withdrawal freezes can trap capital when rebalancing is needed.
- Collateral haircuts: "100 USDT BTC = 95 USDT collateral, while 100 USDT of BOND = 10 USDT collateral."

### Liquidation & ADL Risk

- Hedged positions can still be liquidated if margin isn't maintained during sharp single-leg price swings.
- Auto-Deleveraging (ADL) forces closure of profitable positions when counterparties are liquidated, creating instant delta exposure.

### Spreadsheet Complexity

- Manual P&L tracking across venues with different fee structures, funding intervals, and leverage levels is tedious and error-prone.
- No native way to see net delta across all positions in a single view.

---

## 3. Real User Examples & Community Signals (2025-2026)

### Twitter/X

- **@0xLoris** (builder of Loris Tools): Regularly shares funding rate scanner updates, announces new exchange integrations. Loris Tools became the go-to free scanner by early 2026 with 25+ exchange coverage. Their backtester feature was repeatedly cited by traders validating strategies.
- Multiple traders shared screenshots of CoinGlass heatmaps showing extreme funding divergences during March 2025 BTC rally (rates hit 0.2% per interval), calling it "free money" but complaining about execution speed.
- "Delta neutral" and "funding farming" hashtags saw increased activity in late 2025 as Ethena's success popularized the concept. Traders discussing replication strategies on Hyperliquid specifically.
- Hyperliquid's native funding comparison page (app.hyperliquid.xyz/fundingComparison) frequently shared as starting point, but users note it lacks cross-venue comparison and historical data.

### Discord & Community

- Hyperliquid Discord has active threads on funding strategies, with users sharing Python snippets using `hyperliquid-python-sdk` to poll rates.
- Common complaint pattern: "By the time I see the rate, calculate the arb, and open both legs, the rate has already compressed."
- Several users report running Hummingbot for automated funding arb on HL, but describe setup as "painful" and maintenance-heavy.
- Vault creators on HL marketing funding arb strategies to depositors, using it as a passive income product.

### Reddit

- r/CryptoCurrency and r/defi threads from late 2025 discuss delta-neutral funding as "the boring but profitable play."
- Users compare Ethena's ~5% yield (2025) unfavorably to manual arb potential of 15-30%, but acknowledge the effort and risk difference.
- Multiple posts asking "what's the minimum capital for funding rate arb?" — consensus: $10K minimum, $50K+ comfortable.
- Complaints about "funding rate flippage" — entering a positive funding arb only to have rates go negative within hours.

### Common User Archetypes

1. **The Spreadsheet Warrior**: Maintains a Google Sheet with live CoinGlass data imports, manually calculates APY for 20+ pairs, executes 2-3 arbs per week on the best opportunities.
2. **The Script Kiddie**: Runs Python scripts polling APIs, gets Telegram alerts for rate divergences, but still executes manually via exchange UIs.
3. **The Vault Operator**: Packages funding arb as a Hyperliquid Vault strategy, collects 10% profit share from depositors, uses basic automation for execution.
4. **The DeFi Degen**: Uses Pendle Boros to tokenize funding rates, trades fixed vs. variable yield without direct perp exposure.

---

## 4. Existing Tools Landscape

### Monitoring/Scanning Tools

| Tool | Exchanges | Key Features | Gaps |
|------|-----------|-------------|------|
| **CoinGlass** | 15+ CEXs + some DEXs | Funding heatmap, cross-exchange comparison, OI data, dedicated arbitrage page | No execution, limited DEX coverage, no HL-native features |
| **Loris Tools** | 25+ CEX + DEX (incl. Hyperliquid, Drift, Paradex, Aster, Ethereal) | Free real-time scanner (1min updates), backtester, heatmaps, historical charts. Normalizes 1h/4h/8h intervals | No execution (planned), no position management |
| **Sharpe AI** | Binance, Bybit, OKX, dYdX + DEXs | 200+ perps, live heatmap, funding calculator, arb detection | Updated every 8h (not real-time) |
| **Coinalyze** | Major CEXs + Hyperliquid | Aggregated OI, funding, liquidation data | No execution, limited DEX data |
| **ArbitrageScanner** | Major CEXs | Funding rate comparison charts | Limited DEX support |
| **P2P.Army** | Multiple CEXs | 24/7 auto-scanning, Telegram alerts | No execution |
| **Hyperliquid native** | Hyperliquid only | Cross-asset funding comparison | No cross-venue, no automation |

### Execution/Automation Tools

| Tool | Type | Notes |
|------|------|-------|
| **Hummingbot** | Open-source bot framework | Built-in funding arb strategy, supports HL Vaults. CLI-only, complex setup |
| **ARBOT** (GitHub) | Open-source Python | Spot-futures arb, claims 15-30% APY. CEX only |
| **50shadesofgwei/funding-rate-arbitrage** | Open-source template | DEX-DEX pairs (Synthetix v3, GMX, Bybit). Requires programming |
| **Custom Python scripts** | Private | Most pro desks use `hyperliquid-python-sdk` directly |

### DeFi Protocol-Level Solutions

| Protocol | Approach |
|----------|----------|
| **Pendle Boros** | Tokenizes funding rates as "Yield Units." Fixed-yield funding arb: lock 5.98-11.4% fixed APR on BTC/ETH across HL-Binance. $12B+ volume. Expanding to equity perps (S&P500, TSLA) in 2026 |
| **Ethena (USDe)** | Delta-neutral funding arb as stablecoin: long spot ETH/BTC + short perps. ~11% APY (2024), ~5% (2025). $5B+ AUM |

---

## 5. Hyperliquid Funding Rate Mechanics

### Calculation

```
Funding Rate (F) = Average Premium Index (P) + clamp(Interest Rate - P, -0.0005, 0.0005)
```

- **Interest rate**: Fixed 0.01% per 8h = 0.00125% per hour
- **Premium Index**: Based on (mark price - oracle price) / oracle price, averaged over sampling period
- **Funding cap**: 4% per hour (much higher than Binance's variable caps)
- **Payment frequency**: Every hour (24 payments/day)

### Cross-Venue Comparison

| Feature | Hyperliquid | Binance | dYdX v4 | Drift | GMX v2 |
|---------|-------------|---------|---------|-------|--------|
| Frequency | Hourly | Every 8h | Hourly | Hourly (lazy) | Continuous |
| Cap | 4%/hr | Variable | Not specified | Tiered (0.125-0.417%) | No explicit cap |
| Interest rate | 0.00125%/hr fixed | 0.01%/8h fixed | Varies | N/A | N/A |
| Settlement | USDC | USDT | USDC | USDC | USD-based |
| Spot + perp same venue | Yes | Yes | No | Yes (Solana) | No |
| Order book | On-chain CLOB | Off-chain | On-chain (Cosmos) | Hybrid (DLOB+AMM+JIT) | AMM/pool |

### HL-Specific Advantages for Arb

- **Hourly compounding**: 24 events/day vs 3 on Binance
- **4% cap**: Extreme dislocations far more profitable than on capped CEXs
- **Same-venue cash-and-carry**: Spot + perp on one platform eliminates counterparty and withdrawal risk
- **On-chain transparency**: Full visibility into positions, liquidations, order flow
- **HIP-2**: Guaranteed 0.3% spread every 3 seconds for spot markets
- **Vaults**: Package strategies for depositors (vault leader earns 10% of profits)
- **Sub-second finality**: 200K orders/second throughput

### HL-Specific Constraints

- Only BTC, ETH, SOL and a few others have both spot and perp markets
- Many altcoins are perp-only, limiting same-venue cash-and-carry
- Fee structure requires funding > 0.11%/hr to break even with maker orders

---

## 6. Opportunity Size & Realistic Returns

### APY Ranges (Real-World Data)

| Condition | Annualized Return |
|-----------|-------------------|
| Baseline (BTC/ETH) | 10-15% |
| Bull market spikes | 30-55% |
| Extreme events | 60%+ |
| Cross-venue with leverage | 25-30% |
| Pendle Boros fixed | 5.98-11.4% |
| Ethena average (2024) | ~11% |
| Ethena average (2025) | ~5% |
| After fees/slippage (reality) | <10% many months |

### How Quickly Opportunities Close

- High-rate anomalies on single assets compress within 1-4 hours as arbs pile in
- Cross-venue divergences persist longer (hours to days) due to capital transfer friction
- "Predicted funding rates" declining = other arbs already exploiting the opportunity
- 2026 trend toward continuous/per-block funding compresses opportunities faster

### Capital Requirements

- **Minimum viable**: ~$10K for meaningful returns after fees
- **Comfortable**: $50K-$100K for diversified multi-asset arb
- **Institutional**: $1M+ with dedicated infrastructure
- **HL Vault minimum**: 100 USDC to create a vault

---

## 7. Blueprint: Automated Funding Scanner + Executor for HypeTerminal

### Core Problem Statement

No single tool combines **real-time monitoring + cross-venue comparison + one-click execution + position management + risk alerts** in a Hyperliquid-native interface. Traders cobble together 8-15 tabs across CoinGlass, exchange UIs, spreadsheets, Telegram bots, and custom scripts.

### Feature Tiers

#### Tier 1: Funding Rate Scanner (Read-Only, High Value)

**Real-time cross-venue rate matrix**
- Aggregate funding rates from Hyperliquid, dYdX, Drift, Vertex, GMX, Binance, Bybit
- Normalize different intervals (1h/4h/8h) to common basis (annualized APY and per-hour)
- Heatmap visualization: rows = assets, columns = venues, color = rate intensity
- Sort/filter by: absolute rate, cross-venue spread, annualized APY, OI, volume

**Opportunity detector**
- Auto-calculate net arb APY after fees for each pair (venue A long + venue B short)
- Flag opportunities above configurable threshold (e.g., >15% APY)
- Show break-even holding period (how many funding intervals to cover entry/exit fees)
- Historical rate chart per asset per venue (1h, 24h, 7d, 30d)

**Same-venue cash-and-carry scanner**
- For HL assets with both spot + perp markets (BTC, ETH, SOL, etc.)
- Show real-time basis (spot vs perp price spread) + funding rate
- Calculate net carry yield accounting for spot holding cost and perp funding

**Alerts**
- Configurable alerts: rate threshold, rate flip (positive→negative), opportunity score
- In-app notification + optional webhook/Telegram integration

#### Tier 2: Position Manager (Read + Track)

**Unified delta dashboard**
- Show all open spot + perp positions across connected venues
- Calculate and display net delta exposure per asset and portfolio-wide
- Real-time P&L from funding payments received/paid
- Running tally: total funding earned, total fees paid, net profit

**Position health monitor**
- Margin ratio and liquidation price per leg
- ADL ranking on Hyperliquid positions
- Estimated time to liquidation at current rate of margin change
- Alert when margin ratio drops below configurable threshold

**Funding P&L analytics**
- Historical funding payments received/paid per position
- Realized vs unrealized breakdown
- Per-strategy P&L attribution (which arb pairs are profitable)

#### Tier 3: Execution Engine (Write, High Complexity)

**One-click arb execution (same-venue)**
- For HL spot + perp pairs: atomic execution of both legs
- Pre-computed position sizes based on target delta-neutral exposure
- Configurable leverage, order type (limit/market), and slippage tolerance
- Execution confirmation with full fee + expected APY breakdown

**Cross-venue arb execution**
- Simultaneous order placement on two venues via SDK
- Leg monitoring: if one leg fills but other doesn't, auto-unwind or alert
- Position sizing that accounts for different margin requirements per venue

**Auto-exit conditions**
- Exit when funding rate drops below threshold
- Exit when net APY drops below break-even
- Exit when rate flips sign
- Time-based exit (e.g., hold for max 24 hours)
- Trailing take-profit on accumulated funding

**Rebalancing**
- Detect when delta exposure drifts beyond threshold (e.g., >2% from neutral)
- Suggest or auto-execute rebalancing trades
- Cross-venue collateral rebalancing recommendations

#### Tier 4: Vault Integration (HL-Native)

**Strategy-as-a-Vault**
- Package funding arb strategies as Hyperliquid Vaults
- Dashboard for vault performance, TVL, depositor count
- Automated execution within vault parameters
- Transparent reporting of funding income, fees, and net yields

### Data Architecture

```
Data Sources (WebSocket + REST polling)
├── Hyperliquid API (funding rates, order books, positions)
│   ├── WS: allMids, l2Book, userFills, userFundings
│   └── REST: fundingHistory, meta, clearinghouseState
├── dYdX v4 API
├── Drift API (Solana)
├── Vertex API
├── CoinGlass API (aggregated CEX rates)
└── Price oracles (for delta calculation)

Processing Layer
├── Rate normalizer (convert all to hourly basis)
├── Opportunity scorer (APY after fees, break-even calc)
├── Delta calculator (net exposure across positions)
├── Risk engine (margin health, liquidation proximity)
└── Alert engine (threshold monitoring)

UI Layer (HypeTerminal components)
├── Funding Heatmap (cross-venue matrix)
├── Opportunity Table (sorted by net APY)
├── Position Dashboard (delta, P&L, health)
├── Execution Panel (order entry + confirmation)
└── Analytics Charts (historical rates, P&L curves)
```

### Key Technical Decisions

1. **Rate normalization**: All rates displayed as both per-hour and annualized. Raw rates preserved for accuracy. Use big.js for all calculations per project conventions.

2. **Opportunity scoring**: `netAPY = (fundingRate - totalFees) * intervalsPerYear * (1 + leverage)`. Include slippage estimate based on order book depth.

3. **Execution approach**: Use Hyperliquid SDK for HL legs. For cross-venue, use respective SDKs with coordinated order placement. Implement "leg risk" monitoring — if one side fills but other doesn't within 5 seconds, auto-unwind the filled leg.

4. **State management**: Zustand store for scanner state (rates, opportunities, alerts). Separate store for positions/execution state. WebSocket subscriptions for real-time rate updates.

5. **SSR safety**: All WebSocket connections and exchange API calls must be client-only. Use `ClientOnly` wrapper for the entire funding scanner panel.

### Competitive Positioning

| Feature | CoinGlass | Loris | Hummingbot | **HypeTerminal** |
|---------|-----------|-------|------------|------------------|
| Cross-venue rates | Yes | Yes | Limited | Yes |
| Real-time updates | ~1min | ~1min | Real-time | Real-time (WS) |
| Opportunity scoring | Basic | Basic | None | Advanced (after-fee APY) |
| Execution | No | No (planned) | CLI bot | One-click UI |
| Position management | No | No | Basic | Full delta dashboard |
| Risk alerts | No | Basic | Basic | Comprehensive |
| HL-native features | No | No | Some | Full (vaults, HIP-2) |
| UX | Dashboard | Dashboard | Terminal | Integrated trading UI |

### Implementation Priority

1. **Start with scanner** (Tier 1) — highest value, lowest risk, validates demand
2. **Add position tracking** (Tier 2) — natural extension, requires connected wallet
3. **Build execution** (Tier 3) — highest complexity, requires thorough testing
4. **Vault integration** (Tier 4) — platform play, builds on execution engine

### Risk Mitigations for Product

- **Clear disclaimers**: Funding rate arb is not risk-free. Display historical drawdown data.
- **Paper trading mode**: Allow users to simulate arb strategies before committing capital.
- **Rate flip protection**: Prominent warning when predicted rates are declining or flipping.
- **Maximum position limits**: Configurable per-user caps to prevent overleveraging.
- **Kill switch**: One-click unwind of all arb positions across all venues.

---

## Sources

- [Hyperliquid Funding Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding)
- [Hyperliquid Funding Comparison UI](https://app.hyperliquid.xyz/fundingComparison)
- [Chainstack: Implementing Spot-Perp Funding Rate Arbitrage on Hyperliquid](https://docs.chainstack.com/docs/hyperliquid-funding-rate-arbitrage)
- [Hummingbot: Funding Rate Arbitrage on Hyperliquid](https://hummingbot.org/blog/funding-rate-arbitrage-and-creating-vaults-on-hyperliquid/)
- [CoinGlass: Funding Rate Arbitrage](https://www.coinglass.com/ArbitrageList)
- [Loris Tools](https://loris.tools)
- [Sharpe AI Funding Rate Dashboard](https://sharpe.ai/funding-rate)
- [Pendle Boros](https://www.pendle.finance/boros/)
- [Ethena Docs](https://docs.ethena.fi/solution-overview/usde-overview/delta-neutral-examples)
- [Amberdata: Guide to Funding Rate Arbitrage](https://blog.amberdata.io/the-ultimate-guide-to-funding-rate-arbitrage-amberdata)
- [1Token: Funding Fee Arbitrage Strategy](https://blog.1token.tech/crypto-fund-101-funding-fee-arbitrage-strategy/)
- [Bitcoin.com: Funding Rates on Perp DEXs (2026)](https://www.bitcoin.com/get-started/how-funding-rates-work-on-perp-dex/)
- [50shadesofgwei/funding-rate-arbitrage (GitHub)](https://github.com/50shadesofgwei/funding-rate-arbitrage)
- [Blockworks: Hyperliquid Annualized Funding Rates](https://blockworks.com/analytics/hyperliquid/hyperliquid-perps/hyperliquid-annualized-funding-rates)
- [Drift Protocol Funding Rates](https://docs.drift.trade/trading/funding-rates)
