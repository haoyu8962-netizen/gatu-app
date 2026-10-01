import { BRAND_NAME } from "./brand";

export interface FaqItem {
	q: string;
	a: string;
	link?: { label: string; href: string };
}

export const FAQS: readonly FaqItem[] = [
	{
		q: `What does it cost to use ${BRAND_NAME}?`,
		a: `On every trade you pay Hyperliquid's protocol fees — 0.045% taker / 0.015% maker on perps at the base tier (spot starts at 0.07% / 0.04%), dropping with volume and HYPE staking — plus a small 0.01% builder fee. That builder fee is what funds ${BRAND_NAME}: ongoing development, faster releases, new features, and keeping the terminal free to use. No subscription, no monthly fee, no gas per trade.`,
	},
	{
		q: "Do I need to sign up or KYC?",
		a: "There's no KYC. Connect an Ethereum wallet — MetaMask, Coinbase, OKX, Binance, WalletConnect, and most browser wallets work — or sign in with email to get an embedded wallet. No identity documents, no brokerage account.",
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
		a: "Each Hyperliquid market sets its own maximum, and the leverage control shows the current limit for the market you pick. Leverage is set per market, with cross or isolated margin where the market allows both.",
	},
	{
		q: "Which markets are supported?",
		a: "All Hyperliquid perp markets, the spot order book, and builder-deployed DEXs — including equity, index, and metal perps. New markets appear automatically as they launch.",
	},
	{
		q: "Where does my data live?",
		a: "Your funds, positions, and orders live on Hyperliquid. Orders are signed with your keys and sent from your browser straight to Hyperliquid, and your settings stay in your browser. A few things do reach us or our service providers: email sign-in, region checks, error reports, leaderboard data, and gas-sponsored deposits.",
		link: { label: "Read the Privacy Policy.", href: "/privacy/" },
	},
	{
		q: "Can I deposit or bridge funds?",
		a: "Yes. Deposit USDC from Arbitrum through Circle CCTP, and withdraw USDC back to Arbitrum.",
	},
	{
		q: "Does it work on mobile?",
		a: "Yes. The terminal has dedicated mobile views — not a shrunk desktop — with native gestures and panels tuned for trading on the go.",
	},
];
