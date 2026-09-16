import { DEFAULT_FAVORITE_MARKETS } from "@/config/app";
import { MARKET_HEADER_LABELS } from "@/config/market-header";

export const FAVORITES_PLACEHOLDER = {
	items: DEFAULT_FAVORITE_MARKETS.map((name) => ({ name, label: `${name}-USDC`, active: false })),
	emptyLabel: MARKET_HEADER_LABELS.favoritesEmpty.message,
};

export const MARKET_HEADER_PLACEHOLDER = {
	trigger: {
		pairName: null,
		kindBadge: null,
		leverageBadge: null,
		isSpot: false,
		open: false,
		showAssetIcon: false,
	},
	ariaLabel: MARKET_HEADER_LABELS.price.message,
	stats: [
		{ id: "price", label: MARKET_HEADER_LABELS.mark.message, value: null, valueSample: "0,000.0" },
		{ id: "oracle", label: MARKET_HEADER_LABELS.oracle.message, value: null, valueSample: "0,000.0" },
		{ id: "change24h", label: MARKET_HEADER_LABELS.change24h.message, value: null, valueSample: "-0,000 / -0.00%" },
		{ id: "volume24h", label: MARKET_HEADER_LABELS.volume24h.message, value: null, valueSample: "$0,000,000,000.00" },
		{
			id: "openInterest",
			label: MARKET_HEADER_LABELS.openInterest.message,
			value: null,
			valueSample: "$0,000,000,000.00",
		},
		{
			id: "funding",
			label: `${MARKET_HEADER_LABELS.funding.message} / ${MARKET_HEADER_LABELS.resetsIn.message}`,
			value: null,
			valueSample: "+0.0000% 00:00:00",
			labelClass: "cursor-help border-b border-dashed border-trading-panel-stroke-control",
		},
	] as const,
};
