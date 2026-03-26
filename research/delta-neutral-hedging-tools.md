# Delta Neutral Builder + Auto-Hedger — Feature Spec

## 1. Problem Statement

Delta-neutral strategies (spot+perp basis trades, funding rate arbitrage, cross-exchange hedging) are among the most profitable low-risk strategies on Hyperliquid, yielding 5–25% APR. Yet executing them manually is painful:

- **No atomic two-leg execution** — entering spot long + perp short requires two separate orders with slippage and timing risk between legs
- **No unified P&L view** — spot and perp positions shown in separate panels; traders use spreadsheets to track basis trade performance
- **Manual rebalancing** — delta drifts as prices move; traders must manually resize one leg to stay neutral, often checking hourly
- **Capital fragmentation** — without portfolio margin, funds split between spot and perp accounts reduces capital efficiency
- **No funding rate intelligence** — no alerts when funding flips negative, no historical yield projections, no cross-exchange rate comparison
- **Dangerous unwind** — closing both legs simultaneously under volatility risks partial fills on one side, leaving naked exposure
- **Cross-exchange blind spots** — traders hedging across Hyperliquid + Binance/Bybit track P&L in spreadsheets with no aggregated view

### Who This Is For

1. **Funding farmers** — capture positive funding on perp shorts while holding spot (5–25% APR on majors, 50%+ on alts during euphoria)
2. **Basis traders** — exploit spot-perp price divergence for mean-reversion profit
3. **Cross-exchange arbers** — capture funding differentials between Hyperliquid (hourly) and CEXs (8-hour)
4. **Market makers** — maintain delta-neutral books while providing liquidity

---

## 2. Market Context

### Hyperliquid Funding Mechanics

- **Frequency**: Hourly payments (vs 8-hour on most CEXs) — 8× more compounding events
- **Formula**: `F = Avg Premium Index + clamp(interest_rate - premium, -0.0005, 0.0005)`
- **Interest rate baseline**: 11.6% APR to shorts (0.01% per 8-hour period, ~0.00125%/hr)
- **Premium sampling**: every 5 seconds, averaged over the hour
- **Payment basis**: oracle price (not mark price)
- **Cap**: 4% per hour (extreme only)
- **Implication**: hourly payments let strategies compound faster and react quicker to rate changes

### Observed Yields (Historical)

| Strategy | Tokens | Approx APR | Risk Level |
|----------|--------|------------|------------|
| Spot+perp basis (majors) | BTC, ETH | 5–15% | Low |
| Spot+perp basis (mid-caps) | SOL, AVAX, HYPE | 15–25% | Medium |
| Spot+perp basis (memes) | ASTER, ANIME | 50–450% | Very High |
| Cross-exchange (HL vs Binance) | BTC, ETH | 5–11% | Low–Medium |
| Cross-exchange (HL vs BitMEX) | SOL, AVAX | ~15% | Medium |

### Existing Solutions & Their Gaps

| Tool | Type | What It Does | What It Lacks |
|------|------|-------------|---------------|
| Liminal | Vault protocol | Automated basis (~15% APY) | No user control, no cross-exchange, capacity-limited |
| Neutral Trade | Vault protocol | Curated basis (~21% APY) | Invite-gated, opaque strategy, no customization |
| Harmonix | Vault protocol | HYPE basis (~19% APY) | Single-token, no user parameter control |
| HL-Delta | Python bot | Open-source basis bot | CLI-only, no UI, educational quality, known bugs |
| Hummingbot | Framework | Configurable trading bot | Steep learning curve, fragile HL connector |
| Loris Tools | Scanner | 25+ exchange funding rates | View-only, no execution, no HL-specific features |

**The gap**: No tool offers one-click basis entry/exit, combined P&L tracking, customizable auto-rebalancing, and cross-exchange management in a single UI.

---

## 3. Feature: Delta Neutral Builder

### 3.1 Strategy Configurator

A panel where users define a delta-neutral position before execution.

**Inputs:**

- **Market selector** — pick any spot+perp pair available on Hyperliquid (only tokens with both spot and perp markets)
- **Direction** — `Long Spot / Short Perp` (standard funding capture) or `Short Spot / Long Perp` (inverse, for negative funding periods)
- **Total capital allocation** — USDC amount to deploy
- **Capital split** — slider for spot vs perp allocation (default 70/30 for cross-margin, auto-calculated for portfolio margin users)
- **Leverage on perp leg** — 1×–5× (default 1×, with liquidation price preview)
- **Entry mode**:
  - `Market` — immediate execution on both legs
  - `Limit` — set limit prices for both legs, wait for fill
  - `TWAP` — split into N sub-orders over T minutes to reduce impact
  - `Triggered` — enter when funding rate exceeds threshold

**Computed Preview (shown before execution):**

- Estimated hourly / daily / annual funding income (based on current rate + 7d average)
- Break-even time (funding income vs entry fees + estimated slippage)
- Liquidation price on perp leg (accounting for spot collateral if portfolio margin)
- Max delta drift before auto-rebalance triggers
- Fee breakdown: spot fee + perp fee + estimated slippage

### 3.2 Atomic Execution Engine

Solves the #1 pain point: entering both legs as close to simultaneously as possible.

**Execution Flow:**

1. User confirms strategy parameters
2. System validates: sufficient balance, market exists, margin requirements met
3. **Simultaneous order submission** — both legs sent in the same API batch (Hyperliquid supports batch orders)
4. **Fill monitoring** — track fill status of both legs in real-time
5. **Leg risk protection**:
   - If one leg fills and the other doesn't within T seconds (configurable, default 10s): auto-cancel unfilled leg and close filled leg at market
   - If partial fill on one leg: adjust the other leg's size to match
   - Show warning if spread between legs exceeds configured slippage tolerance
6. **Confirmation** — display entry prices, effective spread, and initial delta

**For TWAP entries:**

- Split total size into equal chunks
- Execute chunk pairs (spot + perp) at configured interval
- Each chunk follows the same leg-risk protection
- Show progress: chunks completed, VWAP so far, remaining

### 3.3 Position Dashboard

Unified view of all active delta-neutral positions.

**Per Position:**

- Token, direction, entry date
- Spot leg: size, entry price, current price, unrealized P&L
- Perp leg: size, entry price, mark price, unrealized P&L, funding earned
- **Combined P&L**: spot P&L + perp P&L + cumulative funding — fees
- **Current delta**: net exposure in USD (should be ~0)
- **Delta drift %**: how far from perfectly neutral
- **Annualized yield**: (cumulative funding / capital deployed) × (365 / days active)
- **Funding rate**: current hourly rate, 24h average, 7d average
- **Health**: liquidation distance on perp leg, margin ratio

**Aggregate View:**

- Total capital deployed across all positions
- Total daily/weekly funding income
- Portfolio-level delta exposure
- Weighted average yield

### 3.4 Auto-Rebalancer

Keeps positions delta-neutral without manual intervention.

**Triggers (user-configurable):**

- **Delta drift threshold** — rebalance when absolute delta exceeds X% of position size (default 2%)
- **Time-based** — rebalance every N hours regardless of drift (default: off)
- **Price-based** — rebalance when underlying price moves more than X% from last rebalance

**Rebalance Logic:**

1. Calculate current delta: `spot_size × spot_price - perp_size × mark_price`
2. Determine which leg to adjust (prefer adjusting the smaller leg to minimize fees)
3. Submit adjustment order
4. Log rebalance event: timestamp, delta before/after, cost

**Controls:**

- Enable/disable per position
- Max rebalance frequency (minimum interval between rebalances)
- Max single rebalance cost (skip if fee exceeds threshold)
- Notification on each rebalance (optional)

### 3.5 Smart Unwind

Safely close both legs of a position.

**Unwind Modes:**

- **Market unwind** — close both legs at market simultaneously (same atomic logic as entry)
- **Limit unwind** — set target prices, execute when both sides can fill profitably
- **TWAP unwind** — gradual exit over configured duration
- **Triggered unwind** — auto-close when:
  - Funding rate turns negative (for long-spot/short-perp positions)
  - Funding rate drops below minimum APR threshold
  - Perp liquidation price within X% of current price
  - Cumulative P&L hits take-profit target
  - Cumulative P&L hits stop-loss floor

**Unwind Preview:**

- Estimated exit slippage
- Final P&L projection (including remaining funding if limit/TWAP)
- Fee breakdown

---

## 4. Feature: Funding Rate Intelligence

### 4.1 Funding Dashboard

Central panel for monitoring funding opportunities.

**Views:**

- **Rate table** — all Hyperliquid perp markets with: current rate, 24h avg, 7d avg, 30d avg, annualized yield, predicted next rate
- **Sortable** by any column; filterable by token category (majors, mid-caps, memes)
- **Rate history chart** — per-token funding rate over time (1d, 7d, 30d, 90d)
- **Cumulative yield chart** — what $1000 in a basis trade would have earned over time for selected token

### 4.2 Opportunity Scanner

Proactive alerts for basis trade opportunities.

**Signals:**

- Funding rate spikes above X% annualized (user-configured threshold)
- Funding rate sustained above threshold for N hours (filters noise)
- Funding rate reversal (positive → negative or vice versa) — unwind signal
- Spread between Hyperliquid and external exchange rates exceeds threshold

**Alert Channels:**

- In-app notification badge + toast
- Browser push notification (optional)
- Sound alert (optional)

### 4.3 Cross-Exchange Rate Comparison

For traders running cross-exchange strategies.

**Data:**

- Side-by-side funding rates: Hyperliquid vs Binance, Bybit, OKX, dYdX, BitMEX
- Normalize to common period (hourly) since exchanges use different intervals
- Highlight exploitable spreads (HL rate vs external rate divergence)
- Historical spread chart

**Note:** execution on external exchanges is out of scope for v1 — this is intelligence/monitoring only. Cross-exchange execution requires API key management for external exchanges (v2 consideration).

---

## 5. Feature: Auto-Hedger

### 5.1 Concept

The Auto-Hedger automatically opens a perp hedge when the user takes a spot position (or vice versa), turning any directional trade into a delta-neutral position.

### 5.2 Hedge Rules

User defines rules that trigger automatic hedging.

**Rule Structure:**

```
WHEN [trigger]
HEDGE WITH [instrument] at [size ratio] using [order type]
UNTIL [exit condition]
```

**Example Rules:**

- "When I buy any spot token worth >$500, short the same token on perp at 1:1 ratio using market order"
- "When I open a perp long >$1000, buy equivalent spot using TWAP over 5 minutes"
- "When HYPE spot position exceeds $5000, maintain a 0.8× short perp hedge"

**Rule Parameters:**

- **Trigger**: spot buy, spot sell, perp open, manual toggle, or threshold-based
- **Instrument**: matching perp (for spot trigger) or matching spot (for perp trigger)
- **Size ratio**: 1.0× (full hedge), 0.5× (partial), custom
- **Order type**: market, limit (offset from mid), TWAP
- **Max slippage**: cancel hedge if spread too wide
- **Exit**: when original position closes, when funding flips, manual, or time-based

### 5.3 Hedge Monitor

- Active hedges table: original position, hedge position, net delta, hedge ratio, funding earned
- Hedge health: is the hedge still achieving target ratio? Alert on drift
- One-click: adjust ratio, pause hedging, unwind hedge + original

---

## 6. Technical Design

### 6.1 Architecture

```
┌─────────────────────────────────────────────────┐
│                   UI Layer                       │
│  StrategyConfigurator | PositionDashboard |      │
│  FundingDashboard | HedgeRuleEditor              │
└──────────────┬──────────────────────────┬────────┘
               │                          │
┌──────────────▼──────────────┐ ┌─────────▼────────┐
│     Strategy Engine         │ │  Funding Engine   │
│  - Execution orchestration  │ │  - Rate polling   │
│  - Rebalance scheduler      │ │  - Yield calc     │
│  - Unwind logic             │ │  - Alert engine   │
│  - Hedge rule evaluator     │ │  - Cross-exchange  │
└──────────────┬──────────────┘ └─────────┬────────┘
               │                          │
┌──────────────▼──────────────────────────▼────────┐
│              Hyperliquid SDK Layer                │
│  - Batch order submission                        │
│  - WebSocket position/fill tracking              │
│  - Funding rate subscriptions                    │
│  - Account state (margin, balances)              │
└──────────────────────────────────────────────────┘
```

### 6.2 Data Flow

**Position State:**

```typescript
interface BasisPosition {
  id: string
  token: string
  direction: "long-spot-short-perp" | "short-spot-long-perp"
  spotLeg: {
    size: string        // token amount
    entryPrice: string  // USDC per token
    currentPrice: string
  }
  perpLeg: {
    size: string        // token amount (should ≈ spotLeg.size)
    entryPrice: string
    markPrice: string
    leverage: string
  }
  funding: {
    cumulative: string  // total funding earned in USDC
    hourlyRate: string  // current rate
    lastPayment: string
  }
  config: {
    rebalanceThreshold: string  // delta drift % trigger
    rebalanceEnabled: boolean
    autoUnwind: UnwindTrigger[]
  }
  createdAt: number
}
```

**Funding Rate State:**

```typescript
interface FundingSnapshot {
  token: string
  currentRate: string       // hourly rate as decimal string
  avg24h: string
  avg7d: string
  avg30d: string
  annualizedYield: string   // based on 7d avg
  nextPredicted: string     // simple EMA prediction
  history: Array<{ timestamp: number; rate: string }>
}
```

### 6.3 Execution Safety

- **Batch orders**: use Hyperliquid's batch order API to submit both legs in a single request, minimizing timing gap
- **Fill reconciliation**: WebSocket fill stream validates both legs filled; if partial, adjustment logic runs within configurable timeout
- **Idempotency**: each strategy execution gets a unique ID; duplicate submissions rejected
- **Rate limiting**: respect Hyperliquid's 1200 requests/min limit; queue and throttle during high-activity periods
- **Error recovery**: if connection drops mid-execution, on reconnect: check position state, reconcile against expected state, alert user of any discrepancies

### 6.4 Storage

- **Position state**: Zustand store with `persist` middleware (localStorage) — survives page refresh
- **Hedge rules**: same store, serialized as JSON
- **Funding history**: IndexedDB for large time-series data (30d+ of hourly rates per token)
- **Execution log**: IndexedDB, append-only, for audit trail

### 6.5 Portfolio Margin Awareness

Portfolio margin dramatically changes basis trade economics:

- Spot holdings collateralize perp shorts — no separate margin needed
- Capital efficiency jumps from ~50% to ~90%+
- Wider safe liquidation range
- System should detect if user has portfolio margin enabled and adjust:
  - Capital split recommendations (can allocate more to spot)
  - Liquidation price calculations
  - Rebalance thresholds (can be looser)

---

## 7. UI Layout

### 7.1 Delta Neutral Builder Panel

Located as a dedicated route/tab in HypeTerminal.

```
┌─────────────────────────────────────────────────────────────┐
│  Delta Neutral Builder                          [?] [⚙]    │
├─────────────────────────┬───────────────────────────────────┤
│                         │                                   │
│  ── New Position ──     │  ── Active Positions ──           │
│                         │                                   │
│  Token:  [HYPE    ▼]   │  HYPE  Long Spot / Short Perp     │
│  Direction: [L/S ▼]    │  ├ Capital: $10,000                │
│  Capital: [$_______]    │  ├ Delta: +$12 (0.12%)            │
│  Split:   [===●===]    │  ├ Funding: +$45.20 (3d)          │
│  Leverage: [1× ▼]      │  ├ Combined P&L: +$38.60          │
│  Entry:   [Market ▼]   │  ├ APR: 18.2%                     │
│                         │  └ [Rebalance] [Unwind]           │
│  ── Preview ──          │                                   │
│  Est. APR: 18.2%        │  ETH  Long Spot / Short Perp      │
│  Break-even: 2.1 days   │  ├ Capital: $25,000               │
│  Liq. price: $45.20     │  ├ Delta: -$8 (0.03%)            │
│  Fees: $3.50            │  ├ Funding: +$124.80 (14d)       │
│                         │  ├ Combined P&L: +$112.30         │
│  [Execute Strategy]     │  ├ APR: 11.7%                     │
│                         │  └ [Rebalance] [Unwind]           │
│                         │                                   │
├─────────────────────────┴───────────────────────────────────┤
│  ── Funding Rates ──                                        │
│  Token    Current   24h Avg   7d Avg   Ann. Yield   Action  │
│  HYPE    +0.021%   +0.019%   +0.018%    18.2%      [Open]  │
│  BTC     +0.008%   +0.009%   +0.010%     8.8%      [Open]  │
│  ETH     +0.010%   +0.011%   +0.012%    11.7%      [Open]  │
│  SOL     +0.025%   +0.020%   +0.015%    15.3%      [Open]  │
│  ASTER   +0.180%   +0.150%   +0.090%   120.4%      [Open]  │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Auto-Hedger Panel

Accessible from position context menu or dedicated tab.

```
┌─────────────────────────────────────────────────────────────┐
│  Auto-Hedger                                    [?] [⚙]    │
├─────────────────────────────────────────────────────────────┤
│  ── Hedge Rules ──                              [+ New]     │
│                                                             │
│  Rule 1: Spot Buy → Perp Short                  [ON]       │
│  When spot buy > $500, short perp 1:1 at market             │
│  Exit: when spot sold                                       │
│                                                             │
│  Rule 2: HYPE Threshold Hedge                    [OFF]      │
│  When HYPE spot > $5000, maintain 0.8× short perp           │
│  Exit: manual                                               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ── Active Hedges ──                                        │
│                                                             │
│  HYPE: Spot $3,200 ↔ Perp -$3,180 | Δ +$20 | FR: +$1.20/h │
│  SOL:  Spot $8,500 ↔ Perp -$8,490 | Δ +$10 | FR: +$2.80/h │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Phased Rollout

### Phase 1 — Foundation (MVP)

**Goal**: Basic basis trade execution and monitoring.

- Funding rate dashboard (all HL perp markets, current + historical rates)
- Opportunity scanner with in-app alerts (rate threshold triggers)
- Strategy configurator for spot+perp basis trades (market entry only)
- Atomic execution engine (batch order submission, basic leg-risk protection)
- Position dashboard with combined P&L view
- Market unwind

### Phase 2 — Automation

**Goal**: Reduce manual monitoring to zero.

- Auto-rebalancer (delta drift threshold, time-based, price-based triggers)
- Smart unwind with configurable exit triggers (funding flip, liquidation proximity, P&L targets)
- TWAP entry and exit
- Execution log and audit trail
- Portfolio margin detection and optimized recommendations

### Phase 3 — Auto-Hedger

**Goal**: Automatic hedging for any position.

- Hedge rule engine (trigger → hedge → exit)
- Hedge monitor dashboard
- One-click hedge from any existing spot or perp position
- Partial hedge ratios

### Phase 4 — Cross-Exchange Intelligence

**Goal**: Support cross-exchange strategy planning.

- Cross-exchange funding rate comparison (Binance, Bybit, OKX, dYdX)
- Spread alerts (HL vs external exchange rate divergence)
- Cross-exchange P&L tracker (manual position entry for external exchange legs)
- Historical spread analysis

---

## 9. Key Metrics

| Metric | Target |
|--------|--------|
| Time to open basis trade | <30 seconds (vs 3–5 min manual) |
| Leg execution gap | <500ms between spot and perp fills |
| Delta drift before rebalance | <2% of position size |
| Rebalance latency | <5 seconds from trigger to execution |
| Funding rate data freshness | <10 seconds from on-chain event |
| Position P&L accuracy | Within 0.01% of actual |

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Leg risk (one side fills, other doesn't) | Naked directional exposure | Batch orders + auto-cancel with timeout + instant market close of filled leg |
| Liquidation on perp short during rally | Loss exceeding funding gains | Conservative default leverage (1×), liquidation warnings at 20%/10%/5% distance, auto-unwind trigger |
| Funding rate reversal | Position becomes net-negative | Alert on rate flip, auto-unwind option when rate turns negative for N hours |
| API rate limits during volatility | Failed rebalances or unwinds | Order queue with priority (unwinds > rebalances > new entries), exponential backoff |
| Stale funding data | Incorrect yield projections | Multi-source validation, display data freshness indicator, degrade gracefully |
| Portfolio margin changes | Unexpected liquidation threshold shifts | Re-evaluate margin on each portfolio margin state change, alert on deterioration |
| Smart contract / exchange risk | Loss of funds | Position size limits (user-configurable), warnings for large allocations |

---

## 11. Open Questions

1. **Vault integration** — should HypeTerminal offer a shared vault where users can pool capital for basis strategies (like Liminal/Neutral Trade), or stay purely single-user?
2. **Builder code revenue** — basis trades generate significant volume; should we integrate builder codes to capture fees as a revenue stream?
3. **Notification infrastructure** — in-app only for v1, but should we plan for Telegram/Discord webhook alerts in the architecture?
4. **Backtest engine** — should we offer historical backtesting of basis strategies using archived funding rates? High value but significant build cost.
5. **Mobile support** — basis trades are "set and forget" but alerts are time-sensitive; what's the mobile notification story?
