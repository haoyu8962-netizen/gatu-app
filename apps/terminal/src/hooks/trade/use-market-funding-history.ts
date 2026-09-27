import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
	bucketFundingRates,
	FUNDING_HISTORY_RANGES,
	type FundingHistoryRange,
	type FundingRateBucket,
} from "@/domain/market/funding-rate-history";
import { useOnlineStatus } from "@/hooks/use-mobile";
import { useHyperliquid } from "@/lib/hyperliquid";
import { fetchMarketFundingHistory } from "@/lib/trade/market-funding-history";

const MARKET_FUNDING_HISTORY_STALE_TIME_MS = 5 * 60_000;

export type MarketFundingHistoryStatus = "disabled" | "error" | "loading" | "offline" | "ready";

interface Options {
	coin: string;
	enabled: boolean;
	range: FundingHistoryRange;
}

interface MarketFundingHistoryResult {
	buckets: FundingRateBucket[];
	isRefreshing: boolean;
	refresh: () => void;
	status: MarketFundingHistoryStatus;
}

const EMPTY_BUCKETS: FundingRateBucket[] = [];

export function getMarketFundingHistoryQueryKey(env: string, coin: string, range: FundingHistoryRange) {
	return ["hl", "market-funding-history", env, coin, range] as const;
}

export function useMarketFundingHistory({ coin, enabled, range }: Options): MarketFundingHistoryResult {
	const { env, info } = useHyperliquid();
	const queryClient = useQueryClient();
	const isOnline = useOnlineStatus();
	const queryEnabled = enabled && coin !== "";
	const query = useQuery({
		enabled: queryEnabled,
		queryFn: async ({ signal }): Promise<FundingRateBucket[]> => {
			const rows = await fetchMarketFundingHistory({ coin, info, now: Date.now(), range, signal });
			return bucketFundingRates(rows, FUNDING_HISTORY_RANGES[range].bucketMs);
		},
		queryKey: getMarketFundingHistoryQueryKey(env, coin, range),
		refetchOnReconnect: true,
		refetchOnWindowFocus: false,
		retry: false,
		staleTime: MARKET_FUNDING_HISTORY_STALE_TIME_MS,
	});

	useEffect(() => {
		if (queryEnabled) return;
		void queryClient.cancelQueries({
			exact: true,
			queryKey: getMarketFundingHistoryQueryKey(env, coin, range),
			type: "inactive",
		});
	}, [queryClient, queryEnabled, env, coin, range]);

	const isCurrentSnapshot = query.status === "success" && query.fetchStatus === "idle" && isOnline;
	let status: MarketFundingHistoryStatus = "loading";
	if (query.data !== undefined && (query.data.length > 0 || isCurrentSnapshot)) status = "ready";
	else if (!queryEnabled) status = "disabled";
	else if (!isOnline || query.fetchStatus === "paused") status = "offline";
	else if (query.isError && !query.isFetching) status = "error";

	return {
		buckets: query.data ?? EMPTY_BUCKETS,
		isRefreshing: query.isFetching && query.data !== undefined,
		refresh: () => void query.refetch(),
		status,
	};
}
