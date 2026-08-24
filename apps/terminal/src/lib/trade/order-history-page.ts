import {
	ACCOUNT_HISTORY_PAGE_SIZES,
	type AccountHistoryPage,
	type AccountHistoryPageSize,
	DEFAULT_ACCOUNT_HISTORY_PAGE_SIZE,
	getAccountHistoryPage,
	isAccountHistoryAddress,
	isAccountHistoryPageSize,
} from "@/lib/trade/account-history";
import type { OrderHistoryEntry, OrderHistoryStatusCategory } from "@/lib/trade/order-history";
import { getOrderHistoryStatusCategory } from "@/lib/trade/order-history";

export const ORDER_HISTORY_API_LIMIT = 2_000;
export const ORDER_HISTORY_PAGE_SIZES = ACCOUNT_HISTORY_PAGE_SIZES;
export const DEFAULT_ORDER_HISTORY_PAGE_SIZE = DEFAULT_ACCOUNT_HISTORY_PAGE_SIZE;

export type OrdinaryOrderHistoryEntry = Extract<OrderHistoryEntry, { kind: "order" }>;
export type OrderHistoryPageSize = AccountHistoryPageSize;
export type OrderHistorySideFilter = "all" | "buy" | "sell";
export type OrderHistoryStatusFilter = "all" | OrderHistoryStatusCategory;

export interface OrderHistoryFilters {
	market: string | null;
	side: OrderHistorySideFilter;
	status: OrderHistoryStatusFilter;
	type: string | null;
}

export function isOrderHistoryAddress(value: unknown): value is `0x${string}` {
	return isAccountHistoryAddress(value);
}

export function isOrderHistoryPageSize(value: number): value is OrderHistoryPageSize {
	return isAccountHistoryPageSize(value);
}

export function isOrderHistorySideFilter(value: unknown): value is OrderHistorySideFilter {
	return value === "all" || value === "buy" || value === "sell";
}

export function isOrderHistoryStatusFilter(value: unknown): value is OrderHistoryStatusFilter {
	return (
		value === "all" ||
		value === "open" ||
		value === "filled" ||
		value === "triggered" ||
		value === "canceled" ||
		value === "rejected" ||
		value === "other"
	);
}

export function getOrderHistoryMarkets(entries: readonly OrdinaryOrderHistoryEntry[]): string[] {
	return [...new Set(entries.map((entry) => entry.coin))].sort();
}

export function getOrderHistoryTypes(
	entries: readonly OrdinaryOrderHistoryEntry[],
): OrdinaryOrderHistoryEntry["type"][] {
	return [...new Set(entries.map((entry) => entry.type))].sort();
}

export function getOrderHistorySide(entry: OrdinaryOrderHistoryEntry): Exclude<OrderHistorySideFilter, "all"> {
	return entry.side === "B" ? "buy" : "sell";
}

export function filterOrderHistory(
	entries: readonly OrdinaryOrderHistoryEntry[],
	filters: OrderHistoryFilters,
): OrdinaryOrderHistoryEntry[] {
	return entries.filter((entry) => matchesOrderHistoryFilters(entry, filters));
}

export function matchesOrderHistoryFilters(entry: OrdinaryOrderHistoryEntry, filters: OrderHistoryFilters): boolean {
	return (
		(filters.market === null || entry.coin === filters.market) &&
		(filters.side === "all" || getOrderHistorySide(entry) === filters.side) &&
		(filters.type === null || entry.type === filters.type) &&
		(filters.status === "all" || getOrderHistoryStatusCategory(entry) === filters.status)
	);
}

export function getOrderHistoryPage(
	entries: readonly OrdinaryOrderHistoryEntry[],
	requestedPage: number,
	pageSize: OrderHistoryPageSize,
): AccountHistoryPage<OrdinaryOrderHistoryEntry> {
	return getAccountHistoryPage(entries, requestedPage, pageSize);
}
