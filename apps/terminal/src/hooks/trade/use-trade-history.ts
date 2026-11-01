import type { InfoClient, UserFillsResponse } from "@nktkas/hyperliquid";
import { useQuery } from "@tanstack/react-query";
import { useOnlineStatus } from "@/hooks/use-mobile";
import { useHyperliquid } from "@/lib/hyperliquid";
import { isAccountHistoryAddress } from "@/lib/trade/account-history";
import { fetchHistoryPageWithRetry, MalformedHistoryPageError } from "@/lib/trade/history-pagination";
import { TRADE_HISTORY_SNAPSHOT_LIMIT } from "@/lib/trade/trade-history";
import { filterNonTwapUserFills, isValidUserFillHistoryItem, mergeUserFillSources } from "@/lib/trade/user-fills";

const TRADE_HISTORY_STALE_TIME_MS = 30_000;

export interface TradeHistorySnapshot {
	fills: UserFillsResponse;
	reachedLimit: boolean;
}

export type TradeHistoryStatus = "disabled" | "error" | "loading" | "offline" | "ready";

interface TradeHistoryResult {
	error: unknown;
	fills: UserFillsResponse;
	/** The latest request failed; an earlier snapshot may still be in `fills`. */
	hasFailed: boolean;
	isFetching: boolean;
	isOffline: boolean;
	isRefreshing: boolean;
	reachedLimit: boolean;
	refresh: () => void;
	status: TradeHistoryStatus;
}

interface TradeHistoryOptions {
	enabled?: boolean;
}

export async function fetchTradeHistorySnapshot(
	info: InfoClient,
	user: `0x${string}`,
	signal: AbortSignal,
): Promise<TradeHistorySnapshot> {
	const response = await fetchHistoryPageWithRetry(
		(requestSignal) => info.userFills({ aggregateByTime: true, user }, requestSignal),
		{ signal },
	);
	if (
		!Array.isArray(response) ||
		response.length > TRADE_HISTORY_SNAPSHOT_LIMIT ||
		response.some((fill) => !isValidUserFillHistoryItem(fill))
	) {
		throw new MalformedHistoryPageError();
	}

	return {
		fills: mergeUserFillSources(filterNonTwapUserFills(response as UserFillsResponse)),
		reachedLimit: response.length === TRADE_HISTORY_SNAPSHOT_LIMIT,
	};
}

export function useTradeHistory(
	address: string,
	{ enabled: requested = true }: TradeHistoryOptions = {},
): TradeHistoryResult {
	const { env, info } = useHyperliquid();
	const isOnline = useOnlineStatus();
	const enabled = requested && isAccountHistoryAddress(address);
	const normalizedAddress = address.toLowerCase();
	const query = useQuery({
		enabled,
		queryFn: async ({ signal }) => {
			if (!isAccountHistoryAddress(address)) throw new Error("Invalid account address.");
			return fetchTradeHistorySnapshot(info, address, signal);
		},
		queryKey: ["hl", "trade-history", "userFills", env, normalizedAddress],
		refetchOnReconnect: true,
		refetchOnWindowFocus: false,
		retry: false,
		staleTime: TRADE_HISTORY_STALE_TIME_MS,
	});

	let status: TradeHistoryStatus = "loading";
	if (!enabled) status = "disabled";
	else if (query.data !== undefined) status = "ready";
	else if (!isOnline || query.fetchStatus === "paused") status = "offline";
	else if (query.isError) status = "error";

	return {
		error: query.error,
		fills: query.data?.fills ?? [],
		hasFailed: query.isError,
		isFetching: query.isFetching,
		isOffline: !isOnline || query.fetchStatus === "paused",
		isRefreshing: query.isFetching && query.data !== undefined,
		reachedLimit: query.data?.reachedLimit ?? false,
		refresh: () => void query.refetch({ cancelRefetch: false }),
		status,
	};
}
