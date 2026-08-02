import type { UserFillsResponse } from "@nktkas/hyperliquid";
import { MAX_HISTORY_ROWS } from "@/config/trade";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useInfo, useSubscription } from "@/lib/hyperliquid";
import { mergeUserFillSources } from "@/lib/trade/user-fills";

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

	const restFills = fillsQuery.data;
	const realtimeFills = fillsSubscription.data?.fills;
	const hasRestSnapshot = restFills !== undefined;
	const hasRealtimeFills = (realtimeFills?.length ?? 0) > 0;
	const realtimeSettled = fillsSubscription.status === "active" || fillsSubscription.status === "error";
	const fills = mergeUserFillSources(restFills, realtimeFills).slice(0, MAX_HISTORY_ROWS);

	let status: UserFillsStatus = "loading";
	if (!enabled) {
		status = "idle";
	} else if (hasRestSnapshot || hasRealtimeFills) {
		status = "ready";
	} else if (fillsQuery.isError && realtimeSettled) {
		status = "error";
	}

	return {
		error: status === "error" ? (fillsQuery.error ?? fillsSubscription.error) : undefined,
		fills,
		isConnected,
		status,
	};
}
