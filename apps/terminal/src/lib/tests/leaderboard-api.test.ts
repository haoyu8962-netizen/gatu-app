import { describe, expect, it } from "vitest";
import {
	getLeaderboardApiUrl,
	type LeaderboardApiQuery,
	parseLeaderboardApiQuery,
} from "../leaderboard/leaderboard-api";

describe("leaderboard API query contract", () => {
	it("uses canonical defaults while requiring an exact environment", () => {
		expect(parseLeaderboardApiQuery(new URLSearchParams("env=Mainnet"))).toEqual({
			env: "Mainnet",
			period: "month",
			sortKey: "pnl",
			sortDirection: "descending",
			query: "",
			page: 1,
			pageSize: 10,
		});
		expect(parseLeaderboardApiQuery(new URLSearchParams())).toBeNull();
		expect(parseLeaderboardApiQuery(new URLSearchParams("env=mainnet"))).toBeNull();
	});

	it("round trips every supported parameter", () => {
		const query: LeaderboardApiQuery = {
			env: "Testnet",
			period: "allTime",
			sortKey: "accountValue",
			sortDirection: "ascending",
			query: "Atlas 交易员",
			page: 42,
			pageSize: 25,
		};
		const url = new URL(getLeaderboardApiUrl(query), "https://gatu.test");

		expect(parseLeaderboardApiQuery(url.searchParams)).toEqual(query);
	});

	it.each([
		"env=Mainnet&env=Testnet",
		"env=Mainnet&unknown=true",
		"env=Mainnet&period=year",
		"env=Mainnet&sortKey=rank",
		"env=Mainnet&sortDirection=sideways",
		"env=Mainnet&page=0",
		"env=Mainnet&page=01",
		"env=Mainnet&page=1000001",
		"env=Mainnet&pageSize=100",
		`env=Mainnet&query=${"a".repeat(129)}`,
		"env=Mainnet&query=%00",
	])("fails closed for invalid input: %s", (search) => {
		expect(parseLeaderboardApiQuery(new URLSearchParams(search))).toBeNull();
	});
});
