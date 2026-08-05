import type { InfoClient, UserFundingResponse } from "@nktkas/hyperliquid";
import { useQuery } from "@tanstack/react-query";
import { MAX_HISTORY_ROWS } from "@/config/trade";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useHyperliquid, useSubscription } from "@/lib/hyperliquid";
import {
	fetchHistoryPageWithRetry,
	fetchTimeRangeHistory,
	isIncompleteHistorySnapshotError,
	MalformedHistoryPageError,
	requireCompleteHistorySnapshot,
} from "@/lib/trade/history-pagination";
import {
	getUserFundingKey,
	isValidUserFunding,
	mergeUserFundingSources,
	normalizeUserFundingResponse,
	type UserFunding,
} from "@/lib/trade/user-funding";

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
const FUNDING_STALE_TIME_MS = 30_000;
const FUNDING_LIST_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

type UserFundingStatus = "idle" | "loading" | "ready" | "error";

interface UserFundingResult {
	error: unknown;
	fundings: UserFunding[];
	isConnected: boolean;
	status: UserFundingStatus;
}

export async function fetchRecentUserFunding(
	info: InfoClient,
	user: `0x${string}`,
	signal: AbortSignal,
): Promise<UserFunding[]> {
	const endTime = Date.now();
	const startTime = endTime - FUNDING_LIST_LOOKBACK_MS;
	const result = await fetchTimeRangeHistory({
		endTime,
		fetchPage: async (pageStartTime, pageEndTime, pageSignal) => {
			const response = await fetchHistoryPageWithRetry(
				(requestSignal) => info.userFunding({ endTime: pageEndTime, startTime: pageStartTime, user }, requestSignal),
				{ signal: pageSignal },
			);
			return normalizeUserFundingResponse(response as UserFundingResponse);
		},
		getKey: getUserFundingKey,
		getTime: (funding) => funding.time,
		retainLatestItems: MAX_HISTORY_ROWS,
		signal,
		startTime,
		validateItem: isValidUserFunding,
	});
	return requireCompleteHistorySnapshot(result);
}

export function useUserFunding(): UserFundingResult {
	const { address, isConnected } = useWalletSession();
	const { env, info } = useHyperliquid();
	const enabled = isConnected && !!address;
	const user = address ?? EMPTY_ADDRESS;
	const fundingQuery = useQuery({
		enabled,
		queryFn: ({ signal }) => fetchRecentUserFunding(info, user, signal),
		queryKey: ["hl", "recent-history", "userFunding", env, user.toLowerCase()],
		refetchOnReconnect: true,
		refetchOnWindowFocus: false,
		retry: false,
		staleTime: FUNDING_STALE_TIME_MS,
	});
	const fundingSubscription = useSubscription("userFundings", { user }, { enabled });

	const restFundings = fundingQuery.data;
	const realtimeFundings = fundingSubscription.data?.fundings;
	const hasMalformedRealtime =
		realtimeFundings !== undefined &&
		(!Array.isArray(realtimeFundings) || realtimeFundings.some((funding) => !isValidUserFunding(funding)));
	const hasRestSnapshot = fundingQuery.data !== undefined;
	const hasIncompleteRestSnapshot = isIncompleteHistorySnapshotError(fundingQuery.error);
	const fundings = mergeUserFundingSources(
		restFundings,
		hasMalformedRealtime || !Array.isArray(realtimeFundings) ? undefined : realtimeFundings,
	).slice(0, MAX_HISTORY_ROWS);

	let status: UserFundingStatus = "loading";
	if (!enabled) {
		status = "idle";
	} else if (hasIncompleteRestSnapshot || hasMalformedRealtime) {
		status = "error";
	} else if (hasRestSnapshot) {
		status = "ready";
	} else if (fundingQuery.isError) {
		status = "error";
	}

	return {
		error:
			status === "error"
				? (fundingQuery.error ?? (hasMalformedRealtime ? new MalformedHistoryPageError() : undefined))
				: undefined,
		fundings,
		isConnected,
		status,
	};
}
