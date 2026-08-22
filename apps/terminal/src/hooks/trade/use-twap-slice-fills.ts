import type { UserFillsResponse } from "@nktkas/hyperliquid";
import { useState } from "react";
import { MAX_TWAP_HISTORY_ROWS, TWAP_HISTORY_PAGE_SIZE } from "@/config/trade";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useInfo, useSubscription } from "@/lib/hyperliquid";
import { MalformedHistoryPageError } from "@/lib/trade/history-pagination";
import {
	isValidUserTwapSliceFillHistoryItem,
	mergeUserFillSources,
	normalizeUserTwapSliceFills,
} from "@/lib/trade/user-fills";

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
const TWAP_SLICE_FILLS_STALE_TIME_MS = 30_000;

export type TwapSliceFillsStatus = "idle" | "loading" | "ready" | "error";

interface TwapSliceFillsResult {
	error: unknown;
	fills: UserFillsResponse;
	hasMore: boolean;
	isConnected: boolean;
	isRealtimeDegraded: boolean;
	loadMore: () => void;
	realtimeError: unknown;
	retryRealtime: () => void;
	status: TwapSliceFillsStatus;
}

export function useTwapSliceFills(): TwapSliceFillsResult {
	const { address, isConnected } = useWalletSession();
	const enabled = isConnected && !!address;
	const user = address ?? EMPTY_ADDRESS;
	const [realtimeRefreshKey, setRealtimeRefreshKey] = useState<number>();
	const [pagination, setPagination] = useState({ user, visibleRows: TWAP_HISTORY_PAGE_SIZE });
	const fillsQuery = useInfo(
		"userTwapSliceFills",
		{ user },
		{
			enabled,
			retry: 1,
			staleTime: TWAP_SLICE_FILLS_STALE_TIME_MS,
			refetchOnWindowFocus: false,
			refetchOnReconnect: true,
		},
	);
	const fillsSubscription = useSubscription(
		"userTwapSliceFills",
		{ user },
		realtimeRefreshKey === undefined ? { enabled } : { enabled, refreshKey: realtimeRefreshKey },
	);

	const restFills = fillsQuery.data;
	const realtimeFills = fillsSubscription.data?.twapSliceFills;
	const hasMalformedRest =
		restFills !== undefined &&
		(!Array.isArray(restFills) || restFills.some((entry) => !isValidUserTwapSliceFillHistoryItem(entry)));
	const hasMalformedRealtime =
		realtimeFills !== undefined &&
		(!Array.isArray(realtimeFills) || realtimeFills.some((entry) => !isValidUserTwapSliceFillHistoryItem(entry)));
	const hasRestSnapshot = restFills !== undefined && !hasMalformedRest;
	const validRestFills = hasMalformedRest || !Array.isArray(restFills) ? undefined : restFills;
	const validRealtimeFills = hasMalformedRealtime || !Array.isArray(realtimeFills) ? undefined : realtimeFills;
	const mergedFills = mergeUserFillSources(
		validRestFills ? normalizeUserTwapSliceFills(validRestFills) : undefined,
		validRealtimeFills ? normalizeUserTwapSliceFills(validRealtimeFills) : undefined,
	).slice(0, MAX_TWAP_HISTORY_ROWS);
	const visibleRows = pagination.user === user ? pagination.visibleRows : TWAP_HISTORY_PAGE_SIZE;
	const fills = mergedFills.slice(0, visibleRows);
	const hasMalformedHistory = hasMalformedRest || hasMalformedRealtime;

	let status: TwapSliceFillsStatus = "loading";
	if (!enabled) {
		status = "idle";
	} else if (hasMalformedHistory) {
		status = "error";
	} else if (hasRestSnapshot) {
		status = "ready";
	} else if (fillsQuery.isError) {
		status = "error";
	}

	const isRealtimeDegraded = status === "ready" && fillsSubscription.status === "error";

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
		void fillsQuery.refetch();
	}

	return {
		error:
			status === "error"
				? (fillsQuery.error ?? (hasMalformedHistory ? new MalformedHistoryPageError() : undefined))
				: undefined,
		fills,
		hasMore: fills.length < mergedFills.length,
		isConnected,
		isRealtimeDegraded,
		loadMore,
		realtimeError: isRealtimeDegraded ? fillsSubscription.error : undefined,
		retryRealtime,
		status,
	};
}
