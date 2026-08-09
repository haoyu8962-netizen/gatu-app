import type { TwapHistoryResponse } from "@nktkas/hyperliquid";
import { useState } from "react";
import { MAX_HISTORY_ROWS, MAX_TWAP_HISTORY_ROWS, TWAP_HISTORY_PAGE_SIZE } from "@/config/trade";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useInfo, useSubscription } from "@/lib/hyperliquid";
import { MalformedHistoryPageError } from "@/lib/trade/history-pagination";
import {
	isValidTwapHistoryItem,
	mergeTwapHistoryEventSources,
	mergeTwapHistorySources,
} from "@/lib/trade/order-history";

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
const TWAP_HISTORY_STALE_TIME_MS = 30_000;

export type TwapHistoryStatus = "idle" | "loading" | "ready" | "error";

interface TwapHistoryResult {
	error: unknown;
	hasMore: boolean;
	history: TwapHistoryResponse;
	isConnected: boolean;
	isRealtimeDegraded: boolean;
	latestHistory: TwapHistoryResponse;
	loadMore: () => void;
	realtimeError: unknown;
	retryRealtime: () => void;
	status: TwapHistoryStatus;
}

export function useTwapHistory(): TwapHistoryResult {
	const { address, isConnected } = useWalletSession();
	const enabled = isConnected && !!address;
	const user = address ?? EMPTY_ADDRESS;
	const [realtimeRefreshKey, setRealtimeRefreshKey] = useState<number>();
	const [pagination, setPagination] = useState({ user, visibleRows: TWAP_HISTORY_PAGE_SIZE });
	const historyQuery = useInfo(
		"twapHistory",
		{ user },
		{
			enabled,
			retry: 1,
			staleTime: TWAP_HISTORY_STALE_TIME_MS,
			refetchOnWindowFocus: false,
			refetchOnReconnect: true,
		},
	);
	const historySubscription = useSubscription(
		"userTwapHistory",
		{ user },
		realtimeRefreshKey === undefined ? { enabled } : { enabled, refreshKey: realtimeRefreshKey },
	);

	const restHistory = historyQuery.data;
	const realtimeHistory = historySubscription.data?.history;
	const hasMalformedRest =
		restHistory !== undefined &&
		(!Array.isArray(restHistory) || restHistory.some((entry) => !isValidTwapHistoryItem(entry)));
	const hasMalformedRealtime =
		realtimeHistory !== undefined &&
		(!Array.isArray(realtimeHistory) || realtimeHistory.some((entry) => !isValidTwapHistoryItem(entry)));
	const hasRestSnapshot = restHistory !== undefined && !hasMalformedRest;
	const validRestHistory = hasMalformedRest || !Array.isArray(restHistory) ? undefined : restHistory;
	const validRealtimeHistory = hasMalformedRealtime || !Array.isArray(realtimeHistory) ? undefined : realtimeHistory;
	const mergedHistory = mergeTwapHistoryEventSources(validRestHistory, validRealtimeHistory).slice(
		0,
		MAX_TWAP_HISTORY_ROWS,
	);
	const visibleRows = pagination.user === user ? pagination.visibleRows : TWAP_HISTORY_PAGE_SIZE;
	const history = mergedHistory.slice(0, visibleRows);
	const latestHistory = mergeTwapHistorySources(validRestHistory, validRealtimeHistory).slice(0, MAX_HISTORY_ROWS);
	const hasMalformedHistory = hasMalformedRest || hasMalformedRealtime;

	let status: TwapHistoryStatus = "loading";
	if (!enabled) {
		status = "idle";
	} else if (hasMalformedHistory) {
		status = "error";
	} else if (hasRestSnapshot) {
		status = "ready";
	} else if (historyQuery.isError) {
		status = "error";
	}

	const isRealtimeDegraded = status === "ready" && historySubscription.status === "error";

	function loadMore() {
		setPagination((current) => ({
			user,
			visibleRows: Math.min(
				(current.user === user ? current.visibleRows : TWAP_HISTORY_PAGE_SIZE) + TWAP_HISTORY_PAGE_SIZE,
				MAX_TWAP_HISTORY_ROWS,
			),
		}));
	}

	function retryRealtime() {
		setRealtimeRefreshKey((current) => (current ?? 0) + 1);
		void historyQuery.refetch();
	}

	return {
		error:
			status === "error"
				? (historyQuery.error ?? (hasMalformedHistory ? new MalformedHistoryPageError() : undefined))
				: undefined,
		hasMore: history.length < mergedHistory.length,
		history,
		isConnected,
		isRealtimeDegraded,
		latestHistory,
		loadMore,
		realtimeError: isRealtimeDegraded ? historySubscription.error : undefined,
		retryRealtime,
		status,
	};
}
