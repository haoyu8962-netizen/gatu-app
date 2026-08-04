import { describe, expect, it } from "vitest";
import {
	ALL_POSITION_MARKETS,
	CURRENT_POSITION_MARKET,
	filterPositions,
	getPositionFundingPayment,
	getReadyItemCount,
	getTotalPositionUnrealizedPnl,
	isLiquidationPriceNear,
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

describe("position financial display helpers", () => {
	it("negates cumulative funding without converting through a JavaScript number", () => {
		expect(getPositionFundingPayment("0.123456789123456789")).toBe("-0.123456789123456789");
		expect(getPositionFundingPayment("-2.5")).toBe("2.5");
		expect(getPositionFundingPayment("invalid")).toBeNull();
	});

	it("evaluates liquidation proximity with exact decimal arithmetic", () => {
		expect(isLiquidationPriceNear({ markPx: "100", liquidationPx: "90", proximity: "0.1" })).toBe(true);
		expect(isLiquidationPriceNear({ markPx: "100", liquidationPx: "89.999999999999", proximity: "0.1" })).toBe(false);
		expect(isLiquidationPriceNear({ markPx: "0", liquidationPx: "90", proximity: "0.1" })).toBe(false);
		expect(isLiquidationPriceNear({ markPx: "100", liquidationPx: null, proximity: "0.1" })).toBe(false);
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

describe("position summary", () => {
	it("sums unrealized PNL across every position without floating-point loss", () => {
		expect(
			getTotalPositionUnrealizedPnl([
				{ unrealizedPnl: "9007199254740992.1" },
				{ unrealizedPnl: "-9007199254740992" },
				{ unrealizedPnl: "-0.004" },
			]),
		).toBe("0.096");
	});

	it("returns zero for no positions and fails closed on invalid protocol data", () => {
		expect(getTotalPositionUnrealizedPnl([])).toBe("0");
		expect(getTotalPositionUnrealizedPnl([{ unrealizedPnl: "invalid" }])).toBeNull();
	});
});
