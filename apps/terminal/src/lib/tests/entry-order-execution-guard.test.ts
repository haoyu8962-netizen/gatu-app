import type { OrderParameters } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import {
	assertEntryOrderExecutionAllowed,
	assertEntryTwapExecutionAllowed,
	EntryExecutionError,
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
		positionStateReady: true,
		positionReceivedAt: 1_000,
		positionSignedSize: "-2",
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
	it.each([
		[true, "1380.2", "1380.3"],
		[false, "1377.6", "1377.5"],
	] as const)(
		"rejects a half-up protection tick outside the exact slippage bound for buy=%s",
		(isBuy, safePrice, unsafePrice) => {
			const state = executionState({ markPx: "1378.9", executionReferencePx: "1378.9", slippageBps: 10 });
			expect(() => assertEntryOrderExecutionAllowed(marketOrder(isBuy, safePrice), state, 1_001)).not.toThrow();
			expect(() => assertEntryOrderExecutionAllowed(marketOrder(isBuy, unsafePrice), state, 1_001)).toThrow(
				"Market price moved beyond the confirmed slippage limit",
			);
		},
	);

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

	it("accepts an opening trigger that is not reduce-only and still enforces directional capacity", () => {
		const opening = triggerOrder(true, "sl", "101");
		expect(opening.orders[0]?.r).toBe(false);
		expect(() => assertEntryOrderExecutionAllowed(opening, executionState(), 1_001)).not.toThrow();

		const reducing: OrderParameters = { ...opening, orders: [{ ...opening.orders[0], r: true }] };
		expect(() => assertEntryOrderExecutionAllowed(reducing, executionState(), 1_001)).not.toThrow();

		expect(() =>
			assertEntryOrderExecutionAllowed(
				opening,
				executionState({ availability: { kind: "perp", maxBaseBySide: { buy: "0.5", sell: "10" } } }),
				1_001,
			),
		).toThrow("Trading availability changed");
	});

	it("fails closed for a reduce-only trigger without a fresh matching position", () => {
		const reducing: OrderParameters = {
			...triggerOrder(false, "sl", "99"),
			orders: [{ ...triggerOrder(false, "sl", "99").orders[0], r: true }],
		};

		expect(() =>
			assertEntryOrderExecutionAllowed(
				reducing,
				executionState({ positionStateReady: false, positionSignedSize: undefined }),
				1_001,
			),
		).toThrow("Live position data is unavailable");
		expect(() =>
			assertEntryOrderExecutionAllowed(
				reducing,
				executionState({
					availabilityReceivedAt: 61_000,
					markPriceReceivedAt: 61_000,
					positionReceivedAt: 1_000,
					positionSignedSize: "2",
				}),
				61_001,
			),
		).toThrow("Live position data is unavailable");
		expect(() =>
			assertEntryOrderExecutionAllowed(reducing, executionState({ positionSignedSize: "-2" }), 1_001),
		).toThrow("Reduce-only trigger no longer matches");
		expect(() =>
			assertEntryOrderExecutionAllowed(
				{ ...reducing, orders: [{ ...reducing.orders[0], s: "3" }] },
				executionState({ positionSignedSize: "2" }),
				1_001,
			),
		).toThrow("Reduce-only trigger no longer matches");
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

	it("exposes stable reasons and never leaks Big.js parse errors", () => {
		expectExecutionReason(
			() =>
				assertEntryOrderExecutionAllowed(
					{ ...marketOrder(true, "102.5"), orders: [{ ...marketOrder(true, "102.5").orders[0], s: "invalid" }] },
					executionState(),
					1_001,
				),
			"order-request-invalid",
		);
		expectExecutionReason(
			() =>
				assertEntryOrderExecutionAllowed(
					marketOrder(true, "102.5"),
					executionState({ executionReferencePx: "invalid" }),
					1_001,
				),
			"execution-price-unavailable",
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

function expectExecutionReason(action: () => void, reason: ConstructorParameters<typeof EntryExecutionError>[0]) {
	try {
		action();
		throw new Error("Expected entry execution guard to reject");
	} catch (error) {
		expect(error).toBeInstanceOf(EntryExecutionError);
		expect(error).toMatchObject({ reason });
	}
}

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

	it("accepts a spot buy TWAP using its official spot asset id and exact quote availability", () => {
		const spotParams = { twap: { ...params.twap, a: 10_000, s: "1.25" } };
		const spotState = executionState({
			assetId: 10_000,
			availability: { kind: "spot", baseAvailable: "0", quoteAvailable: "125" },
		});

		expect(() => assertEntryTwapExecutionAllowed(spotParams, spotState, 1_001)).not.toThrow();
		expect(() =>
			assertEntryTwapExecutionAllowed(
				spotParams,
				{
					...spotState,
					availability: { kind: "spot", baseAvailable: "0", quoteAvailable: "124.999999999999999999" },
				},
				1_001,
			),
		).toThrow("Trading availability changed");
	});

	it("requires a fresh mark to value a spot buy TWAP against quote availability", () => {
		const spotParams = { twap: { ...params.twap, a: 10_000 } };
		const spotState = executionState({
			assetId: 10_000,
			availability: { kind: "spot", baseAvailable: "0", quoteAvailable: "100" },
		});

		expect(() => assertEntryTwapExecutionAllowed(spotParams, spotState, 11_001)).toThrow(
			"Live mark price is unavailable",
		);
	});

	it("uses exact base availability for a spot sell TWAP after checking a fresh mark", () => {
		const spotParams = { twap: { ...params.twap, a: 10_000, b: false, s: "2.000000000000000001" } };
		const spotState = executionState({
			assetId: 10_000,
			availability: {
				kind: "spot",
				baseAvailable: "2.000000000000000001",
				quoteAvailable: "0",
			},
		});

		expect(() => assertEntryTwapExecutionAllowed(spotParams, spotState, 1_001)).not.toThrow();
		expect(() =>
			assertEntryTwapExecutionAllowed(
				spotParams,
				{
					...spotState,
					availability: {
						kind: "spot",
						baseAvailable: "2.000000000000000000",
						quoteAvailable: "0",
					},
				},
				1_001,
			),
		).toThrow("Trading availability changed");
	});

	it("requires a fresh mark for every TWAP so the formatted total can be valued", () => {
		const stale = executionState({ markPriceStatus: "loading", markPx: undefined, markPriceReceivedAt: undefined });
		expect(() => assertEntryTwapExecutionAllowed(params, stale, 1_001)).toThrow("Live mark price is unavailable");
		expect(() => assertEntryTwapExecutionAllowed({ ...params, details: { t: null, s: null } }, stale, 1_001)).toThrow(
			"Live mark price is unavailable",
		);
	});

	it("enforces the official duration and exact formatted-size notional at the SDK boundary", () => {
		const sevenDays = { twap: { ...params.twap, m: 10_080 } };
		const sevenDaysAsSdkInput = { twap: { ...params.twap, m: "10080" } };
		const tooLong = { twap: { ...params.twap, m: 10_081 } };
		const tooShort = { twap: { ...params.twap, m: 4 } };
		const invalidDuration = { twap: { ...params.twap, m: "not-a-duration" } };
		const belowMinimum = { twap: { ...params.twap, s: "0.999999999999999999" } };

		expect(() => assertEntryTwapExecutionAllowed(sevenDays, executionState(), 1_001)).not.toThrow();
		expect(() => assertEntryTwapExecutionAllowed(sevenDaysAsSdkInput, executionState(), 1_001)).not.toThrow();
		expect(() => assertEntryTwapExecutionAllowed(tooLong, executionState(), 1_001)).toThrow(
			"TWAP duration must be 5-10080 minutes",
		);
		expect(() => assertEntryTwapExecutionAllowed(tooShort, executionState(), 1_001)).toThrow(
			"TWAP duration must be 5-10080 minutes",
		);
		expect(() => assertEntryTwapExecutionAllowed(invalidDuration, executionState(), 1_001)).toThrow(
			"TWAP duration must be 5-10080 minutes",
		);
		expect(() => assertEntryTwapExecutionAllowed(belowMinimum, executionState(), 1_001)).toThrow(
			"TWAP order value must be at least $100",
		);
	});

	it("re-validates the trigger direction against the live mark when the request fires", () => {
		const above = { twap: { ...params.twap, s: "2" }, details: { t: { p: "105", a: true }, s: null } };
		const below = { twap: { ...params.twap, s: "2" }, details: { t: { p: "95", a: false }, s: null } };
		expect(() => assertEntryTwapExecutionAllowed(above, executionState(), 1_001)).not.toThrow();
		expect(() => assertEntryTwapExecutionAllowed(below, executionState(), 1_001)).not.toThrow();

		expect(() => assertEntryTwapExecutionAllowed(above, executionState({ markPx: "106" }), 1_001)).toThrow(
			"Trigger price is no longer valid against the live mark price",
		);
		expect(() => assertEntryTwapExecutionAllowed(below, executionState({ markPx: "94" }), 1_001)).toThrow(
			"Trigger price is no longer valid against the live mark price",
		);
		expect(() => assertEntryTwapExecutionAllowed(above, executionState({ markPx: "105" }), 1_001)).toThrow(
			"Trigger price is no longer valid against the live mark price",
		);
	});

	it("rejects TWAP trigger and stop details once the mark is stale or missing", () => {
		const withTrigger = { ...params, details: { t: { p: "105", a: true }, s: null } };
		const withStop = { ...params, details: { t: null, s: "110" } };
		expect(() => assertEntryTwapExecutionAllowed(withTrigger, executionState(), 11_001)).toThrow(
			"Live mark price is unavailable",
		);
		expect(() =>
			assertEntryTwapExecutionAllowed(withStop, executionState({ markPriceStatus: "loading" }), 1_001),
		).toThrow("Live mark price is unavailable");
	});

	it("re-validates the stop side against the live mark for buys and sells", () => {
		const buyStop = { twap: { ...params.twap, s: "2" }, details: { t: null, s: "110" } };
		const sellStop = { twap: { ...params.twap, b: false, s: "2" }, details: { t: null, s: "90" } };
		expect(() => assertEntryTwapExecutionAllowed(buyStop, executionState(), 1_001)).not.toThrow();
		expect(() => assertEntryTwapExecutionAllowed(sellStop, executionState(), 1_001)).not.toThrow();

		expect(() => assertEntryTwapExecutionAllowed(buyStop, executionState({ markPx: "110" }), 1_001)).toThrow(
			"Stop price is no longer valid against the live mark price",
		);
		expect(() => assertEntryTwapExecutionAllowed(sellStop, executionState({ markPx: "89" }), 1_001)).toThrow(
			"Stop price is no longer valid against the live mark price",
		);
	});
});
