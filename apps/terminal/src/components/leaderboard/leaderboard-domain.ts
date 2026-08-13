import Big from "big.js";

export const LEADERBOARD_ACCOUNT_VALUE_THRESHOLD = "100000";
export const LEADERBOARD_ALL_TIME_VOLUME_THRESHOLD = "10000000";
export const LEADERBOARD_POLICY_VERSION = "gatu-vault-feed-only-2026-08-14";

export type LeaderboardPeriod = "day" | "week" | "month" | "allTime";
export type LeaderboardSortKey = "accountValue" | "pnl" | "roi" | "volume";
export type LeaderboardSortDirection = "ascending" | "descending";
export type LeaderboardValueTone = "positive" | "negative" | "neutral";

export interface LeaderboardPerformance {
	pnl: string;
	roi: string;
	volume: string;
}

export interface LeaderboardSourceRow {
	address: string;
	accountValue: string;
	displayName: string | null;
	prize: number;
	performance: Record<LeaderboardPeriod, LeaderboardPerformance>;
}

export interface LeaderboardRow {
	rank: number;
	address: string;
	displayName: string | null;
	accountValue: string;
	pnl: string;
	roi: string;
	volume: string;
	prize: number;
}

export interface LeaderboardResult {
	rows: readonly LeaderboardRow[];
	totalRows: number;
	totalPages: number;
	page: number;
	start: number;
	end: number;
}

export interface DeriveLeaderboardInput {
	rows: readonly LeaderboardSourceRow[];
	period: LeaderboardPeriod;
	sortKey: LeaderboardSortKey;
	sortDirection: LeaderboardSortDirection;
	query: string;
	page: number;
	rowsPerPage: number;
	excludedAddresses?: ReadonlySet<string>;
}

function asBig(value: string): Big | null {
	try {
		return new Big(value);
	} catch {
		return null;
	}
}

function isEligible(row: LeaderboardSourceRow): boolean {
	const accountValue = asBig(row.accountValue);
	const allTimeVolume = asBig(row.performance.allTime.volume);
	if (!accountValue || !allTimeVolume) return false;

	return !(
		accountValue.lt(LEADERBOARD_ACCOUNT_VALUE_THRESHOLD) && allTimeVolume.lt(LEADERBOARD_ALL_TIME_VOLUME_THRESHOLD)
	);
}

function getSortValue(row: LeaderboardRow, sortKey: LeaderboardSortKey): Big {
	const value = sortKey === "accountValue" ? row.accountValue : row[sortKey];
	return new Big(value);
}

function compareRows(
	left: LeaderboardRow,
	right: LeaderboardRow,
	sortKey: LeaderboardSortKey,
	direction: LeaderboardSortDirection,
): number {
	const compared = getSortValue(left, sortKey).cmp(getSortValue(right, sortKey));
	if (compared !== 0) return direction === "descending" ? -compared : compared;
	return left.address.localeCompare(right.address);
}

export function normalizeLeaderboardQuery(value: string): string {
	return value.trim().toLocaleLowerCase();
}

export function getLeaderboardValueTone(value: string): LeaderboardValueTone {
	const parsed = asBig(value);
	if (!parsed || parsed.eq(0)) return "neutral";
	return parsed.gt(0) ? "positive" : "negative";
}

export function getLeaderboardExcludedAddresses(addresses: readonly string[]): ReadonlySet<string> {
	return new Set(addresses.map((address) => address.toLocaleLowerCase()));
}

export function deriveLeaderboard(input: DeriveLeaderboardInput): LeaderboardResult {
	const excludedAddresses = input.excludedAddresses ?? new Set<string>();
	const query = normalizeLeaderboardQuery(input.query);
	const rankedRows = input.rows
		.filter(isEligible)
		.filter((row) => !excludedAddresses.has(row.address.toLocaleLowerCase()))
		.map((row): LeaderboardRow => {
			const performance = row.performance[input.period];
			return {
				rank: 0,
				address: row.address,
				displayName: row.displayName,
				accountValue: row.accountValue,
				pnl: performance.pnl,
				roi: performance.roi,
				volume: performance.volume,
				prize: row.prize,
			};
		})
		.sort((left, right) => compareRows(left, right, input.sortKey, input.sortDirection))
		.map((row, index) => ({ ...row, rank: index + 1 }))
		.filter((row) => {
			if (!query) return true;
			return (
				row.address.toLocaleLowerCase().includes(query) || row.displayName?.toLocaleLowerCase().includes(query) === true
			);
		});

	const totalRows = rankedRows.length;
	const totalPages = Math.max(1, Math.ceil(totalRows / input.rowsPerPage));
	const page = Math.min(Math.max(1, input.page), totalPages);
	const startIndex = (page - 1) * input.rowsPerPage;
	const pageRows = rankedRows.slice(startIndex, startIndex + input.rowsPerPage);

	return {
		rows: pageRows,
		totalRows,
		totalPages,
		page,
		start: totalRows === 0 ? 0 : startIndex + 1,
		end: Math.min(startIndex + input.rowsPerPage, totalRows),
	};
}

export function toggleLeaderboardSort(
	currentKey: LeaderboardSortKey,
	currentDirection: LeaderboardSortDirection,
	nextKey: LeaderboardSortKey,
): { sortKey: LeaderboardSortKey; sortDirection: LeaderboardSortDirection } {
	if (currentKey !== nextKey) return { sortKey: nextKey, sortDirection: "descending" };
	return {
		sortKey: nextKey,
		sortDirection: currentDirection === "descending" ? "ascending" : "descending",
	};
}
