# Hyperliquid Ecosystem: Strategic Analysis & Opportunity Map

**Date**: March 2026
**Purpose**: Identify high-leverage product/SDK opportunities that can capture volume with minimal effort

---

## Part 1: Who Actually Uses Hyperliquid

### The Power Law Reality

The single most important data point: **the top 200 addresses account for 98.81% of all trading volume**. The remaining 1.7M+ users contribute ~1.19%. This is an extreme power-law distribution that fundamentally shapes where opportunity lies.

| User Type | Est. Volume Share | What They Need |
|-----------|------------------|----------------|
| Market Makers / HFT | ~40-50% | Low-latency APIs, co-location, multi-account mgmt, risk tools |
| Institutional / Whale Traders | ~25-35% | Execution algos, portfolio margin, privacy, OMS |
| Algorithmic / Systematic | ~10-15% | Backtesting, strategy frameworks, historical data |
| Bots (arb, liquidation, sniper) | ~5-10% | Reliable SDKs, WebSocket stability, speed |
| Manual Retail Traders | ~1-3% | Simple UX, copy trading, mobile, education |
| Copy Trading / Vault Depositors | <1% | Discovery, risk controls, transparency |

### Key Insight

**Volume follows sophistication, not user count.** The 200 addresses generating 98.81% of volume are market makers, quant funds, and professional traders. But they already have custom infrastructure. The real opportunity is in the **next tier down** -- the thousands of semi-professional traders, small funds, and power users who want institutional-grade tools but can't build their own.

### Notable Traders & Whales

- **"The White Whale"** -- $50M+ profit in 30 days (July 2025)
- **Machi Big Brother (Jeffrey Huang)** -- $6M deposit, 92% win rate, peaked at $35M unrealized
- **The $1.1B depositor** -- Likely institutional/quant. Deposited $1.11B, withdrew $1.16B, ~$143M unrealized profit
- **James Wynn** -- High-profile leveraged trades, $17.5M loss from coordinated liquidation (privacy problem)

### Volume Sources

| Source | Share | Notes |
|--------|-------|-------|
| Maker-Taker Order Book | Primary | On-chain CLOB, 0.015%/0.045% fee structure |
| CEX-DEX Arbitrage | Significant | Constant arb between HL and Binance/Bybit |
| HLP Liquidation Engine | Meaningful | Single $700M liquidation = $15M profit for HLP |
| **RWA / Commodities** | **33% of weekly vol** | Silver: $4.09B in one day. Oil: $5B in 72hrs. Fastest-growing segment |
| Funding Rate Arbitrage | Growing | Differentials between HL and CEXs |
| Weekend Trading | Notable | $1.4B weekend volume -- 24/7 equity/commodity exposure |

### Most Traded

- BTC/USD: ~35-40% of volume (~$1.85B/day)
- ETH/USD: second
- SOL/USD: third
- These three = ~2/3 of all volume
- RWA perps (oil, silver, gold, Nasdaq, S&P) rapidly gaining share
- 313 perp pairs, 150+ tokens, growing via HIP-3

---

## Part 2: The Third-Party Ecosystem

### Builder Economy at Scale

| Metric | Value |
|--------|-------|
| Total builder code revenue | **$46.27M+** |
| Active builders | **187** |
| % of DAU via third-party frontends | **~40%** |
| Peak builder users | 289,800 |
| Max perp builder fee | 0.1% (10 bps) |
| Max spot builder fee | 1% (100 bps) |

### Top Builders by Revenue

| Builder | Revenue | Volume | Users | What They Do |
|---------|---------|--------|-------|-------------|
| **Based** | ~$14M | $35.18B | 35,400 | Super app: email onboarding, prediction markets, Visa card |
| **Phantom** | ~$36M/yr | $23.05B | 81,700 | Wallet-integrated trading. Zero-friction for existing users |
| **pvp.trade** | $7.2M | $13.27B | 19,500 | Telegram bot + social/competitive trading |
| **Liquid** | $7.6M seed | -- | -- | Multi-DEX aggregator. Ex-Two Sigma founder |

### Existing SDKs

| SDK | Language | Quality | Gap |
|-----|----------|---------|-----|
| Official Python | Python | Medium | No TWAP in high-level methods, sync only |
| Official Rust | Rust | Basic | Less actively maintained |
| **@nktkas/hyperliquid** | TypeScript | High | Single maintainer (HypeTerminal uses this) |
| Infinite Field | Rust | High | Enhanced: HIP-3, multisig, EVM-Core |
| sonirico/go-hyperliquid | Go | Medium | Single maintainer |
| CCXT | Multi | High | Generic, not HL-optimized |
| **Java/Kotlin/Swift/C++** | -- | -- | **Complete gap** |

### Existing Frontends

**Web terminals**: Based, Phantom, pvp.trade, Liquid, Insilico, Tealstreet, Silhouette (dark pool)
**Telegram bots**: MevX, Hyperbot, ApexLiquid, SuperX
**Mobile**: OneShot (iOS), Hyperliquid Tracker (iOS), MetaMask (embedded)
**CLI**: hl-cli (TS/Ink), hyperliquid-cli (Rust)
**Copy trading**: pvp.trade/Hyperdash, Hyperbot, WunderTrading, open-source repos, HL Vaults (native)

### Analytics

HyperTracker (1.6M wallets), ASXN HyperScreener, CoinGlass, Nansen ($49/mo), Arkham, HypeFees, Dune dashboards, Amberdata, Dwellir

### DeFi Integrations (HyperEVM)

$3B+ TVL. Key protocols: Kinetiq ($639M liquid staking), Felix ($1B+ lending), HyperLend ($540M), Pendle ($300M yield), Liminal (delta-neutral), Ethena (USDe yield via HL perps). 5+ bridges including LayerZero, Across, deBridge.

---

## Part 3: Where The Gaps Are

### Ecosystem Maturity Map

```
MATURE (saturated, hard to differentiate)
  - Trading frontends for retail
  - Whale tracking / on-chain analytics
  - Lending/borrowing on HyperEVM
  - Liquid staking
  - Bridge infrastructure
  - Python SDK

DEVELOPING (players exist, no clear winner)
  - Copy trading (multiple options, none dominant)
  - CLI tools
  - HyperEVM DeFi
  - RPC provider ecosystem
  - Portfolio margin (alpha)

CLEAR GAPS (underserved or empty)
  - Privacy / dark pool (funded but pre-product)
  - Official TypeScript SDK (community-dependent)
  - Tax / compliance tooling
  - Institutional-grade risk management
  - RWA-specialized trading interface
  - Advanced execution algorithms
  - Backtesting framework
  - Historical data pipeline
  - Strategy marketplace
  - HIP-4 prediction market frontend
  - AI agent trading (fragmented, no winner)
  - Java/Kotlin/Swift SDKs
  - Multi-asset TradFi-style analytics for HIP-3
```

### Developer Pain Points

1. **No official TypeScript SDK** -- everyone depends on single community maintainer
2. **WebSocket limits** -- 1,000 subscriptions across 239+ markets, 10 connections/IP
3. **Rate limiting tied to volume** -- punishes analytics builders who read but don't trade
4. **TWAP not in SDK high-level methods** -- requires raw API calls
5. **Historical data gaps** -- official archive is L2 book snapshots only, updated monthly
6. **HyperEVM RPC** -- official endpoint: 100 JSON-RPC/min (unusable for production)
7. **Nonce management** -- shared nonce set creates race conditions across sub-accounts

### Trader Pain Points

1. **Privacy** -- all positions publicly visible, enables front-running of whales
2. **No native copy trading** -- vaults exist but no "follow a wallet" with risk controls
3. **No native options** -- HIP-4 covers predictions, not traditional options
4. **Portfolio margin gated** -- requires $500K portfolio + $5M weighted volume
5. **No official mobile app**
6. **No tax reporting** for HL perps + spot + HIP-3 equities + commodities

---

## Part 4: Opportunity Analysis

### Revenue Math

At Hyperliquid's scale ($5-8B daily perp volume, $200B+ monthly):

| Scenario | Daily Volume Captured | Builder Fee | Daily Revenue | Annual Revenue |
|----------|----------------------|-------------|---------------|----------------|
| 0.5% of flow | $25-40M | 0.05% | $12.5-20K | **$4.5-7.3M** |
| 1% of flow | $50-80M | 0.05% | $25-40K | **$9-14.5M** |
| 1% of flow | $50-80M | 0.1% | $50-80K | **$18-29M** |
| 2% of flow | $100-160M | 0.05% | $50-80K | **$18-29M** |

For context: Phantom captures ~1.5% of flow and earns ~$100K/day ($36M/yr annualized).

### Comparable Success Stories

| Platform | What They Did | Scale | Lesson |
|----------|--------------|-------|--------|
| BONKbot (Solana) | Simple Telegram swap bot | ~$52M/year in fees | Simplicity + distribution > features |
| Trojan (Solana) | Telegram trading bot | $23.4B volume, 2M users | Telegram is a distribution moat |
| Bitget Copy Trading | CEX copy trading | $9.2B Q1 2025 volume, 190K elite traders | Copy trading is proven at massive scale |
| Phantom (HL builder) | Wallet-integrated trading | ~$36M/yr from HL alone | Existing distribution = instant revenue |
| Based (HL builder) | Email-first super app | ~$14M revenue, 35K users | Simplifying onboarding captures retail |
| pvp.trade | Telegram + gamified trading | $7.2M lifetime | Social/competitive angle works for perps |

---

## Part 5: Ranked Opportunities for HypeTerminal

Given HypeTerminal's existing codebase (full trading terminal, 45+ SDK hooks, builder code integration, all order types including TWAP, TradingView charting, mobile-responsive), here are the opportunities ranked by **volume potential / effort required**:

### Tier 1: High Volume, Leverages Existing Code

#### 1. Copy Trading Layer (on top of HypeTerminal)
**Effort**: Medium | **Revenue ceiling**: $5-15M/year | **Time to value**: 4-8 weeks

**Why this is low-hanging fruit:**
- You already have the entire trading execution layer (all order types, margin modes, leverage)
- You already have builder code integration (revenue capture from day one)
- No dominant player exists on HL -- the category is wide open
- Copy trading is 91% futures (exactly what HL does)
- Bitget's copy trading does $9.2B/quarter, proving the model at scale

**What's needed:**
- Wallet tracking engine (monitor target addresses via WebSocket)
- Position replication logic (proportional sizing based on follower capital)
- Risk controls (max position size, max drawdown, per-trade SL/TP)
- Trader discovery UI (leaderboard with performance metrics: Sharpe, drawdown, win rate)
- One-click follow with allocation settings
- Performance fee mechanism (configurable 5-15% of profits)

**What the incumbents lack:**
- HL Vaults: Capital pooling only, no true "follow a wallet." Fixed 10% profit share. No risk controls for followers.
- pvp.trade/Hyperdash: Social/competitive focus, not systematic copy trading
- Open-source bots: No UX, no risk management, no discovery

**Revenue model**: Builder code on every copied trade (0.05-0.1%) + optional premium tier subscription

---

#### 2. Telegram Perp Trading Bot
**Effort**: Medium | **Revenue ceiling**: $10-50M/year | **Time to value**: 6-10 weeks

**Why:**
- BONKbot generates ~$52M/year from a simple swap bot on Solana
- pvp.trade ($7.2M) proves Telegram works for HL perps
- No dominant "BONKbot for perps" exists
- Telegram is the #1 distribution channel in crypto (zero friction, always open)
- You can reuse HypeTerminal's trading logic -- different UI, same execution

**What's needed:**
- Telegram bot framework (grammY or telegraf)
- Order execution via existing SDK hooks (simplified to Telegram UX)
- Inline position management (/long BTC 10x $5000, /close BTC)
- Price alerts and PnL notifications
- Copy trading integration (follow whale X in Telegram)
- Wallet management (agent wallet per user)

**Revenue model**: Builder code on every trade (0.05-0.1%). At $200B+ monthly HL volume, capturing 1-2% through bot = $200-400K/month.

---

#### 3. React SDK for Hyperliquid (Open-Source SDK Play)
**Effort**: Low-Medium | **Revenue ceiling**: Indirect ($5-20M/year via ecosystem) | **Time to value**: 2-4 weeks

**Why this is uniquely positioned:**
- HypeTerminal already has 45+ hooks wrapping @nktkas/hyperliquid
- `useInfo*`, `useSub*`, `useExchange*` patterns are production-tested
- No React-specific SDK exists for Hyperliquid
- Every new HL frontend builder reinvents this wheel
- Open-source SDK = adoption flywheel for builder code revenue (default builder code in SDK config)

**What's needed:**
- Extract existing hooks into a standalone `@hypeterminal/react` package
- Add documentation and examples
- Default builder code baked into SDK configuration
- Publish to npm
- Simple getting-started template (Vite + React + SDK = trading app in 5 minutes)

**Revenue model**: Every app built with your SDK uses your builder code by default. If 10 apps built on your SDK collectively do $100M/month in volume at 0.05% builder fee = $50K/month = $600K/year. If any app gets traction, this compounds.

**Why this is genius as a strategy:**
- Almost zero marginal cost (extract what you already built)
- Creates an ecosystem moat (developers build on your primitives)
- Compounds: more apps = more builder fee revenue
- Marketing for HypeTerminal itself
- Establishes you as infra, not just another frontend

---

### Tier 2: Medium Effort, Strong Differentiation

#### 4. RWA Trading Interface
**Effort**: Medium | **Revenue ceiling**: $5-15M/year | **Time to value**: 4-8 weeks

**Why:**
- RWA is now **33% of weekly HL volume and 21% of OI** -- fastest growing segment
- Silver perps: $4.09B in one day. Oil: $5B in 72hrs. Weekend equity trading: $1.4B.
- No frontend is optimized for TradFi traders who want 24/7 commodity/equity exposure
- These users think in different terms (contracts, lot sizes, settlement dates) vs. crypto-native UX
- HypeTerminal already supports builder perps (where RWA markets live via HIP-3)

**What's needed:**
- TradFi-style market views (sector groupings: commodities, equities, FX, crypto)
- Economic calendar integration (earnings, FOMC, jobs data)
- Correlation matrices (BTC vs. S&P, Gold vs. Oil)
- Position sizing in familiar units (lots, contracts)
- Extended hours / weekend session indicators
- News feed integration

**Target user**: TradFi traders who want 24/7 markets without CEX KYC. Macro traders. Commodity traders.

---

#### 5. AI Trading Agent / Natural Language Interface
**Effort**: Medium-High | **Revenue ceiling**: $5-20M/year | **Time to value**: 8-12 weeks

**Why:**
- Senpi already has $100M+ volume since Jan 2026
- No "ChatGPT for trading" with reliable execution exists
- LLMs are good at intent parsing ("go long BTC with 5x if it breaks 70k, stop at 68k")
- You have the execution infrastructure -- just need the NL → order translation layer
- The agent trading category is the hottest in crypto right now

**What's needed:**
- LLM integration (Claude/GPT) for intent parsing
- Structured output → order parameters mapping
- Confirmation flow (show order before executing)
- Strategy templates in natural language
- Memory / context (knows your positions, knows your risk tolerance)

---

#### 6. Strategy Marketplace & Automation
**Effort**: Medium-High | **Revenue ceiling**: $3-10M/year | **Time to value**: 8-12 weeks

**Why:**
- No publish/subscribe/auto-execute strategy marketplace exists for HL
- Grid bots, DCA, funding rate arb, mean reversion -- all proven strategies with no HL-native platform
- Hummingbot backtesting on HL is broken
- Performance fee model (10-20% of profits) + builder codes = dual revenue

**What's needed:**
- Strategy builder (visual or code-based)
- Backtesting engine (historical candles + funding rates + liquidation mechanics)
- Auto-execution engine
- Strategy marketplace with performance metrics
- Risk management (position limits, drawdown stops)

---

### Tier 3: Infrastructure Plays

#### 7. Enhanced TypeScript SDK
**Effort**: Low-Medium | **Revenue ceiling**: Indirect | **Time to value**: 2-4 weeks

The existing @nktkas/hyperliquid SDK is single-maintainer. A higher-level SDK with:
- WebSocket reconnection / subscription management abstraction
- Order management system (lifecycle tracking)
- Multi-account / sub-account management
- Historical data utilities
- Backtesting primitives

#### 8. HIP-4 Prediction Market Frontend
**Effort**: Medium | **Revenue ceiling**: $2-10M/year | **Time to value**: 6-8 weeks

HIP-4 is on testnet. Polymarket proves first-mover UX advantage is massive in prediction markets. Building the frontend before mainnet = early positioning.

#### 9. Tax & Compliance Tooling
**Effort**: Medium | **Revenue ceiling**: $1-3M/year | **Time to value**: 6-10 weeks

Nobody covers HL perps + spot + HIP-3 equities + commodities. SaaS subscription model ($29-99/mo).

---

## Part 6: Strategic Recommendation

### The "Volume Flywheel" Strategy

The highest-leverage play is a **three-layer approach** that compounds:

```
Layer 1: Open-Source React SDK (2-4 weeks)
  → Extract existing hooks into @hypeterminal/react
  → Default builder code baked in
  → Every app built on it generates revenue for you
  → Marketing + ecosystem moat

Layer 2: Copy Trading on HypeTerminal (4-8 weeks)
  → Adds a feature that captures new user segment (passive traders)
  → Builder code revenue on every copied trade
  → Social discovery creates network effects
  → Differentiates from Based/Phantom/Insilico

Layer 3: Telegram Bot (6-10 weeks)
  → New distribution channel (Telegram's 900M users)
  → Reuses execution logic from HypeTerminal
  → Captures traders who don't want a full terminal
  → Builder code revenue compounds with copy trading
```

**Why this order:**
1. SDK first because it's lowest effort and creates the ecosystem foundation
2. Copy trading second because it's the biggest gap and directly drives volume through your builder code
3. Telegram third because it unlocks a completely new distribution channel

**Combined ceiling**: If all three layers capture 2-3% of HL's flow at 0.05-0.1% builder fee, you're looking at $15-40M/year in protocol-level revenue with a team of 2-5 people.

### The "Quick Win" Alternative

If you want the single fastest path to revenue:

**Copy Trading in HypeTerminal** -- You already have 95% of the infrastructure. The delta is:
1. Wallet tracking engine (~1 week)
2. Position replication logic (~1 week)
3. Risk controls UI (~1 week)
4. Trader discovery/leaderboard (~1-2 weeks)

4-6 weeks to a product that fills the biggest gap in the HL ecosystem, with revenue from day one via your existing builder code.

---

## Appendix: Key Numbers

| Metric | Value | Source |
|--------|-------|--------|
| HL monthly volume | $200B+ | Multiple |
| HL daily perp volume | $5-8B | BlockEden, TheBlock |
| HL perp DEX market share | ~70% | CoinGecko, BlockEden |
| HL total users | 1.4M+ | CryptoBriefing |
| HL open interest | $6.7B | BlockEden |
| Top 200 addresses % of volume | 98.81% | PANews |
| Builder code total revenue | $46.27M+ | Allium, Dwellir |
| Active builders | 187 | Dwellir |
| % DAU via third-party | ~40% | Blockworks |
| Phantom daily builder revenue | ~$100K | HypeRPC |
| pvp.trade lifetime revenue | $7.2M | Multiple |
| RWA % of weekly volume | 33% | CryptoTimes |
| RWA % of OI | 21% | CryptoTimes |
| BONKbot annual fees | ~$52M | CoinGecko |
| Bitget copy trading Q1 vol | $9.2B | CoinLaw |
| Senpi volume (since Jan 2026) | $100M+ | The Defiant |
| HyperEVM TVL | $3B+ | Multiple |
| HL cumulative volume 2025 | $2.6T | Artemis |
| HL 2025 protocol revenue | $600M+ | DWF Labs |
