import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import { MAX_HISTORY_ROWS } from "@/config/trade";
import { useTwapHistory } from "@/hooks/trade/use-twap-history";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useInfo, useSubscription } from "@/lib/hyperliquid";
import { isValidHistoricalOrderHistoryItem, mergeHistoricalOrderSources } from "@/lib/trade/historical-orders";
import { MalformedHistoryPageError } from "@/lib/trade/history-pagination";
import { buildOrderHistoryEntries, type OrderHistoryEntry } from "@/lib/trade/order-history";

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
const HISTORICAL_ORDERS_STALE_TIME_MS = 30_000;

type HistoricalOrdersStatus = "idle" | "loading" | "ready" | "error";

interface HistoricalOrdersResult {
	error: unknown;
	entries: OrderHistoryEntry[];
	isConnected: boolean;
	orders: HistoricalOrdersResponse;
	status: HistoricalOrdersStatus;
}

export function useHistoricalOrders(): HistoricalOrdersResult {
	const { address, isConnected } = useWalletSession();
	const enabled = isConnected && !!address;
	const user = address ?? EMPTY_ADDRESS;
	const historicalOrdersQuery = useInfo(
		"historicalOrders",
		{ user },
		{
			enabled,
			retry: 1,
			staleTime: HISTORICAL_ORDERS_STALE_TIME_MS,
			refetchOnWindowFocus: false,
			refetchOnReconnect: true,
		},
	);
	const historicalOrdersSubscription = useSubscription("userHistoricalOrders", { user }, { enabled });
	const twapHistory = useTwapHistory();

	const restOrders = historicalOrdersQuery.data;
	const realtimeOrders = historicalOrdersSubscription.data?.orderHistory;
	const hasMalformedRest =
		restOrders !== undefined &&
		(!Array.isArray(restOrders) || restOrders.some((entry) => !isValidHistoricalOrderHistoryItem(entry)));
	const hasMalformedRealtime =
		realtimeOrders !== undefined &&
		(!Array.isArray(realtimeOrders) || realtimeOrders.some((entry) => !isValidHistoricalOrderHistoryItem(entry)));
	const hasRestSnapshot = restOrders !== undefined && !hasMalformedRest;
	const orders = mergeHistoricalOrderSources(
		hasMalformedRest || !Array.isArray(restOrders) ? undefined : restOrders,
		hasMalformedRealtime || !Array.isArray(realtimeOrders) ? undefined : realtimeOrders,
	);
	const entries = buildOrderHistoryEntries(orders, twapHistory.latestHistory).slice(0, MAX_HISTORY_ROWS);
	const hasMalformedHistory = hasMalformedRest || hasMalformedRealtime;

	let status: HistoricalOrdersStatus = "loading";
	if (!enabled) {
		status = "idle";
	} else if (hasMalformedHistory || twapHistory.status === "error") {
		status = "error";
	} else if (hasRestSnapshot && twapHistory.status === "ready") {
		status = "ready";
	} else if (historicalOrdersQuery.isError) {
		status = "error";
	}

	return {
		error:
			status === "error"
				? (historicalOrdersQuery.error ??
					twapHistory.error ??
					(hasMalformedHistory ? new MalformedHistoryPageError() : undefined))
				: undefined,
		entries,
		isConnected,
		orders: orders.slice(0, MAX_HISTORY_ROWS),
		status,
	};
}
