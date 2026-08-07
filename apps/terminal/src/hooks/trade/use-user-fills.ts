import type { UserFillsResponse } from "@nktkas/hyperliquid";
import { MAX_HISTORY_ROWS } from "@/config/trade";
import { useTwapSliceFills } from "@/hooks/trade/use-twap-slice-fills";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useInfo, useSubscription } from "@/lib/hyperliquid";
import { MalformedHistoryPageError } from "@/lib/trade/history-pagination";
import { isValidUserFillHistoryItem, mergeUserFillSources } from "@/lib/trade/user-fills";

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
	const twapFills = useTwapSliceFills();

	const restFills = fillsQuery.data;
	const realtimeFills = fillsSubscription.data?.fills;
	const hasMalformedRest =
		restFills !== undefined &&
		(!Array.isArray(restFills) || restFills.some((fill) => !isValidUserFillHistoryItem(fill)));
	const hasMalformedRealtime =
		realtimeFills !== undefined &&
		(!Array.isArray(realtimeFills) || realtimeFills.some((fill) => !isValidUserFillHistoryItem(fill)));
	const hasRestSnapshot = restFills !== undefined && !hasMalformedRest;
	const fills = mergeUserFillSources(
		hasMalformedRest || !Array.isArray(restFills) ? undefined : restFills,
		hasMalformedRealtime || !Array.isArray(realtimeFills) ? undefined : realtimeFills,
		twapFills.fills,
	).slice(0, MAX_HISTORY_ROWS);
	const hasMalformedHistory = hasMalformedRest || hasMalformedRealtime;

	let status: UserFillsStatus = "loading";
	if (!enabled) {
		status = "idle";
	} else if (hasMalformedHistory || twapFills.status === "error") {
		status = "error";
	} else if (hasRestSnapshot && twapFills.status === "ready") {
		status = "ready";
	} else if (fillsQuery.isError) {
		status = "error";
	}

	return {
		error:
			status === "error"
				? (fillsQuery.error ?? twapFills.error ?? (hasMalformedHistory ? new MalformedHistoryPageError() : undefined))
				: undefined,
		fills,
		isConnected,
		status,
	};
}
