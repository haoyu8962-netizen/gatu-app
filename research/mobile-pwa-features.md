# Mobile PWA Features — HypeTerminal Roadmap

Deep research into Hyperliquid mobile trading pain points, competitor analysis, PWA capabilities, and a prioritized roadmap to make HypeTerminal the best mobile perp terminal.

---

## 1. Hyperliquid Mobile Pain Points (Community Research)

### 1.1 UI Complaints

| Area | Problem | Severity |
|------|---------|----------|
| Font sizes | Orderbook numbers, PnL, liquidation price too small to scan at a glance | Critical |
| Buy/Sell buttons | Too small and too close — accidental wrong-side trades reported on Reddit | Critical |
| Leverage slider | Touch target too narrow, precise adjustment (5x→6x) nearly impossible | High |
| Chart vs order entry | No good middle ground — chart takes too much or too little space, requires scrolling between chart and order entry | High |
| Position table | Requires horizontal scrolling, easy to miss data columns | High |
| Order entry form | Numeric inputs small, mobile keyboard obscures form, no quick % sizing buttons | High |
| TP/SL editing | Clunky multi-tap flow, modals don't render cleanly on mobile | Medium |
| Drawing tools | Unusable on mobile — require desktop-level precision | Medium |
| Layout philosophy | Responsive desktop layout shrunk down, not mobile-first | Critical |
| Navigation | No bottom nav bar, hamburger menu requires scroll-up | High |
| Mark vs last price | Hard to distinguish — similar sizing and insufficient contrast | Medium |
| Tab switches | Order type tabs (Limit/Market) have cramped touch targets | Medium |

### 1.2 Notification Gaps

| Missing Notification | Impact |
|---------------------|--------|
| **Liquidation warnings** | #1 most requested feature. No tiered warnings (50%/25%/10% distance). Traders get liquidated because they didn't check in time |
| **Order fill alerts** | No notification when limit orders fill, TP/SL triggers, or partial fills |
| **Price alerts** | Zero native price alert system — table stakes for every CEX |
| **Funding rate alerts** | Traders set phone alarms every 8 hours to manually check funding |
| **Push notification infrastructure** | None whatsoever — no push, no email, no Telegram integration |

### 1.3 Touch Control Issues

- **Pinch-to-zoom conflict**: Chart zoom triggers browser native zoom on iOS Safari — most complained-about mobile issue
- **Scroll traps**: Vertical page scroll gets captured by horizontal-scrolling elements (positions table, order history)
- **Accidental submissions**: Submit button proximity to other interactive elements causes wrong taps
- **Orderbook tap targets**: Rows too narrow, traders tap wrong price level
- **No swipe gestures**: No swipe between pairs, no swipe-to-close positions, no swipe tabs
- **iOS back swipe**: Conflicts with app navigation, accidentally leaves trading page
- **Order modification**: Dragging orders on chart nearly impossible on mobile, no +/- tick buttons
- **No pull-to-refresh**: Have to reload entire page to fix stale data

### 1.4 Manual Workarounds Traders Do on Phone

| Workaround | What They Actually Want |
|-----------|----------------------|
| Run 2-3 Telegram bots (HyperTracker, HL Alert Bot) for position monitoring | Native push notifications |
| Set phone alarms every 8 hours to check funding rates | Funding rate alerts with threshold triggers |
| Use TradingView alerts (requires subscription) for price alerts | Built-in price alert system |
| Screenshot positions to track PnL over time | PnL history and analytics |
| Use Hypurrscan/HyperDash third-party dashboards | Native portfolio analytics |
| Manually calculate position sizes | Built-in position size calculator |
| Manually switch between sub-accounts with no aggregate view | Unified multi-account dashboard |

---

## 2. Competitor Mobile Experiences

### 2.1 CEX Apps (the bar traders expect)

**Binance**
- Sub-100ms responsiveness, push notifications for everything
- 25/50/75/100% position sizing buttons
- Swipe between pairs, bottom nav, biometric auth
- Built-in PnL analytics, portfolio tracking, price alerts
- AI-powered personalized homepage (2025)
- Mini candlestick chart embedded in order entry

**Bybit**
- Copy trading with one-tap follow
- Unified margin visible at a glance
- Position calculator in order entry form
- Granular push notification control
- 2024 UI overhaul: cleaner, faster, more accessible

**OKX**
- Considered best mobile trading UX among CEXes
- "Simple mode" / "Professional mode" toggle — adapts complexity
- Signal trading on mobile, portfolio margin visualizations
- Copy trading leaderboard browsable on mobile

**BitMEX (2025 redesign — gesture innovation)**
- **Swipe-to-close positions** — single swipe gesture
- One-swipe navigation between markets
- Gesture-driven trading controls throughout
- Streamlined order flows for instant reactions

### 2.2 DeFi Competitors

**dYdX v4**
- Native iOS + Android apps (not just web)
- Push notifications for fills and liquidation warnings
- Cleaner mobile-first UI design
- Lower liquidity/higher latency than HL — but better mobile UX

**GMX v2**
- Simpler interface works well on mobile due to simplicity itself
- Cleaner mobile layout than Hyperliquid
- Fewer features but simplicity is an advantage on mobile

### 2.3 Key Gaps vs All Competitors

| Feature | Every Competitor | Hyperliquid |
|---------|-----------------|-------------|
| Push notifications | Yes | No |
| Bottom navigation bar | Yes | No |
| Position size calculator | Yes | No |
| Quick % sizing (25/50/75/100%) | Yes | Inferior |
| Biometric auth for trades | Yes (CEX) | No |
| Price alerts | Yes | No |
| Swipe gestures on positions | BitMEX+ | No |
| Native mobile app | Most | No |

---

## 3. PWA Capabilities (2026 State of the Art)

### 3.1 What Works on Both iOS + Android PWAs

| Capability | Notes |
|-----------|-------|
| **Push notifications** | iOS 16.4+ (must be installed to home screen). Basic only — no rich media, no action buttons on iOS |
| **Badge API** | Shows notification count on app icon. iOS 16.4+ |
| **Screen Wake Lock** | Prevents dimming during active trading. Safari 18.4+ |
| **WebAuthn** | Biometric/passwordless auth for sensitive actions |
| **Web Share API** | Share PnL screenshots natively |
| **Service Workers** | Offline caching, app shell, instant loading |
| **Canvas/WebGL** | Full chart rendering capability |
| **Standalone mode** | No browser chrome when installed |

### 3.2 Android-Only PWA Features

| Capability | Notes |
|-----------|-------|
| **Vibration API** | Custom haptic patterns (`navigator.vibrate()`) |
| **Background Sync** | Sync position data when app is backgrounded |
| **Periodic Background Sync** | Scheduled background tasks |
| **Rich push notifications** | Action buttons, images in notifications |
| **Install prompt** | `beforeinstallprompt` event for custom install flow |

### 3.3 iOS PWA Limitations (No Workaround)

- No `navigator.vibrate()` — use `web-haptics` npm package (hidden switch element workaround)
- No Background Sync — cannot monitor positions when app is closed
- No automatic install prompt — users must manually "Add to Home Screen"
- No silent/rich push notifications
- No fullscreen API

### 3.4 Critical Implication for Trading

Background monitoring (liquidation warnings when app is closed) **requires a server-side system** that monitors positions and sends push notifications via Web Push API. The PWA cannot do this itself on iOS.

---

## 4. Mobile-First Trading Patterns (Best Practices)

### 4.1 Navigation

- **Bottom tab bar** (5 sections): Trade, Positions, Markets, Alerts, Portfolio
- **Swipe between tabs** for fluid context switching
- Single-screen trading: chart + order entry visible simultaneously

### 4.2 Order Entry

- **Bottom sheet pattern**: Slides up from bottom, covers ~60-70% of screen, chart stays visible at top
- **Quick size buttons**: 25% / 50% / 75% / 100% of available margin
- **Order templates**: Save frequently used configs, apply with one tap
- **Inline position calculator**: Shows estimated PnL, liquidation price, fees before submission

### 4.3 Position Management

- **Swipe-to-close**: Single swipe gesture (BitMEX pattern), haptic feedback on threshold
- **Position cards**: Asset | Side | Size | Entry | Mark | PnL | Liq — scannable at a glance
- **Partial close**: One-tap 25/50/75/100% close from position card
- **Add to position**: From position view without navigating to trade screen

### 4.4 Confirmations

- **Hold-to-confirm**: Tap and hold trade button, drag up to confirm, release to cancel
- **One-tap mode**: Opt-in setting for experienced traders, all actions execute instantly
- **Haptic patterns**: Success (short burst), error (double buzz), warning (sustained vibration)

### 4.5 Chart Interaction

- **Pinch-to-zoom** with browser zoom prevention (`touch-action: none`)
- **Long-press** activates crosshair/tracking mode with OHLC values
- **Double-tap** resets zoom
- **Landscape auto-rotate**: Fullscreen chart with minimal overlay
- Drawing tools: hide on mobile or provide simplified set with large touch targets

### 4.6 Touch Targets

- **44px minimum** for all interactive elements (WCAG 2.5.5 AAA)
- **Increased spacing** between Buy/Sell buttons — prevent wrong-side trades
- **Orderbook rows**: Minimum 36px height for tappable price levels

---

## 5. Performance Requirements

### 5.1 Loading

| Metric | Target |
|--------|--------|
| First Contentful Paint | < 1s |
| Time to Interactive | < 2s |
| App shell from cache | Instant (service worker) |
| WebSocket connection | < 500ms after load |

### 5.2 WebSocket Optimization for Mobile

- **Throttle updates**: Conflate to 100-500ms intervals (mobile renders 10-20fps max)
- **Batch updates**: 200ms burst intervals — halves battery drain vs instant delivery
- **Visibility API**: Pause non-critical updates when `document.hidden`
- **Subscribe selectively**: Only markets currently viewed, unsubscribe on navigate away
- **Delta updates**: Only changed fields, not full state objects
- **Reconnection**: Exponential backoff with jitter, state diff sync on reconnect
- **Background lifecycle**: Close WebSocket when backgrounded, reopen on foreground

### 5.3 Battery & Data

- Binary protocols (protobuf/msgpack) reduce message sizes 60-80% vs JSON
- Per-message compression (permessage-deflate) — up to 70% bandwidth reduction
- Aggressive caching of static data (market metadata, asset info)
- Virtual scrolling for long lists (trade history, order history)
- `requestAnimationFrame` for chart updates, skip frames when not visible
- Web Workers for heavy calculations (PnL, orderbook aggregation) off main thread

### 5.4 Chart Rendering

- TradingView Lightweight Charts: 45KB, handles thousands of bars at 60fps
- Canvas rendering preferred over SVG (3-9x faster for large datasets)
- Reduce visible candles on mobile (200-300 vs 500+ on desktop)
- `will-change: transform` and CSS containment for composited layers
- Disable complex animations on low-end devices

---

## 6. Roadmap: Making HypeTerminal the Best Mobile Perp Terminal

### Phase 1: Foundation (Weeks 1-4) — "Make It Not Suck on Mobile"

**Goal**: Mobile-first layout that doesn't feel like a shrunk desktop.

| Feature | Priority | Effort |
|---------|----------|--------|
| Bottom navigation bar (Trade / Positions / Markets / Alerts / Account) | P0 | M |
| Mobile-first trade screen layout (chart top, order entry bottom sheet) | P0 | L |
| Touch target audit — minimum 44px for all interactive elements | P0 | M |
| Buy/Sell button redesign — larger, more spacing, distinct colors | P0 | S |
| Position cards (not horizontal scroll table) | P0 | M |
| `touch-action: none` on chart to prevent browser zoom conflicts | P0 | S |
| Responsive typography — readable PnL, liq price, mark price | P0 | S |
| Pull-to-refresh for position/market data | P1 | S |
| PWA manifest + service worker for app shell caching | P1 | M |
| Install prompt flow ("Add to Home Screen" guidance) | P1 | S |

### Phase 2: Trading UX (Weeks 5-8) — "Trade Fast on Your Phone"

**Goal**: Order entry and position management that rivals Binance mobile.

| Feature | Priority | Effort |
|---------|----------|--------|
| Quick size buttons (25% / 50% / 75% / 100%) in order entry | P0 | S |
| Inline position calculator (est. PnL, liq price, fees) before submit | P0 | M |
| Swipe-to-close positions (with haptic feedback) | P0 | M |
| One-tap partial close (25/50/75/100%) from position card | P0 | S |
| Bottom sheet order entry (swipe up/down, chart stays visible) | P0 | L |
| Leverage adjustment — stepper buttons (+/-) instead of slider | P1 | S |
| Hold-to-confirm for large orders / close-all | P1 | S |
| Quick TP/SL setting from position card (tap to add/edit) | P1 | M |
| Order templates (save & apply preset configurations) | P2 | M |
| One-tap trading mode (opt-in, no confirmation dialogs) | P2 | S |

### Phase 3: Notifications (Weeks 9-12) — "Never Get Liquidated in Your Sleep"

**Goal**: Push notification system that eliminates the need for Telegram bots.

| Feature | Priority | Effort |
|---------|----------|--------|
| **Server-side position monitoring service** (required for iOS push) | P0 | XL |
| Web Push API integration (service worker + VAPID keys) | P0 | L |
| Liquidation proximity alerts (configurable thresholds: 50%/25%/10%) | P0 | M |
| Order fill notifications (limit fills, TP/SL triggers, partial fills) | P0 | M |
| Price alerts (set from chart long-press or dedicated UI) | P0 | L |
| Funding rate alerts (threshold triggers, direction flip) | P1 | M |
| PnL threshold alerts (e.g., "alert me if position PnL drops below -$500") | P1 | M |
| Badge API integration (unread notification count on app icon) | P1 | S |
| Notification preferences screen (granular on/off per type) | P1 | M |
| Notification quick actions ("Close Position" from notification) | P2 | M |

### Phase 4: Polish & Power Features (Weeks 13-16) — "Better Than Native"

**Goal**: PWA features that make traders forget they're not using a native app.

| Feature | Priority | Effort |
|---------|----------|--------|
| Haptic feedback on trade execution, errors, warnings (`web-haptics`) | P1 | S |
| Screen Wake Lock during active trading sessions | P1 | S |
| Landscape mode — auto-rotate chart to fullscreen | P1 | M |
| WebAuthn biometric auth for sensitive actions (withdrawals, large trades) | P1 | M |
| Offline mode — show cached positions/PnL, "last updated" timestamp | P1 | M |
| WebSocket optimization — throttling, delta updates, visibility-aware | P1 | L |
| Virtual scrolling for trade history / order history | P1 | M |
| Web Share API — share PnL screenshots | P2 | S |
| Simple/Pro mode toggle (like OKX) — reduce complexity for basic traders | P2 | L |
| Emergency close-all FAB (floating action button, always accessible) | P1 | S |
| Dark/light theme toggle for outdoor trading | P2 | M |
| Swipe between trading pairs | P2 | M |

### Phase 5: Analytics & Intelligence (Weeks 17-20) — "Your Edge on Mobile"

**Goal**: Portfolio intelligence that no other mobile perp terminal offers.

| Feature | Priority | Effort |
|---------|----------|--------|
| PnL history & analytics (daily/weekly/monthly charts) | P1 | L |
| Funding rate dashboard (rates across all pairs, historical) | P1 | M |
| Position risk visualization (margin usage gauge, liq proximity bar) | P1 | M |
| Trade journal (auto-logged trades with notes) | P2 | L |
| Multi-account aggregated view | P2 | L |
| Market heatmap (scannable overview of all pairs) | P2 | M |
| Copy trading integration (follow/mirror other traders) | P3 | XL |

---

## 7. Effort Legend

| Size | Estimate | Description |
|------|----------|-------------|
| S | 1-2 days | Single component, minimal state |
| M | 3-5 days | Multiple components, some state management |
| L | 1-2 weeks | Full feature with backend/service worker work |
| XL | 2-4 weeks | Infrastructure (server-side monitoring, notification service) |

---

## 8. Success Metrics

| Metric | Target | How to Measure |
|--------|--------|---------------|
| Mobile bounce rate | < 20% (from estimated 60%+) | Analytics |
| PWA install rate | > 30% of mobile users | Install event tracking |
| Notification opt-in rate | > 50% of installed users | Push subscription count |
| Mobile trade completion rate | > 80% (from estimated 40%) | Funnel analytics |
| Time to place order (mobile) | < 5 seconds | Session recording |
| Accidental wrong-side trades | < 0.1% | Trade error reports |
| Telegram bot dependency | → 0 | Community survey |
| App Store rating equivalent | 4.5+ | In-app feedback |

---

## 9. Competitive Positioning

**What makes HypeTerminal's PWA win over native CEX apps:**

1. **No app store gatekeeping** — instant updates, no review delays, no 30% cut
2. **Single codebase** — desktop and mobile share components, faster iteration
3. **DeFi-native** — self-custody, no KYC, permissionless
4. **Server-side alerts** — match CEX notification quality without centralized custody
5. **Open protocol** — integrate any Hyperliquid feature as it ships, no app store approval needed

**What makes HypeTerminal's PWA win over Hyperliquid's own mobile UI:**

1. **Mobile-first design** — not a responsive desktop layout
2. **Push notifications** — liquidation warnings, fill alerts, price alerts
3. **Touch-optimized** — swipe gestures, proper touch targets, haptic feedback
4. **Position management** — swipe-to-close, quick partial close, inline TP/SL
5. **Performance** — optimized WebSocket handling, service worker caching, instant load

---

## 10. Key Technical Decisions

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Notification backend | Dedicated server-side service | iOS PWAs cannot monitor in background — server must watch positions and push alerts |
| Haptic feedback | `web-haptics` npm package | Only cross-platform solution that works on iOS (uses hidden switch workaround) |
| Chart library | TradingView Lightweight Charts | 45KB, 60fps, touch-optimized, already familiar to traders |
| State management | Zustand (existing) | Already in stack, works with service workers |
| Push protocol | Web Push API + VAPID | Standard, works on both iOS and Android PWAs |
| Install flow | Custom prompt after 3rd trade session | Don't prompt on first visit — let users experience value first |
| Mobile detection | CSS media queries + `navigator.maxTouchPoints` | Responsive design, not separate mobile build |
| Offline strategy | Cache-first app shell, network-first data | Instant load, always-fresh trading data |
