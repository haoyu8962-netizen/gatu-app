import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import { RECENT_ACCOUNT_HISTORY_ROWS } from "@/config/trade";
import { useOnlineStatus } from "@/hooks/use-mobile";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useSubscription } from "@/lib/hyperliquid";
import { isValidHistoricalOrderHistoryItem, mergeHistoricalOrderSources } from "@/lib/trade/historical-orders";
import { MalformedHistoryPageError } from "@/lib/trade/history-pagination";
import { buildHistoricalOrderEntries, type OrdinaryOrderHistoryEntry } from "@/lib/trade/order-history";

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";

type HistoricalOrdersStatus = "error" | "idle" | "loading" | "offline" | "ready";

interface HistoricalOrdersResult {
	error: unknown;
	entries: OrdinaryOrderHistoryEntry[];
	isConnected: boolean;
	isOffline: boolean;
	isStale: boolean;
	orders: HistoricalOrdersResponse;
	status: HistoricalOrdersStatus;
}

export function useHistoricalOrders(): HistoricalOrdersResult {
	const { address, isConnected } = useWalletSession();
	const isOnline = useOnlineStatus();
	const enabled = isConnected && !!address;
	const user = address ?? EMPTY_ADDRESS;
	const historicalOrdersSubscription = useSubscription("userHistoricalOrders", { user }, { enabled });

	const payload = historicalOrdersSubscription.data;
	const realtimeOrders = payload?.orderHistory;
	const hasMismatchedUser =
		payload !== undefined && (typeof payload.user !== "string" || payload.user.toLowerCase() !== user.toLowerCase());
	const hasMalformedRealtime =
		payload !== undefined &&
		(hasMismatchedUser ||
			!Array.isArray(realtimeOrders) ||
			realtimeOrders.some((entry) => !isValidHistoricalOrderHistoryItem(entry)));
	const hasValidRealtime = payload !== undefined && !hasMalformedRealtime && Array.isArray(realtimeOrders);
	const isStale =
		enabled &&
		hasValidRealtime &&
		(historicalOrdersSubscription.isStale || historicalOrdersSubscription.status !== "active");
	const orders = mergeHistoricalOrderSources(hasValidRealtime ? realtimeOrders : undefined).slice(
		0,
		RECENT_ACCOUNT_HISTORY_ROWS,
	);
	const entries = buildHistoricalOrderEntries(orders);

	let status: HistoricalOrdersStatus = "loading";
	if (!enabled) {
		status = "idle";
	} else if (hasMalformedRealtime) {
		status = "error";
	} else if (hasValidRealtime) {
		status = "ready";
	} else if (!isOnline) {
		status = "offline";
	} else if (historicalOrdersSubscription.status === "error") {
		status = "error";
	}

	return {
		error: historicalOrdersSubscription.error ?? (hasMalformedRealtime ? new MalformedHistoryPageError() : undefined),
		entries,
		isConnected: enabled,
		isOffline: enabled && !isOnline,
		isStale,
		orders,
		status,
	};
}
