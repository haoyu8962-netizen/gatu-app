import type { HistoricalOrdersResponse, InfoClient } from "@nktkas/hyperliquid";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useOnlineStatus } from "@/hooks/use-mobile";
import { useHyperliquid } from "@/lib/hyperliquid";
import { isValidHistoricalOrderHistoryItem, mergeHistoricalOrderSources } from "@/lib/trade/historical-orders";
import { fetchHistoryPageWithRetry, MalformedHistoryPageError } from "@/lib/trade/history-pagination";
import { buildOrderHistoryEntries } from "@/lib/trade/order-history";
import {
	isOrderHistoryAddress,
	ORDER_HISTORY_API_LIMIT,
	type OrdinaryOrderHistoryEntry,
} from "@/lib/trade/order-history-page";

const ORDER_HISTORY_STALE_TIME_MS = 30_000;
const EMPTY_ORDERS: HistoricalOrdersResponse = [];

export interface OrderHistorySnapshot {
	orders: HistoricalOrdersResponse;
	reachedLimit: boolean;
}

export type OrderHistoryStatus = "disabled" | "error" | "loading" | "offline" | "ready";

interface OrderHistoryResult {
	entries: OrdinaryOrderHistoryEntry[];
	error: unknown;
	isOffline: boolean;
	isRefreshing: boolean;
	orders: HistoricalOrdersResponse;
	reachedLimit: boolean;
	refresh: () => void;
	status: OrderHistoryStatus;
}

export async function fetchOrderHistorySnapshot(
	info: InfoClient,
	user: `0x${string}`,
	signal: AbortSignal,
): Promise<OrderHistorySnapshot> {
	const response = await fetchHistoryPageWithRetry((requestSignal) => info.historicalOrders({ user }, requestSignal), {
		signal,
	});
	if (
		!Array.isArray(response) ||
		response.length > ORDER_HISTORY_API_LIMIT ||
		response.some((entry) => !isValidHistoricalOrderHistoryItem(entry))
	) {
		throw new MalformedHistoryPageError();
	}

	return {
		orders: mergeHistoricalOrderSources(response as HistoricalOrdersResponse),
		reachedLimit: response.length === ORDER_HISTORY_API_LIMIT,
	};
}

export function useOrderHistory(address: string): OrderHistoryResult {
	const { env, info } = useHyperliquid();
	const isOnline = useOnlineStatus();
	const enabled = isOrderHistoryAddress(address);
	const normalizedAddress = address.toLowerCase();
	const query = useQuery({
		enabled,
		queryFn: async ({ signal }): Promise<OrderHistorySnapshot> => {
			if (!isOrderHistoryAddress(address)) throw new Error("Invalid account address.");
			return fetchOrderHistorySnapshot(info, address, signal);
		},
		queryKey: ["hl", "order-history", "historicalOrders", env, normalizedAddress],
		refetchOnReconnect: true,
		refetchOnWindowFocus: false,
		retry: false,
		staleTime: ORDER_HISTORY_STALE_TIME_MS,
	});

	let status: OrderHistoryStatus = "loading";
	if (!enabled) status = "disabled";
	else if (query.data !== undefined) status = "ready";
	else if (!isOnline || query.fetchStatus === "paused") status = "offline";
	else if (query.isError) status = "error";

	const orders = query.data?.orders ?? EMPTY_ORDERS;
	const entries = useMemo(
		() =>
			buildOrderHistoryEntries(orders, []).filter(
				(entry): entry is OrdinaryOrderHistoryEntry => entry.kind === "order",
			),
		[orders],
	);

	return {
		entries,
		error: query.error,
		isOffline: !isOnline || query.fetchStatus === "paused",
		isRefreshing: query.isFetching && query.data !== undefined,
		orders,
		reachedLimit: query.data?.reachedLimit ?? false,
		refresh: () => void query.refetch({ cancelRefetch: false }),
		status,
	};
}
