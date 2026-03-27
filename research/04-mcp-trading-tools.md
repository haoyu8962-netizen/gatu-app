# MCP (Model Context Protocol) for Trading

## Executive Summary

- **MCP is the emerging standard for connecting AI agents to external tools and data**, created by Anthropic and now co-developed with OpenAI. It provides a universal JSON-RPC messaging layer that replaces bespoke API integrations with a single protocol for tool discovery, invocation, and data access.
- **The finance/trading MCP ecosystem has matured rapidly in 2026**, with production servers from Alpha Vantage, Financial Datasets, VARRD, FactSet, and multiple crypto-specific providers. Over 20 live blockchain MCP tools are already processing real-time data and executing trades.
- **MCP's 2026 roadmap focuses on production hardening**: stateless Streamable HTTP transport for horizontal scaling, MCP Server Cards for dynamic discovery, enterprise governance (audit trails, SSO), and the Tasks primitive for long-running operations -- all critical for trading infrastructure.
- **The paradigm is shifting from dashboards to structured tool-driven interfaces**: MCP Apps (January 2026, co-developed by Anthropic and OpenAI) enables interactive UI widgets inside AI chat, transforming agents from text-only assistants into application platforms.
- **HypeTerminal can expose its Hyperliquid trading features as MCP tools**, enabling any AI agent (Claude, GPT, Gemini) to read orderbooks, manage positions, execute trades, and analyze portfolios through a standardized interface -- positioning HypeTerminal as the MCP gateway to Hyperliquid.

---

## 1. What is MCP and Why It Matters for Trading

### Protocol Overview

The Model Context Protocol (MCP) is an open standard that defines how AI applications interact with external systems through clearly defined **tools** (functions agents can call), **resources** (data agents can read), and **prompts** (templates for common interactions). It uses JSON-RPC 2.0 as its messaging format.

**Before MCP**: Each AI integration required custom API wrappers, authentication handling, response parsing, and error management. A trading agent connecting to 5 data sources needed 5 separate integrations.

**After MCP**: A single protocol standard. The agent discovers available tools via MCP, calls them with structured inputs, and receives structured outputs. Adding a new data source means registering a new MCP server -- no agent code changes.

### Why Trading Needs MCP

Trading is inherently tool-heavy. A competent trading decision requires:

- Market data (prices, orderbook depth, funding rates)
- Portfolio state (positions, margin, unrealized PnL)
- Historical data (candles, volume profiles, trade history)
- External signals (news, sentiment, on-chain analytics)
- Execution capabilities (place orders, modify positions, set stop-losses)

Without MCP, each of these is a bespoke integration. With MCP, they become standardized tools that any agent can discover and use, regardless of which LLM provider powers it.

### Core Architecture

```
+------------------+     JSON-RPC      +------------------+
|   AI Agent       | <===============> |   MCP Server     |
|   (Claude, GPT)  |                   |   (Trading Tools)|
|                  |   tools/list      |                  |
|  - Discovers     |   tools/call      |  - Orderbook     |
|    available     |   resources/read  |  - Positions     |
|    tools         |                   |  - Execute Trade |
|  - Calls tools   |                   |  - Risk Metrics  |
|  - Reads data    |                   |  - Market Data   |
+------------------+                   +------------------+
```

---

## 2. Existing MCP Servers for Finance

### 2.1 Alpha Vantage MCP

The official Alpha Vantage MCP server provides real-time and historical stock market data for LLM workflows.

**Tools exposed**:
- Stock quotes (real-time and historical)
- Technical indicators (SMA, EMA, RSI, MACD, Bollinger Bands)
- Fundamental data (income statements, balance sheets, cash flow)
- Forex and crypto price data
- Economic indicators

**Strength**: Broad coverage across asset classes. Officially supported. Well-documented.

### 2.2 Financial Datasets MCP

Open-source MCP server providing structured financial statement data.

**Tools exposed**:
- Income statements, balance sheets, cash flow statements
- Stock price history
- Market news and events

**Strength**: Clean, structured data specifically designed for LLM consumption.

### 2.3 VARRD

The primary production MCP server purpose-built for validated quantitative research (2026).

**Tools exposed** (7 tools over Streamable HTTP):
- `research` -- Execute quantitative research queries
- `scan` -- Screen instruments by criteria
- `search` -- Semantic search across research outputs
- `get_hypothesis` -- Retrieve and validate trading hypotheses
- `autonomous_research` -- Self-directed multi-step research

**Strength**: Production-grade, Streamable HTTP transport, designed for quant workflows.

### 2.4 FactSet MCP

Enterprise-grade MCP server from FactSet for institutional financial data.

**Tools exposed**:
- Company fundamentals and filings
- Market data and analytics
- Corporate actions and events
- Portfolio analytics

**Strength**: Institutional-quality data. Enterprise governance and compliance.

### 2.5 MCP-Trader (MaverickMCP)

Open-source MCP server for stock traders with 20+ technical indicators.

**Tools exposed**:
- `analyze-stock` -- Full technical analysis on a symbol
- Technical indicators (SMA, EMA, RSI, MACD, Bollinger Bands, etc.)
- Relative strength calculations
- Volume profile analysis
- Pattern recognition
- Pre-seeded with 520 S&P 500 stocks

**Strength**: Comprehensive technical analysis in a single MCP server.

### 2.6 Crypto/DeFi MCP Servers

Multiple MCP servers target crypto trading specifically:

| Server | Coverage | Key Feature |
|--------|----------|-------------|
| **Sharpe AI (HiveIntelligence)** | 60+ blockchains | Enterprise-grade, multi-chain |
| **Tatum** | 40+ blockchain protocols | Unified framework, thousands of assets |
| **DeFi Trading Agent MCP** | 17+ blockchains | Autonomous trading agent with portfolio management |
| **CoinGecko MCP** | Broad crypto | Token data, market cap, volume |
| **Jupiter Exchange MCP** | Solana DeFi | Token swaps, price quotes, PnL |
| **WAIaaS** | EVM + Solana | 59+ tools: swap, lend, stake, bridge, perps |

---

## 3. MCP 2026 Roadmap

The MCP project published its [2026 roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/) on March 9, 2026, with four focus areas:

### 3.1 Streamable HTTP at Scale

**Problem**: MCP's Streamable HTTP transport lets servers run as remote services, but stateful sessions fight with load balancers, and horizontal scaling requires workarounds.

**Solution**: Evolve Streamable HTTP to run statelessly across multiple server instances, with defined session creation, resumption, and migration so server restarts and scale-out are transparent to clients.

**Trading impact**: Critical for a Hyperliquid MCP server that must handle concurrent agent connections without session affinity requirements.

### 3.2 MCP Server Cards

A standard for exposing structured server metadata via a `.well-known` URL, enabling:
- **Autoconfiguration**: Agents discover server capabilities before connecting
- **Automated discovery**: Registries crawl and index available servers
- **Static security validation**: Verify authentication requirements without a live connection
- **Reduced latency**: UI hydration without full handshake

**Trading impact**: An agent could automatically discover "HypeTerminal MCP Server" at `hypeterminal.com/.well-known/mcp-server-card`, learn it offers orderbook, positions, and trade execution tools, and configure itself without manual setup.

### 3.3 Tasks Primitive

Long-running operations that don't complete within a single request-response cycle.

**Trading impact**: Backtesting, portfolio optimization, and complex analysis workflows that take minutes to complete. The agent starts a task, receives a task ID, and polls for completion.

### 3.4 Enterprise Readiness

Audit trails, SSO integration, and governance controls for production financial deployments.

**Timeline**: SEPs (Spec Enhancement Proposals) to be finalized Q1 2026, with inclusion in the next specification release tentatively slated for June 2026.

---

## 4. The Shift from Dashboards to Tool-Driven Interfaces

### MCP Apps (January 2026)

On January 26, 2026, Anthropic and OpenAI jointly released **MCP Apps** -- the first official extension to MCP that enables interactive UI widgets (dashboards, forms, charts, data tables) to render directly inside AI chat interfaces.

**What this means for trading**:

| Before (Dashboard Era) | After (Tool-Driven Era) |
|------------------------|------------------------|
| User opens a trading dashboard | User asks agent: "Show me my ETH position risk" |
| Navigates to positions tab | Agent calls MCP tool, renders interactive position card |
| Clicks to modify order | User says: "Tighten my stop to -2%" |
| Fills out order form | Agent calls trade execution tool with parameters |
| Checks multiple screens for context | Agent synthesizes data from multiple tools into a unified view |

**Key insight**: MCP Apps transforms AI chatbots from conversation tools into application platforms. Trading terminals become pluggable components within agent interfaces. The user interacts with a single AI surface that orchestrates the underlying tools.

### Implications for HypeTerminal

HypeTerminal's React components (orderbook, positions, chart) could be exposed as MCP App widgets that render inside Claude, GPT, or any MCP-compatible client. The terminal stops being the only interface -- it becomes the canonical MCP server for Hyperliquid, consumable by any agent.

---

## 5. Building a Hyperliquid MCP Server

### Tools to Expose

A Hyperliquid MCP server should expose the following tool categories:

#### Market Data Tools

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `get_orderbook` | L2 orderbook snapshot | `{ coin: string, depth?: number }` | Bids/asks with prices and sizes |
| `get_trades` | Recent trades | `{ coin: string, limit?: number }` | Array of trades with price, size, side, time |
| `get_candles` | OHLCV candlestick data | `{ coin: string, interval: string, limit?: number }` | Candle array |
| `get_funding_rate` | Current and predicted funding | `{ coin: string }` | Current rate, predicted rate, next funding time |
| `get_market_info` | Asset metadata | `{ coin: string }` | Tick size, lot size, max leverage, open interest |
| `get_all_mids` | Mid prices for all assets | `{}` | Map of coin to mid price |

#### Account and Position Tools

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `get_positions` | Open positions | `{ address: string }` | Array of positions with entry, size, PnL, margin |
| `get_open_orders` | Active orders | `{ address: string }` | Array of orders with price, size, side, type |
| `get_account_state` | Full account summary | `{ address: string }` | Balance, margin used, equity, available margin |
| `get_trade_history` | Historical fills | `{ address: string, limit?: number }` | Array of fills with execution details |
| `get_funding_history` | Funding payments | `{ address: string, limit?: number }` | Array of funding payments |

#### Trade Execution Tools

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `place_order` | Submit a new order | `{ coin, side, size, price?, type, reduceOnly?, tpsl? }` | Order confirmation with ID |
| `cancel_order` | Cancel an existing order | `{ coin, orderId }` | Cancellation confirmation |
| `cancel_all_orders` | Cancel all orders | `{ coin? }` | Count of cancelled orders |
| `modify_order` | Modify an existing order | `{ orderId, price?, size? }` | Modified order confirmation |
| `close_position` | Close an entire position | `{ coin, slippage? }` | Execution details |

#### Risk and Analytics Tools

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `get_liquidation_price` | Estimated liquidation | `{ address, coin }` | Liquidation price and distance |
| `get_portfolio_risk` | Portfolio-level risk metrics | `{ address }` | Total exposure, margin ratio, correlation |
| `get_vault_info` | Vault details | `{ vaultAddress }` | TVL, performance, followers, strategy |

### Implementation Architecture

```
+-------------------+
|  MCP Client       |   (Claude Desktop, GPT, custom agent)
|  (Any AI Agent)   |
+--------+----------+
         |
         | JSON-RPC over Streamable HTTP
         |
+--------v----------+
|  HypeTerminal     |
|  MCP Server       |   (Node.js / TypeScript)
|                   |
|  - Tool Registry  |
|  - Auth (API key) |
|  - Rate Limiting  |
|  - Audit Logging  |
+--------+----------+
         |
         | Hyperliquid SDK / REST / WebSocket
         |
+--------v----------+
|  Hyperliquid      |
|  Network          |
+-------------------+
```

### Technical Decisions

- **Runtime**: Node.js/TypeScript (aligns with HypeTerminal's existing stack)
- **Transport**: Streamable HTTP (production-ready, scalable, load-balancer friendly)
- **Authentication**: API key-based initially, SSO when MCP enterprise features ship
- **State**: Stateless server design (no session affinity required)
- **SDK**: Use `@anthropic-ai/sdk` MCP server utilities or the official `@modelcontextprotocol/sdk`
- **Data format**: Return strings for numeric values (consistent with Hyperliquid API and the project's data principle)

---

## 6. Trade Copilot (fintools-ai) as Reference

[Trade Copilot](https://github.com/fintools-ai/trade-copilot) is a production reference for MCP-based trading assistants.

### Architecture

Trade Copilot v2 moved from a single-agent system to a **multi-agent swarm**, delivering higher accuracy and confidence in trading recommendations. It is built on MCP and provides:

- Real-time order flow analysis (sub-10ms response times)
- Advanced pattern detection (sweeps, blocks)
- Institutional bias tracking
- Options monitoring
- Technical analysis through a chat interface

### MCP Server Ecosystem

The fintools-ai organization maintains multiple specialized MCP servers:

| Server | Purpose |
|--------|---------|
| `mcp-options-order-flow-server` | Options order flow data, pattern detection, institutional bias |
| `mcp-order-flow-server` | General order flow information |
| `mcp-market-data-server` | Market data insights for AI trading agents |

### Lessons for HypeTerminal

1. **Decompose by domain**: Separate MCP servers for market data, order flow, and execution (rather than one monolithic server)
2. **Sub-10ms tool responses**: Trading tools must be fast. Cache aggressively, use WebSocket subscriptions for live data
3. **Multi-agent swarm**: v2's architectural shift validates the multi-agent approach for trading
4. **Clean chat interface**: The MCP tools power a professional trading chat UI -- similar to what HypeTerminal could offer

---

## 7. Microsoft Dynamics 365 MCP Integration Patterns

Microsoft's adoption of MCP for Dynamics 365 ERP provides enterprise-grade patterns applicable to trading:

### Key Patterns

1. **Business Logic Exposure**: The MCP server exposes business logic and actions directly to AI agents, allowing agents to work with the system "in the same way a human user does" -- navigating forms, executing actions, validating rules, respecting security context.

2. **Governed Agent Access**: AI agents are governed with the same rigor as human users. The Power Platform Admin Center provides enterprise governance controls for MCP access.

3. **Analytics MCP Server**: A separate ERP Analytics MCP server allows agents to query business performance data using natural language.

4. **Real-World Integration**: KPMG's Supplier Performance Insight Agent automates finance workflows by integrating internal ERP data with external market signals through MCP.

### Applicable Patterns for HypeTerminal

| D365 Pattern | HypeTerminal Equivalent |
|-------------|------------------------|
| Business logic as MCP tools | Trading logic (order validation, position sizing) as MCP tools |
| Governed agent access | API key scoping (read-only vs. trade execution permissions) |
| Analytics MCP server | Portfolio analytics and performance reporting tools |
| Security context preservation | User wallet address binding, per-agent trade limits |

---

## 8. How HypeTerminal Could Expose Features as MCP Tools

### Tiered Access Model

**Tier 1 -- Read-Only (No API key required)**:
- Market data (orderbook, trades, candles, funding rates)
- Asset metadata (tick sizes, leverage limits)
- Public vault information

**Tier 2 -- Authenticated Read (API key required)**:
- User positions and orders
- Account state and balances
- Trade history and funding payments
- Portfolio analytics

**Tier 3 -- Trade Execution (API key + signing)**:
- Order placement, modification, cancellation
- Position management
- Vault operations

### MCP App Widgets

Using MCP Apps, HypeTerminal could expose interactive widgets:

- **Orderbook Widget**: Real-time depth visualization inside the agent chat
- **Position Card**: Interactive position details with modify/close actions
- **Chart Widget**: Price chart with configurable timeframes and indicators
- **Risk Dashboard**: Portfolio heat map showing exposure by asset

### Integration Flow

1. User connects HypeTerminal MCP server in their AI client (Claude Desktop, etc.)
2. Agent discovers available tools via `tools/list`
3. User asks: "What's my current ETH exposure and risk?"
4. Agent calls `get_positions` and `get_liquidation_price` tools
5. Agent synthesizes results and (optionally) renders a Position Card widget
6. User says: "Set a stop-loss 5% below current price"
7. Agent calculates price, calls `place_order` with stop-loss parameters
8. User confirms (human-in-the-loop for Tier 3 actions)

---

## 9. Technical Implementation Considerations

### Server Framework

```typescript
// Conceptual structure using MCP SDK
import { McpServer } from "@modelcontextprotocol/sdk/server";

const server = new McpServer({
  name: "hypeterminal",
  version: "1.0.0",
});

server.tool("get_orderbook", {
  description: "Get L2 orderbook for a Hyperliquid perpetual",
  inputSchema: {
    type: "object",
    properties: {
      coin: { type: "string", description: "Asset symbol (e.g., ETH)" },
      depth: { type: "number", description: "Number of levels", default: 20 },
    },
    required: ["coin"],
  },
  handler: async ({ coin, depth }) => {
    // Call Hyperliquid API, return structured data
  },
});
```

### Performance Requirements

| Metric | Target | Rationale |
|--------|--------|-----------|
| Tool response time | <100ms for reads, <500ms for writes | Agent loops call multiple tools; latency compounds |
| Concurrent connections | 100+ | Multiple agents/users simultaneously |
| Uptime | 99.9% | Trading is time-sensitive |
| Data freshness | <1s for orderbook, <5s for positions | Stale data leads to bad decisions |

### Security

- **API key rotation**: Support key rotation without downtime
- **Permission scoping**: Read-only vs. read-write vs. full-execution keys
- **Rate limiting**: Per-key rate limits to prevent abuse
- **Audit logging**: Every tool invocation logged with timestamp, agent ID, parameters, result
- **Wallet binding**: API keys bound to specific wallet addresses
- **Trade limits**: Per-key maximum order size and daily volume caps

### Deployment

- **Transport**: Streamable HTTP (stateless, load-balancer friendly)
- **Hosting**: Edge deployment (Cloudflare Workers or similar) for low latency
- **Caching**: Redis for orderbook snapshots, position state
- **Monitoring**: Prometheus metrics + Grafana dashboards for tool invocation patterns

---

## 10. Opportunities for HypeTerminal

### Near-Term (3-6 months)

1. **Hyperliquid MCP Server (Read-Only)**: Expose market data, orderbook, and public analytics as MCP tools. Low risk, high discoverability. Any AI agent can query Hyperliquid through HypeTerminal.
2. **Trading Copilot Integration**: Integrate MCP tools with HypeTerminal's existing UI. Users chat with an AI assistant that has full context of their positions and the market.
3. **MCP Server Card**: Publish a `.well-known/mcp-server-card` so agent ecosystems automatically discover HypeTerminal's capabilities.

### Medium-Term (6-12 months)

4. **Authenticated MCP (Tier 2+3)**: Add position reading and trade execution tools. Users connect their HypeTerminal API key in Claude Desktop or custom agents to trade Hyperliquid through any MCP client.
5. **MCP App Widgets**: Expose HypeTerminal's React components (orderbook, chart, position cards) as MCP App widgets renderable inside AI chat.
6. **Agent Analytics**: Track which tools agents call most, what trading patterns emerge, and optimize tool design based on usage data.

### Long-Term (12+ months)

7. **MCP Gateway for Hyperliquid**: Position HypeTerminal as THE MCP gateway to Hyperliquid. Third-party agents that want Hyperliquid access go through HypeTerminal's governed, rate-limited, audited MCP server.
8. **Tool Marketplace**: Allow third-party developers to register custom MCP tools (custom indicators, strategies, signals) that extend HypeTerminal's server.
9. **Cross-Protocol MCP**: Extend the MCP server to cover HyperEVM, spot trading, and future Hyperliquid features as they launch.

---

## 11. Risks and Challenges

### Technical Risks

- **MCP specification instability**: The protocol is evolving rapidly. The June 2026 spec release may introduce breaking changes. Mitigation: track SEPs closely, version the MCP server, maintain backward compatibility.
- **Transport performance**: Streamable HTTP adds overhead vs. direct WebSocket connections. For latency-critical tools (orderbook), this may matter. Mitigation: aggressive caching, SSE streaming for real-time data.
- **Authentication complexity**: MCP's auth story is still maturing. Enterprise SSO integration is on the roadmap but not yet shipped. Mitigation: start with API key auth, plan for OAuth/SSO migration.

### Security Risks

- **Agent-initiated trades**: An AI agent with trade execution tools could make unintended trades due to hallucination or prompt injection. Mitigation: human-in-the-loop confirmation for all Tier 3 actions, hard trade limits per API key, anomaly detection.
- **Key management**: Users must share API keys with MCP clients. If a client is compromised, keys are exposed. Mitigation: scoped keys with minimal permissions, automatic expiry, activity monitoring.
- **Prompt injection**: Malicious data in market feeds or news could manipulate agent behavior through MCP tool responses. Mitigation: sanitize all tool outputs, never include user-controlled strings in tool descriptions.

### Market Risks

- **MCP adoption uncertainty**: While Anthropic and OpenAI back MCP, some companies (e.g., Perplexity) prefer traditional APIs citing context overhead and auth friction. MCP may not become the universal standard.
- **Competitive landscape**: Other Hyperliquid tools could launch their own MCP servers. First-mover advantage matters.
- **Regulatory scrutiny**: AI agents executing trades on behalf of users may attract regulatory attention. The governance and audit trail capabilities must be robust from day one.

### Operational Risks

- **Support burden**: MCP servers must be maintained as the protocol evolves. Each spec update may require server changes.
- **Cost model**: Who pays for MCP server hosting and Hyperliquid API usage? Free tier for read-only, paid for execution? Freemium conversion rates in developer tools are typically 2-5%.

---

## 12. Open Questions

1. **Server scope**: Should HypeTerminal run one monolithic MCP server or multiple specialized servers (market data, portfolio, execution)?
2. **MCP Apps priority**: How soon should we invest in MCP App widgets vs. focusing on the tool layer first?
3. **Auth model**: API key per user, per agent, or per session? How do we handle key revocation for misbehaving agents?
4. **Real-time data**: Should the MCP server expose WebSocket-like streaming via SSE, or stick to polling? MCP's streaming story is still evolving.
5. **Multi-chain**: Should the MCP server cover only Hyperliquid L1, or also HyperEVM and potential future chains?
6. **Pricing**: Free read-only tier + paid execution tier? Usage-based pricing? Flat subscription?
7. **SDK distribution**: Should we publish an npm package (`@hypeterminal/mcp-server`) that others can self-host, or only offer a hosted service?
8. **Agent guardrails**: What guardrails should be built into the MCP server itself (vs. relying on the agent to be responsible)? Max order size? Position concentration limits? Cooldown periods?
9. **Privacy**: If the MCP server processes user portfolio data, what data retention and privacy policies apply? GDPR considerations for EU users?
10. **Interop with multi-agent systems**: How does the MCP server interact with the multi-agent architecture described in 03-multi-agent-architecture.md? Should the coordinator agent use MCP tools, or direct SDK calls?

---

## Sources

- [MCP 2026 Roadmap (Model Context Protocol Blog)](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)
- [MCP Roadmap (Official)](https://modelcontextprotocol.io/development/roadmap)
- [MCP's Biggest Growing Pains (The New Stack)](https://thenewstack.io/model-context-protocol-roadmap-2026/)
- [MCP Apps: Bringing UI Capabilities to MCP Clients](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)
- [Anthropic Extends MCP with App Framework (The New Stack)](https://thenewstack.io/anthropic-extends-mcp-with-an-app-framework/)
- [Alpha Vantage MCP Server](https://mcp.alphavantage.co/)
- [Financial Datasets MCP Server (GitHub)](https://github.com/financial-datasets/mcp-server)
- [VARRD: MCP for Trading](https://www.varrd.com/guides/mcp-trading.html)
- [FactSet MCP (Marketplace)](https://www.factset.com/marketplace/catalog/product/model-context-protocol)
- [Trade Copilot (fintools-ai GitHub)](https://github.com/fintools-ai/trade-copilot)
- [fintools-ai MCP Options Order Flow Server](https://github.com/fintools-ai/mcp-options-order-flow-server)
- [MCP-Trader / MaverickMCP (GitHub)](https://github.com/wshobson/maverick-mcp)
- [Dynamics 365 MCP Integration (Microsoft Learn)](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/copilot/copilot-mcp)
- [Dynamics 365 MCP Server Goes GA](https://dynamicspost.com/d365-mcp-ga/)
- [Top 5 MCP Servers for Financial Data in 2026 (Medium)](https://medium.com/predict/top-5-mcp-servers-for-financial-data-in-2026-5bf45c2c559d)
- [DeFi Trading Agent MCP Server (LobeHub)](https://lobehub.com/mcp/edkdev-defi-trading-mcp)
- [Awesome Blockchain MCPs (GitHub)](https://github.com/royyannick/awesome-blockchain-mcps)
- [MCP Ecosystem in 2026: v1.27 Release (Context Studios)](https://www.contextstudios.ai/blog/mcp-ecosystem-in-2026-what-the-v127-release-actually-tells-us)
- [Sharpe AI Crypto MCP Server](https://sharpe.ai/crypto-mcp)
- [Tatum MCP Server for Blockchain Data](https://tatum.io/mcp)
