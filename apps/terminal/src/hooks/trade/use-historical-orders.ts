import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import { MAX_HISTORY_ROWS } from "@/config/trade";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useInfo, useSubscription } from "@/lib/hyperliquid";
import { isValidHistoricalOrderHistoryItem, mergeHistoricalOrderSources } from "@/lib/trade/historical-orders";
import { MalformedHistoryPageError } from "@/lib/trade/history-pagination";
import {
	buildOrderHistoryEntries,
	isValidTwapHistoryItem,
	mergeTwapHistorySources,
	type OrderHistoryEntry,
} from "@/lib/trade/order-history";

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
	const twapHistoryQuery = useInfo(
		"twapHistory",
		{ user },
		{
			enabled,
			retry: 1,
			staleTime: HISTORICAL_ORDERS_STALE_TIME_MS,
			refetchOnWindowFocus: false,
			refetchOnReconnect: true,
		},
	);
	const twapHistorySubscription = useSubscription("userTwapHistory", { user }, { enabled });

	const restOrders = historicalOrdersQuery.data;
	const realtimeOrders = historicalOrdersSubscription.data?.orderHistory;
	const restTwaps = twapHistoryQuery.data;
	const realtimeTwaps = twapHistorySubscription.data?.history;
	const hasMalformedRest =
		restOrders !== undefined &&
		(!Array.isArray(restOrders) || restOrders.some((entry) => !isValidHistoricalOrderHistoryItem(entry)));
	const hasMalformedRealtime =
		realtimeOrders !== undefined &&
		(!Array.isArray(realtimeOrders) || realtimeOrders.some((entry) => !isValidHistoricalOrderHistoryItem(entry)));
	const hasMalformedRestTwaps =
		restTwaps !== undefined && (!Array.isArray(restTwaps) || restTwaps.some((entry) => !isValidTwapHistoryItem(entry)));
	const hasMalformedRealtimeTwaps =
		realtimeTwaps !== undefined &&
		(!Array.isArray(realtimeTwaps) || realtimeTwaps.some((entry) => !isValidTwapHistoryItem(entry)));
	const hasRestSnapshot = restOrders !== undefined && !hasMalformedRest;
	const hasRestTwapSnapshot = restTwaps !== undefined && !hasMalformedRestTwaps;
	const orders = mergeHistoricalOrderSources(
		hasMalformedRest || !Array.isArray(restOrders) ? undefined : restOrders,
		hasMalformedRealtime || !Array.isArray(realtimeOrders) ? undefined : realtimeOrders,
	);
	const twaps = mergeTwapHistorySources(
		hasMalformedRestTwaps || !Array.isArray(restTwaps) ? undefined : restTwaps,
		hasMalformedRealtimeTwaps || !Array.isArray(realtimeTwaps) ? undefined : realtimeTwaps,
	);
	const entries = buildOrderHistoryEntries(orders, twaps).slice(0, MAX_HISTORY_ROWS);
	const hasMalformedHistory =
		hasMalformedRest || hasMalformedRealtime || hasMalformedRestTwaps || hasMalformedRealtimeTwaps;

	let status: HistoricalOrdersStatus = "loading";
	if (!enabled) {
		status = "idle";
	} else if (hasMalformedHistory) {
		status = "error";
	} else if (hasRestSnapshot && hasRestTwapSnapshot) {
		status = "ready";
	} else if (historicalOrdersQuery.isError || twapHistoryQuery.isError) {
		status = "error";
	}

	return {
		error:
			status === "error"
				? (historicalOrdersQuery.error ??
					twapHistoryQuery.error ??
					(hasMalformedHistory ? new MalformedHistoryPageError() : undefined))
				: undefined,
		entries,
		isConnected,
		orders: orders.slice(0, MAX_HISTORY_ROWS),
		status,
	};
}
