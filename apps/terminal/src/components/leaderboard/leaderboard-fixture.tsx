import { useState } from "react";
import { deriveLeaderboard, getLeaderboardValueTone, type LeaderboardSourceRow } from "./leaderboard-domain";
import { LeaderboardView, type LeaderboardViewProps } from "./leaderboard-view";

const FIXTURE_STATES = ["normal", "empty", "no-results", "loading", "error"] as const;
export type LeaderboardFixtureState = (typeof FIXTURE_STATES)[number];

const FIXTURE_ROWS: readonly LeaderboardSourceRow[] = Array.from({ length: 14 }, (_, index) => {
	const sequence = index + 1;
	const positive = index % 4 !== 3;
	const sign = positive ? "" : "-";
	return {
		address: `0x${sequence.toString(16).padStart(40, "0")}`,
		accountValue: `${2450000 - index * 87500}`,
		displayName: null,
		prize: 0,
		performance: {
			day: {
				pnl: `${sign}${(12500 - index * 475).toFixed(2)}`,
				roi: `${sign}${(0.0125 - index * 0.0004).toFixed(4)}`,
				volume: `${1250000 + index * 137500}`,
			},
			week: {
				pnl: `${sign}${(68250 - index * 2175).toFixed(2)}`,
				roi: `${sign}${(0.0682 - index * 0.0021).toFixed(4)}`,
				volume: `${6750000 + index * 487500}`,
			},
			month: {
				pnl: `${sign}${(185000 - index * 7375).toFixed(2)}`,
				roi: `${sign}${(0.185 - index * 0.0065).toFixed(4)}`,
				volume: `${18000000 + index * 1475000}`,
			},
			allTime: {
				pnl: `${sign}${(420000 - index * 19375).toFixed(2)}`,
				roi: `${sign}${(0.42 - index * 0.0175).toFixed(4)}`,
				volume: `${68000000 + index * 4250000}`,
			},
		},
	};
});

export function getLeaderboardFixtureFromLocation(): LeaderboardFixtureState | null {
	return resolveLeaderboardFixture(typeof window === "undefined" ? "" : window.location.search, import.meta.env.DEV);
}

export function resolveLeaderboardFixture(search: string, isDevelopment: boolean): LeaderboardFixtureState | null {
	if (!isDevelopment) return null;
	const fixture = new URLSearchParams(search).get("fixture");
	return FIXTURE_STATES.find((state) => state === fixture) ?? null;
}

export function LeaderboardFixture({ fixture }: { fixture: LeaderboardFixtureState }) {
	const [period, setPeriod] = useState<LeaderboardViewProps["period"]>("month");
	const [sortKey, setSortKey] = useState<LeaderboardViewProps["sortKey"]>("pnl");
	const [sortDirection, setSortDirection] = useState<LeaderboardViewProps["sortDirection"]>("descending");
	const [query, setQuery] = useState(fixture === "no-results" ? "0xmissing" : "");
	const [page, setPage] = useState(1);
	const [rowsPerPage, setRowsPerPage] = useState(10);
	const sourceRows = fixture === "empty" ? [] : FIXTURE_ROWS;
	const result = deriveLeaderboard({
		rows: sourceRows,
		period,
		sortKey,
		sortDirection,
		query,
		page,
		rowsPerPage,
	});
	const pageState =
		fixture === "loading" || fixture === "error"
			? fixture
			: result.totalRows === 0
				? query
					? "noResults"
					: "empty"
				: "normal";

	return (
		<LeaderboardView
			pageState={pageState}
			period={period}
			sortKey={sortKey}
			sortDirection={sortDirection}
			query={query}
			rowsPerPage={rowsPerPage}
			rows={result.rows.map((row) => ({
				...row,
				pnlTone: getLeaderboardValueTone(row.pnl),
				roiTone: getLeaderboardValueTone(row.roi),
				href: `https://app.hyperliquid.xyz/explorer/address/${row.address}`,
			}))}
			totalRows={result.totalRows}
			totalPages={result.totalPages}
			page={result.page}
			start={result.start}
			end={result.end}
			isRefreshing={false}
			onPeriodChange={(nextPeriod) => {
				setPeriod(nextPeriod);
				setPage(1);
			}}
			onQueryChange={(nextQuery) => {
				setQuery(nextQuery);
				setPage(1);
			}}
			onClearQuery={() => {
				setQuery("");
				setPage(1);
			}}
			onSort={(nextSortKey) => {
				if (nextSortKey === sortKey) {
					setSortDirection((current) => (current === "descending" ? "ascending" : "descending"));
				} else {
					setSortKey(nextSortKey);
					setSortDirection("descending");
				}
				setPage(1);
			}}
			onRowsPerPageChange={(value) => {
				setRowsPerPage(value);
				setPage(1);
			}}
			onPreviousPage={() => setPage((current) => Math.max(1, current - 1))}
			onNextPage={() => setPage((current) => Math.min(result.totalPages, current + 1))}
			onRetry={() => undefined}
		/>
	);
}
