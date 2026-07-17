export const FAQS = [
	{
		q: "What does it cost to use gatu?",
		a: "On every trade you pay Hyperliquid's protocol fees — 0.045% taker / 0.015% maker at the base tier, dropping with volume and HYPE staking — plus a small 0.01% builder fee. That builder fee is what funds gatu: ongoing development, faster releases, new features, and keeping the terminal open-source and free to run. No subscription, no monthly fee, no gas per trade.",
	},
	{
		q: "Do I need to sign up or KYC?",
		a: "No. Connect any EVM wallet — MetaMask, WalletConnect, Coinbase, and most browser wallets work — and start trading. No accounts, no email, no identity checks.",
	},
	{
		q: "Can I really trade stocks here?",
		a: "You trade perpetual futures that track stock prices — TSLA, NVDA, AAPL and more on builder-deployed DEXs — alongside indices, silver, and crypto. They are perps, not securities: onchain, leveraged, and tradable around the clock without a brokerage account.",
	},
	{
		q: "Which order types are supported?",
		a: "Market, limit, stop-market, stop-limit, take-profit (market and limit), TWAP, and scaled orders. Limit orders support GTC, IOC, and ALO time-in-force, plus reduce-only.",
	},
	{
		q: "What's the max leverage?",
		a: "Up to 50× on perpetuals, configurable per position. You can switch between cross and isolated margin per market.",
	},
	{
		q: "Which markets are supported?",
		a: "All Hyperliquid perp markets, the spot order book, and builder-deployed DEXs — including equity, index, and metal perps. New markets appear automatically as they launch.",
	},
	{
		q: "Where does my data live?",
		a: "Nowhere on our side. The terminal talks directly to Hyperliquid's public WebSocket and signs orders locally with your wallet. Settings persist in your browser.",
	},
	{
		q: "Can I deposit or bridge funds?",
		a: "Yes. Deposit and withdraw via Arbitrum, with cross-chain bridging powered by LiFi across 19+ EVM networks.",
	},
	{
		q: "Does it work on mobile?",
		a: "Yes. The terminal has dedicated mobile views — not a shrunk desktop — with native gestures and panels tuned for trading on the go.",
	},
] as const;
