import { describe, expect, it, vi } from "vitest";
import { getTpSlPriceErrors } from "@/domain/trade/tpsl-price-validation";
import {
	enterSizeValidator,
	exceedsMaxSizeValidator,
	minOrderNotionalValidator,
} from "@/lib/errors/definitions/order-input";
import {
	reduceOnlyPositionDirectionValidator,
	reduceOnlyPositionExistsValidator,
	reduceOnlyPositionSizeValidator,
} from "@/lib/errors/definitions/reduce-only";
import {
	scaleLevelMinNotionalValidator,
	scaleSizeAllocationValidator,
	scaleSkewAllocationValidator,
} from "@/lib/errors/definitions/scale";
import {
	insufficientBaseBalanceValidator,
	insufficientQuoteBalanceValidator,
} from "@/lib/errors/definitions/spot-balance";
import { spotEnterSizeValidator, spotMinOrderNotionalValidator } from "@/lib/errors/definitions/spot-input";
import {
	enterTpSlPriceValidator,
	slPriceValidator,
	tpPriceValidator,
	tpSlReturnValidator,
} from "@/lib/errors/definitions/tpsl";
import {
	stopTriggerAboveMarkValidator,
	stopTriggerBelowMarkValidator,
	tpTriggerAboveMarkValidator,
	tpTriggerBelowMarkValidator,
} from "@/lib/errors/definitions/trigger";
import {
	twapMinNotionalValidator,
	twapStopDirectionValidator,
	twapTriggerDiffersFromMarkValidator,
} from "@/lib/errors/definitions/twap";
import { type PerpOrderContext, validatePerpOrder } from "@/lib/errors/stacks/perp-order";
import { type SpotOrderContext, validateSpotOrder } from "@/lib/errors/stacks/spot-order";
import { getOrderValidationPresentation, isInlineTpSlValidationError } from "@/lib/trade/order-validation-presentation";

vi.mock("@lingui/core/macro", () => ({
	t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
		if (typeof strings === "string") return strings;
		return strings.reduce((message, part, index) => `${message}${part}${values[index] ?? ""}`, "");
	},
}));

function spotContext(overrides: Partial<SpotOrderContext> = {}): SpotOrderContext {
	return {
		assetId: 10000,
		szDecimals: 2,
		isConnected: true,
		isWalletLoading: false,
		isReadyToTrade: true,
		needsAgentApproval: false,
		availableBalance: 1_000,
		hasMarket: true,
		hasAssetIndex: true,
		markPriceStatus: "success",
		requiresLiveMarkPrice: false,
		usesLimitPrice: false,
		price: 20,
		markPx: 20,
		sizeValue: 10,
		orderValue: 200,
		side: "buy",
		baseAvailable: 1_000,
		quoteAvailable: 1_000,
		baseToken: "HYPE",
		quoteToken: "USDC",
		scaleOrder: false,
		scaleStartPriceNum: null,
		scaleEndPriceNum: null,
		scaleLevelsNum: null,
		scaleSkewNum: null,
		twapOrder: false,
		twapMinutesNum: null,
		twapTriggerPriceNum: null,
		twapStopPriceNum: null,
		...overrides,
	};
}

function perpContext(overrides: Partial<PerpOrderContext> = {}): PerpOrderContext {
	return {
		assetId: 0,
		szDecimals: 2,
		isConnected: true,
		isWalletLoading: false,
		isReadyToTrade: true,
		needsAgentApproval: false,
		availableBalance: 1_000,
		hasMarket: true,
		hasAssetIndex: true,
		markPriceStatus: "success",
		requiresLiveMarkPrice: false,
		orderType: "limit",
		usesLimitPrice: true,
		usesTriggerPrice: false,
		triggerPriceNum: null,
		price: 100,
		markPx: 100,
		sizeValue: 1,
		orderValue: 100,
		maxSize: 100,
		side: "buy",
		stopOrder: false,
		takeProfitOrder: false,
		positionSize: null,
		reduceOnly: false,
		scaleOrder: false,
		scaleStartPriceNum: null,
		scaleEndPriceNum: null,
		scaleLevelsNum: null,
		scaleSkewNum: null,
		twapOrder: false,
		twapMinutesNum: null,
		twapTriggerPriceNum: null,
		twapStopPriceNum: null,
		tpSlEnabled: false,
		canUseTpSl: false,
		tpSlReturnInvalid: false,
		tpPriceNum: null,
		slPriceNum: null,
		...overrides,
	};
}

describe("spot advanced order validation", () => {
	it("fails closed while the selected-market mark stream is stale", () => {
		const result = validateSpotOrder(spotContext({ markPriceStatus: "stale", requiresLiveMarkPrice: true }));

		expect(result.errors.map((error) => error.code)).toContain("MKT_004");
		expect(result.canSubmit).toBe(false);
	});

	it("allows an explicit-price order while the mark stream is stale", () => {
		const result = validateSpotOrder(spotContext({ markPriceStatus: "stale" }));

		expect(result.errors.map((error) => error.code)).not.toContain("MKT_004");
	});

	it("requires a complete scale price range", () => {
		const result = validateSpotOrder(
			spotContext({
				scaleOrder: true,
				scaleStartPriceNum: null,
				scaleEndPriceNum: 30,
				scaleLevelsNum: 4,
			}),
		);

		expect(result.errors.map((error) => error.code)).toContain("SCL_001");
	});

	it("rejects a scale skew outside the supported range", () => {
		const context = {
			scaleOrder: true,
			scaleStartPriceNum: 20,
			scaleEndPriceNum: 30,
			scaleLevelsNum: 4,
			sizeValue: 10,
			orderValue: 250,
		};
		const tooLarge = validateSpotOrder(spotContext({ ...context, scaleSkewNum: 101 }));
		const missing = validateSpotOrder(spotContext({ ...context, scaleSkewNum: null }));
		const inRange = validateSpotOrder(spotContext({ ...context, scaleSkewNum: 2 }));

		expect(tooLarge.errors.find((error) => error.code === "SCL_007")?.message).toBe("Scale skew must be 0.01-100");
		expect(missing.errors.map((error) => error.code)).toContain("SCL_007");
		expect(inRange.errors.filter((error) => error.category === "scale")).toEqual([]);
	});

	it("rejects a scale skew below the lower bound on both stacks", () => {
		const context = {
			scaleOrder: true,
			scaleStartPriceNum: 20,
			scaleEndPriceNum: 30,
			scaleLevelsNum: 4,
			sizeValue: 10,
			orderValue: 250,
		};

		for (const scaleSkewNum of [0.005, 0]) {
			const spot = validateSpotOrder(spotContext({ ...context, scaleSkewNum }));
			const perp = validatePerpOrder(perpContext({ ...context, scaleSkewNum }));

			expect(spot.errors.map((error) => error.code)).toContain("SCL_007");
			expect(perp.errors.map((error) => error.code)).toContain("SCL_007");
		}

		const lowerBound = validateSpotOrder(spotContext({ ...context, scaleSkewNum: 0.01 }));
		expect(lowerBound.errors.map((error) => error.code)).not.toContain("SCL_007");
	});

	it("surfaces a skew that starves the first level as a skew allocation error", () => {
		const context = {
			scaleOrder: true,
			szDecimals: 0,
			scaleStartPriceNum: 20,
			scaleEndPriceNum: 30,
			scaleLevelsNum: 4,
			scaleSkewNum: 100,
			sizeValue: 8,
			orderValue: 200,
		};
		const spot = validateSpotOrder(spotContext(context));
		const perp = validatePerpOrder(perpContext(context));

		expect(spot.errors.find((error) => error.code === "SCL_008")?.message).toBe(
			"Size skew is too aggressive for the total size",
		);
		expect(perp.errors.map((error) => error.code)).toContain("SCL_008");
		expect(spot.errors.map((error) => error.code)).not.toContain("SCL_005");
		expect(spot.errors.map((error) => error.code)).not.toContain("SCL_007");
	});

	it("keeps the plain size error when the total is below one lot per level", () => {
		const result = validateSpotOrder(
			spotContext({
				scaleOrder: true,
				szDecimals: 0,
				scaleStartPriceNum: 20,
				scaleEndPriceNum: 30,
				scaleLevelsNum: 4,
				scaleSkewNum: 100,
				sizeValue: 3,
				orderValue: 75,
			}),
		);

		expect(result.errors.map((error) => error.code)).toContain("SCL_005");
		expect(result.errors.map((error) => error.code)).not.toContain("SCL_008");
	});

	it("ignores the scale skew for non-scale orders", () => {
		const result = validateSpotOrder(spotContext({ scaleSkewNum: 0 }));

		expect(result.errors.filter((error) => error.category === "scale")).toEqual([]);
	});

	it("rejects a one-minute TWAP instead of silently clamping it", () => {
		const result = validateSpotOrder(spotContext({ twapOrder: true, twapMinutesNum: 1 }));

		expect(result.errors.map((error) => error.code)).toContain("TWAP_001");
	});

	it("accepts the official seven-day maximum and rejects one minute beyond it", () => {
		const maximum = validateSpotOrder(spotContext({ twapOrder: true, twapMinutesNum: 10_080, orderValue: 100 }));
		const beyondMaximum = validateSpotOrder(spotContext({ twapOrder: true, twapMinutesNum: 10_081, orderValue: 100 }));

		expect(maximum.errors.map((error) => error.code)).not.toContain("TWAP_001");
		expect(beyondMaximum.errors.map((error) => error.code)).toContain("TWAP_001");
	});

	it("uses the official fixed $100 total minimum regardless of runtime", () => {
		const longRunning = validateSpotOrder(spotContext({ twapOrder: true, twapMinutesNum: 240, orderValue: 500 }));
		const belowMinimum = validateSpotOrder(spotContext({ twapOrder: true, twapMinutesNum: 5, orderValue: 99.99 }));
		const exactMinimum = validateSpotOrder(spotContext({ twapOrder: true, twapMinutesNum: 5, orderValue: 100 }));

		expect(longRunning.errors.map((error) => error.code)).not.toContain("TWAP_002");
		expect(belowMinimum.errors.find((error) => error.code === "TWAP_002")?.message).toBe(
			"TWAP order value must be at least $100.",
		);
		expect(exactMinimum.errors.map((error) => error.code)).not.toContain("TWAP_002");
	});

	it("accepts a valid spot TWAP", () => {
		const result = validateSpotOrder(
			spotContext({
				twapOrder: true,
				twapMinutesNum: 30,
				orderValue: 1_000,
				requiresLiveMarkPrice: true,
			}),
		);

		expect(result.errors.filter((error) => error.category === "twap")).toEqual([]);
		expect(result.canSubmit).toBe(true);
	});

	it("skips mark-relative TWAP checks when the spot mark is unavailable", () => {
		const result = validateSpotOrder(
			spotContext({
				twapOrder: true,
				twapMinutesNum: 30,
				orderValue: 1_000,
				markPx: 0,
				twapTriggerPriceNum: 20,
				twapStopPriceNum: 15,
			}),
		);

		expect(result.errors.map((error) => error.code)).not.toContain("TWAP_005");
		expect(result.errors.map((error) => error.code)).not.toContain("TWAP_006");
	});
});

describe("TWAP trigger and stop price validation", () => {
	function twapContext(overrides: Partial<PerpOrderContext> = {}): PerpOrderContext {
		return perpContext({
			orderType: "twap",
			usesLimitPrice: false,
			twapOrder: true,
			twapMinutesNum: 30,
			orderValue: 1_000,
			sizeValue: 10,
			markPx: 100,
			...overrides,
		});
	}

	it("accepts a TWAP without trigger or stop prices", () => {
		const result = validatePerpOrder(twapContext());

		expect(result.errors.filter((error) => error.category === "twap")).toEqual([]);
		expect(result.canSubmit).toBe(true);
	});

	it("rejects a non-positive trigger price", () => {
		const result = validatePerpOrder(twapContext({ twapTriggerPriceNum: 0 }));

		expect(result.errors.map((error) => error.code)).toContain("TWAP_003");
		expect(result.errors.find((error) => error.code === "TWAP_003")?.message).toBe("Enter a valid trigger price");
	});

	it("rejects a non-positive stop price with a side-specific message", () => {
		const buy = validatePerpOrder(twapContext({ side: "buy", twapStopPriceNum: -1 }));
		const sell = validatePerpOrder(twapContext({ side: "sell", twapStopPriceNum: 0 }));

		expect(buy.errors.find((error) => error.code === "TWAP_004")?.message).toBe("Enter a valid max price");
		expect(sell.errors.find((error) => error.code === "TWAP_004")?.message).toBe("Enter a valid min price");
	});

	it("requires the trigger price to differ from mark", () => {
		const equal = validatePerpOrder(twapContext({ twapTriggerPriceNum: 100 }));
		const above = validatePerpOrder(twapContext({ twapTriggerPriceNum: 101 }));
		const below = validatePerpOrder(twapContext({ twapTriggerPriceNum: 99 }));

		expect(equal.errors.map((error) => error.code)).toContain("TWAP_005");
		expect(above.errors.map((error) => error.code)).not.toContain("TWAP_005");
		expect(below.errors.map((error) => error.code)).not.toContain("TWAP_005");
	});

	it("requires a buy max price above mark and a sell min price below mark", () => {
		const buyBelow = validatePerpOrder(twapContext({ side: "buy", twapStopPriceNum: 99 }));
		const buyAbove = validatePerpOrder(twapContext({ side: "buy", twapStopPriceNum: 101 }));
		const sellAbove = validatePerpOrder(twapContext({ side: "sell", twapStopPriceNum: 101 }));
		const sellBelow = validatePerpOrder(twapContext({ side: "sell", twapStopPriceNum: 99 }));

		expect(buyBelow.errors.find((error) => error.code === "TWAP_006")?.message).toBe("Max price must be above mark");
		expect(buyAbove.errors.map((error) => error.code)).not.toContain("TWAP_006");
		expect(sellAbove.errors.find((error) => error.code === "TWAP_006")?.message).toBe("Min price must be below mark");
		expect(sellBelow.errors.map((error) => error.code)).not.toContain("TWAP_006");
	});

	it("requires the stop price to sit beyond the trigger price", () => {
		const buyBad = validatePerpOrder(twapContext({ side: "buy", twapTriggerPriceNum: 110, twapStopPriceNum: 105 }));
		const buyOk = validatePerpOrder(twapContext({ side: "buy", twapTriggerPriceNum: 105, twapStopPriceNum: 110 }));
		const sellBad = validatePerpOrder(twapContext({ side: "sell", twapTriggerPriceNum: 90, twapStopPriceNum: 95 }));
		const sellOk = validatePerpOrder(twapContext({ side: "sell", twapTriggerPriceNum: 95, twapStopPriceNum: 90 }));

		expect(buyBad.errors.find((error) => error.code === "TWAP_007")?.message).toBe(
			"Max price must be above trigger price",
		);
		expect(buyOk.errors.filter((error) => error.category === "twap")).toEqual([]);
		expect(sellBad.errors.find((error) => error.code === "TWAP_007")?.message).toBe(
			"Min price must be below trigger price",
		);
		expect(sellOk.errors.filter((error) => error.category === "twap")).toEqual([]);
	});

	it("ignores TWAP trigger and stop prices for non-TWAP orders", () => {
		const result = validatePerpOrder(perpContext({ twapTriggerPriceNum: 0, twapStopPriceNum: 0 }));

		expect(result.errors.filter((error) => error.category === "twap")).toEqual([]);
	});
});

describe("reduce-only trigger validation", () => {
	it("fails closed while the selected-market mark stream is unavailable", () => {
		const result = validatePerpOrder(perpContext({ markPriceStatus: "error", requiresLiveMarkPrice: true }));

		expect(result.errors.map((error) => error.code)).toContain("MKT_004");
		expect(result.canSubmit).toBe(false);
	});

	it("blocks a reduce-only trigger order when no position exists", () => {
		const result = validatePerpOrder(
			perpContext({
				orderType: "stopMarket",
				usesLimitPrice: false,
				usesTriggerPrice: true,
				triggerPriceNum: 95,
				side: "sell",
				stopOrder: true,
				positionSize: 0,
				reduceOnly: true,
			}),
		);

		expect(result.errors.map((error) => error.code)).toContain("TRG_005");
	});

	it("blocks a reduce-only trigger order when the position snapshot is unavailable", () => {
		const result = validatePerpOrder(
			perpContext({
				orderType: "stopMarket",
				usesLimitPrice: false,
				usesTriggerPrice: true,
				triggerPriceNum: 95,
				side: "sell",
				stopOrder: true,
				positionSize: null,
				reduceOnly: true,
			}),
		);

		expect(result.errors.map((error) => error.code)).toContain("TRG_005");
		expect(result.canSubmit).toBe(false);
	});

	it("requires a reduce-only trigger side to reduce the current position", () => {
		const result = validatePerpOrder(
			perpContext({
				orderType: "stopMarket",
				usesLimitPrice: false,
				usesTriggerPrice: true,
				triggerPriceNum: 105,
				side: "buy",
				stopOrder: true,
				positionSize: 10,
				reduceOnly: true,
			}),
		);

		expect(result.errors.map((error) => error.code)).toContain("TRG_006");
	});

	it("rejects a reduce-only trigger larger than the position", () => {
		const result = validatePerpOrder(
			perpContext({
				orderType: "stopMarket",
				usesLimitPrice: false,
				usesTriggerPrice: true,
				triggerPriceNum: 95,
				side: "sell",
				stopOrder: true,
				positionSize: 10,
				sizeValue: 11,
				orderValue: 1_100,
				reduceOnly: true,
			}),
		);

		expect(result.errors.map((error) => error.code)).toContain("TRG_007");
	});
});

describe("opening trigger validation", () => {
	it("allows a trigger order to open a position when reduce-only is off", () => {
		const result = validatePerpOrder(
			perpContext({
				orderType: "stopMarket",
				usesLimitPrice: false,
				usesTriggerPrice: true,
				triggerPriceNum: 95,
				side: "sell",
				stopOrder: true,
				positionSize: 0,
				reduceOnly: false,
			}),
		);

		expect(result.errors.map((error) => error.code)).not.toContain("TRG_005");
		expect(result.canSubmit).toBe(true);
	});

	it("allows a trigger order to add to the current position when reduce-only is off", () => {
		const result = validatePerpOrder(
			perpContext({
				orderType: "stopMarket",
				usesLimitPrice: false,
				usesTriggerPrice: true,
				triggerPriceNum: 105,
				side: "buy",
				stopOrder: true,
				positionSize: 10,
				reduceOnly: false,
			}),
		);

		expect(result.errors.map((error) => error.code)).not.toContain("TRG_006");
		expect(result.canSubmit).toBe(true);
	});

	it("does not cap an opening trigger at the current position size", () => {
		const result = validatePerpOrder(
			perpContext({
				orderType: "stopMarket",
				usesLimitPrice: false,
				usesTriggerPrice: true,
				triggerPriceNum: 95,
				side: "sell",
				stopOrder: true,
				positionSize: 10,
				sizeValue: 11,
				orderValue: 1_100,
				reduceOnly: false,
			}),
		);

		expect(result.errors.map((error) => error.code)).not.toContain("TRG_007");
		expect(result.canSubmit).toBe(true);
	});

	it("still enforces the mark-relative trigger direction for opening triggers", () => {
		const result = validatePerpOrder(
			perpContext({
				orderType: "stopMarket",
				usesLimitPrice: false,
				usesTriggerPrice: true,
				triggerPriceNum: 95,
				side: "buy",
				stopOrder: true,
				positionSize: 0,
				reduceOnly: false,
			}),
		);

		expect(result.errors.map((error) => error.code)).toContain("TRG_001");
	});
});

describe("attached TP/SL precision validation", () => {
	it("rejects an invalid linked amount even when the other trigger is valid", () => {
		const result = validatePerpOrder(
			perpContext({
				tpSlEnabled: true,
				canUseTpSl: true,
				tpSlReturnInvalid: true,
				tpPriceNum: null,
				slPriceNum: 90,
			}),
		);

		expect(result.errors.map((error) => error.code)).toEqual(["TPSL_004"]);
		expect(result.canSubmit).toBe(false);
	});

	it("rejects a TP that only differs before protocol price normalization", () => {
		const result = validatePerpOrder(
			perpContext({
				assetId: 0,
				szDecimals: 0,
				price: 12_345,
				tpSlEnabled: true,
				canUseTpSl: true,
				tpPriceNum: 12_345.12345,
			}),
		);

		expect(result.errors.map((error) => error.code)).toContain("TPSL_002");
		expect(result.canSubmit).toBe(false);
	});
});

describe("quiet order validation presentation", () => {
	const enteredDraft = {
		size: "0",
		limitPrice: "100",
		triggerPrice: "110",
		tpPrice: "",
		slPrice: "",
		scaleStartPrice: "95",
		scaleEndPrice: "105",
	};
	it.each([
		enterSizeValidator,
		minOrderNotionalValidator,
		exceedsMaxSizeValidator,
		spotEnterSizeValidator,
		spotMinOrderNotionalValidator,
		insufficientQuoteBalanceValidator,
		insufficientBaseBalanceValidator,
		scaleLevelMinNotionalValidator,
		scaleSizeAllocationValidator,
		scaleSkewAllocationValidator,
		reduceOnlyPositionSizeValidator,
		twapMinNotionalValidator,
		enterTpSlPriceValidator,
		tpPriceValidator,
		slPriceValidator,
		tpSlReturnValidator,
		stopTriggerAboveMarkValidator,
		stopTriggerBelowMarkValidator,
		tpTriggerAboveMarkValidator,
		tpTriggerBelowMarkValidator,
		twapTriggerDiffersFromMarkValidator,
		twapStopDirectionValidator,
	])("keeps $id feedback quiet until the market recovers without changing the raw error", (validator) => {
		const error = { ...validator.error, message: validator.id };
		const errors = [error];
		const state = {
			accountReady: true,
			marketReady: false,
			positionReady: true,
			draft: { ...enteredDraft, tpPrice: "120" },
		};
		expect(getOrderValidationPresentation(errors, state)).toEqual([]);
		expect(getOrderValidationPresentation(errors, { ...state, marketReady: true })).toEqual([error]);
		expect(errors).toEqual([error]);
	});

	it.each([reduceOnlyPositionExistsValidator, reduceOnlyPositionDirectionValidator, reduceOnlyPositionSizeValidator])(
		"keeps $id feedback quiet until positions arrive",
		(validator) => {
			const error = { ...validator.error, message: validator.id };
			const state = { accountReady: true, marketReady: true, positionReady: false, draft: enteredDraft };
			expect(getOrderValidationPresentation([error], state)).toEqual([]);
			expect(getOrderValidationPresentation([error], { ...state, positionReady: true })).toEqual([error]);
		},
	);

	it.each(["idle", "loading", "stale", "error"] as const)(
		"keeps %s data blocked without passive or mark-dependent errors",
		(markPriceStatus) => {
			const context = perpContext({
				orderType: "market",
				usesLimitPrice: false,
				requiresLiveMarkPrice: true,
				markPriceStatus,
				sizeValue: 0,
				orderValue: 0,
				isWalletLoading: true,
			});
			const result = validatePerpOrder(context);
			expect(result.canSubmit).toBe(false);
			expect(result.errors.some((error) => error.code === "MKT_004")).toBe(true);
			expect(
				getOrderValidationPresentation(result.errors, {
					accountReady: true,
					marketReady: false,
					positionReady: true,
					draft: enteredDraft,
				}),
			).toEqual([]);
			const recovered = validatePerpOrder({ ...context, markPriceStatus: "success", isWalletLoading: false });
			expect(
				getOrderValidationPresentation(recovered.errors, {
					accountReady: true,
					marketReady: true,
					positionReady: true,
					draft: enteredDraft,
				}).map((error) => error.id),
			).toContain("enter-size");
		},
	);

	it("separates unknown positions from confirmed empty and funded positions", () => {
		const context = perpContext({
			orderType: "stopMarket",
			usesLimitPrice: false,
			usesTriggerPrice: true,
			triggerPriceNum: 110,
			stopOrder: true,
			reduceOnly: true,
			positionSize: null,
		});
		const pending = validatePerpOrder(context);
		expect(pending.canSubmit).toBe(false);
		expect(
			getOrderValidationPresentation(pending.errors, {
				accountReady: true,
				marketReady: true,
				positionReady: false,
				draft: enteredDraft,
			}),
		).toEqual([]);
		const empty = validatePerpOrder({ ...context, positionSize: 0 });
		expect(
			getOrderValidationPresentation(empty.errors, {
				accountReady: true,
				marketReady: true,
				positionReady: true,
				draft: enteredDraft,
			}).map((error) => error.id),
		).toContain("trigger-position-exists");
		expect(validatePerpOrder({ ...context, positionSize: -10 }).canSubmit).toBe(true);
	});

	it("keeps independent TWAP input errors but suppresses stale mark comparisons", () => {
		const result = validatePerpOrder(
			perpContext({
				twapOrder: true,
				twapMinutesNum: 1,
				twapStopPriceNum: 90,
				markPriceStatus: "stale",
				requiresLiveMarkPrice: true,
			}),
		);
		const ids = getOrderValidationPresentation(result.errors, {
			accountReady: true,
			marketReady: false,
			positionReady: true,
			draft: enteredDraft,
		}).map((error) => error.id);
		expect(ids).toContain("twap-minutes-range");
		expect(ids).not.toContain("twap-stop-direction");
		expect(result.canSubmit).toBe(false);
	});

	it("does not infer insufficient Spot balance from unavailable account data", () => {
		const result = validateSpotOrder(spotContext({ quoteAvailable: 0 }));
		expect(result.canSubmit).toBe(false);
		expect(
			getOrderValidationPresentation(result.errors, {
				accountReady: false,
				marketReady: true,
				positionReady: true,
				draft: enteredDraft,
			}),
		).toEqual([]);
		expect(
			getOrderValidationPresentation(result.errors, {
				accountReady: true,
				marketReady: true,
				positionReady: true,
				draft: enteredDraft,
			}).map((error) => error.id),
		).toContain("spot-insufficient-quote");
	});
});

describe("order draft feedback timing and ownership", () => {
	const emptyDraft = {
		size: "",
		limitPrice: "",
		triggerPrice: "",
		tpPrice: "",
		slPrice: "",
		scaleStartPrice: "",
		scaleEndPrice: "",
	};
	const ready = { accountReady: true, marketReady: true, positionReady: true, draft: emptyDraft };

	it("keeps empty required fields quiet without changing submission validity", () => {
		const result = validatePerpOrder(
			perpContext({
				sizeValue: 0,
				orderValue: 0,
				price: 0,
				usesTriggerPrice: true,
				tpSlEnabled: true,
				canUseTpSl: true,
			}),
		);
		expect(result.errors.map((error) => error.id)).toEqual(
			expect.arrayContaining(["enter-size", "enter-limit-price", "enter-trigger-price", "enter-tpsl-price"]),
		);
		const originalErrors = [...result.errors];
		expect(getOrderValidationPresentation(result.errors, ready)).toEqual([]);
		expect(result.errors).toEqual(originalErrors);
		expect(result.canSubmit).toBe(false);
	});

	it("shows nonempty zero and intermediate invalid inputs, then becomes quiet when cleared", () => {
		const result = validatePerpOrder(
			perpContext({
				sizeValue: 0,
				orderValue: 0,
				price: 0,
				usesTriggerPrice: true,
				tpSlEnabled: true,
				canUseTpSl: true,
			}),
		);
		for (const value of ["0", "."]) {
			const draft = { ...emptyDraft, size: value, limitPrice: value, triggerPrice: value, tpPrice: value };
			expect(getOrderValidationPresentation(result.errors, { ...ready, draft }).map((error) => error.id)).toEqual(
				expect.arrayContaining(["enter-size", "enter-limit-price", "enter-trigger-price", "enter-tpsl-price"]),
			);
		}
		expect(getOrderValidationPresentation(result.errors, ready)).toEqual([]);
		expect(result.canSubmit).toBe(false);
	});

	it("keeps a newly expanded TP/SL section quiet while retaining its required-price guard", () => {
		const result = validatePerpOrder(perpContext({ tpSlEnabled: true, canUseTpSl: true }));
		const draft = { ...emptyDraft, size: "1", limitPrice: "100" };
		expect(result.canSubmit).toBe(false);
		expect(result.errors.map((error) => error.id)).toContain("enter-tpsl-price");
		expect(getOrderValidationPresentation(result.errors, { ...ready, draft })).toEqual([]);
		expect(validatePerpOrder(perpContext({ tpSlEnabled: true, canUseTpSl: true, tpPriceNum: 110 })).canSubmit).toBe(
			true,
		);
	});

	it("applies the same empty and entered-zero behavior to Spot limit orders", () => {
		const result = validateSpotOrder(spotContext({ usesLimitPrice: true, price: 0, sizeValue: 0, orderValue: 0 }));
		expect(getOrderValidationPresentation(result.errors, ready)).toEqual([]);
		expect(result.canSubmit).toBe(false);
		const draft = { ...emptyDraft, size: "0", limitPrice: "0" };
		expect(getOrderValidationPresentation(result.errors, { ...ready, draft }).map((error) => error.id)).toEqual([
			"spot-enter-limit-price",
			"spot-enter-size",
		]);
	});

	it.each(["", "95"])("waits for an unfinished Scale range with valid entered start %s", (start) => {
		const result = validatePerpOrder(
			perpContext({
				scaleOrder: true,
				scaleStartPriceNum: start ? Number(start) : null,
				scaleEndPriceNum: null,
				scaleLevelsNum: 5,
				scaleSkewNum: 1,
			}),
		);
		const draft = { ...emptyDraft, size: "1", scaleStartPrice: start };
		expect(getOrderValidationPresentation(result.errors, { ...ready, draft }).map((error) => error.id)).not.toContain(
			"enter-price-range",
		);
		expect(result.canSubmit).toBe(false);
	});

	it.each(["0", ".", "-1"])("preserves invalid Scale value %s even while the other bound is blank", (value) => {
		const result = validatePerpOrder(
			perpContext({
				scaleOrder: true,
				scaleStartPriceNum: 0,
				scaleEndPriceNum: null,
				scaleLevelsNum: 5,
				scaleSkewNum: 1,
			}),
		);
		for (const draft of [
			{ ...emptyDraft, size: "1", scaleStartPrice: value },
			{ ...emptyDraft, size: "1", scaleEndPrice: value },
		]) {
			expect(getOrderValidationPresentation(result.errors, { ...ready, draft }).map((error) => error.id)).toContain(
				"enter-price-range",
			);
		}
	});

	it("does not hide typed notional, maximum-size, or Spot balance errors", () => {
		const results = [
			validatePerpOrder(perpContext({ sizeValue: 0.01, orderValue: 1 })),
			validatePerpOrder(perpContext({ sizeValue: 101, orderValue: 10100 })),
			validateSpotOrder(spotContext({ quoteAvailable: 1 })),
		];
		for (const [index, result] of results.entries()) {
			const draft = { ...emptyDraft, size: ["0.01", "101", "10"][index], limitPrice: "100" };
			expect(getOrderValidationPresentation(result.errors, { ...ready, draft })).toHaveLength(1);
			expect(result.canSubmit).toBe(false);
		}
	});

	it.each(["buy", "sell"] as const)("assigns %s TP/SL direction errors to their inline fields", (side) => {
		const tpPrice = side === "buy" ? "90" : "110";
		const slPrice = side === "buy" ? "110" : "90";
		const result = validatePerpOrder(
			perpContext({
				side,
				tpSlEnabled: true,
				canUseTpSl: true,
				tpPriceNum: Number(tpPrice),
				slPriceNum: Number(slPrice),
			}),
		);
		const priceErrors = getTpSlPriceErrors({ assetId: 0, szDecimals: 2, referencePrice: 100, tpPrice, slPrice, side });
		expect(priceErrors).toEqual({ tp: true, sl: true });
		expect(result.errors.map((error) => error.id)).toEqual(["tp-price-invalid", "sl-price-invalid"]);
		expect(result.errors.filter((error) => !isInlineTpSlValidationError(error, priceErrors))).toEqual([]);
		expect(result.canSubmit).toBe(false);
	});

	it("keeps a rounded-to-zero TP price error in the footer when its inline direction error is unavailable", () => {
		const result = validatePerpOrder(perpContext({ tpSlEnabled: true, canUseTpSl: true, tpPriceNum: 0.0000001 }));
		const priceErrors = getTpSlPriceErrors({
			assetId: 0,
			szDecimals: 2,
			referencePrice: 100,
			tpPrice: "0.0000001",
			slPrice: "",
			side: "buy",
		});
		expect(priceErrors).toEqual({ tp: false, sl: false });
		expect(
			result.errors.filter((error) => !isInlineTpSlValidationError(error, priceErrors)).map((error) => error.id),
		).toContain("tp-price-invalid");
		expect(result.canSubmit).toBe(false);
	});

	it("uses the inline error when the price rounds to the entry reference", () => {
		const priceErrors = getTpSlPriceErrors({
			assetId: 0,
			szDecimals: 2,
			referencePrice: 100,
			tpPrice: "100.0001",
			slPrice: "100.0001",
			side: "buy",
		});
		expect(priceErrors).toEqual({ tp: true, sl: true });
	});
});

describe("shared reduce-only form validation", () => {
	it.each(["market", "limit", "stopMarket", "stopLimit", "takeProfitMarket", "takeProfitLimit", "twap", "scale"])(
		"validates %s with zero opening balance",
		(orderType) => {
			const trigger = orderType.startsWith("stop") || orderType.startsWith("takeProfit");
			const context = perpContext({
				orderType,
				reduceOnly: true,
				availableBalance: 0,
				maxSize: 0,
				positionSize: "-2",
				sizeValue: 2,
				orderValue: 200,
				usesTriggerPrice: trigger,
				triggerPriceNum: orderType.startsWith("stop") ? 110 : 90,
				stopOrder: orderType.startsWith("stop"),
				takeProfitOrder: orderType.startsWith("takeProfit"),
				twapOrder: orderType === "twap",
				twapMinutesNum: 30,
				scaleOrder: orderType === "scale",
				scaleStartPriceNum: 90,
				scaleEndPriceNum: 110,
				scaleLevelsNum: 4,
				scaleSkewNum: 1,
			});
			expect(validatePerpOrder(context).errors).toEqual([]);
			for (const positionSize of [null, "0", "2", "-1.99", "NaN"])
				expect(validatePerpOrder({ ...context, positionSize }).canSubmit).toBe(false);
			expect(
				validatePerpOrder({
					...context,
					side: "sell",
					positionSize: "2",
					triggerPriceNum: orderType.startsWith("stop") ? 90 : 110,
				}).canSubmit,
			).toBe(true);
		},
	);
	it("compares the exact intended decimal instead of its Number projection", () => {
		const result = validatePerpOrder(
			perpContext({
				reduceOnly: true,
				side: "sell",
				positionSize: "1234567890.12345677",
				sizeValue: Number("1234567890.12345678"),
				sizeForOrder: "1234567890.12345678",
			}),
		);
		expect(result.errors.map((e) => e.code)).toContain("TRG_007");
	});
});
