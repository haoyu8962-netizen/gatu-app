import type { MarketKind } from "./types";

type MarketLike = { kind: MarketKind; dex?: string };

export function getPositionDex(market: MarketLike): string | undefined {
	if (market.kind === "builderPerp") return market.dex;
	if (market.kind === "perp") return "";
	return undefined;
}
