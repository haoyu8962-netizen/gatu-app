import Big from "big.js";
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

interface PositionPnlInput {
	unrealizedPnl: string;
}

interface LiquidationProximityInput {
	markPx: string | null | undefined;
	liquidationPx: string | null | undefined;
	proximity: string | number;
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

export function getTotalPositionUnrealizedPnl(positions: readonly PositionPnlInput[]): string | null {
	let total = Big(0);

	for (const position of positions) {
		const unrealizedPnl = toBig(position.unrealizedPnl);
		if (!unrealizedPnl) return null;
		total = total.plus(unrealizedPnl);
	}

	return total.toString();
}

export function getPositionFundingPayment(sinceOpen: string): string | null {
	const funding = toBig(sinceOpen);
	return funding ? funding.times(-1).toFixed() : null;
}

export function isLiquidationPriceNear({ markPx, liquidationPx, proximity }: LiquidationProximityInput): boolean {
	const mark = toBig(markPx);
	const liquidation = toBig(liquidationPx);
	const threshold = toBig(proximity);
	if (!mark?.gt(0) || !liquidation?.gt(0) || !threshold?.gte(0)) return false;
	return liquidation.minus(mark).abs().div(mark).lte(threshold);
}
