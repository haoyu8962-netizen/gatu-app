# HypeTerminal Notification System Spec

## Problem

Hyperliquid traders currently stitch together 4-6 tools to get basic alerting:

- **CoinGlass** — OI, funding, whale position alerts
- **TradingView** — technical price alerts (free tier: 1 alert)
- **HyperTracker / custom Telegram bots** — wallet tracking, whale trades
- **Exchange UI** — order fills, position warnings
- **CryptocurrencyAlerting.com** — multi-channel delivery, volume spikes
- **Drops Bot** — funding rate alerts, PnL tracking

This fragmentation causes alert fatigue (too many channels), missed signals (context split across apps), and configuration overhead (same alert set up 3 times as backup). Hyperliquid's 1-hour funding intervals (vs 8-hour on CEXs) make real-time, integrated alerting significantly more valuable.

---

## Alert Types

### Tier 1 — Position Safety (always on, zero config)

| Alert | Trigger | Default | Notes |
|---|---|---|---|
| Liquidation proximity | Position margin ratio crosses threshold | 15%, 10%, 5% distance | Escalating urgency. Sound + push at 5% |
| Margin utilization | Portfolio-level margin usage | 70%, 85%, 95% | Aggregate across all positions |
| Order fill | Limit order fills (full or partial) | All fills | Partial fill shows filled/total |
| Order cancel | Order cancelled (by system or user) | System cancels only | Auto-deleverage, insufficient margin |
| Funding payment | Funding charged/received on positions | Payments > $10 | Hyperliquid settles hourly |

### Tier 2 — Market Alerts (user-configured)

| Alert | Trigger | Config |
|---|---|---|
| Price level | Price crosses above/below target | Asset, price, direction |
| Price % move | Asset moves X% in Y time window | Asset, %, window (5m/15m/1h/4h/24h) |
| Funding rate threshold | Funding rate exceeds +/- X% | Asset, rate threshold |
| Funding rate flip | Funding flips positive ↔ negative | Asset |
| Volume spike | Volume exceeds Nx average in window | Asset, multiplier (2x-50x), window |
| OI change | Open interest changes by X% in window | Asset, %, window |
| Spread widening | Bid-ask spread exceeds threshold | Asset, spread bps |

### Tier 3 — Intelligence Alerts (user-configured, advanced)

| Alert | Trigger | Config |
|---|---|---|
| Whale trade | Trade size > threshold on any asset | Size threshold ($100K-$10M), asset filter |
| Wallet tracking | Tracked address opens/closes/modifies position | Address list, action filter |
| Composite condition | Multiple conditions AND'd together | 2-4 conditions from Tier 2 |
| Trailing alert | Price drops X% from any new high (or rises X% from any new low) | Asset, %, direction |
| Liquidation cluster | Liquidation density within X% of current price | Asset, distance %, cluster size |
| Funding arbitrage | Hyperliquid funding diverges from CEX benchmark | Asset, divergence threshold |
| Pre-funding reminder | N minutes before funding settlement | Minutes before (default: 5) |
| Relative strength | Asset outperforms/underperforms BTC by X% in window | Asset, %, window |

---

## Delivery Channels

| Channel | Latency | Use case | Implementation |
|---|---|---|---|
| **In-app toast** | Instant | All alerts when app is open | Sonner toast, bottom-right, auto-dismiss configurable |
| **In-app sound** | Instant | Urgent alerts (liquidation, large fills) | Web Audio API, distinct sounds per severity |
| **Browser push** | 1-3s | App backgrounded/tab inactive | Service Worker + Push API |
| **Mobile push** | 1-5s | Away from desk | FCM (Android) + APNs (iOS) via unified provider |
| **Telegram** | 2-10s | Traders who live in Telegram | Bot API, formatted messages with mini-charts |
| **Webhook** | 1-3s | Power users, automation | POST to user-provided URL, signed payload |

### Channel priority cascade

1. If app tab is active → in-app toast + sound (no push)
2. If app tab is backgrounded → browser push
3. If no browser session → mobile push / Telegram
4. Webhook fires regardless (parallel delivery)

---

## Alert Configuration UX

### Quick alerts (inline, zero-friction)

- **Chart right-click** → "Alert when price crosses [level]" — pre-fills asset + price from click position
- **Position row** → bell icon → liquidation proximity slider (5%-50%)
- **Funding rate column** → click rate → "Alert if funding > [current value]"
- **Order book** → click price level → price alert pre-filled

### Alert manager (full config)

- **Location**: Sidebar panel or modal, accessible from notification bell in header
- **List view**: All active alerts, grouped by asset, sortable by type/creation date
- **Each alert shows**: Type icon, condition summary, last triggered time, channel badges, enable/disable toggle
- **Bulk actions**: Pause all, delete all for asset, duplicate alert to other assets
- **Templates**: Save alert configs as templates, apply to new assets with one click

### Composite alert builder

- Visual condition builder: Add conditions as rows, each row is a Tier 2 alert
- AND logic between rows (all must be true simultaneously)
- Preview: "Will fire when ETH price > $4000 AND funding > 0.05% AND 1h volume > 3x avg"
- Max 4 conditions per composite alert

---

## Notification Center

### Bell icon (header)

- Unread count badge (red dot for critical, blue for info)
- Click opens dropdown panel

### Notification panel

- **Tabs**: All | Position | Market | Whale
- **Each notification**: Icon, asset badge, condition text, timestamp, action button
- **Action buttons**: "View position", "Open chart", "Dismiss", "Mute this alert for 1h"
- **Mark all read**, **Clear all**
- **Infinite scroll** with virtualization (last 500 notifications cached locally)

### Notification anatomy

```
┌──────────────────────────────────────────────┐
│ ⚠️ Liquidation Warning              2m ago   │
│ ETH-PERP — 8.2% from liquidation price       │
│ Position: 5.2 ETH Long @ $3,847              │
│ Liq price: $3,531 | Mark: $3,821             │
│ [View Position]                    [Dismiss]  │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ 🐋 Whale Trade                      just now │
│ BTC-PERP — $2.4M Long opened                 │
│ Size: 28.5 BTC @ $84,210                     │
│ [Open Chart]                       [Dismiss]  │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ 📊 Funding Rate Alert                  15m ago │
│ SOL-PERP funding hit +0.082%                  │
│ 24h avg: +0.031% | Current: +0.082%          │
│ [View Funding]                     [Dismiss]  │
└──────────────────────────────────────────────┘
```

---

## Data Architecture

### Real-time data sources (already available via Hyperliquid WebSocket)

| Data | WS Channel | Refresh |
|---|---|---|
| Trades (whale detection) | `trades` | Real-time stream |
| Order book (spread) | `l2Book` | Real-time stream |
| User fills | `userFills` | Real-time stream |
| User funding | `userFunding` | Hourly |
| Candles (volume calc) | `candle` | Per-interval |
| Mid price | `allMids` | Real-time stream |
| Meta + context (OI, funding) | `activeAssetCtx` | ~3s |

### Alert evaluation engine

```
WebSocket streams
       │
       ▼
┌─────────────────┐
│  Stream Router   │  ← Demux incoming data by subscription type
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Alert Evaluator │  ← Check all active alerts against new data
│                  │     - Price alerts: compare against allMids/trades
│                  │     - Funding: compare against activeAssetCtx
│                  │     - Volume: rolling window aggregation
│                  │     - Composite: evaluate sub-conditions, AND gate
└────────┬────────┘
         │ (triggered alerts)
         ▼
┌─────────────────┐
│  Dedup + Cooldown│  ← Prevent spam: configurable cooldown per alert
│                  │     Default: 5m for price, 1h for funding, 0 for fills
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Delivery Router │  ← Channel cascade logic
│                  │     In-app → Push → Telegram → Webhook
└─────────────────┘
```

### Client-side vs server-side evaluation

| | Client-side | Server-side |
|---|---|---|
| **Scope** | Tier 1 + Tier 2 (while app open) | All tiers (always on) |
| **Latency** | Instant (no round trip) | 1-5s |
| **Reliability** | Only when tab is open | 24/7 |
| **Push delivery** | Browser push only | Mobile push + Telegram |

**Phase 1**: Client-side only — all evaluation in browser, browser push for backgrounded tabs. Covers the 80% case (traders have the app open while trading).

**Phase 2**: Server-side evaluation — persistent WebSocket connections on backend, enables mobile push and Telegram delivery when app is closed. Required for Tier 3 alerts (whale tracking, wallet monitoring, composite conditions).

---

## Storage

### Alert definitions (Zustand + persist)

```ts
interface Alert {
  id: string
  type: AlertType
  asset: string | null         // null = all assets
  conditions: AlertCondition[]  // 1 for simple, 2-4 for composite
  channels: Channel[]
  cooldownMs: number
  enabled: boolean
  createdAt: number
  lastTriggeredAt: number | null
  triggerCount: number
}

type AlertType =
  | "price_level"
  | "price_pct_move"
  | "funding_threshold"
  | "funding_flip"
  | "volume_spike"
  | "oi_change"
  | "spread"
  | "whale_trade"
  | "wallet_track"
  | "liquidation_proximity"
  | "margin_utilization"
  | "order_fill"
  | "trailing"
  | "composite"
  | "pre_funding"

type Channel = "in_app" | "sound" | "browser_push" | "mobile_push" | "telegram" | "webhook"
```

### Notification history (IndexedDB)

- Last 500 notifications stored locally
- Schema: `{ id, alertId, type, asset, title, body, data, timestamp, read, dismissed }`
- Auto-prune notifications older than 7 days
- Server-side: persist to DB for cross-device sync (Phase 2)

---

## Sound Design

| Severity | Sound | Duration | Alerts |
|---|---|---|---|
| Critical | Sharp double-tone, ascending | 800ms | Liquidation < 5%, margin > 95% |
| Warning | Single mid-tone | 400ms | Liquidation < 15%, large funding |
| Info | Soft click/ping | 200ms | Order fills, price alerts |
| Whale | Deep tone + bubble | 600ms | Whale trades |

- Volume follows system volume
- Mute toggle in notification settings
- "Do not disturb" mode: suppress all sounds, batch notifications

---

## Settings

```
Notifications
├── Channels
│   ├── In-app toasts          [on/off] [auto-dismiss: 5s/10s/30s/never]
│   ├── Sound                  [on/off] [volume slider]
│   ├── Browser push           [on/off] [request permission]
│   ├── Mobile push            [on/off] [connect device]
│   ├── Telegram               [on/off] [connect bot]
│   └── Webhook                [on/off] [URL input] [test button]
├── Do Not Disturb             [on/off] [schedule: time range]
├── Position Safety
│   ├── Liquidation warnings   [on/off] [thresholds: 15%, 10%, 5%]
│   ├── Margin utilization     [on/off] [thresholds: 70%, 85%, 95%]
│   ├── Order fills            [on/off] [min size filter]
│   └── Funding payments       [on/off] [min amount filter]
└── Alert Defaults
    ├── Default cooldown        [5m / 15m / 1h / 4h]
    ├── Default channels        [checkboxes]
    └── Max active alerts       [50 / 100 / 200]
```

---

## Phased Rollout

### Phase 1 — Client-side core (MVP)

- Tier 1 alerts (liquidation, margin, fills, funding payments) — auto-enabled
- Price level + price % move alerts
- Funding rate threshold + flip alerts
- In-app toast + sound delivery
- Browser push notifications (Service Worker)
- Notification center panel with history
- Alert manager (create/edit/delete/toggle)
- Zustand store + localStorage persistence

### Phase 2 — Market intelligence

- Volume spike + OI change alerts
- Whale trade alerts (large trade detection from `trades` stream)
- Composite condition builder (2-4 conditions)
- Trailing price alerts
- Alert templates (save + apply to new assets)
- Sound customization

### Phase 3 — Server-side + external channels

- Backend alert evaluation service (persistent WS connections)
- Mobile push notifications (FCM + APNs)
- Telegram bot integration (connect account, formatted alerts)
- Webhook delivery (signed payloads)
- 24/7 alerting when app is closed
- Cross-device notification sync

### Phase 4 — Advanced intelligence

- Wallet tracking alerts
- Liquidation cluster detection
- Funding arbitrage alerts (cross-exchange comparison)
- Pre-funding settlement reminders
- Relative strength alerts
- Alert analytics (hit rate, response time, P&L impact)

---

## Key Design Decisions

1. **Client-first**: Phase 1 requires zero backend. All evaluation happens in the browser against existing WebSocket streams. This ships fast and covers the primary use case (alerts while trading).

2. **Position safety is not optional**: Liquidation proximity and margin utilization alerts are always on with sensible defaults. Traders can adjust thresholds but cannot fully disable them. This is the single highest-value alert category.

3. **Cooldown prevents fatigue**: Every alert has a cooldown period. Price hovering around a level won't spam 50 notifications. Cooldown resets on dismiss or manual re-arm.

4. **Context-rich notifications**: Every notification includes enough context to act without opening another view. Liquidation warning shows position size, entry price, liq price, and current mark price. Funding alert shows current rate vs 24h average.

5. **Chart integration**: Price alerts created from chart are shown as horizontal lines on the chart (similar to TradingView). Triggered alerts flash the line briefly. This replaces TradingView's alert system entirely for Hyperliquid assets.

6. **No email**: Crypto traders don't use email for time-sensitive alerts. Telegram replaces email as the async channel.

7. **50 alert soft limit**: Prevent alert hoarding that leads to fatigue. Power users can increase to 200. Composite alerts count as 1.
