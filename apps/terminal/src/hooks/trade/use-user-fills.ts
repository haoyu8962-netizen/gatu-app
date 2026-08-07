import type { UserFillsResponse } from "@nktkas/hyperliquid";
import { MAX_HISTORY_ROWS } from "@/config/trade";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useInfo, useSubscription } from "@/lib/hyperliquid";
import { MalformedHistoryPageError } from "@/lib/trade/history-pagination";
import {
	isValidUserFillHistoryItem,
	isValidUserTwapSliceFillHistoryItem,
	mergeUserFillSources,
	normalizeUserTwapSliceFills,
} from "@/lib/trade/user-fills";

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
const USER_FILLS_STALE_TIME_MS = 30_000;

type UserFillsStatus = "idle" | "loading" | "ready" | "error";

interface UserFillsResult {
	error: unknown;
	fills: UserFillsResponse;
	isConnected: boolean;
	status: UserFillsStatus;
}

export function useUserFills(): UserFillsResult {
	const { address, isConnected } = useWalletSession();
	const enabled = isConnected && !!address;
	const user = address ?? EMPTY_ADDRESS;
	const params = { user, aggregateByTime: true } as const;
	const fillsQuery = useInfo("userFills", params, {
		enabled,
		retry: 1,
		staleTime: USER_FILLS_STALE_TIME_MS,
		refetchOnWindowFocus: false,
		refetchOnReconnect: true,
	});
	const fillsSubscription = useSubscription("userFills", params, { enabled });
	const twapFillsQuery = useInfo(
		"userTwapSliceFills",
		{ user },
		{
			enabled,
			retry: 1,
			staleTime: USER_FILLS_STALE_TIME_MS,
			refetchOnWindowFocus: false,
			refetchOnReconnect: true,
		},
	);
	const twapFillsSubscription = useSubscription("userTwapSliceFills", { user }, { enabled });

	const restFills = fillsQuery.data;
	const realtimeFills = fillsSubscription.data?.fills;
	const restTwapFills = twapFillsQuery.data;
	const realtimeTwapFills = twapFillsSubscription.data?.twapSliceFills;
	const hasMalformedRest =
		restFills !== undefined &&
		(!Array.isArray(restFills) || restFills.some((fill) => !isValidUserFillHistoryItem(fill)));
	const hasMalformedRealtime =
		realtimeFills !== undefined &&
		(!Array.isArray(realtimeFills) || realtimeFills.some((fill) => !isValidUserFillHistoryItem(fill)));
	const hasMalformedRestTwap =
		restTwapFills !== undefined &&
		(!Array.isArray(restTwapFills) || restTwapFills.some((entry) => !isValidUserTwapSliceFillHistoryItem(entry)));
	const hasMalformedRealtimeTwap =
		realtimeTwapFills !== undefined &&
		(!Array.isArray(realtimeTwapFills) ||
			realtimeTwapFills.some((entry) => !isValidUserTwapSliceFillHistoryItem(entry)));
	const hasRestSnapshot = restFills !== undefined && !hasMalformedRest;
	const hasRestTwapSnapshot = restTwapFills !== undefined && !hasMalformedRestTwap;
	const fills = mergeUserFillSources(
		hasMalformedRest || !Array.isArray(restFills) ? undefined : restFills,
		hasMalformedRealtime || !Array.isArray(realtimeFills) ? undefined : realtimeFills,
		hasMalformedRestTwap || !Array.isArray(restTwapFills) ? undefined : normalizeUserTwapSliceFills(restTwapFills),
		hasMalformedRealtimeTwap || !Array.isArray(realtimeTwapFills)
			? undefined
			: normalizeUserTwapSliceFills(realtimeTwapFills),
	).slice(0, MAX_HISTORY_ROWS);
	const hasMalformedHistory =
		hasMalformedRest || hasMalformedRealtime || hasMalformedRestTwap || hasMalformedRealtimeTwap;

	let status: UserFillsStatus = "loading";
	if (!enabled) {
		status = "idle";
	} else if (hasMalformedHistory) {
		status = "error";
	} else if (hasRestSnapshot && hasRestTwapSnapshot) {
		status = "ready";
	} else if (fillsQuery.isError || twapFillsQuery.isError) {
		status = "error";
	}

	return {
		error:
			status === "error"
				? (fillsQuery.error ??
					twapFillsQuery.error ??
					(hasMalformedHistory ? new MalformedHistoryPageError() : undefined))
				: undefined,
		fills,
		isConnected,
		status,
	};
}
