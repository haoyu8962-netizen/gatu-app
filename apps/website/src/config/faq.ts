import { formatCompactUsd } from "@/lib/markets/live.js";
import { getDeployers, getPreIpoRows } from "@/lib/markets/structure";
import { BRAND_NAME } from "./brand";
import { HIP3_DOCS_URL, joinNames, RISK_PATH, TERMS_RESTRICTED_PATH } from "./copy";

export interface FaqItem {
	q: string;
	a: string;
	link?: { label: string; href: string };
}

const deployers = joinNames(getDeployers().map((deployer) => deployer.fullName));

function preIpoQuoteAnswer(): string {
	const units = new Map<string, { unit: string; onNotice: boolean }>();
	const perShare: string[] = [];
	for (const row of getPreIpoRows()) {
		if (!row.deployerFullName) continue;
		if (row.preIpoTerms && !units.has(row.deployerFullName)) {
			units.set(row.deployerFullName, {
				unit: formatCompactUsd(row.preIpoTerms.valuationPerPriceUsd),
				onNotice: row.preIpoTerms.earlySettlementOnNotice,
			});
		} else if (!row.preIpoTerms && row.quotedPerShare && !perShare.includes(row.deployerFullName)) {
			perShare.push(row.deployerFullName);
		}
	}
	const valuationDeployers = [...units.keys()];
	const perDeployer = [...units].map(
		([deployer, { unit, onNotice }]) =>
			`On ${deployer} markets, each US$1 of price stands for US$${unit} of the company's implied valuation, and the market is settled if the company does not list by its scheduled date${onNotice ? ", or earlier if the deployer gives notice" : ""}.`,
	);
	const perShareSentences = perShare.map((deployer) => `On ${deployer} pre-IPO markets, the price is quoted per share of the company.`);
	const valuationNote =
		valuationDeployers.length > 0
			? [
					`For ${joinNames(valuationDeployers)} markets, the figure this site shows is an implied valuation derived from the price, not a share price.`,
				]
			: [];
	return [
		"The price tracks a reference set by the deployer, quoted in the deployer's own unit.",
		...perDeployer,
		...perShareSentences,
		"Units differ between deployers, so check the deployer's documentation before you trade.",
		...valuationNote,
	].join(" ");
}

export const FAQS: readonly FaqItem[] = [
	{
		q: "Who holds my funds?",
		a: `You do. Your funds stay in your own Hyperliquid account, where Hyperliquid matches and settles your trades. ${BRAND_NAME} is an interface and never takes custody of them.`,
	},
	{
		q: "What can I trade?",
		a: `Perpetuals on crypto, US stocks, indices, commodities, FX and pre-IPO companies, plus spot. Every market except the main crypto perpetuals and spot is a HIP-3 market run by a third-party deployer: ${deployers}.`,
	},
	{
		q: "Am I buying shares when I trade a stock or pre-IPO market?",
		a: `No. You trade perpetual contracts that track a reference price. They are not shares and not an IPO allocation, and they give you no ownership, dividend or voting rights in the company. Pre-IPO perpetuals are cash-settled. ${BRAND_NAME} is not affiliated with the companies these contracts reference.`,
	},
	{
		q: "Who runs HIP-3 markets?",
		a: `Independent third-party deployers: ${deployers}. Each deployer defines its markets, sets the reference price and can halt, settle or delist a market. Hyperliquid matches and settles trades; ${BRAND_NAME} is the interface and does not review these markets.`,
		link: { label: "How HIP-3 works.", href: HIP3_DOCS_URL },
	},
	{
		q: "How is a pre-IPO price quoted?",
		a: preIpoQuoteAnswer(),
	},
	{
		q: "Can I trade when the stock market is closed?",
		a: "Yes. HIP-3 markets trade 24/7. Outside a stock's exchange hours, prices come from the deployer's own mechanism rather than from the exchange, and liquidity can be thinner.",
	},
	{
		q: "What does a trade cost?",
		a: `On each trade you pay Hyperliquid's protocol fees — 0.045% taker / 0.015% maker on perps at the base tier (spot starts at 0.07% / 0.04%), dropping with volume and HYPE staking — plus a small 0.01% builder fee on perp orders and spot sells (TWAP orders and spot buys carry none). HIP-3 deployers can set different Hyperliquid fees for their markets. The builder fee is what funds ${BRAND_NAME}. No subscription, no monthly fee, no gas per trade.`,
	},
	{
		q: "What do I need to deposit?",
		a: "USDC on Arbitrum. Open Deposit in the terminal and follow the steps it shows. With your own wallet you also need a little ETH on Arbitrum for gas. USDC sent on another network, or another token, cannot be recovered.",
	},
	{
		q: "How does email sign-in work?",
		a: "Enter your email and the code you receive. Privy, our sign-in provider, creates a wallet for your account; that wallet owns your Hyperliquid account and signs your orders. If you connect your own wallet instead, you approve a trading key for this browser session so you do not sign every order; it is kept after a restart only if you choose to stay connected.",
		link: { label: "Read the Privacy Policy.", href: "/privacy/" },
	},
	{
		q: "Which order types are supported?",
		a: "On perpetuals: market, limit, stop-market, stop-limit, take-profit (market and limit), TWAP and scaled orders. Limit orders support GTC, IOC and Post Only (ALO) time-in-force, plus reduce-only. Spot supports a subset of these.",
	},
	{
		q: "How does leverage work?",
		a: "Leverage lets you open a position larger than the margin behind it. Each market sets its own limit, which the terminal shows. With cross margin, positions draw on the margin across your account; with isolated margin, each position has its own. Many HIP-3 markets allow isolated margin only. If your margin falls below the maintenance requirement, the position is liquidated and you can lose all of that margin.",
	},
	{
		q: "Where am I not able to trade?",
		a: `${BRAND_NAME} is not available in the US or other restricted locations listed in section 2.2 of the Terms of Use, and section 2.3 forbids hiding your location or identity to get around these restrictions. Deployers may apply their own restrictions.`,
		link: { label: "Read the Terms of Use.", href: TERMS_RESTRICTED_PATH },
	},
	{
		q: "Where does the live data come from?",
		a: "The prices on this page come straight from Hyperliquid's public API and refresh every few minutes while they are on screen; you can pause the updates. Market names, deployers and counts come from a dated snapshot of Hyperliquid's public data, taken before the page was built. This site sets no cookies and runs no analytics.",
	},
	{
		q: "Is this investment advice?",
		a: `No. Nothing on this site or in the terminal is investment, financial, legal or tax advice. Decide for yourself, and read the Risk disclosure before you trade.`,
		link: { label: "Read the Risk disclosure.", href: RISK_PATH },
	},
];
