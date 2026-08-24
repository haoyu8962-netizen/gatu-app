import { RECENT_FUNDING_ROWS } from "@/config/trade";
import { useOnlineStatus } from "@/hooks/use-mobile";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useSubscription } from "@/lib/hyperliquid";
import { MalformedHistoryPageError } from "@/lib/trade/history-pagination";
import { mergeUserFundingSources, normalizeUserFunding, type UserFunding } from "@/lib/trade/user-funding";

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";

type UserFundingStatus = "error" | "idle" | "loading" | "offline" | "ready";

interface UserFundingResult {
	error: unknown;
	fundings: UserFunding[];
	isConnected: boolean;
	isOffline: boolean;
	isStale: boolean;
	status: UserFundingStatus;
}

function normalizeRealtimeFundings(value: unknown): UserFunding[] | null {
	if (!Array.isArray(value)) return null;

	const normalized: UserFunding[] = [];
	for (const funding of value) {
		const candidate = normalizeUserFunding(funding);
		if (!candidate) return null;
		normalized.push(candidate);
	}
	return normalized;
}

export function useUserFunding(): UserFundingResult {
	const { address, isConnected } = useWalletSession();
	const isOnline = useOnlineStatus();
	const enabled = isConnected && !!address;
	const user = address ?? EMPTY_ADDRESS;
	const fundingSubscription = useSubscription("userFundings", { user }, { enabled });

	const payload = fundingSubscription.data;
	const realtimeFundings = payload?.fundings;
	const normalizedRealtimeFundings = normalizeRealtimeFundings(realtimeFundings);
	const hasMismatchedUser =
		payload !== undefined && (typeof payload.user !== "string" || payload.user.toLowerCase() !== user.toLowerCase());
	const hasMalformedRealtime = payload !== undefined && (hasMismatchedUser || normalizedRealtimeFundings === null);
	const hasValidRealtime = payload !== undefined && !hasMalformedRealtime && normalizedRealtimeFundings !== null;
	const fundings = mergeUserFundingSources(hasValidRealtime ? normalizedRealtimeFundings : undefined).slice(
		0,
		RECENT_FUNDING_ROWS,
	);

	let status: UserFundingStatus = "loading";
	if (!enabled) {
		status = "idle";
	} else if (hasMalformedRealtime) {
		status = "error";
	} else if (hasValidRealtime) {
		status = "ready";
	} else if (!isOnline) {
		status = "offline";
	} else if (fundingSubscription.status === "error") {
		status = "error";
	}

	return {
		error: fundingSubscription.error ?? (hasMalformedRealtime ? new MalformedHistoryPageError() : undefined),
		fundings,
		isConnected: enabled,
		isOffline: enabled && !isOnline,
		isStale: fundingSubscription.isStale,
		status,
	};
}
