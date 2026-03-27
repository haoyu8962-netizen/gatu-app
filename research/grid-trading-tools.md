# Grid Trading Bot — Comprehensive Research for HypeTerminal

## 1. How Grid Trading Works for Perpetual Futures

### Core Mechanics

Grid trading places multiple buy and sell limit orders at predetermined price intervals across a defined range on perpetual futures contracts. When price falls to a lower grid level, the bot opens a long position (or closes a short). When price rises to a higher level, the bot takes profit. This buy-low/sell-high cycle repeats while price remains inside the range.

**Step-by-step execution:**
1. Define upper and lower price boundaries (the "range")
2. Divide range into N grid levels with arithmetic or geometric spacing
3. Place buy limit orders below current price, sell limit orders above
4. When a buy fills, place a corresponding sell one grid level up
5. When a sell fills, place a corresponding buy one grid level down
6. Repeat continuously, collecting the spread between grid levels as profit

Each completed buy-sell (or sell-buy) cycle is one "grid profit" event. The profit per cycle = grid interval * order quantity - trading fees.

### Parameters in Detail

**Price Range (Upper/Lower Boundaries)**
- Defines the zone where the bot operates
- Typically set using support/resistance, Bollinger Bands, or recent high/low
- Common range: +/-10-20% from current price
- Bybit constraint: Upper price >= (Minimum Price * 1.005); Lower price >= (Market Price * 10%)
- When price exits the range: open positions remain open but no new orders placed until price returns

**Grid Count**
- Number of buy/sell levels within the range
- More grids: frequent trades, smaller profit per trade, higher fees
- Fewer grids: less frequent trades, larger profit per trade, lower fees
- General guidance: 10-30 grids for most setups, sweet spot 15-25
- Platform limits: Pionex min 2, max 500; Bybit min 2, max 400; 3Commas varies by exchange

**Grid Spacing: Arithmetic vs Geometric**

*Arithmetic:*
- Equal absolute price intervals between grid levels
- Example: $500 steps from $60,000 to $70,000 = 20 levels
- Order size fixed in base currency
- Best for narrow ranges, stable markets, short to medium-term
- Simple to understand and manage
- Does not support trailing up in most implementations

*Geometric:*
- Equal percentage intervals between grid levels
- Example: 2% steps - each level is 2% above the previous
- Order size fixed in quote currency
- "Bottom heavy" - more buy orders concentrated at lower prices (accumulates more base currency as prices drop)
- Better for volatile assets and wider ranges
- Supports trailing up
- Better handles sudden price movements
- More efficient for long-term trades with exponential price behavior

*Formula comparison:*
- Arithmetic: Level_n = Lower + n * (Upper - Lower) / GridCount
- Geometric: Level_n = Lower * (Upper / Lower) ^ (n / GridCount)

Most experienced traders prefer geometric for volatile crypto assets.

**Direction / Mode**

*Neutral:*
- Ideal for range-bound markets
- Creates buy orders below current price, sell orders above
- No directional bias, profits from oscillation in either direction
- Places both long and short orders

*Long:*
- Ideal for volatile bull markets
- Initially places buy orders across all levels, creates long position at entry
- Profits from upward bounces
- Risk: accumulates long position as price drops

*Short:*
- Ideal for volatile bear markets
- Initially places sell orders, creates short position at entry
- Profits from downward bounces
- Risk: accumulates short position as price rises

**Leverage**
- Amplifies both gains and liquidation risk
- Platform defaults and maximums:
  - Bybit: Default 10x; Neutral max 100x, Long/Short max 50x
  - KuCoin: Max 10x (auto-set 2x long, 1x short)
  - Binance: Recommended below 20x; conservative guidance 3x or below
  - Pionex: Configurable per bot
- Rule of thumb: 100 / tolerable % drop = max leverage (tolerate 20% drop = 5x max)
- Start with 2-3x maximum for beginners

**Position Sizing Per Grid**
- Total investment / number of grids (basic formula)
- Grid qty = adjust_coef * initial_margin * Leverage / sum(contract_multiplier / assuming_price + leverage * contract_multiplier * abs(min(0, side * (1/price - 1/mark_price))))  (Binance formula)
- 3Commas: "Amount per level" - Arithmetic uses base currency, Geometric uses quote currency
- Best practice: use 50-60% of available funds; never exceed 80%

**Additional Parameters**
- Trigger Price: Delayed start - grid activates when price reaches specified level
- Take Profit: Auto-close bot at profit target (Bybit max 500%)
- Stop Loss: Auto-close bot at loss threshold (Bybit max 100%)
- Open Position on Creation: Toggle to open initial position at market price when grid starts
- Max Active Orders: Limits simultaneous limit orders on same pair

### Risks

**Impermanent-Loss-Like Drawdown**
- Occurs when price trends strongly in one direction
- If price plummets below lowest buy: left holding depreciating positions
- If price rockets past highest sell: sold everything and missed further gains
- The bot systematically sells winners and accumulates losers (opposite of trend-following)
- Unrealized losses can dwarf realized grid profits during directional moves

**Funding Rate Impact**
- Perpetual futures incur funding rates settled every 8 hours (some exchanges more frequently)
- Positive funding rate: longs pay shorts (drains long grid profits)
- Negative funding rate: shorts pay longs (drains short grid profits)
- Must factor cumulative funding costs into profit-per-grid calculations
- Can turn a profitable grid into a net loss over extended periods
- Pionex: "The funding rate applies to both manual and grid trading and is settled every 8 hours"

**Liquidation Risk**
- Maintenance margin is the minimum equity required to keep positions open
- Liquidation occurs when Maintenance Margin Rate reaches 100%+
- Grid bots accumulate position as price moves against them (worst case = all levels filled)
- Must calculate liquidation price assuming ALL grid levels fill (worst case)
- Isolated margin limits risk to allocated funds; cross margin puts entire account at risk
- Bybit: "Maximum Loss limited to the invested amount within the bot; doesn't affect other positions" (isolated)

**Fee Erosion**
- More grids = more frequent trades = more fees
- Negative PnL per level possible when fees exceed expected profits
- Must ensure grid spacing > 2x the trading fee rate

**Regime Change**
- Grid strategies underperform dramatically during strong directional moves
- Best in sideways/ranging markets
- Grid bots use basic logic, don't adapt to changing conditions
- Monthly returns typically 5-15% in favorable conditions; vary dramatically with market conditions

### Edge Cases

- Price gaps through multiple grid levels simultaneously (common in crypto)
- Exchange downtime during grid operation
- Rapid consecutive fills exceeding rate limits
- Funding rate flipping sign during grid operation
- Partial fills at grid levels
- Price exiting range then returning (stale orders)
- Auto-deleveraging events affecting grid positions

---

## 2. Mean Reversion Bots for Perpetual Futures

### How They Differ from Grid Bots

| Aspect | Pure Grid | Mean Reversion |
|--------|-----------|----------------|
| Entry logic | Fixed price levels | Deviation from statistical mean |
| Position sizing | Uniform across levels | Scales with distance from mean |
| Exit target | Next grid level (fixed) | Return to mean (dynamic) |
| Indicators | None | RSI, Bollinger, MA, VWAP, Z-score |
| Risk profile | Linear accumulation | Concentrated entries at extremes |
| Adaptiveness | Static until reconfigured | Dynamic based on indicators |
| Trade duration | Minutes to hours per cycle | Hours to days |

Grid bots work specifically for sideways/consolidation markets with predefined ranges. Mean reversion strategies use indicator-based signals to identify extremes anywhere in the market, then execute entries/exits based on statistical deviations rather than geometric spacing.

### Bollinger Band Strategy

**Setup:**
- Middle band: 20-period SMA
- Standard deviation multiplier: 2.0
- Entry: Price pierces lower band and bounces (buy), or pierces upper band (sell)
- Exit: Price returns to middle band (the "mean")
- Confirmation: Add RSI < 30 for long entries, RSI > 70 for short entries

**Improvements:**
- Filter by higher-timeframe trend direction to reduce false entries
- Use 2.5 or 3.0 SD for wider bands (fewer but higher-confidence signals)
- Combine with volume confirmation

### RSI-Based Mean Reversion

**Setup:**
- Timeframe: 15-minute or 1-hour charts
- RSI period: 14 (standard)
- Entry: RSI drops below 30 (oversold) with price above 200-period SMA
- Exit: RSI crosses back above 50 or hits 1.5-2x risk-reward target
- Filter: Requires price alignment with longer-term structure (above 200 SMA)

**Key rules:**
- Avoid shorts during clear uptrends unless deviation reaches extreme levels (z-scores above +3.5)
- Only take entries when RSI divergence aligns with price structure
- Risk 1-2% per trade

### VWAP Reversion (Intraday)

**Setup:**
- Timeframe: 1-5 minute intraday
- Entry: Price stretches 0.5-0.7% away from VWAP and stalls
- Exit: Price crosses back to VWAP or hits 2x ATR
- Best markets: Liquid perpetual contracts during range-bound sessions

**VWAP-Enhanced Bollinger Bands Momentum Reversal Strategy:**
- Combines RSI, Bollinger Bands (BB), and VWAP
- Uses VWAP as trend confirmation while BB identifies reversal zones
- Multiple confirmation mechanism reduces false signals
- Dynamic stop-losses recommended due to crypto volatility

### Statistical Arbitrage / Z-Score Approaches

**Z-Score Application:**
- Z-score measures how far a value is from the mean in standard deviation units
- High Z-scores (> +2) suggest selling; low Z-scores (< -2) suggest buying
- Automate entry/exit decisions using thresholds like +/-2 standard deviations
- For pairs: if Z-score of spread exceeds +2, short one asset and long another

**Crypto Perpetual Pairs Trading:**
- Find perpetual contract pairs whose spreads exhibit mean reversion
- Use cointegration tests (Engle-Granger, Johansen) to identify stable pairs
- Trade the spread between correlated assets
- Risk management: avoid shorts during clear uptrends unless z-score > +3.5

**Implementation:**
- 3Commas DCA Bot: "Features over 11 built-in indicators that can be combined on multiple timeframes to identify strong deviation signals"
- Signal bots: Execute full TradingView strategies via webhook based on custom Pine Script logic
- Recommended capital: From $1,500; skill level: intermediate; monitoring: regular

### Hybrid Approach (Most Sophisticated)

Grid structure for systematic order placement, but:
- Scale order sizes larger at levels further from mean
- Use indicators (RSI, BB, VWAP) to filter entries
- Dynamic range: auto-adjusts to follow mean +/- N standard deviations
- Pause when ranging conditions break down (ADX > threshold)
- Resume when mean-reversion conditions return

---

## 3. Existing Tools and Their UIs - Platform-by-Platform Analysis

### Binance Futures Grid Bot

**Setup Flow:**
- Navigate: Strategy Trading > Futures Grid
- Two modes: "Auto" (AI-recommended parameters) vs "Manual" (full customization)
- Auto mode: Uses technical analysis on 1-day candlesticks for past 180 periods. Calculates upper/lower limits using Bollinger Band-like formulas factoring average price and default range values. Won't work without enough trading history.
- Manual mode: User sets all parameters

**Parameters Exposed:**
- Price Range (upper/lower)
- Grid Count
- Grid Type: Arithmetic (equal price difference) or Geometric (equal price ratio)
- Direction: Long, Short, Neutral
- Leverage (recommended < 20x)
- Open Position on Creation: Toggle to open initial market position
- Trigger Price: Delayed activation
- Take Profit / Stop Loss

**Advanced Features:**
- Trailing Up: When price rises above upper limit, bot shifts entire grid upward. Cancels lowest buy order, places new buy at previous upper limit. Adjusts upper grid and places a new order.
- Trailing Down: As price drops, entire grid adjusts downward. Maintains same quote value per grid (not base quantity) due to fluctuating range.
- Key trailing mechanic: New order placed when price surpasses upper limit + one grid interval. Each trailing grid maintains same quote value (not base amount).
- Warning: Trailing Down on long grids operates counter to original direction, can create reverse positions.

**AI Parameter Guide:**
- Uses 180-day candlestick data
- Calculates final grid limits using Bollinger-band-like approach
- Factors in average price and "default range value"
- Grid count derived from volatility analysis
- Leverage selection based on historical drawdown analysis

**Running Bot Shows:**
- Total profit, grid profit, unrealized P&L
- Filled order count
- Current position details

### Bybit Futures Grid Bot

**Setup Flow:**
- Navigate: Trade > Trading Bot > Create Now > Futures Grid Bot
- Two modes: AI Strategy (automated) or Manual

**Parameters Exposed:**
- Trading pair selection
- Order Direction: Long, Short, Neutral
- Grid Type: Arithmetic or Geometric
- Price Range (Upper/Lower bounds)
- Number of Grids (min 2, max 400)
- Investment amount (drawn from Funding Account)
- Leverage: Neutral max 100x, Long/Short max 50x, default 10x
- Take Profit (max 500%)
- Stop Loss (max 100%)

**Running Bot Management:**
- Max 50 concurrent bots
- Adjustable while running: Investment amount, TP/SL only
- Cannot modify: grid structure, pair, direction
- Additional investment "only serves to maintain the position" without resetting parameters

**Dashboard Metrics:**
- Total Equity (USD)
- Unrealized P&L (USD)
- Current order positions
- Order history

**PnL Formulas:**
- Grid Profit = Interval * Quantity per grid (Long Order) * completed grid trades - Trading Fees
- Trading Fees = [Filled Qty (Long) * Fee Rate * Long Price] + [Filled Qty (Short) * Fee Rate * Short Price]
- Total P&L = Closed Profit + Unrealized P&L
- Closed Profit = position P&L - trading fees +/- funding fees
- Grid APR = [(Grid profit / Total investment) / Days running * 365] * 100%
- Total APR = [(Total P&L / Total investment) / Days running * 365] * 100%

**Funding & Liquidation:**
- Funding fee incurred at contract interval (may be paid or received)
- Same fee rates as standard USDT Perpetual trading
- Liquidation when Maintenance Margin Rate >= 100%
- Max loss limited to invested amount (isolated)
- Out of range: positions stay open, no new orders until price returns

### Pionex Grid Bot

**Pioneered free grid bots - 16 built-in bots at zero additional cost.**

**Setup Flow:**
- Open Pionex > Futures > Futures Bot > Futures Grid
- Three options: "Long", "Short", "Neutral"
- Can use "Copy Strategy" (AI-recommended) or "Customize" (manual)
- AI Strategy uses backtest data from past 7, 30, and 180 days

**Parameters Exposed:**
- Trading pair
- Direction: Long, Short, Neutral
- Leverage (configurable)
- Price Range (upper/lower)
- Grid Count: min 2, max 500
- Investment amount (min 50 USDT for bots with 20+ grids)
- AI-suggested parameters available

**Unique Concepts:**
- Dynamic Margin: Reserved "safety cushion" separate from actual investment. Hedges against floating losses and reduces liquidation risk.
- PionexGPT: Plain English prompts turned into grid configurations with backtesting suggestions (e.g., "build a grid for BTC within a two percent band and add a stop loss")

**Dashboard Metrics:**
- Grid Profit (realized, can only be positive, never decreases)
- Unrealized Profit (constantly changing, can be negative)
- Total Profit = Grid Profit + Unrealized Profit
- Current Price
- Arbitrage/Total APR (annualized)

**Infinity Grid (Unique to Pionex):**
- No upper price limit - eliminates missed opportunities when price rises too high
- Keeps investment value constant (e.g., $1000 in BTC stays at $1000 whether price rises or falls)
- Sells on price up, buys on price down, profits from each oscillation
- Only parameter needed: Lowest Price + Profit Per Grid + Investment Amount
- AI Strategy available based on 30-day backtest
- Best for long-term holders who want to capture volatility

### 3Commas Grid Bot

**Setup Flow:**
- Navigate: Grid Bots section from left menu
- TradingView-powered chart with customizable settings
- Strategy Presets available with pre-configured parameters

**Parameters Exposed (Comprehensive):**
- Exchange account selection
- Trading pair
- Investment amount (limited to ~95% of available balance; 5% reserved for rounding/commissions)
- Grid Type: Geometric or Arithmetic
- High Price / Low Price (upper/lower boundaries)
- Grid Step (take profit per trade, sets spacing)
- Number of Grid Levels
- Amount Per Level (base currency for arithmetic, quote currency for geometric)
- Profit Currency (geometric spot bots only)

**Advanced Settings:**
- Trailing Up (Geometric Spot & Long Futures): When price moves 2 steps above High Price, cancels lowest buy, places new buy above High Price, shifts entire range upward
- Trailing Down (Short Futures): When price falls 2 steps below Low Price, cancels highest sell, places new sell below, shifts range downward
- Expansion Up (Reversal & Short Futures): Adds sell orders above original High Price without canceling lower buys. Requires additional investment.
- Expansion Down (Spot & Long/Reversal Futures): Adds buy orders below original Low Price without canceling higher sells. Requires additional investment.
- Stop Expansion Up/Down: Define limits to prevent excessive expansion
- Max Active Orders: Limits simultaneous orders to respect exchange caps

**Stop Bot Options (Futures):**
- "Close the Position" - cancels orders + closes open position
- "Leave Open Position" - cancels orders but leaves position for manual management (convertible to SmartTrade)
- Upper/Lower Stop Bot: Trigger stop at specified price level

**Backtesting:**
- 120-day historical simulation
- Green values = profitable, red = liquidation
- AI Optimize: Adjusts grid step based on volatility, runs multiple backtests, selects best-performing
- Plan limits: Free/Starter 10/month, Pro 50/month, Expert 5,000/month
- Publishes list of pairs sorted by 120-day backtest results

**Running Bot Monitoring:**
- Bot table with filterable active/closed bots across all exchanges
- Sortable by: name, result, profit, ROI, closed orders, trading duration
- Primary metrics: Investment, Result (real-time), Profit (realized + unrealized - fees), ROI
- PnL 24h, Active Orders (buy/sell breakdown), Fees, Avg Daily ROI
- USD vs crypto denomination, composite or split views
- Closed Orders section with entry point linking, XLSX export
- TradingView chart with technical indicators
- Event logging for order executions and setting changes

**Bot Management Actions:**
- Edit (without canceling orders): trailing settings, expansion parameters, stop thresholds, active order count, name
- Edit (requiring order cancellation): investment, price boundaries, step/levels, amount per level
- Cannot modify: exchange, pair, grid type, profit currency
- Add Funds (spot only): reinvest capital, auto-rebalance across grid levels
- Restart: copy closed bot to launch new instance with adjusted settings
- Share: generate referral links for others to copy configuration

**2025 Innovation:**
- AI-enhanced hybrid strategies that analyze real-time volatility and automatically select between arithmetic and geometric execution modes
- Trailing up and trailing down as AI Grid Bot enhancement that continuously adjusts parameters based on live data
- Signal Bot: Dynamic Grid bot driven by TradingView Pine Script signals via webhook

### KuCoin Futures Grid Bot

**Setup Flow:**
- Navigate to Futures Grid bot interface
- Shows: number of people using the strategy, highest APR earned
- Choose: Customize (manual) or Auto (AI)
- Auto mode: AI determines leverage, price range, number of orders. All pre-configured parameters backtested. Suited for beginners.

**Parameters Exposed:**
- Direction: Long or Short
- Investment amount (transferred from Main Account to Trading Account, no fees)
- Leverage: Up to 10x (auto-set 2x long, 1x short)
- Price Range (upper/lower)
- Grid Count
- Entry Price (optional advanced trigger)
- Stop-Loss / Take-Profit
- Copy Trading option from daily/7-day rankings

**Dashboard:**
- Number of trades executed
- Real-time profit metrics
- Open Orders and Order History
- Parameter details via Details tab
- Investment increase option

**Stop Bot:** "Turn Off" button in top-right corner

### Gate.io Futures Grid Bot

**Parameters Exposed:**
- Sides: Long, Short, Neutral
- Leverage
- Price Range (upper/lower)
- Number of Grids
- Grid spacing type
- Quantity Increment: toggle to increase trades per grid by quantity or proportionally
- Take-Profit / Stop-Loss

**Setup Methods:**
- Copy a backtesting bot (historical + algorithmic parameters)
- Copy a bot provider (community)
- Customize your own bot

### Bitsgap Grid Bot

**Parameters Exposed:**
- High and Low Prices (editable on chart or input fields)
- Grid Step Percentage (price distance between levels)
- Grid Levels (total orders)
- Order sizing: Quote currency (default, fixed per level) or Base currency (fixed base amount per trade)
- Max Position (maximum volume of position)
- Max Margin (maximum margin per position)
- First Order Volume
- Grid Orders (total volume)
- Take Profit (target %)
- Stop Loss (price level or Total % PnL)

**Advanced Features:**
- Trailing Up: Grid moves upward when price exceeds highest level
- Trailing Down: Market buys using available balance, extends grid downward
- Pump Protection: Activated by default with trailing. Pauses during price surges to prevent buying at peaks.
- Dynamic Stop Loss: Follows lowest price as grid moves (with Trailing Up)
- COMBO Bot: Combines grid + DCA strategies, profits in USDT, follows trend in both directions

**Key mechanic:** When adjusting high/low prices, only grid step % modified by default while grid levels remain fixed. After editing step or levels, last edited stays fixed, other recalculates.

### dYdX Grid Trading

**No native grid bot.** Third-party tools:
- GoodCrypto: Futures Grid bot with Long/Short/Neutral modes, 20x leverage, DCA bot, Infinity Trailing
- Gunbot: Dynamic trailing and automatic profit targets, adapts to dYdX order book
- Hummingbot: Grid trading via dashboard interface for dYdX v4 perpetuals
- Community bots on GitHub

### Hyperliquid Ecosystem Grid Bot Tools

**Native:** No built-in grid bot on Hyperliquid.

**Third-Party Tools:**

*GoodCrypto (goodcryptoX):*
- First to bring trailing stops, on-chart visualization, and automated trading (DCA, Grid, Infinity Trailing) to DEXs
- Grid bot with Long/Short/Neutral modes
- Parameters: Highest level, Lowest level (manual or drag on chart), Order size, Number of levels (2-100)
- PnL per level calculated automatically
- Stop Loss: distance % from highest/lowest grid level, with Last Price / Mark Price / Index Price trigger options
- Take Profit with "Stop in Neutral position" option
- Close Position when algo stops: toggle
- Performance metrics: Total PnL, Realized PnL, Unrealized PnL, Average PnL Level, Dynamic APY
- Customizable push notifications for fills, PnL changes, range exits, algo stops
- Safety: recommend 50-60% of funds, max 80%

*Gridy.ai:*
- Grid bot specifically for Hyperliquid and other perp DEXs
- Setup: Select Hyperliquid API > Perpetual Swaps Grid > Choose pair > Set investment + leverage > Create
- Auto mode available
- Simple red switch to start/stop
- Also offers cross-exchange arbitrage bot

*Hummingbot (Open Source):*
- Apache 2.0 license, free
- Supports both hyperliquid (spot) and hyperliquid_perpetual (perp) connectors
- v2.12: Full HIP-3 market support (equity/RWA perps)
- Grid Strike strategy: places grid of buy/sell orders within set range
- Triple Barrier system for position management (stop_loss, take_profit, time_limit)
- Parameters: total_amount_quote, side (1=Long, 2=Short), start_price, end_price, limit_price, min_spread_between_orders, min_order_amount_quote, order_frequency, activation_bounds
- Works on both spot and perpetual connectors

*Community Grid Bot (GitHub - SrDebiasi/hyperliquid-grid-bot):*
- Spot only (no leverage, no liquidation risk)
- Parameters: target_percent (profit per cycle, recommended 1.8%), margin_percent (grid spacing density), entry_price/exit_price (range), usd_transaction (capital per level)
- Features: order block system, cleanup logic, rebuy logic for compounding, Healthchecks.io integration, Telegram reporting
- Real backtest: $4,131.77 profit on $61,400 over 87 days (6.73% return, ~28.33% annualized)

*OctoBot:*
- Open source with hosted option
- Supports AI, DCA, Grid, and TradingView strategies on Hyperliquid

*WunderTrading:*
- Connects to Hyperliquid via API
- Grid bot with full parameter set

*Dextrabot:*
- Grid bot documentation specifically for Hyperliquid

---

## 4. UI/UX Patterns Across Successful Grid Bot Interfaces

### Setup Flow Patterns

**Two dominant patterns:**

1. **Side Panel Form (most common):**
   - Chart on left, configuration form on right
   - Form fields: pair, direction, range, grids, leverage, investment
   - Real-time preview updates as parameters change
   - Used by: Binance, Bybit, Pionex, KuCoin, Gate.io

2. **Step-by-Step Wizard (less common):**
   - Multi-step sequential flow
   - Step 1: Select pair and direction
   - Step 2: Configure range and grids
   - Step 3: Set investment and leverage
   - Step 4: Risk management (TP/SL)
   - Step 5: Review and confirm
   - Wizard pattern ideal for complex configuration with interdependent settings
   - Benefits: progressive disclosure, guided navigation, validation per step
   - Used by: some third-party tools, education-focused platforms

**Common UI elements across all platforms:**
- "Auto" vs "Manual" mode toggle as first choice
- Confirmation popup/modal before bot creation
- Estimated profit/APR shown before launch
- Warning messages for risky configurations

### Visual Grid Overlay on Charts

**TradingView-based visualization:**
- Horizontal lines at each grid level on the price chart
- Color coding: Green lines for buy levels, Red lines for sell levels
- Filled orders shown as solid lines, pending as dashed
- Bold/distinct boundary lines for upper and lower limits
- Right-anchored labels to keep price action unobstructed
- "Soft Color" schemes (Teal/Coral/Amber) for legibility without eye strain

**Interactive features:**
- Drag upper/lower boundary lines to resize range on chart
- Chart updates grid parameters in real-time as boundaries change
- Fill markers (dots) on lines where orders executed
- Performance rendering: show only ~100 lines closest to current price for large grids

**Distribution visualization:**
- Arithmetic: evenly spaced horizontal lines
- Geometric: wider spacing at higher prices, tighter at lower

### AI / Auto-Parameter Suggestion

**Implementation patterns:**
- **Binance**: "Use AI Strategy" button. Uses 180-day candlestick data, Bollinger-band-like approach for range, volatility analysis for grid count.
- **Pionex**: AI Strategy from 7/30/180-day backtest data. PionexGPT accepts natural language ("build a grid for BTC within a two percent band and add a stop loss").
- **3Commas**: AI Optimize runs multiple 120-day backtests with different step values, selects best-performing. Publishes pair rankings sorted by backtest results.
- **KuCoin**: Auto mode where AI determines leverage, price range, and order count. All parameters backtested.
- **OKX**: "Set myself - Auto fill" + AI strategy based on weekly backtests.
- **Bybit**: AI Strategy mode with automated parameters.
- **Bitsgap**: AI Assistant asks about balance and risk tolerance, analyzes conditions, suggests configs.

**Common AI approach:**
1. Analyze recent volatility (determine ranging vs trending vs sharp moves)
2. Calculate historical drawdowns
3. Analyze price structure (support/resistance)
4. Select leverage based on historical downside (if pair showed 40% drawdowns, won't suggest high leverage)
5. Backtest multiple configurations
6. Present best-performing settings for user review

### Risk Warnings and Liquidation Display

**Pre-launch warnings:**
- Leverage too high for range width
- Range narrower than recent volatility (< 2x ATR)
- Adverse funding rate environment
- Insufficient margin for full grid deployment

**Liquidation display:**
- Red dashed line on chart showing liquidation price
- Worst-case calculation assuming all grid levels fill
- Distance to liquidation as percentage
- Real-time update as position accumulates

### Running Bot Monitoring Dashboards

**Common dashboard layout:**
- Card/table view of all active bots
- Per-bot card shows: market, direction, leverage, range, runtime, status
- Primary metrics prominently displayed: Total P&L, Grid Profit, Unrealized P&L
- Detailed view with order history, fill log, chart overlay
- Actions: Pause, Stop, Adjust, Add Funds

**Key metrics shown across platforms:**

| Metric | Description |
|--------|-------------|
| Total P&L | Realized + Unrealized combined |
| Grid Profit | Profit from completed buy-sell cycles (always positive) |
| Unrealized P&L | Current open position value (can be negative) |
| Funding Costs | Cumulative funding fees paid/received |
| Net P&L | Grid profit + Unrealized - Funding costs |
| ROI % | Profit as percentage of initial investment |
| APR | Annualized return rate |
| Avg Daily ROI | Average daily return |
| Filled Levels | e.g., "12/20 filled" |
| Active Orders | Count with buy/sell breakdown |
| Runtime | Duration since bot started |
| Fees | Today + accumulated total |
| Win Rate | Percentage of profitable cycles |

### PnL Tracking (Detailed Breakdown)

**Realized P&L (Grid Profit):**
- Profit from completed grid cycles
- Long: Position Size * (Avg Close Price - Avg Open Price)
- Short: Position Size * (Avg Open Price - Avg Close Price)
- Can only increase, never decrease

**Unrealized P&L:**
- Open position value at current market price vs entry
- (Current Price - Avg Purchase Price) * Quantity Held
- Constantly changing, can be negative

**Grid Profit Formula:**
- Grid Profit = Grid Interval * Quantity per Grid * Completed Trades - Trading Fees
- Or: Single Grid Price Difference * Qty Bought per Grid * Number of Completed Sell Orders

**Total Profit:**
- Total Profit = Realized P&L + Unrealized P&L
- Some platforms also subtract funding fees from total

**APR Calculations:**
- APR = (Total Profit / Total Investment) / Days Running * 365
- Grid APR = (Grid Profit / Total Investment) / Days Running * 365

**OKX additional breakdown:**
- Profit margin per grid = (Sell avg price - Buy avg price) * Volume - Buy fee - Sell fee
- Unpaired profit = Total return - Grid profit
- Active margin vs Reserved margin split

### Common Actions on Running Bots

1. **Stop Bot**: Cancel all pending orders
   - Option A: Close position at market (clean exit)
   - Option B: Leave position open for manual management
   - Some allow conversion to SmartTrade (3Commas)

2. **Adjust Grids**: Modify range boundaries, grid count
   - OKX: Edit Parameters feature for on-the-fly changes without closing bot
   - 3Commas: Some edits without canceling orders, some require cancellation
   - Bybit: Only investment and TP/SL adjustable while running

3. **Add/Remove Funds**: Increase or decrease investment
   - Additional funds typically for maintaining position, not changing grid structure
   - OKX: Can add margin to running bot to reduce liquidation risk

4. **Pause/Resume**: Cancel pending orders but keep position
5. **Take Profit**: Auto-close at target
6. **Stop Loss**: Auto-close at loss threshold

---

## 5. Best Practices and Advanced Features

### Trailing Grids

**Trailing Up (Long/Neutral grids):**
- When price rises above upper limit by 1-2 grid intervals, bot shifts entire grid upward
- Cancels lowest buy order, places new buy at previous upper limit
- Shifts both upper and lower boundaries
- Maintains same quote value per grid (not base quantity)
- Available on: Binance, Bybit, 3Commas, Bitsgap, Crypto.com

**Trailing Down (Short grids):**
- When price falls below lower limit, grid shifts downward
- Cancels highest sell order, places new sell below
- Warning: Using trailing down on long grids creates counter-directional exposure

**3Commas Implementation:**
- Trailing Up: Triggers when price moves 2 steps above High Price
- Trailing Down: Triggers when price moves 2 steps below Low Price
- Expansion Up/Down: Adds orders beyond boundaries WITHOUT canceling existing ones (requires additional investment)
- Stop Expansion Up/Down: Define limits to prevent excessive growth

**Bitsgap Implementation:**
- Pump Protection: Activated by default with trailing. Bot pauses during sudden surges to prevent buying at peaks.
- Dynamic Stop Loss follows lowest grid level as grid trails upward

### Infinity Grids

**Pioneered by Pionex:**
- No upper price limit - grid extends infinitely upward
- Only has a lower price boundary
- Keeps investment value constant at configured amount (e.g., $1000 in BTC stays at $1000)
- Sells on price increase, buys on price decrease, profits from each oscillation
- Parameters: Lowest Price, Profit Per Grid (controls width), Total Investment
- Eliminates need to recreate bots when price exceeds upper limit
- Best for long-term holders who want to monetize volatility while maintaining exposure
- AI Strategy available based on 30-day backtest

**GoodCrypto "Infinity Trailing":**
- Similar concept available on Hyperliquid and other exchanges
- Trailing algorithm that follows price without upper bound

### Reverse Grid (Short Grid)

- Operates with similar mechanics but in reverse direction
- Initially places sell orders on all levels
- Generates profits from price declining within range
- Risk: accumulates short position as price rises
- Suitable for bearish markets or hedging long spot holdings
- Bitsgap: "When price drops below the lower limit, the bot starts accumulating a short position"

### Margin Modes

**Isolated Margin (Recommended for grid bots):**
- Risk limited to allocated funds only
- If bot fails, doesn't touch rest of wallet
- Bybit: "Maximum Loss limited to invested amount within bot"
- Easier to calculate max risk per bot

**Cross Margin:**
- Entire account balance backs all positions
- Higher capital efficiency (shared collateral)
- Risk: one bad grid can affect all other positions
- Hyperliquid default: Cross margin enables "maximal capital efficiency by sharing collateral between all other cross margin positions"

**Hyperliquid-specific margin modes:**
- Cross Margin (default): Unrealized PnL serves as margin for new positions
- Isolated Margin: Liquidation in one position doesn't affect others
- Strict Isolated: Margin cannot be removed until position closes
- "No Cross" Mode (HIP-3): Isolated margin only, no cross functionality
- Portfolio Margin: Cross positions sharing same collateral across DEXs

### Auto-Deleveraging Considerations

- In extreme market conditions, exchanges may auto-deleverage profitable positions
- Grid bots accumulating large positions are vulnerable
- Important to monitor and cap maximum position size
- Hyperliquid: On-chain clearinghouse handles liquidations

### Funding Rate Impact on Perp Grid Bots

**Critical for long-running grids:**
- Funding settled every 8 hours (most exchanges) or more frequently
- Positive funding: longs pay shorts (drains long grid profits)
- Negative funding: shorts pay longs (drains short grid profits)
- Hyperliquid: Funding rates calculated hourly. Formula: Funding Rate = Average Premium Index (P) + clamp(Interest Rate - P, -0.0005, 0.0005). Capped at 4%/hr.
- Must factor cumulative funding into profitability calculations
- Some platforms show funding costs in bot PnL breakdown
- Advanced feature: Funding rate threshold to auto-pause grid if funding exceeds X%
- Directional grids particularly vulnerable (neutral less so since positions alternate)

### Backtesting Capabilities

**3Commas:** 120-day historical simulation with multiple Step value iterations. Green = profitable, red = liquidation. AI Optimize selects best configuration. Supported on Binance, Bybit, OKX, Kraken, KuCoin, Gate, Coinbase.

**Pionex:** AI Strategy uses 7/30/180-day backtest data. Auto-generates parameters for current conditions.

**OKX:** AI strategy based on weekly backtests of each trading pair.

**Binance:** AI parameters based on 180-day candlestick analysis.

**WunderTrading:** Backtest for last 30 days based on specified parameters.

**Open source (TradingView):** Multiple Pine Script grid bot backtesting indicators:
- Grid Bot Demonstrator: Simulates grid structure on chart
- Grid Bot Backtesting Strategy: Full backtest with PnL tracking
- Grid Level Visualizer: Visual overlay tool

### Copy Trading / Sharing Grid Configs

**Pionex:** One-click copy of community grid configurations. Copy Grid Bots guide available.
**3Commas:** Share bot configuration via referral links. Strategy Presets with community-contributed configs.
**KuCoin:** Copy Trading from daily/7-day performance rankings.
**Gate.io:** Copy bot providers or backtested bot configurations.
**WunderTrading:** Multi-account support for deploying same grid across client portfolios.
**Bitsgap:** Copy trade and modify strategies from marketplace.

---

## 6. Hyperliquid-Specific Considerations for Grid Trading

### Advantages for Grid Trading

**Low fees, high rebates:**
- Perp taker: 0.045%, maker: 0.015% (base tier)
- Maker rebates at high volume: up to -0.003% (paid to place limit orders)
- Grid bots primarily use limit orders = primarily maker fees
- Stable pairs: 80% lower taker fees
- Volume-based tiers reduce fees as grid generates volume
- Staking discounts: 5% (10 HYPE) to 40% (500K HYPE)

**Order types suited for grids:**
- Limit orders with GTC (Good Til Cancel) - core of grid strategy
- Post Only (ALO) - ensures maker fee, critical for grid profitability
- Scale orders: "Multiple limit orders in a set price range" - native grid-like feature
- TWAP: For large entries/exits
- Reduce Only: For closing positions safely
- Batch order API: Efficient grid setup/teardown in single request

**API capabilities:**
- Batch order placement/cancellation
- WebSocket fills channel for real-time order replacement
- `clearinghouseState` for liquidation price calculations
- Rate limits: 1200 weight/min; action weight = 1 + floor(batch_length / 40)
- Max ~1,000 open orders (grid bots with 20-50 levels well within limit)

**Margin flexibility:**
- Cross margin (default) for capital efficiency
- Isolated margin for per-bot risk containment
- Strict isolated for locked-in risk
- Leverage adjustments without closing positions (validated on new order)
- Margin formula: position_size * mark_price / leverage
- Maintenance margin = half the initial margin at maximum leverage

### Challenges for Grid Trading

**Cross-margin risk:**
- Default cross margin means a grid bot's losses affect entire account
- Must explicitly use isolated margin to contain grid bot risk
- Currently no "sub-account" concept for individual bots

**HIP-3 limitations:**
- Builder-deployed perpetuals (HIP-3) currently isolated-only
- Cross margin support for HIP-3 markets coming in future upgrade
- Grid bots on HIP-3 markets limited to isolated margin

**Funding rate specifics:**
- Hourly funding (more frequent than most CEXes' 8-hour)
- Capped at 4%/hr (high cap)
- Uses spot oracle price for notional, not mark price
- More frequent funding = faster drain on directional grid positions

**Tick/lot size constraints:**
- Prices up to 5 sig figs, max (6 - szDecimals) decimal places
- Grid levels MUST conform to tick size
- Position sizes must conform to lot size
- Must round grid calculations to valid increments

**Builder codes opportunity:**
- Builder codes allow fee collection on user orders (set per-order)
- Builder needs 100 USDC+ in perps account value
- User must approve max builder fee, can revoke anytime
- Apply to both sides of perp trades
- Opportunity: HypeTerminal as a builder can collect fees on grid bot orders

**Vault system opportunity:**
- Vaults can be created and tokenized on HyperEVM
- EIP-4626 compliant with trustless read/write on HyperCore
- Vault volume treated separately from master account
- Could create grid strategy vaults for passive investors

**Withdrawal constraints:**
- Must maintain initial margin requirement OR 10% of total notional position value (whichever greater)
- Grid bots with large positions may lock up significant capital

### Implementation Notes

- Use batch order API for grid setup/teardown (single request for all grid orders)
- Subscribe to WebSocket fills channel for real-time order replacement
- Query `clearinghouseState` for liquidation price calculations
- Respect tick/lot size constraints when calculating grid levels
- Monitor funding rate via API and display impact on grid profitability
- Use isolated margin mode by default for grid positions
- Implement order replacement queue to handle rapid consecutive fills without hitting rate limits
- Use Post Only (ALO) orders to ensure maker fees on all grid orders
- Consider builder codes for monetization (collect fee on each grid fill)
- Leverage Hyperliquid's native Scale order type as a simpler alternative for basic grid setups

---

## 7. Feature Priority Ranking for HypeTerminal

| Priority | Feature | Rationale |
|----------|---------|-----------|
| P0 | Grid Setup Panel + Chart Overlay | Core feature, minimum viable grid bot |
| P0 | Running Grid Dashboard | Users must monitor active grids |
| P0 | Risk Guardrails (liquidation, drawdown) | Safety-critical for leveraged trading |
| P1 | Backtest / AI Suggest | Major differentiator, reduces user error |
| P1 | Active Order Table | Transparency into grid state |
| P1 | Notifications | Perps are 24/7, users can't always watch |
| P2 | Mean-Reversion Mode | Advanced feature, strong differentiator |
| P2 | Analytics & History | Helps users improve over time |
| P2 | Trailing Grid | Must-have for trending markets |
| P2 | Infinity Grid | Unique feature, strong Pionex competitor |
| P3 | Templates & Sharing | Community/retention feature |
| P3 | Copy Trading | Social feature, network effects |

---

## Sources

### Grid Trading Mechanics & Parameters
- [Futures Grid Bot - WunderTrading](https://wundertrading.com/journal/en/trading-bots/article/futures-grid-bot)
- [What Is Futures Grid Trading - Bitget](https://www.bitget.com/academy/what-is-futures-grid-trading)
- [What Is Futures Grid Trading - Binance](https://www.binance.com/en/support/faq/what-is-futures-grid-trading-f4c453bab89648beb722aa26634120c3)
- [Binance Futures Grid Trading AI Parameters](https://www.binance.com/en/support/faq/binance-futures-grid-trading-ai-parameters-guide-647b0dba72d145219688b04aa51405fc)
- [Binance Trailing Up/Down Futures Grid](https://www.binance.com/en/support/faq/how-to-use-the-trailing-up-and-trailing-down-functions-in-usd%E2%93%A2-m-futures-grid-trading-7a7bb22420404385991dee3a0930207d)

### Arithmetic vs Geometric Grid Spacing
- [Arithmetic and Geometric Grid Types - Gainium](https://gainium.io/help/arithmetic-and-geometric-grid-types)
- [Arithmetic vs Geometric Grid Bots - 3Commas](https://3commas.io/blog/arithmetic-vs-geometric-grid-bots-on-3commas-a-com)
- [ApeX Exchange Grid Bot Strategies](https://www.apex.exchange/blog/detail/Understanding-Long-Short-and-Neutral-Grid-Bots)

### Platform-Specific Documentation
- [3Commas Grid Bot Settings](https://help.3commas.io/en/articles/7932030-grid-bots-main-settings-and-options)
- [3Commas Grid Bot Monitoring Tools](https://help.3commas.io/en/articles/7936235-grid-bot-monitoring-tools)
- [3Commas Grid Bot Management](https://help.3commas.io/en/articles/7936262-grid-bot-bot-management)
- [3Commas Mean Reversion Bot](https://3commas.io/mean-reversion-trading-bot)
- [Bybit Futures Grid Bot Setup](https://www.bybit.com/en/help-center/article/How-to-Get-Started-with-Futures-Grid-Bot-on-Bybit)
- [Bybit Futures Grid Bot FAQ](https://www.bybit.com/en/help-center/article/FAQ-Futures-Grid-Bot)
- [Bybit P&L Calculations](https://www.bybit.com/en/help-center/article/P-L-Calculations-Futures-Grid-Bot)
- [Pionex Futures Grid Bot](https://support.pionex.com/hc/en-us/articles/45343668185113-Futures-Grid-Bot)
- [Pionex Grid Profit vs Unrealized](https://www.pionex.com/blog/knowledge-base/what-are-grid-profit-and-unrealized-profit/)
- [Pionex Infinity Grid](https://www.pionex.com/blog/how-does-infinity-grid-bot-work/)
- [KuCoin Futures Grid Bot](https://www.kucoin.com/learn/trading-bot/kucoin-futures-grid-bot)
- [KuCoin Infinity Grid](https://www.kucoin.com/learn/trading-bot/what-is-infinity-grid-trading-bot-and-how-does-it-work)
- [Gate.io Futures Grid Tutorial](https://www.gate.com/help/bots/futures-grid/36142/futures-grid-trading-tutorial)
- [Bitsgap Advanced GRID Settings](https://bitsgap.com/helpdesk/article/10038646989340-Advanced-Bitsgap-GRID-Bot-Settings)
- [OKX Futures Grid Bot FAQ](https://www.okx.com/en-us/help/futures-grid-bot-faq)
- [OKX Manual Futures Grid Setup](https://www.okx.com/help/how-do-i-manually-set-up-futures-grid-trading-bot)

### Hyperliquid Ecosystem
- [5 Best Hyperliquid Bots 2026](https://coinlaunch.space/blog/best-hyperliquid-bots/)
- [GoodCrypto Hyperliquid Bot](https://goodcrypto.app/hyperliquid-trading-bot/)
- [GoodCrypto Grid Bot User Guide](https://goodcrypto.app/grid-bot-user-guide/)
- [Gridy.ai Hyperliquid Grid Bot](https://help.gridy.ai/?p=287)
- [Hummingbot Hyperliquid Connector](https://hummingbot.org/exchanges/hyperliquid/)
- [Hummingbot Grid Strike Strategy](https://hummingbot.org/blog/strategy-guide-grid-strike/)
- [Community Hyperliquid Grid Bot](https://github.com/SrDebiasi/hyperliquid-grid-bot)
- [OctoBot Hyperliquid Trading Bot](https://www.octobot.cloud/hyperliquid-trading-bot)
- [Hyperliquid Order Types](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types)
- [Hyperliquid Fees](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees)
- [Hyperliquid Margining](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining)
- [Hyperliquid Builder Codes](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes)
- [Hyperliquid Vaults](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/vaults)

### Mean Reversion Strategies
- [Mean Reversion Strategies - HorizonAI](https://www.horizontrading.ai/learn/mean-reversion-trading-strategies)
- [Mean Reversion Trading - Stoic.ai](https://stoic.ai/blog/mean-reversion-trading-how-i-profit-from-crypto-market-overreactions/)
- [VWAP-Enhanced Bollinger Bands Strategy](https://medium.com/@FMZQuant/vwap-enhanced-bollinger-bands-momentum-reversal-strategy-570b86982021)
- [Statistical Arbitrage in Crypto - CoinAPI](https://www.coinapi.io/blog/3-statistical-arbitrage-strategies-in-crypto)
- [Crypto Perpetual Pairs Trading - QuantInsti](https://blog.quantinsti.com/crypto-perpetual-contract-pair-trading-project-rong-fan/)

### UI/UX & Design Patterns
- [Grid Bot Demonstrator - TradingView](https://www.tradingview.com/script/NDl287ix/)
- [Grid Level Visualizer - TradingView](https://www.tradingview.com/script/YO3pdygt-Grid-Level-Visualizer-v1-0/)
- [Grid Trading Bot Development Guide](https://www.biz4group.com/blog/grid-trading-bot-development)
- [Crypto Trading Bots & Dashboards UX Reviews 2025](https://www.smiletotalk.com/blog/crypto-trading-bots-dashboards-ai-automation-ux-reviews-2025)
- [3Commas Grid Bot UI Update](https://feedback.3commas.io/changelog/update-grid-bot-ui)

### Risk Management & Advanced Features
- [Grid Bot Risks & Analysis](https://intralogic.eu/tradingbot/en/blog/grid-bot-crypto-trading-advantages-risks-analysis)
- [Why Trading Bots Lose Money](https://www.fortraders.com/blog/trading-bots-lose-money)
- [Best Grid Bot Settings](https://wundertrading.com/journal/en/learn/article/best-grid-bot-settings)
- [3Commas Stop Bot Function](https://3commas.io/blog/how-to-implement-stop-bot-function-for-grid-bot)
- [Maximize Grid Bot Performance with Backtesting](https://3commas.io/blog/maximize-grid-bot-performance-automatic-backtesting)
