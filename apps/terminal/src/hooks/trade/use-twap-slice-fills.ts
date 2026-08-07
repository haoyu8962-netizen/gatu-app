import type { UserFillsResponse } from "@nktkas/hyperliquid";
import { MAX_HISTORY_ROWS } from "@/config/trade";
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
	isConnected: boolean;
	status: TwapSliceFillsStatus;
}

export function useTwapSliceFills(): TwapSliceFillsResult {
	const { address, isConnected } = useWalletSession();
	const enabled = isConnected && !!address;
	const user = address ?? EMPTY_ADDRESS;
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
	const fillsSubscription = useSubscription("userTwapSliceFills", { user }, { enabled });

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
	const fills = mergeUserFillSources(
		validRestFills ? normalizeUserTwapSliceFills(validRestFills) : undefined,
		validRealtimeFills ? normalizeUserTwapSliceFills(validRealtimeFills) : undefined,
	).slice(0, MAX_HISTORY_ROWS);
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

	return {
		error:
			status === "error"
				? (fillsQuery.error ?? (hasMalformedHistory ? new MalformedHistoryPageError() : undefined))
				: undefined,
		fills,
		isConnected,
		status,
	};
}
