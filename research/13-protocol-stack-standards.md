# The 2026 AI Agent Protocol Stack

## Executive Summary

- Five protocols are converging into a coherent stack for AI agent applications: MCP (tools), AG-UI (transport/events), A2UI (UI specification), A2A (agent coordination), and Agent Spec (agent definitions). Together, they form what some are calling "the TCP/IP moment for agentic AI."
- MCP has achieved decisive adoption: 97M+ monthly SDK downloads, supported by every major AI provider (Anthropic, OpenAI, Google, Microsoft, Amazon), and now governed by the Linux Foundation's Agentic AI Foundation (AAIF).
- AG-UI (CopilotKit) is the clear winner for agent-frontend communication, with 120K weekly installs and integration by Microsoft Agent Framework, LangGraph, CrewAI, and Google ADK. It is the most directly relevant protocol for HypeTerminal.
- A2A (Google) and Agent Spec (Oracle) handle inter-agent communication and agent definitions respectively. Both are important for multi-agent architectures but are second-priority for a trading terminal.
- For HypeTerminal, the implementation priority is: MCP (immediate) > AG-UI (immediate) > A2UI (near-term) > A2A (medium-term) > Agent Spec (long-term).

---

## The Emerging Protocol Stack

The 2026 agent protocol stack has five layers, each addressing a different concern:

```
+------------------------------------------+
|  Agent Spec (Oracle)                     |  Agent definitions
|  Declarative agent/workflow descriptions |
+------------------------------------------+
|  A2A (Google)                            |  Agent-to-agent
|  Inter-agent communication & discovery   |
+------------------------------------------+
|  A2UI (Google)                           |  UI specification
|  Declarative UI components from agents   |
+------------------------------------------+
|  AG-UI (CopilotKit)                      |  Transport/events
|  Agent <-> frontend event streaming      |
+------------------------------------------+
|  MCP (Anthropic)                         |  Tool interface
|  Agent <-> external tool/data access     |
+------------------------------------------+
```

These protocols are complementary, not competing. An agent defined in Agent Spec can use MCP to access tools, communicate with other agents via A2A, stream state to the frontend via AG-UI, and describe its UI requirements via A2UI.

---

## MCP (Model Context Protocol)

### Overview

MCP is an open protocol created by Anthropic that standardizes how AI agents connect to external tools, data sources, and services. It was open-sourced in November 2024, rapidly adopted throughout 2025, and donated to the Linux Foundation's Agentic AI Foundation (AAIF) in December 2025.

### Technical Architecture

MCP uses a client-server model:
- **MCP Server**: Exposes tools, resources, and prompts via a standardized JSON-RPC interface
- **MCP Client**: Runs inside the AI agent/application and discovers + invokes server capabilities
- **Transport**: Supports stdio (local processes) and HTTP+SSE (remote servers)

Key primitives:
- **Tools**: Functions the agent can call (e.g., `place_order`, `get_market_data`)
- **Resources**: Data the agent can read (e.g., market snapshots, portfolio state)
- **Prompts**: Pre-built prompt templates for common tasks

### 2026 Status and Adoption

- 97M+ monthly SDK downloads (Python + TypeScript combined) as of February 2026
- Supported by Anthropic, OpenAI, Google, Microsoft, Amazon
- 146 companies have joined the AAIF
- 75+ official connectors in Claude's directory
- MCP Apps extension: tools can now return interactive UI components (dashboards, forms, visualizations)
- Tool Search and Programmatic Tool Calling for production-scale deployments with thousands of tools

### November 2025 Spec Updates

The latest specification (2025-11-25) introduced:
- Asynchronous operations for long-running tools
- Stateless mode for serverless deployments
- Server identity for trust verification
- Official extensions mechanism (MCP Apps is the first)

### Relevance to HypeTerminal

MCP is the most immediately relevant protocol. HypeTerminal can:
- **Expose trading tools as MCP servers**: `place_order`, `cancel_order`, `get_positions`, `get_orderbook`
- **Consume external MCP servers**: market data feeds, news sentiment, on-chain analytics
- **Enable third-party agent integration**: any MCP-compatible agent can plug into HypeTerminal's tools
- **Use MCP Apps**: return interactive trading UI components (charts, order forms) from agent tool calls

---

## AG-UI (Agent-User Interaction Protocol)

### Overview

AG-UI is an open protocol created by CopilotKit that defines the bi-directional communication between a user-facing application and any agentic backend. It handles the real-time interaction stream: tool progress, state updates, text streaming, and user interactions.

### Technical Architecture

AG-UI streams a single JSON event sequence over standard HTTP (Server-Sent Events) or an optional binary channel. Key event types:

- **TEXT_MESSAGE_START/CONTENT/END**: Streaming text responses
- **TOOL_CALL_START/ARGS/END**: Tool invocation lifecycle
- **TOOL_CALL_RESULT**: Results from tool execution
- **STATE_SNAPSHOT/STATE_DELTA**: Agent state synchronization
- **CUSTOM**: Application-specific events

The protocol is transport-agnostic: it defines the event format, not how events are delivered.

### 2026 Status and Adoption

- 9,000+ GitHub stars, one of the fastest-growing protocol projects
- 120,000 weekly npm installs (AG-UI + CopilotKit)
- Integrated by Microsoft Agent Framework, LangGraph, CrewAI, Google ADK
- Oracle adopted AG-UI for Agent Spec frontend integration
- CopilotKit provides the reference implementation with React components

### CopilotKit Integration Features

CopilotKit (the reference AG-UI implementation) provides:
- Streaming chat interfaces
- Frontend and backend tool calling
- Human-in-the-loop interactions
- Generative UI (rendering UI from agent responses)
- Shared state between agent and frontend
- Multi-agent support

### Relevance to HypeTerminal

AG-UI is critically important for HypeTerminal because it defines how AI agents communicate with the React frontend:

- **Streaming trade analysis**: Agent streams its market analysis to the UI in real-time
- **Tool call visualization**: When the agent calls `place_order`, the UI shows the tool call lifecycle (pending, executing, complete)
- **State synchronization**: Agent's internal state (current analysis, confidence levels, risk assessment) synced to the frontend
- **Human-in-the-loop**: User approves or rejects agent trade proposals through structured AG-UI events
- **Framework flexibility**: Any agent backend (LangGraph, CrewAI, custom) can communicate with HypeTerminal's React frontend via AG-UI

---

## A2UI (Agent-to-User Interface)

### Overview

A2UI is an open specification created by Google (announced December 2025) that enables AI agents to generate rich, interactive user interfaces that render natively across web, mobile, and desktop without executing arbitrary code.

### Technical Architecture

A2UI is a declarative JSON format, not executable code:
- **Components**: Agents reference a catalog of trusted UI component types (Card, Button, TextField, Chart, Table, etc.)
- **Data Model**: A flat list of components with identifier references, designed for LLM generation
- **Security**: The client maintains the component catalog; agents can only reference types in this catalog. No arbitrary script execution.
- **Streaming**: Supports incremental updates, allowing agents to build or modify UI progressively

An A2UI response is a JSON payload describing:
1. A set of components and their properties
2. A data model binding data to component properties
3. Event handlers (declarative, not executable)

### 2026 Status

- Currently v0.8 (Public Preview)
- Apache 2.0 licensed
- Created by Google with contributions from CopilotKit and the open source community
- Active development on GitHub (github.com/google/A2UI)
- Integration with AG-UI via CopilotKit bridge

### How A2UI Relates to AG-UI

AG-UI and A2UI are complementary:
- **AG-UI**: The transport layer --- how events flow between agent and frontend
- **A2UI**: The UI specification --- what the agent wants to render

An agent sends an A2UI payload as part of an AG-UI event stream. The frontend receives the A2UI description and renders the appropriate components.

### Relevance to HypeTerminal

A2UI could enable agents to describe trading-specific UI:
- Agent analysis rendered as structured cards with charts and metrics
- Dynamic order forms pre-filled by the agent
- Risk dashboards generated on-the-fly based on current positions
- Multi-step workflow UIs for complex trading operations

However, HypeTerminal already has a sophisticated component library. The question is whether to use A2UI's generic component catalog or extend it with trading-specific components. The recommended approach: define a custom A2UI component catalog that maps to HypeTerminal's existing React components.

---

## A2A (Agent-to-Agent Protocol)

### Overview

A2A is an open protocol created by Google (announced April 2025) that standardizes how AI agents discover, communicate, and collaborate with each other. It was donated to the Linux Foundation in June 2025.

### Technical Architecture

A2A defines:

- **Agent Card**: A JSON document describing an agent's capabilities, endpoints, and authentication requirements. Published at a well-known URL for discovery.
- **Client-Remote model**: A client agent formulates tasks and sends them to remote agents for execution.
- **Task lifecycle**: Tasks can be short-lived or long-running, with status updates flowing between client and remote agents.
- **Message format**: Structured messages with "parts" (text, files, data) exchanged between agents.
- **Push notifications**: For long-running tasks, remote agents can push status updates.

### 2026 Status and Adoption

- Version 0.3 released July 2025 with stable interface
- Governed by Linux Foundation Agent2Agent Protocol Project
- 50+ technology partners: Atlassian, Box, Cohere, Intuit, LangChain, MongoDB, PayPal, Salesforce, SAP, ServiceNow, UKG, Workday
- Now housed alongside MCP in the Agentic AI Foundation (AAIF)

### How A2A Composes with MCP

The relationship is clear:
- **MCP**: How an agent accesses tools and data (vertical integration)
- **A2A**: How agents talk to each other (horizontal integration)

An agent uses MCP to call tools. It uses A2A to delegate tasks to other agents. These are orthogonal concerns.

### Relevance to HypeTerminal

A2A becomes relevant when HypeTerminal supports multi-agent architectures:

- **Specialist agents**: A market analysis agent delegates to a sentiment agent and a technical analysis agent via A2A
- **Cross-platform agents**: An external portfolio management agent communicates with HypeTerminal's execution agent via A2A
- **Agent marketplace**: Third-party agents advertise their capabilities via Agent Cards, and HypeTerminal's orchestrator discovers and delegates to them
- **Collaborative strategies**: Multiple agents coordinate on a complex strategy (e.g., one monitors funding rates, another manages hedges, a third executes entries)

This is medium-term priority. Single-agent workflows should be solid before adding multi-agent coordination.

---

## Open Agent Specification (Agent Spec)

### Overview

Agent Spec is a framework-agnostic declarative specification created by Oracle for defining AI agents and workflows. It makes agents portable, reusable, and executable across any compatible runtime.

### Technical Architecture

Agent Spec uses YAML/JSON to define:

- **Agents**: Individual agent definitions with capabilities, tools, and instructions
- **Workflows**: Structured sequences of agent actions (sequential, parallel, conditional)
- **Multi-agent systems**: How agents compose into larger systems
- **Tool bindings**: How agents connect to MCP servers and other tool providers

The key idea: define an agent once in Agent Spec, run it anywhere (LangGraph, CrewAI, Google ADK, Microsoft Agent Framework).

### 2026 Status

- Oracle open-sourced Agent Spec under Apache 2.0 on GitHub
- AG-UI integration jointly announced by Oracle, Google, and CopilotKit
- A2UI support via CopilotKit bridge
- Adopted by Oracle Applied AI, Oracle Financial Services, Oracle Autonomous Database
- PyAgentSpec runtime available (v26.2.0)
- Integration proposal submitted to OpenAI Agents SDK

### The Oracle-Google-CopilotKit Triangle

A joint integration standardizes three concerns:
1. **Agent Spec**: How agents are defined (Oracle)
2. **AG-UI**: How agents communicate with frontends in real-time (CopilotKit)
3. **A2UI**: How agents describe the UI they need (Google)

This integration means an Agent Spec definition can automatically expose an AG-UI endpoint and generate A2UI responses.

### Relevance to HypeTerminal

Agent Spec is relevant for:
- **Agent marketplace**: Trading agents defined in Agent Spec format can be shared, discovered, and deployed
- **Portability**: Users bring agents from other platforms and run them in HypeTerminal
- **Configuration**: Declarative agent definitions are easier for non-developers to create and modify than code
- **Interoperability**: Agent Spec agents automatically work with AG-UI frontends

This is long-term priority. Building custom agents first, then standardizing their definitions, is the pragmatic path.

---

## How These Protocols Compose

### The Full Stack for a Trading Agent

```
User opens HypeTerminal
  |
  |-- AG-UI stream connects frontend to agent backend
  |     |
  |     |-- Agent is defined in Agent Spec (portable definition)
  |     |
  |     |-- Agent calls MCP tools:
  |     |     |-- HypeTerminal MCP Server (place_order, get_positions)
  |     |     |-- Market Data MCP Server (get_candles, get_orderbook)
  |     |     |-- News Sentiment MCP Server (get_sentiment)
  |     |
  |     |-- Agent delegates to specialist agents via A2A:
  |     |     |-- Technical Analysis Agent (runs indicators)
  |     |     |-- Risk Assessment Agent (checks exposure)
  |     |
  |     |-- Agent returns A2UI response:
  |           |-- Trade proposal card with entry/exit/risk
  |           |-- Approval button for human-in-the-loop
  |
  |-- Frontend renders A2UI components
  |-- User approves trade
  |-- AG-UI sends approval event to agent
  |-- Agent calls MCP place_order tool
  |-- AG-UI streams execution status to frontend
```

### Protocol Interaction Summary

| Protocol | Role | Talks To | Data Format |
|----------|------|----------|-------------|
| MCP | Tool access | Agent <-> Tools | JSON-RPC |
| AG-UI | Frontend transport | Agent <-> UI | JSON events over SSE |
| A2UI | UI specification | Agent -> UI (via AG-UI) | Declarative JSON |
| A2A | Agent coordination | Agent <-> Agent | JSON messages + Agent Cards |
| Agent Spec | Agent definition | Definition -> Runtime | YAML/JSON |

---

## Microsoft Agent Framework AG-UI Integration

### Overview

Microsoft's Agent Framework (Release Candidate as of February 2026) has built-in AG-UI support. This is significant because it means agents built with Microsoft's framework can communicate with any AG-UI-compatible frontend, including a potential HypeTerminal integration.

### Key Features

- One-line AG-UI endpoint exposure from any Microsoft Agent Framework agent
- Emits AG-UI events for MCP tool calls, results, and text reasoning
- Supports TOOL_CALL_RESULT events when resuming after human tool approval
- Server-side UI component pushing for dynamic rendering
- Compatible with CopilotKit React components

### The "Golden Triangle"

Microsoft describes AG-UI + DevUI + OpenTelemetry as the "Golden Triangle" of agentic development:
- **AG-UI**: Production frontend communication
- **DevUI**: Developer debugging interface
- **OpenTelemetry**: Observability and tracing

### Relevance

This validates AG-UI as the emerging standard. If Microsoft is building native support, it is safe to invest in AG-UI for HypeTerminal. Agents built with any compatible framework (Microsoft, LangGraph, CrewAI, Google ADK) will be able to connect to HypeTerminal's frontend.

---

## Protocol Maturity Levels and Adoption

| Protocol | Version | Governance | Maturity | Monthly Downloads/Usage | Key Adopters |
|----------|---------|------------|----------|------------------------|--------------|
| MCP | 2025-11-25 | AAIF (Linux Foundation) | Production | 97M+ SDK downloads | Anthropic, OpenAI, Google, Microsoft, Amazon |
| AG-UI | Active dev | CopilotKit (open source) | Production-ready | 120K weekly installs | Microsoft, LangGraph, CrewAI, Google ADK, Oracle |
| A2UI | v0.8 | Google (open source) | Preview | Early | Google, CopilotKit |
| A2A | v0.3 | Linux Foundation | Stable | Growing | 50+ partners, Google, Salesforce, SAP |
| Agent Spec | v26.2.0 | Oracle (open source) | Active dev | Early | Oracle products, CopilotKit bridge |

### Maturity Assessment

- **MCP**: Battle-tested at scale. Safe to adopt immediately.
- **AG-UI**: Production-ready with growing ecosystem. Safe to adopt now.
- **A2A**: Stable API surface but limited real-world multi-agent deployments. Safe to plan for.
- **A2UI**: Still in preview. Use ideas but expect breaking changes.
- **Agent Spec**: Useful concept but adoption is Oracle-centric so far. Monitor.

---

## Which Protocols Matter Most for a Trading Terminal

### Tier 1: Must Have (Immediate)

**MCP** --- This is the interface layer between AI agents and HypeTerminal's trading capabilities. Without MCP, every agent integration is custom. With MCP, any compatible agent can access HypeTerminal's tools.

**AG-UI** --- This is how agents communicate with the React frontend. HypeTerminal needs streaming analysis, tool call visualization, state sync, and human-in-the-loop approval. AG-UI provides all of this with React components (via CopilotKit).

### Tier 2: Should Have (Near-Term)

**A2UI** --- As agents generate more complex outputs (trade proposals, risk reports, strategy comparisons), A2UI provides a structured way to describe these UIs. HypeTerminal can define a custom component catalog mapping A2UI types to its existing React components.

### Tier 3: Nice to Have (Medium-Term)

**A2A** --- Becomes important when HypeTerminal supports multi-agent workflows. Not needed for single-agent use cases. Plan the architecture to support it, but do not implement until there are concrete multi-agent use cases.

**Agent Spec** --- Becomes important if HypeTerminal builds an agent marketplace. Provides a standard format for defining and sharing trading agents. Low priority until the marketplace is on the roadmap.

---

## Implementation Priority and Effort Estimation

### Phase 1: MCP Server for HypeTerminal (2-4 weeks)

Build an MCP server that exposes HypeTerminal's trading capabilities:

**Tools to expose**:
- `place_order(asset, side, size, price, type)` --- place a limit/market order
- `cancel_order(order_id)` --- cancel an open order
- `cancel_all_orders(asset?)` --- cancel all or per-asset
- `get_positions()` --- current open positions
- `get_open_orders()` --- current open orders
- `get_orderbook(asset, depth)` --- order book snapshot
- `get_candles(asset, interval, count)` --- historical OHLCV
- `get_account_summary()` --- margin, equity, PnL

**Resources to expose**:
- Market metadata (available assets, tick sizes, lot sizes)
- Account configuration (leverage settings, margin mode)

**Effort**: Medium. Primarily wrapping existing Hyperliquid SDK calls in MCP tool definitions.

### Phase 2: AG-UI Integration (3-5 weeks)

Integrate AG-UI for agent-frontend communication:

**Components needed**:
- AG-UI event stream handler in the React frontend
- Chat interface with streaming text support
- Tool call visualization (show when agent is calling tools)
- State panel showing agent's current analysis/reasoning
- Human-in-the-loop approval UI for trade proposals

**Effort**: Medium-High. CopilotKit provides React components but they need to be adapted to HypeTerminal's design system and Zustand state management.

### Phase 3: A2UI Component Catalog (2-3 weeks)

Define HypeTerminal-specific A2UI components:

**Custom components**:
- `TradeProposal` --- entry, exit, stop loss, take profit, risk/reward
- `MarketAnalysis` --- technical indicators, sentiment, key levels
- `PositionSummary` --- current positions with PnL
- `RiskDashboard` --- exposure, correlation, drawdown

**Effort**: Medium. Mapping A2UI format to existing React components.

### Phase 4: A2A Support (4-6 weeks)

Enable multi-agent communication:

**Agent Cards**: Define HypeTerminal's agent capabilities for external discovery
**Task delegation**: Allow an orchestrator agent to delegate to specialist agents
**Discovery**: Browse and connect to external agents

**Effort**: High. Requires multi-agent architecture design and implementation.

### Phase 5: Agent Spec Integration (2-3 weeks)

Support Agent Spec definitions for agent marketplace:

**Features**:
- Import Agent Spec YAML/JSON definitions
- Export HypeTerminal agent configurations as Agent Spec
- Agent marketplace UI

**Effort**: Medium. Primarily parsing and rendering Agent Spec definitions.

---

## Interoperability Considerations

### Cross-Protocol Compatibility

The good news: these protocols are designed to work together. MCP + AG-UI + A2UI + A2A is an explicitly supported combination, with CopilotKit acting as the integration bridge.

The risk: protocol evolution may introduce breaking changes. A2UI is in v0.8 (preview) and Agent Spec is actively evolving. MCP and AG-UI are more stable.

### Framework Compatibility

HypeTerminal should be agent-framework-agnostic. AG-UI enables this: agents built with LangGraph, CrewAI, Microsoft Agent Framework, or Google ADK can all communicate with HypeTerminal's frontend via the same AG-UI protocol.

### Standards Body Alignment

Both MCP and A2A are now under the Linux Foundation (AAIF). This reduces the risk of standards fragmentation. AG-UI is open source under CopilotKit but not yet under a standards body. A2UI is Google-led but Apache 2.0 licensed.

### Vendor Lock-in Risk

| Protocol | Lock-in Risk | Mitigation |
|----------|-------------|------------|
| MCP | Low | Linux Foundation governance, multiple implementations |
| AG-UI | Medium | Open source, but CopilotKit is primary implementor |
| A2UI | Medium | Apache 2.0, but Google-led, still in preview |
| A2A | Low | Linux Foundation governance, 50+ partners |
| Agent Spec | Medium-High | Oracle-led, limited adoption outside Oracle |

---

## Opportunities for HypeTerminal

1. **First Hyperliquid terminal with MCP tools**: No Hyperliquid trading terminal exposes its capabilities via MCP. Being first creates a network effect as agent developers target HypeTerminal's tool interface.

2. **AG-UI-native trading UX**: Build the most interactive agent-enhanced trading experience using AG-UI for real-time communication. Streaming analysis, live tool call visualization, and human-in-the-loop approval integrated into the terminal.

3. **Agent framework agnostic**: By adopting AG-UI, HypeTerminal becomes compatible with every major agent framework. Users bring their own agents, regardless of what framework they were built with.

4. **Custom A2UI trading components**: Define a trading-specific A2UI component catalog that becomes the standard for agent-generated trading UIs.

5. **Early mover on protocol composability**: The MCP + AG-UI + A2UI stack is new enough that HypeTerminal can influence how these protocols are used in trading contexts.

---

## Risks & Challenges

- **Protocol instability**: A2UI (v0.8) and Agent Spec are still evolving. Building on them now means potential rework.
- **Complexity**: Five protocols is a lot. Over-engineering with protocols before having a working agent experience would be a mistake.
- **Performance**: AG-UI event streaming adds latency. For latency-sensitive trading operations, direct execution paths may be needed alongside the protocol-based path.
- **Security**: MCP servers expose powerful trading tools. Authentication, rate limiting, and permission scoping are critical. A compromised MCP client could drain an account.
- **Adoption uncertainty**: While MCP and AG-UI have strong adoption, the crypto trading space may not adopt these protocols as quickly as enterprise software.
- **Dependency on CopilotKit**: AG-UI's primary implementation is CopilotKit. If CopilotKit changes direction, HypeTerminal's AG-UI integration could be affected.

---

## Open Questions

1. Should HypeTerminal build its own MCP server or use a hosted MCP service? Self-hosted gives control; hosted reduces infrastructure burden.
2. How does AG-UI performance compare to a custom WebSocket implementation for real-time trading data? Benchmark needed.
3. Should A2UI adoption wait for v1.0, or is v0.8 stable enough to build on?
4. When does multi-agent (A2A) become necessary? Single-agent with good MCP tools may be sufficient for a long time.
5. Should HypeTerminal contribute to MCP/AG-UI specifications to ensure trading use cases are well-supported?
6. How should MCP tool authentication work for HypeTerminal? Per-user API tokens? Wallet-based auth? OAuth?
7. Can AG-UI event streaming coexist with HypeTerminal's existing WebSocket-based real-time data (order book, trades)?
8. Is CopilotKit's React library compatible with HypeTerminal's design system (Base UI, Zustand, TanStack Router) without significant customization?

---

## Sources

- [Anthropic: Donating MCP to Agentic AI Foundation](https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation)
- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP Apps: Bringing UI Capabilities to MCP Clients](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)
- [MCP Wikipedia](https://en.wikipedia.org/wiki/Model_Context_Protocol)
- [Pento: A Year of MCP](https://www.pento.ai/blog/a-year-of-mcp-2025-review)
- [CopilotKit: AG-UI Protocol](https://www.copilotkit.ai/ag-ui)
- [CopilotKit: Introducing AG-UI](https://www.copilotkit.ai/blog/introducing-ag-ui-the-protocol-where-agents-meet-users)
- [AG-UI Documentation](https://docs.ag-ui.com/)
- [Microsoft: AG-UI Integration with Agent Framework](https://learn.microsoft.com/en-us/agent-framework/integrations/ag-ui/)
- [Microsoft: Agent Framework Release Candidate](https://devblogs.microsoft.com/foundry/microsoft-agent-framework-reaches-release-candidate/)
- [Microsoft: Golden Triangle Blog Post](https://devblogs.microsoft.com/agent-framework/the-golden-triangle-of-agentic-development-with-microsoft-agent-framework-ag-ui-devui-opentelemetry-deep-dive/)
- [Google: Introducing A2UI](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/)
- [A2UI.org](https://a2ui.org/)
- [CopilotKit: AG-UI and A2UI Differences](https://www.copilotkit.ai/ag-ui-and-a2ui)
- [CopilotKit: Build with A2UI + AG-UI](https://www.copilotkit.ai/blog/build-with-googles-new-a2ui-spec-agent-user-interfaces-with-a2ui-ag-ui)
- [Google: Announcing A2A Protocol](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)
- [Google Cloud: A2A Getting an Upgrade](https://cloud.google.com/blog/products/ai-machine-learning/agent2agent-protocol-is-getting-an-upgrade)
- [IBM: What is A2A Protocol](https://www.ibm.com/think/topics/agent2agent-protocol)
- [Linux Foundation: A2A Protocol Project](https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project-to-enable-secure-intelligent-communication-between-ai-agents)
- [Linux Foundation: Agentic AI Foundation](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)
- [Oracle: Introducing Agent Spec](https://blogs.oracle.com/ai-and-datascience/introducing-open-agent-specification)
- [Oracle: AG-UI Integration for Agent Spec](https://blogs.oracle.com/ai-and-datascience/announcing-ag-ui-integration-for-agent-spec)
- [Oracle: Agent Spec for A2UI](https://blogs.oracle.com/ai-and-datascience/announcing-agent-spec-for-a2ui-copilotkit-ag-ui)
- [Agent Spec GitHub](https://github.com/oracle/agent-spec)
- [Subhadip Mitra: Agent Protocol Stack](https://subhadipmitra.com/blog/2026/agent-protocol-stack/)
- [Medium: Essential 2026 AI Agent Protocol Stack](https://medium.com/@visrow/a2a-mcp-ag-ui-a2ui-the-essential-2026-ai-agent-protocol-stack-ee0e65a672ef)
- [Solo.io: AAIF and Secure Agentic Infrastructure](https://www.solo.io/blog/aaif-announcement-agentgateway)
