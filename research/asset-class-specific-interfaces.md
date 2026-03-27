# Asset-Class-Specific Interfaces: What Each Trader Type Needs

> **Core finding**: Each asset class requires fundamentally different information architecture. They're not just "different tickers in the same layout." Every major professional platform (IBKR, thinkorswim, MetaTrader, Bloomberg) uses asset-specific workspaces.

## The Three Interface Modules HypeTerminal Needs

### 1. Crypto Perpetuals Interface

**Primary Data (always visible)**:
- Mark price vs spot price differential
- Funding rate (with countdown to next payment)
- Unrealized PnL
- Liquidation price
- Leverage multiplier

**Secondary Data (expandable)**:
- Open Interest trends
- Long-short ratio
- Liquidation heatmap / cascade levels
- Funding rate history chart
- Order book depth

**Unique to Crypto**:
- 24/7 — no market hours indicator needed
- Funding payments every 8 hours (needs countdown timer)
- Wallet integration and on-chain settlement
- No fundamentals — technical analysis dominant

**Chart Defaults**:
- Candlestick chart
- RSI, MACD, Bollinger Bands
- Volume profile
- Liquidation levels overlay

---

### 2. Commodity Interface (Gold, Silver, Oil)

**Primary Data (always visible)**:
- Live price (bid/ask spread)
- Daily change + % change
- 24h volume on Hyperliquid
- Traditional market status (CME open/closed indicator)

**Secondary Data (expandable)**:
- Supply/demand fundamentals panel
  - Oil: inventory levels, OPEC decisions, refinery capacity
  - Gold/Silver: central bank buying, USD strength, inflation expectations
- Geopolitical news feed (filtered for commodity impact)
- Seasonal pattern chart
- Commitment of Traders (COT) sentiment
- Spread analysis (WTI vs Brent, gold/silver ratio)

**Unique to Commodities**:
- **Traditional market hours indicator** — "CME CLOSED — you're trading when TradFi can't"
- **Geopolitical context** is critical (Iran, OPEC, weather events)
- **Weekend premium** — price can diverge from traditional when CME is closed
- Fundamental analysis > technical analysis for many commodity traders
- Contract specifications (100 oz gold, 5000 oz silver)

**Chart Defaults**:
- Candlestick with volume
- Moving averages (50, 200 day)
- Support/resistance levels
- Correlation overlay with USD index (DXY)

**Commodity-Specific Widgets**:
- Gold/Silver ratio tracker
- Oil inventory levels (EIA data)
- Economic calendar (CPI, FOMC, jobs data)
- USD strength index

---

### 3. Equity Interface (AAPL, TSLA, SPY, S&P 500)

**Primary Data (always visible)**:
- Live price
- Daily change + % change
- Traditional market status (NYSE/NASDAQ open/closed)
- Volume

**Secondary Data (expandable)**:
- Company fundamentals panel
  - Market cap, P/E ratio, EPS
  - Next earnings date
  - Revenue/earnings trends
- Sector performance heatmap
- Related stocks / sector peers
- News feed (company-specific + sector)

**Unique to Equities**:
- **"This is a perpetual futures contract, not stock ownership"** — disclaimer always visible
- **Earnings calendar** — critical event dates
- **Market hours context** — "Trading AAPL while NYSE is closed"
- **Sector rotation** — where money is flowing
- Fundamental analysis matters more than crypto
- After-hours / pre-market price context from traditional markets

**Chart Defaults**:
- Candlestick
- Volume
- Moving averages
- Relative Strength vs S&P 500

**Equity-Specific Widgets**:
- Earnings countdown
- Sector heatmap
- Related stocks performance
- Traditional market price comparison

---

## How Professional Platforms Do This

### Interactive Brokers (20+ Pre-configured Layouts)
- **Options Layout**: OptionTrader for single/complex orders
- **Futures Layout**: SpreadTrader for calendar spreads, butterflies
- **Stock Layout**: Level I/II data, real-time charts, order management
- **Forex Layout**: FXTrader with popular currency pairs
- Quick toggle via tabs at bottom of app

### thinkorswim (6 Purpose-Built Workspaces)
- **Forex Workspace**: FX Currency Map, 5-day 5-min + 5-year daily charts
- **Options Workspace**: Analyze tab, options profile, strategy builder
- **Stocks Workspace**: Two-section design, 8 subpages
- Different default chart timeframes per workspace

### MetaTrader 5 (Template + Profile System)
- **Templates**: Save chart configs (indicators, timeframes) per instrument
- **Profiles**: Instrument-specific multi-chart arrangements
- **Chart Manager**: Auto-grid layout for selected symbols

### Bloomberg Terminal
- Asset-specific analytic views
- Multi-asset risk models
- Customizable columns per asset class
- Filter by sector, maturity, quality

---

## Implementation: Context-Aware Switching

### Detection Logic
When a user selects a market, detect its asset class and auto-switch:

```
if asset is crypto perp → show crypto layout (funding rate, OI, liquidation)
if asset is commodity → show commodity layout (supply/demand, geopolitical, market hours)
if asset is equity → show equity layout (fundamentals, earnings, sector, market hours)
```

### Persistence
- Save custom layout modifications per asset class
- Remember last-used settings when switching back
- Allow "Save as preset" for custom configurations

### Smooth Transitions
- Animate panel changes when switching asset classes
- Keep chart persistent (just swap indicator defaults)
- Maintain order entry panel position (consistent muscle memory)

---

## Key Design Principles

1. **Same order entry, different context panels** — The buy/sell interface stays identical. The surrounding information changes.
2. **Asset type badge always visible** — Clear "PERP" / "COMMODITY" / "EQUITY" badge next to every symbol
3. **Market hours awareness** — Show when traditional markets are open/closed for commodities and equities
4. **Progressive disclosure within each mode** — Even commodity mode starts simple, expands on demand
5. **No mode switching required** — Auto-detect from the selected market, not a manual toggle

---

## Sources
- [IBKR Layout Library](https://www.interactivebrokers.com/en/trading/tws-workspace-layout-library.php)
- [thinkorswim Workspaces](https://toslc.thinkorswim.com/center/howToTos/thinkManual/Getting-Started/Workspaces)
- [MetaTrader 5 Templates](https://www.metatrader5.com/en/terminal/help/charts_advanced/templates_profiles)
- [McKinsey - Commodity Trading Data](https://www.mckinsey.com/industries/energy-and-materials/our-insights/how-to-capture-the-next-s-curve-in-commodity-trading)
- [Devexperts - Trading Platform UX](https://devexperts.com/blog/ux-ui-design-for-online-trading-platforms/)
- [CME Group - Precious Metals](https://www.cmegroup.com/markets/metals/precious.html)
