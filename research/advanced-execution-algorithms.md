# Execution Algorithms for Perpetual Futures Trading - Deep Research

## Table of Contents
1. [TWAP (Time-Weighted Average Price)](#1-twap-time-weighted-average-price)
2. [VWAP (Volume-Weighted Average Price)](#2-vwap-volume-weighted-average-price)
3. [POV (Percentage of Volume)](#3-pov-percentage-of-volume)
4. [Scale Orders / Scaled Orders](#4-scale-orders--scaled-orders)
5. [Iceberg Orders](#5-iceberg-orders)
6. [Other Advanced Algos](#6-other-advanced-algos)
7. [Platform-by-Platform Implementation](#7-platform-by-platform-implementation)
8. [Comparative Analysis](#8-comparative-analysis)

---

## 1. TWAP (Time-Weighted Average Price)

### Core Mechanics

TWAP is an execution algorithm that breaks a large parent order into smaller child orders released at regular intervals between a start time and end time. The goal is to achieve an average execution price close to the time-weighted average price of the specified period.

**Mathematical Formula:**
```
TWAP = (P1 + P2 + P3 + ... + Pn) / n
```
Where P1..Pn are execution prices at each interval.

**Child Order Size Calculation:**
```
Amount Per Suborder = Total Order Amount / Number of Suborders
Number of Suborders = Duration (seconds) / Frequency (seconds)
```

**Minimum Total Quantity (Binance formula):**
```
Min Total Qty = Max(
  Min Notional Value * Number of Sub Orders / Last Traded Price * 1.1,
  Min Order Size * Number of Sub Orders
)
```

### Key Parameters Users Configure

| Parameter | Description | Typical Range |
|-----------|-------------|---------------|
| **Total Quantity** | Full order size to execute | Varies by platform |
| **Duration** | Total execution window | 5 min - 24 hours (Binance), 1-1440 min (Hyperliquid) |
| **Frequency / Interval** | Time between child orders | 5s-120s (Bybit), 10s-120s (Gate.io), 30s fixed (Hyperliquid) |
| **Price Limit** | Max price for buys, min for sells | Optional on most platforms |
| **Price Variance** | Offset from best bid/ask for child order pricing | 0-1% (Gate.io), configurable (OKX) |
| **Reduce Only** | Only close existing positions, never open new ones | Boolean |
| **Randomize** | Vary timing to prevent detection | Boolean (Hyperliquid), Jitter +/-20% (Insilico) |
| **Side** | Buy or sell | BUY / SELL |
| **Position Side** | BOTH, LONG, SHORT (hedge mode) | Enum |

### Risk Controls & Safety Features

1. **Maximum Slippage Per Suborder**: Hyperliquid caps each suborder at 3% slippage
2. **Price Limit / Price Cap**: Child orders will not execute beyond the set limit price
3. **Catch-Up Logic**: If suborders don't fully fill, later suborders can be up to 3x normal size (Hyperliquid)
4. **Auto-Termination Conditions**:
   - Insufficient balance
   - Position mode changes
   - Position value exceeds risk limit
   - Duration expires (7 days max on Bybit)
5. **Activation Price / Trigger**: Start execution only when price reaches threshold (Gate.io)
6. **Price Bounds with Actions** (Insilico Terminal):
   - Pause until price normalizes
   - Abort entire TWAP
   - Execute all remaining immediately
   - Close position (acts as SL/TP)
7. **Volatility Circuit Breakers**: Pause execution when market quality deteriorates
8. **Minimum Notional Per Child**: Each child must meet min notional ($10 on Hyperliquid)

### Handling Partial Fills

- Child orders are typically placed as IOC (Immediate or Cancel) limit orders
- Unfilled portions accumulate and are added to subsequent child orders
- Hyperliquid: TWAP "tries to catch up" during later suborders, constrained to 3x normal size
- Gate.io: Unfilled amounts roll into the next interval's order
- If market moves beyond price limit, execution pauses until price returns

### Stealth Features (Anti-Detection)

- **Frequency Jitter** (Insilico): Randomizes timing +/-20% from scheduled intervals
- **Irregular Lots** (Insilico): Randomizes child order sizes instead of uniform lots
- **Randomize Flag** (Hyperliquid): `t=True` creates unpredictable timing (estimated 10-50s range vs fixed 30s)
- Combined jitter + irregular lots makes detection "practically impossible"

### Advantages
- Simple and predictable execution schedule
- Minimal information leakage (uniform pace)
- Works well in liquid markets with consistent volume
- Good for markets without reliable volume data (where VWAP is hard)
- Steady execution rhythm

### Disadvantages
- Does not adapt to volume; may trade against thin liquidity
- In trending markets, will underperform (buys at higher and higher prices)
- Fixed schedule is detectable without randomization
- No guarantee of full fill if market moves away
- Does not minimize market impact as well as VWAP in markets with strong volume patterns

---

## 2. VWAP (Volume-Weighted Average Price)

### Core Mechanics

VWAP executes orders in proportion to historical/predicted market volume, allocating more shares to high-volume periods and fewer to low-volume periods. Unlike TWAP's uniform schedule, VWAP's pace varies throughout the day.

**Mathematical Formula:**
```
VWAP = SUM(Typical Price_i * Volume_i) / SUM(Volume_i)
Where: Typical Price = (High + Low + Close) / 3
```

**Execution Target Per Bucket:**
```
Target_i = Total_Qty * (Expected_Volume_i / Expected_Total_Volume)
```

### Three Key Ingredients
1. **Total order size** - the full quantity to execute
2. **Trading horizon** - start time to end time
3. **Volume profile forecast** - predicted intraday volume distribution

### Volume Profile Estimation Methods
- **Historical averaging**: Blend 15-, 30-, and 60-day median volume profiles
- **Bucket-based**: Divide trading horizon into time buckets, compute expected volume per bucket from historical data
- **Deep learning** (recent research): Bypasses explicit volume curve prediction, directly optimizes VWAP slippage using automatic differentiation and custom loss functions
- **Composite venue approach**: Blend volume data across multiple exchanges for crypto (single-venue curves are unreliable)

### Key Parameters Users Configure

| Parameter | Description | Typical Range |
|-----------|-------------|---------------|
| **Total Quantity** | Full order size | Platform-specific |
| **Start Time** | When execution begins | Datetime |
| **End Time / Duration** | When execution must complete | Datetime or duration |
| **Limit Price** | Maximum/minimum acceptable price | Optional |
| **Urgency** | How aggressively to front-load execution | LOW/MEDIUM/HIGH (Binance VP) |

### How VWAP Differs From TWAP

| Aspect | TWAP | VWAP |
|--------|------|------|
| Pacing | Uniform over time | Proportional to volume |
| Volume awareness | None | Uses historical volume profile |
| Best for | Illiquid/unpredictable markets | Liquid markets with consistent patterns |
| Complexity | Simple | Higher (needs volume forecasting) |
| Crypto suitability | Better (volume unpredictable) | Harder (volume curves less reliable) |
| Detection risk | Fixed pattern (without jitter) | Natural-looking (follows market) |

### Risk Controls
- **Price limit**: Child orders bounded by parent limit price
- **Queue-position pragmatism**: Post-only orders with short patience windows (300ms), then fall back to crossing
- **Spread monitoring**: Widen/reduce child sizes based on real-time spread width
- **Rate budgets**: Respect exchange rate limits as first-class constraints
- **Regime-aware TCA**: Segment analysis by tight vs. wide spreads, shallow vs. deep books

### Crypto-Specific Challenges
- Volume curves are less predictable than equities
- Fragmented liquidity across venues makes single-exchange profiles unreliable
- 24/7 markets lack traditional "market open/close" volume U-shapes
- Extreme volatility can rapidly invalidate volume forecasts
- Deep learning approaches show promise by optimizing VWAP directly rather than forecasting volume

### Advantages
- Minimizes market impact by trading with natural volume
- Natural-looking execution pattern (harder to detect)
- Better benchmark tracking in liquid, patterned markets
- Industry standard benchmark for institutional execution quality

### Disadvantages
- Requires accurate volume forecasting (challenging in crypto)
- More complex to implement than TWAP
- Volume prediction errors compound in volatile markets
- 24/7 crypto markets lack clear intraday patterns
- Higher computational requirements

---

## 3. POV (Percentage of Volume)

### Core Mechanics

POV (also called Volume Participation or VP) executes orders by maintaining a target participation rate as a percentage of actual market volume. Unlike TWAP/VWAP which follow schedules or predictions, POV reacts to real-time volume.

**Core Formula:**
```
Order_Quantity_per_interval = Market_Volume_per_interval * Participation_Rate
```

**Example:** If participation rate = 10% and 1000 contracts trade in a period, the algo buys/sells 100 contracts.

### Key Parameters Users Configure

| Parameter | Description | Typical Values |
|-----------|-------------|----------------|
| **Participation Rate / Urgency** | Target % of market volume | 1-50% typical; Binance: LOW/MEDIUM/HIGH enum |
| **Total Quantity** | Full order to execute | Min $10,000 notional (Binance) |
| **Start Time** | Begin execution | Datetime |
| **End Time** | Deadline (optional) | Datetime |
| **Limit Price** | Price boundary | Optional |
| **Stop Price / Trigger Price** | Activation level | Optional |
| **Rate Bounds** | Min/max participation range | e.g., 19%-21% around 20% target |

### Binance VP API Parameters (Detailed)

| Parameter | Type | Required | Constraints |
|-----------|------|----------|-------------|
| `symbol` | STRING | Yes | e.g., BTCUSDT |
| `side` | ENUM | Yes | BUY or SELL |
| `quantity` | DECIMAL | Yes | Notional $10,000-$1,000,000 |
| `urgency` | ENUM | Yes | LOW, MEDIUM, HIGH |
| `positionSide` | ENUM | No | BOTH, LONG, SHORT |
| `limitPrice` | DECIMAL | No | Defaults to market |
| `reduceOnly` | BOOLEAN | No | Default: false |
| `clientAlgoId` | STRING | No | Max 32 chars |

### Execution Logic

1. Algorithm monitors real-time market volume tick-by-tick
2. After each time slot, calculates target order quantity based on observed volume
3. Places orders (typically market orders) to maintain participation rate
4. Adjusts dynamically: trades more when market is active, less when quiet
5. Uses aggressive (market) orders since it must keep pace with volume

### Risk Controls
- **Rate bounds**: Allow participation to float within a range (e.g., 19-21%) to avoid excessive aggressive orders
- **Price limits**: Won't execute beyond specified price
- **End time behavior**: Can cancel remaining, complete aggressively, or soft complete
- **Dark pool preference**: Interactive Brokers offers 0-10 scale for dark pool usage
- **Dollar-certain execution**: Trade by dollar value instead of quantity

### Advantages
- Naturally adapts to market liquidity
- "Blends in" with market activity (low information leakage)
- Trades more when liquidity is available, less when it's not
- Outperforms TWAP on larger quantities (per Binance case studies)
- Reduces market impact by pacing with the market

### Disadvantages
- No completion guarantee within timeframe (depends on volume)
- In low-volume markets, may execute very slowly or incompletely
- Tends to use market orders (higher fees, potential slippage)
- Cannot predict total execution time
- Market impact still occurs if participation rate is too high (>20-25%)

---

## 4. Scale Orders / Scaled Orders

### Core Mechanics

Scale orders automatically create multiple limit orders distributed across a user-defined price range. Instead of executing over time (like TWAP/VWAP), they execute over price levels, creating a "ladder" or "grid" of orders.

### Distribution Types

#### 1. Flat / Evenly Split (Linear)
Each sub-order gets identical size and equal price spacing.
```
Price_i = Lower + (Upper - Lower) * i / (n - 1)
Size_i = Total / n
```

#### 2. Increasing
Sub-order sizes increase progressively. Later orders (further from market) are larger.
```
Size_i = Base * (1 + factor)^i  (geometric progression)
```

#### 3. Decreasing
Sub-order sizes decrease progressively. Orders closer to market are larger.

#### 4. Cubic Distribution
Non-linear concentration using cubic curves:
- **cubic**: With skew 0-1.0
  - Buy + skew 1.0 = concentration toward range HIGH
  - Buy + skew 0.0 = concentration toward range LOW
- **icubic**: Inverse cubic (opposite behavior)

#### 5. Custom
Users manually set individual sub-order sizes and prices within the range.

### Key Parameters Users Configure

| Parameter | Description | Typical Values |
|-----------|-------------|----------------|
| **Price Range** | Lower and upper bounds | Absolute prices or % offsets |
| **Number of Orders** | Sub-orders to create | 2-50 (Bybit), up to 50 (Bitfinex), up to 100 (Bitsgap) |
| **Total Quantity** | Full size across all orders | Min/max per platform |
| **Distribution Type** | How size is allocated | Flat, Increasing, Decreasing, Cubic, Custom |
| **Size Skew** | Bias toward high/low end of range | 0.0-1.0 |
| **Price Variance (%)** | Spacing control between levels | Percentage |
| **Reduce Only** | Only reduce position | Boolean |

### Bybit Scaled Order Details

- **Order count**: 2-50 sub-orders
- **Total quantity**: Min = 10x contract minimum; Max = 10x contract maximum
- **Distribution types**: Flat, Increasing, Decreasing, Custom
- **Custom mode constraints**: All percentages must sum to 100%; individual min 0.01%, max 100%
- **Price range**: Upper and lower bounds required
- **Example**: 1,000 ETH across 10 orders at 1,600-1,780 USDT = 100 ETH each, 20 USDT increments, avg fill 1,690 USDT

### Insilico Terminal Scale Order CLI

```
scale <side> <size> into <count> from <price> to <price> [distribution] [reduce] [size_skew]
```

**Examples:**
- `scale buy 10 into 10 from 31000 to 32000` - Linear, 10 orders
- `scale buy 1000$ into 10 from -0.25% to -1%` - Dollar amount, % prices
- `scale buy 20000 into 10 from 31250 to 32000 icubic 1.0` - Inverse cubic
- `scale sell 1 into 10 from 90000 to 100000 cubic 0.25 reduce cubic 0.5` - Price + size skew

### Bitfinex Scaled Order Parameters
- **Lower Price / Upper Price**: Price range boundaries
- **Amount**: Total order size
- **Order Count**: Number of sub-orders (up to 50)
- **Amount Variance (%)**: Randomization of sub-order sizes
- **Price Variance (%)**: Randomization of sub-order prices
- **Distribution**: Controls how total amount is distributed across orders

### Advantages
- Captures range of prices instead of single entry point
- Creates passive liquidity (maker orders = lower fees)
- Natural DCA effect across price levels
- Visual and intuitive for traders
- Can be used for both entry and exit (scaling in/out)

### Disadvantages
- Orders may not all fill if price doesn't traverse full range
- Capital is locked across multiple price levels
- No time-based execution component
- Visible on order book (unless combined with iceberg)
- Requires predicting appropriate price range

---

## 5. Iceberg Orders

### Core Mechanics

An iceberg order hides the total order size by only showing a small "display quantity" on the order book. When the visible portion fills, the next portion is automatically revealed, repeating until the entire order completes.

**Components:**
```
Total Quantity = Display Quantity (visible) + Hidden Quantity (reserve)
```

### Key Parameters Users Configure

| Parameter | Description | Typical Values |
|-----------|-------------|----------------|
| **Total Quantity** | Full order size | Platform-specific |
| **Display Quantity** | Visible portion per tranche | Min: order minimum or 1/15th total (Kraken) |
| **Variance** | Randomization of display qty | 0-100% (TT); 50-100% of avg (OKX) |
| **Split Method** | How to divide the order | Qty per Order or Number of Split Orders (Bybit) |
| **Order Preference** | Execution aggressiveness | Chase Limit, Chase Limit (taker), Chase Limit (offset), Fixed Prices (Bybit) |
| **Price Limit** | Boundary price | Only for Chase Limit modes (Bybit) |
| **Price Variance** | Offset from BBO for child pricing | Constant or Percentage (OKX) |
| **Post-Only** | Maker only execution | Available for Chase Limit modes (Bybit) |
| **Time in Force** | GTC or Day | Configurable |
| **Price Increment** | Progressive price adjustment per tranche | Float (Ember/Deltix) |
| **Min/Max Time Interval** | Delay between refills | Configurable (Ember/Deltix) |

### Refill Logic (How It Works Step-by-Step)

1. First child order placed with display quantity at specified price
2. Child order appears on order book like normal limit order
3. When child order fills completely, system immediately creates next child
4. Next child uses same price (or adjusted price if PriceIncrement set)
5. If variance is set, next child size = DisplayQty * random(1-variance, 1+variance)
6. Process repeats until total quantity filled or order cancelled/expired
7. If price moves beyond 2x variance, previous order cancelled and new one placed at updated price (OKX)

### Platform-Specific Implementation Details

#### Bybit Iceberg
- **Split Settings**: Qty per Order OR No. of Split Orders
- **Order Preferences**:
  - **Chase Limit (taker)**: Aggressively crosses spread to fill faster
  - **Chase Limit**: Placed at best bid/ask, dynamically adjusts
  - **Chase Limit (offset)**: Fixed offset from best bid/ask
  - **Fixed Prices**: Static price for each sub-order
- **Price Limit**: Available for Chase Limit modes
- **Post-Only**: Available for Chase Limit and Chase Limit (offset)
- **Limits**: Max 10 iceberg orders per account, 1 per symbol
- **Duration**: Auto-terminates after 7 days
- **Max sub-order size**: 5x the maximum order size

#### OKX Iceberg
- **Price Variance**: Constant value or percentage-based
- **Average Amount**: Target child size; actual = 50-100% of this (random)
- **Total Amount**: Full order size; bot terminates when reached
- **Pricing**: `Buy Price = Last Buy1 Price * (1 - Price Variance)`
- **Resubmission**: When price exceeds 2x variance from order, cancel and repost
- **Pause**: When market exceeds price limit; resumes when price returns
- **Modes**: Quick execution, Price-speed balance, Passive queuing
- **Markets**: Spot, Perpetual, Futures, Margin, Options

#### Kraken Iceberg
- **Display Quantity**: Cannot be smaller than order minimum or 1/15th total
- **Order Quantity**: Total including hidden portion
- Simple implementation focused on display vs. hidden split

#### TT (Trading Technologies) Iceberg - Professional Grade
- **Display Qty**: Fixed quantity or percentage-based (rounds at 0.5 boundary)
- **Variance**: 0-100% randomization around display quantity
- **Offset Pricing**: LTP, Ask, Bid, PrevSlice, Same/Opposite Side
- **With A Tick**: Auto-reprices toward market when opposite-side drops below threshold
- **Triggers**: If-Touched, Stop, Trailing If-Touched, Trailing Stop
- **Start/End**: Now, scheduled time, pre-open, market open / GTC, scheduled, day-end
- **End Action**: Cancel, Go to Market, Limited Market (with tick offset)
- **Auto-Resubmit on GTD Expiry**: Resubmits at session close

#### Ember/Deltix ICEBERG - Institutional Grade
- **MaxFloor**: Display quantity limit (immutable after submission)
- **QuantityVariance**: 0-100% randomization
- **MinTimeInterval / MaxTimeInterval**: Control delay between refills
- **PriceIncrement**: Progressive price adjustment per child
- **OrderDuration**: Expiration window (HH:MM:SS format)
- **EligibleExchanges**: Restrict to specific venues
- **Immediate vs. Interval-Based Replenishment**: Two operational modes

### Advantages
- Hides true order size from market
- Reduces market impact and prevents front-running
- Allows large orders to execute without moving price
- Each visible tranche looks like a normal order
- With variance, harder to detect algorithmically

### Disadvantages
- Execution takes longer than market orders
- Can be detected by sophisticated algorithms (especially without variance)
- Price may move away before full execution
- More complex to manage than simple limit orders
- Some venues have minimum display requirements

---

## 6. Other Advanced Algos

### Chase Limit Order (Bybit, Insilico)

**How it works:** A limit order placed at the best bid/ask that dynamically adjusts its price to follow changing market conditions.

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| Chase Price | Ask1/Bid1 or fixed distance from best price |
| Maximum Chase Distance | Value or % - order stops chasing when reached |
| Trigger Price | Activation level (optional) |
| Post-Only | Default enabled; ensures maker execution |

**Mechanics:**
- Order tracks the best bid (for buys) or best ask (for sells)
- Reprices as BBO moves to maintain position at front of queue
- Stops chasing once max distance reached; stays at last price
- Default post-only ensures maker fees
- Can be combined with TWAP (Chase TWAP in Insilico)

**Use Case:** Execute large orders as maker with minimal waiting time while controlling maximum price deviation.

### Peg Orders

**How it works:** Order price automatically adjusts relative to a reference value (mid-price, best bid/ask, or other benchmark).

**Types:**
- **Pegged-to-Best**: Follows best bid/ask
- **Pegged-to-Midpoint**: Follows mid-price between best bid and ask
- **Pegged-to-Primary**: Follows the NBBO on order's own side
- **Pegged-to-Market**: Follows the NBBO on the opposite side

**Use Case:** Maintain competitive queue position without manual repricing. Ideal in volatile markets.

### Implementation Shortfall (IS)

**How it works:** Minimizes the difference between decision price and actual execution price. Balances urgency (timing risk) against market impact.

**Key Parameters:**
- Risk aversion level
- Urgency profile
- Volatility estimate
- Expected market impact model

**Mechanics:**
- Front-loads execution when urgency is high
- Back-loads when market impact concern dominates
- Adaptive versions adjust based on real-time price movement
- If price moves favorably, slows down; if adversely, speeds up

### Sniper Algorithm

**How it works:** Waits passively for liquidity to appear at favorable prices, then aggressively takes it. Minimal market footprint.

**Characteristics:**
- Sits dark (no visible orders) until opportunity detected
- Sweeps available liquidity at target price or better
- Returns to passive state after execution
- Named alongside "Stealth", "Dagger", "Guerrilla" in same category
- Focus: minimize information leakage

### Close / MOC (Market on Close)

**How it works:** Targets the closing price as benchmark, concentrating execution near market close.

**Use in crypto:** Less relevant for 24/7 markets, but applicable to funding rate periods or specific settlement windows.

### Adaptive Shortfall

**How it works:** Combines IS with real-time adaptation. Divides trading horizon into portions, minimizes market volume participation needed to achieve target volume in each portion.

### JIT (Just-In-Time) Auction (Drift Protocol)

**How it works:** When a user submits a market order, the protocol initiates a 5-second Dutch auction. Market makers bid to fill the order at progressively better prices.

**Flow:**
1. User submits market order
2. 5-second Dutch auction begins
3. Market makers compete to fill at best price
4. If no maker fills, order goes to AMM
5. Three liquidity sources: JIT auction > DLOB limit orders > AMM

### Oracle Limit Orders (Drift Protocol)

**How it works:** Specifies an offset from the Oracle price rather than a fixed limit price. Order executes when the oracle-adjusted condition is met.

**Use Case:** Maintains orders relative to fair value without manual repricing as oracle price moves.

---

## 7. Platform-by-Platform Implementation

### Binance

**Available Algos:** TWAP, VP (POV)

**TWAP:**
- Endpoint: `POST /sapi/v1/algo/futures/newOrderTwap`
- Duration: 300-86,400 seconds (5 min - 24 hours)
- Notional: $1,000 - $1,000,000 USDT equivalent
- Max concurrent: 30 algo orders
- Constraint: `quantity * 60 / duration > minQty`
- USD-M contracts only
- Parameters: symbol, side, quantity, duration, positionSide, limitPrice, reduceOnly, clientAlgoId

**VP (POV):**
- Endpoint: `POST /sapi/v1/algo/futures/newOrderVp`
- Urgency: LOW, MEDIUM, HIGH
- Notional: $10,000 - $1,000,000 USDT equivalent
- Max concurrent: 10 algo orders
- USD-M contracts only
- Parameters: symbol, side, quantity, urgency, positionSide, limitPrice, reduceOnly, clientAlgoId

**Case Studies:** POV outperforms TWAP on larger quantities due to adaptive volume-following behavior.

### Bybit

**Available Algos:** TWAP, Iceberg, Scaled Orders, Chase Limit Order

**TWAP:**
- Frequency: 5-120 seconds per suborder
- Duration: Up to 7 days auto-termination
- Max concurrent: 20 strategies total, 10 per symbol
- Suborder max: Half the symbol's max order size
- Auto-termination: Insufficient balance, position mode change, risk limit exceeded

**Iceberg:**
- Split methods: Qty per Order or Number of Split Orders
- Order preferences: Chase Limit (taker), Chase Limit, Chase Limit (offset), Fixed Prices
- Max: 10 iceberg orders per account, 1 per symbol
- Duration: 7 days max
- Sub-order max: 5x max order size
- Post-only available for Chase Limit modes

**Scaled Orders:**
- Count: 2-50 sub-orders
- Total qty: 10x min to 10x max order size
- Distributions: Flat, Increasing, Decreasing, Custom
- Custom: Manual price/size per sub-order, must sum to 100%

**Chase Limit:**
- Chase modes: At Ask1/Bid1 or fixed distance
- Max chase distance: Value or percentage
- Trigger price: Optional activation level
- Default post-only for maker execution

### OKX

**Available Algos:** Iceberg, TWAP (as trading bots)

**Iceberg:**
- Price Variance: Constant or Percentage
- Average Amount: Target per-order size; actual = 50-100% random
- Total Amount: Full execution target
- Modes: Quick execution, Price-speed balance, Passive queuing
- Pricing: `Order Price = BBO +/- Variance`
- Cancellation: When price > 2x variance from order price
- Markets: Spot, Perpetual, Futures, Margin, Options

**TWAP:**
- Price Variance: Constant or Percentage around BBO
- Price Limit: Desired execution price
- Time Interval: Spacing between orders
- Order Size: Per-order amount
- Total Amount: Full execution target
- Slippage: Var. (absolute) or Ratio (percentage)
- Best for illiquid markets

### dYdX (v4)

**Available Order Types:** Market, Limit, Stop Market, Stop Limit, Take Profit Market, Take Profit Limit

**Advanced Features:**
- Good-Til-Date expiration
- Immediate or Cancel (IOC)
- Fill or Kill
- Post-Only
- Reduce-Only (for FOK/IOC orders only)
- Oracle price clamping: Last traded price clamped by min/max PPM from oracle
- No native TWAP/VWAP/Iceberg/Scale orders
- Fully decentralized orderbook on Cosmos SDK chain

### Drift Protocol (Solana)

**Available Order Types:** Market, Limit, Trigger Market, Trigger Limit, Oracle Limit, Scale

**Unique Features:**
- **JIT (Just-In-Time) Auction**: 5-second Dutch auction for every market order
- **Three liquidity layers**: JIT auction > DLOB limit orders > AMM
- **Oracle Limit Orders**: Offset from oracle price, not fixed price
- **Scale Orders**: Multiple limits across price range with size distribution
- **Decentralized Keepers**: Off-chain orderbook construction by keeper network
- **Trigger Price Calculation**: Median of three values:
  1. Oracle + (Mark 5min TWAP - Oracle 5min TWAP)
  2. Last Trade Price
  3. Oracle * (1 + Last Funding Rate * Time/Period)

### Hyperliquid

**Available Algos:** TWAP, Scale Orders, (Iceberg mentioned in docs)

**TWAP:**
- Suborder interval: Fixed 30 seconds
- Max slippage per suborder: 3%
- Duration: 1-1,440 minutes (24 hours)
- Catch-up: Later suborders up to 3x normal size
- Randomize: Boolean flag for unpredictable timing
- Min notional per child: $10
- Reduce-only: Available
- API payload: `{type: "twapOrder", twap: {a, b, s, r, m, t}}`
- Cancel: `{type: "twapCancel", a, t}`
- Status lifecycle: activated > completed/terminated/canceled

**Scale Orders:**
- Multiple limit orders in a set price range
- Configured via UI or CLI (Insilico/Dexly terminals)
- Distribution, number of orders, size allocation configurable

### 3Commas

**Available Algos:** DCA Bot, Grid Bot, Smart Trade

**DCA Bot (Scale-like execution):**
- Base Order + Safety Orders at incrementally deeper levels
- **Scale multiplier**: Multiplies % step between orders (e.g., 1% base, 2x scale = 1%, 3%, 7%)
- **Two deviation modes**:
  - From Base Order: All safety orders calculated from entry, execute simultaneously
  - From Last Executed: Each calculated from previous fill, one at a time
- **Safety order triggers**: % deviation, RSI, Bollinger Bands, MACD, or custom webhooks
- **Multiple Take Profit**: Up to 4 tiers for exits
- **AI Trailing Stop Loss**: Dynamically raises stop as price rises
- **Order size scaling**: Multiplier increases each subsequent safety order size

### Coinalyze

**Not an execution platform.** Coinalyze is an analytics/charting tool for derivatives markets. Provides:
- Aggregated open interest, funding rates, liquidations, CVD across 15+ exchanges
- Liquidation heatmaps for identifying support/resistance
- Order flow analysis tools
- API for automated alerts/triggers (not direct execution)
- No native execution algorithms

### Tradovate

**Available Features:** Standard order types + ATM strategies

**Order Types:** Market, Limit, Stop Market, Stop Limit
**ATM (Advanced Trade Management):**
- Pre-defined Stop Loss + Profit Target placed on entry fill
- OCO (One-Cancels-Other) for SL/TP pairs
- Auto Breakeven: Move stop to entry after target movement
- AutoTrail: Trailing stop loss
- Cloud-based execution; API available for automation
- No native TWAP/VWAP/Iceberg algorithms

### Sierra Chart

**Available Features:** Extensive automated trading via C++/ACSIL and Spreadsheet Studies

- **Order Types:** Market, Limit, Stop, OCO, Trailing Stop
- **Automated Trading**: C++ custom studies (ACSIL) or Spreadsheet-based strategies
- **Iceberg**: Previously supported via Teton routing; discontinued with iLink 3 transition
- **Custom Algos**: Users build their own TWAP/VWAP/POV via C++ or spreadsheet formulas
- **200+ built-in technical studies** for strategy development
- **Direct exchange connections** for low-latency execution
- No pre-built TWAP/VWAP/POV algorithms; users implement their own

### Quantower

**Available Algos:** Iceberg, Time Split, Scheduled, Local SL/TP, Limit if Touched, Market if Touched

**Time Split (TWAP-like):**
- Divides order into equal parts
- Sends at specified time intervals
- Display Quantity parameter
- Runs locally (terminates when platform closes)

**Iceberg:**
- Available as order placing strategy
- Runs locally on trader's machine
- Specific parameters not well-documented publicly

**Limitations:**
- All automation runs locally; closing platform terminates strategies
- No cloud-based persistent execution
- Exchange-dependent feature availability

### BookMap

**Not primarily an execution platform.** BookMap specializes in order flow visualization:

- **Iceberg Detection**: Stops & Icebergs (SI) indicators detect and track hidden orders
- **MBO Data**: Market-by-order data for granular liquidity analysis
- **Heatmaps**: Visualize order book depth and hidden liquidity zones
- **API**: Custom algorithm integration via APIs
- **No native execution algos**: Designed for analysis, not direct execution
- Complements execution platforms rather than replacing them

---

## 8. Comparative Analysis

### Algo Selection Guide

| Scenario | Best Algo | Reason |
|----------|-----------|--------|
| Large order, predictable market | VWAP | Follows volume for minimal impact |
| Large order, unpredictable volume | TWAP | Doesn't need volume forecast |
| Adapt to real-time conditions | POV | Naturally follows market activity |
| DCA into position across prices | Scale Orders | Captures range of prices |
| Hide large order from market | Iceberg | Only shows small portion |
| Fill as maker with low slippage | Chase Limit | Tracks BBO for maker fills |
| Urgent execution, low info leakage | Sniper | Takes liquidity only when favorable |
| Minimize arrival price deviation | Implementation Shortfall | Balances urgency vs. impact |

### Platform Feature Matrix

| Platform | TWAP | VWAP | POV | Scale | Iceberg | Chase | Custom Algo |
|----------|------|------|-----|-------|---------|-------|-------------|
| Binance | Yes | No | Yes (VP) | No | No | No | API |
| Bybit | Yes | No | No | Yes | Yes | Yes | API |
| OKX | Yes | No | No | No | Yes | No | API |
| Gate.io | Yes | No | No | No | No | No | API |
| Hyperliquid | Yes | No | No | Yes | Yes* | No | API |
| dYdX v4 | No | No | No | No | No | No | API |
| Drift | No | No | No | Yes | No | No | SDK |
| 3Commas | No | No | No | DCA Bot | No | No | Webhooks |
| Tradovate | No | No | No | No | No | No | API |
| Sierra Chart | DIY | DIY | DIY | DIY | Removed | No | C++/ACSIL |
| Quantower | Time Split | No | No | No | Yes | No | Scripting |
| BookMap | No | No | No | No | Detection | No | API |

*Hyperliquid iceberg mentioned in docs but implementation details limited

### Key Parameters Comparison (TWAP)

| Parameter | Binance | Bybit | OKX | Gate.io | Hyperliquid |
|-----------|---------|-------|-----|---------|-------------|
| Min Duration | 5 min | N/A | N/A | 5 min | 1 min |
| Max Duration | 24 hours | 7 days | N/A | 24 hours | 24 hours |
| Frequency | Auto | 5-120s | Configurable | 10-120s | Fixed 30s |
| Min Notional | $1,000 | Varies | N/A | N/A | $10/child |
| Max Notional | $1,000,000 | Varies | N/A | N/A | N/A |
| Max Concurrent | 30 | 20 | N/A | N/A | N/A |
| Randomize | No | No | No | No | Yes |
| Price Limit | Yes | Yes | Yes | Yes | No (3% max slippage) |
| Reduce Only | Yes | Yes | N/A | Yes | Yes |
| Contracts | USD-M only | All | All | All | All |

### Risk Control Comparison

| Feature | TWAP | VWAP | POV | Scale | Iceberg |
|---------|------|------|-----|-------|---------|
| Price Limit | Yes | Yes | Yes | N/A (limit orders) | Yes |
| Slippage Control | Per-child | Per-child | Rate bounds | Passive (limit) | Per-tranche |
| Time Guarantee | Yes | Yes | No | No | No |
| Fill Guarantee | No | No | No | No | No |
| Completion Certainty | Medium | Medium | Low | Low | Medium |
| Detection Risk | Medium | Low | Low | Low | Low (with variance) |
| Market Impact | Medium | Low | Low | Low | Low |
| Implementation Complexity | Low | High | Medium | Low | Medium |

---

## Sources

- [Binance TWAP & POV Strategies](https://www.binance.com/en/blog/otc/what-are-algorithmic-orders-twap-and-pov-strategies-explained-572102887905225345)
- [Binance Futures TWAP API](https://developers.binance.com/docs/algo/future-algo/Time-Weighted-Average-Price-New-Order)
- [Binance VP API](https://developers.binance.com/docs/algo/future-algo)
- [Bybit TWAP Strategy](https://www.bybit.com/en/help-center/article/Introduction-to-TWAP-Strategy)
- [Bybit Iceberg Order](https://www.bybit.com/en/help-center/article/Iceberg-Order)
- [Bybit Scaled Order](https://www.bybit.com/en/help-center/article/Scaled-order)
- [Bybit Chase Limit Order](https://www.bybit.com/en/help-center/article/Chase-Order)
- [OKX Iceberg Strategy](https://www.okx.com/help/xii-iceberg-strategy)
- [OKX TWAP Bot](https://www.okx.com/en-us/help/how-do-i-use-the-twap-trading-bot)
- [Hyperliquid Order Types](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types)
- [Hyperliquid TWAP Technical Reference (Chainstack)](https://docs.chainstack.com/docs/hyperliquid-twap-orders)
- [dYdX Order Types](https://help.dydx.trade/en/articles/166981-perpetual-order-types-on-dydx-chain)
- [Drift Protocol Order Types](https://docs.drift.trade/trading/order-types)
- [Drift All Order Types](https://docs.drift.trade/trading/all-order-types)
- [Gate.io TWAP Order](https://www.gate.com/help/futures/questions/38289/time-weighted-average-price-twap-order)
- [Kraken Iceberg Orders](https://support.kraken.com/articles/iceberg-orders)
- [Bitfinex Scaled Orders](https://support.bitfinex.com/hc/en-us/articles/115003506585-What-is-a-Scaled-order-on-Bitfinex)
- [TT Iceberg Order](https://library.tradingtechnologies.com/trade/tto-iceberg-order.html)
- [Ember ICEBERG Algorithm](https://ember.deltixlab.com/docs/algos/iceberg/)
- [Interactive Brokers POV](https://www.ibkrguides.com/traderworkstation/fox-pov.htm)
- [POV Algorithm (CoinGlass)](https://www.coinglass.com/learn/what-is-pov-en)
- [Coinbase VWAP](https://help.coinbase.com/en/prime/trading-and-funding/vwap-order-type)
- [TWAP/VWAP Crypto Microstructure (Axon Trade)](https://axon.trade/twap-vwap-that-survives-crypto-microstructure)
- [Deep Learning for VWAP in Crypto (arXiv)](https://arxiv.org/html/2502.13722v2)
- [Insilico Terminal TWAP](https://docs.insilicoterminal.com/documentation/market/twap)
- [Insilico Terminal Scale Orders](https://docs.insilicoterminal.com/documentation/terminal-cli/scale-orders)
- [Dexly Order Types](https://dexly.trade/learn/order-types-explained)
- [3Commas DCA Bot](https://help.3commas.io/en/articles/3108940-dca-bot-interface-and-main-settings)
- [Quantower Order Placing Strategies](https://help.quantower.com/quantower/trading-panels/order-entry/order-placing-strategies)
- [Quantower Algo Order Types (AMP)](https://help.ampfutures.com/trading-platforms/quantower/trading-panels/order-entry/algo-order-types)
- [BookMap Iceberg Detection](https://bookmap.com/knowledgebase/docs/Addons-Stops-And-Icebergs-On-Chart-Indicator)
- [Sierra Chart Automated Trading](https://www.sierrachart.com/index.php?page=doc/AutoTradeManagment.php)
- [Tradovate Futures Orders](https://support.tradovate.com/s/article/Types-of-Futures-Orders-Tradovate?language=en_US)
- [TWAP vs VWAP (Chainlink)](https://chain.link/education-hub/twap-vs-vwap)
- [Algorithmic Trading Wikipedia](https://en.wikipedia.org/wiki/Algorithmic_trading)

---

## 9. HypeTerminal Advanced Execution Panel — Design Ideas

### Why Build This

Hyperliquid currently supports TWAP (fixed 30s intervals, 3% slippage cap, basic randomize flag) and Scale Orders natively. No other CEX-grade execution algos exist on-chain. HypeTerminal can become the **first frontend to offer institutional-grade execution on Hyperliquid** by implementing client-side algo orchestration on top of Hyperliquid's API. This is a significant competitive moat — no other Hyperliquid frontend (Insilico, Dexly, Rage Trade) offers a unified execution panel with multiple algo types.

### Architecture: Client-Side Algo Engine

Since Hyperliquid only exposes basic order primitives via API, all advanced algos must run **client-side** (browser or dedicated worker). Key architecture decisions:

```
┌─────────────────────────────────────────────┐
│           Advanced Execution Panel           │
│  ┌─────────┐ ┌─────────┐ ┌───────────────┐ │
│  │  TWAP   │ │  Scale  │ │   Iceberg     │ │
│  │  Config  │ │  Config │ │   Config      │ │
│  └────┬────┘ └────┬────┘ └──────┬────────┘ │
│       │           │              │           │
│  ┌────▼───────────▼──────────────▼────────┐ │
│  │         Algo Execution Engine          │ │
│  │  ┌──────────┐  ┌──────────────────┐    │ │
│  │  │ Scheduler │  │ Order Manager    │    │ │
│  │  │ (timers)  │  │ (fill tracking)  │    │ │
│  │  └──────────┘  └──────────────────┘    │ │
│  │  ┌──────────┐  ┌──────────────────┐    │ │
│  │  │ Risk     │  │ WebSocket Feed   │    │ │
│  │  │ Monitor  │  │ (price/fills)    │    │ │
│  │  └──────────┘  └──────────────────┘    │ │
│  └────────────────────────────────────────┘ │
│                     │                        │
│  ┌──────────────────▼────────────────────┐  │
│  │      Hyperliquid Exchange API         │  │
│  │  place_order / cancel / user_state    │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**Key considerations:**
- Use a **Web Worker** or **SharedWorker** for the execution engine so tab focus doesn't affect timers
- Persist active algo state to **localStorage/IndexedDB** for recovery on page refresh
- Subscribe to **user fills** WebSocket channel for real-time fill tracking
- Use **requestIdleCallback** or **setInterval in worker** for child order scheduling
- Implement **heartbeat** to detect disconnection and pause algos

### Algo Implementations for Hyperliquid

#### 1. Enhanced TWAP (Upgrade over native)

**Why better than native:** Hyperliquid's native TWAP has a fixed 30s interval and limited controls. Client-side TWAP can offer:

| Feature | Native HL | HypeTerminal Enhanced |
|---------|-----------|----------------------|
| Interval | Fixed 30s | 5s - 300s configurable |
| Price limit | 3% slippage only | Configurable limit price |
| Randomization | Boolean flag | Jitter % (0-50%) + size variance |
| Catch-up | 3x max | Configurable 1x-5x catch-up multiplier |
| Price bounds | None | Pause / Abort / Execute all / Close position |
| Stealth | Basic | Time jitter + size jitter + irregular lots |
| Progress | Status only | Real-time progress bar + avg fill price |
| Urgency | None | Front-load / Back-load / Uniform profiles |

**Parameters UI:**
```
┌─────────────────────────────────────────┐
│  TWAP                              [?]  │
├─────────────────────────────────────────┤
│  Side:     [Buy ▾]   Reduce Only: [ ]   │
│  Size:     [________] ETH               │
│  Duration: [__] h [__] m                │
│  Interval: [30s ▾] (5s/10s/30s/60s/    │
│                      120s/300s)         │
│                                         │
│  ── Advanced ──────────────────────     │
│  Price Limit:    [________] (optional)  │
│  Max Slippage:   [3%  ▾]               │
│  Catch-up:       [3x  ▾]               │
│  Randomize Time: [20% ▾]               │
│  Randomize Size: [15% ▾]               │
│  If Price Out of Bounds: [Pause ▾]     │
│                                         │
│  [Start TWAP]                           │
└─────────────────────────────────────────┘
```

#### 2. Scale Orders (Enhanced)

**Why better than native:** Add distribution visualization, more distribution types, and combining with iceberg.

**Parameters UI:**
```
┌─────────────────────────────────────────┐
│  Scale Order                       [?]  │
├─────────────────────────────────────────┤
│  Side:   [Buy ▾]     Reduce Only: [ ]  │
│  Size:   [________] ETH                │
│  From:   [________] (or [-1.0%])        │
│  To:     [________] (or [-5.0%])        │
│  Orders: [10 ▾] (2-50)                 │
│                                         │
│  Distribution: [● Flat ○ Inc ○ Dec     │
│                 ○ Cubic ○ Custom]       │
│  Skew:   [──────●────] 0.5             │
│                                         │
│  ── Preview ───────────────────────     │
│  │ ▐                                    │
│  │ ▐▐                                   │
│  │ ▐▐▐                                  │
│  │ ▐▐▐▐                                 │
│  │ ▐▐▐▐▐▐                               │
│  │ ▐▐▐▐▐▐▐▐▐                            │
│  └──────────── price →                  │
│  Avg Entry: ~$3,142.50                  │
│  Total Notional: $31,425                │
│                                         │
│  [Place Scale Orders]                   │
└─────────────────────────────────────────┘
```

**Distribution visualization** is the killer feature — users see exactly how their capital is distributed across price levels. Update in real-time as they drag the skew slider.

#### 3. Iceberg Orders (New for Hyperliquid)

**Client-side implementation** since Hyperliquid doesn't have native iceberg:

**Logic:**
1. Place first child order (display qty) as limit order
2. Subscribe to user fills WebSocket
3. On complete fill of child → immediately place next child
4. Randomize next child size within variance range
5. If using Chase mode → reprice on BBO change
6. Continue until total qty filled or cancelled

**Parameters UI:**
```
┌─────────────────────────────────────────┐
│  Iceberg                           [?]  │
├─────────────────────────────────────────┤
│  Side:       [Buy ▾]                    │
│  Total Size: [________] ETH            │
│  Show Size:  [________] ETH            │
│  Price:      [________]                 │
│                                         │
│  Pricing Mode: [● Fixed Price           │
│                 ○ Chase (track BBO)     │
│                 ○ Chase + Offset]       │
│  Size Variance: [──●──────] 20%         │
│  Post Only:     [✓]                     │
│                                         │
│  ── Progress ──────────────────────     │
│  Filled: 2.4 / 10.0 ETH (24%)         │
│  ████████░░░░░░░░░░░░░░░░░ 24%         │
│  Avg Price: $3,141.20                   │
│  Tranches: 3 / ~13                      │
│                                         │
│  [Start Iceberg]     [Cancel]           │
└─────────────────────────────────────────┘
```

#### 4. Chase Limit Order (New)

**Logic:**
1. Place limit order at current best bid (buy) or ask (sell)
2. Subscribe to L2 book updates
3. When BBO moves → cancel and replace at new BBO
4. Stop chasing when max distance reached
5. Post-only by default for maker fees

**Parameters:**
- Max chase distance (absolute or %)
- Trigger price (optional — start chasing when reached)
- Post-only toggle
- Chase mode: BBO / Mid-price / Offset from BBO

#### 5. POV / Volume Participation (Advanced — Phase 2)

**Challenge:** Requires real-time volume monitoring. Can be approximated by:
1. Subscribing to trades WebSocket
2. Accumulating volume in rolling windows (e.g., 1-minute buckets)
3. Calculating target order size = window_volume × participation_rate
4. Placing IOC orders at end of each window

**Parameters:**
- Participation rate: 1-50%
- Total quantity
- Duration (optional deadline)
- Price limit
- Urgency: LOW (5%) / MEDIUM (15%) / HIGH (25%) or custom %

### Unified Execution Panel UI

**Design approach:** Tab-based algo selector within the existing trade panel, or a dedicated "Algo" mode toggle.

```
┌─────────────────────────────────────────────────────┐
│ Order Type: [Limit] [Market] [Stop] [Algo ●]        │
├─────────────────────────────────────────────────────┤
│ [TWAP] [Scale] [Iceberg] [Chase] [POV]              │
├─────────────────────────────────────────────────────┤
│                                                      │
│  (Selected algo's parameter form appears here)       │
│                                                      │
├─────────────────────────────────────────────────────┤
│ ── Active Algos ─────────────────────────────────── │
│                                                      │
│ 🟢 TWAP Buy 5.0 ETH   42% done   avg $3,141        │
│    [Pause] [Cancel] [Details]                        │
│                                                      │
│ 🟢 Iceberg Sell 2.0 BTC  18% done  avg $67,420     │
│    [Pause] [Cancel] [Details]                        │
│                                                      │
│ 🔴 Scale Buy 100 SOL   Completed  avg $142.30       │
│    [Details] [Dismiss]                               │
└─────────────────────────────────────────────────────┘
```

### Active Algo Monitoring Dashboard

A bottom panel or sidebar showing all running algos with:
- **Progress bar** with filled/remaining quantity
- **Average fill price** vs. benchmark (TWAP/VWAP of period)
- **Execution quality score** (actual avg vs. theoretical benchmark)
- **Child order history** (expandable — time, price, size, status)
- **Real-time PnL** of the algo'd position
- **Pause / Resume / Cancel** controls
- **Time remaining** countdown

### Execution Quality Analytics (Post-Trade)

After algo completion, show TCA (Transaction Cost Analysis):
- **Slippage**: avg fill price vs. arrival price
- **Market impact**: price movement during execution
- **Benchmark comparison**: actual avg vs. TWAP/VWAP of the period
- **Participation rate**: what % of market volume the algo consumed
- **Fill rate**: % of target quantity executed
- **Cost analysis**: fees paid, estimated savings vs. market order

### Risk Controls (All Algos)

Every algo should have these safety features:
1. **Max slippage per child order** (default 3%, configurable)
2. **Price limit / price bounds** — pause or abort when breached
3. **Total notional cap** — prevent runaway execution
4. **Kill switch** — one-click cancel all active algos
5. **Disconnect detection** — pause all algos on WebSocket disconnect, resume on reconnect
6. **Position limit check** — verify each child won't breach user's max position size
7. **Rate limit awareness** — respect Hyperliquid's API rate limits (1200 req/min)
8. **Balance check** — verify sufficient margin before each child order

### Implementation Priority & Phases

**Phase 1 — MVP (High Impact, Feasible)**
1. **Enhanced TWAP** — client-side with configurable intervals, jitter, price limits
2. **Enhanced Scale Orders** — distribution visualization, skew slider, cubic distributions
3. **Active algo monitoring** — progress bars, avg fill, pause/cancel

**Phase 2 — Differentiation**
4. **Iceberg Orders** — client-side fill-tracking + auto-refill
5. **Chase Limit** — BBO-tracking with max distance
6. **Execution quality analytics** — post-trade TCA

**Phase 3 — Institutional Grade**
7. **POV** — volume participation with real-time volume monitoring
8. **Combo algos** — Iceberg + TWAP, Scale + Chase
9. **Custom algo builder** — visual node-based algo designer (long-term vision)
10. **Multi-leg execution** — spread trades, basis trades

### Technical Considerations for Hyperliquid

1. **Rate limits**: Hyperliquid allows ~1200 requests/min. A 5s TWAP interval = 12 orders/min. Running multiple algos simultaneously needs rate limit pooling.
2. **Order types available**: Limit, Market, Stop, Scale, TWAP (native). Client algos should use **limit IOC** for child orders to avoid stale resting orders.
3. **WebSocket channels needed**: `userFills` (fill tracking), `l2Book` (BBO for chase/iceberg pricing), `trades` (volume for POV), `orderUpdates` (order status).
4. **Vault/sub-account support**: Algos should work with vault addresses, not just main wallet.
5. **Builder fee**: HypeTerminal can attach a small builder fee to algo orders as monetization.
6. **Testnet**: All algos should be testable on Hyperliquid testnet before mainnet deployment.

### Competitive Landscape

| Frontend | TWAP | Scale | Iceberg | Chase | POV | Visualization |
|----------|------|-------|---------|-------|-----|---------------|
| Hyperliquid UI | Basic | Basic | No | No | No | None |
| Insilico Terminal | Enhanced (CLI) | Enhanced (CLI) | No | Yes (CLI) | No | None (CLI-only) |
| Dexly | Basic | Basic | No | No | No | Minimal |
| **HypeTerminal** | **Enhanced** | **Enhanced + Viz** | **Yes** | **Yes** | **Phase 2** | **Full** |

HypeTerminal's advantages: **GUI-first** (vs Insilico's CLI), **visualization** (distribution previews, progress tracking), **unified panel** (all algos in one place), **execution analytics** (no other HL frontend offers TCA).
