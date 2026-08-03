import { describe, expect, it } from "vitest";
import {
	buildIsolatedMarginAmountParameters,
	buildIsolatedMarginTargetParameters,
	calculateEffectiveLeverage,
	canRemoveIsolatedMargin,
	getPerpMarginConstraint,
} from "@/domain/trade/isolated-margin";

describe("isolated margin actions", () => {
	it("encodes exact USDC additions as signed six-decimal integers", () => {
		expect(
			buildIsolatedMarginAmountParameters({
				assetId: 120_000,
				isLong: true,
				direction: "add",
				amount: "12.345678",
			}),
		).toEqual({
			asset: 120_000,
			isBuy: true,
			ntli: 12_345_678,
		});

		expect(
			buildIsolatedMarginAmountParameters({
				assetId: 120_000,
				isLong: false,
				direction: "remove",
				amount: "0.000001",
			}),
		).toEqual({
			asset: 120_000,
			isBuy: false,
			ntli: -1,
		});
	});

	it("rejects zero, excess precision, and unsafe micro-USD values", () => {
		const base = {
			assetId: 0,
			isLong: true,
			direction: "add" as const,
		};

		expect(buildIsolatedMarginAmountParameters({ ...base, amount: "0" })).toBeNull();
		expect(buildIsolatedMarginAmountParameters({ ...base, amount: "1.0000001" })).toBeNull();
		expect(buildIsolatedMarginAmountParameters({ ...base, amount: "9007199254.740992" })).toBeNull();
	});

	it("normalizes target leverage without converting through JavaScript floats", () => {
		expect(buildIsolatedMarginTargetParameters(110_000, "05.0000")).toEqual({
			asset: 110_000,
			leverage: "5",
		});
		expect(buildIsolatedMarginTargetParameters(110_000, "0.5")).toEqual({
			asset: 110_000,
			leverage: "0.5",
		});
		expect(buildIsolatedMarginTargetParameters(110_000, "0")).toBeNull();
		expect(buildIsolatedMarginTargetParameters(110_000, "-1")).toBeNull();
	});

	it("derives effective leverage with decimal arithmetic", () => {
		const effectiveLeverage = calculateEffectiveLeverage("1559.84", "137.19");

		expect(effectiveLeverage).toBeCloseTo(11.3699, 4);
	});

	it("fails closed for legacy isolated-only markets and permits noCross removal", () => {
		expect(getPerpMarginConstraint({ marginMode: "noCross", onlyIsolated: true })).toBe("noCross");
		expect(getPerpMarginConstraint({ onlyIsolated: true })).toBe("strictIsolated");
		expect(getPerpMarginConstraint(undefined)).toBeUndefined();

		expect(canRemoveIsolatedMargin("strictIsolated")).toBe(false);
		expect(canRemoveIsolatedMargin("noCross")).toBe(true);
		expect(canRemoveIsolatedMargin(undefined)).toBe(true);
	});
});
