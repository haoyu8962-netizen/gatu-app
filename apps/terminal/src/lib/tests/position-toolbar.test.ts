import { describe, expect, it } from "vitest";
import {
	ALL_POSITION_MARKETS,
	CURRENT_POSITION_MARKET,
	filterPositions,
	getReadyItemCount,
} from "@/domain/trade/position-toolbar";

const positions = [
	{ id: "main-long", coin: "HYPE", dex: "", szi: "1.25" },
	{ id: "builder-short", coin: "xyz:MU", dex: "xyz", szi: "-0.015" },
	{ id: "same-coin-other-dex", coin: "xyz:MU", dex: "other", szi: "2" },
	{ id: "invalid-size", coin: "BTC", dex: "", szi: "invalid" },
] as const;

describe("position toolbar filtering", () => {
	it("keeps every position when both filters are all", () => {
		expect(filterPositions(positions, "all", ALL_POSITION_MARKETS, null)).toEqual(positions);
	});

	it("uses signed position size for long and short filters", () => {
		expect(filterPositions(positions, "long", ALL_POSITION_MARKETS, null).map((position) => position.id)).toEqual([
			"main-long",
			"same-coin-other-dex",
		]);
		expect(filterPositions(positions, "short", ALL_POSITION_MARKETS, null).map((position) => position.id)).toEqual([
			"builder-short",
		]);
	});

	it("matches the current market by both coin and dex", () => {
		expect(
			filterPositions(positions, "all", CURRENT_POSITION_MARKET, { coin: "xyz:MU", dex: "xyz" }).map(
				(position) => position.id,
			),
		).toEqual(["builder-short"]);
		expect(filterPositions(positions, "all", CURRENT_POSITION_MARKET, null)).toEqual([]);
	});

	it("keeps explicit builder markets isolated by dex", () => {
		expect(
			filterPositions(positions, "all", { type: "market", market: { coin: "xyz:MU", dex: "other" } }, null).map(
				(position) => position.id,
			),
		).toEqual(["same-coin-other-dex"]);
	});
});

describe("position toolbar counts", () => {
	it("hides counts until a connected subscription has a complete snapshot", () => {
		expect(getReadyItemCount({ isConnected: false, isReady: true, count: 0 })).toBeNull();
		expect(getReadyItemCount({ isConnected: true, isReady: false, count: 0 })).toBeNull();
		expect(getReadyItemCount({ isConnected: true, isReady: true, count: 0 })).toBe(0);
		expect(getReadyItemCount({ isConnected: true, isReady: true, count: 3 })).toBe(3);
	});
});
