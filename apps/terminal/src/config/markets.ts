import type { ExchangeScope } from "@/domain/market/scope";

export const ETH_USDC_SPOT_ASSET_ID = "@107";

export const DEFAULT_SELECTED_MARKETS: Record<ExchangeScope, string> = {
	all: "BTC",
	perp: "BTC",
	spot: ETH_USDC_SPOT_ASSET_ID,
	"builders-perp": "xyz:SILVER",
};

export interface PerpCategory {
	value: string;
	label: string;
}

export const PERP_CATEGORIES: PerpCategory[] = [
	{ value: "all", label: "All" },
	{ value: "trending", label: "Trending" },
	{ value: "new", label: "New" },
	{ value: "defi", label: "DeFi" },
	{ value: "layer1", label: "L1" },
	{ value: "layer2", label: "L2" },
	{ value: "meme", label: "Meme" },
];
