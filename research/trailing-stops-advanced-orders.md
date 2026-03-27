# Advanced Order Panel — Research & Spec

## Table of Contents

1. [Current State](#1-current-state)
2. [Professional Trader Workflows](#2-professional-trader-workflows)
3. [Pain Points](#3-pain-points)
4. [Competitor Landscape](#4-competitor-landscape)
5. [API Capabilities & Constraints](#5-api-capabilities--constraints)
6. [Advanced Order Panel Spec](#6-advanced-order-panel-spec)
7. [Implementation Architecture](#7-implementation-architecture)
8. [Monetization](#8-monetization)

---

## 1. Current State

### HypeTerminal Order Types Today

| Type | Status | Implementation |
|------|--------|---------------|
| Market | Shipped | Limit order with `tif: "FrontendMarket"` |
| Limit (GTC/IOC/ALO) | Shipped | Standard limit with TIF selector |
| Stop Market | Shipped | Trigger order with `tpsl: "sl"`, `isMarket: true` |
| Stop Limit | Shipped | Trigger order with `tpsl: "sl"`, `isMarket: false` |
| Take Profit Market | Shipped | Trigger order with `tpsl: "tp"`, `isMarket: true` |
| Take Profit Limit | Shipped | Trigger order with `tpsl: "tp"`, `isMarket: false` |
| Position TP/SL | Shipped | Size `"0"`, grouping `"positionTpsl"` |
| TWAP | Shipped | Native protocol feature, 5-1440 min duration |
| Scale Orders | Shipped | Batched limit orders, 2-20 levels, uniform distribution |

### Current Architecture

- **Store**: `useOrderEntryStore` (Zustand + persist) — holds side, orderType, sizeMode, prices, TP/SL, scale params, TWAP params
- **Intent → Plan**: `OrderIntent` → `buildOrderPlan()` → `ExchangeOrder[]` with grouping strategy
- **Hooks**: `useExchangeOrder()` for standard/trigger/scale, `useExchangeTwapOrder()` for TWAP
- **SDK**: `@nktkas/hyperliquid` — `exchange.order()`, `exchange.twapOrder()`, `exchange.modify()`, `exchange.batchModify()`, `exchange.cancel()`, `exchange.scheduleCancel()`

---

## 2. Professional Trader Workflows

### Trailing Stop — How Pros Do It Today

Hyperliquid has **no native trailing stop**. This is the single most requested missing feature.

**Current workarounds:**

1. **Third-party bots (goodcryptoX)** — Connects via API keys, monitors price via WebSocket, continuously calls `modify()` to ratchet stop-loss as price moves favorably. Unreliable if connection drops.

2. **Custom Python/TS bots** — Traders write their own:
   - Subscribe to price feed
   - Track high-water mark (longs) / low-water mark (shorts)
   - `modify()` the trigger price on each favorable tick
   - `scheduleCancel` as dead man's switch if bot crashes

3. **Manual adjustment** — Dragging stop-loss on the chart. Error-prone, impossible during volatile moves, doesn't work while sleeping.

### Scale Orders — How Pros Customize

Professionals want scale orders that Hyperliquid's native 2-20 uniform levels can't provide:

- **Weighted distributions** — More size at key support/resistance levels, less in between. Geometric or custom curves.
- **Ping-pong / auto-refill** — When a level fills, re-place the order. Creates a grid-like market-making strategy.
- **Attached TP/SL per level** — Each fill gets its own exit targets.
- **50-100+ levels** — For large positions in liquid markets, 20 isn't enough.
- **Iceberg layering** — Show only a fraction of size at each level, refill on fill.

### Complex Executions

**Bracket orders** — Entry + multiple TP levels + SL, all linked. Today: can attach single TP + SL to market/limit entry via `normalTpsl` grouping. Cannot: bracket a trigger entry, set multiple TP levels, or use non-uniform TP sizing.

**Scaled exits** — Pros don't exit at one price. Common pattern: 25% at +2%, 25% at +5%, 50% at +10%, with a -3% stop on remaining. Today: must place 3 separate trigger orders manually and compute sizes.

**OCO (One-Cancels-Other)** — Range trading: buy limit at support + sell limit at resistance, cancel whichever doesn't fill. Not supported. TP/SL pairs auto-cancel via `normalTpsl` but arbitrary order pairs can't be linked.

**DCA** — Recurring buys on a schedule. Not native. Must run a timer + market order bot.

---

## 3. Pain Points

### Critical (Traders Leave the Platform)

| # | Pain Point | Impact | Who's Affected |
|---|-----------|--------|---------------|
| 1 | **No trailing stop** | Can't protect gains on runners. Forces manual babysitting or third-party bots. | Swing traders, momentum traders |
| 2 | **Single TP/SL level** | Can't scale out of positions. Must place individual trigger orders manually. | All position traders |
| 3 | **No OCO** | Can't set up range-bound strategies. | Range traders, market makers |

### High (Daily Friction)

| # | Pain Point | Impact | Who's Affected |
|---|-----------|--------|---------------|
| 4 | **Uniform scale distribution only** | Can't weight size toward key levels. Detectable by algos. | Whales, algo traders |
| 5 | **Max 20 scale levels** | Insufficient for large positions in liquid markets. | Large position traders |
| 6 | **No bracket with trigger entry** | Can't set "buy stop at X, TP at Y, SL at Z" for breakout plays. | Breakout traders |
| 7 | **TWAP has no price limit** | Keeps executing even if market moves against — TWAP at any price. | Institutional-style traders |
| 8 | **Scale orders clutter open orders** | 20 individual orders, no way to manage as a group. | Everyone using scale orders |

### Medium (Nice to Have)

| # | Pain Point | Impact | Who's Affected |
|---|-----------|--------|---------------|
| 9 | No iceberg orders | Full size visible on transparent order book = front-running. | Whales |
| 10 | No GTD (time expiry) | Must manually cancel stale orders. `scheduleCancel` cancels ALL orders, not specific ones. | Day traders |
| 11 | No DCA mode | Must run external bot for recurring buys. | Accumulators |
| 12 | No auto-refill on scale fills | One-shot scale orders, no ping-pong. | Grid traders |
| 13 | No conditional triggers beyond price | Can't trigger on PnL %, funding rate, or time. | Sophisticated traders |

---

## 4. Competitor Landscape

| Feature | Hyperliquid | Binance Futures | Bybit Perps | dYdX v4 |
|---------|:-----------:|:---------------:|:-----------:|:-------:|
| Trailing Stop | — | Native | Native | — |
| OCO | — | Native | Spot only | — |
| Bracket (Entry+TP+SL) | Partial | Full | Full | — |
| Iceberg | — | Native | Native | — |
| TWAP | Native | Native | Native | — |
| Scale Orders | Native | — | — | — |
| FOK | — | Yes | Yes | Yes |
| GTD | — | Yes | Yes | Yes |
| DCA Bot | — | Yes | Yes | — |
| Grid Bot | — | Yes | Yes | — |
| Dead Man's Switch | Native | — | — | — |
| Multi-level TP/SL | — | Yes | Yes | — |

**Hyperliquid's advantages:** Native scale orders, on-chain TWAP, dead man's switch, builder fees.

**Hyperliquid's gaps vs CEXes:** No trailing stop, no iceberg, no OCO, no GTD, no multi-TP/SL, no native grid/DCA.

**HypeTerminal opportunity:** Bridge the gap between Hyperliquid's API capabilities and CEX-level order management — entirely client-side.

---

## 5. API Capabilities & Constraints

### Exchange Methods

| Method | What It Does | Key for |
|--------|-------------|---------|
| `order()` | Place 1+ orders atomically | Bracket orders, scale orders |
| `cancel()` | Cancel by asset + oid | OCO cleanup |
| `cancelByCloid()` | Cancel by client order ID | Precise order tracking |
| `modify()` | Update single order | Trailing stop ratchet |
| `batchModify()` | Update multiple orders | Bulk trail/adjust |
| `twapOrder()` | Place TWAP | TWAP with controls |
| `twapCancel()` | Cancel TWAP | TWAP management |
| `scheduleCancel()` | Dead man's switch | Safety net for client-side logic |

### Constraints

- Prices: max 5 significant figures
- Sizes: per-asset `szDecimals`
- TWAP: 5-1440 minutes, 30s intervals, 3% max slippage per slice
- Scale: 2-20 levels (frontend limit, not protocol)
- `scheduleCancel`: minimum 5 seconds in future, cancels ALL open orders
- `modify()`: single order per call (use `batchModify()` for multiple)
- Builder fee: max 0.1% perps, 1% spot
- Client order IDs (`cloid`): 16-byte hex, useful for tracking order chains

### WebSocket Subscriptions

| Channel | Use For |
|---------|---------|
| `allMids` | Trailing stop price monitoring |
| `l2Book` | Iceberg refill decisions |
| `trades` | Real-time fill detection |
| `userEvents` | Fill notifications for OCO, bracket, DCA |
| `userTwapStates` | TWAP monitoring |

---

## 6. Advanced Order Panel Spec

### 6.1 Overview

A unified "Advanced" order builder that extends the existing trade panel. Users pick a strategy template, configure it visually, and submit. Complex logic (trailing, OCO linking, iceberg refill) runs client-side via a persistent order manager.

### 6.2 Order Type: Trailing Stop

**What:** A stop-loss that follows price by a fixed distance or percentage, locking in gains as price moves favorably. Never moves backward.

**Parameters:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| Trail Type | `amount` \| `percent` | `percent` | — |
| Trail Distance | number | — | > 0. If percent, 0.1-50%. If amount, > min tick. |
| Activation Price | number \| null | null (activate immediately) | If set, trailing begins only after price reaches this level. |
| Callback Rate (optional) | percent | — | How far price must reverse from peak to trigger. Alternative UX to trail distance. |
| Reduce Only | boolean | true | Always true for trailing stops on positions. |

**Behavior:**

1. User sets trail distance (e.g., 2%) and optionally an activation price.
2. On submit: place initial stop-market trigger order at `currentPrice - trailDistance` (for longs).
3. Subscribe to `allMids` for the asset.
4. On each tick where price makes new high (for longs):
   - `newStop = highWaterMark * (1 - trailPercent)`
   - If `newStop > currentStopTriggerPx`: call `modify()` to ratchet stop up.
5. When price reverses by trail distance from peak → stop triggers naturally on-chain.
6. Safety: refresh `scheduleCancel` every 60s as heartbeat. If client dies, all orders cancel within 120s.

**UI:**

```
┌─────────────────────────────────────┐
│  Trailing Stop                      │
├─────────────────────────────────────┤
│  Trail by:  [Amount ▾] [Percent ▾]  │
│  Distance:  [____2___] %            │
│                                     │
│  ☐ Activation Price  [__________]   │
│    (Start trailing only after       │
│     price reaches this level)       │
│                                     │
│  ─── Preview ───                    │
│  Current Price:    $2,450.00        │
│  Initial Stop:     $2,401.00        │
│  Trail Distance:   $49.00           │
│                                     │
│  [Place Trailing Stop]              │
└─────────────────────────────────────┘
```

**Edge cases:**

- Client disconnect: `scheduleCancel` fires, position protected by last-placed stop (stale but safe).
- Rapid price movement: batch price updates, throttle `modify()` to max 1 per second.
- Multiple trailing stops on same asset: track independently by `cloid`.
- Position size change: if position increases, user must update trail manually (or offer auto-resize option).

---

### 6.3 Order Type: Scaled TP/SL (Multi-Level Exit)

**What:** Place multiple take-profit and/or stop-loss levels with custom size allocation per level.

**Parameters:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| TP Levels | `Array<{price, percent}>` | [] | 1-10 levels. Prices ascending (longs) or descending (shorts). |
| SL Levels | `Array<{price, percent}>` | [] | 1-5 levels. Prices descending (longs) or ascending (shorts). |
| Size allocation per level | percent of position | Equal split | Must sum to 100% across all TP+SL levels. |
| Execution type per level | `market` \| `limit` | `market` | — |

**Behavior:**

1. User configures exit levels with size percentages.
2. On submit: place individual trigger orders for each level, sized as `positionSize * levelPercent`.
3. Use `normalTpsl` grouping where possible for TP+SL pairs at the same percentage allocation.
4. Display as a grouped "strategy" in the orders tab, not individual orders.

**UI:**

```
┌──────────────────────────────────────────────────┐
│  Scaled Exit                                     │
├──────────────────────────────────────────────────┤
│  Take Profit Levels:                             │
│  TP1: [_$2,500_]  [_25_%]  est. +$125     [×]   │
│  TP2: [_$2,600_]  [_25_%]  est. +$375     [×]   │
│  TP3: [_$2,800_]  [_50_%]  est. +$875     [×]   │
│  [+ Add TP Level]                                │
│                                                  │
│  Stop Loss:                                      │
│  SL1: [_$2,300_]  [100%]  est. -$375      [×]   │
│  [+ Add SL Level]                                │
│                                                  │
│  ─── Summary ───                                 │
│  Avg TP: $2,675 (+9.2%)  |  SL: $2,300 (-6.1%)  │
│  Risk/Reward: 1:1.5                              │
│  TP allocation: 100%  ✓                          │
│                                                  │
│  [Place Scaled Exit]                             │
└──────────────────────────────────────────────────┘
```

**Presets:**

- Conservative: 50% at +3%, 50% at +5%, SL at -2%
- Aggressive: 25% at +5%, 25% at +10%, 50% at +20%, SL at -5%
- Scalp: 100% TP at +1%, SL at -0.5%

---

### 6.4 Order Type: Enhanced Scale Orders

**What:** Improved scale order builder with non-uniform distributions, more levels, and optional auto-refill.

**Enhancements over current:**

| Feature | Current | Enhanced |
|---------|---------|----------|
| Distribution | Uniform only | Uniform, Linear weighted, Geometric, Custom |
| Max levels | 20 | 50 (batched into multiple `order()` calls if needed) |
| Size weighting | Equal | Per-level or curve-based |
| Auto-refill | No | Optional ping-pong mode |
| Attached TP/SL | No | Per-fill TP/SL targets |
| Visual preview | No | Price ladder visualization |

**Distribution curves:**

- **Uniform** — Equal size at each level (current behavior)
- **Linear ascending** — More size at higher prices (heavier at worse fills, DCA-style)
- **Linear descending** — More size at lower prices (heavier at better fills)
- **Geometric** — Exponential weighting toward one end
- **Custom** — Drag individual level sizes

**Parameters:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| Start Price | string | — | Must be valid price |
| End Price | string | — | Must be valid price, ≠ start |
| Levels | number | 10 | 2-50 |
| Distribution | `uniform` \| `linear-asc` \| `linear-desc` \| `geometric` | `uniform` | — |
| Total Size | string | — | > 0, respects szDecimals |
| TIF | `Gtc` \| `Alo` | `Gtc` | No IOC for scale |
| Auto-Refill | boolean | false | — |
| Per-Fill TP | string \| null | null | Price target for each fill |
| Per-Fill SL | string \| null | null | Stop price for each fill |

**UI:**

```
┌──────────────────────────────────────────────────┐
│  Scale Order Builder                             │
├──────────────────────────────────────────────────┤
│  Range: [$2,300] → [$2,500]  Levels: [10]       │
│  Size: [5.0 ETH]  TIF: [GTC ▾]                  │
│  Distribution: [Uniform ▾]                       │
│                                                  │
│  ┌─── Price Ladder ──────────────────────┐       │
│  │ $2,500 ████░░░░░░ 0.35 ETH           │       │
│  │ $2,478 ██████░░░░ 0.42 ETH           │       │
│  │ $2,456 ████████░░ 0.50 ETH           │       │
│  │ $2,433 ██████████ 0.58 ETH           │       │
│  │ ...                                   │       │
│  │ $2,300 ██████████████ 0.78 ETH       │       │
│  └───────────────────────────────────────┘       │
│                                                  │
│  ☐ Auto-refill (ping-pong)                       │
│  ☐ Attach TP/SL per fill                         │
│     TP: [+__2__%]  SL: [-__1__%]                │
│                                                  │
│  [Place 10 Orders]                               │
└──────────────────────────────────────────────────┘
```

**Auto-refill behavior:**

1. Monitor fills via `userEvents` WebSocket.
2. When a level fills, wait configurable delay (0-60s), then re-place the same order.
3. If per-fill TP/SL is set, also place corresponding trigger orders for the filled size.
4. Continue until user cancels or total fill count reaches a limit.

---

### 6.5 Order Type: Bracket Order (Full)

**What:** Entry order (any type) + multiple TP levels + SL, all linked. If entry cancels, exits cancel. If position closes via SL, TPs cancel.

**Parameters:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| Entry Type | `market` \| `limit` \| `stopMarket` \| `stopLimit` | `limit` | — |
| Entry Price | string | — | Per entry type rules |
| Entry Trigger | string \| null | null | For stop entry types |
| Size | string | — | > 0 |
| TP Levels | `Array<{price, sizePercent}>` | [] | 0-10 levels, percents sum ≤ 100% |
| SL Price | string \| null | null | — |
| SL Type | `market` \| `limit` | `market` | — |
| Trailing SL | boolean | false | If true, uses trailing stop logic for SL |

**Behavior for trigger entry (not natively supported):**

1. Place the trigger entry order.
2. Monitor `userEvents` for fill.
3. On fill: atomically place all TP + SL orders via single `order()` call with appropriate grouping.
4. If entry order is cancelled before fill: clean up, no exits placed.
5. On partial fill: place proportionally-sized exits, update on subsequent fills.

**UI:**

```
┌──────────────────────────────────────────────────┐
│  Bracket Order                                   │
├──────────────────────────────────────────────────┤
│  Entry: [Stop Limit ▾]                           │
│  Trigger: [_$2,500_]  Limit: [_$2,505_]         │
│  Size:    [_2.0 ETH_]                            │
│                                                  │
│  ─── Exits ───                                   │
│  TP1: [_$2,600_]  [_50_%]                        │
│  TP2: [_$2,700_]  [_50_%]                        │
│  [+ Add TP Level]                                │
│                                                  │
│  SL:  [_$2,400_]  [100%]  ☐ Trailing (2%)       │
│                                                  │
│  ─── Bracket Visual ───                          │
│  TP2  $2,700 ─── +8.0%  ($400)                   │
│  TP1  $2,600 ─── +4.0%  ($200)                   │
│  ENT  $2,500 ─── entry                           │
│  SL   $2,400 ─── -4.0%  (-$200)                  │
│                                                  │
│  R:R  1:1.5  |  Exp. Value: +$100                │
│                                                  │
│  [Place Bracket Order]                           │
└──────────────────────────────────────────────────┘
```

---

### 6.6 Order Type: OCO (One-Cancels-Other)

**What:** Two orders linked such that when one fills or triggers, the other is automatically cancelled.

**Parameters:**

| Param | Type | Validation |
|-------|------|------------|
| Order A | Any order type | Valid standalone order |
| Order B | Any order type | Valid standalone order, different from A |
| Cancel behavior | `on_fill` \| `on_trigger` | Default: `on_fill` |

**Behavior:**

1. Place both orders via `order()`.
2. Monitor `userEvents` for fills on either order.
3. When one fills: immediately `cancel()` the other.
4. Race condition mitigation: if both fill in the same block, accept both (user informed).

**UI:**

```
┌──────────────────────────────────────────────────┐
│  OCO (One-Cancels-Other)                         │
├──────────────────────────────────────────────────┤
│  Order A:                                        │
│  [Buy Limit ▾]  Price: [_$2,300_]  Size: [1 ETH]│
│                                                  │
│  ─── cancels ───                                 │
│                                                  │
│  Order B:                                        │
│  [Sell Limit ▾] Price: [_$2,600_]  Size: [1 ETH]│
│                                                  │
│  [Place OCO]                                     │
└──────────────────────────────────────────────────┘
```

---

### 6.7 Order Type: Iceberg

**What:** Large order split into small visible chunks. When a chunk fills, the next is placed automatically.

**Parameters:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| Total Size | string | — | > 0 |
| Visible Size | string | — | > 0, < totalSize |
| Price | string | — | Valid limit price |
| TIF | `Gtc` \| `Alo` | `Alo` | Post-only preferred to avoid paying taker fees |
| Price Variance | string | `"0"` | Random offset ± this amount per chunk to avoid detection |

**Behavior:**

1. Place limit order for `visibleSize`.
2. Monitor fills via `userEvents`.
3. On full fill of chunk: place next chunk (`min(visibleSize, remainingSize)`).
4. If price variance is set, offset each chunk's price randomly within range.
5. Continue until `totalSize` is completely filled or user cancels.

**UI:**

```
┌──────────────────────────────────────────────────┐
│  Iceberg Order                                   │
├──────────────────────────────────────────────────┤
│  Total Size: [_50.0 ETH_]                        │
│  Show Size:  [__2.0 ETH_]  (visible per chunk)   │
│  Price:      [_$2,450.00_]                        │
│  ☐ Price variance: ± [_$0.50_]                   │
│                                                  │
│  Progress: [░░░░░░░░░░░░░░░░░░░░] 0/25 chunks   │
│  Filled: 0.0 / 50.0 ETH                          │
│                                                  │
│  [Start Iceberg]                                 │
└──────────────────────────────────────────────────┘
```

---

### 6.8 Order Type: DCA (Dollar-Cost Average)

**What:** Place recurring market orders on a fixed schedule.

**Parameters:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| Amount per order | string | — | > 0, in USD or asset units |
| Interval | minutes | 60 | 1-10080 (1 week) |
| Total budget | string \| null | null | Optional cap. Null = infinite. |
| Max orders | number \| null | null | Optional limit. |
| Price limit | string \| null | null | Don't buy above / sell below this price. |
| Slippage tolerance | percent | 1% | Max slippage per order. |

**UI:**

```
┌──────────────────────────────────────────────────┐
│  DCA (Dollar-Cost Average)                       │
├──────────────────────────────────────────────────┤
│  Buy [_$100_] of ETH every [_60_] minutes        │
│                                                  │
│  ☐ Total budget: [_$5,000_]                      │
│  ☐ Max price: [_$3,000_] (skip if above)         │
│  Slippage: [_1_%]                                │
│                                                  │
│  Est. orders: 50  |  Duration: ~2.1 days          │
│                                                  │
│  [Start DCA]                                     │
└──────────────────────────────────────────────────┘
```

---

## 7. Implementation Architecture

### 7.1 Client-Side Order Manager

All advanced order types that require monitoring (trailing stop, iceberg, OCO, DCA, auto-refill scale) need a persistent process. This is **not** a React component — it's a background service.

```
┌─────────────────────────────────────────────┐
│              OrderManager                    │
│  (Singleton, runs outside React tree)        │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Trailing  │  │ Iceberg  │  │   OCO    │  │
│  │ Strategy  │  │ Strategy │  │ Strategy │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│  ┌──────────┐  ┌──────────┐                 │
│  │   DCA    │  │  Refill  │                 │
│  │ Strategy │  │ Strategy │                 │
│  └──────────┘  └──────────┘                 │
│                                             │
│  Shared:                                    │
│  - WebSocket price feed (allMids)           │
│  - WebSocket user events (fills, cancels)   │
│  - Exchange client (order/modify/cancel)    │
│  - scheduleCancel heartbeat (every 60s)     │
│  - State persistence (IndexedDB)            │
│  - Reconnection & recovery logic            │
├─────────────────────────────────────────────┤
│  Zustand Store (activeStrategies)            │
│  - Strategy type, params, state, oids       │
│  - Exposed to React for UI display          │
└─────────────────────────────────────────────┘
```

### 7.2 Key Files to Create

```
src/
├── domain/trade/
│   ├── strategies/
│   │   ├── order-manager.ts          # Singleton strategy orchestrator
│   │   ├── trailing-stop.ts          # Trailing stop strategy
│   │   ├── iceberg.ts                # Iceberg strategy
│   │   ├── oco.ts                    # OCO strategy
│   │   ├── dca.ts                    # DCA strategy
│   │   └── scale-refill.ts           # Auto-refill for scale orders
│   ├── distributions.ts              # Scale order distribution curves
│   └── bracket.ts                    # Bracket order builder
├── stores/
│   └── use-strategy-store.ts         # Active strategies state
├── components/trade/
│   └── advanced/
│       ├── trailing-stop-form.tsx
│       ├── scaled-exit-form.tsx
│       ├── scale-builder.tsx
│       ├── bracket-form.tsx
│       ├── oco-form.tsx
│       ├── iceberg-form.tsx
│       ├── dca-form.tsx
│       ├── strategy-monitor.tsx      # Active strategies panel
│       └── distribution-preview.tsx  # Visual distribution chart
```

### 7.3 State Persistence & Recovery

Active strategies must survive page refresh:

1. **IndexedDB** for strategy state (type, params, order IDs, high-water marks).
2. On page load: read persisted strategies → reconnect WebSockets → resume monitoring.
3. `scheduleCancel` heartbeat ensures safety if recovery fails.
4. Strategy state transitions: `pending` → `active` → `completed` | `cancelled` | `failed`.

### 7.4 Safety Mechanisms

| Risk | Mitigation |
|------|-----------|
| Client crash | `scheduleCancel` heartbeat every 60s with 120s timeout. Last-placed stop order remains on-chain. |
| WebSocket disconnect | Exponential backoff reconnect. On reconnect, fetch current positions/orders and reconcile. |
| Race conditions (modify vs trigger) | Accept that on-chain trigger may fire before modify lands. Design strategies to be safe in this case. |
| Multiple tabs | Single-leader election via BroadcastChannel. Only one tab runs strategies. |
| Order modify failure | Retry once. If still fails, log error and keep existing stop (safe degradation). |

### 7.5 Priority / Phasing

| Phase | Features | Complexity | Impact |
|-------|----------|-----------|--------|
| **Phase 1** | Trailing Stop, Scaled TP/SL, Enhanced Scale Orders | Medium | Highest — covers top 3 pain points |
| **Phase 2** | Full Bracket Orders, OCO | Medium | High — breakout and range traders |
| **Phase 3** | Iceberg, DCA, Auto-refill Scale | High | Medium — power user features |

---

## 8. Monetization

Hyperliquid's builder fee system enables HypeTerminal to charge fees on advanced orders:

- **Builder fee**: Up to 0.01% (1 bps) on perps, passed via `builder` param in `order()`.
- **Where to apply**: Only on advanced strategy orders (trailing, iceberg, DCA, enhanced scale), not basic market/limit.
- **Justification**: Users are getting CEX-level execution tooling on a DEX — clear value-add.
- **Revenue example**: $10M daily volume through advanced orders × 1 bps = $1,000/day.

---

## Sources

- Hyperliquid Order Types Documentation — https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types
- Hyperliquid TP/SL Documentation — https://hyperliquid.gitbook.io/hyperliquid-docs/trading/take-profit-and-stop-loss-orders-tp-sl
- Hyperliquid Exchange API — https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
- goodcryptoX Trailing Stop for Hyperliquid — https://goodcrypto.app/hyperliquid-trailing-stop-order/
- Binance Futures Order Types — https://www.binance.com/en/support/faq/types-of-order-on-binance-futures-360033779452
- Bybit Trailing Stop — https://www.bybit.com/en/help-center/article/Trailing-Stop-Order-Perpetual-and-Futures-Trading
- dYdX v4 Order Types — https://help.dydx.trade/en/articles/166981-perpetual-order-types-on-dydx-chain
- InSilico Terminal Scale Orders — https://docs.insilicoterminal.com/documentation/terminal-cli/scale-orders
