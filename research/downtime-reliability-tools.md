# Hyperliquid Uptime, Downtime Response & Backup Execution Research

## 1. How Traders Handle Hyperliquid Downtime

### Major Incidents Timeline

**March 2025 — JELLY Market Manipulation Attack**
- A trader opened a $4.1M short on JELLY while two other accounts took opposing $2.15M and $1.9M long positions
- The attacker pumped JELLY's price by 429% across multiple exchanges within one hour
- The Hyperliquidity Provider (HLP) vault faced $13.5M in unrealized losses; HYPE token fell 20%
- Hyperliquid's validators reached consensus in two minutes to delist JELLY and settle all positions at $0.0095 (vs. $0.50 market price)
- The rapid validator consensus and account freezes revealed centralization concerns — the attacker still withdrew $6.26M of $7.17M deposited before withdrawals were frozen
- Traders who held JELLY positions had them force-settled at a price chosen by validators, not the market

Sources: [Halborn Explainer](https://www.halborn.com/blog/post/explained-the-hyperliquid-hack-march-2025), [CoinDesk](https://www.coindesk.com/markets/2025/03/26/hyperliquid-delists-jellyjelly-after-vault-squeezed-in-usd13m-tussle), [OAK Research](https://oakresearch.io/en/analyses/investigations/hyperliquid-jelly-attack-context-vulnerability-team-solution)

**July 29, 2025 — Major API Outage (37 minutes)**
- API servers collapsed between 14:10 and 14:47 UTC due to a spike in traffic
- Hyperliquid was carrying record open interest of $14.7B at the time
- Traders could not: open/close positions, execute trades, cancel orders, use stop-losses, or withdraw funds
- ~500,000 accounts affected with $538M in locked funds
- Notable whale James Wynn was partially liquidated multiple times on a leveraged PEPE position during the outage — positions moved against him while he could not act
- HYPE token dropped ~5%
- Hyperliquid's official status page showed 100% uptime during the entire 37-minute outage
- Refunds of $1.99M in USDC were issued; users owed >$10K required KYC verification via Discord

Sources: [The Block](https://www.theblock.co/post/364798/hyperliquid-outage-api-traffic-spike-not-hack-vulnerability-exploit), [Protos](https://protos.com/hyperliquid-claimed-100-uptime-during-37-minute-outage/), [Cryptopolitan](https://www.cryptopolitan.com/hyperliquid-api-suffered-short-outage/), [The Defiant](https://thedefiant.io/news/defi/hyperliquid-to-refund-users-affected-by-platform-outage)

**July 30, 2025 — Second Consecutive Disruption**
- Users reported "unexpected error sending order" messages the day after the major outage
- Orders processed with delays; team described it as API congestion, not a full outage
- Eroded trader confidence further

Source: [Cryptopolitan](https://www.cryptopolitan.com/hyperliquid-down-again-with-users-reports/)

**October 2025 — $21M Private Key Exploit**
- A wallet was drained of 17.75M DAI and 3.11M SyrupUSDC after private key compromise
- Stolen funds bridged to Ethereum; origin of key leak unknown
- Separate from platform outages but highlights security risks of having funds on-platform

Source: [CoinDesk](https://www.coindesk.com/business/2025/10/10/usd21m-crypto-theft-on-hyperliquid-tied-to-private-key-leak-peckshield)

**November 2025 — POPCAT Market Manipulation (Third Attack)**
- Attacker distributed ~$3M across 19 wallets, created $20M+ long positions in POPCAT
- After inflating the price, withdrew buy orders causing a crash
- HLP vault absorbed ~$4.9M in bad debt
- Hyperliquid halted withdrawals during incident management

Source: [Halborn](https://www.halborn.com/blog/post/explained-the-hyperliquid-hack-november-2025), [CCN](https://www.ccn.com/news/crypto/hyperliquid-attack-popcat-again-5million/)

**December 2024 — DPRK Hacker Scare**
- MetaMask security expert Taylor Monahan alleged DPRK-linked wallets were testing Hyperliquid's vulnerabilities
- $256M withdrawn in 30 hours; December 23 saw net outflows exceeding $502M
- HYPE crashed 23% in minutes
- Raised concerns about the platform's reliance on just 4 validators to secure billions in assets (a compromise of 3 would control the $2.3B USDC bridge on Arbitrum)

Source: [Decrypt](https://decrypt.co/298679/hyperliquid-token-plunges-fears-north-korea-hack), [Blockworks](https://blockworks.co/news/hyperliquid-security-fuels-decentralization-concerns)

### What Traders Actually Do During Downtime

Based on community discussions and incident reporting:

1. **They panic** — Discord floods with complaints while official channels provide minimal information
2. **They wait helplessly** — With no alternative execution path, traders are completely locked out of position management
3. **Stop-losses become useless** — During API outages, even programmatic risk management (stop-losses, take-profits) fails because orders cannot reach the matching engine
4. **Partial liquidations happen anyway** — The L1 continues processing while the API is down, meaning liquidation engines can still execute against positions that traders cannot defend
5. **They watch the status page lie** — The official status page showed 100% uptime during the July 2025 outage, providing no useful signal
6. **They complain on X/Twitter and Discord** — The primary feedback loop during outages is social media, not official channels
7. **They compare to FTX** — The July outage "sparked fears of a scenario similar to the inaccessible FTX trading just before the exchange crashed"

### Common Complaints

- No way to close positions during API downtime while the L1 continues (and liquidations still fire)
- Official status page is unreliable/misleading
- Communication is too slow and vague ("we're investigating")
- Refund process requires KYC for amounts >$10K, creating friction
- Single point of failure in the API layer despite the L1 being "decentralized"

---

## 2. Existing Tools for Monitoring Hyperliquid Uptime

### Official

- **[Hyperliquid Status Page](https://hyperliquid.statuspage.io/)** — Statuspage.io-based; shows L1, API, and Frontend uptime over 90 days. However, it showed 100% uptime during a known 37-minute outage, making it unreliable as a real-time signal.

### Open-Source Validator Monitoring

- **[NodeOps Hyperliquid Validator Monitoring](https://github.com/NodeOps-app/Hyperliquid-validator-monitoring)** — Lightweight Go app that polls the Hyperliquid API at configurable intervals (default: 1 min) to track validator jailed/active status. Sends Discord webhook alerts with exponential backoff. Docker-deployable.

- **[Luganodes Hypermon](https://github.com/Luganodes/hypermon)** — All-in-one validator monitoring tool. Exposes Prometheus-compatible metrics, sends Telegram alerts, includes a TUI dashboard. Tracks: recent blocks produced, jail status, stake amounts, total active/jailed stake, RPC health (block height, sync status), and Info endpoint request latency.

### Third-Party Monitoring

- **[StatusGator](https://statusgator.com/services/allium/hyperliquid)** — Aggregates Hyperliquid's status page data
- **[ASXN Hyperscreener](https://hyperscreener.asxn.xyz/home)** — Dashboard for Hyperliquid analytics
- **[Imperator Validator Dashboard](https://www.imperator.co/resources/blog/best-tools-hyperliquid)** — Tools for monitoring staking rewards and validator performance

### What's Missing

- No independent, third-party uptime monitor that checks actual API responsiveness (not just the status page)
- No trader-facing tool that monitors order execution latency in real-time
- No tool that detects API degradation before full outage
- No cross-check between L1 block production and API availability
- No alerting system designed for traders (as opposed to validators)

---

## 3. Backup Execution & Hedging Strategies

### Current State: Almost No Infrastructure Exists

Based on research, there is virtually no established tooling or common practice for backup execution when Hyperliquid goes down. Traders are exposed to single-venue risk with no automated failover.

### Theoretical Strategies Traders Could Use

**Cross-Exchange Hedging**
- Maintain funded accounts on CEXs (Binance, Bybit, OKX) to open opposing positions if Hyperliquid becomes unavailable
- Requires pre-deposited margin on backup venues, reducing capital efficiency
- Manual process — no tools automate this for Hyperliquid specifically

**Position Size Limiting**
- Some traders reduce position sizes on Hyperliquid relative to CEX alternatives, accepting lower capital efficiency for lower risk
- Keep leverage moderate to survive longer periods without position management

**Delta-Neutral Strategies**
- Run basis trades or funding rate arbitrage where both legs exist on different venues
- If one venue goes down, the position is partially hedged by the opposing leg on another exchange

**Portfolio Diversification Across Venues**
- Split trading activity across Hyperliquid + CEXs rather than concentrating on one platform
- Reduces exposure to any single platform's downtime

### Multi-Exchange Trading Platforms

Several platforms offer multi-exchange connectivity that could serve as infrastructure for backup execution:

- **[Autowhale](https://www.autowhale.io/)** — Connects to 50+ exchanges; aimed at crypto funds and market makers
- **[Bitsgap](https://bitsgap.com/)** — Unified terminal across 15+ exchanges
- **[Wyden](https://www.wyden.io/)** — Institutional platform with Smart Order Routing across venues
- **[Altrady](https://www.altrady.com/exchanges/hyperliquid)** — Trading terminal with Hyperliquid integration

None of these offer automated failover/hedge execution specifically triggered by platform downtime.

---

## 4. Feature Ideas: Uptime Monitor + Backup Execution for HypeTerminal

### A. Real-Time Health Monitoring Dashboard

**API Health**
- Continuous ping of Hyperliquid's REST API and WebSocket endpoints (info, exchange, explorer)
- Track response latency over time (p50, p95, p99)
- Detect degradation pattern: increasing latency often precedes full outage
- Compare against baseline latency (normal: <100ms for info endpoints)

**L1 Block Health**
- Monitor block production rate (normal median: 0.2s)
- Detect gaps in block production or increasing block times
- Cross-reference: if L1 is producing blocks but API is unresponsive, the API layer is the bottleneck (this was exactly the July 2025 scenario)

**Validator Status**
- Track validator count, jailing events, stake distribution
- Alert on unusual validator behavior (rapid consensus changes, multiple validators going offline)
- Leverage existing APIs: `validatorL1Votes` from Chainstack, validator info endpoints

**Order Execution Health**
- Send small test orders (or use websocket order confirmations) to measure actual execution round-trip time
- Detect when orders are "accepted" but not confirmed — the pre-outage degradation pattern

### B. Alert System

**Tiered Alerts**
1. **Yellow — Degraded**: API latency >2x baseline, intermittent errors, order delays
2. **Orange — Severely Degraded**: API latency >5x baseline, frequent errors, orders timing out
3. **Red — Outage**: API unresponsive, orders not executing, position management impossible

**Notification Channels**
- In-app banner/toast with severity level
- Browser push notifications
- Telegram/Discord webhook integration
- SMS for critical alerts (Red tier)
- Audio alarm option for active traders

**Smart Detection**
- Don't just ping the status page (it lies) — independently verify API health
- Monitor social signals (high volume of "Hyperliquid down" on X could be an early indicator)
- Track HYPE token price as a proxy signal (drops 3-5% during outages)

### C. Automated Hedge / Backup Execution

This is the highest-value feature and the hardest to build. Core concept: if Hyperliquid becomes degraded or unreachable, automatically execute hedging trades on backup venues.

**Pre-Configuration Required**
- User connects API keys for backup exchanges (Binance, Bybit, OKX)
- User sets hedge preferences per position: full hedge, partial hedge, or manual-only
- User defines trigger conditions: at what health tier should hedges activate?
- User pre-allocates margin on backup venues

**Hedge Execution Logic**
1. Detect Hyperliquid degradation/outage (from health monitor)
2. Snapshot current Hyperliquid positions (from last known state)
3. For each position configured for auto-hedge:
   - Calculate equivalent opposing position on backup venue
   - Account for price differences between venues (basis)
   - Execute market order on backup venue to neutralize directional exposure
4. When Hyperliquid recovers:
   - Alert user to unwind hedge positions
   - Show P&L impact of the hedge vs. what would have happened without it

**Emergency Close Workflow**
- One-click "Emergency Close All" that attempts to close on Hyperliquid first
- If Hyperliquid is unresponsive within N seconds, automatically opens opposing positions on backup venue
- Provides a reconciliation view after both venues are accessible

**Position Mirroring (Advanced)**
- Continuously mirror Hyperliquid positions as limit orders on a backup venue (not filled, just resting)
- If Hyperliquid goes down, activate the mirrored orders as market orders
- Eliminates the latency of calculating and placing hedge orders during a crisis

### D. Historical Uptime & Risk Analytics

**Uptime Dashboard**
- Historical chart of API response times, error rates, block times
- Annotated with known incidents (JELLY, July outage, POPCAT, etc.)
- Calculate actual uptime vs. claimed uptime

**Risk Metrics**
- "Time at risk" — how many minutes per month were positions unmanageable?
- Estimated P&L impact of each downtime event on the user's specific positions
- Worst-case exposure analysis: "If Hyperliquid went down right now for 30 minutes, your max loss would be $X"

**Downtime Pattern Analysis**
- Correlation between open interest levels and outage probability
- Time-of-day patterns (high-traffic periods = higher risk)
- Alert when conditions resemble pre-outage patterns (e.g., record OI approaching)

### E. Risk Management During Degraded Performance

**Automatic Position Reduction**
- When Yellow alert triggers, optionally reduce position sizes by a configurable percentage
- Tighten stop-losses during degraded periods
- Reduce max leverage allowed during degraded periods

**Circuit Breakers**
- Prevent opening new positions when health is Orange or Red
- Auto-cancel open orders when degradation is detected (to prevent fills at bad prices during recovery)

**Margin Monitoring**
- During degraded performance, show estimated liquidation prices with wider confidence intervals
- Factor in the possibility that liquidation could happen while the user cannot add margin

### F. Implementation Priorities

**Phase 1 — Monitor & Alert (Highest value, lowest complexity)**
- Independent API health monitoring (don't trust the status page)
- In-app health indicator (green/yellow/red dot)
- Push notifications on degradation
- Historical latency chart

**Phase 2 — Backup Exchange Integration**
- Connect backup exchange API keys
- Position snapshot and exposure summary across venues
- Manual one-click hedge on backup venue

**Phase 3 — Automated Hedge Execution**
- Configurable auto-hedge triggers
- Emergency close workflows
- Post-incident reconciliation

**Phase 4 — Advanced Analytics**
- Historical uptime tracking
- Risk-at-downtime calculations
- Pattern detection and predictive alerts

---

## Key Takeaways

1. **Hyperliquid has had at least 5 major incidents in 2025 alone** (JELLY March, API outage July, second disruption July, Hyperdrive October, POPCAT November), plus the DPRK scare in December 2024
2. **The official status page is unreliable** — it showed 100% uptime during a known 37-minute outage
3. **No trader-facing tools exist for downtime protection** — existing monitoring tools are designed for validators, not traders
4. **Traders are completely helpless during outages** — no backup execution, no hedging automation, no failover
5. **The API is the single point of failure** — the L1 continued producing blocks during the July outage, but traders couldn't interact with it
6. **Automated hedge execution on backup venues would be genuinely novel** — no existing product offers this for Hyperliquid
7. **Even basic independent health monitoring would be valuable** — most traders learn about outages from Twitter, not from any monitoring tool
