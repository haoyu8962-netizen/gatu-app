import { describe, expect, it } from "vitest";
import {
	deriveLeaderboard,
	getLeaderboardExcludedAddresses,
	type LeaderboardSourceRow,
	toggleLeaderboardSort,
} from "@/components/leaderboard/leaderboard-domain";

function row(
	addressSuffix: string,
	accountValue: string,
	allTimeVolume: string,
	overrides: Partial<LeaderboardSourceRow> = {},
): LeaderboardSourceRow {
	const address = `0x${addressSuffix.padStart(40, "0")}`;
	return {
		address,
		accountValue,
		displayName: null,
		prize: 0,
		performance: {
			day: { pnl: "1", roi: "0.01", volume: "10" },
			week: { pnl: "2", roi: "0.02", volume: "20" },
			month: { pnl: "3", roi: "0.03", volume: "30" },
			allTime: { pnl: "4", roi: "0.04", volume: allTimeVolume },
		},
		...overrides,
	};
}

function derive(rows: readonly LeaderboardSourceRow[], overrides = {}) {
	return deriveLeaderboard({
		rows,
		period: "month",
		sortKey: "pnl",
		sortDirection: "descending",
		query: "",
		page: 1,
		rowsPerPage: 10,
		...overrides,
	});
}

describe("leaderboard domain", () => {
	it("excludes an account only when both official thresholds are missed", () => {
		const result = derive([row("1", "99999", "9999999"), row("2", "100000", "1"), row("3", "1", "10000000")]);

		expect(result.rows.map((entry) => entry.address.slice(-1))).toEqual(["2", "3"]);
	});

	it("uses the exact selected performance window without deriving ROI", () => {
		const result = derive([row("1", "200000", "20000000")], { period: "week" });

		expect(result.rows[0]).toMatchObject({ pnl: "2", roi: "0.02", volume: "20" });
	});

	it("excludes network vault addresses case-insensitively", () => {
		const source = row("a", "200000", "20000000");
		const excludedAddresses = getLeaderboardExcludedAddresses([source.address.toUpperCase()]);

		expect(derive([source], { excludedAddresses }).totalRows).toBe(0);
	});

	it("searches address and display name case-insensitively", () => {
		const atlas = row("a", "200000", "20000000", { displayName: "Atlas One" });
		const beta = row("b", "200000", "20000000", { displayName: "Beta" });

		expect(derive([atlas, beta], { query: " atlas " }).rows.map((entry) => entry.address)).toEqual([atlas.address]);
		expect(derive([atlas, beta], { query: beta.address.slice(-8).toUpperCase() }).rows[0]?.address).toBe(beta.address);
	});

	it("sorts all numeric columns with Big.js-safe decimal comparisons", () => {
		const low = row("1", "200000", "20000000", {
			performance: {
				day: { pnl: "1", roi: "0.1", volume: "1" },
				week: { pnl: "1", roi: "0.1", volume: "1" },
				month: { pnl: "9007199254740993", roi: "0.1", volume: "1" },
				allTime: { pnl: "1", roi: "0.1", volume: "20000000" },
			},
		});
		const high = row("2", "300000", "20000000", {
			performance: {
				day: { pnl: "1", roi: "0.2", volume: "2" },
				week: { pnl: "1", roi: "0.2", volume: "2" },
				month: { pnl: "9007199254740994", roi: "0.2", volume: "2" },
				allTime: { pnl: "1", roi: "0.2", volume: "20000000" },
			},
		});

		expect(derive([low, high]).rows.map((entry) => entry.address)).toEqual([high.address, low.address]);
		expect(
			derive([low, high], { sortKey: "accountValue", sortDirection: "ascending" }).rows.map((entry) => entry.address),
		).toEqual([low.address, high.address]);
	});

	it("assigns ranks after the selected sort and preserves them when searching", () => {
		const low = row("1", "200000", "20000000", { displayName: "Low" });
		const high = row("2", "200000", "20000000", {
			displayName: "High",
			performance: {
				day: { pnl: "1", roi: "0.01", volume: "10" },
				week: { pnl: "2", roi: "0.02", volume: "20" },
				month: { pnl: "4", roi: "0.04", volume: "40" },
				allTime: { pnl: "4", roi: "0.04", volume: "20000000" },
			},
		});

		expect(derive([low, high]).rows.map((entry) => [entry.displayName, entry.rank])).toEqual([
			["High", 1],
			["Low", 2],
		]);
		expect(derive([low, high], { query: "low" }).rows[0]?.rank).toBe(2);
	});

	it("paginates and clamps stale pages after filtering", () => {
		const rows = Array.from({ length: 12 }, (_, index) => row(String(index + 1), "200000", "20000000"));
		const result = derive(rows, { page: 99, rowsPerPage: 5 });

		expect(result).toMatchObject({ page: 3, totalPages: 3, totalRows: 12, start: 11, end: 12 });
		expect(result.rows).toHaveLength(2);
	});

	it("skips malformed decimals defensively", () => {
		expect(derive([row("1", "not-a-number", "20000000")]).totalRows).toBe(0);
	});

	it("starts a new sort descending and toggles an active sort", () => {
		expect(toggleLeaderboardSort("pnl", "ascending", "roi")).toEqual({
			sortKey: "roi",
			sortDirection: "descending",
		});
		expect(toggleLeaderboardSort("pnl", "descending", "pnl")).toEqual({
			sortKey: "pnl",
			sortDirection: "ascending",
		});
	});
});
