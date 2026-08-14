import type { OrderParameters } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import {
	assertEntryOrderExecutionAllowed,
	assertEntryTwapExecutionAllowed,
	type EntryOrderExecutionState,
} from "@/domain/trade/order/entry-execution-guard";

function executionState(overrides: Partial<EntryOrderExecutionState> = {}): EntryOrderExecutionState {
	return {
		active: true,
		assetId: 0,
		szDecimals: 3,
		availabilityStatus: "success",
		availabilityReceivedAt: 1_000,
		availabilityMaxAgeMs: 20_000,
		availability: { kind: "perp", maxBaseBySide: { buy: "10", sell: "10" } },
		markPriceStatus: "success",
		markPx: "100",
		markPriceReceivedAt: 1_000,
		executionReferencePx: "100",
		executionPriceReceivedAt: 1_000,
		slippageBps: 250,
		...overrides,
	};
}

function marketOrder(isBuy: boolean, price: string): OrderParameters {
	return {
		orders: [{ a: 0, b: isBuy, p: price, s: "1", r: false, t: { limit: { tif: "FrontendMarket" } } }],
		grouping: "na",
	};
}

function triggerOrder(isBuy: boolean, tpsl: "tp" | "sl", triggerPx: string): OrderParameters {
	return {
		orders: [
			{
				a: 0,
				b: isBuy,
				p: triggerPx,
				s: "1",
				r: false,
				t: { trigger: { isMarket: true, triggerPx, tpsl } },
			},
		],
		grouping: "na",
	};
}

function limitWithAttachedTpSl(tpPx = "110", slPx = "90"): OrderParameters {
	return {
		orders: [
			{ a: 0, b: true, p: "100", s: "1", r: false, t: { limit: { tif: "Gtc" } } },
			{ a: 0, b: false, p: "99", s: "1", r: true, t: { trigger: { isMarket: true, triggerPx: tpPx, tpsl: "tp" } } },
			{ a: 0, b: false, p: "81", s: "1", r: true, t: { trigger: { isMarket: true, triggerPx: slPx, tpsl: "sl" } } },
		],
		grouping: "normalTpsl",
	};
}

describe("entry order SDK execution guard", () => {
	it("accepts a fresh market cap and rejects it after the exact mark expires", () => {
		const params = marketOrder(true, "102.5");
		expect(() => assertEntryOrderExecutionAllowed(params, executionState(), 1_001)).not.toThrow();
		expect(() => assertEntryOrderExecutionAllowed(params, executionState(), 11_001)).toThrow(
			"Live mark price is unavailable",
		);
	});

	it("rejects availability immediately after its exact receipt deadline", () => {
		const params = marketOrder(true, "102.5");
		expect(() => assertEntryOrderExecutionAllowed(params, executionState(), 21_001)).toThrow("availability data");
	});

	it("rejects a fresh mark paired with an expired mid execution reference", () => {
		const params = marketOrder(true, "102.5");
		expect(() =>
			assertEntryOrderExecutionAllowed(
				params,
				executionState({ markPriceReceivedAt: 11_000, executionPriceReceivedAt: 1_000 }),
				11_001,
			),
		).toThrow("Live execution price is unavailable");
	});

	it("rejects a queued order after the selected asset or availability changes", () => {
		const params = marketOrder(false, "97.5");
		expect(() => assertEntryOrderExecutionAllowed(params, executionState({ assetId: 1 }), 1_001)).toThrow(
			"selected market",
		);
		expect(() =>
			assertEntryOrderExecutionAllowed(params, executionState({ availabilityStatus: "stale" }), 1_001),
		).toThrow("availability data");
	});

	it("rejects a queued order or TWAP after fresh directional capacity falls", () => {
		const reducedCapacity = executionState({
			availability: { kind: "perp", maxBaseBySide: { buy: "0.5", sell: "10" } },
		});
		expect(() => assertEntryOrderExecutionAllowed(marketOrder(true, "102.5"), reducedCapacity, 1_001)).toThrow(
			"Trading availability changed",
		);
		expect(() =>
			assertEntryTwapExecutionAllowed(
				{ twap: { a: 0, b: true, s: "1", r: false, m: 10, t: false } },
				reducedCapacity,
				1_001,
			),
		).toThrow("Trading availability changed");
	});

	it("sums primary scale sizes but does not double-count attached TP/SL children", () => {
		const scale: OrderParameters = {
			orders: [
				{ a: 0, b: true, p: "99", s: "0.6", r: false, t: { limit: { tif: "Gtc" } } },
				{ a: 0, b: true, p: "98", s: "0.6", r: false, t: { limit: { tif: "Gtc" } } },
			],
			grouping: "na",
		};
		expect(() =>
			assertEntryOrderExecutionAllowed(
				scale,
				executionState({ availability: { kind: "perp", maxBaseBySide: { buy: "1", sell: "10" } } }),
				1_001,
			),
		).toThrow("Trading availability changed");
		expect(() =>
			assertEntryOrderExecutionAllowed(
				limitWithAttachedTpSl(),
				executionState({ availability: { kind: "perp", maxBaseBySide: { buy: "1", sell: "0" } } }),
				1_001,
			),
		).not.toThrow();
	});

	it("uses exact spot quote notional for buys and exact base size for sells", () => {
		const spotCapacity = executionState({
			availability: { kind: "spot", baseAvailable: "2.000000000000000001", quoteAvailable: "100" },
		});
		const expensiveBuy: OrderParameters = {
			orders: [{ a: 0, b: true, p: "20", s: "8", r: false, t: { limit: { tif: "Gtc" } } }],
			grouping: "na",
		};
		const exactSell: OrderParameters = {
			orders: [
				{
					a: 0,
					b: false,
					p: "10",
					s: "2.000000000000000001",
					r: false,
					t: { limit: { tif: "Gtc" } },
				},
			],
			grouping: "na",
		};

		expect(() => assertEntryOrderExecutionAllowed(expensiveBuy, spotCapacity, 1_001)).toThrow(
			"Trading availability changed",
		);
		expect(() => assertEntryOrderExecutionAllowed(exactSell, spotCapacity, 1_001)).not.toThrow();
		expect(() =>
			assertEntryOrderExecutionAllowed(
				{ ...exactSell, orders: [{ ...exactSell.orders[0], s: "2.000000000000000002" }] },
				spotCapacity,
				1_001,
			),
		).toThrow("Trading availability changed");
	});

	it.each([
		{ label: "buy stop", isBuy: true, tpsl: "sl" as const, triggerPx: "101" },
		{ label: "sell stop", isBuy: false, tpsl: "sl" as const, triggerPx: "99" },
		{ label: "buy take profit", isBuy: true, tpsl: "tp" as const, triggerPx: "99" },
		{ label: "sell take profit", isBuy: false, tpsl: "tp" as const, triggerPx: "101" },
	])("accepts the official $label trigger direction", ({ isBuy, tpsl, triggerPx }) => {
		expect(() =>
			assertEntryOrderExecutionAllowed(triggerOrder(isBuy, tpsl, triggerPx), executionState(), 1_001),
		).not.toThrow();
	});

	it.each([
		{ isBuy: true, tpsl: "sl" as const, triggerPx: "99" },
		{ isBuy: false, tpsl: "sl" as const, triggerPx: "101" },
		{ isBuy: true, tpsl: "tp" as const, triggerPx: "101" },
		{ isBuy: false, tpsl: "tp" as const, triggerPx: "99" },
	])("rejects a trigger that crossed to the wrong side", ({ isBuy, tpsl, triggerPx }) => {
		expect(() =>
			assertEntryOrderExecutionAllowed(triggerOrder(isBuy, tpsl, triggerPx), executionState(), 1_001),
		).toThrow("Trigger price is no longer valid");
	});

	it("validates attached limit TP/SL against the parent price without requiring a live mark", () => {
		expect(() =>
			assertEntryOrderExecutionAllowed(limitWithAttachedTpSl(), executionState({ markPriceStatus: "stale" }), 1_001),
		).not.toThrow();
		expect(() => assertEntryOrderExecutionAllowed(limitWithAttachedTpSl("90", "110"), executionState(), 1_001)).toThrow(
			"Trigger price is no longer valid",
		);
	});

	it("validates attached market TP/SL against a fresh live mark", () => {
		const params = limitWithAttachedTpSl();
		params.orders[0] = { ...params.orders[0], p: "102.5", t: { limit: { tif: "FrontendMarket" } } };
		expect(() => assertEntryOrderExecutionAllowed(params, executionState(), 1_001)).not.toThrow();
		expect(() => assertEntryOrderExecutionAllowed(params, executionState(), 11_001)).toThrow(
			"Live mark price is unavailable",
		);
		const crossed = limitWithAttachedTpSl("90", "110");
		crossed.orders[0] = { ...crossed.orders[0], p: "102.5", t: { limit: { tif: "FrontendMarket" } } };
		expect(() => assertEntryOrderExecutionAllowed(crossed, executionState(), 1_001)).toThrow(
			"Trigger price is no longer valid",
		);
	});

	it.each([
		{
			label: "same-side child",
			mutate: (params: OrderParameters) => {
				params.orders[1].b = params.orders[0].b;
			},
		},
		{
			label: "non-reduce-only child",
			mutate: (params: OrderParameters) => {
				params.orders[1].r = false;
			},
		},
		{
			label: "mismatched child size",
			mutate: (params: OrderParameters) => {
				params.orders[1].s = "0.5";
			},
		},
		{
			label: "duplicate TP child",
			mutate: (params: OrderParameters) => {
				const child = params.orders[2];
				if ("trigger" in child.t) child.t.trigger.tpsl = "tp";
			},
		},
		{
			label: "ordinary limit child",
			mutate: (params: OrderParameters) => {
				params.orders[1] = { ...params.orders[1], t: { limit: { tif: "Gtc" } } };
			},
		},
	])("rejects an invalid attached TP/SL structure: $label", ({ mutate }) => {
		const params = limitWithAttachedTpSl();
		mutate(params);
		expect(() => assertEntryOrderExecutionAllowed(params, executionState(), 1_001)).toThrow(
			"Attached TP/SL order structure is invalid",
		);
	});
});

describe("entry TWAP SDK execution guard", () => {
	const params = {
		twap: { a: 0, b: true, s: "1", r: false, m: 10, t: false },
	};

	it("accepts a fresh exact asset and blocks queued stale availability", () => {
		expect(() => assertEntryTwapExecutionAllowed(params, executionState(), 1_001)).not.toThrow();
		expect(() => assertEntryTwapExecutionAllowed(params, executionState(), 21_001)).toThrow("availability data");
	});

	it("rejects a TWAP after the selected asset changes", () => {
		expect(() => assertEntryTwapExecutionAllowed(params, executionState({ assetId: 1 }), 1_001)).toThrow(
			"selected market",
		);
	});
});
