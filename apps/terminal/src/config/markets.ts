import type { ExchangeScope } from "@/domain/market/scope";

export const ETH_USDC_SPOT_ASSET_ID = "@107";
export const ETH_USDC_SPOT_MARKET_NAME = "ETH/USDC";

export const DEFAULT_SELECTED_MARKETS: Record<ExchangeScope, string> = {
	all: "BTC",
	perp: "BTC",
	spot: ETH_USDC_SPOT_ASSET_ID,
	"builders-perp": "xyz:SILVER",
};
