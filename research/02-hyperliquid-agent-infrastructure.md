# Hyperliquid's Native Agent & Vault Infrastructure

_Research prepared for HypeTerminal — March 2026_

---

## Executive Summary

- **Agent wallets are production-ready**: Hyperliquid's agent wallet (API wallet) system provides permissioned signing without fund custody. Each account supports 1 unnamed + 3 named agents, plus 2 named agents per sub-account — enabling sophisticated multi-strategy architectures.
- **Vaults enable tokenized strategies**: On-chain strategy containers with CoreWriter integration allow EVM smart contracts to place orders, manage positions, and create tokenizable investment products. This is the native infrastructure for an agentic strategy marketplace.
- **HyperEVM bridges DeFi composability with HyperCore performance**: Smart contracts can read/write to HyperCore's order book via precompiles, enabling programmatic trading at 200K orders/sec with sub-second finality (~0.2s).
- **The TypeScript SDK is mature**: @nktkas/hyperliquid provides InfoClient, ExchangeClient, and transport abstractions for all major JS runtimes, making browser-based and server-side agent execution feasible.
- **Builder codes create a sustainable revenue model**: Fees up to 10 bps on perps (100 bps on spot) are set per-order and collected automatically, providing a clear monetization path for agentic trading features.

---

## Agent Wallets (API Wallets)

### What They Are

Agent wallets are permissioned signers that can execute Hyperliquid actions on behalf of a master account. They are the foundational primitive for programmatic trading on Hyperliquid.

**Key properties:**
- Do not hold or custody funds
- Can sign and submit orders, cancellations, and other exchange actions
- Authorized by the master account and revocable at any time
- Each agent wallet has its own nonce tracking (independent of master account)

### Permission Model

```
Master Account
├── Unnamed Agent (1)          — legacy/default API key
├── Named Agent "strategy-a"   — can trade master account
├── Named Agent "strategy-b"   — can trade master account
├── Named Agent "strategy-c"   — can trade master account
├── Sub-Account 1
│   ├── Named Agent (1)        — can trade sub-account 1
│   └── Named Agent (2)        — can trade sub-account 1
├── Sub-Account 2
│   ├── Named Agent (1)        — can trade sub-account 2
│   └── Named Agent (2)        — can trade sub-account 2
└── ...
```

**Limits per account:**
- 1 unnamed approved agent wallet
- Up to 3 named agent wallets on the master account
- Up to 2 named agents per sub-account

### Nonce Management

Nonces are tracked per signer (agent wallet address), not per master account. This is critical for multi-agent architectures:

- Each agent wallet maintains its own nonce sequence
- Nonces must be monotonically increasing per signer
- **Best practice**: Use a separate API wallet per trading process to avoid nonce collisions
- If multiple processes share an agent wallet, nonce coordination becomes a concurrency problem

### How to Approve an Agent

Agent approval is done via the `approveAgent` exchange action, which authorizes a specific wallet address to sign on behalf of the master account or a sub-account. The approval specifies:

- The agent's public address
- An optional name (for named agents)
- The scope (master account or specific sub-account)

### Signing for Sub-Accounts and Vaults

Sub-accounts and vaults do not have private keys. To perform actions on behalf of a sub-account or vault:

1. Sign with the master account's key (or an approved agent wallet)
2. Set the `vaultAddress` field to the address of the target sub-account or vault
3. Query data using the actual sub-account/vault address (not the signer)

---

## Sub-Accounts

### Architecture

Sub-accounts provide isolated margin and position management under a single master account. They are designed for:

- **Strategy isolation**: Run independent strategies without cross-contamination
- **Risk segregation**: Limit exposure per strategy or asset class
- **Agent separation**: Assign dedicated agents to specific sub-accounts

### Capabilities

- Independent margin (cross or isolated per sub-account)
- Independent positions and orders
- Can be traded via master account signature with `vaultAddress` field
- Up to 2 named agent wallets per sub-account

### Implications for Agentic Trading

The sub-account + agent wallet architecture maps naturally to a multi-agent system:

| Component | Maps To |
|-----------|---------|
| Master Account | User's primary account |
| Sub-Account 1 | Long-term portfolio strategy |
| Sub-Account 2 | Active trading / scalping strategy |
| Sub-Account 3 | Hedging / risk management strategy |
| Agent per sub-account | Autonomous strategy executor |

Each sub-account provides isolated risk with its own agent, meaning a malfunctioning agent on sub-account 2 cannot affect positions on sub-account 1.

---

## Vaults

### What They Are

Vaults are on-chain strategy containers on Hyperliquid that enable:

- Pooled capital management (multiple depositors)
- Programmatic trading via the vault leader
- Tokenizable shares (via HyperEVM)
- Full on-chain transparency of positions and performance

### CoreWriter Integration

Vaults can be managed programmatically through CoreWriter, the permissionless interface for EVM-to-HyperCore communication:

- **Contract address**: `0x3333333333333333333333333333333333333333`
- **Capabilities**: Place limit orders, market orders, cancel orders, transfer spot tokens, manage vault operations, stake HYPE
- **Execution model**: CoreWriter actions are queued during EVM block execution, then executed atomically within the Core block. This ensures deterministic state transitions.

### EVM Precompiles for Data Access

Smart contracts can query HyperCore state through precompile addresses:

| Address | Function |
|---------|----------|
| `0x800` | Position information queries |
| `0x801` | Spot balance queries |
| `0x802` | Vault asset value queries |

These precompiles allow on-chain strategies to make informed decisions using real-time HyperCore data within the same transaction.

### Tokenizable Vaults

Through HyperEVM, builders can create vaults with:

- Fully customizable accounting logic
- Tokenized shares (ERC-20 compatible)
- Programmable fee structures
- Custom entry/exit conditions
- On-chain performance tracking

This is the native infrastructure for an **agentic strategy marketplace**: users invest in tokenized vault shares, where the vault's trading is managed by an autonomous agent.

---

## HyperEVM

### Architecture

HyperEVM is a full EVM execution environment running on the same consensus layer (HyperBFT) as HyperCore:

- **Gas token**: HYPE
- **Consensus**: HyperBFT (shared with HyperCore)
- **Status**: Alpha (mainnet since early 2025)
- **Throughput**: Up to 200,000 orders/sec on HyperCore
- **Finality**: Sub-second (~0.2s average)

### Smart Contract Capabilities

Smart contracts on HyperEVM can:

1. **Read HyperCore data** via precompile contracts (positions, balances, prices)
2. **Write to HyperCore** via CoreWriter (place orders, manage vaults, transfer tokens)
3. **Compose with other EVM contracts** (standard DeFi composability)
4. **Access oracle prices** from HyperCore directly

### Integration Flow

```
User/Agent → EVM Smart Contract → CoreWriter (0x333...333) → HyperCore Order Book
                                    ↑
                              Precompiles (0x800-0x802) ← HyperCore State
```

### Implications for Agentic Trading

HyperEVM enables on-chain agent logic that goes beyond simple order execution:

- **Automated liquidation protection**: Contracts that monitor position health and deleverage before liquidation
- **Cross-protocol strategies**: Borrow on a lending protocol, hedge on HyperCore perps, all in one transaction
- **Programmable risk management**: On-chain circuit breakers, position size limits, drawdown controls
- **Verifiable execution**: All agent actions are on-chain and auditable

---

## The TypeScript SDK (@nktkas/hyperliquid)

### Overview

The community-maintained TypeScript SDK provides comprehensive access to Hyperliquid's API:

- **Runtime support**: Node.js, Deno, Bun, browser
- **100% TypeScript** with full type coverage
- **Minimal dependencies**
- **Wallet integration**: viem or ethers
- **Package**: `@nktkas/hyperliquid` (npm/jsr)

### Client Architecture

```typescript
import { HttpTransport, InfoClient, ExchangeClient } from "@nktkas/hyperliquid";

const transport = new HttpTransport({ url: "https://api.hyperliquid.xyz" });

// Read-only data queries
const info = new InfoClient({ transport });

// Authenticated trading actions
const exchange = new ExchangeClient({ transport, wallet });
```

### InfoClient — Data Queries

The InfoClient provides read-only access to all Hyperliquid data:

| Method Category | Examples |
|----------------|----------|
| Market metadata | `meta()`, `spotMeta()`, `allMids()` |
| User state | `clearinghouseState()`, `openOrders()`, `userFills()` |
| Order book | `l2Book()` |
| Funding | `fundingHistory()`, `predictedFundings()` |
| Vault data | `vaultDetails()` |
| Historical | `candleSnapshot()`, `userFillsByTime()` |

### ExchangeClient — Trading Actions

The ExchangeClient handles all authenticated actions:

| Action | Description |
|--------|-------------|
| `placeOrder()` | Place single or batch orders (limit, market, trigger) |
| `cancelOrder()` | Cancel by order ID or CLOID |
| `modifyOrder()` | Modify existing orders |
| `batchModifyOrders()` | Batch modify multiple orders |
| `updateLeverage()` | Set leverage for a market |
| `updateIsolatedMargin()` | Adjust isolated margin |
| `approveAgent()` | Authorize an agent wallet |
| `vaultTransfer()` | Deposit/withdraw from vaults |

**Note**: The SDK automatically removes trailing zeros from price and size values when submitting orders.

### WebSocket Subscriptions

Real-time data via WebSocket:

| Subscription | Data |
|-------------|------|
| `l2Book` | Order book snapshots (levels, time) |
| `trades` | Trade updates (WsTrade arrays) |
| `candle` | Candlestick updates (1m, 5m, 15m, 1h, 4h, 1d, etc.) |
| `orderUpdates` | User order status changes |
| `userFills` | User trade fills |

**Connection limits**: 100 simultaneous connections, 1,000 subscriptions per connection on the public endpoint.

### Relevance to HypeTerminal

The SDK already powers HypeTerminal's data layer (via `hl-react` hooks like `useSubL2Book`, `useSubTrades`). For agentic features, the ExchangeClient can be used server-side for agent execution while the InfoClient and WebSocket subscriptions continue to power the real-time UI.

---

## API Endpoints

### Info Endpoint (Read-Only)

Base URL: `https://api.hyperliquid.xyz/info`

All requests are POST with JSON body containing a `type` field:

| Type | Returns |
|------|---------|
| `meta` | Perpetual market metadata (universe, fee schedule) |
| `spotMeta` | Spot market metadata |
| `allMids` | Current mid prices for all markets |
| `l2Book` | Level 2 order book for a specific market |
| `clearinghouseState` | User's positions, margin, account value |
| `openOrders` | User's open orders |
| `userFills` | User's recent fills |
| `fundingHistory` | Historical funding rates |
| `candleSnapshot` | Historical candle data |
| `vaultDetails` | Vault information and performance |

### Exchange Endpoint (Authenticated)

Base URL: `https://api.hyperliquid.xyz/exchange`

All requests require EIP-712 signature authentication:

| Action Type | Description |
|-------------|-------------|
| `order` | Place orders (limit, market, trigger) |
| `cancel` | Cancel orders |
| `modify` | Modify existing orders |
| `batchModify` | Batch order modifications |
| `updateLeverage` | Set leverage |
| `updateIsolatedMargin` | Adjust margin |
| `approveAgent` | Authorize agent wallet |
| `vaultTransfer` | Vault deposit/withdraw |
| `approveBuilderFee` | Approve builder fee for a builder |

### Asset Indexing

- **Perpetuals**: Asset index from `meta.universe` array (e.g., BTC = 0, ETH = 1)
- **Spot**: `10000 + index` from `spotMeta.universe` (e.g., PURR/USDC = 10000)

---

## Order Types

### Standard Orders

| Type | Description | Key Parameters |
|------|-------------|----------------|
| **Market** | Execute immediately at best available price | `sz`, `isBuy` |
| **Limit (GTC)** | Good-til-cancelled limit order | `px`, `sz`, `isBuy` |
| **Limit (ALO)** | Add Liquidity Only (post-only) | `px`, `sz`, `isBuy`, `postOnly: true` |
| **Limit (IOC)** | Immediate-or-Cancel | `px`, `sz`, `isBuy`, `timeInForce: "Ioc"` |

### Advanced Orders

| Type | Description | Details |
|------|-------------|---------|
| **TWAP** | Time-Weighted Average Price | Split into sub-orders at 30-second intervals. 3% max slippage per sub-order. |
| **Scale** | Distribute orders across a price range | Multiple limit orders placed at intervals |
| **TP/SL** | Take-Profit / Stop-Loss triggers | Can be market or limit execution. Trigger price + order price. |
| **OCO** | One-Cancels-Other | Linked TP and SL that cancel each other on fill |

### TWAP Details

- Large orders divided into sub-orders executed every 30 seconds
- Each sub-order has a maximum slippage of 3%
- Useful for reducing market impact on large positions
- Relevant for agent strategies that need to build/exit positions gradually

---

## Builder Codes and Fee Structure

### How Builder Codes Work

Builder codes allow frontends and agents to collect fees on trades they facilitate:

1. **Builder registers** a builder code (requires 100+ USDC in perps account value)
2. **User approves** a maximum builder fee for that builder (revocable at any time)
3. **Orders include** the builder code and fee parameter
4. **Fees are collected** automatically on each fill

### Fee Parameters

| Market Type | Max Builder Fee | Fee Unit |
|-------------|----------------|----------|
| Perpetuals | 0.10% (10 bps) | Tenths of basis points (f: 100 = 10 bps) |
| Spot | 1.00% (100 bps) | Tenths of basis points |

The `f` parameter is specified in tenths of basis points:
- `f: 1` = 0.1 bps (0.001%)
- `f: 10` = 1 bp (0.01%)
- `f: 50` = 5 bps (0.05%)
- `f: 100` = 10 bps (0.10%) — max for perps

### Base Trading Fees (Hyperliquid Native)

Hyperliquid's native fee structure is tiered by volume:

| Tier | 14-Day Volume | Maker Fee | Taker Fee |
|------|--------------|-----------|-----------|
| Default | < $5M | 0.010% | 0.035% |
| Higher tiers | Up to $5B+ | 0.000% | 0.015% |

Builder fees are **in addition to** native trading fees.

### Revenue Model Implications

For HypeTerminal with agentic features:

| Scenario | Daily Volume Captured | Builder Fee | Daily Revenue | Annual Revenue |
|----------|----------------------|-------------|---------------|----------------|
| Conservative | $10M | 3 bps | $3,000 | $1.1M |
| Moderate | $50M | 5 bps | $25,000 | $9.1M |
| Aggressive | $200M | 5 bps | $100,000 | $36.5M |

At Hyperliquid's current ~$5B daily perps volume, capturing even 1% with a 5 bps builder fee yields significant revenue.

---

## Gap Analysis: What Exists vs What's Needed

### What Hyperliquid Provides

| Infrastructure | Status | Notes |
|---------------|--------|-------|
| Agent wallets | Production | Permissioned signing, no fund custody |
| Sub-accounts | Production | Isolated margin, per-account agents |
| Vaults | Production | Pooled capital, leader-managed |
| CoreWriter | Production (Alpha) | EVM-to-HyperCore write access |
| Precompiles | Production (Alpha) | On-chain data queries |
| TypeScript SDK | Production | Full API coverage |
| WebSocket feeds | Production | Real-time market data |
| Builder codes | Production | Per-order fee collection |
| Order types | Production | Market, limit, TWAP, trigger, scale |
| HyperEVM | Alpha | Full EVM with HyperCore integration |

### What's Missing for Agentic Trading

| Gap | Description | Severity |
|-----|-------------|----------|
| **Strategy execution engine** | No native way to define and run multi-step trading strategies | High |
| **Risk management layer** | No built-in drawdown limits, position size controls, or circuit breakers at the agent level | High |
| **Backtesting infrastructure** | No historical simulation environment for strategies | High |
| **Natural language interface** | No NLP layer for conversational trading | Medium |
| **Strategy marketplace** | No discovery, rating, or deployment system for agent strategies | Medium |
| **Performance analytics** | No standardized metrics (Sharpe, drawdown, win rate) for agent performance | Medium |
| **Agent monitoring dashboard** | No real-time view of what agents are doing and why | Medium |
| **Cross-account coordination** | Limited ability to coordinate strategies across sub-accounts | Low |
| **Event-driven triggers** | No native system for triggering agent actions on market events (beyond price triggers) | Low |
| **Simulation/paper trading** | Testnet exists but no integrated paper trading mode | Low |

### What HypeTerminal Needs to Build

1. **Agent orchestration layer**: Manage strategy lifecycle (create, configure, start, monitor, stop) using Hyperliquid's agent wallets and sub-accounts
2. **Risk management framework**: Position limits, drawdown controls, exposure limits, kill switches — enforced before orders reach Hyperliquid
3. **Strategy definition format**: A way to express trading strategies that agents can execute (could be natural language, visual builder, or code)
4. **Performance tracking**: Real-time and historical metrics for each agent/strategy
5. **User permission controls**: Granular approval of what each agent can do (markets, position sizes, order types)

---

## Opportunities for HypeTerminal

### 1. Copilot-Assisted Trading (Near-Term)

Use AI to enhance the existing terminal experience:

- **Natural language order entry**: "Buy 1 ETH perp at 5x leverage with a 2% stop loss"
- **Market analysis on demand**: "What's the funding rate trend for BTC this week?"
- **Position management suggestions**: "My ETH position is 3x underwater — what are my options?"
- **Risk alerts**: Proactive warnings about liquidation risk, funding costs, correlation exposure

**Infrastructure needed**: LLM integration, ExchangeClient for execution, InfoClient for context.

### 2. Automated Strategy Execution (Medium-Term)

Allow users to define and run autonomous strategies:

- **Pre-built strategies**: DCA, grid trading, momentum, mean reversion — configured via UI
- **Custom strategies**: User-defined logic with guardrails
- **Agent wallet per strategy**: Isolated execution via Hyperliquid's native agent wallets
- **Sub-account isolation**: Each strategy runs in its own sub-account for risk segregation

**Infrastructure needed**: Strategy engine, agent wallet management, sub-account provisioning, risk framework.

### 3. Strategy Marketplace (Long-Term)

Create an ecosystem of tradeable strategies:

- **Vault-based deployment**: Each strategy runs as a Hyperliquid vault
- **Tokenized shares**: Users invest in vault tokens
- **Performance leaderboards**: On-chain verified track records
- **Builder code revenue sharing**: Strategy creators earn via builder fees
- **Social layer**: Follow, copy, and remix successful strategies

**Infrastructure needed**: Vault management via CoreWriter, EVM contracts for tokenization, rating/discovery system.

### 4. Institutional-Grade Agent Infrastructure (Long-Term)

Serve professional traders and funds:

- **Multi-agent coordination**: Multiple strategies running across sub-accounts with global risk limits
- **Compliance integration**: Audit trails, position reporting, exposure monitoring
- **API-first agent deployment**: Headless agent execution for quant teams
- **Custom data feeds**: Premium market data, alternative data integration

**Infrastructure needed**: Advanced risk engine, reporting, API gateway, data pipeline.

---

## Risks and Challenges

### Technical

- **HyperEVM is still in alpha**: Building critical infrastructure on alpha-stage smart contracts carries risk. CoreWriter bugs could lead to fund loss or stuck positions.
- **WebSocket connection limits**: 100 connections / 1,000 subscriptions may be insufficient for multi-agent architectures monitoring many markets simultaneously.
- **Agent wallet limits**: 3 named agents per master + 2 per sub-account may be constraining for users running many strategies. This is a hard protocol limit.
- **Nonce collisions**: Multi-agent systems sharing accounts must carefully coordinate nonces. Race conditions can cause order rejections.
- **Latency budget**: AI inference (100-500ms) + network latency + Hyperliquid finality (200ms) = 300-700ms minimum per agent decision cycle. For some strategies this is too slow.

### Security

- **Agent wallet key management**: Agent wallets still have private keys that must be secured. Browser-based key storage is inherently less secure than TEE-based solutions like OKX's Agentic Wallet.
- **Permission scope**: Agent wallets can execute any trade type on their approved account/sub-account. There's no protocol-level way to restrict an agent to specific markets or position sizes — this must be enforced at the application layer.
- **Smart contract risk**: CoreWriter interactions are irreversible. A bug in the application layer that sends malformed CoreWriter actions could result in unintended trades.

### Business

- **Builder code approval friction**: Users must explicitly approve builder fees per builder. This adds a step to onboarding that could reduce adoption.
- **Competition from Hyperliquid native**: Hyperliquid itself could build agentic features directly into the platform, commoditizing third-party terminal features.
- **Vault regulatory risk**: Tokenized vault shares could be classified as securities, creating compliance obligations.

---

## Open Questions

1. **Server-side vs client-side agent execution?** Running agents server-side provides reliability and lower latency but requires users to trust HypeTerminal with agent wallet keys. Client-side execution (browser) keeps keys local but is unreliable (tab closes, network drops).

2. **How to handle the agent wallet limit?** With only 3 named agents per account + 2 per sub-account, how should HypeTerminal allocate agents across strategies? Should one agent serve multiple strategies, or should each strategy get a dedicated agent?

3. **Should strategies execute via CoreWriter (on-chain) or the Exchange API (off-chain signing)?** CoreWriter provides on-chain verifiability but adds EVM gas costs and latency. The Exchange API is faster and free but execution is off-chain.

4. **What is the right abstraction for strategy definition?** Options range from natural language ("buy dips and sell rips on ETH") to visual flow builders to TypeScript SDK code. Each has different user segments.

5. **How to handle vault creation and management?** Should HypeTerminal create vaults on behalf of users, or should users create vaults directly and connect them to HypeTerminal? Who is the vault leader?

6. **What data should agents have access to?** HyperCore data (order book, trades, funding) is available via the SDK. But agents may also need external data (CEX prices, news, social sentiment). How to integrate external data sources?

7. **How to price agentic features?** Builder codes provide transaction-based revenue. But should there also be subscription tiers for AI features, strategy slots, or premium data?

8. **What happens when agents conflict?** If a user runs a long strategy and a hedging strategy on the same asset via different sub-accounts, how should the system handle conflicting signals?

9. **How to build trust in autonomous execution?** What transparency features are needed — real-time activity logs, decision explanations, performance attribution, simulated vs live comparison?

10. **What is the migration path?** How to move users from manual trading to copilot-assisted to semi-autonomous to fully autonomous, with appropriate guardrails at each stage?

---

## Sources

- [Hyperliquid Docs: Nonces and API Wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets)
- [Hyperliquid Docs: Exchange Endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)
- [Hyperliquid Docs: Info Endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)
- [Hyperliquid Docs: WebSocket Subscriptions](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions)
- [Hyperliquid Docs: Vaults](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/vaults)
- [Hyperliquid Docs: Order Types](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types)
- [Hyperliquid Docs: Builder Codes](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes)
- [Hyperliquid Docs: Fees](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees)
- [Hyperliquid Docs: HyperEVM](https://hyperliquid.gitbook.io/hyperliquid-docs/hyperevm)
- [Hyperliquid Docs: Interacting with HyperCore](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/interacting-with-hypercore)
- [Privy Docs: Agent Wallets](https://docs.privy.io/recipes/hyperliquid/agents-and-subaccounts)
- [Privy Docs: Builder Codes](https://docs.privy.io/recipes/hyperliquid/builder-codes)
- [Dwellir: approveAgent](https://www.dwellir.com/docs/hyperliquid/approveAgent)
- [Dwellir: Hyperliquid Builder Codes](https://www.dwellir.com/blog/hyperliquid-builder-codes)
- [Ambit Labs: Demystifying Precompiles and CoreWriter](https://medium.com/@ambitlabs/demystifying-the-hyperliquid-precompiles-and-corewriter-ef4507eb17ef)
- [HypeRPC: CoreWriter Guide](https://hyperpc.app/blog/hyperliquid-corewriter)
- [HypeRPC: Hyperliquid Data API](https://hyperpc.app/blog/hyperliquid-data-api-explained)
- [@nktkas/hyperliquid GitHub](https://github.com/nktkas/hyperliquid)
- [@nktkas/hyperliquid JSR](https://jsr.io/@nktkas/hyperliquid)
- [Hyperliquid Trading in 2026](https://onekey.so/blog/ecosystem/hyperliquid-trading-in-2026-whats-changed-best-wallets-4ded7b/)
- [Hyperliquid Fee Structure](https://onekey.so/blog/ecosystem/hyperliquid-fee-structure-how-to-optimize-trading-costs-45c553/)
- [Chainstack: Place Order](https://docs.chainstack.com/reference/hyperliquid-exchange-place-order)
- [ASXN Hyperliquid Dashboard](https://stats.hyperliquid.xyz/)
- [Hyperliquid on DefiLlama](https://defillama.com/protocol/hyperliquid)
- [Hyperliquid Token Jumps 35% — Benzinga](https://www.benzinga.com/crypto/cryptocurrency/26/03/51148880/hyperliquid-token-jumps-35-to-top-billion-dollar-crypto-charts-in-2026-oil-trading-volume-skyrockets-on-platform)
