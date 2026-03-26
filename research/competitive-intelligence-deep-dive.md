# Competitive Intelligence & Market Validation

> **Key finding**: The frontend war is validated with $40M+ in builder revenue. The next battleground is multi-asset tooling, privacy, and risk management. VCs are already funding competitors.

## User Segmentation (Validated by Data)

### Power Users / Whales
- Top 100 addresses = **81.3% of all volume** ($3.34T out of $4.11T)
- Primary pain: **privacy** — "discomfort after on-chain trading wallets were identified"
- Losing trades become public, enabling front-running and MEV extraction
- **Silhouette raised $3M pre-seed** to build dark pool trading on HL
- **Aster launched hidden orders** specifically to exploit this weakness
- Need: portfolio margin, advanced order types, API access, sub-account management

### Casual / Retail Users
- ~10% use Privy embedded wallets (email login)
- Need: simple interfaces, one-click trading, mobile-first
- **Based super app proves this**: 100K users, $40B volume in 8 months with email onboarding
- Conversion path: Robinhood-style simplicity → progressive complexity unlock

### TradFi Crossover (Emerging Segment)
- Driven by HIP-3 tokenized stocks/commodities ($1.43B OI)
- Seeking: familiar TradFi-style charts, cross-asset correlation, traditional portfolio views
- **Currently unserved** — no frontend targets this segment specifically
- Expect: sector analysis, benchmark comparison, traditional risk metrics

---

## Funded Competitors & What They're Building

| Company | Funding | What They're Building | Threat Level |
|---------|---------|----------------------|--------------|
| **Liquid** | $7.6M (Paradigm-led, ex-Two Sigma founder) | Multi-DEX aggregation terminal, institutional-grade | High |
| **Based** | Undisclosed | Super app: trading + prediction markets + Visa card | High |
| **Silhouette** | $3M pre-seed | Dark pool / privacy trading on HL | Medium (niche) |
| **Phantom** | Existing wallet | Integrated HL trading via builder codes | Medium |
| **pvp.trade** | Bootstrap ($7.2M revenue) | Social/competitive trading | Medium |

### Key Takeaway
- **Liquid** is the most dangerous — backed by Paradigm with a Two Sigma pedigree, building the institutional terminal
- **Based** owns the casual/retail segment with email onboarding
- **Nobody owns the multi-asset intelligence segment** — this is whitespace

---

## Revenue Benchmarks (What Builders Actually Earn)

| Builder | Revenue | Volume | Timeframe |
|---------|---------|--------|-----------|
| Based | ~$14M | $40B | 8 months |
| Phantom | $100K/day (~$36M/yr) | — | Ongoing |
| pvp.trade | $7.2M | — | Lifetime |
| Top 3 combined | $31M+ | — | — |
| All builders | $40M+ | — | Cumulative |

### Revenue Model Validation
- Builder codes: 0.1% on perps, 1% on spot
- At $8.3B daily HL volume:
  - 1% market share = $83M daily volume = $83K/day on perps
  - 5% market share = $415M daily volume = $415K/day on perps
- Premium subscriptions can stack on top (Liquid model)
- Vault profit share: 10% of vault gains
- Copy trading: 10-30% performance fees

---

## Simplification Layer Precedents

### Zapper → DeFi Dashboard
- Aggregated holdings from dozens of chains into one view
- Auto-categorized assets, real-time net worth
- Best prices across 20+ sources
- **Lesson**: Aggregation + simplicity wins adoption

### InstaDapp → Fluid
- Started as DeFi middleware (automate refinancing, leverage, collateral)
- Rebranded to Fluid, became unified liquidity infrastructure
- By Sep 2025: **$1.8B TVL, $24B DEX volume in 30 days**
- **Lesson**: Start by abstracting complexity → build user base → evolve into infrastructure

### Pattern
1. Abstract complexity with better UX
2. Build user base through simplification
3. Evolve into infrastructure
4. Revenue from routing fees + premium features

---

## What Traders Say They'd Pay For (Ranked by Signal Strength)

### 1. Privacy / Dark Pool Access (Strongest Signal)
- Silhouette ($3M raised), Aster (hidden orders), whale complaints
- **#1 unsolved problem** for large traders on HL
- Willingness to pay: premium fee tiers for hidden orders

### 2. Advanced Risk Management (Strong Signal)
- Portfolio margin tools, cross-asset risk dashboards
- Liquidation alerts, correlation analysis
- Institutional traders expect this as table stakes
- Willingness to pay: subscription ($50-200/mo institutional)

### 3. Copy Trading (Proven Demand)
- ApexLiquid, Mizar, open-source bots all serving this
- HL's on-chain transparency makes all positions visible
- **Differentiators needed**: smart position sizing, risk-adjusted filtering (Sharpe, max drawdown), multi-trader portfolio
- Revenue: 10-30% performance fees + builder code revenue

### 4. Aggregated Multi-DEX Terminal (VC-Validated)
- Liquid's $7.6M raise proves VCs believe in this
- Manages positions, risk, yield across multiple perp DEXs
- Revenue: builder codes across multiple protocols

### 5. Automated Strategies / Vaults
- HLP vault: $380M TVL rebuilt
- Liminal: automated delta-neutral yield
- Hyperbeat: liquid staking + earn vaults + lending
- Revenue: 10% vault profit share

---

## The Mobile Gap

### Current State
- No native mobile app from Hyperliquid
- "Complexity doesn't translate to the small screen"
- HL acknowledged "many users frustrated with flaky third-party mobile wallets"
- QR code scanning introduced as a bridge

### Existing Mobile Attempts
| App | Platform | Focus |
|-----|----------|-------|
| Based | Mobile-first web | Full trading |
| Stack | Android | Trading |
| Dexly | Android | Trading |
| HL Tracker & Alerts | iOS | Monitoring only |

### The Real Opportunity
Mobile ≠ desktop-on-small-screen. It's a fundamentally different experience:
- **Push notification alerts** (liquidation proximity, price targets)
- **One-tap position management** (quick close, panic button)
- **Watch-only portfolio mode** (glance at PnL without trading)
- **Price alerts with context** ("your position is 5% from liquidation" not just "BTC hit $X")
- 80/20: what traders actually need on phones vs what they need on desktop

---

## Hyperliquid Platform Revenue & Economics

- **$1.1B** in protocol revenue in 2025 (4th highest in all crypto)
- **97% returned to users** → near-zero budget for development/marketing
- This constraint is HypeTerminal's advantage: HL can't build everything themselves
- Builder ecosystem must fill the gaps

### DEX Perps Market Growth
- Volume increased **8x**: $81.7B → $739.5B
- DEXs expanded from **2.0% to 10.2%** of all perps volume
- Hyperliquid daily volume: **$22B** (dominant share)

---

## Sources
- [Blockworks - Frontend Wars](https://blockworks.com/news/hyperliquid-the-frontend-wars)
- [Paradigm Leads $7.6M for Liquid - The Block](https://www.theblock.co/post/377341/paradigm-leads-funding-perp-dex-aggregator-liquid)
- [Silhouette Raises $3M - DL News](https://www.dlnews.com/external/silhouette-raises-3-million-for-first-shield-exchange-on-hyperliquid/)
- [Privy - Based Super-App Case Study](https://privy.io/blog/building-the-hyperliquid-trading-super-app-with-based)
- [Aster Hidden Orders - Value The Markets](https://www.valuethemarkets.com/cryptocurrency/news/aster-launches-mainnet-to-enhance-privacy-in-defi-trading)
- [CoinGecko - CEX & DEX Trading Report 2026](https://www.coingecko.com/research/publications/cex-dex-trading-activity-report-2026)
- [Mirana Ventures - Arise Hyperliquid](https://www.mirana.xyz/research/arise-hyperliquid)
- [CoinDesk - Weekend Warriors](https://www.coindesk.com/business/2026/03/02/weekend-warriors-how-hyperliquid-became-retail-s-bear-market-playground)
- [Impossible Finance - Silhouette](https://blog.impossible.finance/hyperliquid-product-market-fit-is-collapsing-and-silhouette-is-here-to-save-hyperliquid/)
