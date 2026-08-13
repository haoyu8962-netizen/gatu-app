import { useMemo, useState } from "react";
import { getExplorerAddressUrl, useHyperliquid, usePublicLeaderboard, usePublicVaults } from "@/lib/hyperliquid";
import {
	deriveLeaderboard,
	getLeaderboardExcludedAddresses,
	getLeaderboardValueTone,
	type LeaderboardPeriod,
	type LeaderboardSortDirection,
	type LeaderboardSortKey,
	toggleLeaderboardSort,
} from "./leaderboard-domain";

export type LeaderboardPageState = "normal" | "empty" | "noResults" | "loading" | "error";

export function useLeaderboardController() {
	const { isTestnet } = useHyperliquid();
	const leaderboardQuery = usePublicLeaderboard();
	const vaultsQuery = usePublicVaults();
	const [period, setPeriodState] = useState<LeaderboardPeriod>("month");
	const [sortKey, setSortKey] = useState<LeaderboardSortKey>("pnl");
	const [sortDirection, setSortDirection] = useState<LeaderboardSortDirection>("descending");
	const [query, setQueryState] = useState("");
	const [page, setPage] = useState(1);
	const [rowsPerPage, setRowsPerPageState] = useState(10);

	const excludedAddresses = useMemo(
		() => getLeaderboardExcludedAddresses(vaultsQuery.data?.map((vault) => vault.vaultAddress) ?? []),
		[vaultsQuery.data],
	);

	const result = useMemo(
		() =>
			deriveLeaderboard({
				rows: leaderboardQuery.data ?? [],
				period,
				sortKey,
				sortDirection,
				query,
				page,
				rowsPerPage,
				excludedAddresses,
			}),
		[leaderboardQuery.data, period, sortKey, sortDirection, query, page, rowsPerPage, excludedAddresses],
	);

	const isLoading = leaderboardQuery.isLoading || vaultsQuery.isLoading;
	const isError = leaderboardQuery.isError || vaultsQuery.isError;
	const pageState: LeaderboardPageState = isLoading
		? "loading"
		: isError
			? "error"
			: result.totalRows === 0
				? query.trim()
					? "noResults"
					: "empty"
				: "normal";

	function setPeriod(nextPeriod: LeaderboardPeriod) {
		setPeriodState(nextPeriod);
		setPage(1);
	}

	function setQuery(nextQuery: string) {
		setQueryState(nextQuery);
		setPage(1);
	}

	function setSort(nextKey: LeaderboardSortKey) {
		const nextSort = toggleLeaderboardSort(sortKey, sortDirection, nextKey);
		setSortKey(nextSort.sortKey);
		setSortDirection(nextSort.sortDirection);
		setPage(1);
	}

	function setRowsPerPage(nextRowsPerPage: number) {
		setRowsPerPageState(nextRowsPerPage);
		setPage(1);
	}

	function retry() {
		void Promise.all([leaderboardQuery.refetch(), vaultsQuery.refetch()]);
	}

	return {
		pageState,
		period,
		sortKey,
		sortDirection,
		query,
		rowsPerPage,
		rows: result.rows.map((row) => ({
			...row,
			pnlTone: getLeaderboardValueTone(row.pnl),
			roiTone: getLeaderboardValueTone(row.roi),
			href: getExplorerAddressUrl(row.address, isTestnet),
		})),
		totalRows: result.totalRows,
		totalPages: result.totalPages,
		page: result.page,
		start: result.start,
		end: result.end,
		isRefreshing: leaderboardQuery.isFetching || vaultsQuery.isFetching,
		onPeriodChange: setPeriod,
		onQueryChange: setQuery,
		onClearQuery: () => setQuery(""),
		onSort: setSort,
		onRowsPerPageChange: setRowsPerPage,
		onPreviousPage: () => setPage(Math.max(1, result.page - 1)),
		onNextPage: () => setPage(Math.min(result.totalPages, result.page + 1)),
		onRetry: retry,
	};
}

export type LeaderboardController = ReturnType<typeof useLeaderboardController>;
