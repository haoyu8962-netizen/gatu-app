import { describe, expect, it } from "vitest";
import { buildPositionReverseOrder } from "@/domain/trade/position-reverse";

describe("buildPositionReverseOrder", () => {
	it("doubles a large long position without converting through JavaScript number", () => {
		const plan = buildPositionReverseOrder({
			assetId: 31,
			signedPositionSize: "9007199254740993.123",
			szDecimals: 3,
			referencePx: "100",
			slippageBps: "50",
		});

		expect(plan.errors).toEqual([]);
		expect(plan.reverseSize).toBe("18014398509481986.246");
		expect(plan.orders).toEqual([
			{
				a: 31,
				b: false,
				p: "99.5",
				s: "18014398509481986.246",
				r: false,
				t: { limit: { tif: "FrontendMarket" } },
			},
		]);
	});

	it("uses the opposite buy side for a short position", () => {
		const plan = buildPositionReverseOrder({
			assetId: 31,
			signedPositionSize: "-0.125",
			szDecimals: 3,
			referencePx: "100",
			slippageBps: "50",
		});

		expect(plan.errors).toEqual([]);
		expect(plan.side).toBe("buy");
		expect(plan.orders[0]).toMatchObject({ b: true, p: "100.5", s: "0.25", r: false });
	});

	it("fails instead of truncating abs(szi) * 2 at the market precision", () => {
		const plan = buildPositionReverseOrder({
			assetId: 31,
			signedPositionSize: "0.0004",
			szDecimals: 3,
			referencePx: "100",
			slippageBps: "50",
		});

		expect(plan.orders).toEqual([]);
		expect(plan.errors).toEqual(["position-size-below-precision"]);
	});

	it.each([
		["position", { signedPositionSize: "NaN" }, "invalid-position-size"],
		["price", { referencePx: "0" }, "invalid-reference-price"],
		["slippage", { slippageBps: "501" }, "invalid-slippage"],
	] as const)("rejects an invalid %s decimal string", (_label, override, expectedError) => {
		const plan = buildPositionReverseOrder({
			assetId: 31,
			signedPositionSize: "1.25",
			szDecimals: 3,
			referencePx: "100",
			slippageBps: "50",
			...override,
		});

		expect(plan.orders).toEqual([]);
		expect(plan.errors).toContain(expectedError);
	});
});
