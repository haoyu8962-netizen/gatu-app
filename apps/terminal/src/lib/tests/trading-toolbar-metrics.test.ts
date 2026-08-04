import { describe, expect, it } from "vitest";
import {
	getToolbarAbsoluteSize,
	getToolbarAccountMarginRatio,
	getToolbarFundingTotal,
	getToolbarNonZeroPnl,
	getToolbarOrderMetrics,
	getToolbarPositionChangeRatio,
	getToolbarTwapMetrics,
} from "@/domain/trade/trading-toolbar-metrics";

describe("trading toolbar position metrics", () => {
	it("derives price change from unrealized PNL and absolute entry notional", () => {
		expect(
			getToolbarPositionChangeRatio({
				unrealizedPnl: "250",
				szi: "2.5",
				entryPx: "1000",
			}),
		).toBe("0.1");
		expect(
			getToolbarPositionChangeRatio({
				unrealizedPnl: "-12.5",
				szi: "-0.125",
				entryPx: "1000",
			}),
		).toBe("-0.1");
	});

	it("keeps decimal precision without converting financial values to numbers", () => {
		expect(
			getToolbarPositionChangeRatio({
				unrealizedPnl: "0.000000000000000003",
				szi: "-0.000000000000000001",
				entryPx: "3",
			}),
		).toBe("1");
	});

	it("rejects invalid or zero entry notionals", () => {
		expect(getToolbarPositionChangeRatio({ unrealizedPnl: "1", szi: "0", entryPx: "100" })).toBeNull();
		expect(getToolbarPositionChangeRatio({ unrealizedPnl: "1", szi: "1", entryPx: "0" })).toBeNull();
		expect(getToolbarPositionChangeRatio({ unrealizedPnl: "invalid", szi: "1", entryPx: "100" })).toBeNull();
	});
});

describe("trading toolbar history metrics", () => {
	it("keeps history totals and absolute sizes exact", () => {
		expect(getToolbarFundingTotal([{ usdc: "9007199254740992.1" }, { usdc: "-9007199254740992" }])).toBe("0.1");
		expect(getToolbarAbsoluteSize("-0.000000000000000001")).toBe("0.000000000000000001");
	});

	it("fails closed on invalid protocol values and hides zero PNL", () => {
		expect(getToolbarFundingTotal([{ usdc: "invalid" }])).toBeNull();
		expect(getToolbarAbsoluteSize("invalid")).toBeNull();
		expect(getToolbarNonZeroPnl("0.000")).toBeNull();
		expect(getToolbarNonZeroPnl("-1.25")).toBe("-1.25");
	});
});

describe("trading toolbar account metrics", () => {
	it("derives the account maintenance margin ratio", () => {
		expect(
			getToolbarAccountMarginRatio({
				crossMaintenanceMarginUsed: "25",
				accountEquity: "1000",
			}),
		).toBe("0.025");
	});

	it("rejects negative maintenance margin and non-positive equity", () => {
		expect(
			getToolbarAccountMarginRatio({
				crossMaintenanceMarginUsed: "-1",
				accountEquity: "1000",
			}),
		).toBeNull();
		expect(
			getToolbarAccountMarginRatio({
				crossMaintenanceMarginUsed: "1",
				accountEquity: "0",
			}),
		).toBeNull();
	});
});

describe("trading toolbar order metrics", () => {
	it("uses limit price and remaining size for ordinary orders", () => {
		expect(
			getToolbarOrderMetrics({
				isTrigger: false,
				limitPx: "101.25",
				triggerPx: "0",
				sz: "2.4",
				markPx: "100",
			}),
		).toEqual({
			referencePx: "101.25",
			remainingValue: "243",
			markDistanceRatio: "0.0125",
		});
	});

	it("uses trigger price instead of the execution protection price for trigger orders", () => {
		expect(
			getToolbarOrderMetrics({
				isTrigger: true,
				limitPx: "81.25",
				triggerPx: "90",
				sz: "2.4",
				markPx: "100",
			}),
		).toEqual({
			referencePx: "90",
			remainingValue: "216",
			markDistanceRatio: "0.1",
		});
	});

	it("preserves a valid distance when size is invalid and a valid value when mark price is invalid", () => {
		expect(
			getToolbarOrderMetrics({
				isTrigger: false,
				limitPx: "100",
				triggerPx: "0",
				sz: "invalid",
				markPx: "80",
			}),
		).toEqual({ referencePx: "100", remainingValue: null, markDistanceRatio: "0.25" });
		expect(
			getToolbarOrderMetrics({
				isTrigger: false,
				limitPx: "100",
				triggerPx: "0",
				sz: "2",
				markPx: "invalid",
			}),
		).toEqual({ referencePx: "100", remainingValue: "200", markDistanceRatio: null });
	});

	it("returns null metrics for an invalid selected reference price", () => {
		expect(
			getToolbarOrderMetrics({
				isTrigger: true,
				limitPx: "100",
				triggerPx: "0",
				sz: "2",
				markPx: "100",
			}),
		).toEqual({ referencePx: null, remainingValue: null, markDistanceRatio: null });
	});
});

describe("trading toolbar TWAP metrics", () => {
	it("derives progress, executed average price, and remaining time", () => {
		expect(
			getToolbarTwapMetrics({
				sz: "4",
				executedSz: "1.25",
				executedNtl: "125",
				timestampMs: "1700000000000",
				minutes: "30",
				nowMs: "1700000600000",
			}),
		).toEqual({
			progressRatio: "0.3125",
			executedAvgPx: "100",
			remainingMs: "1200000",
		});
	});

	it("clamps completed progress and elapsed time at their view boundaries", () => {
		expect(
			getToolbarTwapMetrics({
				sz: "1",
				executedSz: "1.000000000000000001",
				executedNtl: "100.0000000000000001",
				timestampMs: "1700000000000",
				minutes: "1",
				nowMs: "1700001000000",
			}),
		).toEqual({
			progressRatio: "1",
			executedAvgPx: "100",
			remainingMs: "0",
		});
	});

	it("keeps zero progress while withholding an undefined execution average", () => {
		expect(
			getToolbarTwapMetrics({
				sz: "2",
				executedSz: "0",
				executedNtl: "0",
				timestampMs: "1700000000000",
				minutes: "30",
				nowMs: "1700000000000",
			}),
		).toEqual({
			progressRatio: "0",
			executedAvgPx: null,
			remainingMs: "1800000",
		});
	});

	it("fails each derived metric closed when its required inputs are invalid", () => {
		expect(
			getToolbarTwapMetrics({
				sz: "0",
				executedSz: "invalid",
				executedNtl: "invalid",
				timestampMs: "-1",
				minutes: "0",
				nowMs: "invalid",
			}),
		).toEqual({ progressRatio: null, executedAvgPx: null, remainingMs: null });
	});
});
