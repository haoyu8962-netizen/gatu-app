import { useEffect, useRef, useState } from "react";
import { getExplorerAddressUrl, useHyperliquid } from "@/lib/hyperliquid";
import {
	LEADERBOARD_API_MAX_QUERY_LENGTH,
	LEADERBOARD_API_PAGE_SIZES,
	type LeaderboardApiPageSize,
} from "@/lib/leaderboard/leaderboard-api";
import {
	getLeaderboardValueTone,
	type LeaderboardPeriod,
	type LeaderboardSortDirection,
	type LeaderboardSortKey,
	normalizeLeaderboardQuery,
	toggleLeaderboardSort,
} from "./leaderboard-domain";
import { useLeaderboardData } from "./use-leaderboard-data";

const LEADERBOARD_SEARCH_DEBOUNCE_MS = 250;

export type LeaderboardPageState = "normal" | "empty" | "noResults" | "loading" | "paused" | "error";
export type LeaderboardDataNotice = "stale" | "refreshError" | "paused" | null;

function isLeaderboardPageSize(value: number): value is LeaderboardApiPageSize {
	return LEADERBOARD_API_PAGE_SIZES.some((pageSize) => pageSize === value);
}

export function useLeaderboardController() {
	const { isTestnet } = useHyperliquid();
	const [period, setPeriodState] = useState<LeaderboardPeriod>("month");
	const [sortKey, setSortKey] = useState<LeaderboardSortKey>("pnl");
	const [sortDirection, setSortDirection] = useState<LeaderboardSortDirection>("descending");
	const [query, setQueryState] = useState("");
	const [requestedQuery, setRequestedQuery] = useState("");
	const [page, setPage] = useState(1);
	const [rowsPerPage, setRowsPerPageState] = useState<LeaderboardApiPageSize>(10);
	const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (searchTimeoutRef.current !== null) globalThis.clearTimeout(searchTimeoutRef.current);
		},
		[],
	);

	const leaderboardQuery = useLeaderboardData({
		env: isTestnet ? "Testnet" : "Mainnet",
		period,
		sortKey,
		sortDirection,
		query: normalizeLeaderboardQuery(requestedQuery),
		page,
		pageSize: rowsPerPage,
	});
	const result = leaderboardQuery.data;
	const isPaused = leaderboardQuery.fetchStatus === "paused";
	const isInitialFetching = result === undefined && leaderboardQuery.fetchStatus === "fetching";
	const pageState: LeaderboardPageState = isInitialFetching
		? "loading"
		: result === undefined && isPaused
			? "paused"
			: result === undefined
				? "error"
				: result.totalRows === 0
					? result.query
						? "noResults"
						: "empty"
					: "normal";
	const dataNotice: LeaderboardDataNotice =
		result === undefined
			? null
			: isPaused
				? "paused"
				: leaderboardQuery.isError
					? "refreshError"
					: result.stale
						? "stale"
						: null;

	function setPeriod(nextPeriod: LeaderboardPeriod) {
		setPeriodState(nextPeriod);
		setPage(1);
	}

	function setQuery(nextQuery: string) {
		if (Array.from(nextQuery).length > LEADERBOARD_API_MAX_QUERY_LENGTH) return;
		setQueryState(nextQuery);
		if (searchTimeoutRef.current !== null) globalThis.clearTimeout(searchTimeoutRef.current);
		searchTimeoutRef.current = globalThis.setTimeout(() => {
			searchTimeoutRef.current = null;
			setRequestedQuery(nextQuery);
			setPage(1);
		}, LEADERBOARD_SEARCH_DEBOUNCE_MS);
	}

	function setSort(nextKey: LeaderboardSortKey) {
		const nextSort = toggleLeaderboardSort(sortKey, sortDirection, nextKey);
		setSortKey(nextSort.sortKey);
		setSortDirection(nextSort.sortDirection);
		setPage(1);
	}

	function setRowsPerPage(nextRowsPerPage: number) {
		if (!isLeaderboardPageSize(nextRowsPerPage)) return;
		setRowsPerPageState(nextRowsPerPage);
		setPage(1);
	}

	function retry() {
		void leaderboardQuery.refetch();
	}

	return {
		pageState,
		dataNotice,
		period,
		sortKey,
		sortDirection,
		query,
		rowsPerPage,
		rows: (result?.rows ?? []).map((row) => ({
			...row,
			pnlTone: getLeaderboardValueTone(row.pnl),
			roiTone: getLeaderboardValueTone(row.roi),
			href: getExplorerAddressUrl(row.address, isTestnet),
		})),
		totalRows: result?.totalRows ?? 0,
		totalPages: result?.totalPages ?? 1,
		page: result?.page ?? page,
		start: result?.start ?? 0,
		end: result?.end ?? 0,
		isRefreshing: result !== undefined && leaderboardQuery.fetchStatus === "fetching",
		canRetry: !isPaused,
		onPeriodChange: setPeriod,
		onQueryChange: setQuery,
		onClearQuery: () => setQuery(""),
		onSort: setSort,
		onRowsPerPageChange: setRowsPerPage,
		onPreviousPage: () => setPage(Math.max(1, (result?.page ?? page) - 1)),
		onNextPage: () => setPage(Math.min(result?.totalPages ?? 1, (result?.page ?? page) + 1)),
		onRetry: retry,
	};
}

export type LeaderboardController = ReturnType<typeof useLeaderboardController>;
