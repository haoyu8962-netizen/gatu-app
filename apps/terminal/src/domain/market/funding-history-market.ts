export function isFundingHistoryMarket(market: { kind: string } | null | undefined): boolean {
	return market?.kind === "perp" || market?.kind === "builderPerp";
}
