# Delta-Neutral & Hedging Strategies on Hyperliquid

Comprehensive research on how traders build delta-neutral positions manually on Hyperliquid, the pain points involved, existing tooling, and Hyperliquid-specific mechanics.

---

## 1. Spot+Perp Basis Trades on Hyperliquid

### How It Works

The core strategy: buy an asset on Hyperliquid's spot market and simultaneously short the same asset on Hyperliquid's perpetual market. The two positions cancel out price exposure (delta = 0), and the trader profits from **funding rate payments** that flow from longs to shorts when funding is positive.

### Manual Workflow

1. **Deposit USDC** to Hyperliquid (via Arbitrum, or native bridges from BTC, ETH, SOL chains)
2. **Buy spot** — purchase the token on Hyperliquid's spot order book
3. **Short perp** — open a short perpetual position of equal notional size
4. **Monitor funding rates** — Hyperliquid pays funding every hour; check that rates remain positive (longs paying shorts)
5. **Rebalance** — as price moves, the spot and perp notional values drift apart; periodically adjust position sizes
6. **Unwind** — close both legs simultaneously when funding turns unfavorable or the trade is done

### Popular Tokens

- **HYPE** — most popular for basis trades due to consistently high funding rates and airdrop farming incentives (40% of HYPE still unairdropped as of mid-2025)
- **BTC, ETH** — deep liquidity, tight spreads, reliable funding
- **SOL** — volatile funding rates create high-yield windows
- **Meme/small-cap tokens** (e.g., ASTER) — extreme funding rates (450%+ annualized) but higher risk

### Capital Allocation

The HL-Delta bot uses a **70/30 split** (70% spot, 30% perp short). The reasoning: the perp side is leveraged, so less capital is needed for the short leg. With 3x leverage on the perp, roughly equal notional exposure is achieved.

### Yield Expectations

- **BTC/ETH basis**: 5-15% APR in normal conditions
- **SOL/mid-cap**: 15-25% APR
- **Meme tokens during hype**: 100-450%+ APR (short-lived, high risk)
- **With 2-3x leverage on perp side**: headline yield approaches 25-30%+

---

## 2. Cross-Exchange Hedging

### Hyperliquid vs CEX (Binance/Bybit/OKX)

Traders exploit **funding rate differentials** between exchanges:

- **Long on Exchange A** (where funding is negative/lower — shorts pay longs)
- **Short on Exchange B** (where funding is positive/higher — longs pay shorts)
- Net delta = 0, profit = funding spread between exchanges

### Common Flows

| Strategy | Long Leg | Short Leg | Typical Spread |
|----------|----------|-----------|----------------|
| Funding arb BTC | Binance perp | Hyperliquid perp | 5-11% APR |
| Funding arb ETH | Binance perp | Hyperliquid perp | 6-11% APR |
| Spot-perp cross | CEX spot | Hyperliquid short | 10-20% APR |
| Perp-perp cross | BitMEX long | Hyperliquid short | ~15-16% APR |

### Real Example: ASTER Arbitrage (2025)

- Whale bought **$7.5M ASTER spot** while opening equal **3x short on Hyperliquid**
- Hyperliquid shorts were being paid ~1000% APR on ASTER
- Bybit longs paying shorts ~547% annualized in the opposite direction
- Delta-neutral capture of the spread = ~450% annualized
- Risk: $1.8M loss reported when the trade unwound poorly

### Real Example: BitMEX-Hyperliquid SOL/AVAX Arb (H1 2025)

- Short BitMEX / Long Hyperliquid delivered ~15.6% annualized on SOL and ~15.7% on AVAX
- With 2-3x leverage: 25-30%+ headline yield while remaining delta-neutral

### Key Mechanical Difference

Hyperliquid funding is **hourly** (1/8 of 8-hour rate). Binance/Bybit/OKX are **8-hourly**. This timing mismatch means:
- Funding convergence happens more frequently on Hyperliquid
- Rate comparisons must normalize intervals (1h vs 8h)
- Arbitrageurs must account for the different payment cadences

---

## 3. Funding Rate Mechanics on Hyperliquid

### Calculation Formula

```
Funding Rate (F) = Average Premium Index (P) + clamp(interest_rate - P, -0.0005, 0.0005)
```

### Components

| Component | Value | Notes |
|-----------|-------|-------|
| Interest rate | 0.01% per 8 hours | = 0.00125%/hour, 11.6% APR. Baseline paid to shorts |
| Premium Index | Variable | Based on perp-spot price difference |
| Premium sampling | Every 5 seconds | Averaged over the hour |
| Payment interval | Every 1 hour | 1/8 of the 8-hour computed rate |
| Cap | 4% per hour | Across all assets |

### Premium Index Calculation

```
premium = impact_price_difference / oracle_price
impact_price_difference = max(impact_bid - oracle, 0) - max(oracle - impact_ask, 0)
```

### Payment Formula

```
funding_payment = position_size * oracle_price * funding_rate
```

**Key detail**: uses **oracle price** (not mark price) for notional value conversion.

### Direction

- **Positive funding** (perp > spot): longs pay shorts — basis trade profits
- **Negative funding** (perp < spot): shorts pay longs — basis trade loses money

### Comparison Tools

- **Hyperliquid native**: app.hyperliquid.xyz/fundingComparison
- **Loris Tools**: 25+ exchange scanner, calculates net profit after fee normalization across 1h/4h/8h intervals
- **Coinalyze**: Free aggregated funding rate charts across exchanges
- **FundingView**: Cross-exchange rate comparison dashboard
- **ASXN Hyperscreener**: Hyperliquid-specific analytics dashboard
- **Blockworks Analytics**: Annualized funding rate historical charts

---

## 4. Pain Points (Manual Delta-Neutral Trading)

### Execution Pain

- **No atomic two-leg execution**: Hyperliquid API supports batch orders, but there is no native "basis trade" order type that atomically opens spot + perp. Traders must fire two separate orders, risking **leg risk** — one fills and the other doesn't, or fills at different prices.
- **Slippage between legs**: In fast markets, the price moves between placing the spot buy and the perp short. On thin order books (meme tokens), this can be significant.
- **Spot and perp are separate order books**: Different liquidity profiles, spreads, and fill rates.

### Monitoring & Rebalancing Pain

- **Delta drift**: As price moves, spot value changes but perp notional (denominated in USDC) stays the same. Positions slowly become unbalanced. Requires periodic rebalancing.
- **Funding rate volatility**: Rates change every hour. A positive rate can go negative quickly in a sell-off. Traders must continuously monitor and decide whether to stay in or unwind.
- **Margin monitoring on perp side**: The short perp can approach liquidation during sharp upward price moves. Must monitor margin ratio and add collateral proactively.
- **Manual rebalancing is tedious**: Check positions, calculate drift, place corrective orders — multiple times daily for active strategies.

### P&L Tracking Pain

- **No unified P&L view**: Hyperliquid shows spot and perp P&L separately. There is no combined "basis trade P&L" that accounts for both legs, funding earned, fees paid, and delta drift.
- **Funding accrual tracking**: Funding payments are embedded in the perp P&L. Hard to isolate how much was earned from funding vs price moves on the perp.
- **Cross-exchange tracking is worse**: When one leg is on Binance and the other on Hyperliquid, tracking combined P&L requires spreadsheets or custom scripts.

### Capital Efficiency Pain

- **Split capital requirement**: Need USDC on both spot side and perp margin. Without portfolio margin, capital is fragmented.
- **Before portfolio margin**: Spot balance and perp margin were separate accounts, requiring manual transfers via `spot_perp_transfer` API.
- **With portfolio margin (new)**: Spot and perp are unified, and spot holdings can collateralize perp shorts. But portfolio margin is still gated (pre-alpha: >$5M all-time volume, $1K USDC borrow cap per user).

### Entry/Exit Pain

- **Unwinding both legs simultaneously**: Same leg risk as entry. Exiting a basis trade in a volatile market risks leaving one leg open.
- **Slippage on exit during market stress**: When everyone unwinds basis trades simultaneously (e.g., funding goes negative), spot dumps and perp shorts cover, magnifying slippage.
- **Position sizing complexity**: Calculating exact matching notional across spot and perp (accounting for leverage, fees, and price at fill) is non-trivial.

### General Friction

- **No dedicated UI for basis trades**: Must use the standard spot and perp trading interfaces separately
- **No alerts/automation in the UI**: No built-in "alert me when funding drops below X%" or "auto-close both legs if delta exceeds Y%"
- **Rate comparison requires external tools**: Must check Loris, Coinalyze, etc. to find the best opportunities — not integrated

---

## 5. Existing Tools & What They Lack

### Automated Protocols on Hyperliquid

| Tool | Type | How It Works | Limitations |
|------|------|-------------|-------------|
| **Liminal** | Protocol/Vault | Deposit USDC, auto long spot + short perp. 10% perf fee. ~15% APY. 7,500+ depositors, $800K+ distributed. | No self-custody of positions (trust protocol). Funding can go negative. No customization of token mix. Asset caps. |
| **Neutral Trade** | Vault | Hyperliquid Funding Arb vault. USDC deposits on Solana. Up to 21% APY. 10% allocated to HLP. | 3-day deposit lockup + 4-day redemption. Opaque strategy execution. Vault was "100% full" — capacity limited. |
| **Basis Protocol** | Hackathon project | Ethena-style vault on HL Core. ERC-20 4626 vault shares. Long spot, short perps on HYPE/BTC/ETH/SOL. | Early stage (hackathon). Roadmap includes stablecoin. Not yet production-proven. |
| **Harmonix** | Vault | HYPE delta-neutral vault on Arbitrum. 19.17% APY (45d). 1% mgmt + 10% perf fee. | Single token ($HYPE only). Arbitrum-based, not native HL. |
| **HLP (Protocol Vault)** | Market-making | Protocol-managed liquidity. Not purely delta-neutral — earns from MM, liquidations, fees. | Not a delta-neutral strategy per se. Has had drawdown periods. |

### Bots & Open Source

| Tool | Type | Notes |
|------|------|-------|
| **HL-Delta** (GitHub) | Python bot | 70/30 spot/perp split. 5% APR minimum threshold. Auto-rebalance at 5% drift. React+TS dashboard. Flask API. Educational quality. Fixed thresholds. Single-exchange only. |
| **Hummingbot** | Trading framework | Supports Hyperliquid perp + spot connectors. Funding rate arb strategy built-in. API key or wallet auth. Vault integration. Requires CLI setup. Configuration complexity. Known bug: double fills on HL perp connector. Funding info update issues. |
| **CryptoFundingArb** (GitHub) | Scanner | Scans funding rates between CEX and DEX. Shows best opportunities. Scanner only, no execution. |
| **hyperliquid-drift-arbitrage-bot** (GitHub) | Rust bot | Cross-DEX arb between Drift and Hyperliquid. Narrow use case. |

### Monitoring & Scanners

| Tool | What It Does | Limitation |
|------|-------------|------------|
| **Hyperliquid Funding Comparison** (native) | Built-in page comparing HL rates to Binance/Bybit/OKX | No historical analysis, no alerts, no execution |
| **Loris Tools** | 25+ exchange scanner. Calculates net profit. Updated every minute. | View only. No execution. No HL spot integration. |
| **Coinalyze** | Aggregated funding rate charts, OI, liquidations. Free. | General purpose, not HL-specific. No basis trade P&L. |
| **FundingView** | Cross-exchange rate comparison | Similar to Loris. View only. |
| **ASXN Hyperscreener** | HL-specific analytics | Dashboard only, no automation |
| **Blockworks Analytics** | HL annualized funding rate history | Historical only |

### What All Tools Lack

1. **One-click basis trade entry/exit**: No tool offers a single action that opens both spot and perp legs with matched notional
2. **Real-time combined P&L**: No tool shows a unified basis trade P&L (funding earned - fees - drift impact) as a single number
3. **Auto-rebalancing with customizable thresholds**: HL-Delta has basic 5% threshold, but no tool offers fine-grained control
4. **Cross-exchange unified dashboard**: No tool manages both the Binance leg and HL leg together with combined P&L
5. **Integrated alerts**: No tool alerts on funding rate changes, delta drift, or margin danger — within the trading interface
6. **Historical backtesting**: No tool lets you backtest basis trade returns on specific tokens with specific entry/exit criteria
7. **Position sizing calculator**: No tool auto-calculates optimal spot/perp sizes accounting for leverage, fees, and slippage

---

## 6. Hyperliquid-Specific Mechanics

### Margin Modes

| Mode | Description | Basis Trade Use |
|------|-------------|-----------------|
| **Cross Margin** (default) | Shared collateral pool across all perp positions | Good for multi-token basis trades. Risk: one bad position can liquidate others. |
| **Isolated Margin** | Margin limited to single position | Safer per-trade. Risk: less capital efficient. |
| **Portfolio Margin** (new, pre-alpha) | Unified spot + perp. Spot collateralizes perps. Auto-borrowing. | **Best for basis trades**: spot holdings offset perp margin. Dramatically wider hedged price range. |

### Portfolio Margin Details (Critical for Basis Trades)

- Unifies spot and perps into single account
- Spot balance can collateralize perp shorts automatically
- Auto-borrows USDC against spot collateral: `token_balance * borrow_oracle_price * LTV`
- LTV for HYPE: 0.5 (pre-alpha)
- Stablecoin borrow rate: `0.05 + 4.75 * max(0, utilization - 0.8)` APY
- Liquidation when portfolio margin ratio > 0.95
- **Current gating**: >$5M all-time volume, $1K USDC user borrow cap, $1M global cap
- Alpha mode caps: USDH/USDC 500M global supply, 100M borrow cap; HYPE 1M global supply; BTC 400 global supply

### Vault System

- **Minimum 100 USDC** to create a vault
- Vault leaders must maintain **5% ownership** of total vault value
- Leader earns **10% profit share**
- Vault names/descriptions **permanent** — cannot be modified
- Withdrawal lockup: 24 hours for user vaults, 4 days for HLP
- Closing requires **all positions closed first**
- Subaccounts/vaults trade via master account signing with `vaultAddress` field

### Builder Codes

- Enable frontends/bots to receive fees on behalf of users
- **Perp max fee**: 0.1% (10 bps)
- **Spot max fee**: 1% (100 bps)
- Fee specified in tenths of basis points (value of 10 = 1bp)
- Users must approve via `ApproveBuilderFee` action (max 10 active approvals)
- Builder needs minimum 100 USDC in perps account
- Fee data accessible via builder fills CSV endpoint (case-sensitive, lowercase addresses)

### Trading Fees

- **Maker**: 0.01%
- **Taker**: 0.035%
- Among the lowest in crypto — favorable for basis trades with multiple entries/exits

### API Capabilities

- Batch order placement supported (multiple orders in one request)
- Spot assets use index `10000 + universe_index`
- Perp assets use direct `universe_index`
- No native "atomic basis trade" endpoint — must coordinate spot + perp orders manually
- WebSocket feeds for real-time funding, order book, trades
- `fundingHistory` endpoint for historical rate data
- API key auth or Arbitrum wallet + private key auth
- HIP-3 market support for equity/RWA perps

---

## 7. Risk Management Concerns

### Liquidation Risk (Perp Side)

- **Primary risk**: Sharp upward price move can liquidate the short perp before the trader reacts
- Liquidation uses **mark price** (blend of external CEX prices + HL book state) — more robust than single-source
- Most liquidations go to **order book** (not a backstop fund), allowing competitive fills
- **March 2025 margin upgrade**: 20% margin ratio required for transfers out of cross-margin
- **Mitigation**: Use lower leverage (1-3x), set wider liquidation price, use cross margin or portfolio margin

### Basis Risk

- Spot and perp prices don't always move in lockstep
- During extreme volatility, the "basis" (perp premium over spot) can spike, causing unrealized loss on the combined position even though it's delta-neutral
- **Funding rate reversal**: Positive funding can flip negative in bear markets. Liminal data shows these periods are "typically short-lived" but they do happen.
- **Borrowing costs**: When rates go negative, the basis trade becomes a cost rather than a yield

### Execution Risk

- **Leg risk**: One leg fills, the other doesn't (or fills at a worse price)
- **Slippage**: Wider spreads during volatility eat into the thin margins of basis trades
- **Speed**: Cross-exchange arb requires hitting two separate order books near-simultaneously; latency matters
- **Market impact**: Large positions move the order book, especially on HL's thinner spot markets

### Counterparty & Platform Risk

- Hyperliquid is an L1 with self-custody (no custodial exchange risk)
- However, vault protocols (Liminal, Neutral Trade) introduce smart contract risk
- Cross-exchange strategies add CEX counterparty risk (Binance, Bybit could freeze funds)

### Funding Rate Risk

- Rates are **variable and unpredictable**
- Can turn negative for extended periods during bear markets
- Historical average is net positive but not guaranteed
- 4%/hour cap means extreme events are bounded, but normal swings can still erode returns
- Different tokens have wildly different funding rate profiles

### Capital Risk

- Without portfolio margin: capital fragmented between spot and perp accounts
- With portfolio margin: liquidation on one side can affect the other
- Cross-exchange: capital locked on multiple platforms, no netting

---

## Summary: Key Opportunities for a Basis Trade Product

Based on this research, the highest-value features a Hyperliquid basis trade product could offer:

1. **One-click basis trade**: Atomic entry/exit of spot + perp legs with matched notional sizing
2. **Unified P&L dashboard**: Combined view showing funding earned, fees paid, delta drift, net yield — for both single-exchange and cross-exchange positions
3. **Auto-rebalancing**: Configurable delta drift tolerance with automatic position adjustment
4. **Funding rate scanner + alerts**: Integrated rate comparison across exchanges with threshold alerts
5. **Margin/liquidation monitoring**: Real-time display of margin ratio, liquidation price, and proactive warnings
6. **Position sizing calculator**: Input desired notional, leverage, token — get exact spot qty and perp qty
7. **Historical analytics**: Backtest basis trade returns by token, time period, funding rate regime
8. **Portfolio margin integration**: Leverage the new unified account for maximum capital efficiency
9. **Builder code monetization**: Use builder codes to capture fees on user trades programmatically

---

## Sources

- [Hyperliquid Funding Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding)
- [Hyperliquid Margining Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining)
- [Hyperliquid Portfolio Margin Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/portfolio-margin)
- [Hyperliquid Builder Codes Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes)
- [Hyperliquid Liquidations Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/liquidations)
- [Hyperliquid Vaults Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/vaults)
- [Hyperliquid Exchange API Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)
- [Hyperliquid Funding Comparison Page](https://app.hyperliquid.xyz/fundingComparison)
- [Nansen: Liminal — Capturing Real Yield via Funding Rate Arbitrage](https://research.nansen.ai/articles/liminal-capturing-real-yield-via-funding-rate-arbitrage)
- [Liminal Protocol](https://liminal.money/)
- [Neutral Trade Hyperliquid Funding Arb](https://docs.neutral.trade/main-products/quant-strategies/market-neutral/hyperliquid-funding-arb-usdc)
- [HL-Delta Bot (GitHub)](https://github.com/cgaspart/HL-Delta)
- [Hummingbot: Funding Rate Arbitrage on Hyperliquid](https://hummingbot.org/blog/funding-rate-arbitrage-and-creating-vaults-on-hyperliquid/)
- [Basis Protocol (Hyperliquid Hackathon)](https://taikai.network/en/hl-hackathon-organizers/hackathons/hl-hackathon/projects/cmefjcf5t00nbh6qisw749ku6/idea)
- [BitMEX: Harvest Funding Payments on Hyperliquid](https://www.bitmex.com/blog/harvest-funding-payments-on-hyperliquid)
- [Pendle Boros: Cross-Exchange Funding Rate Arbitrage](https://medium.com/boros-fi/cross-exchange-funding-rate-arbitrage-a-fixed-yield-strategy-through-boros-c9e828b61215)
- [ASTER Funding Rate Arbitrage: Whales Earning 450%](https://meme-insider.com/en/article/aster-funding-rate-arbitrage-whales-earning-450-percent/)
- [BSIC: Perpetual Futures Arbitrage Mechanics](https://bsic.it/perpetual-complexity-an-introduction-to-perpetual-future-arbitrage-mechanics-part-1/)
- [Xulian: Mastering Funding Rate Arbitrage (Medium)](https://medium.com/@Xulian0x/mastering-funding-rate-arbitrage-in-crypto-a-comprehensive-guide-27b4c3bb0f90)
- [Mitosis: Delta-Neutral Strategies on Hyperliquid](https://university.mitosis.org/my-personal-guide-to-mastering-delta-neutral-strategies-on-hyperliquid/)
- [Loris Tools: Funding Rate Scanner](https://loris.tools)
- [Coinalyze: Hyperliquid Funding Rates](https://coinalyze.net/hyperliquid/funding-rate/)
- [FundingView](https://fundingview.app)
- [ASXN Hyperscreener](https://hyperscreener.asxn.xyz/)
- [Hyperliquid Guide: Funding Rates](https://hyperliquidguide.com/tools/funding-rates)
- [Blockworks: Hyperliquid Annualized Funding Rates](https://blockworks.com/analytics/hyperliquid/hyperliquid-perps/hyperliquid-annualized-funding-rates)
- [CryptoFundingArb Scanner (GitHub)](https://github.com/hamood1337/CryptoFundingArb)
- [Hyperliquid-Drift Arbitrage Bot (GitHub)](https://github.com/rustjesty/hyperliquid-drift-arbitrage-bot)
