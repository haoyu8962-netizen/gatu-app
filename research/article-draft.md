# Why We're Building an Open-Source Hyperliquid Client

*Rough draft — rewrite in your own voice*

---

Hyperliquid is doing $8.3B in daily volume. Crypto, equities, commodities — all on one on-chain exchange. No custody risk. Instant settlement. 200,000 orders per second.

And 40% of its users are already trading through third-party frontends.

Not because Hyperliquid is bad. Because the official interface isn't built for all of them.

That's the opening. That's why we're building HypeTerminal — and why we're doing it in the open.

---

## The exchange is solved. The interface isn't.

Hyperliquid figured out the hard part. On-chain perpetuals at CEX speed is an engineering problem most teams gave up on. They didn't.

But an exchange being good at matching orders doesn't mean it's good at serving traders.

Right now on Hyperliquid, there are no price alerts. No liquidation warnings. No portfolio-level risk view. No simplified mode for beginners. No mobile app worth using. No way to see your win rate, your Sharpe ratio, or what your worst trade cost you.

These aren't missing because they're hard to build. They're missing because the core team is focused on the protocol. That's the right call for them. It's the opening for us.

---

## Why open source

Most trading platforms are black boxes.

You don't know how they route your order. You don't know if they're using your position data. You don't know if the "risk engine" protecting you is actually protecting you. On a CEX, you don't even own your coins.

Hyperliquid solved the custody problem. Your keys, your coins. Settlement is on-chain and verifiable.

But if the client is closed, you've only solved half the problem. The interface layer — where your orders originate, where your risk is displayed, where your capital is managed — is still opaque.

Open-sourcing the client completes the picture. The code that handles your trades is readable, auditable, and forkable. No hidden order routing. No black-box risk management. No surprises.

Trustlessness should extend to the interface, not just the chain.

---

## The business case is also real

Hyperliquid has a mechanism called builder codes. Any frontend that routes volume through the protocol earns a fee: 0.1% on perps, 1% on spot. Paid by the protocol. Not taken from the user.

At $8.3B daily volume, capturing even a small slice of that is meaningful. The largest third-party frontends are already doing this at scale.

Open source doesn't break this model. It strengthens it. Contributors have direct incentive to improve the client. Users have reason to trust it. The feedback loop is faster.

---

## What's coming makes this more urgent

60–80% of global crypto volume is already AI-driven. AI quant funds averaged 52% returns in 2025. 84% of retail traders lost money in the same period.

That gap is not going to close by retail traders getting better at reading charts.

It closes when retail gets access to the same infrastructure institutions use. And Hyperliquid has already built that infrastructure: agent wallets that execute without holding funds, isolated sub-accounts, vaults that can pool capital and tokenize strategy shares.

The primitives for autonomous trading are sitting in the protocol, unused by any client.

Bloomberg built a conversational AI interface for their terminal. OKX built an agentic wallet for AI agents to execute on-chain autonomously. Coinbase processed 115 million machine-to-machine transactions in the first quarter of 2026.

The trading interface is about to change completely. The platforms that build for that transition now are the ones that survive it.

An open-source client is the right foundation for that — because no single team can build everything, and the right interface for autonomous trading needs community trust more than any other kind.

---

## The short version

Hyperliquid is the best on-chain exchange that exists. The interface layer hasn't caught up. The tools traders actually need — alerts, risk management, analytics, mobile, AI assistance — don't exist yet on this venue.

We're building them. In the open. Because a trading terminal you can't read is just a different kind of trust problem.

---

*Key facts used in this article — all sourced from internal research (March 2026):*
- *$8.3B daily volume: product-opportunities-synthesis.md, sourced from public Hyperliquid data*
- *40% third-party frontend usage: Blockworks "Frontend Wars"*
- *60–80% AI-driven volume: agentic-trading-landscape.md, sourced from Nansen, ainvest*
- *52% AI quant returns / 84% retail loss rate: agentic-trading-landscape.md*
- *Bloomberg ASKB, OKX agentic wallet, Coinbase x402: primary sources linked in research/01*
- *Builder codes 0.1%/1%: Hyperliquid documentation, dwellir.com/blog*
- *200K orders/sec: hyperliquid-agent-infrastructure.md*
