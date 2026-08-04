import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import { MAX_HISTORY_ROWS } from "@/config/trade";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useInfo, useSubscription } from "@/lib/hyperliquid";
import { mergeHistoricalOrderSources } from "@/lib/trade/historical-orders";

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
const HISTORICAL_ORDERS_STALE_TIME_MS = 30_000;

type HistoricalOrdersStatus = "idle" | "loading" | "ready" | "error";

interface HistoricalOrdersResult {
	error: unknown;
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

	const restOrders = historicalOrdersQuery.data;
	const realtimeOrders = historicalOrdersSubscription.data?.orderHistory;
	const hasRestSnapshot = restOrders !== undefined;
	const hasRealtimeSnapshot = realtimeOrders !== undefined;
	const orders = mergeHistoricalOrderSources(restOrders, realtimeOrders).slice(0, MAX_HISTORY_ROWS);

	let status: HistoricalOrdersStatus = "loading";
	if (!enabled) {
		status = "idle";
	} else if (hasRestSnapshot || hasRealtimeSnapshot) {
		status = "ready";
	} else if (historicalOrdersQuery.isError && historicalOrdersSubscription.status === "error") {
		status = "error";
	}

	return {
		error: status === "error" ? (historicalOrdersSubscription.error ?? historicalOrdersQuery.error) : undefined,
		isConnected,
		orders,
		status,
	};
}
