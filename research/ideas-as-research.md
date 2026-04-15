# HypeTerminal: Differentiation Brainstorm

A wide-angle survey of what Hyperliquid actually exposes, mapped against gaps from traditional markets — and where HypeTerminal can plant a flag.

---

## 1. The Hyperliquid API surface (raw material)

Before ideating, it's worth cataloging what we have to work with. This is the full toolbox:

**Data (info endpoints + WS subs)**
- Full L2 order book, trades tape, candles (all intervals)
- `webData2` — consolidated user state stream
- `activeAssetCtx` / `activeAssetData` — per-asset funding, OI, premium, impact prices, leverage
- User fills, order updates, funding payments, non-funding ledger, TWAP slice fills
- Vault details (leader PnL, followers, deposits)
- Delegations, validator summaries, staking
- Spot meta + HIP-1/HIP-2 token metadata, HyperEVM bridge events
- `allMids`, `bbo` (top-of-book), notifications

**Execution (exchange endpoints)**
- Limit, market, IOC, ALO, stop, trigger orders
- Native **TWAP** (rare for a perp DEX)
- Batch orders, modify-in-place, scheduled cancel (deadman switch)
- OCO via trigger + working order
- Per-asset cross/isolated, leverage changes on the fly
- **Builder codes** — programmatic fee sharing (our revenue hook)
- Agent wallets (hot-key trading without main key)
- Vaults (be a leader, take deposits, earn performance fees)
- Sub-accounts, multi-sig, referrals
- Spot/perp/vault/sub-account transfers, HyperEVM withdrawals

**HIP-3 / builder-deployed markets**
- Anyone can launch a perp market. The equities perps, commodities perps, forex, and event markets all live here. Asset list keeps expanding.

**What this unlocks that Binance/Bybit/dYdX cannot match**
- On-chain auditable PnL (social trust primitive)
- Permissionless market creation (we can surface markets competitors won't list)
- Vault leader economics built into the protocol
- Deterministic builder-code revenue — we can run *algos-as-a-service* with on-chain billing

---

## 2. Who is the TradFi migrant, really?

Three distinct personas walking in the door. Each wants different things:

**(a) The equities swing trader** — used to TradingView + ThinkorSwim. Cares about charts, earnings plays, sector rotation. Coming because HL lists equity perps 24/7 and they can trade TSLA after hours without paying spreads in Robinhood pre-market.

**(b) The prop/algo quant** — used to FIX, TradeStation, QuantConnect, Rithmic. Cares about latency, backtesting, order types, fill quality, programmatic access. Coming because gas-free, sub-second perps without KYC is a playground.

**(c) The wealth/RIA client** — used to Schwab/Fidelity statements, tax lots, IRAs. Cares about reporting, diversification, peace of mind. Coming because of yield from funding rates and equity exposure without brokerage friction.

Each persona is a separate product wedge. Most crypto terminals optimize for (b) and ignore (a) and (c). That's our opening.

---

## 3. Idea surface, organized by category

### A. Charting & Market Structure
- **Market profile / TPO charts** — virtually nobody in crypto has this; futures traders live by it
- **Volume profile with anchored VWAP** — standard in TradeStation, spotty in crypto
- **Footprint charts** (bid/ask delta per bar) from reconstructing the trades stream
- **Cumulative volume delta + divergence scanner**
- **DOM/ladder trading** ("scalper" view) — TT/Rithmic UX, clickable price ladder with icebergs
- **Heatmap of resting liquidity over time** (Bookmap-style) — reconstruct from L2 snapshots
- **Cross-venue chart overlays** — HL vs Binance vs CME basis, visualized
- **Regime detection overlays** — mark whether market is trending/ranging/vol-expanding

### B. Order types & execution (layered on top of HL primitives)
- **Bracket orders as a first-class object** — entry + stop + target as one cancelable unit
- **OCO chains** — "if target hits, cancel stop; if stop hits, cancel target and open a reversal"
- **Trailing stops with ATR-adjusted distance** (not percent)
- **Iceberg via agent-wallet slicing** — hide large size behind auto-replenishing child orders
- **Pegged orders** — mid-peg, best-bid-peg, joined-primary (synthesized client-side)
- **Time-sliced entries** — "accumulate 100 ETH over the next 2 hours, but pause if price moves 1% against me"
- **Auction orders** — submit only during the first/last minute of each hour (liquidity hunting)
- **Conditional orders cross-asset** — "buy SOL if BTC reclaims 70k AND funding on SOL flips negative"
- **Kill-switch + dead-man** — exploit HL's scheduled-cancel to auto-flatten on connection loss
- **TWAP+** — native TWAP with smart escape: pauses on adverse imbalance, accelerates on favorable

### C. Copy trading & social (vaults + sub-accounts)
- **Vault leaderboard with risk-adjusted metrics** — Sortino, max DD, Kelly fraction, not just PnL%
- **Copy-with-guardrails** — follow a vault but cap per-position risk locally via your own agent wallet
- **Verified live streamers** — broadcast positions in real time to subscribers (Twitch for trading), revenue via builder fees
- **Signal rooms** — paid Discord-like rooms where alphas are pushed as one-tap trade tickets
- **"Mirror with delay"** — follow a trader with a deterministic lag (defensible) to avoid frontrunning controversy
- **Strategy marketplace** — sellers upload a signal feed, buyers auto-execute, revenue shared via builder code

### D. Structured products (synthesized from perps)
- **Delta-neutral funding harvester** — long spot / short perp, auto-rebalanced, returns displayed as APY
- **Variance-capture vault** — systematic straddle replication via gamma scalping on perps
- **Principal-protected notes** — stake USDC yield, deploy yield as perp option-replication bets
- **Dual-asset earn** — "deposit ETH, earn yield, get converted to USDC if ETH > $X on expiry" — replicated via stop+limit on perps
- **Synthetic covered calls** — hold spot, sell upside via perp short above strike, unwind on trigger
- **Barbell vaults** — 90% funding carry + 10% lottery tickets on low-liq HIP-3 markets

### E. Research & discovery
- **Terminal command bar** (Bloomberg-style) — `AAPL <GO>`, `FUT BTC <GO>`, `SCR FUND>0.1% <GO>`
- **Catalyst calendar** integrated with position context — CPI, FOMC, earnings; pre-position templates
- **Earnings plays for equity perps** — historical IV expansion, straddle width calculator
- **Relative value screener** — "show me pairs where 30d correlation > 0.8 but 7d spread is 2σ stretched"
- **Funding rate screen** — sorted, filtered by OI / liq depth; one-click basis trade ticket
- **Unusual activity scanner** — large prints, OI surges, sudden book thinning
- **Sentiment panel** — LLM-parsed news + Twitter/Farcaster/X firehose, tagged to assets
- **Macro correlation dashboard** — DXY, VIX (via proxies), rates, gold; how's your book beta'd?
- **On-chain context for HIP-1/HIP-2 tokens** — launch events, dev activity, holder distribution

### F. Portfolio, risk, reporting (the RIA persona)
- **True P&L attribution** — price vs funding vs fees vs slippage, per symbol, per strategy
- **Tax lot tracking + exportable 8949 / 1099-B** (nobody on-chain does this well)
- **VaR / CVaR calculator** on live positions
- **Stress test UI** — "BTC -20%, ETH -30%, funding doubles — what breaks?"
- **Correlation-aware leverage coach** — warn when your "diversified" book is effectively one beta bet
- **Weekly email statements** — PDF, branded, like a brokerage statement
- **Performance reports** — Sharpe/Sortino/Calmar/max DD with peer benchmarking against vaults
- **Position heatmap** — NAV, risk, funding cost, time-in-trade, all at a glance

### G. Alerts, automation, agents
- **Composable alerts** — `price AND volume AND OI AND time-of-day` with boolean logic
- **Webhook actions** — TradingView alert → HL order, signed by your agent wallet, with safety caps
- **Recipe library** — "If funding > 0.05% for 3 consecutive funding periods, enter basis trade sized to 5% NAV"
- **LLM trading copilot** — natural language ("close half my SOL long if it touches 180"), converts to orders with confirmation
- **Voice trading** — Siri/Apple Watch dictation for close/flat/bracket
- **Agentic risk-sitter** — separate agent wallet with the sole job of flattening if VaR breaches threshold

### H. Mobile-native moments
- **Live Activities** (iOS) — position PnL on lock screen
- **Home-screen widgets** — market, portfolio, funding ticker
- **Watch complications** — one-glance NAV
- **Share-to-chart** — paste a chart into Telegram with levels and your position overlaid
- **Apple/Google Pay funding** (via partners) — one-tap deposit ramps

### I. Institutional / semi-pro
- **FIX gateway** that translates FIX to HL exchange messages
- **Multi-account allocator** — PM enters one order, it splits across sub-accounts by allocation
- **Pre-trade compliance rules** — max notional, restricted list, concentration limits
- **Audit trail export** — MiFID-style record of every order, mod, cancel
- **White-label terminal** — prop shop runs HypeTerminal with their branding; we split builder fees

### J. Event / prediction / novelty markets (HIP-3)
- **Event perp launcher wizard** — anyone with a HIP-3 slot can launch a market; we provide tooling
- **Calendar of upcoming event markets** — election, sports, macro prints — unified view
- **Cross-book arbitrage** — Polymarket vs HL event perps, spread alerts
- **Fantasy-trading leagues** — sub-account per player, leaderboard, prize pot funded by builder fees

### K. Things unique to Hyperliquid's permissionless stack
- **HIP-3 market incubator** — discover, seed liquidity in, and route traders to newly-deployed builder markets before CEXes list them
- **HyperEVM bridge dashboard** — unified view of on-chain positions + DeFi yield + HL perps
- **HLP depositor dashboard** — transparency into HLP's trades and your share of flows
- **Validator/staking analytics** — delegate directly from terminal; yield stacked on trading PnL

### L. Creative / left-field
- **"Trading journal" with video replay** — your screen + charts + orders replayed as a video you can scrub
- **Socratic post-mortem bot** — after each closed trade, LLM asks "what was your thesis, did it play out, what would you do differently?"
- **Beta trading simulator** — play back historical books and trade them with realistic fills (backtesting with microstructure)
- **Shared charts with annotations** — Figma-style collaborative charts; teams of traders mark up levels together
- **"Copy my entire setup"** — export/share workspace layouts like VSCode themes
- **Trading RPG** — XP for volume, streaks, diverse markets; purely cosmetic, but retention is retention
- **Notebook-style research docs** — Jupyter-like cells that pull live HL data, chart it, let you trade from inside the doc

---

## 4. Ten most differentiating bets (ranked by defensibility × pull)

1. **Bloomberg-style command bar + Terminal UX** — no crypto product has nailed this keyboard-first workflow; it's exactly what an equities/futures trader already knows.
2. **Market profile + footprint + DOM ladder** — the three things futures/equities scalpers refuse to trade without, missing from every crypto UI.
3. **Bracket/OCO/OTO as first-class objects** — not just a "stop loss" checkbox. Full conditional graphs with live state.
4. **Tax-aware portfolio layer** — lots, 8949 export, funding classification. Unlocks the wealth persona entirely.
5. **Copy-with-guardrails + vault analytics** — make HL's vault primitive actually usable by retail, with risk caps.
6. **Funding/basis screener + one-click basis vault** — turns HL's biggest edge (deep perp-spot arb) into a consumer product.
7. **LLM trading copilot scoped to YOUR book** — natural-language order entry, position Q&A, post-trade journal. Makes TradFi users feel at home without learning crypto jargon.
8. **Webhook + recipe library** — TradingView-alert → HL order with safety caps. Captures the massive TradingView algo-retail crowd.
9. **HIP-3 market incubator** — we become the discovery layer for permissionless markets. First-mover advantage on event perps, obscure equities, commodities.
10. **White-label terminal for prop shops / creator traders** — builder-code economics let us share revenue with power users who bring their audience.

---

## 5. What's honestly hard or not possible

- **True custody-backed IRAs** — needs a qualified custodian partner; not something we can build alone
- **Live CME/equity data** — licensed feeds cost real money; equity perp prices on HL are a proxy, not the underlying
- **Zero-latency FIX** — HL's chain tick is 200ms; we can't get below that. Positioning: "FIX-compatible" not "HFT"
- **Options** — HL doesn't have them natively; anything options-flavored is a synthetic replication with basis risk
- **Regulatory wrappers (US RIA)** — legal/compliance moat, years of work; partner path only

---

## 6. Suggested north star

**Position HypeTerminal as "the professional's terminal for 24/7 markets"** — the terminal a Goldman ex-trader would open on their personal account. Win persona (a) with charting, persona (b) with execution/algos, persona (c) with portfolio/tax tooling. The three layers compound: serious traders stream signals → retail copies via vaults → wealth clients get exposure via structured products. Every layer feeds builder fees back to us.

The wedge against CEX terminals isn't speed — it's **transparency + permissionless breadth + professional tooling on-chain**. Nothing stopping us.

---

Codex will review your output once you are done.
