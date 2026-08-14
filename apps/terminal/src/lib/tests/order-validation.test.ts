import { describe, expect, it, vi } from "vitest";
import { type PerpOrderContext, validatePerpOrder } from "@/lib/errors/stacks/perp-order";
import { type SpotOrderContext, validateSpotOrder } from "@/lib/errors/stacks/spot-order";

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
		twapOrder: false,
		twapMinutesNum: null,
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
		scaleOrder: false,
		scaleStartPriceNum: null,
		scaleEndPriceNum: null,
		scaleLevelsNum: null,
		twapOrder: false,
		twapMinutesNum: null,
		tpSlEnabled: false,
		canUseTpSl: false,
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

	it("rejects a one-minute TWAP instead of silently clamping it", () => {
		const result = validateSpotOrder(spotContext({ twapOrder: true, twapMinutesNum: 1 }));

		expect(result.errors.map((error) => error.code)).toContain("TWAP_001");
	});
});

describe("reduce-only trigger validation", () => {
	it("fails closed while the selected-market mark stream is unavailable", () => {
		const result = validatePerpOrder(perpContext({ markPriceStatus: "error", requiresLiveMarkPrice: true }));

		expect(result.errors.map((error) => error.code)).toContain("MKT_004");
		expect(result.canSubmit).toBe(false);
	});

	it("blocks a trigger order when no position exists", () => {
		const result = validatePerpOrder(
			perpContext({
				orderType: "stopMarket",
				usesLimitPrice: false,
				usesTriggerPrice: true,
				triggerPriceNum: 95,
				side: "sell",
				stopOrder: true,
				positionSize: 0,
			}),
		);

		expect(result.errors.map((error) => error.code)).toContain("TRG_005");
	});

	it("requires the trigger side to reduce the current position", () => {
		const result = validatePerpOrder(
			perpContext({
				orderType: "stopMarket",
				usesLimitPrice: false,
				usesTriggerPrice: true,
				triggerPriceNum: 105,
				side: "buy",
				stopOrder: true,
				positionSize: 10,
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
			}),
		);

		expect(result.errors.map((error) => error.code)).toContain("TRG_007");
	});
});

describe("attached TP/SL precision validation", () => {
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
