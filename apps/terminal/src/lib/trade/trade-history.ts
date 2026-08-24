import type { UserFillsResponse } from "@nktkas/hyperliquid";
import { getMarketKindFromName } from "@/lib/hyperliquid/markets/helper";

export const TRADE_HISTORY_SNAPSHOT_LIMIT = 2_000;

export type TradeHistoryDirectionFilter = "all" | "buy" | "sell";
export type TradeHistoryRoleFilter = "all" | "maker" | "taker";
export type TradeHistoryTypeFilter = "all" | "perp" | "spot";
export type TradeHistoryMarketKind = "builderPerp" | "perp" | "spot" | undefined;

type UserFill = UserFillsResponse[number];

export function isTradeHistoryDirectionFilter(value: unknown): value is TradeHistoryDirectionFilter {
	return value === "all" || value === "buy" || value === "sell";
}

export function isTradeHistoryRoleFilter(value: unknown): value is TradeHistoryRoleFilter {
	return value === "all" || value === "maker" || value === "taker";
}

export function isTradeHistoryTypeFilter(value: unknown): value is TradeHistoryTypeFilter {
	return value === "all" || value === "perp" || value === "spot";
}

export function getTradeHistoryMarkets(fills: readonly UserFill[]): string[] {
	return [...new Set(fills.map((fill) => fill.coin))].sort();
}

export function getTradeHistoryType(
	fill: UserFill,
	getMarketKind: (coin: string) => TradeHistoryMarketKind,
): Exclude<TradeHistoryTypeFilter, "all"> | null {
	// The live catalog intentionally excludes delisted markets. Historical fills still
	// retain Hyperliquid's canonical coin name, so use that protocol identity when an
	// exact current-market lookup is no longer available.
	const marketKind = getMarketKind(fill.coin) ?? getMarketKindFromName(fill.coin);
	if (marketKind === "spot") return "spot";
	if (marketKind === "perp" || marketKind === "builderPerp") return "perp";
	return null;
}

export function filterTradeHistory(
	fills: readonly UserFill[],
	market: string | null,
	direction: TradeHistoryDirectionFilter,
	role: TradeHistoryRoleFilter,
	type: TradeHistoryTypeFilter,
	getMarketKind: (coin: string) => TradeHistoryMarketKind,
): UserFillsResponse {
	return fills.filter(
		(fill) =>
			(market === null || fill.coin === market) &&
			(direction === "all" || (direction === "buy") === (fill.side === "B")) &&
			(role === "all" || (role === "taker") === fill.crossed) &&
			(type === "all" || getTradeHistoryType(fill, getMarketKind) === type),
	);
}
