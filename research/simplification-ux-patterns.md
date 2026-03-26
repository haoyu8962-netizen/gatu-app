# UX Patterns for Simplifying Multi-Asset Trading

> **Core insight**: The most successful trading platforms solve complexity through progressive disclosure, not feature removal. The tension between power users (who generate volume) and beginners (who drive growth) is universal — the winners use tiered interfaces or adaptive complexity.

## Proven Patterns from Successful Platforms

### 1. Progressive Disclosure (Robinhood)
**How it works**: Show only what's needed for the current decision
- Main screen: just price + chart
- Tap to reveal: stats, news, analyst ratings
- Never shows order book depth or Level 2 by default
- Default order type: market order; limit orders hidden behind menu
- Uses "Buy" not "Go Long", dollar amounts not token quantities

**Result**: Grew from 500K users (2014) to 13M (2020). Won Apple Design Award.

**Lesson for HL**: A simplified trade panel that defaults to the simplest path (market order, no leverage) and progressively reveals advanced features.

### 2. Consistent Trade Ticket (eToro)
**How it works**: Same UI layout regardless of asset class
- Stocks, crypto, commodities, ETFs, currencies — identical trade ticket
- Same chart, same buy/sell panel, same stats layout
- Risk score: every asset gets a 1-10 colored gauge
- Watchlists freely mix asset classes

**Lesson for HL**: Unify the trade experience across perps, spot, equities, commodities. Don't make users learn different interfaces per asset class.

### 3. Two-Interface Strategy (Interactive Brokers, Binance, Kraken)
**How it works**: Separate apps/modes for different audiences

| Platform | Simple Mode | Pro Mode |
|----------|-------------|----------|
| IBKR | GlobalTrader (mobile) | Trader Workstation |
| Binance | Binance Lite | Binance Pro |
| Kraken | Standard | Pro |
| Bybit | Simple buy/sell | Full terminal |

**Lesson for HL**: The most common solution because serving both audiences with one UI is nearly impossible. A toggle between "Simple" and "Advanced" in HypeTerminal.

### 4. Workspace Composability (Bloomberg, TradingView)
**How it works**: Users build their own layouts
- Bloomberg: drag-and-drop "Launchpad" with custom widgets
- TradingView: multi-chart layouts, custom indicator sets, saved templates
- IBKR Mosaic: drag-and-drop tiles (watchlist, chart, order entry, positions)

**Lesson for HL**: Power users want control over their layout. Let them compose dashboards rather than imposing one layout.

### 5. Intent-Based Actions (Jupiter, 1inch, DeFi Saver)
**How it works**: User expresses what, platform figures out how
- Jupiter: "Swap A to B" — routing, MEV protection, split trades all automated
- 1inch Fusion: no gas token needed, complexity completely hidden
- DeFi Saver: "Maintain 2x leverage" — automatic rebalancing

**Lesson for HL**: "I want to go long ETH with $100" should be a valid input that configures order type, leverage, and margin mode automatically.

### 6. Curated Market Discovery (vs. Flat Lists)
**How it works**: Surface relevant markets rather than listing everything
- Smart sorting by volume/relevance, not alphabetical
- Categories: Trending, Top Volume, New Listings, Favorites
- Limit visible choices to 5-7 "hot" markets per category

**Lesson for HL**: With 100+ markets across crypto, equities, and commodities, flat listing is overwhelming. Curated discovery surfaces what matters.

---

## Cognitive Load Research

### Key Findings
- **Hick's Law**: Response time increases logarithmically with choices. A trading screen with 20 visible actions is measurably slower than one with 7.
- **Miller's Law (7 +/- 2)**: Working memory holds ~7 chunks. Each dashboard "zone" should limit to 5-9 data points.
- **Eye-tracking on trading platforms**: Users primarily fixate on (1) current price, (2) PnL, (3) chart, (4) order entry. Everything else is secondary.
- **Flow state**: Experienced traders enter flow during active trading. Interruptions (pop-ups, layout shifts) break flow and increase errors.
- **Decision fatigue**: High information density causes errors. Users hold 4-7 items in working memory. ([Daytrading.com](https://www.daytrading.com/cognitive-load-decision-fatigue))

### Dual Process Theory (Kahneman)
- **System 1 (fast/intuitive)**: Color-coded PnL, sparkline charts, percentage changes
- **System 2 (slow/analytical)**: Order book analysis, risk calculations, strategy building
- **Implication**: Design default view for System 1. System 2 tools available but not dominant.

---

## Design Principles for HypeTerminal

### Priority 1: Sensible Defaults
- Default to market order
- Default leverage: 1x
- Default margin: isolated
- Each step toward more risk = deliberate user action with clear warning
- Pre-fill quantities based on recent behavior or portfolio percentage

### Priority 2: Contextual Information
- Show margin requirements ONLY when placing leveraged trade
- Show funding rate ONLY for perpetuals
- Show liquidation price ONLY when position is open
- Show trading hours info ONLY for equity/commodity assets

### Priority 3: Visual Hierarchy
- Price and PnL = most prominent (largest, highest contrast)
- Chart = second most prominent
- Order entry = third
- Everything else (volume, OI, funding, order book) = subdued, expandable

### Priority 4: Error Prevention
- Disable submit for invalid orders (don't show errors after)
- Show estimated fill price and slippage before confirmation
- Two-step confirmation for large/unusual orders
- Inline liquidation price calculation in order form

### Priority 5: Reduce Choice Overload
- Curated watchlists by category (not flat list of 100+ markets)
- Smart search across all asset types with clear type badges
- "Recently Traded" and "Favorites" as primary navigation
- Trending/hot markets surfaced automatically

---

## Actionable Pattern Matrix

| Pattern | Description | Effort | Impact |
|---------|-------------|--------|--------|
| Simple/Pro toggle | Two complexity levels in one app | Medium | Very High |
| Unified trade ticket | Same layout for all asset types | Medium | High |
| Sensible defaults | Market order, 1x leverage, isolated | Low | High |
| Curated market lists | Trending, volume-sorted, categorized | Low | High |
| Progressive disclosure | Minimal default, expand on demand | Medium | High |
| Inline risk visualization | Liq price, max loss in order form | Low | High |
| Intent-based order entry | "Long ETH $100" natural language | High | Medium |
| Workspace composability | Custom panel layouts | High | Medium (power users) |
| Color-coded severity | Green/yellow/red risk levels | Low | Medium |
| Smart search | One bar, all assets, type badges | Low | Medium |

---

## Sources
- [Bloomberg: How Robinhood Changed Trading](https://www.bloomberg.com/features/2021-robinhood-stock-trading-design/)
- [Devexperts - Trading Platform UX Design](https://devexperts.com/blog/trading-platform-ux-ui-design-no-nos/)
- [LemonYellow - UX in Trading Platforms](https://lemonyellow.design/blog/fintech/ux-the-secret-sauce-behind-the-success-of-online-trading-platforms/)
- [Daytrading.com - Cognitive Load & Decision Fatigue](https://www.daytrading.com/cognitive-load-decision-fatigue)
- [Finextra - Multi-Asset Platform Architecture](https://www.finextra.com/blogposting/30838/exploring-multi-asset-trading-platforms-structure-markets-and-user-tools)
