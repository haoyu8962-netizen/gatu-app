import type { InfoClient, UserFundingResponse } from "@nktkas/hyperliquid";
import { useQuery } from "@tanstack/react-query";
import { useOnlineStatus } from "@/hooks/use-mobile";
import { useHyperliquid } from "@/lib/hyperliquid";
import { FUNDING_HISTORY_WINDOW_MS, isFundingHistoryAddress } from "@/lib/trade/funding-history";
import {
	fetchHistoryPageWithRetry,
	fetchTimeRangeHistory,
	requireCompleteHistorySnapshot,
} from "@/lib/trade/history-pagination";
import {
	getUserFundingKey,
	isValidUserFunding,
	normalizeUserFundingResponse,
	type UserFunding,
} from "@/lib/trade/user-funding";

const FUNDING_HISTORY_STALE_TIME_MS = 30_000;

export interface FundingHistorySnapshot {
	endTime: number;
	fundings: UserFunding[];
	startTime: number;
}

export type FundingHistoryStatus = "disabled" | "error" | "loading" | "offline" | "ready";

interface FundingHistoryResult {
	error: unknown;
	fundings: UserFunding[];
	isOffline: boolean;
	isRefreshing: boolean;
	rangeEndTime: number | null;
	rangeStartTime: number | null;
	refresh: () => void;
	status: FundingHistoryStatus;
}

export async function fetchFundingHistoryWindow(
	info: InfoClient,
	user: `0x${string}`,
	startTime: number,
	endTime: number,
	signal: AbortSignal,
): Promise<UserFunding[]> {
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
		pageLimit: 500,
		requireAscending: true,
		signal,
		startTime,
		validateItem: isValidUserFunding,
	});

	return requireCompleteHistorySnapshot(result).reverse();
}

export function useFundingHistory(address: string): FundingHistoryResult {
	const { env, info } = useHyperliquid();
	const isOnline = useOnlineStatus();
	const enabled = isFundingHistoryAddress(address);
	const normalizedAddress = address.toLowerCase();
	const query = useQuery({
		enabled,
		queryFn: async ({ signal }): Promise<FundingHistorySnapshot> => {
			if (!isFundingHistoryAddress(address)) throw new Error("Invalid account address.");
			const endTime = Date.now();
			const startTime = endTime - FUNDING_HISTORY_WINDOW_MS;
			const fundings = await fetchFundingHistoryWindow(info, address, startTime, endTime, signal);
			return { endTime, fundings, startTime };
		},
		queryKey: ["hl", "funding-history", "userFunding", env, normalizedAddress],
		refetchOnReconnect: true,
		refetchOnWindowFocus: false,
		retry: false,
		staleTime: FUNDING_HISTORY_STALE_TIME_MS,
	});

	let status: FundingHistoryStatus = "loading";
	if (!enabled) status = "disabled";
	else if (query.data !== undefined) status = "ready";
	else if (!isOnline || query.fetchStatus === "paused") status = "offline";
	else if (query.isError) status = "error";

	return {
		error: query.error,
		fundings: query.data?.fundings ?? [],
		isOffline: !isOnline || query.fetchStatus === "paused",
		isRefreshing: query.isFetching && query.data !== undefined,
		rangeEndTime: query.data?.endTime ?? null,
		rangeStartTime: query.data?.startTime ?? null,
		refresh: () => void query.refetch(),
		status,
	};
}
