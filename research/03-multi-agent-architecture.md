# Multi-Agent Trading System Architecture

## Executive Summary

- **Multi-agent LLM systems replicate the structure of professional trading firms**, assigning specialized roles (fundamental analyst, sentiment analyst, technical analyst, risk manager, trader) to individual AI agents that collaborate through structured workflows.
- **The hub-and-spoke pattern** (coordinator + specialist agents) is the dominant production architecture for trading systems, providing centralized governance, auditability, and deterministic execution flow.
- **LangGraph is the leading orchestration framework** for multi-agent trading systems (27K+ monthly searches, used by TradingAgents), with CrewAI, AutoGen/Microsoft Agent Framework, and OpenAI Agents SDK as viable alternatives depending on complexity and time-to-production requirements.
- **Four agentic design patterns** are critical for trading: ReAct (think-act-observe loops), Planning (decompose goals before execution), Reflection (self-critique before finalizing), and Multi-Agent Collaboration (structured inter-agent communication).
- **Hyperliquid's vault infrastructure** provides a natural mapping for multi-agent systems: each agent strategy can operate as a vault, with the coordinator acting as a portfolio manager across vaults, enabling transparent follower participation.

---

## 1. The TradingAgents Framework

[TradingAgents](https://github.com/TauricResearch/TradingAgents) (Tauric Research, v0.2.0 released February 2026) is the most comprehensive open-source multi-agent LLM trading framework. It simulates a professional trading firm with seven distinct agent roles:

### Agent Roles

| Role | Responsibility |
|------|---------------|
| **Fundamentals Analyst** | Analyzes financial statements, earnings, balance sheets |
| **Sentiment Analyst** | Processes social media, news sentiment, market mood |
| **News Analyst** | Monitors breaking news, regulatory changes, macro events |
| **Technical Analyst** | Evaluates price patterns, indicators (RSI, MACD, volume) |
| **Researcher** | Synthesizes analyst outputs, identifies conflicts, weighs evidence |
| **Trader** | Makes buy/sell/hold decisions based on research synthesis |
| **Risk Manager** | Evaluates position sizing, drawdown limits, portfolio exposure |

### Execution Flow

The system operates through structured stages:

1. **Analysts Team** -- Four analysts concurrently gather and process market data
2. **Research Team** -- Researchers discuss and evaluate collected data, resolving conflicts
3. **Trader** -- Based on synthesized research, the trader proposes a trading decision
4. **Risk Management** -- Risk guardians assess the decision against current conditions
5. **Fund Manager** -- Approves and executes the final trade

### Performance

TradingAgents demonstrated improvements over baseline models in cumulative returns, Sharpe ratio, and maximum drawdown. Unlike traditional deep learning models, it offers transparent decision-making through natural language explanations -- every agent's actions are accompanied by detailed reasoning and tool usage, making the system interpretable and debuggable.

### Multi-Provider LLM Support

TradingAgents v0.2.0 supports multiple LLM providers:

- **Anthropic**: Claude 4.x (strong reasoning, safety-first)
- **OpenAI**: GPT-5.x (broad capability, function calling)
- **Google**: Gemini 3.x (multimodal, long context)
- **xAI**: Grok 4.x (real-time data integration)
- **OpenRouter**: Unified access to multiple providers
- **Ollama**: Local/self-hosted models for privacy

This multi-provider approach allows mixing models by role -- using Claude for risk management (strong reasoning), GPT for technical analysis (function calling), and Grok for sentiment (real-time X/Twitter data).

---

## 2. Hub-and-Spoke Pattern

The hub-and-spoke (or "star") pattern is the dominant architecture for production multi-agent trading systems.

### Architecture

```
                    +-------------------+
                    |  Portfolio Manager |
                    |   (Coordinator)    |
                    +--------+----------+
                             |
           +---------+-------+-------+---------+
           |         |       |       |         |
     +-----v--+ +---v----+ +v-----+ +v------+ +v---------+
     |Fundmntl| |Sentimnt| |Techncl| | News | |   Risk   |
     |Analyst | |Analyst | |Analyst| |Analyst| | Manager  |
     +--------+ +--------+ +------+ +-------+ +----------+
```

### Information Flow

1. The **Coordinator (Hub)** receives a trading query or market trigger
2. It dispatches subtasks to **Specialist Agents (Spokes)** in parallel
3. Each specialist processes its domain independently (stateless)
4. Results flow back to the coordinator for synthesis
5. The coordinator makes a unified decision or escalates to a human

### Advantages for Trading

- **Governance and safety**: Central policy checks, consistent guardrails, and risk limits enforced at the hub
- **Deterministic flow**: Predictable execution steps, auditable decision trails
- **Simpler operations**: Single orchestration plane, easier monitoring
- **Parallel execution**: Analysts run concurrently, reducing latency
- **Isolation**: A failing specialist does not crash the system

### Limitations

- **Head-of-line blocking**: A slow specialist (e.g., waiting for an API) can delay the entire decision
- **Single point of failure**: The coordinator must be highly available
- **Organizational coupling**: All routing changes require coordinator updates

### Mitigation Strategies

- Use timeouts and fallbacks for slow specialists
- Implement coordinator redundancy with state checkpointing
- Design the coordinator as a configurable graph (LangGraph) rather than hardcoded logic

---

## 3. Agentic Design Patterns for Trading

### 3.1 ReAct Pattern (Reason + Act)

The cornerstone of modern agent design, ReAct alternates between three phases:

- **Thought**: The agent articulates its current understanding and decides the next step
- **Action**: The agent selects and executes a tool (fetch price data, query orderbook, etc.)
- **Observation**: The result is fed back into the agent's context

**Trading application**: A technical analyst agent thinks "I need to check the 4h RSI for ETH," acts by calling the indicator API, observes the RSI is 78 (overbought), then thinks "I should also check volume to confirm" before acting again.

**Key strength**: Externalized reasoning creates a clear audit trail. Every decision is visible, preventing premature conclusions and reducing hallucinations by grounding each step in observable data.

### 3.2 Planning Pattern (Plan-and-Execute)

Separates high-level strategic planning from tactical execution:

1. **Plan phase**: The agent decomposes a goal into an ordered list of subtasks
2. **Execute phase**: Each subtask is executed sequentially or delegated to specialists
3. **Replan**: If execution results invalidate the plan, the agent replans

**Trading application**: Given "Evaluate whether to increase ETH exposure," the planner creates: (1) check current portfolio allocation, (2) analyze ETH technical setup, (3) assess market sentiment, (4) evaluate risk metrics, (5) propose position adjustment. Each step may be delegated to a specialist.

**Why it matters**: ReAct can struggle with long-horizon goals. Planning prevents the agent from losing track of the overall objective during step-by-step execution.

### 3.3 Reflection Pattern

The agent critiques its own output before returning a final answer:

1. **Generate**: Produce an initial trading recommendation
2. **Critique**: A separate reflection step (or agent) evaluates the recommendation for errors, biases, or missing considerations
3. **Revise**: Incorporate critique and produce an improved recommendation
4. **Iterate**: Repeat until quality threshold is met or iteration limit reached

**Trading application**: A trader agent proposes "Long ETH at $4,200 with 3x leverage." The reflection agent asks: "Have you considered the upcoming FOMC meeting in 2 days? Current funding rates suggest crowded positioning. Recommendation: reduce leverage to 1.5x or wait for post-FOMC clarity."

**Why it matters**: Reduces impulsive decisions. In trading, overconfidence is a major risk factor -- structured self-critique catches errors that single-pass reasoning misses.

### 3.4 Multi-Agent Collaboration Patterns

Several collaboration topologies apply to trading:

| Pattern | Description | Trading Use Case |
|---------|-------------|-----------------|
| **Sequential** | Agents process in order, each building on the previous | Analysis pipeline: data collection, analysis, decision, risk check |
| **Parallel (Scatter-Gather)** | Multiple agents work simultaneously, results merged | Concurrent fundamental + technical + sentiment analysis |
| **Debate** | Agents argue opposing positions | Bull vs. bear agents debate a position, moderator decides |
| **Hierarchical** | Manager delegates to workers, workers may have sub-workers | Portfolio manager, strategy managers, individual trade executors |
| **Voting** | Multiple agents independently recommend, majority wins | Ensemble of trading strategies, weighted by historical accuracy |

---

## 4. Orchestration Frameworks

### 4.1 LangGraph (Primary Recommendation)

LangGraph is the most adopted orchestration framework for multi-agent systems (27K+ monthly searches). TradingAgents is built on it.

**Core concepts**:
- **StateGraph**: Defines shared state that flows through the workflow (positions, signals, risk metrics)
- **Nodes**: Functions encoding agent logic (each analyst, trader, risk manager is a node)
- **Edges**: Conditional transitions based on state (if risk score > threshold, route to risk manager)
- **Checkpointing**: State persisted after every node via MemorySaver, SqliteSaver, or PostgresSaver -- crash recovery is automatic

**Why LangGraph for trading**:
- Explicit control flow (critical for financial systems where auditability matters)
- Built-in human-in-the-loop (approval gates before trade execution)
- Streaming support (real-time market data processing)
- LangSmith observability (trace every agent decision)
- Subgraph composition (nest specialist teams within a larger portfolio graph)

**Trading graph structure**:
```
START -> [market_data_ingestion]
      -> [parallel_analysts] (scatter)
      -> [research_synthesis] (gather)
      -> [trader_decision]
      -> [risk_assessment]
      -> {risk_ok?} -- yes --> [execute_trade] -> END
                    -- no  --> [adjust_position] -> [risk_assessment]
```

### 4.2 CrewAI

Best for rapid prototyping with role-based agents. Allows deploying a multi-agent team 40% faster than LangGraph. Uses an intuitive "crew" metaphor with natural agent communication.

**Trade-offs**: Medium production readiness, limited checkpointing, less control over execution flow compared to LangGraph.

**Best for**: Quick POCs, simpler trading strategies, teams wanting minimal boilerplate.

### 4.3 AutoGen / Microsoft Agent Framework

AutoGen (54,600+ GitHub stars, 856K monthly downloads) pioneered multi-agent conversations. However, in October 2025, Microsoft merged AutoGen with Semantic Kernel into the unified Microsoft Agent Framework, with GA targeted for end of Q1 2026. AutoGen is now in maintenance mode.

**Trade-offs**: Powerful event-driven architecture, but migration uncertainty. New projects should evaluate the Microsoft Agent Framework directly.

### 4.4 OpenAI Agents SDK

Lightweight, easy to start (few lines of code). Strong in agent handoffs but lacks built-in parallel execution. Built-in tracing and guardrails.

**Notable**: OpenAI published a [Multi-Agent Portfolio Collaboration cookbook](https://cookbook.openai.com/examples/agents_sdk/multi-agent-portfolio-collaboration/multi_agent_portfolio_collaboration) demonstrating financial analysis with specialist agents for macro, fundamental, and quantitative analysis.

**Trade-offs**: Python-only, less control over graph topology, simpler orchestration.

### Framework Comparison

| Criteria | LangGraph | CrewAI | AutoGen/MSAF | OpenAI SDK |
|----------|-----------|--------|-------------|------------|
| Architecture | State graph | Role-based crews | Event-driven conversations | Lightweight handoffs |
| Learning curve | Medium-high | Low | Medium | Low |
| Production readiness | High | Medium | High (MSAF) | High |
| Parallel execution | Native | Built-in | Native | Manual |
| Checkpointing | Built-in | Limited | Built-in | Limited |
| Observability | LangSmith | Growing | Azure Monitor | Built-in tracing |
| Multi-provider LLM | Yes | Yes | Yes | OpenAI only |
| Human-in-the-loop | Native | Limited | Yes | Yes |

---

## 5. Mapping to Hyperliquid Vault Infrastructure

Hyperliquid's vault system provides a natural on-chain mapping for multi-agent trading architectures.

### Hyperliquid Vault Basics

- Any user can create a vault; others deposit USDC to follow the strategy
- The vault owner (leader) trades with pooled funds; followers mirror proportionally
- Vault owners earn 10% of profits
- Processing: up to 20,000 orders/second, 0.2s median latency
- Copy lag: 1-2 seconds between leader and follower execution
- Fees: 0.01% maker, 0.035% taker

### Agent-to-Vault Mapping

```
+--------------------------------------------------+
|  HypeTerminal Multi-Agent System                  |
|                                                   |
|  +---------------------------------------------+ |
|  | Portfolio Manager Agent (Coordinator)        | |
|  | - Allocates capital across strategy vaults   | |
|  | - Monitors aggregate risk                    | |
|  +-----+--------+--------+--------+------------+ |
|        |        |        |        |               |
|  +-----v-+ +---v---+ +--v----+ +-v--------+     |
|  |Momentum| |Mean   | |Trend  | |Market    |     |
|  |Strategy| |Revert | |Follow | |Making    |     |
|  |Vault   | |Vault  | |Vault  | |Vault     |     |
|  +--------+ +-------+ +-------+ +----------+     |
|                                                   |
|  Each vault = autonomous agent strategy            |
|  Followers deposit into individual vaults          |
|  or a meta-vault managed by the coordinator        |
+--------------------------------------------------+
```

### Implementation Approach

1. **Each strategy agent** operates its own Hyperliquid vault, executing trades autonomously
2. **The coordinator agent** monitors all vaults, adjusts capital allocation, and enforces portfolio-level risk limits
3. **Users** can follow individual strategy vaults or a meta-vault that distributes across all strategies
4. **Transparency**: All agent decisions logged with natural language explanations, viewable in HypeTerminal

### Technical Considerations

- Vault API access via Hyperliquid SDK (Python) or REST/WebSocket APIs
- Agent wallet management: each vault requires its own signing key
- Rate limits: respect Hyperliquid's API rate limits across all agents
- Latency: agent decisions must account for 1-2s copy lag in vault synchronization

---

## 6. Opportunities for HypeTerminal

### Near-Term (3-6 months)

1. **AI-Assisted Trading Copilot**: Single-agent system using ReAct pattern to help users analyze positions, evaluate risk, and suggest trades. Not autonomous -- requires user confirmation.
2. **Strategy Backtesting Agent**: An agent that decomposes backtesting goals into subtasks (data collection, signal generation, performance evaluation) using the Planning pattern.
3. **Risk Monitoring Agent**: Continuously monitors open positions, funding rates, liquidation distances, and alerts users to emerging risks.

### Medium-Term (6-12 months)

4. **Multi-Agent Strategy Builder**: Users define agent teams (analyst + trader + risk manager) with configurable parameters. Each team operates a Hyperliquid vault.
5. **Agent Marketplace**: Pre-built agent configurations that users can deploy to vaults. Revenue from vault profit-sharing (10% of followers' profits).
6. **Cross-Strategy Portfolio Optimization**: Coordinator agent that allocates across multiple strategy vaults based on Sharpe ratio, correlation, and drawdown metrics.

### Long-Term (12+ months)

7. **Autonomous Trading Vaults**: Fully autonomous multi-agent vaults with human-in-the-loop approval for high-risk trades. Users deposit and the agent system manages.
8. **Social Intelligence Layer**: Sentiment agents processing on-chain data, social media, and Hyperliquid-specific signals (whale tracking, liquidation cascades).

---

## 7. Risks and Challenges

### Technical Risks

- **LLM hallucination in financial decisions**: Even with ReAct grounding, LLMs can generate plausible but incorrect analysis. Mitigation: always validate agent outputs against quantitative data before execution.
- **Latency**: LLM inference adds 1-10 seconds per agent step. For a 5-agent pipeline, total latency could be 30-60 seconds -- too slow for scalping, acceptable for swing trading.
- **Cost**: Multi-agent systems with multiple LLM calls per decision can cost $0.10-$1.00+ per trade decision. Must be offset by trade profitability.
- **State management complexity**: Keeping agent state consistent with rapidly changing market data requires careful synchronization.

### Regulatory Risks

- **Autonomous trading by AI agents**: Regulatory frameworks are evolving. Ensure human-in-the-loop for production deployments, especially for others' capital.
- **Fiduciary responsibility**: If agents manage vault followers' capital, there may be legal obligations around disclosure and risk management.

### Operational Risks

- **Model provider outages**: Multi-provider support is essential. If Claude is down, fall back to GPT or Gemini.
- **API rate limits**: Hyperliquid and LLM provider rate limits constrain throughput.
- **Adversarial market conditions**: Agents trained on normal conditions may fail during black swan events. Circuit breakers and hard risk limits are essential.

### Market Adoption

- Gartner predicts 40% of enterprise applications will incorporate AI agents by 2026 (up from <5% in 2025)
- 1,445% surge in multi-agent system inquiries from Q1 2024 to Q2 2025
- 86% of copilot spending now goes to agent-based systems
- Over 70% of new AI projects use orchestration frameworks

---

## 8. Open Questions

1. **Which LLM per role?** Should fundamental analysis use a different model than risk management? What is the cost-performance frontier?
2. **Latency budget**: What is the acceptable decision latency for HypeTerminal's target trading styles (scalping vs. swing vs. position)?
3. **Human-in-the-loop granularity**: Which decisions require human approval? All trades? Only those above a size threshold? Only those the risk agent flags?
4. **On-chain vs. off-chain agents**: Should agent logic run on HyperEVM, or off-chain with only trade execution on-chain?
5. **Agent memory**: How much historical context should agents retain? Full trade history? Rolling window? Compressed summaries?
6. **Evaluation framework**: How do we measure agent performance beyond PnL? Decision quality metrics, reasoning coherence, risk-adjusted returns?
7. **Privacy**: If agents process user portfolio data, how is that data protected? Especially for multi-tenant vault scenarios.
8. **Composability**: Should HypeTerminal agents be compatible with external agent ecosystems (e.g., exposing MCP tools that other agents can call)?
9. **Failover strategy**: If the coordinator agent fails mid-decision, should specialist agents halt, continue with cached state, or fall back to a simpler strategy?
10. **Competitive moat**: How does HypeTerminal's agent offering differentiate from standalone trading bot platforms like Katoshi, goodcryptoX, or Hummingbot?

---

## Sources

- [TradingAgents: Multi-Agents LLM Financial Trading Framework (arXiv)](https://arxiv.org/abs/2412.20138)
- [TradingAgents GitHub Repository](https://github.com/TauricResearch/TradingAgents)
- [LangGraph: Agent Orchestration Framework](https://www.langchain.com/langgraph)
- [Choosing the Right Multi-Agent Architecture (LangChain Blog)](https://blog.langchain.com/choosing-the-right-multi-agent-architecture/)
- [LangGraph vs CrewAI vs AutoGen: 2026 Guide (DEV Community)](https://dev.to/pockit_tools/langgraph-vs-crewai-vs-autogen-the-complete-multi-agent-ai-orchestration-guide-for-2026-2d63)
- [5 AI Agent Design Patterns to Master by 2026](https://explore.n1n.ai/blog/5-ai-agent-design-patterns-master-2026-2026-03-21)
- [15 Agentic AI Design Patterns (2026)](https://aitoolsclub.com/15-agentic-ai-design-patterns-you-should-know-research-backed-and-emerging-frameworks-2026/)
- [Google Cloud: Choose a Design Pattern for Agentic AI](https://docs.google.com/architecture/choose-design-pattern-agentic-ai-system)
- [OpenAI Multi-Agent Portfolio Collaboration Cookbook](https://cookbook.openai.com/examples/agents_sdk/multi-agent-portfolio-collaboration/multi_agent_portfolio_collaboration)
- [Hub-and-Spoke Pattern in Multi-Agent AI (AG2 Docs)](https://docs.ag2.ai/latest/docs/user-guide/advanced-concepts/pattern-cookbook/star/)
- [Hyperliquid Vaults Documentation](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/vaults)
- [LangGraph: Build Stateful Multi-Agent Systems (2026)](https://www.mager.co/blog/2026-03-12-langgraph-deep-dive/)
- [Agent Orchestration 2026 (Iterathon)](https://iterathon.tech/blog/ai-agent-orchestration-frameworks-2026)
- [OpenAI Agents SDK vs LangGraph vs AutoGen vs CrewAI (Composio)](https://composio.dev/blog/openai-agents-sdk-vs-langgraph-vs-autogen-vs-crewai)
