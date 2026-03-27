# On-Chain Analytics & Copy-Trading Suite

## What Traders Manually Dig For Today

### 1. Wallet Stalking

- **Finding alpha wallets**: Traders scrape Hyperliquid explorer, filter by PnL, win rate, and Sharpe over rolling windows. They maintain private spreadsheets of 50-200 "interesting" addresses.
- **Position monitoring**: Refreshing explorer pages or running scripts against the info API (`/info` endpoint) to poll `clearinghouseState` for specific addresses. Watching for size changes, new positions, leverage adjustments.
- **Entry/exit timing**: Comparing a whale's entry timestamp against price action to see if they front-ran news, reacted to funding, or had edge.
- **Cross-referencing deposits/withdrawals**: Tracking L1 bridge activity to see when large players are adding/removing margin — a leading indicator of conviction or de-risking.

### 2. Flow & Orderbook Analysis

- **Large trade detection**: Filtering the trades WebSocket feed for prints above a threshold (e.g., >$100k notional). Manually correlating bursts of large trades with price moves.
- **Aggressive vs. passive flow**: Classifying trades as taker buys vs. taker sells by matching against the best bid/ask at time of print. Building cumulative delta manually.
- **Order book imbalance**: Snapshotting L2 book at intervals, computing bid/ask depth ratios at various levels (1%, 2%, 5% from mid). Looking for persistent imbalances as directional signals.
- **Liquidation tracking**: Monitoring `liquidation` trade types in the feed. Mapping liquidation clusters to price levels for support/resistance.

### 3. Funding & Basis

- **Funding rate arbitrage scanning**: Comparing Hyperliquid funding rates against Binance/Bybit/dYdX to find dislocations. Manually calculating annualized carry.
- **Historical funding patterns**: Downloading funding snapshots over time to identify assets with persistently positive/negative funding — mean reversion or trend signals.
- **Spot-perp basis**: Comparing Hyperliquid perp mark price against spot (from HyperEVM DEX or external CEX) to gauge premium/discount.

### 4. Open Interest & Positioning

- **OI changes by asset**: Polling meta + clearinghouse state to compute aggregate OI. Looking for rapid OI increases (new positions being opened) vs. decreases (positions closing).
- **OI-weighted funding**: Combining OI with funding rate to estimate which side is paying more in aggregate — proxy for crowding.
- **Vault analysis**: Checking vault compositions and performance. Tracking which vaults are accumulating or de-risking.

### 5. Token/Market-Specific

- **New listing monitoring**: Watching for new assets added to Hyperliquid meta. First-mover advantage on new perp listings.
- **HIP-1 token launches**: Monitoring auction activity, initial deployments, and early trading patterns on new spot tokens.
- **Builder fee analysis**: Tracking which builders (front-ends) are generating the most volume — proxy for user adoption signals.

---

## Built-In Analytics Features

### Tier 1: Core Dashboard (Ship First)

#### Whale Tracker
- **Live whale feed**: Real-time stream of trades above configurable notional threshold, with wallet labels (known vaults, market makers, repeat alpha wallets).
- **Position heatmap**: Visual grid showing top-N tracked wallets × their current positions (long/short/size). Color-coded by PnL.
- **Wallet search + profile**: Enter any address → see full position history, PnL curve, win rate, avg hold time, preferred assets, max drawdown, Sharpe.

#### Flow Dashboard
- **Cumulative volume delta (CVD)**: Per-asset chart overlay showing net taker buy vs. sell pressure over time.
- **Large trade tape**: Filterable tape of significant prints with side classification, impact on price, and wallet attribution where possible.
- **Liquidation map**: Price-level heatmap of estimated liquidation clusters based on known open positions and leverage.

#### Funding Scanner
- **Cross-exchange funding table**: Hyperliquid vs. Binance/Bybit/OKX funding rates side-by-side, sorted by absolute spread.
- **Funding history charts**: Per-asset funding rate over time with annualized carry calculation.
- **Funding alerts**: Configurable threshold alerts when funding rate exceeds ±X bps or when cross-exchange spread exceeds Y bps.

### Tier 2: Advanced Analytics

#### Open Interest Analytics
- **OI/price divergence alerts**: Flag when OI is rising but price is flat (hidden accumulation) or OI dropping while price rises (short squeeze unwind).
- **OI by wallet cohort**: Segment OI changes by wallet size tier (whale/dolphin/shrimp) to see who is driving positioning.
- **Long/short ratio estimation**: Approximate ratio using account-level position data from top holders.

#### Orderbook Intelligence
- **Depth imbalance indicator**: Real-time bid/ask ratio at configurable depth levels, shown as a time-series.
- **Spoofing detection**: Flag large resting orders that repeatedly appear and cancel within short windows.
- **Absorption detection**: Identify when large passive orders absorb aggressive flow without price moving — hidden walls.

#### Market Microstructure
- **Spread analytics**: Per-asset spread history (quoted, effective, realized).
- **Trade size distribution**: Histogram of trade sizes over time — shifts in distribution signal regime changes.
- **Maker/taker volume split**: Track proportion of maker vs. taker volume per asset.

### Tier 3: Alpha Signals

#### Wallet Clustering
- **Behavioral clustering**: Group wallets by trading patterns (momentum, mean-reversion, funding arb, liquidation hunting) using unsupervised ML on trade sequences.
- **Coordinated activity detection**: Flag when multiple wallets open similar positions within a short window — potential coordinated plays.
- **Smart money composite**: Aggregate positions of top-performing wallets into a single directional signal per asset.

#### Cross-Asset Signals
- **Correlation matrix**: Rolling correlation between Hyperliquid assets, highlighting regime changes.
- **Sector rotation tracker**: Group assets by category (L1s, memes, DeFi, AI) and show capital flow between sectors.
- **BTC beta scanner**: Rank assets by their beta to BTC moves — find high/low beta plays for directional views.

---

## Copy-Trading Suite

### Core Copy-Trade Engine

#### Wallet Following
- **Follow any address**: One-click follow on any wallet from the whale tracker or search.
- **Portfolio of leaders**: Follow multiple wallets simultaneously with per-wallet allocation limits.
- **Delayed vs. real-time**: Option to copy with a configurable delay (0s, 30s, 1m, 5m) — real-time for speed, delayed for confirmation.

#### Position Mirroring
- **Proportional sizing**: Mirror leader's position as a percentage of their portfolio, scaled to follower's account size. E.g., leader uses 10% of margin on ETH long → follower uses 10% of their margin.
- **Fixed sizing**: Follower sets a fixed dollar amount per trade regardless of leader's size.
- **Leverage cap**: Follower sets max leverage — if leader uses 20x but follower caps at 5x, position is scaled down.

#### Risk Controls
- **Max allocation per leader**: Cap total exposure to any single leader's trades.
- **Max concurrent positions**: Limit number of simultaneous copied positions.
- **Asset whitelist/blacklist**: Only copy trades on specific assets or exclude certain ones.
- **Drawdown circuit breaker**: Auto-stop copying a leader if copied PnL drawdown exceeds threshold (e.g., -5% of allocated capital).
- **Daily loss limit**: Stop all copy-trading for the day if aggregate loss exceeds X%.
- **Slippage protection**: Skip trade if execution price would be worse than leader's entry by more than X bps.

### Leader Discovery

#### Leaderboard
- **Ranked by**: PnL (absolute, %), Sharpe, win rate, avg trade duration, max drawdown, consistency score.
- **Timeframes**: 24h, 7d, 30d, 90d, all-time.
- **Filters**: Asset focus, leverage range, trade frequency, min account size, min trade count.
- **Anti-gaming**: Require minimum trade count and history length to appear on leaderboard. Weight recent performance but penalize high variance.

#### Leader Profiles
- **Performance charts**: Equity curve, PnL by asset, PnL by time-of-day, win rate by asset.
- **Risk metrics**: Max drawdown, Sharpe, Sortino, Calmar, avg/max leverage used.
- **Style tags**: Auto-classified (scalper, swing, funding farmer, liquidation hunter, etc.).
- **Follower count + AUM**: Show social proof — how many people follow and total capital allocated.
- **Transparency**: Full trade history visible to followers. No hidden positions.

### Advanced Copy Features

#### Strategy Blending
- **Multi-leader portfolio**: Allocate percentages across multiple leaders. E.g., 40% to a consistent swing trader, 30% to a funding arb bot, 30% to a momentum scalper.
- **Auto-rebalance**: Periodically rebalance allocation based on rolling Sharpe or drawdown metrics.
- **Inverse copy**: Option to take the opposite side of a leader's trades — useful if you identify consistently wrong traders.

#### Smart Execution
- **TWAP entry**: For large copy trades, split execution over time to reduce market impact.
- **Partial fill handling**: If leader's full size can't be matched at acceptable slippage, take partial position and queue remainder.
- **Exit priority**: When leader closes, follower's exit order gets priority execution to avoid slippage cascading.

#### Notifications & Transparency
- **Trade notifications**: Push/in-app alerts when a copied trade opens, modifies, or closes.
- **Daily digest**: Summary of all copy-trade activity, PnL by leader, and aggregate performance.
- **Divergence alerts**: Notify when your execution meaningfully diverges from leader's (worse entry, missed trade, etc.).

---

## Implementation Considerations

### Data Sources
- **Hyperliquid info API**: `clearinghouseState`, `allMids`, `fundingHistory`, `userFills`, `meta` — all available via REST + WebSocket.
- **L2 book + trades WebSocket**: Real-time orderbook and trade data for flow analysis.
- **Cross-exchange**: Binance/Bybit funding rates via their public APIs for comparison dashboards.
- **Indexing**: Need a lightweight backend to index historical trades, funding, and OI snapshots. Hyperliquid doesn't store deep history in its API.

### Architecture
- **Real-time pipeline**: WebSocket → local state (Zustand) → UI for live feeds (whale tracker, flow dashboard).
- **Historical analytics**: Backend service polling + storing snapshots → queryable API for charts and profiles.
- **Copy-trade engine**: Separate service watching leader positions via WebSocket, computing follower orders, submitting via exchange API. Must handle reconnects, partial fills, and race conditions.
- **Wallet labeling**: Community-sourced + heuristic-based wallet labels. Store as updatable metadata.

### Prioritized Rollout
1. **V1**: Whale tracker (live feed + wallet search), funding scanner, basic copy-trade (single leader, proportional sizing, basic risk controls).
2. **V2**: Flow dashboard (CVD, large trade tape), OI analytics, leader leaderboard, multi-leader copy.
3. **V3**: Wallet clustering, smart execution, strategy blending, cross-asset signals.

### Moat
- **Speed**: Real-time processing of Hyperliquid's WebSocket feeds with sub-second UI updates.
- **Labeling**: Curated wallet labels and behavioral classifications improve over time.
- **Integrated execution**: Copy-trading directly within the terminal — no switching between analytics and trading.
- **Composability**: Analytics signals can feed directly into alerts, copy-trades, or future agent strategies.
