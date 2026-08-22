interface MarketIdentity {
	kind: "perp" | "spot" | "builderPerp";
	name: string;
}

export function getMarketApiCoin(market: MarketIdentity | null | undefined): string {
	return market?.name ?? "";
}

export function getSpotMarketApiCoin(market: MarketIdentity | null | undefined): string {
	return market?.kind === "spot" ? market.name : "";
}
