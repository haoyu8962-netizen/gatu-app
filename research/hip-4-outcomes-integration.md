# HIP-4 Outcomes Trading Integration

## Overview

HIP-4 introduces **Event Perpetuals / Outcome Contracts** to Hyperliquid — fully collateralized contracts settling within a fixed range (0 to 1). Proposed September 2025 by John Wang (Kalshi head of crypto), Framework Ventures, Felix Protocol, and Asula Labs. Currently live on testnet (March 10, 2026), mainnet expected within 2026.

Contracts trade 0.001–0.999 during active trading and settle to exactly 0 or 1. Price = implied probability. No leverage (1x isolated only), no liquidations, no funding rate. Settlement in USDH.

---

## Contract Mechanics

### Structure
- **Binary settlement**: 0 (no) or 1 (yes)
- **YES buyer at price P**: risks P, profits (1 − P)
- **NO buyer at price P**: risks (1 − P), profits P
- **Fully collateralized**: max loss = initial investment
- **Unified margin**: positions offset perps/spot in the same account

### Market Lifecycle
1. **Deployment**: Builder stakes 1,000,000 HYPE (slashable)
2. **Opening auction**: ~15min single-price clearing
3. **Continuous trading**: Standard CLOB, price-time priority
4. **Settlement**: Oracle posts 0 or 1, positions auto-settle

### Slot Recycling
Single 1M HYPE stake supports rolling series of markets — resolved markets recycle slots for new events (earnings, economic data, elections).

### Why Not HIP-3?
HIP-3 builder perps have 1% per-tick limit + continuous oracle + funding. Settling from 0.5→0 would take ~50 minutes. HIP-4 eliminates all of this with instant binary settlement.

---

## How Traders Will Want to Trade Outcomes

### 1. Directional Event Betting
**The basic use case.** Trader has a conviction on a binary outcome (BTC above $X by date Y, election result, Fed rate decision) and buys YES or NO.

- **What they need**: Fast market discovery, clear probability display, instant order placement, position tracking with P&L in both dollar and probability terms.
- **Key insight**: Most prediction market users are NOT experienced derivatives traders. The interface must translate between "I think this will happen" and "buy YES at 0.65."

### 2. Probability Arbitrage
**Cross-venue arb** between Hyperliquid outcomes, Polymarket, and Kalshi. Same events priced differently across platforms.

- **What they need**: Side-by-side probability comparison across platforms, real-time spread monitoring, one-click execution when arb appears, historical spread charts.
- **Manual workflow today**: Open 3 tabs, compare prices mentally, switch between platforms to execute. Slow, error-prone, spreads close before execution completes.

### 3. Portfolio Hedging via Unified Margin
**The killer feature.** Long ETH perps + buy "ETH below $X" outcome = natural hedge, both in same margin account, cross-margined.

- **What they need**: Suggested hedges based on existing perp positions, combined risk view showing net exposure, margin efficiency calculator showing capital freed by hedging.
- **Manual workflow today**: Calculate hedge ratio manually, place separate orders on the outcomes book, no integrated view of combined risk.

### 4. Event-Driven Perp Trading
Trade perps around events with outcome contracts as insurance. Long BTC perp into FOMC + buy "rate hike" YES as downside protection.

- **What they need**: Event calendar tied to available outcome markets, paired trade builder (perp + outcome), scenario analysis showing P&L across outcome branches.
- **Manual workflow today**: Check economic calendar externally, mentally map which outcomes relate to which perp positions, no scenario modeling.

### 5. Series/Recurring Market Trading
Earnings, economic releases, recurring price targets (daily/weekly BTC targets). The slot recycling mechanism enables this natively.

- **What they need**: Series view showing historical accuracy of market pricing, track record of specific markets, alert when new market in a series opens, auto-roll positions to next expiry.
- **Manual workflow today**: Manually track when new markets deploy, no historical context from prior series entries.

### 6. Market Making on Outcome Books
Providing liquidity on outcome order books. Thin books = wide spreads = opportunity.

- **What they need**: Two-sided quoting tools, inventory risk monitoring, auto-hedge with correlated perps, spread P&L tracking.
- **Manual workflow today**: Manual limit orders on both sides, no automated rebalancing, manually monitor exposure.

### 7. Multi-Outcome Correlation Trading
When multiple outcome markets exist on related events — e.g., "BTC above 100K" and "ETH above 5K" — trade the correlation.

- **What they need**: Correlation matrix between outcome markets, pair trade builder for outcomes, spread charts between related markets.

---

## Manual Workflows Today (Pain Points)

| Workflow | Current Pain | Severity |
|----------|-------------|----------|
| Market discovery | No aggregated view, must browse testnet manually | High |
| Probability comparison | Mental math across platforms/tabs | High |
| Position sizing | Manual calculation of max loss, no probability-weighted sizing | Medium |
| Hedging with perps | No integrated view, separate order flows | Critical |
| Tracking P&L | No probability-denominated P&L, just USD | Medium |
| Event calendar | External sources, no link to available markets | High |
| Series tracking | No historical view of recurring markets | Medium |
| Settlement monitoring | Must manually check oracle status | Low |
| Risk aggregation | Outcomes and perps show as unrelated positions | Critical |

---

## Feature Ideas for HypeTerminal

### Tier 1: Core Trading Experience

#### Outcome Market Browser
- Filterable grid: category (crypto, macro, politics, sports), expiry, volume, open interest
- Each market shows: current YES/NO price, 24h volume, time to expiry, order book depth
- Quick-trade buttons directly from the browser (buy YES / buy NO at market)
- Probability chart (price history as %) with key events annotated

#### Outcome Trading Panel
- Integrated into the existing trade layout alongside perps/spot
- Order entry with probability-first UX: slider from 0–100% maps to price
- "I think YES" / "I think NO" buttons that auto-set the correct side
- Max profit / max loss displayed before order confirmation
- Support limit, market, and conditional orders (e.g., "buy YES if price drops below 0.40")

#### Unified Position View
- Single table showing all positions: perps, spot, AND outcomes
- Outcomes display: market name, side (YES/NO), avg price, current price, P&L, time to expiry
- Net exposure calculation across correlated positions (e.g., long ETH perp + short ETH outcome)
- Margin efficiency indicator showing how outcome positions offset perp margin requirements

### Tier 2: Advanced Tools

#### Event Calendar + Market Mapper
- Calendar showing upcoming events with linked outcome markets
- Economic releases (CPI, FOMC, NFP), crypto events (unlocks, upgrades), earnings
- One-click navigation from event to its outcome market
- Countdown timers and notification alerts before market close/settlement

#### Hedge Builder
- Select existing perp position → suggested outcome hedges
- Scenario table: "If event YES → combined P&L is X. If event NO → combined P&L is Y."
- Optimal hedge ratio calculator based on position size and probability
- One-click execution of hedge pair (perp adjustment + outcome order)

#### Cross-Platform Probability Monitor
- Side-by-side comparison: Hyperliquid vs Polymarket vs Kalshi for same events
- Real-time spread tracking with alerts when arb exceeds threshold
- Historical convergence charts (how quickly do prices align across platforms?)
- Note: requires external API integrations (Polymarket GraphQL, Kalshi API)

#### Series Analytics
- For recurring markets (daily/weekly BTC price targets, recurring earnings)
- Historical accuracy: how often did the market price correctly predict the outcome?
- Calibration chart: for all markets priced at X%, what % actually resolved YES?
- Brier score tracking for the platform and for individual traders

### Tier 3: Power User / Institutional

#### Outcome Strategy Builder
- Pre-built strategies: "earnings straddle" (buy YES + NO at different strikes if multi-outcome)
- Custom combo builder: combine multiple outcomes + perps into a named strategy
- Back-test against historical outcome data once enough history exists
- P&L simulation across probability scenarios

#### Market Making Dashboard
- Two-sided quote management for outcome books
- Inventory tracker with exposure limits
- Auto-hedge toggle: when outcome inventory exceeds threshold, auto-place offsetting perp order
- Spread P&L attribution: how much came from spread capture vs directional movement?

#### Portfolio Risk Aggregator
- VaR/CVaR that includes outcome positions
- Stress test: "What happens to my portfolio if all outcome positions settle adversely?"
- Correlation-aware margin optimizer: suggest position adjustments to minimize margin usage
- Export risk reports for institutional compliance

#### API/Programmatic Access
- Outcome-specific WebSocket feeds: probability changes, settlement events, new market deployments
- Strategy execution API: place paired orders (perp + outcome) atomically
- Settlement webhook notifications
- Historical outcome data API for backtesting

---

## Technical Integration Notes

### API Shape (from testnet)
```
POST https://api.hyperliquid-testnet.xyz/info
{ "type": "outcomeMeta" }
```

Response:
```json
{
  "outcomes": [{
    "outcome": 123,
    "name": "Recurring",
    "description": "class:priceBinary|underlying:HYPE|expiry:20260310-1100|targetPrice:34.5|period:3m",
    "sideSpecs": [
      { "name": "Yes" },
      { "name": "No" }
    ]
  }]
}
```

- Outcomes share infrastructure with spot trading but have distinct metadata
- Each outcome side = different token
- Asset derived from outcome ID + binary side
- Trading endpoints reuse existing order/fill infrastructure
- Market types seen: `class:priceBinary` with encoded underlying, expiry, target price, period

### Codebase Status
- **No existing outcomes code** in HypeTerminal
- SDK (`hl-react`, `hl-sdk`) does not yet export outcome types
- Will need new domain module: `src/domain/outcome/` for parsing outcome descriptions, formatting probabilities, computing payoffs
- New store: `src/stores/outcome-store.ts` for selected markets, watchlists, alerts
- New route: `src/routes/outcomes.tsx` or integrate into existing market layout with category filter

### Data Model Considerations
- Parse `description` field to extract: class, underlying, expiry, targetPrice, period
- Normalize across market types as more classes launch beyond `priceBinary`
- Probability display: always show as percentage (65.3%) not raw price (0.653)
- P&L display: show both USD P&L and "probability points" gained/lost

---

## Competitive Positioning

| Platform | Strength | HypeTerminal Opportunity |
|----------|----------|-------------------------|
| Polymarket | Social/viral UX, broad markets | Professional trading tools, unified margin |
| Kalshi | Regulatory legitimacy, US access | Speed, composability with perps, DeFi-native |
| dYdX | Perps depth | First-mover on integrated outcomes+perps UX |
| Drift (Solana) | BET product exists | Superior execution (HyperCore throughput) |

**HypeTerminal's unique angle**: The only terminal where outcomes and perps live in the same margin account. This enables hedging workflows that are literally impossible on standalone prediction market platforms. Lead with the unified margin story.

---

## Implementation Priority

1. **Outcome market browser + basic trading** — ship when mainnet launches, be day-1 ready
2. **Unified position view** — the differentiator, show outcomes alongside perps immediately
3. **Event calendar** — high value, relatively low effort, drives engagement
4. **Hedge builder** — the "why use HypeTerminal for outcomes" feature
5. **Cross-platform monitor** — nice-to-have, depends on external API stability
6. **Series analytics** — needs historical data, ship after sufficient market history
7. **Market making tools** — niche but high-value for liquidity providers
8. **Strategy builder** — power user feature, ship last

---

## Open Questions

- Will the SDK expose outcome types before mainnet, or do we need to build raw API integration first?
- How will multi-outcome markets (not just binary) be structured? The current testnet only shows binary.
- Will there be a dedicated WebSocket channel for outcome price updates, or reuse the existing spot/perps feed?
- Settlement notification mechanism — push or poll?
- Rate limits on `outcomeMeta` endpoint? Caching strategy?
- Will builders be able to set custom fee structures that we need to display?
- How to handle the opening auction phase in the UI (different order type, clearing price display)?
