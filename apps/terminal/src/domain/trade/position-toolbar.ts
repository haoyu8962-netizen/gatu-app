import { toBig } from "@/lib/trade/numbers";

export type PositionDirectionFilter = "all" | "long" | "short";

export interface PositionMarketIdentity {
	coin: string;
	dex: string;
}

export type PositionMarketFilter =
	| { type: "all" }
	| { type: "current" }
	| { type: "market"; market: PositionMarketIdentity };

interface FilterablePosition extends PositionMarketIdentity {
	szi: string;
}

interface ReadyItemCountInput {
	isConnected: boolean;
	isReady: boolean;
	count: number;
}

export const ALL_POSITION_MARKETS: PositionMarketFilter = { type: "all" };
export const CURRENT_POSITION_MARKET: PositionMarketFilter = { type: "current" };

function matchesMarket(position: PositionMarketIdentity, market: PositionMarketIdentity | null): boolean {
	return market !== null && position.coin === market.coin && position.dex === market.dex;
}

function matchesDirection(position: FilterablePosition, direction: PositionDirectionFilter): boolean {
	if (direction === "all") return true;

	const size = toBig(position.szi);
	if (!size) return false;
	return direction === "long" ? size.gt(0) : size.lt(0);
}

export function filterPositions<T extends FilterablePosition>(
	positions: readonly T[],
	direction: PositionDirectionFilter,
	marketFilter: PositionMarketFilter,
	currentMarket: PositionMarketIdentity | null,
): T[] {
	return positions.filter((position) => {
		if (!matchesDirection(position, direction)) return false;
		if (marketFilter.type === "all") return true;
		if (marketFilter.type === "current") return matchesMarket(position, currentMarket);
		return matchesMarket(position, marketFilter.market);
	});
}

export function getReadyItemCount({ isConnected, isReady, count }: ReadyItemCountInput): number | null {
	return isConnected && isReady ? count : null;
}
