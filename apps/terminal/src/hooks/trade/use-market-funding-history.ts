import { focusManager, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
	bucketFundingRates,
	FUNDING_HISTORY_RANGES,
	type FundingHistoryRange,
	type FundingHistorySnapshotReceipt,
	type FundingRateBucket,
	getFundingHistorySnapshotRemainingMs,
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

interface MarketFundingHistorySnapshot {
	buckets: FundingRateBucket[];
	receipt: FundingHistorySnapshotReceipt;
}

const EMPTY_BUCKETS: FundingRateBucket[] = [];

export function getMarketFundingHistoryQueryKey(env: string, coin: string, range: FundingHistoryRange) {
	return ["hl", "market-funding-history", env, coin, range] as const;
}

function hasEmptySnapshot(query: { state: { data: MarketFundingHistorySnapshot | undefined } }) {
	return query.state.data?.buckets.length === 0;
}

function getSnapshotRemainingMs(receipt: FundingHistorySnapshotReceipt) {
	return getFundingHistorySnapshotRemainingMs(
		receipt,
		Date.now(),
		performance.now(),
		MARKET_FUNDING_HISTORY_STALE_TIME_MS,
	);
}

function createSnapshotFreshnessClock(receipt: FundingHistorySnapshotReceipt | undefined) {
	let fresh = receipt !== undefined && getSnapshotRemainingMs(receipt) > 0;
	return {
		getSnapshot: () => fresh,
		subscribe(onExpired: () => void) {
			if (receipt === undefined || !fresh) return () => {};
			let timeout: ReturnType<typeof setTimeout> | undefined;
			function checkFreshness() {
				if (!fresh || receipt === undefined) return;
				if (timeout !== undefined) clearTimeout(timeout);
				timeout = undefined;
				const remainingMs = getSnapshotRemainingMs(receipt);
				if (remainingMs > 0) {
					timeout = setTimeout(checkFreshness, remainingMs);
					return;
				}
				fresh = false;
				onExpired();
			}
			checkFreshness();
			window.addEventListener("focus", checkFreshness);
			document.addEventListener("visibilitychange", checkFreshness);
			return () => {
				if (timeout !== undefined) clearTimeout(timeout);
				window.removeEventListener("focus", checkFreshness);
				document.removeEventListener("visibilitychange", checkFreshness);
			};
		},
	};
}

function useSnapshotFreshness(receipt: FundingHistorySnapshotReceipt | undefined): boolean {
	const clock = useMemo(() => createSnapshotFreshnessClock(receipt), [receipt]);
	return useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
}

export function useMarketFundingHistory({ coin, enabled, range }: Options): MarketFundingHistoryResult {
	const { env, info } = useHyperliquid();
	const queryClient = useQueryClient();
	const isOnline = useOnlineStatus();
	const queryEnabled = enabled && coin !== "";
	const query = useQuery({
		enabled: queryEnabled,
		queryFn: async ({ signal }): Promise<MarketFundingHistorySnapshot> => {
			const rows = await fetchMarketFundingHistory({ coin, info, now: Date.now(), range, signal });
			return {
				buckets: bucketFundingRates(rows, FUNDING_HISTORY_RANGES[range].bucketMs),
				receipt: { monotonicReceivedAt: performance.now(), receivedAt: Date.now() },
			};
		},
		queryKey: getMarketFundingHistoryQueryKey(env, coin, range),
		refetchInterval: (current) => (hasEmptySnapshot(current) ? MARKET_FUNDING_HISTORY_STALE_TIME_MS : false),
		refetchIntervalInBackground: false,
		refetchOnReconnect: true,
		refetchOnWindowFocus: hasEmptySnapshot,
		retry: false,
		staleTime: MARKET_FUNDING_HISTORY_STALE_TIME_MS,
	});
	const buckets = query.data?.buckets;
	const emptySnapshotReceipt = buckets?.length === 0 ? query.data?.receipt : undefined;
	const emptySnapshotFresh = useSnapshotFreshness(emptySnapshotReceipt);
	const emptySnapshotExpired = emptySnapshotReceipt !== undefined && !emptySnapshotFresh;

	useEffect(() => {
		if (queryEnabled) return;
		void queryClient.cancelQueries({
			exact: true,
			queryKey: getMarketFundingHistoryQueryKey(env, coin, range),
			type: "inactive",
		});
	}, [queryClient, queryEnabled, env, coin, range]);

	useEffect(() => {
		if (!emptySnapshotExpired) return;
		void queryClient.invalidateQueries(
			{
				exact: true,
				queryKey: getMarketFundingHistoryQueryKey(env, coin, range),
				refetchType: focusManager.isFocused() ? "active" : "none",
			},
			{ cancelRefetch: false },
		);
	}, [queryClient, emptySnapshotExpired, env, coin, range]);

	const isCurrentSnapshot =
		query.status === "success" && query.fetchStatus === "idle" && !query.isStale && emptySnapshotFresh && isOnline;
	let status: MarketFundingHistoryStatus = "loading";
	if (buckets !== undefined && (buckets.length > 0 || isCurrentSnapshot)) status = "ready";
	else if (!queryEnabled) status = "disabled";
	else if (!isOnline || query.fetchStatus === "paused") status = "offline";
	else if (query.isError && !query.isFetching) status = "error";

	return {
		buckets: buckets ?? EMPTY_BUCKETS,
		isRefreshing: query.isFetching && query.data !== undefined,
		refresh: () => void query.refetch(),
		status,
	};
}
