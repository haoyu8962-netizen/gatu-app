import type { UnifiedMarket } from "@gatu/hl-react";
import { describe, expect, it } from "vitest";
import { applyMarketFeeScale, applyReferralDiscountToFeeRate, getHip3DeployerFeeScale } from "@/domain/trade/fees";

function createBuilderPerpMarket(overrides: { deployerFeeScale: string; growthMode?: "enabled" }): UnifiedMarket {
	return {
		kind: "builderPerp",
		name: "xyz:NFLX",
		dex: "xyz",
		...overrides,
	} as UnifiedMarket;
}

function createSpotMarket(isStablePair: boolean): UnifiedMarket {
	return {
		kind: "spot",
		name: "@1",
		isStablePair,
	} as UnifiedMarket;
}

describe("trade fee rates", () => {
	it("applies the active referral discount to positive user fee rates", () => {
		expect(applyReferralDiscountToFeeRate("0.0007", "0.04")).toBe(0.000672);
	});

	it("does not reduce maker rebates", () => {
		expect(applyReferralDiscountToFeeRate("-0.00001", "0.04")).toBe(-0.00001);
	});

	it("rejects invalid fee rates and bounds invalid discounts", () => {
		expect(applyReferralDiscountToFeeRate(undefined, "0.04")).toBeNull();
		expect(applyReferralDiscountToFeeRate("0.0007", "2")).toBe(0);
	});
});

describe("HIP-3 deployer fee scale", () => {
	it("adds one to sub-unit scales and doubles scales of one or more", () => {
		expect(getHip3DeployerFeeScale("0.1111").toNumber()).toBe(1.1111);
		expect(getHip3DeployerFeeScale("1.0").toNumber()).toBe(2);
		expect(getHip3DeployerFeeScale("3.0").toNumber()).toBe(6);
		expect(getHip3DeployerFeeScale("0").toNumber()).toBe(1);
	});

	it("falls back to neutral scale for missing or invalid values", () => {
		expect(getHip3DeployerFeeScale(undefined).toNumber()).toBe(1);
		expect(getHip3DeployerFeeScale("-1").toNumber()).toBe(1);
	});
});

describe("market fee scaling", () => {
	it("matches the official terminal for growth-mode HIP-3 markets", () => {
		const market = createBuilderPerpMarket({ deployerFeeScale: "1.0", growthMode: "enabled" });
		expect(applyMarketFeeScale(0.00045, market)).toBe(0.00009);
		expect(applyMarketFeeScale(0.00015, market)).toBe(0.00003);
	});

	it("scales non-growth HIP-3 markets by the deployer fee scale only", () => {
		const market = createBuilderPerpMarket({ deployerFeeScale: "0.1111" });
		expect(applyMarketFeeScale(0.00045, market)).toBe(0.000499995);
		const doubled = createBuilderPerpMarket({ deployerFeeScale: "3.0" });
		expect(applyMarketFeeScale(0.00045, doubled)).toBe(0.0027);
	});

	it("keeps growth-mode scaling but skips the deployer scale for maker rebates", () => {
		const market = createBuilderPerpMarket({ deployerFeeScale: "1.0", growthMode: "enabled" });
		expect(applyMarketFeeScale(-0.00001, market)).toBe(-0.000001);
	});

	it("applies the stable-pair scale to quote-asset spot pairs only", () => {
		expect(applyMarketFeeScale(0.0007, createSpotMarket(true))).toBe(0.00014);
		expect(applyMarketFeeScale(0.0004, createSpotMarket(true))).toBe(0.00008);
		expect(applyMarketFeeScale(0.0007, createSpotMarket(false))).toBe(0.0007);
	});

	it("passes native perp rates and missing markets through unchanged", () => {
		expect(applyMarketFeeScale(0.00045, { kind: "perp", name: "ZEC" } as UnifiedMarket)).toBe(0.00045);
		expect(applyMarketFeeScale(0.00045, undefined)).toBe(0.00045);
	});
});
