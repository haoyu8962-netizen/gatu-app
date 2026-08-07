import type { TwapHistoryResponse } from "@nktkas/hyperliquid";
import { MAX_HISTORY_ROWS } from "@/config/trade";
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
	history: TwapHistoryResponse;
	isConnected: boolean;
	latestHistory: TwapHistoryResponse;
	status: TwapHistoryStatus;
}

export function useTwapHistory(): TwapHistoryResult {
	const { address, isConnected } = useWalletSession();
	const enabled = isConnected && !!address;
	const user = address ?? EMPTY_ADDRESS;
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
	const historySubscription = useSubscription("userTwapHistory", { user }, { enabled });

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
	const history = mergeTwapHistoryEventSources(validRestHistory, validRealtimeHistory).slice(0, MAX_HISTORY_ROWS);
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

	return {
		error:
			status === "error"
				? (historyQuery.error ?? (hasMalformedHistory ? new MalformedHistoryPageError() : undefined))
				: undefined,
		history,
		isConnected,
		latestHistory,
		status,
	};
}
