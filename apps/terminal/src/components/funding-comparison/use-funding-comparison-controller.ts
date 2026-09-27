import { useMemo, useState, useSyncExternalStore } from "react";
import {
	FUNDING_COMPARISON_DEFAULT_PERIOD,
	FUNDING_COMPARISON_DEFAULT_ROWS_PER_PAGE,
	FUNDING_COMPARISON_DEFAULT_SORT_KEY,
	FUNDING_COMPARISON_MAX_SNAPSHOT_AGE_MS,
	FUNDING_COMPARISON_QUERY_OPTIONS,
	FUNDING_COMPARISON_ROWS_PER_PAGE_OPTIONS,
	type FundingComparisonRowsPerPage,
} from "@/config/funding-comparison";
import {
	buildFundingComparisonRows,
	deriveFundingComparisonPage,
	type FundingComparisonPeriod,
	type FundingComparisonSortDirection,
	type FundingComparisonSortKey,
	getFundingComparisonSnapshotRemainingMs,
	observeFundingComparisonSnapshot,
	parsePredictedFundings,
	toggleFundingComparisonSort,
} from "@/domain/market/funding-comparison";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useInfo, useMarketsInfo } from "@/lib/hyperliquid";
import type {
	MarketCatalogFetchStatus,
	MarketCatalogQueryStatus,
	MarketCatalogState,
} from "@/lib/hyperliquid/markets/market-catalog-state";

export type FundingComparisonPageState = "loading" | "error" | "empty" | "noResults" | "normal";
type PerpCatalogStatus = "ready" | "loading" | "error";

interface PerpCatalogInput {
	catalogState: MarketCatalogState;
	perpMarketCount: number;
	perpMetaFetchStatus: MarketCatalogFetchStatus;
	perpMetaStatus: MarketCatalogQueryStatus;
}

interface PageStateInput {
	hasUsableSnapshot: boolean;
	fundingsFailed: boolean;
	catalogStatus: PerpCatalogStatus;
	sourceRowCount: number;
	matchingRowCount: number;
}

function isRowsPerPageOption(value: number): value is FundingComparisonRowsPerPage {
	return FUNDING_COMPARISON_ROWS_PER_PAGE_OPTIONS.some((option) => option === value);
}

function resolveCatalogStatus(input: PerpCatalogInput): PerpCatalogStatus {
	if (input.catalogState.status === "error") return "error";
	if (input.catalogState.status !== "ready") return "loading";
	if (input.perpMarketCount > 0) return "ready";
	if (input.perpMetaStatus === "pending" || input.perpMetaFetchStatus !== "idle") return "loading";
	return "error";
}

function resolvePageState(input: PageStateInput): FundingComparisonPageState {
	if (input.catalogStatus === "error") return "error";
	if (!input.hasUsableSnapshot) return input.fundingsFailed ? "error" : "loading";
	if (input.catalogStatus === "loading") return "loading";
	if (input.sourceRowCount === 0) return input.fundingsFailed ? "error" : "empty";
	if (input.matchingRowCount === 0) return "noResults";
	return "normal";
}

function createSnapshotFreshnessClock(receivedAt: number) {
	const receipt = observeFundingComparisonSnapshot(
		receivedAt,
		Date.now(),
		performance.now(),
		FUNDING_COMPARISON_MAX_SNAPSHOT_AGE_MS,
	);
	let fresh = receipt !== null;
	return {
		getSnapshot: () => fresh,
		subscribe(onExpired: () => void) {
			if (receipt === null) return () => {};
			let timeout: ReturnType<typeof setTimeout> | undefined;
			function checkFreshness() {
				if (!fresh || receipt === null) return;
				if (timeout !== undefined) clearTimeout(timeout);
				timeout = undefined;
				const remainingMs = getFundingComparisonSnapshotRemainingMs(
					receipt,
					Date.now(),
					performance.now(),
					FUNDING_COMPARISON_MAX_SNAPSHOT_AGE_MS,
				);
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

function useSnapshotFreshness(receivedAt: number): boolean {
	const clock = useMemo(() => createSnapshotFreshnessClock(receivedAt), [receivedAt]);
	return useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
}

export function useFundingComparisonController() {
	const [period, setPeriodState] = useState<FundingComparisonPeriod>(FUNDING_COMPARISON_DEFAULT_PERIOD);
	const [sortKey, setSortKey] = useState<FundingComparisonSortKey>(FUNDING_COMPARISON_DEFAULT_SORT_KEY);
	const [sortDirection, setSortDirection] = useState<FundingComparisonSortDirection>("descending");
	const [query, setQueryState] = useState("");
	const [requestedPage, setRequestedPage] = useState(1);
	const [rowsPerPage, setRowsPerPageState] = useState<FundingComparisonRowsPerPage>(
		FUNDING_COMPARISON_DEFAULT_ROWS_PER_PAGE,
	);

	const fundingsQuery = useInfo("predictedFundings", undefined, FUNDING_COMPARISON_QUERY_OPTIONS);
	const { perpMarkets, catalogState, catalogQueries, retryMarketCatalog } = useMarketsInfo();
	const navigateToMarket = useMarketNavigation();
	const snapshotFresh = useSnapshotFreshness(fundingsQuery.dataUpdatedAt);

	const parsedSnapshot = parsePredictedFundings(fundingsQuery.data);
	const malformed = fundingsQuery.data !== undefined && parsedSnapshot === null;
	const fundingsFailed = fundingsQuery.isError || malformed;
	const snapshotUsable = parsedSnapshot !== null && fundingsQuery.fetchStatus !== "paused" && snapshotFresh;
	const snapshot = snapshotUsable ? parsedSnapshot : null;
	const catalogStatus = resolveCatalogStatus({
		catalogState,
		perpMarketCount: perpMarkets.length,
		perpMetaFetchStatus: catalogQueries.allPerpMetas.fetchStatus,
		perpMetaStatus: catalogQueries.allPerpMetas.status,
	});
	const sourceRows = snapshot && catalogStatus === "ready" ? buildFundingComparisonRows(snapshot, perpMarkets) : [];
	const result = deriveFundingComparisonPage({
		rows: sourceRows,
		period,
		sortKey,
		sortDirection,
		query,
		page: requestedPage,
		rowsPerPage,
	});
	const pageState = resolvePageState({
		hasUsableSnapshot: snapshot !== null,
		fundingsFailed,
		catalogStatus,
		sourceRowCount: sourceRows.length,
		matchingRowCount: result.totalRows,
	});

	function setPeriod(nextPeriod: FundingComparisonPeriod) {
		setPeriodState(nextPeriod);
		setRequestedPage(1);
	}

	function setQuery(nextQuery: string) {
		setQueryState(nextQuery);
		setRequestedPage(1);
	}

	function setSort(nextKey: FundingComparisonSortKey) {
		const nextSort = toggleFundingComparisonSort(sortKey, sortDirection, nextKey);
		setSortKey(nextSort.sortKey);
		setSortDirection(nextSort.sortDirection);
		setRequestedPage(1);
	}

	function setRowsPerPage(nextRowsPerPage: number) {
		if (!isRowsPerPageOption(nextRowsPerPage)) return;
		setRowsPerPageState(nextRowsPerPage);
		setRequestedPage(1);
	}

	function retry() {
		void fundingsQuery.refetch();
		if (catalogStatus === "error") void retryMarketCatalog();
	}

	return {
		pageState,
		period,
		sortKey,
		sortDirection,
		query,
		rowsPerPage,
		rows: result.rows,
		totalRows: result.totalRows,
		totalPages: result.totalPages,
		page: result.page,
		start: result.start,
		end: result.end,
		isRetrying: pageState === "error" && fundingsQuery.fetchStatus === "fetching",
		onPeriodChange: setPeriod,
		onQueryChange: setQuery,
		onClearQuery: () => setQuery(""),
		onSort: setSort,
		onRowsPerPageChange: setRowsPerPage,
		onPreviousPage: () => setRequestedPage(Math.max(1, result.page - 1)),
		onNextPage: () => setRequestedPage(Math.min(result.totalPages, result.page + 1)),
		onRetry: retry,
		onSelectMarket: (coin: string) => navigateToMarket(coin),
	};
}

export type FundingComparisonController = ReturnType<typeof useFundingComparisonController>;
