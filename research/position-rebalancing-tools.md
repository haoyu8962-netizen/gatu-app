# Auto-Rebalancing Engine + Position Manager for HypeTerminal

## 1. Executive Summary

Perpetual futures traders on Hyperliquid perform a significant amount of manual, repetitive portfolio work every day: trimming winners, adding to losers, adjusting leverage after drawdowns, rotating between assets based on funding rates, and managing risk across correlated positions. This work is error-prone under stress, slow during volatile markets, and impossible to do consistently at scale.

Existing tools address fragments of the problem. 3Commas and Shrimpy focus on spot rebalancing. goodcryptoX and Katoshi bring trailing stops and DCA bots to Hyperliquid. TradingView-to-execution bridges like Tickerly handle signal routing. But no tool provides an integrated **position-level rebalancing engine** that understands perpetual futures mechanics -- funding rates, margin modes, leverage tiers, cross-margin dependencies, and liquidation proximity -- while offering portfolio-wide adjustment logic.

HypeTerminal already has the foundation: real-time position tracking via WebSocket subscriptions, a full order intent system (market, limit, trigger, scale, TWAP), batch order modification, and scheduled cancellation through the Hyperliquid SDK. The opportunity is to layer a rebalancing and position management engine on top of this infrastructure, giving traders automation that understands perps natively.

The proposed system has two core modules:
1. **Auto-Rebalancing Engine** -- maintains target portfolio allocations across perp positions using threshold, time, drift, and signal-based triggers
2. **Position Manager** -- handles per-position lifecycle automation: scaling in/out, trailing mechanisms, risk limits, and profit-taking schedules

This document covers the daily workflows traders perform manually, the gaps in current tools, a detailed feature proposal, architecture considerations within HypeTerminal's codebase, and a prioritized implementation plan.

---

## 2. Daily Trader Workflows

### 2.1 Manual Rebalancing

**What traders do:** Perpetual futures portfolios drift from target allocations as prices move. A trader who wants 40% BTC / 30% ETH / 20% SOL / 10% DOGE by notional exposure will find their portfolio skewed within hours during volatile markets. They manually:

- Calculate current allocation percentages from position values
- Determine which positions are overweight/underweight vs. targets
- Compute the notional adjustment needed per position
- Execute a series of market or limit orders to trim overweight positions and add to underweight ones
- Re-check allocations after fills to account for slippage
- Repeat multiple times per day during trending markets

**Pain points:**
- Calculation errors under pressure (especially with leveraged notional)
- Execution delay -- by the time orders are placed, prices have moved
- Inconsistency -- traders skip rebalancing when busy or emotional
- No awareness of funding rate cost of holding positions that need trimming
- Cross-margin positions complicate allocation math (shared collateral)

### 2.2 Delta-Neutral and Funding Rate Management

**What traders do:** Delta-neutral strategies require maintaining offsetting positions (spot long + perp short, or cross-exchange hedges). Traders:

- Monitor funding rates across assets to identify profitable carry trades
- Open short perp positions against spot holdings to earn positive funding
- Rebalance when price drift causes the hedge to become imperfect
- Rotate into higher-funding assets when rates shift
- Close positions when funding turns negative

**Pain points:**
- Funding rate changes happen every 8 hours (or every hour on Hyperliquid) -- manual monitoring is exhausting
- Rebalancing a delta-neutral book requires simultaneous spot and perp adjustments
- No tool consolidates funding rate data with position management on Hyperliquid
- Slippage during rebalancing erodes the small margins from funding arbitrage

### 2.3 Profit-Taking Strategies

**What traders do:** Traders use various approaches to lock in gains:

- **Fixed targets**: Close 100% at a predetermined price
- **Scaled exits**: Close 25% at +10%, 25% at +20%, let the rest run
- **Trailing stops**: Move stop-loss up as price rises (e.g., trail by 5% from high)
- **Time-based**: Take profits after holding for N hours/days regardless of P&L
- **ROE-based**: Exit when return on equity hits a threshold (e.g., 50% ROE)
- **Funding-adjusted**: Factor in cumulative funding paid/received when deciding exit timing

**Pain points:**
- Hyperliquid's native TP/SL is binary (one price, full position) -- no partial exits
- No trailing stop mechanism on-chain; traders must watch and manually adjust
- Scale orders work for entries but there is no "scale exit" workflow
- No way to combine time-based and price-based exit logic
- Funding costs are displayed but not integrated into exit decision-making

### 2.4 Portfolio Risk Adjustments

**What traders do:** After drawdowns or regime changes, traders adjust their entire portfolio:

- Reduce leverage across all positions (deleveraging)
- Cut correlated positions (e.g., reduce both SOL and AVAX if L1s are selling off)
- Increase hedges when volatility spikes
- Shift from directional to market-neutral when unsure about direction
- Rebalance margin allocation between isolated and cross-margin positions
- Monitor liquidation proximity across all positions and prioritize the most at-risk

**Pain points:**
- No portfolio-wide risk view that aggregates liquidation risk, correlation, and margin usage
- Adjusting leverage on multiple positions is tedious (one at a time in Hyperliquid UI)
- No automated deleveraging trigger based on portfolio drawdown
- Correlation data requires external tools -- not available in any Hyperliquid interface
- Emergency risk reduction (panic close) requires clicking through each position

---

## 3. Current Tool Landscape & Gaps

### 3.1 Hyperliquid Native UI

**Strengths:**
- Real-time position display with PnL, funding, margin, liquidation price
- TP/SL per position (full position, single price)
- Market/limit close, reverse position
- TWAP orders for large executions
- Scale orders for distributed entries
- Vault system for delegated trading
- Sub-accounts for strategy isolation

**Gaps:**
- No partial TP/SL (can't close 50% at one price, 50% at another)
- No trailing stop orders
- No portfolio-level allocation view or rebalancing
- No automated position sizing based on risk parameters
- No batch operations across multiple positions (close all, reduce all)
- No funding rate optimization across positions
- No correlation or risk parity analysis

### 3.2 goodcryptoX

**Strengths:** First to bring trailing stops and DCA bots to Hyperliquid DEX. On-chart order visualization. Grid and infinity trailing bots.

**Gaps:** Bot-centric, not portfolio-centric. No rebalancing logic. No multi-position awareness. Each bot operates independently without understanding the portfolio context.

### 3.3 Katoshi AI

**Strengths:** AI-powered trading agents for Hyperliquid. No-code agent creation. Supports position management and leverage control.

**Gaps:** Agent-based approach requires users to define strategies in natural language -- not suitable for precise allocation targets. No built-in rebalancing primitives. Black-box execution.

### 3.4 3Commas

**Strengths:** Mature platform with DCA bots, grid bots, signal bots. Supports some perp exchanges. SmartTrade with trailing features.

**Gaps:** No Hyperliquid integration. Spot rebalancing focus -- perp portfolio management is an afterthought. No cross-margin awareness. No funding rate integration. Each bot is independent; no portfolio-level coordination.

### 3.5 Shrimpy

**Strengths:** Purpose-built for portfolio rebalancing. Threshold and time-based triggers. Supports portfolio allocation targets.

**Gaps:** Spot-only rebalancing. No perpetual futures support whatsoever. No Hyperliquid integration. Cold wallet assets tracked but not tradeable. Reported bugs and reliability issues.

### 3.6 Limits.trade

**Strengths:** Price-based conditional orders for Hyperliquid. Non-custodial (signed orders only). Adapts orders to market movement within defined ranges.

**Gaps:** Order-level tool, not portfolio-level. No rebalancing logic. No position lifecycle management.

### 3.7 Hummingbot

**Strengths:** Open-source. Self-hosted. Hyperliquid connector available. Customizable strategies via Python.

**Gaps:** Requires coding knowledge. High setup friction. Market-making focused, not portfolio management. No GUI for rebalancing configuration.

### 3.8 Summary of Gaps

| Capability | HL Native | goodcryptoX | Katoshi | 3Commas | Shrimpy | HypeTerminal (proposed) |
|---|---|---|---|---|---|---|
| Portfolio allocation targets | - | - | - | - | Spot only | Perp + Spot |
| Threshold-based rebalancing | - | - | - | - | Spot only | Yes |
| Drift-based rebalancing | - | - | - | - | - | Yes |
| Funding-rate-aware rebalancing | - | - | - | - | - | Yes |
| Trailing stop (per position) | - | Yes | - | Yes (CEX) | - | Yes |
| Scaled profit-taking | - | - | - | Partial | - | Yes |
| Portfolio risk dashboard | - | - | - | - | - | Yes |
| Batch position operations | - | - | - | - | - | Yes |
| Correlation-aware sizing | - | - | - | - | - | Yes |
| Cross-margin-aware rebalancing | - | - | - | - | - | Yes |
| Liquidation proximity alerts | Basic | - | - | - | - | Multi-position |
| Hyperliquid-native | Yes | Yes | Yes | No | No | Yes |

---

## 4. Proposed: Auto-Rebalancing Engine + Position Manager

### 4.1 Core Architecture

The system consists of two modules that share a common data layer:

```
+------------------------------------------+
|          HypeTerminal UI Layer           |
|  (Portfolio View, Position Cards, Alerts)|
+------------------------------------------+
         |                    |
+------------------+  +------------------+
| Rebalancing      |  | Position         |
| Engine           |  | Manager          |
| - Allocations    |  | - Per-position   |
| - Triggers       |  |   rules          |
| - Drift calc     |  | - Trailing logic |
| - Execution plan |  | - Scale exits    |
+------------------+  +------------------+
         |                    |
+------------------------------------------+
|         Shared Data Layer                |
| - Real-time positions (WS)              |
| - All mids / mark prices                |
| - Open orders                           |
| - Funding rates                         |
| - Market metadata (szDecimals, leverage) |
+------------------------------------------+
         |
+------------------------------------------+
|     Hyperliquid SDK / Exchange Layer     |
| - placeOrder / batchModify              |
| - scheduleCancel                        |
| - updateLeverage / updateIsolatedMargin |
+------------------------------------------+
```

### 4.2 Rebalancing Strategies

#### 4.2.1 Threshold-Based Rebalancing

**How it works:** User defines target allocations (e.g., BTC 40%, ETH 30%, SOL 20%, DOGE 10%). When any position drifts beyond a configurable threshold (e.g., 5% from target), the engine generates rebalancing orders.

**Configuration:**
- Target allocations (% of total portfolio notional)
- Drift threshold to trigger rebalance (1-20%)
- Minimum trade size (to avoid dust trades)
- Execution type: market, limit (with offset from mid), or TWAP
- Cooldown period between rebalances (prevent churn)

**Perp-specific considerations:**
- Allocation is based on notional position value, not margin used
- Long and short positions have different allocation implications
- Cross-margin positions share collateral -- reducing one position frees margin for others
- Leverage must be considered: a 10x BTC position with $1K margin is $10K notional

#### 4.2.2 Time-Based Rebalancing

**How it works:** Portfolio rebalances on a fixed schedule regardless of drift magnitude.

**Configuration:**
- Interval: hourly, every 4 hours, every 8 hours (aligned with funding), daily
- Time-of-day preference (e.g., rebalance 5 minutes after funding settlement)
- Skip if drift is below minimum threshold (avoid unnecessary trades)

**Perp-specific considerations:**
- Aligning rebalance with funding rate settlement avoids paying/receiving partial funding on positions about to be adjusted
- Time-based rebalancing pairs well with funding rate rotation strategies

#### 4.2.3 Drift-Based Rebalancing

**How it works:** Continuously monitors portfolio drift (sum of absolute deviations from targets) and rebalances when aggregate drift exceeds threshold.

**Configuration:**
- Aggregate drift threshold (e.g., rebalance when total drift > 10%)
- Per-position drift cap (e.g., no single position more than 8% from target)
- Priority ordering: rebalance most-drifted positions first
- Partial rebalancing: correct the largest drifts first, up to a max number of trades per cycle

**Perp-specific considerations:**
- Drift calculation must account for unrealized PnL (positions grow/shrink in value)
- Funding payments change effective position cost basis
- Liquidation proximity should increase urgency of drift correction

#### 4.2.4 Signal-Based Rebalancing

**How it works:** External signals (funding rate changes, volatility spikes, correlation shifts) trigger allocation adjustments.

**Signals:**
- **Funding rate rotation**: When funding on asset A drops below threshold and asset B rises above threshold, rotate allocation from A to B
- **Volatility targeting**: When realized volatility of the portfolio exceeds target, proportionally reduce all positions
- **Correlation break**: When correlation between two held assets exceeds threshold (e.g., 0.7), reduce the smaller position
- **Drawdown circuit breaker**: When portfolio drawdown from peak exceeds threshold, reduce all positions by X%
- **Custom webhooks**: Accept signals from TradingView or external systems to trigger rebalancing

### 4.3 Position Manager Features

#### 4.3.1 Scaled Profit-Taking

**How it works:** Define multiple exit levels for a position, each closing a percentage of the remaining size.

**Example configuration for a long BTC position:**
```
Level 1: Close 25% at +5% from entry -> move SL to breakeven
Level 2: Close 25% at +10% from entry -> move SL to +5%
Level 3: Close 25% at +20% from entry -> move SL to +10%
Level 4: Trail remaining 25% with 8% trailing stop
```

**Implementation approach:**
- Store exit plan in Zustand store (persisted)
- Monitor mark prices via existing `useSubAllMids` subscription
- When a level triggers, build a `MarketCloseIntent` or `LimitCloseIntent` for the partial size
- Use the existing `buildOrderPlan` system to generate exchange orders
- After partial close, update remaining levels and adjust TP/SL orders via `batchModify`

#### 4.3.2 Trailing Mechanisms

**Trailing Stop-Loss:**
- Track highest mark price since position opened (for longs) or lowest (for shorts)
- Maintain stop at a fixed percentage or dollar amount below the high water mark
- Optional activation price: trailing only begins after position reaches a minimum profit
- Optional step mode: trail in discrete steps (e.g., move stop every 2% gain)

**Trailing Take-Profit:**
- Opposite of trailing stop: track the low water mark after triggering initial profit target
- Close position if price reverses by X% from the profit peak
- Useful for capturing extended moves while protecting gains

**Implementation approach:**
- Client-side price tracking (no on-chain state needed)
- Use `scheduleCancel` + new trigger orders to approximate trailing behavior
- For precise trailing, maintain a background price watcher that fires market orders when trail is hit
- Store trail configuration and high/low water marks in persisted store
- Survive page refreshes by persisting trail state and reconstructing on mount

#### 4.3.3 Risk Limits

**Per-Position Limits:**
- Maximum position size (notional or units)
- Maximum unrealized loss before forced close
- Maximum time in position (auto-close after N hours/days)
- Maximum cumulative funding paid
- Minimum distance from liquidation price (force deleverage if liq gets too close)

**Portfolio-Level Limits:**
- Maximum total notional exposure
- Maximum number of concurrent positions
- Maximum aggregate unrealized loss
- Maximum single-asset concentration (prevent portfolio from becoming 80% one coin)
- Maximum correlation between held positions

**Implementation approach:**
- Risk checks run on every price update tick
- Violations trigger warnings first, then automated actions after configurable grace period
- Actions: alert only, reduce to limit, close entirely
- Emergency override: "panic close all" button that builds MarketCloseIntent for every position simultaneously

#### 4.3.4 Position Scaling

**Scale-In Rules:**
- Add to position at predefined price levels (support/resistance, percentage from entry)
- DCA on drawdown: add X% more every Y% the position goes against you
- Conditional scaling: only add if funding rate is favorable and RSI is below threshold
- Maximum scale-in count and total position size cap

**Scale-Out Rules:**
- Reduce position at predefined profit levels
- Reduce on volatility spike (position size inversely proportional to recent volatility)
- Time-based reduction: gradually close position over N hours (essentially a close-side TWAP)

### 4.4 Architecture Considerations for HypeTerminal

#### 4.4.1 Data Layer (Already Exists)

HypeTerminal already subscribes to the necessary real-time data:
- **Positions**: `useSubAllDexsClearinghouseState` provides all position data
- **Mark prices**: `useSubAllMids` provides real-time mid prices for all assets
- **Open orders**: `useSubOpenOrders` provides existing TP/SL and limit orders
- **Market metadata**: `useMarkets` provides szDecimals, maxLeverage, margin modes

**What needs to be added:**
- Funding rate history subscription (for funding-aware rebalancing)
- Position history tracking (high water marks, entry timestamps, cumulative stats)
- Portfolio-level derived state (total notional, allocation percentages, drift metrics)

#### 4.4.2 Engine Layer (New)

**Location:** `src/domain/rebalance/` and `src/domain/position-manager/`

Following HypeTerminal's pattern of keeping calculations out of components:

```
src/domain/rebalance/
  allocation.ts      -- target allocation types, drift calculation
  triggers.ts        -- trigger evaluation (threshold, time, drift, signal)
  execution-plan.ts  -- generate order intents from rebalance decisions
  funding-rotation.ts -- funding rate analysis and rotation logic

src/domain/position-manager/
  scaled-exits.ts    -- exit plan types and level evaluation
  trailing.ts        -- trailing stop/profit calculation logic
  risk-limits.ts     -- risk limit checking and violation detection
  scaling.ts         -- scale-in/out rule evaluation
```

**Key design principle:** These modules produce **order intents** (`OrderIntent` from the existing system) -- they never interact with the exchange directly. The existing `buildOrderPlan` and `useExchangeOrder` handle execution. This keeps the engine pure and testable.

#### 4.4.3 Store Layer (New)

**Location:** `src/stores/`

```
src/stores/use-rebalance-store.ts
  - Target allocations per portfolio
  - Active trigger configuration
  - Rebalance history log
  - Cooldown state

src/stores/use-position-manager-store.ts
  - Per-position exit plans
  - Trailing stop configurations and water marks
  - Risk limit settings
  - Scale-in/out rules
```

Both stores use Zustand with `persist` middleware (following the existing `createValidatedStorage` pattern) so configurations survive page refreshes.

#### 4.4.4 UI Layer (New)

**Location:** `src/components/trade/rebalance/` and `src/components/trade/position-manager/`

**Portfolio Allocation Panel:**
- Donut chart or bar showing current vs. target allocation
- Drift indicators per position
- "Rebalance Now" button that previews the execution plan
- Trigger status indicators (next time-based rebalance, current drift level)

**Position Manager per Position:**
- Inline exit plan editor in position row (expand to show levels)
- Trailing stop toggle with configuration popover
- Risk limit badges (green/yellow/red based on proximity to limits)
- Scale-in/out rule editor

**Portfolio Risk Dashboard:**
- Aggregate liquidation risk meter
- Correlation matrix heatmap (top positions)
- Exposure breakdown (long/short/net)
- Funding rate P&L tracker

#### 4.4.5 Execution Safety

All automated actions must go through safety checks:

1. **Preview before execute**: Every rebalance shows a preview of orders before submission
2. **Rate limiting**: Maximum N orders per minute to avoid hitting API limits
3. **Slippage protection**: Market orders use the existing `slippageBps` from global settings
4. **Size validation**: All sizes formatted through `formatSizeForOrder` with proper `szDecimals`
5. **Price validation**: All prices through `formatPriceForOrder` with Hyperliquid's 5-sig-fig rule
6. **Confirmation for large changes**: Require explicit confirmation for rebalances that would close >50% of any position
7. **Kill switch**: Global toggle to disable all automation instantly
8. **Audit log**: Every automated action logged with timestamp, trigger reason, and order details

---

## 5. Implementation Priority

### Phase 1: Position Manager Essentials (Weeks 1-3)

**Why first:** Immediate value for every trader with open positions. No portfolio-level complexity.

1. **Scaled profit-taking** -- Multi-level TP/SL per position
   - Exit plan configuration UI in position row
   - Level monitoring against mark prices
   - Partial close execution via existing order system
   - Persisted in Zustand store

2. **Trailing stop-loss** -- Client-side trailing mechanism
   - High/low water mark tracking per position
   - Configurable trail distance (%, $)
   - Activation price option
   - Visual indicator on position row

3. **Batch position actions** -- Portfolio-wide quick actions
   - "Close all positions" (market)
   - "Reduce all by X%" (proportional reduction)
   - "Flatten to delta-neutral" (close net long/short exposure)

### Phase 2: Portfolio Allocation (Weeks 4-6)

**Why second:** Builds on Phase 1 infrastructure. Addresses the core rebalancing need.

4. **Target allocation editor** -- Define desired portfolio weights
   - Asset picker with percentage allocation
   - Current vs. target comparison view
   - Drift calculation and display

5. **Threshold-based rebalancing** -- The simplest rebalancing trigger
   - Configurable drift threshold
   - Execution plan preview (shows what orders would be placed)
   - One-click rebalance execution
   - Cooldown period enforcement

6. **Portfolio risk overview** -- Consolidated risk view
   - Total notional exposure (long/short/net)
   - Margin utilization percentage
   - Aggregate unrealized PnL
   - Per-position liquidation distance ranking

### Phase 3: Advanced Automation (Weeks 7-10)

**Why third:** Requires stable Phase 1-2 foundation. Targets power users.

7. **Time-based rebalancing** -- Scheduled rebalancing aligned with funding
   - Interval configuration
   - Funding-aligned timing option
   - Skip-if-below-threshold option

8. **Risk limits engine** -- Automated risk management
   - Per-position and portfolio-level limits
   - Warning -> Action escalation
   - Drawdown circuit breaker

9. **Funding rate dashboard** -- Funding optimization
   - Real-time funding rates across all positions
   - Cumulative funding P&L per position
   - Funding rate comparison across assets
   - Rotation suggestions (which positions to swap for better funding)

### Phase 4: Power Features (Weeks 11+)

10. **Signal-based rebalancing** -- External trigger integration
    - Webhook endpoint for TradingView signals
    - Volatility-targeting trigger
    - Correlation-based position sizing

11. **Position scaling rules** -- Automated DCA and scale-out
    - DCA-on-drawdown configuration
    - Volatility-adjusted position sizing
    - Time-based gradual close (exit TWAP)

12. **Strategy templates** -- Prebuilt configurations
    - "Conservative long-only" (wide trailing stops, strict risk limits)
    - "Delta-neutral carry" (spot long + perp short, funding optimization)
    - "Momentum rotation" (allocate to highest-momentum assets, rebalance weekly)
    - "Risk parity" (equal risk contribution per position, volatility-weighted)

---

## 6. Competitive Advantage

### 6.1 Perp-Native Design

Every existing rebalancing tool was designed for spot portfolios and retrofitted for derivatives. HypeTerminal's engine would be built from the ground up for perpetual futures, understanding:
- Leverage amplifies notional exposure beyond collateral
- Funding rates are a continuous cost/revenue stream that affects optimal holding periods
- Cross-margin creates interdependencies between positions
- Liquidation risk is the primary constraint, not just allocation drift
- Short positions are first-class citizens (not just hedges)

### 6.2 Zero Custody Risk

Unlike 3Commas, Shrimpy, or Katoshi, HypeTerminal runs client-side. The rebalancing engine computes locally and executes through signed transactions. No API keys leave the user's browser. No custodial risk. No server-side state that can be compromised.

### 6.3 Real-Time WebSocket Foundation

HypeTerminal already maintains persistent WebSocket connections for positions, prices, and orders. The rebalancing engine piggybacks on this existing data flow with zero additional API calls. Competing tools poll REST endpoints, introducing latency and rate limit concerns.

### 6.4 Integrated Experience

Traders currently use Hyperliquid for execution, a spreadsheet for allocation tracking, a separate bot for trailing stops, and a Telegram alert for risk warnings. HypeTerminal can consolidate this into a single interface where the position table, rebalancing controls, risk dashboard, and execution engine coexist. Context switching is the enemy of good risk management.

### 6.5 SDK Leverage

The Hyperliquid SDK (via `@nktkas/hyperliquid`) already exposes the full exchange API surface needed:
- `placeOrder` / `batchModify` for rebalancing execution
- `scheduleCancel` for time-based order management
- `updateLeverage` / `updateIsolatedMargin` for leverage adjustment
- `cancel` / `cancelByCloid` for cleaning up stale orders
- TWAP orders for large rebalancing trades that need execution smoothing
- Vault and sub-account support for strategy isolation

No additional infrastructure or API access is needed. The entire engine can be built on top of what HypeTerminal already uses.

### 6.6 Differentiation from AI Agents

The current trend in crypto trading tools is toward "AI agents" that make opaque decisions. The proposed engine takes the opposite approach: transparent, rule-based automation where the user defines exact parameters and can preview every action before execution. This appeals to serious traders who want automation of their own strategy, not delegation to a black box.

---

## Appendix A: HypeTerminal Codebase Reference

### Existing Infrastructure to Build On

| Component | Location | Relevance |
|---|---|---|
| Position data model | `src/lib/hyperliquid/account/use-user-positions.ts` | `Position` interface with szi, entryPx, positionValue, unrealizedPnl, liquidationPx, leverage, cumFunding |
| Order intent system | `src/domain/trade/order-intent.ts` | `EntryOrderIntent`, `MarketCloseIntent`, `LimitCloseIntent`, `ReverseIntent`, `PositionTpSlIntent` |
| Order building | `src/domain/trade/orders.ts` | `buildOrders()`, scale order distribution, TP/SL order construction |
| TP/SL math | `src/lib/trade/tpsl.ts` | Price calculation, validation, estimated PnL, risk-reward ratio |
| Exchange execution | `src/lib/hyperliquid/hooks/exchange/useExchangeOrder.ts` | Mutation hook for placing orders |
| Batch modification | `src/lib/hyperliquid/hooks/exchange/useExchangeBatchModify.ts` | Atomic multi-order modification |
| Schedule cancel | `src/lib/hyperliquid/hooks/exchange/useExchangeScheduleCancel.ts` | Time-based order cancellation |
| Leverage update | `src/lib/hyperliquid/hooks/exchange/useExchangeUpdateLeverage.ts` | Per-asset leverage adjustment |
| TWAP orders | `src/lib/hyperliquid/hooks/exchange/useExchangeTwapOrder.ts` | Large order execution smoothing |
| Market capabilities | `src/lib/hyperliquid/capabilities.ts` | Leverage limits, margin modes, TP/SL support per market type |
| Real-time prices | `useSubAllMids` subscription | All mid prices via WebSocket |
| Open orders | `useSubOpenOrders` subscription | Existing TP/SL orders for conflict detection |
| Position UI | `src/components/trade/positions/positions-tab.tsx` | Current position table with close/reverse/TP-SL actions |
| Balance data | `src/domain/trade/balances.ts` | Available margin, spot balances, total USD value |
| Order entry store | `src/stores/use-order-entry-store.ts` | Zustand + persist pattern for form state |
| Validated storage | `src/stores/validated-storage.ts` | Zod-validated localStorage with migration support |

### Key Patterns to Follow

- **Domain logic in `src/domain/`**: Pure functions that produce order intents, never touch the DOM or network
- **Stores in `src/stores/`**: Zustand with persist middleware, Zod validation, per-key localStorage
- **Hooks in `src/lib/hyperliquid/hooks/`**: Exchange mutations and WebSocket subscriptions
- **Components never compute**: Move all math to domain functions, components only render
- **String-first data flow**: Keep Hyperliquid API strings through the pipeline, use big.js only for math
- **Existing order intent types**: Extend the `OrderIntent` union for new rebalancing actions rather than creating a parallel execution path
