# AG-UI, A2UI, and Generative Trading Interfaces

## Executive Summary

- **AG-UI** is an open, event-based protocol (17 event types) from CopilotKit that standardizes bi-directional communication between AI agent backends and frontends, adopted by Google, AWS, Microsoft, Oracle, LangChain, and PydanticAI.
- **A2UI** is Google's complementary specification enabling agents to describe UI as structured JSONL -- a declarative blueprint rendered natively by the host app (React, Flutter, Angular) using its own component catalog, eliminating UI injection risk.
- Three **generative UI patterns** define the control spectrum: static (agent picks predefined components), declarative (agent returns structured UI spec), and open-ended (agent returns full UI surfaces via MCP Apps).
- **Bloomberg ASKB** validates the paradigm in finance: a conversational AI layer replacing command-based terminal navigation with natural language workflows, synthesizing data from structured and unstructured sources in real time.
- **Oracle's Open Agent Specification + AG-UI + A2UI** (March 2026 joint release) creates a full-stack standard: define agents declaratively, stream interactions in real time, and describe required UI as structured data -- a composable foundation HypeTerminal can adopt.

---

## 1. AG-UI Protocol

### What It Is

AG-UI (Agent-User Interaction Protocol) is an open, lightweight, event-based protocol created by CopilotKit that standardizes how agent backends connect to agent frontends. It transforms agents from background processes into real-time collaborators that are transparent, reliable, and aligned with the user.

The protocol defines exactly **17 event types** organized into five categories:

### Event Categories

**Lifecycle Events**
- `RUN_STARTED` / `RUN_FINISHED` / `RUN_ERROR` -- bracket the agent's execution lifecycle.

**Text Message Events**
- `TEXT_MESSAGE_START` / `TEXT_MESSAGE_CONTENT` / `TEXT_MESSAGE_END` -- stream text token-by-token for real-time display, identical to how LLM streaming works but with agent-level semantics.

**Tool Call Events**
- `TOOL_CALL_START` / `TOOL_CALL_ARGS` / `TOOL_CALL_END` / `TOOL_CALL_RESULT` -- the agent invokes frontend-defined tools, streams argument fragments, and receives results. This is the primary mechanism for generative UI: a tool call triggers a React component render.

**State Synchronization Events**
- `STATE_SNAPSHOT` -- delivers the complete agent state, typically at session start or resync.
- `STATE_DELTA` -- incremental JSON Patch (RFC 6902) updates, bandwidth-efficient.

**Custom Events**
- `CUSTOM` -- extensible event type for domain-specific needs (e.g., order fill notifications, liquidation warnings).

### Transport

AG-UI supports both **Server-Sent Events (SSE)** for unidirectional streaming and **WebSocket** for full bidirectional communication. Events are JSON-formatted and transmitted the moment they occur.

### Adoption (as of March 2026)

First-party clients exist for React and Angular. Community clients are emerging in Golang, Rust, and Java. Amazon Bedrock AgentCore Runtime added native AG-UI support in March 2026, and Microsoft's Agent Framework provides official AG-UI integration.

### Why It Matters for Trading

AG-UI's state synchronization events map directly to trading terminal needs: order state, position updates, and PnL changes can flow through `STATE_DELTA` events. Tool calls can trigger order confirmation cards, strategy visualizations, or risk alerts. The protocol's streaming-first design handles the real-time demands of a trading UI.

---

## 2. A2UI (Google)

### What It Is

A2UI (Agent-to-User Interface) is an open standard and set of libraries from Google that allows agents to "speak UI" by sending a declarative JSON format describing the *intent* of the UI, not executable code. The host application renders these descriptions using its own native component catalog.

### Architecture

A2UI takes a **native-first approach**: instead of receiving an opaque payload to display in a sandbox, the agent sends a blueprint of native components. The client application maintains a catalog of trusted, pre-approved UI components. The agent can only request components from that catalog.

**Key properties:**
- **Flat, streaming JSONL** -- designed for easy LLM generation. Models can build UIs incrementally without needing perfect JSON in one shot.
- **Framework-agnostic** -- one agent response renders on React, Angular, Flutter, or native mobile with the host's own styling and accessibility.
- **Security by design** -- UI as data, not code. No arbitrary script execution from model output. Agents reference a client-controlled component catalog, reducing UI injection risk.

### Specification Versions

- **v0.8** (stable) -- the current production specification.
- **v0.9** (draft) -- introduces `createSurface` replacing `beginRendering`, flatter component structure (`"component": "Text"` instead of nested objects), and version fields on all messages.

### A2UI vs AG-UI

These are **complementary, not competing** standards:

| Concern | AG-UI | A2UI |
|---------|-------|------|
| Purpose | Agent-frontend runtime communication | UI description format |
| Scope | Event streaming, state sync, tool calls | Component blueprints, layout, data binding |
| Output | Events (text, tool calls, state) | JSONL UI descriptions |
| Rendering | Frontend interprets events | Frontend renders native components from spec |

CopilotKit's renderer accepts A2UI descriptions delivered via AG-UI tool call events, making the two protocols naturally composable.

### Trading Application

A2UI's component catalog model is ideal for trading: define a catalog of `OrderCard`, `PositionSummary`, `RiskGauge`, `StrategyVisualizer` components. The agent describes *which* component to render and *what data* to fill it with. The trading terminal renders it with its own design system -- consistent with the rest of the UI, inheriting themes, accessibility, and responsive behavior.

---

## 3. Three Generative UI Patterns

### Pattern 1: Static Generative UI (High Control, Low Freedom)

The frontend owns the UI completely. The agent's role is limited to selecting which predefined component to show and filling it with data. The agent acts as a data-routing layer.

**How it works:**
1. Agent receives user intent (e.g., "show me my ETH position").
2. Agent calls a tool like `renderPositionCard({ asset: "ETH", ... })`.
3. Frontend maps that tool call to a pre-built `<PositionCard>` React component.
4. Component renders with the agent-provided data.

**Trade-offs:**
- Maximum consistency and safety -- the agent cannot produce unexpected UI.
- Limited flexibility -- every possible UI must be pre-built.
- Best for: order confirmations, position displays, PnL summaries.

### Pattern 2: Declarative Generative UI (Shared Control)

The agent returns a structured UI specification (cards, lists, forms, tables) and the frontend renders it with its own constraints and styling. A2UI is the primary specification for this pattern.

**How it works:**
1. Agent receives a complex query (e.g., "compare my top 5 positions by unrealized PnL").
2. Agent generates an A2UI JSONL description: a table with columns, rows, conditional formatting.
3. Frontend's A2UI renderer maps each component to native React components from the catalog.
4. Result is a styled, accessible, theme-consistent comparison table.

**Trade-offs:**
- Agents can compose novel layouts from known primitives.
- Frontend retains styling and security control.
- Risk of awkward layouts if the agent's composition logic is poor.
- Best for: dynamic dashboards, multi-asset comparisons, strategy summaries.

### Pattern 3: Open-Ended Generative UI (Low Control, High Freedom)

Enabled by **MCP Apps** -- the agent returns a full UI surface (often embedded HTML/JS or an iframe). The frontend cedes most control to the agent.

**How it works:**
1. Agent determines it needs a custom visualization (e.g., a Monte Carlo simulation chart).
2. Agent generates or retrieves a full UI artifact via MCP.
3. Frontend embeds it in a sandboxed container.

**Trade-offs:**
- Maximum flexibility -- agents can produce any UI.
- Breaks design consistency, introduces security concerns.
- Requires sandboxing (iframe, CSP policies).
- Best for: one-off analytical tools, experimental visualizations, third-party integrations.

### Recommended Approach for HypeTerminal

Start with **Pattern 1** (static) for all order execution surfaces. Use **Pattern 2** (declarative) for analytical and informational surfaces. Avoid Pattern 3 unless there is a compelling use case that cannot be served by the first two.

---

## 4. CopilotKit as Implementation Framework

### Overview

CopilotKit is the company behind the AG-UI protocol and the leading React framework for building agentic frontends. It provides the SDK layer between AG-UI's protocol and React components.

### Key Capabilities

- **React SDK** with streaming-first architecture (also supports Next.js, Vue, Angular).
- **Generative UI rendering** -- agent tool calls map to React components automatically.
- **Shared state** -- `useCopilotReadable` exposes frontend state to the agent; `STATE_DELTA` events push agent state back.
- **Human-in-the-loop** -- agents can pause execution to request user confirmation before proceeding.
- **Frontend tools** -- define tools that run in the browser (e.g., scroll to a chart, highlight a position).

### Integration Model

```
User Input -> CopilotKit React SDK -> AG-UI Events -> Agent Backend
                                                         |
                                                    MCP Tool Calls
                                                         |
Agent Response <- AG-UI Events <- Tool Results / State
                                                         |
                                                    A2UI UI Spec (optional)
```

### Relevance to HypeTerminal

CopilotKit can be integrated into an existing React application without rewriting the app. The SDK wraps the existing app, exposing state and tools to an agent backend. For HypeTerminal:

- Expose current market, position, and order state via `useCopilotReadable`.
- Define trading tools (place order, modify order, close position) as frontend tools with confirmation steps.
- Render agent responses as native HypeTerminal components using the existing design system.

---

## 5. AG-UI + MCP Composability

### The 2026 Protocol Stack

The emerging standard stack layers four protocols:

| Layer | Protocol | Purpose |
|-------|----------|---------|
| Agent Coordination | A2A (Google) | Agent-to-agent communication |
| Tools | MCP (Anthropic) | Standardized tool and resource access |
| Runtime | AG-UI (CopilotKit) | Agent-frontend event streaming |
| UI Description | A2UI (Google) | Structured UI blueprints |

### How They Compose

An agent receives a user request via AG-UI. It uses MCP to call external tools (market data APIs, risk calculators, blockchain RPCs). It streams progress and state back via AG-UI events. When UI is needed, it describes it via A2UI, delivered as an AG-UI tool call payload. The frontend renders A2UI descriptions using native components.

MCP crossed **97 million monthly SDK downloads** (Python + TypeScript combined) by February 2026 and has been adopted by Anthropic, OpenAI, Google, Microsoft, and Amazon.

### MCP Apps vs AG-UI

MCP Apps (formerly MCP-UI) is the right fit when a **tool** needs to render a form, dashboard, or workflow inside a chat or IDE host. AG-UI is the right fit when you **own the frontend** and need a live, stateful agent session. For HypeTerminal, AG-UI is the primary protocol -- MCP provides the tool layer underneath.

---

## 6. Bloomberg ASKB Precedent

### What Bloomberg Built

Bloomberg introduced **ASKB**, a conversational AI interface (in beta as of early 2026) that reshapes how investors discover, analyze, and act on information using the Bloomberg Terminal. Financial professionals can use everyday language to tap into Bloomberg's structured data, unstructured documents, news, research, and analytics.

### Architecture

ASKB uses a coordinated network of AI agents working in parallel. These agents dynamically access Bloomberg's data, news, research, and analytics to deliver rich, contextual answers to complex questions about markets, companies, and investment ideas.

### Key Features

- **Conversational interface** replacing Bloomberg's famously cryptic command system (e.g., `EQUITY FUNCTION` commands become natural language queries).
- **ASKB Workflows** -- users describe multi-step activities (pre-earnings prep, post-earnings analysis, meeting prep) and ASKB assembles structured output in minutes.
- **BQL code generation** -- the system can generate Bloomberg Query Language code for advanced analysis in Excel or BQuant.

### Lessons for HypeTerminal

1. **Replace, don't replicate** -- ASKB doesn't add a chatbot beside the terminal. It replaces command navigation with conversation. HypeTerminal should aim for the same: natural language as a first-class navigation and execution method, not a sidebar feature.
2. **Multi-agent coordination** -- ASKB uses parallel agents for different data domains. HypeTerminal could use separate agents for market data, position management, and risk analysis.
3. **Structured output** -- ASKB generates structured workflows, not just text answers. Trading UIs need structured output (order cards, position tables) more than prose.

---

## 7. Design Patterns for Trading

### Order Confirmation Cards

Static generative UI pattern. Agent parses user intent ("buy 5 ETH at market") and renders an `OrderConfirmationCard` component with:
- Direction, size, price, estimated cost
- Margin impact, liquidation price change
- One-click confirm / modify / cancel actions
- Human-in-the-loop: agent pauses execution until user confirms

### Strategy Visualization

Declarative generative UI pattern. Agent composes a multi-component layout:
- Entry/exit levels overlaid on the current chart
- Risk/reward ratio visualization
- Position sizing recommendation based on account equity
- Historical backtest summary (if applicable)

### Risk Dashboards

Declarative or static pattern. Agent generates or populates:
- Portfolio heat map by asset correlation
- Liquidation proximity gauges per position
- Margin utilization bar with warning thresholds
- Funding rate exposure summary

### Alert Configuration

Static pattern with form components:
- Agent asks clarifying questions to build alert parameters
- Renders a structured form for price alerts, funding rate alerts, liquidation warnings
- Confirms configuration before activating

---

## 8. Integrating Agent-Driven UI into an Existing React Trading Terminal

### Integration Strategy

1. **Wrap, don't rewrite** -- CopilotKit's `<CopilotKit>` provider wraps the existing app. No migration required.
2. **Expose state incrementally** -- start by exposing read-only state (current market, positions, account balance) via `useCopilotReadable`.
3. **Define tools with confirmation** -- trading tools (place order, close position) require human-in-the-loop confirmation. Non-destructive tools (fetch data, display chart) can auto-execute.
4. **Map tool calls to existing components** -- reuse the existing component library. An agent tool call renders the same `OrderForm` component a user would see when clicking the UI.
5. **Add a chat surface** -- a collapsible panel or command palette (Cmd+K) that accepts natural language input and displays agent responses with generative UI.

### State Flow

```
Zustand Store (existing) --expose--> CopilotKit Readable State
                                          |
                                    AG-UI to Agent Backend
                                          |
                                    Agent decides action
                                          |
AG-UI Tool Call Event --render--> Existing React Component
                                          |
                                    User confirms
                                          |
Zustand Store (existing) <--update-- Action executed
```

### Progressive Enhancement

- **Phase 1**: Read-only agent. Can answer questions about positions, markets, and account state. Renders information cards.
- **Phase 2**: Suggestive agent. Can propose orders and strategies. Renders confirmation cards requiring user approval.
- **Phase 3**: Delegated agent. Can execute approved order types within user-defined constraints (max size, approved assets).

---

## 9. Oracle's Open Agent Specification + AG-UI

### The March 2026 Joint Release

Oracle, Google, and CopilotKit jointly released an integration connecting three layers:

1. **Open Agent Specification (Agent Spec)** -- Oracle's framework-agnostic declarative language for defining agentic systems. Define agent logic, workflows, and tool usage once, run on compatible runtimes (LangGraph, WayFlow, others).
2. **AG-UI** -- handles the live interaction stream between agent and frontend.
3. **A2UI** -- allows agents to describe required UI as structured JSONL, rendered by CopilotKit.

### Practical Impact

Developers define agents declaratively once and expose a standardized interaction stream. The frontend renders structured UI surfaces without custom wiring per tool or workflow. This reduces vendor lock-in and accelerates development.

### Relevance

For HypeTerminal, this means a trading agent defined in Agent Spec could be swapped between runtimes (LangGraph, custom Python, etc.) without changing the frontend integration. The AG-UI contract remains stable.

---

## 10. Opportunities for HypeTerminal

1. **Command Palette Agent** -- a Cmd+K interface that accepts natural language, resolves intent, and renders actionable UI (order cards, position summaries, market comparisons) using static generative UI with the existing component library.

2. **Streaming Position Monitor** -- AG-UI `STATE_DELTA` events pushing real-time position and PnL updates to an agent-managed dashboard that adapts layout based on what the user is focused on.

3. **Multi-Step Workflow Automation** -- "Prepare for ETH earnings" type commands that trigger a sequence of agent actions: fetch funding rates, check open positions, display risk summary, suggest hedging trades.

4. **Onboarding Agent** -- a conversational guide that walks new users through the terminal, rendering contextual UI components (tooltips, feature highlights, sample trades) using generative UI.

5. **Risk Alerting Agent** -- monitors positions and proactively renders warning cards when liquidation proximity, funding rate exposure, or correlation risk exceeds thresholds.

6. **A2UI Component Catalog** -- define a catalog of trading-specific A2UI components (OrderCard, PositionTable, RiskGauge, FundingChart) that any agent can compose into novel layouts.

---

## 11. Risks and Challenges

1. **Latency** -- trading requires sub-second UI updates. AG-UI streaming adds a network hop. Agent inference adds latency. For execution surfaces, direct UI interaction must remain the primary path.

2. **Hallucination in Financial Context** -- an agent that hallucinates a price, position size, or PnL figure in a generated UI card could lead to incorrect trading decisions. All agent-generated data must be validated against the canonical Zustand store state.

3. **Security** -- exposing trading tools to an agent creates an attack surface. Session-scoped permissions, maximum order size limits, and mandatory human confirmation for all execution actions are non-negotiable.

4. **Protocol Maturity** -- AG-UI and A2UI are pre-1.0 standards. APIs will change. Building on them requires accepting breaking changes and maintaining adaptation layers.

5. **Complexity Budget** -- adding an agent layer to an already complex trading terminal increases cognitive load for developers. The integration must be incremental and reversible.

6. **User Trust** -- traders are skeptical of automated systems. The agent must be transparent about its reasoning and never execute without explicit confirmation. Building trust requires a long read-only phase before enabling execution.

---

## 12. Open Questions

1. **Which AG-UI transport for trading?** SSE is simpler but unidirectional. WebSocket enables bidirectional communication (user can interrupt agent mid-stream). Trading may require WebSocket for cancel/modify flows.

2. **Where does the agent run?** Client-side (privacy, latency) vs. server-side (compute, multi-user) vs. hybrid? For a DeFi terminal, private key proximity matters.

3. **How granular should the A2UI component catalog be?** Coarse components (OrderCard) are safer but less flexible. Fine-grained primitives (Text, Row, Column) give agents more freedom but more room for poor layouts.

4. **Can AG-UI handle Hyperliquid's WebSocket data rates?** L2 order book updates, trades, and fills generate high-frequency events. The agent may need to operate on aggregated state rather than raw feeds.

5. **What is the right confirmation UX?** Inline confirmation in chat? Modal overlay? Toast with countdown? Each has trade-offs in speed vs. safety.

6. **How to handle agent errors gracefully?** If the agent misinterprets an intent mid-execution, what is the rollback mechanism? Trading actions may be irreversible on-chain.

7. **Multi-agent coordination for trading** -- should market analysis, risk assessment, and order execution be separate agents communicating via A2A, or a single agent with multiple tools?

---

## Sources

- [AG-UI Protocol Documentation](https://docs.ag-ui.com/introduction)
- [AG-UI GitHub](https://github.com/ag-ui-protocol/ag-ui)
- [CopilotKit AG-UI](https://www.copilotkit.ai/ag-ui)
- [A2UI Official Site](https://a2ui.org/)
- [Google A2UI Introduction](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/)
- [Google A2UI GitHub](https://github.com/google/A2UI)
- [CopilotKit: A2UI + AG-UI Integration](https://www.copilotkit.ai/blog/build-with-googles-new-a2ui-spec-agent-user-interfaces-with-a2ui-ag-ui)
- [AG-UI and A2UI Differences](https://www.copilotkit.ai/ag-ui-and-a2ui)
- [Developer's Guide to Generative UI in 2026](https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026)
- [CopilotKit Generative UI Examples](https://github.com/CopilotKit/generative-ui)
- [Oracle AG-UI Integration for Agent Spec](https://blogs.oracle.com/ai-and-datascience/announcing-ag-ui-integration-for-agent-spec)
- [Oracle A2UI + AG-UI Announcement](https://blogs.oracle.com/ai-and-datascience/announcing-agent-spec-for-a2ui-copilotkit-ag-ui)
- [Oracle Open Agent Specification GitHub](https://github.com/oracle/agent-spec)
- [Bloomberg ASKB Announcement](https://www.bloomberg.com/company/stories/meet-askb-bloomberg-introduces-agentic-ai-to-the-bloomberg-terminal/)
- [Bloomberg ASKB Press Release](https://www.bloomberg.com/professional/insights/press-announcement/meet-askb-a-first-look-at-the-future-of-the-bloomberg-terminal-in-the-age-of-agentic-ai/)
- [AG-UI Events Documentation](https://docs.ag-ui.com/concepts/events)
- [Amazon Bedrock AG-UI Support](https://aws.amazon.com/about-aws/whats-new/2026/03/amazon-bedrock-agentcore-runtime-ag-ui-protocol/)
- [Microsoft Agent Framework AG-UI Integration](https://learn.microsoft.com/en-us/agent-framework/integrations/ag-ui/)
- [2026 AI Agent Protocol Stack Overview](https://medium.com/@visrow/a2a-mcp-ag-ui-a2ui-the-essential-2026-ai-agent-protocol-stack-ee0e65a672ef)
- [State of Agentic UI: AG-UI, MCP-UI, A2UI](https://www.copilotkit.ai/blog/the-state-of-agentic-ui-comparing-ag-ui-mcp-ui-and-a2ui-protocols)
- [Agent Protocols Overview (Google Cloud)](https://medium.com/google-cloud/agent-protocols-mcp-a2a-a2ui-ag-ui-3ed8b356f1bc)
