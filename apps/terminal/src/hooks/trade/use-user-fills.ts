import type { UserFillsResponse } from "@nktkas/hyperliquid";
import { RECENT_ACCOUNT_HISTORY_ROWS } from "@/config/trade";
import { useOnlineStatus } from "@/hooks/use-mobile";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useSubscription } from "@/lib/hyperliquid";
import { MalformedHistoryPageError } from "@/lib/trade/history-pagination";
import { filterNonTwapUserFills, isValidUserFillHistoryItem, mergeUserFillSources } from "@/lib/trade/user-fills";

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";

type UserFillsStatus = "error" | "idle" | "loading" | "offline" | "ready";

interface UserFillsResult {
	error: unknown;
	fills: UserFillsResponse;
	isConnected: boolean;
	isOffline: boolean;
	isStale: boolean;
	status: UserFillsStatus;
}

export function useUserFills(): UserFillsResult {
	const { address, isConnected } = useWalletSession();
	const isOnline = useOnlineStatus();
	const enabled = isConnected && !!address;
	const user = address ?? EMPTY_ADDRESS;
	const fillsSubscription = useSubscription("userFills", { user, aggregateByTime: true }, { enabled });

	const payload = fillsSubscription.data;
	const realtimeFills = payload?.fills;
	const hasMismatchedUser =
		payload !== undefined && (typeof payload.user !== "string" || payload.user.toLowerCase() !== user.toLowerCase());
	const hasMalformedRealtime =
		payload !== undefined &&
		(hasMismatchedUser ||
			!Array.isArray(realtimeFills) ||
			realtimeFills.some((fill) => !isValidUserFillHistoryItem(fill)));
	const hasValidRealtime = payload !== undefined && !hasMalformedRealtime && Array.isArray(realtimeFills);
	const isStale = enabled && hasValidRealtime && (fillsSubscription.isStale || fillsSubscription.status !== "active");
	const fills = filterNonTwapUserFills(mergeUserFillSources(hasValidRealtime ? realtimeFills : undefined)).slice(
		0,
		RECENT_ACCOUNT_HISTORY_ROWS,
	);

	let status: UserFillsStatus = "loading";
	if (!enabled) {
		status = "idle";
	} else if (hasMalformedRealtime) {
		status = "error";
	} else if (hasValidRealtime) {
		status = "ready";
	} else if (!isOnline) {
		status = "offline";
	} else if (fillsSubscription.status === "error") {
		status = "error";
	}

	return {
		error: fillsSubscription.error ?? (hasMalformedRealtime ? new MalformedHistoryPageError() : undefined),
		fills,
		isConnected: enabled,
		isOffline: enabled && !isOnline,
		isStale,
		status,
	};
}
