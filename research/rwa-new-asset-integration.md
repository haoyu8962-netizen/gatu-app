# RWA Expansion on Hyperliquid — New Asset Integration Roadmap for HypeTerminal

## Context

Hyperliquid's HIP-3 framework (mainnet Oct 2025) unlocked permissionless perpetual markets for any asset class. By March 2026, RWA/tokenized assets account for **33% of weekly volume** and **21% of open interest**, with $1.2B+ OI on RWA and commodity contracts alone. Nearly 50,000 users' first on-chain trade was a stock index or crude oil contract — not crypto.

Key builders: **Trade[XYZ]** ($100B+ cumulative volume), **Felix Protocol** (TSLA via HyperStone), **Dreamcash** (Tether-backed, USDT collateral).

S&P Dow Jones Indices officially licensed the S&P 500 to Trade[XYZ] for perpetual contracts on Hyperliquid (March 18, 2026) — a landmark TradFi/DeFi convergence event.

---

## Available RWA Asset Classes

| Category | Assets | Builder | Leverage |
|----------|--------|---------|----------|
| **Equities** | TSLA, NVDA, AAPL, MSFT, META, AMZN, GOOGL, NFLX, AMD, COIN, PLTR, HOOD, SPACEX (pre-IPO) | xyz, Felix, Dreamcash | Up to 10x |
| **Indices** | XYZ100 (Nasdaq tracker), S&P 500 (licensed) | xyz | Up to 10x |
| **Commodities** | Gold (XAU), Silver (XAG), WTI Crude (CL), Brent Crude (BRENTOIL) | xyz, Dreamcash | Up to 10x |
| **Forex** | EUR/USD, USD/JPY (framework supports, emerging) | Various | TBD |
| **Tokenized Gold** | PAXG | Native dex | 10x |

All structured as **perpetual futures settled in USDC** (or USDT via Dreamcash). No spot tokens — purely synthetic derivatives tracking external oracle feeds.

---

## Manual Trading Workflows — What's Different for RWA

### Trading Hours

RWA perps trade **24/7** on Hyperliquid, including when underlying traditional markets are closed. This is a core differentiator — traders react to weekend geopolitical events in real time ($1.4B weekend volume driven by Iran oil situation, March 2026).

### Oracle Behavior

| Aspect | Native Crypto Perps | Builder RWA Perps |
|--------|---------------------|-------------------|
| Oracle source | Weighted median of Binance, OKX, Bybit, Kraken, etc. (3s update) | RedStone HyperStone (3ms updates, 1,300+ assets, 50+ sources) |
| After-hours | N/A | Hyperps mode: 8h EMA of mark prices replaces external oracle |
| Weekend gaps | N/A | Price reflects expected movement; may gap on Monday open |

### Fee Structure

Builder perps charge **2x standard fees**, split 50/50 between builder and protocol. This is baked into the Hyperliquid protocol — HypeTerminal doesn't need to handle fee differences, but should **display effective fee rates** for user awareness.

### Funding Rates

Same hourly formula (1/8 of 8h rate, premium index vs oracle), but:
- **Hyperps variant** used by some RWA markets: funding derived from 8h EMA of mark prices instead of external oracle, enabling true 24/7 operation without oracle dependency during market closures
- Funding capped at 4% per hour maximum

### Margin & Liquidation

- Cross-margined in USDC (same as crypto perps)
- Lower max leverage (typically 10x vs 40x for BTC)
- Liquidation mechanics identical across native and builder perps
- Portfolio margin available

---

## HypeTerminal Current Architecture Readiness

### What Already Works

HypeTerminal's builder perp infrastructure is solid:

- **Asset ID encoding** (`src/lib/hyperliquid/asset-id.ts`): `100000 + dexIndex * 10000 + assetIndex` — already handles builder perps including RWA
- **Market kinds**: `"perp" | "spot" | "builderPerp"` — RWA assets are `builderPerp` kind, no new type needed
- **Routes**: `/builders-perp/$dex` already routes to per-DEX views (e.g., `/builders-perp/xyz`)
- **Order system**: `OrderIntent` → `ExchangeOrder[]` pipeline is asset-agnostic
- **Live data**: `useSubAllDexsAssetCtxs` subscribes to all builder dex contexts including RWA
- **Display**: Market overview shows mark price, oracle, OI, volume, funding for builder perps

### Gaps to Address

| Gap | Current State | Needed |
|-----|---------------|--------|
| **Market categories** | Token categories are crypto-only (DeFi, Layer1, Meme) | Add Equities, Indices, Commodities, Forex categories |
| **Asset icons** | `TOKEN_ICON_BASE_URL` assumes Hyperliquid token images | Stock ticker logos, commodity icons, index logos |
| **Display names** | Crypto naming conventions (BTC-USD, ETH-USDC) | Stock-style display (TSLA, NVDA, S&P 500) |
| **Market hours indicator** | None | Show underlying market open/closed status |
| **Fee transparency** | Standard fee display | Show 2x builder fee split, effective rates |
| **Asset metadata** | Minimal — name, decimals | Sector, exchange, market cap, earnings dates |
| **Leverage defaults** | Crypto-centric defaults | Lower defaults for RWA (5x vs 20x) |
| **Price formatting** | Crypto decimal conventions | Stock-style formatting ($XXX.XX), commodity conventions |

---

## Integration Roadmap

### Phase 1: RWA Discovery & Display

Surface existing RWA builder perps with proper categorization.

**Tasks:**
- Extend token category system in `src/domain/market/tokens.tsx` with RWA categories (Equities, Indices, Commodities, Forex)
- Auto-classify builder perp markets by name pattern matching (`TSLA`, `NVDA` → Equities, `XAU`, `XAG` → Commodities, `XYZ100`, `SPX` → Indices)
- Add RWA-appropriate icons (stock ticker logos from public CDNs, commodity/index icons)
- Format prices in domain-appropriate style (equities: $XXX.XX, commodities: $X,XXX.XX, forex: X.XXXXX)
- Add `ExchangeScope` entry or filter for RWA-only view (consider `/rwa` route or filter within `/builders-perp`)

### Phase 2: Market Hours & Context

Give traders awareness of underlying market state.

**Tasks:**
- Build market hours service mapping RWA assets to their underlying exchange schedules (NYSE, NASDAQ, CME, COMEX, FOREX)
- Display market open/closed badge on RWA assets (visual indicator in market selector and overview)
- Show time until next market open/close
- Add "after-hours" and "weekend" labels with tooltip explaining oracle behavior during closures
- Display effective funding rate mode (standard oracle vs hyperps EMA) per market

### Phase 3: RWA-Optimized Trading UX

Adapt the trading experience for traditional asset traders.

**Tasks:**
- Default leverage presets for RWA categories (e.g., 5x for equities, 3x for indices)
- Show builder fee breakdown in trade confirmation (2x fee, builder/protocol split)
- Add traditional market data points where available (52-week range, market cap, P/E for equities)
- Support USDT collateral display for Dreamcash markets
- Add earnings calendar / economic events overlay for equities (external data)
- Weekend/after-hours spread warning (spreads tend to widen when underlying is closed)

### Phase 4: Cross-Asset Portfolio View

Unified view across crypto and RWA positions.

**Tasks:**
- Portfolio breakdown by asset class (Crypto Perps, RWA Equities, RWA Commodities, Spot)
- Cross-asset correlation display (e.g., BTC vs TSLA, ETH vs NVDA)
- Combined PnL with asset-class attribution
- Margin utilization across crypto + RWA positions
- Risk exposure heatmap by asset class and geography

### Phase 5: RWA-Specific Strategies

Advanced workflows unique to RWA on-chain.

**Tasks:**
- Pairs trading: crypto vs equity (long BTC / short TSLA ratio)
- Weekend hedging: auto-hedge crypto positions with commodity perps
- Macro event trading: templated orders around FOMC, NFP, earnings
- Basis tracking between on-chain RWA perps and underlying traditional market prices
- Multi-builder comparison: same asset across different builders (xyz:TSLA vs felix:TSLA) — price, spread, OI, fees

---

## Key Builder Perp DEXes to Prioritize

| Builder | Assets | Differentiator | Priority |
|---------|--------|----------------|----------|
| **Trade[XYZ]** | XYZ100, S&P 500, TSLA, NVDA, XAU, XAG, CL | Largest volume, S&P license, first mover | P0 |
| **Felix Protocol** | TSLA | HyperStone oracle integration | P1 |
| **Dreamcash** | TSLA, Gold, S&P 500 | USDT collateral (Tether-backed) | P1 |

---

## Technical Notes

### Asset Classification Heuristic

Since HIP-3 markets don't have built-in category metadata, classification must be inferred:

```
Equities: match against known stock ticker list (TSLA, NVDA, AAPL, ...)
Indices: match against index names (XYZ100, SPX, NDX, ...)
Commodities: match against commodity tickers (XAU, XAG, CL, BRENTOIL, USOIL, ...)
Forex: match against currency pair patterns (EUR/USD, USD/JPY, ...)
Fallback: treat as crypto builder perp
```

Maintain a curated mapping in `src/domain/market/rwa-classification.ts` that maps builder perp names to RWA categories. Update as new assets launch.

### Oracle Modes

Two oracle modes exist for builder perps:
1. **Standard**: External oracle (RedStone HyperStone) — price updates continuously from real-world feeds
2. **Hyperps**: No external oracle dependency — funding rate uses 8h EMA of mark prices. Used by some RWA markets for true 24/7 operation

HypeTerminal should detect which mode a market uses and display accordingly (affects how "oracle price" is interpreted in market overview).

### Price Decimals

RWA assets have different precision requirements:
- Equities: 2 decimal places ($XXX.XX)
- Commodities (gold): 2 decimal places ($X,XXX.XX)
- Commodities (oil): 2 decimal places ($XX.XX)
- Forex: 4-5 decimal places (X.XXXXX)
- Indices: 2 decimal places (X,XXX.XX)

This is already handled by the `szDecimals` / `pxDecimals` fields in market metadata from the API — no special casing needed beyond display formatting.

---

## Market Opportunity

- RWA perps grew from 0% to 33% of Hyperliquid volume in 5 months
- 50,000 users entered crypto via RWA perps (new user acquisition channel)
- Weekend trading is a unique on-chain advantage — $1.4B single weekend
- S&P 500 licensing signals institutional legitimacy
- RedStone HyperStone covers 1,300+ assets — supply of tradeable RWAs will keep expanding

HypeTerminal's existing builder perp infrastructure means RWA assets already work. The opportunity is making them **discoverable, contextual, and optimized** for traders who think in traditional market terms rather than crypto-native conventions.
