# Liquidation Risk Monitoring — Research

## 1. How Traders Monitor Liquidation Risk Today

### Manual Workflows

- **Refreshing exchange UIs**: Repeatedly checking positions page to see liquidation prices update. No proactive push notifications from most exchange UIs when liquidation approaches.
- **External calculators**: Standalone tools (Binance Futures Calculator, Gainium, leverage.trading, Gate.io) require manual input of entry price, leverage, margin. None connect to live positions.
- **Spreadsheet tracking**: Multi-position traders maintain custom spreadsheets to track aggregate risk. Manually update entry prices, current prices, distance-to-liquidation %.
- **Price alert proxies**: Setting TradingView or exchange price alerts near estimated liquidation prices. Error-prone — liquidation price shifts as funding accrues and margin changes.
- **Telegram/Discord bots**: Community bots (Drops Bot, CryptoCurrencyAlerting.com) track whale positions and market-wide liquidation events. Not personal risk monitoring.
- **Market-level dashboards**: CoinGlass (liquidation heatmaps/maps), CoinPerps, Coinalyze track aggregated liquidation data across exchanges. Market-level, not personal.

### Core Pain Point

No single tool connects to a trader's live positions and continuously monitors personal liquidation risk with proactive alerts.

---

## 2. Gaps in Hyperliquid's Current UI

### What It Shows

- Estimated liquidation price when entering a trade
- Liquidation price per position (`liquidationPx` from API)
- Basic margin info: `marginUsed`, `positionValue`, `unrealizedPnl`, `returnOnEquity`
- Account-level: `accountValue`, `totalMarginUsed`, `totalNtlPos`, `withdrawable`, `crossMaintenanceMarginUsed`

### What's Missing

1. **No margin ratio / health factor display** — No prominent gauge showing how close the entire account is to liquidation as a ratio or percentage. Traders must mentally compute `(accountValue - maintenanceMargin) / accountValue`.
2. **No proactive liquidation warnings** — No browser notifications, sounds, or visual alerts when liquidation approaches. HypeTerminal has a `liqIsNear` check (within 10% of mark price) but it's purely visual (text coloring).
3. **No what-if scenario tool** — Cannot simulate "what happens to my liq price if BTC drops 20%?" or "what if I add $500 margin?"
4. **No aggregated cross-position risk view** — Cross-margin positions share collateral, but no visualization of how correlated positions compound risk. Long BTC + ETH + SOL = highly correlated downside, but UI treats each independently.
5. **No distance-to-liquidation %** — Shows liquidation price but not "you are X% away from liquidation" prominently.
6. **No historical liquidation data** — No view of past liquidations or near-liquidation events for the user.
7. **No ADL warnings** — No indication of auto-deleveraging risk or queue position.

### Platform Incidents Highlighting These Gaps

- **March 2025 JELLY exploit**: Price manipulation forced $13.5M losses on HLP vault. Thin-liquidity assets + high leverage = cascading liquidation risk.
- **November 2025 attack**: $4.9M price manipulation forcing HLP to absorb bad debt.
- **July 2025 API outage**: 14:20–14:47 UTC — traders couldn't close positions, highlighting need for client-side risk monitoring independent of exchange availability.

---

## 3. Existing Tools Landscape

### Lending Protocol Tools (Most Mature)

| Tool | What It Does | Limitation |
|------|-------------|------------|
| **DeFi Saver** | 24/7 automated liquidation protection for Aave, MakerDAO, Compound. Auto-repay, stop-loss, trailing stops. | Lending-only, 0.25% fee per action |
| **Instadapp Actions** | Automated debt refinancing + position unwinding for Aave v2/v3 via Gelato Network | Lending-only |

### Perps-Specific Tools

| Tool | What It Does | Limitation |
|------|-------------|------------|
| **HyperTracker** (CoinMarketMan) | Liquidation heatmaps across all HL open positions, risk map showing at-risk value within 25% of liq | Market-wide, not personal dashboard with alerts |
| **CoinGlass HL page** | Whale monitoring, position tracking, liquidation data | Market-wide analytics |
| **ASXN HyperScreener** | Whale positions, liquidations, top traders, funding, OI | Market-wide analytics |
| **Hyperliquid Tracker App** (iOS) | Mobile position tracking with alerts | Limited features |
| **CryptoCurrencyAlerting** | Liquidation alerts for Bybit, KuCoin, BitMEX, Binance via TG/Discord/Email/SMS | No Hyperliquid support, market-level only |

### What All These Tools Miss

- No personal margin health monitoring with proactive alerts
- No what-if scenario simulation for your own positions
- No auto-actions (auto-deleverage, auto-add-margin)
- No correlated risk analysis across positions
- No webhook integration for personal account risk
- No sound/browser notification for approaching liquidation
- No cascade risk warnings specific to your positions

---

## 4. Feature Ideas for HypeTerminal

### Tier 1 — High Impact

#### Account Health Gauge
Always-visible gauge showing overall account margin health as a percentage.
- Formula: `(accountValue - crossMaintenanceMarginUsed) / accountValue`
- Color-coded: green (>50%), yellow (20–50%), orange (10–20%), red (<10%)
- Persistent in header/sidebar — never hidden
- Single most impactful missing feature across all perps UIs

#### Distance-to-Liquidation per Position
Show each position's distance to liquidation as % of current price, not just raw liq price.
- Format: `Liq: $58,200 (-8.3%)`
- Extend existing `liqIsNear` check to show actual percentage
- Color gradient based on proximity

#### Tiered Alert System
Configurable thresholds (25%, 15%, 10%, 5%) triggering:
- Visual warnings (flashing/pulsing UI, color shifts)
- Browser notifications (Notification API)
- Audio alerts (configurable sounds)
- Optional webhooks to Telegram/Discord (user provides URL)
- Persist alert config in zustand store with `persist` middleware

#### What-If Scenario Simulator
Panel where traders can:
- Drag price slider to see liq prices and margin ratios change in real-time
- Simulate adding/removing margin
- Simulate adding a new position to see aggregate impact
- Show "price needs to drop X% to liquidate" per scenario
- Useful for pre-trade risk assessment

### Tier 2 — Differentiating

#### Correlated Risk Analysis
For cross-margin accounts, analyze position correlation.
- Flag highly correlated exposure: "80% of positions are correlated — broad downturn affects all"
- Show combined notional at risk from correlated moves
- Simple correlation buckets: BTC-correlated, ETH-correlated, uncorrelated

#### Liquidation Cascade Proximity Warning
Using market-wide data, show when large liquidation clusters exist near current price.
- Warn: "There are $45M in long liquidations between $62k–$60k BTC"
- These cascades could accelerate price moves toward user's liq price
- Data from Hyperliquid's `liquidatable` endpoint + aggregated OI

#### Historical Near-Liquidation Events
Track and display when user's account came close to liquidation.
- "You were 3% from liquidation on March 15 at 14:32 UTC"
- Builds risk awareness over time
- Store locally in zustand with persist

#### Position Risk Heatmap
Compact visual: all positions as colored blocks, sized by notional, colored by distance-to-liquidation.
- Instant gestalt view of portfolio risk
- Click to expand individual position details

### Tier 3 — Advanced / Future

- **Auto-Actions**: Auto-reduce position or auto-add margin at thresholds (like DeFi Saver for perps). Requires exchange action permissions.
- **Funding Rate Erosion Projections**: Show how funding costs erode margin over time, project when funding alone could push toward liquidation.
- **Multi-Account Aggregation**: Aggregate risk view across multiple wallets on Hyperliquid.
- **Volatility-Adjusted Liquidation Probability**: "Based on 30-day BTC volatility, 12% chance of hitting liq price within 24h." Uses historical vol to estimate probability.

---

## 5. Implementation Notes (Hyperliquid API)

Everything needed is available:
- **WebSocket** `webData2` — real-time position + margin data
- **`clearinghouseState`** — `marginSummary.accountValue`, `crossMaintenanceMarginUsed`, `withdrawable`
- **Per-position** — `liquidationPx`, `marginUsed`, `positionValue`
- **`liquidatable` endpoint** — market-wide liquidatable accounts
- **Existing codebase** — `use-user-positions.ts` normalizes position data including `liquidationPx`; `liqIsNear` in positions tab already computes distance-to-liquidation (used only for styling currently)

### Data Flow

```
WebSocket (webData2) → clearinghouseState
  → compute account health ratio
  → compute per-position distance-to-liq %
  → check against user-configured thresholds
  → trigger alerts (visual / audio / browser notification / webhook)
```

---

## Sources

- [Binance Futures Calculator](https://www.binance.com/en/futures/BTCUSDT_PERPETUAL/calculator)
- [CoinGlass Liquidation Heatmap](https://www.coinglass.com/pro/futures/LiquidationHeatMap)
- [DeFi Saver Automation](https://defisaver.com/features/automation)
- [Instadapp Automated Protection](https://blog.instadapp.io/automated-protection/)
- [HyperTracker](https://hypertracker.io/)
- [CryptoCurrencyAlerting](https://cryptocurrencyalerting.com/guide/liquidation-alerts.html)
- [Hyperliquid Liquidations Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/liquidations)
- [Hyperliquid Margining Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining)
- [Hyperliquid WebSocket Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions)
- [JELLY Exploit (Halborn)](https://www.halborn.com/blog/post/explained-the-hyperliquid-hack-march-2025)
- [Glassnode Liquidation Heatmaps](https://insights.glassnode.com/liquidation-heatmaps/)
