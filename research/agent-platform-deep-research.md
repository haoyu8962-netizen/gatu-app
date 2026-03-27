# HypeTerminal Agent Platform: Deep Research

> Comprehensive research on making Hyperliquid ready for agent-based trading
> Date: 2026-03-23

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Foundation (What We Have)](#2-current-foundation)
3. [Hyperliquid Agent Infrastructure](#3-hyperliquid-agent-infrastructure)
4. [HIP-3 & Builder Economics](#4-hip-3--builder-economics)
5. [AI Agent Frameworks Landscape](#5-ai-agent-frameworks-landscape)
6. [SDK & Platform Architecture](#6-sdk--platform-architecture)
7. [Agent Trading Verticals](#7-agent-trading-verticals)
8. [Business Models & Revenue](#8-business-models--revenue)
9. [Emerging Trends (2025-2026)](#9-emerging-trends)
10. [Infrastructure & Operations](#10-infrastructure--operations)
11. [Product Roadmap: What to Build](#11-product-roadmap)

---

## 1. Executive Summary

The AI agent trading market is projected at **$47.4B in 2025**, growing at 14% CAGR to $200B by 2035. The crypto social trading market alone is $6.6B. Hyperliquid processes 200K+ orders/sec with sub-second finality and controls ~70% of on-chain perp open interest — making it the natural home for autonomous trading agents.

**The opportunity**: There is **no dominant agent framework** for Hyperliquid. The ecosystem is fragmented across individual bot scripts. HypeTerminal already has the foundation (agent wallets, 48+ exchange hooks, real-time WebSocket infrastructure, builder code support) to become **the** platform where agents trade on Hyperliquid.

**The thesis**: Every agent trade generates builder fee revenue. More agents → more volume → more revenue. Build the best tools for agents to trade, and monetize every transaction they make.

**Key numbers**:
- Hyperliquid builder codes: **$40M+ cumulative revenue** across all builders
- Phantom wallet alone: **~$36M/year** from Hyperliquid builder code
- PVP.Trade (single builder): **$7.2M lifetime**
- ~40% of Hyperliquid daily users already trade via third-party frontends
- HLP vault: **~17% APY** historically, spiking to **165-200% APY** during volatility

---

## 2. Current Foundation

### What HypeTerminal Already Has

**Hyperliquid SDK**: `@nktkas/hyperliquid` v0.31.0 with:
- `InfoClient` — REST queries (50+ methods)
- `ExchangeClient` — signed trading actions
- `SubscriptionClient` — WebSocket real-time data

**Trading Infrastructure**:
- 48+ exchange hooks (Order, Modify, TWAP, Cancel, Leverage, Margin, etc.)
- 30+ subscription hooks (L2Book, Trades, OpenOrders, ClearinghouseState, etc.)
- 60+ info hooks (Portfolio, UserDetails, Historical Orders, Funding, etc.)
- Order queuing system (`use-order-queue-store.ts`)
- Full order types: Market, Limit, TWAP, Scale, Batch, Stop/TP

**Agent Wallet Infrastructure**:
- `use-agent-wallet.ts` — agent wallet management
- `use-agent-registration.ts` — agent registration flow
- `useExchangeApproveBuilderFee` — builder fee approval
- `useExchangeAgentEnableDexAbstraction` — dex abstraction
- `useExchangeApproveAgent` — agent approval

**State Management**: Zustand stores with persist middleware, per-category market selection, sub-account support

**Existing Research**: 30+ research documents in `/research/` covering agentic landscape, multi-agent architecture, MCP trading tools, strategy research

### Tech Stack
- React 19 (compiler) + TanStack Router (SSR) + Zustand
- Wagmi + Viem for EVM wallet integration
- Zod v4, big.js, @base-ui/react, TailwindCSS v4, TradingView charts
- @lingui for i18n, @phosphor-icons/react

---

## 3. Hyperliquid Agent Infrastructure

### API Architecture

| Layer | Endpoint | Purpose |
|-------|----------|---------|
| REST | `https://api.hyperliquid.xyz/info` | Read-only queries (50+ methods) |
| REST | `https://api.hyperliquid.xyz/exchange` | Signed trading actions |
| WebSocket | `wss://api.hyperliquid.xyz/ws` | Real-time subscriptions |
| HyperEVM | Read precompiles at `0x...0800` | On-chain state queries |
| HyperEVM | CoreWriter at `0x333...333` | On-chain trading (15 action types) |

### Agent/API Wallet System

- Master account approves API wallets that sign on its behalf
- **Limits**: 1 unnamed + 3 named wallets per account; +2 named per sub-account
- API wallets **do NOT hold funds** — they only sign
- If compromised, attacker can only trade (not withdraw)
- Nonces tracked per signer (not per account); 100 highest nonces stored
- **Security**: Deregistered agent wallets have nonce state pruned — never reuse addresses

### Sub-Account System

- Sub-accounts don't have private keys; master signs with `vaultAddress` field
- Treated as separate users for rate limiting
- Enables **strategy isolation** and parallel agent execution

### Vault System

**HyperEVM Vaults (new)**:
- Fully customizable accounting via CoreWriter + precompiles
- EIP-4626 compatible tokenized vaults
- Trade via CoreWriter, delegate authorized agents
- Support spot + HIP-3 in all quote assets
- Fully on-chain accounting — transparent and auditable

**Legacy HyperCore Vaults**:
- Simpler, don't support HIP-3 or spot
- 10% leader profit share model

### Rate Limits

| Resource | Limit |
|----------|-------|
| REST requests | 1200 weighted/min per IP |
| WebSocket connections | 10 per IP |
| WS subscriptions | 1000 per IP |
| WS messages sent | 2000/min per IP |
| Address-based requests | 1 per 1 USDC traded + 10K buffer |
| Open orders | 1000 default, max 5000 |

### Order Types Available to Agents

| Type | Details |
|------|---------|
| Limit | GTC, IOC (immediate-or-cancel), ALO (post-only) |
| Market | Simulated via IOC limit with slippage |
| Trigger/Stop | TP and SL (market or limit), 10% slippage tolerance |
| TWAP | 30-sec suborders, 1-1440 min duration, 3% max slippage |
| Scale | Multiple limits across price range (ladder/grid) |
| Batch | Multiple orders in single request |
| Dead man's switch | `scheduleCancel` cancels all orders at future time |

### Available SDKs

| SDK | Language | Notes |
|-----|----------|-------|
| `hyperliquid-python-sdk` | Python | Official, 1.5K stars, requires Python 3.10 |
| `hyperliquid_rust_sdk` | Rust | Official, v0.6.0 |
| `@nktkas/hyperliquid` | TypeScript | Community, 358 stars, what we use |
| `hyperliquid-sdk-rs` | Rust | Community, simd-json, high-performance |
| CCXT | Python/JS/TS/C#/PHP/Go | Multi-exchange, simulates market orders |

### CoreWriter (On-Chain Agent Execution)

15 supported actions from smart contracts:
1. Limit orders (full parameter control)
2. Vault transfers
3. Token delegation
4. Staking deposit/withdraw
5. Spot send
6. USD class transfer
7. Cancel orders (by OID or CLOID)
8. Approve builder fee
9. Borrow/lend operations

**Constraint**: Order actions have built-in delay to prevent frontrunning.

### Pain Points & Gaps

1. **No native market orders** — must simulate via IOC limit with slippage
2. **Rate limiting tied to volume** — new accounts/low-volume strategies hit walls fast
3. **No official TypeScript SDK** — community-maintained creates production risk
4. **No backtesting infrastructure** — no official historical data API
5. **No unified agent framework** — fragmented individual bot scripts
6. **No standardized strategy interface** — each bot re-implements everything
7. **CoreWriter delay** — on-chain agents can't do latency-sensitive strategies
8. **Isolated margin only on HIP-3** — limits capital efficiency
9. **Python SDK stale** — requires Poetry v1, limited docs
10. **Nonce complexity** — 100-highest model creates subtle multi-process bugs

---

## 4. HIP-3 & Builder Economics

### HIP-3: Builder-Deployed Perpetuals

**What**: Permissionless deployment of perpetual futures markets on Hyperliquid.

**Requirements**:
- 500K HYPE stake on mainnet (~$5M+)
- Robust oracle implementation
- First 3 assets deploy without auction; additional via Dutch auction

**Fee Structure**:
- Users pay **2x normal fees** on HIP-3 markets
- Deployers receive **fixed 50% fee share**
- Standard discounts (staking, referral) still apply

**Slashing**:
- Up to 100% for invalid state transitions or prolonged downtime
- Up to 50% for brief downtime
- Up to 20% for performance degradation
- Burns are not redistributed

**Revenue Projections** (Messari):
- Base case 5% of HL perps volume → **$60M trading fees**, **$16M auction revenue**
- Deployers earn ~$30M, protocol ~$30M

### Builder Codes (Lower Barrier, Immediate Revenue)

| Feature | Builder Codes | HIP-3 |
|---------|--------------|-------|
| What | Per-order fee surcharge via frontend | Per-market fee share via deployment |
| Capital | 100 USDC minimum | 500,000 HYPE stake |
| Fee Cap | 0.1% perps, 1% spot | 50% of trading fees |
| Best For | Trading interfaces, wallets, tools | Market operators, exchange builders |

**How builder codes work**:
- Requires user approval via `ApproveBuilderFee` action
- Orders include `{"b": address, "f": feeAmount}`
- Each user supports up to 10 active builder code approvals
- Fees claimed through referral reward claim process

### Agent Implications

HIP-3 creates massive surface area for agent strategies:
- **Market making on long-tail assets** — first HIP-3 deployers need liquidity agents
- **Arbitrage** between HIP-3 and external venues
- **Builder-as-agent** — deploy market AND run automated liquidity, capturing 50% fee share
- Unified API means existing bots work on HIP-3 markets (just different asset IDs)

**Double monetization opportunity**:
- Builder fee on every trade execution (0.01-0.1%)
- Performance fee on strategy returns (10-20%)
- Every agent trade, vault rebalance, grid order, and copy trade generates builder fee revenue

---

## 5. AI Agent Frameworks Landscape

### Major Frameworks

#### ElizaOS (ai16z)
- Open-source multi-agent framework, most prominent in crypto
- Plugin-based: 90+ plugins (Discord, Telegram, Twitter, Ethereum, Solana, Uniswap, Aave)
- **Hyperliquid plugin exists** for spot trading
- Character files define agent personality/goals/actions declaratively
- RAG pipeline with vector DB for long-term memory
- Action/Evaluator/Provider pattern
- Used by >50% of new AI crypto projects in 2026

#### CrewAI
- Multi-agent collaboration with role-based design
- Trading crew: Analyst → Strategist → Executor → Risk Manager
- Sequential or hierarchical process flows
- Each agent can use different LLM models
- Separation of concerns mirrors actual trading desks

#### LangChain / LangGraph
- Most mature tool-calling and agent orchestration
- LangGraph enables stateful multi-step workflows as state machines
- LangSmith provides observability for debugging agent decisions
- ReAct and plan-and-execute agent patterns

#### Other Notable Frameworks

| Framework | Focus |
|-----------|-------|
| Virtuals Protocol | Agent tokenization on Base, 2200+ agents, $8B+ DEX volume |
| Autonolas/Olas | Decentralized agent network, agents as NFTs |
| DAIN Protocol | Decentralized agent-to-agent service discovery |
| Rig (Rust) | High-performance Rust agents for latency-sensitive trading |
| Goat | On-chain agent toolkit with DeFi protocol plugins |
| TradingAgents v0.2.0 | Multi-LLM ensemble (Claude + GPT + Gemini + Grok) |

### Established Bot Platforms

| Platform | Architecture | Strength |
|----------|-------------|----------|
| Hummingbot | Python async, 40+ connectors, open-source | Market making, arbitrage |
| Freqtrade | Python, mature backtesting, Docker deploy | Strategy development, hyperopt |
| 3Commas | Cloud SaaS, marketplace | Ease of use, signal marketplace |
| Jesse | Python, candle-based | Backtesting accuracy |

### No-Code / Visual Builders

| Platform | Model |
|----------|-------|
| Coinrule | If-this-then-that rules, 250+ templates |
| Bitsgap | Visual grid/DCA bot config with backtesting |
| Kryll.io | Drag-and-drop block-based strategy editor |
| Flowise/LangFlow | Visual LLM agent construction |

### Key Insight

**Hybrid approach wins**: Use LLMs for high-level decisions (what to trade, position sizing, risk) on a slow loop (minutes-hours). Use deterministic code for execution (order placement, order management) on a fast loop (milliseconds-seconds). LLM latency makes them unsuitable for HFT.

---

## 6. SDK & Platform Architecture

### Best-in-Class SDK Patterns

**From CCXT**: Unified API abstraction — same code across exchanges. Hierarchical error system. Token-bucket rate limiter. Exchange descriptor metadata pattern.

**From Alpaca**: Type-safe request model objects (MarketOrderRequest, LimitOrderRequest). Paper trading as first-class citizen (`paper=True`). Specialized clients per domain.

**From Hummingbot**: Three connector types (exchange, derivatives, protocol). Graceful degradation (WebSocket → REST fallback). InFlightOrder state machine tracking. Fee schema system.

**From NautilusTrader**: Same code for backtest and live (gold standard). Event-driven core with message bus. Rust core for performance, Python for strategy authoring.

### Recommended Strategy Interface

```typescript
interface Strategy {
  onInit(context: StrategyContext): void
  onTick(data: MarketData): Signal[]
  onFill(fill: OrderFill): void
  onError(error: TradingError): void
  teardown(): void
}
```

### TypeScript SDK Design Patterns

- **Discriminated unions** for order types (compiler enforces fields per type)
- **Branded types** for quantities/prices/symbols (prevent parameter mixing)
- **Zod schemas** for runtime validation of API responses
- **Result types** instead of thrown exceptions: `Result<Order, TradingError>`
- **Async iterators** for streaming: `for await (const trade of client.trades('BTC-PERP'))`
- **Typed event emitter**: `client.on('fill', (fill: OrderFill) => ...)`
- **Fluent builder**: `Order.market('BTC-PERP', 'buy', '0.1').withReduceOnly().build()`

### Order Management System (OMS)

**State Machine**: `PENDING → SUBMITTED → PARTIAL_FILL → FILLED / CANCELED / REJECTED / EXPIRED`

**Design Principles**:
- Event-sourced (every state change immutable, enables replay/audit)
- Strategy-level isolation (each strategy has virtual portfolio)
- Global aggregation across all strategies for risk management
- Idempotent operations for duplicate fill handling

### Risk Engine (Multi-Layered)

| Layer | Function | Example |
|-------|----------|---------|
| Pre-trade | Before order submission | Position size limits, margin checks |
| Portfolio | Continuous monitoring | Max drawdown, VaR, correlation |
| Circuit breaker | Emergency stops | Daily loss 3-5% → pause, drawdown 10-15% → halt |
| Kill switch | Nuclear option | Cancel all, close all, alert all channels |

### CLI for Agent Management

```
hyper agent create --strategy momentum --config config.yaml
hyper agent start / stop / status / logs
hyper strategy backtest --from 2024-01-01 --to 2024-12-31
hyper strategy paper --config config.yaml
hyper strategy deploy --env production
hyper risk status / kill / limits
```

### Recommended Architecture

```
                    ┌─────────────────────────────────┐
                    │         Message Bus              │
                    │   (typed events, pub/sub)        │
                    └──────┬──────┬──────┬──────┬─────┘
                           │      │      │      │
                    ┌──────┴──┐ ┌─┴────┐ ┌┴─────┴──┐ ┌────────┐
                    │  Data   │ │ Exec │ │  Risk   │ │Strategy│
                    │ Engine  │ │Engine│ │ Engine  │ │  (user)│
                    └────┬────┘ └──┬───┘ └────┬────┘ └────────┘
                         │         │          │
                    ┌────┴────┐ ┌──┴───┐ ┌────┴────┐
                    │  Data   │ │ Exec │ │  Risk   │
                    │Adapters │ │Client│ │ Rules   │
                    │(WS/REST)│ │      │ │         │
                    └─────────┘ └──────┘ └─────────┘
```

---

## 7. Agent Trading Verticals

### Tier 1: Proven & Monetizable Now

#### Copy Trading / Social Trading
- **Market**: $6.64B (2025), 9.7% CAGR
- **Models**: Binance 10% profit share, Bybit 11%, OKX 8-13%, Hyperliquid vaults 10%
- **Implementation**: User selects leader from leaderboard, allocates capital, system replicates proportionally
- **Revenue**: Performance fee + builder code on every replicated trade
- **Existing repos**: `Hyperliquid_Copy_Trader`, `copytrading-agent` on GitHub

#### Grid Trading Bots
- BingX alone: $670M+ in Grid bot allocations, 160K+ active users
- Every exchange now offers built-in grid bots
- Revenue: builder fee on every grid order fill

#### DCA Bots
- Lowest complexity, highest retail adoption
- Martingale variants increase position size after drawdowns
- Revenue: builder fee + subscription

#### Funding Rate Arbitrage
- Long spot + short perp, delta-neutral
- 0.01-0.1% every 8 hours → 10-100%+ annualized in favorable conditions
- Already productized by Phemex, Pionex, Binance
- Hummingbot has guides for Hyperliquid funding rate arbitrage

### Tier 2: High Value, More Complex

#### Automated Market Making
- HLP vault: ~17% APY, spiking to 165-200% during volatility
- Professional MMs: Wintermute ($5B+ daily), GSR, Auros
- Hummingbot: 14K+ stars, $34B+ user-generated volume
- Revenue: spread capture + liquidity incentives + builder fees

#### Liquidation Agents
- Monitor undercollateralized positions, execute for 5-15% reward
- HLP captured ~$15M in a single day (March 2025)
- Requires fast execution, deep market knowledge

#### Statistical Arbitrage
- Pairs trading, mean reversion on correlated assets
- Cross-exchange price differences
- Requires sub-50ms execution for cross-exchange arb

#### Delta-Neutral Strategies
- Combine spot long + futures short
- Earn from funding rates, basis spread, yield on collateral
- Requires continuous rebalancing

### Tier 3: Emerging / AI-Native

#### Natural Language Trading
- "If ETH drops 5% in 2 hours, buy 1 ETH" → auto-executes
- Capitalise.ai, TradeGPT, Nansen AI doing this already
- NLP in finance market: $8.6B (2026), $13.4B (2028)

#### LLM-Powered Sentiment Trading
- 1-unit increase in lagged sentiment predicts 0.24-0.25% rise in next-day returns
- AIXBT: 416 tokens promoted, 19% avg returns, 48% win rate
- Multi-LLM ensemble (TradingAgents): Claude + GPT + Gemini + Grok consensus

#### AI Portfolio Management
- Rebalancing agents, correlation monitoring, tax optimization
- Autonolas "AI Portfolio Manager" on Base/Optimism/Mode
- Users select strategy type, AI implements 24/7

#### Agent-Managed Vaults
- AI agents managing HyperEVM vaults autonomously
- Verifiable on-chain execution via CoreWriter
- Tokenized shares (EIP-4626)

### Tier 4: Future / Infrastructure

#### Sniper Bots
- Detect new token listings, buy within 50ms
- Emerging on HyperEVM for new launches
- Revenue: subscription or % of profits

#### Intent-Based Execution
- Users express trading intent, solver agents compete for best execution
- CoW Protocol, UniswapX, 1inch Fusion
- Agents can be both users (expressing intents) and solvers (filling them)

#### Agent-to-Agent Trading
- By 2027: majority of DEX volume expected to be agent-to-agent
- Prediction markets: Polymarket $44B+ volume in 2025
- Virtuals ACP: standardized agent coordination protocol

#### HIP-3 Market Making
- Deploy perp market AND run automated liquidity
- Capture 50% fee share + spread profits
- Requires 500K HYPE stake

---

## 8. Business Models & Revenue

### Revenue Model Comparison

| Model | Range | Alignment | Complexity |
|-------|-------|-----------|------------|
| Subscription | $19-99/mo | Low (charges regardless of performance) | Low |
| Performance Fee | 10-20% of profits | High (only earn when users profit) | Medium |
| Builder Fee | 0.01-0.1% per trade | Medium (earns on volume) | Low |
| Management Fee | 1-2% AUM/year | Medium | Low |
| Spread Markup | 0.5-3% | Low | Low |
| Marketplace Cut | 20-30% of creator earnings | High | Medium |

### Recommended Revenue Stack for HypeTerminal

**Layer 1 — Builder Code (Baseline, Immediate)**:
- 0.01-0.05% on every trade routed through HypeTerminal
- Every agent trade, copy trade, grid order, DCA buy generates revenue
- At $100M daily volume → $10K-50K/day → **$3.6M-18M/year**
- Zero friction — users already approve builder fees

**Layer 2 — Agent Subscription (Premium Features)**:
- Free tier: basic bots (grid, DCA)
- Pro tier ($29-99/mo): advanced strategies, backtesting, multi-agent, priority support
- Following 3Commas/Cryptohopper model

**Layer 3 — Performance Fee (Vaults/Copy Trading)**:
- 10-20% of profits on managed strategies
- High-water mark to prevent double-charging
- Aligns platform with user success

**Layer 4 — Strategy Marketplace (Network Effects)**:
- Creators publish strategies, users subscribe
- Platform takes 20-30% cut
- Creates flywheel: more strategies → more users → more volume → more builder fees

**Layer 5 — Data/Signal Feeds (Future)**:
- Machine-readable feeds for external agents
- Sentiment signals, order flow analytics
- Agent-to-agent signal marketplace with micropayments

### Revenue Benchmarks

| Platform | Revenue | Model |
|----------|---------|-------|
| eToro | $868M/year (2025) | Spreads + copy trading |
| 3Commas | Est. $50-100M/year | Subscriptions + marketplace |
| Phantom (from HL builder code) | ~$36M/year | Builder fees only |
| PVP.Trade | $7.2M lifetime | Builder fees |
| All HL builders combined | $40M+ cumulative | Builder fees |

---

## 9. Emerging Trends

### MCP (Model Context Protocol) for Trading

MCP is Anthropic's open standard (adopted by Microsoft, OpenAI, Google) for connecting AI to tools. Existing MCP servers for trading:

| Server | Scope |
|--------|-------|
| CCXT MCP | 20+ exchanges via universal translator |
| Hyperliquid MCP (edkdev) | Market data + positions + analytics |
| @hyperliquid-ai/mcp-server | npm package, full trading + data |
| Alpaca MCP | Stocks, ETFs, crypto, options |
| Paradex MCP | Perp futures |

**Opportunity**: Build the definitive Hyperliquid MCP server — become the gateway for any AI agent to trade on HL. Every Claude, GPT, or Gemini agent wanting to trade perps would route through HypeTerminal's MCP server → builder fee revenue.

### Agent Identity & Reputation

| Standard | Purpose |
|----------|---------|
| ERC-8004 | Verifiable agent identities + reputation on-chain |
| x402 Protocol | Pay-per-query agent payments (35M+ txns, $10M+ volume) |
| MCP-Identity | Cryptographic identities for software agents |
| Know Your Agent (KYA) | Digital Agent Passport for trust |

**Implication**: Agent leaderboards could use on-chain identity + verifiable track records. Trust without trusting individuals.

### Telegram/Discord Bot Trading

Top Telegram bots: Trojan (~2M users, $24B+ volume), Banana Gun (~600K users, $12B+), Maestro (~600K users, $13B+).

Architecture: Telegram Bot API → Backend → Smart Contract Layer → Wallet Management

**Opportunity**: HypeTerminal Telegram bot for Hyperliquid trading — natural language commands, position management, alerts.

### Intent-Based Trading

Users sign intents (not transactions) → Solvers compete for best execution → Batch settlement.

- CoW Protocol: strongest MEV protection
- UniswapX: broad liquidity routing
- 1inch Fusion: 13+ networks, gasless

**Relevance**: Agents expressing intents rather than managing execution complexity. Agents can also BE solvers.

### HyperEVM Integration

**Live now**: Read precompiles for querying perps positions, spot balances, oracle prices from smart contracts.

**Coming**: Write system contracts for placing orders from smart contracts → fully autonomous on-chain trading agents.

**What it enables**:
1. On-chain bots reading live order book prices
2. Dynamic collateral logic on real-time data
3. Automated vault strategies with composable DeFi
4. Cross-protocol integration (lending + perps + spot in one environment)

### TEEs (Trusted Execution Environments)

- Isolated processor areas for tamper-proof code execution at near-native speed
- Suitable for HFT, private order books, secure agent "brains"
- 50+ teams building TEE-based blockchain projects
- Agent in TEE analyzes markets; high-value trades require additional verification

### The Agent Token Narrative

- AI agent sector: peaked ~$27B, currently ~$3B after correction
- ElizaOS used by >50% of new AI crypto projects
- Virtuals Protocol: 2,200+ agents, $8B+ DEX volume
- Prediction: by 2027, majority of DEX volume may be agent-to-agent

---

## 10. Infrastructure & Operations

### 24/7 Agent Deployment

**Container-based (recommended)**:
- Docker per agent/strategy
- Auto-restart policies (`restart: always`)
- Health checks: heartbeat, data freshness, order sync, balance reconciliation

**Cloud options**:
- AWS ECS/EKS, GCP Cloud Run/GKE for containers
- Dedicated VPS near exchange for latency-sensitive strategies
- Railway/Fly.io/Render for simpler deployments

### Reliability Patterns

| Pattern | Implementation |
|---------|---------------|
| Health checks | Heartbeat every N seconds, data freshness < 30s, order state sync |
| Failover | Active-passive standby, state persisted to Redis/PostgreSQL |
| Dead man's switch | No report in X minutes → alert + optional position flattening |
| Reconnection | Exponential backoff (1s, 2s, 4s... max 60s), REST snapshot after reconnect |
| Idempotency | Unique client order IDs, timeout + cancel stale orders |
| Reconciliation | Periodic local vs exchange state verification |

### Common Failure Modes

| Failure | Mitigation |
|---------|------------|
| Exchange API down | Graceful degradation, protective stops |
| Stale market data | Freshness checks, auto-pause |
| Duplicate orders | Idempotent order IDs, deduplication |
| Position desync | Periodic reconciliation |
| Memory leak | Container resource limits, auto-restart |
| Key compromise | Session keys with limits, key rotation |
| Network partition | Pre-placed protective stops |

### Agent Wallet Security

**Hyperliquid-native (best pattern)**:
- Delegated agent wallets: bot signs, never holds funds
- If compromised: attacker can trade but not withdraw
- One API wallet per trading process
- Separate wallets per sub-account

**Additional security layers**:
- IP whitelisting for agent server IPs
- Rate limiting at both exchange and application level
- Maximum drawdown kills (3-5% daily, 10-15% total)
- Position size limits per agent
- Kill switch accessible from multiple devices

### Monitoring & Observability

**Metrics to track**:
- Real-time PnL (realized + unrealized)
- Maximum drawdown (current and historical)
- Sharpe/Sortino ratios (rolling)
- Win rate, profit factor, average win/loss
- Exposure by asset, direction
- Gas/transaction costs
- Agent decision latency (signal → order → fill)

**Stack**: Prometheus + Grafana for metrics, OpenTelemetry for traces, Telegram/PagerDuty for alerts, LangSmith/LangFuse for LLM agent observability.

---

## 11. Product Roadmap: What to Build

### Phase 1: Foundation (Immediate — Builder Fee Revenue)

**1a. Builder Code Integration**
- Route all HypeTerminal trades through builder code
- Immediate revenue on existing volume
- Barrier: 100 USDC
- Every manual trade, every agent trade generates revenue

**1b. Copy Trading / Social Trading**
- Leaderboard of top traders (human + AI)
- One-click copy with proportional replication
- 10% performance fee on profits
- Real-time position mirroring via WebSocket

**1c. Basic Bot Suite**
- Grid trading bot (proven, $670M+ at BingX alone)
- DCA bot (lowest complexity, highest retail adoption)
- Trailing stop-loss bot
- Configuration UI in HypeTerminal dashboard

### Phase 2: Agent Infrastructure (1-3 months)

**2a. Agent SDK (TypeScript-first)**
- Strategy interface: `onInit`, `onTick`, `onFill`, `onError`
- Event-driven core with typed message bus
- Paper trading as adapter swap (same code, different execution)
- Built-in risk engine (pre-trade checks, circuit breakers, kill switch)
- Order management system with event-sourced state machine

**2b. Agent Wallet Management UI**
- Create/register agent wallets from HypeTerminal
- Per-agent permissions (markets, max size, max leverage)
- Sub-account isolation per strategy
- Agent health dashboard (status, PnL, positions)

**2c. Strategy Backtesting**
- Historical data pipeline from Hyperliquid
- Vectorized backtesting for screening
- Event-driven simulation for realistic fills
- Walk-forward optimization
- Monte Carlo robustness testing

### Phase 3: AI-Powered Trading (3-6 months)

**3a. Natural Language Trading Interface**
- Chat-based commands: "long ETH 5x at market", "close all positions"
- Strategy definition in English: "buy BTC when RSI < 30 on 4h chart"
- Uses LLM to translate intent → Hyperliquid API calls
- Confirmation flow before execution

**3b. MCP Server for Hyperliquid**
- Expose full Hyperliquid trading as MCP tools
- Any Claude/GPT/Gemini agent can trade through HypeTerminal
- Every agent trade → builder fee revenue
- Open-source for ecosystem adoption

**3c. Sentiment & Signal Dashboard**
- LLM-powered social media analysis (Twitter, Discord, Telegram)
- On-chain flow monitoring (whale movements, exchange flows)
- Funding rate visualization and alerts
- Multi-LLM consensus signals

**3d. Advanced Strategies**
- Funding rate arbitrage bot
- Delta-neutral strategy agent
- Statistical arbitrage (pairs trading)
- Market making agent (inspired by HLP)

### Phase 4: Platform & Marketplace (6-12 months)

**4a. Strategy Marketplace**
- Creators publish strategies with verifiable track records
- Users subscribe and auto-deploy
- Platform takes 20-30% cut
- Strategy rating/ranking by performance metrics

**4b. Multi-Agent Orchestration**
- Portfolio manager agent coordinates specialists
- Risk management agent with override authority
- Hub-and-spoke architecture (coordinator + specialist agents)
- Capital allocation across strategies

**4c. Agent-Managed Vaults**
- HyperEVM vaults with AI agent managers
- Tokenized shares (EIP-4626)
- On-chain performance tracking
- Transparent, auditable, non-custodial

**4d. Telegram Bot**
- Trade Hyperliquid from Telegram
- Natural language commands
- Position alerts, PnL summaries
- Portfolio management

### Phase 5: Ecosystem & Scale (12+ months)

**5a. HIP-3 Market Operations**
- Deploy custom perp markets (requires 500K HYPE)
- Automated liquidity provision on deployed markets
- 50% fee share + spread profits

**5b. Intent-Based Execution**
- Users express trading intents
- Agent solver network competes for best execution
- MEV-protected, batch-settled

**5c. Agent Identity & Reputation**
- On-chain agent DIDs with verifiable track records
- ERC-8004 reputation registry
- Trust scores based on historical performance

**5d. Agent-to-Agent Marketplace**
- Signal marketplace: agents sell alpha to other agents
- Execution marketplace: agents compete to fill orders
- Data marketplace: machine-readable feeds priced via micropayments

---

## Appendix A: Competitive Landscape

| Competitor | Focus | Weakness |
|-----------|-------|----------|
| 3Commas | Multi-exchange bots | No AI, no HL-specific features |
| Cryptohopper | Strategy marketplace | No HL support, rule-based only |
| Hummingbot | Open-source MM | Complex setup, no UI |
| Freqtrade | Backtesting + live | Python only, no frontend |
| Telegram bots (Trojan, etc.) | Chat-based trading | Spot/DEX focus, no perps |
| ElizaOS | AI agent framework | General purpose, not trading-optimized |
| Hyperliquid native UI | Official frontend | No bots, no agents, no marketplace |

**HypeTerminal's moat**: Purpose-built for Hyperliquid + agent-first architecture + builder code monetization + existing trading infrastructure.

## Appendix B: Market Sizing

| Segment | Size (2025) | Growth |
|---------|-------------|--------|
| Crypto trading bot market | $47.4B | 14% CAGR → $200B by 2035 |
| Social/copy trading | $6.6B | 9.7% CAGR |
| Sniper bot subset | Projected $4.8B by 2033 | 15.5% CAGR |
| Blockchain AI market | $735M | 23.8% CAGR → $4B by 2033 |
| NLP in finance | $8.6B (2026) | → $13.4B by 2028 |
| AI agent tokens (crypto) | Peaked ~$27B | Currently ~$3B |

## Appendix C: Key Resources

**Hyperliquid Docs**:
- API: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
- HIP-3: https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-3
- Builder Codes: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes
- Vaults: https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/vaults
- CoreWriter: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/interacting-with-hypercore

**SDKs**:
- Python: https://github.com/hyperliquid-dex/hyperliquid-python-sdk
- Rust: https://github.com/hyperliquid-dex/hyperliquid-rust-sdk
- TypeScript: https://github.com/nktkas/hyperliquid
- CCXT: https://github.com/ccxt/ccxt

**Agent Frameworks**:
- ElizaOS: https://docs.elizaos.ai/
- CrewAI: https://github.com/joaomdmoura/crewAI
- LangGraph: https://langchain-ai.github.io/langgraph/
- Hummingbot: https://hummingbot.org/
- Freqtrade: https://www.freqtrade.io/

**MCP Servers**:
- Hyperliquid MCP: https://github.com/edkdev/hyperliquid-mcp
- CCXT MCP: via SkyWork
- @hyperliquid-ai/mcp-server on npm

**Existing Bots**:
- Copy Trader: https://github.com/MaxIsOntoSomething/Hyperliquid_Copy_Trader
- Copytrading Agent: https://github.com/Gajesh2007/copytrading-agent
- Grid Bot: https://github.com/SrDebiasi/hyperliquid-grid-bot
- Market Maker (Rust): https://github.com/Novus-Tech-LLC/Hyperliquid-Market-Maker
- AI Trading Bot: https://github.com/hyperliquid-ai-trading-bot/hyperliquid-ai-trading-bot
