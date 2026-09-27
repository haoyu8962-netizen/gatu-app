import { describe, expect, it } from "vitest";
import { shouldSubscribeToMarketStats } from "@/lib/hyperliquid/market-stats-subscription";

describe("market stats subscription policy", () => {
	it.each([
		{ pathname: "/referrals", expected: false },
		{ pathname: "/referrals/", expected: false },
		{ pathname: "/join", expected: false },
		{ pathname: "/join/gatuappweb3", expected: false },
		{ pathname: "/leaderboard", expected: false },
		{ pathname: "/leaderboard/", expected: false },
		{ pathname: "/joiner", expected: true },
		{ pathname: "/leaderboards", expected: true },
		{ pathname: "/referrals-archive", expected: true },
		{ pathname: "/trade/BTC", expected: true },
		{ pathname: "/portfolio", expected: true },
		{ pathname: "/fundingComparison", expected: true },
	])("returns $expected for $pathname", ({ pathname, expected }) => {
		expect(shouldSubscribeToMarketStats(pathname)).toBe(expected);
	});
});
