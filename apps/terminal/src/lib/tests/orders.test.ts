import Big from "big.js";
import { describe, expect, it, vi } from "vitest";
import {
	buildFrontendMarketOrder,
	createScaleOrderLevelPlan,
	formatPriceForInput,
	formatPriceForOrder,
	formatSizeForOrder,
	getDefaultLeverage,
	resolveScaleSkewNumber,
} from "@/domain/trade/orders";

vi.mock("@lingui/core/macro", () => ({
	msg: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
		if (typeof strings === "string") return strings;
		return strings.reduce((message, part, index) => `${message}${part}${values[index] ?? ""}`, "");
	},
	t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
		if (typeof strings === "string") return strings;
		return strings.reduce((message, part, index) => `${message}${part}${values[index] ?? ""}`, "");
	},
}));

describe("orders", () => {
	it("chooses smart leverage defaults", () => {
		expect(getDefaultLeverage(5)).toBe(5);
		expect(getDefaultLeverage(6)).toBe(3);
		expect(getDefaultLeverage(50)).toBe(25);
	});

	it("formats order prices with 5 significant figures", () => {
		expect(formatPriceForOrder(100)).toBe("100");
		expect(formatPriceForOrder(1234.56)).toBe("1234.6");
		expect(formatPriceForOrder(0.012345)).toBe("0.012345");
	});

	it("formats prices precisely without float rounding error", () => {
		// half-up at the 5th significant figure: the old float impl rounded down to "1.2345"
		expect(formatPriceForOrder(1.23455)).toBe("1.2346");
		// exact powers of 10 (Math.log10(1000) is 2.999… in JS)
		expect(formatPriceForOrder(1000)).toBe("1000");
		expect(formatPriceForOrder(10000)).toBe("10000");
		// accepts strings/Big directly, no .toNumber() precision loss
		expect(formatPriceForOrder("1234.56")).toBe("1234.6");
		// sub-1 keeps 5 sig figs, capped at HL max decimals
		expect(formatPriceForOrder(0.00012345)).toBe("0.00012345");
		// integer prices are allowed beyond 5 sig figs
		expect(formatPriceForOrder(123456)).toBe("123456");
		// non-positive / invalid → "0"
		expect(formatPriceForOrder(0)).toBe("0");
		expect(formatPriceForOrder(null)).toBe("0");
	});

	it("applies market-specific price decimal caps", () => {
		expect(formatPriceForOrder("0.012345", { assetId: 0, szDecimals: 1 })).toBe("0.01235");
		expect(formatPriceForOrder("0.012345", { assetId: 10000, szDecimals: 1 })).toBe("0.012345");
		expect(formatPriceForOrder("0.00012345", { assetId: 0, szDecimals: 0 })).toBe("0.000123");
		expect(formatPriceForOrder("0.00012345", { assetId: 10000, szDecimals: 0 })).toBe("0.00012345");
		expect(formatPriceForOrder(123456, { assetId: 0, szDecimals: 5 })).toBe("123456");
	});

	it.each([
		["buy", "0.5", "100"],
		["sell", "0.05", "100"],
	] as const)(
		"rounds %s FrontendMarket protection prices inside the configured slippage boundary",
		(side, slippageBps, price) => {
			const order = buildFrontendMarketOrder({
				assetId: 0,
				side,
				size: "1",
				szDecimals: 3,
				markPx: "100",
				slippageBps,
				reduceOnly: true,
			});

			expect(order.p).toBe(price);
		},
	);

	it("keeps half-up rounding for non-FrontendMarket price formatting", () => {
		expect(formatPriceForOrder("100.005", { assetId: 0, szDecimals: 3 })).toBe("100.01");
		expect(formatPriceForOrder("99.9995", { assetId: 0, szDecimals: 3 })).toBe("100");
	});

	it("formats order sizes using size decimals", () => {
		expect(formatSizeForOrder(1.234567, 3)).toBe("1.234");
		expect(formatSizeForOrder(1.2, 0)).toBe("1");
	});

	it("fails closed for invalid market precision", () => {
		expect(formatSizeForOrder("1.23", -1)).toBe("0");
		expect(formatSizeForOrder("1.23", 9)).toBe("0");
		expect(formatPriceForOrder("1.23", { assetId: 0, szDecimals: 7 })).toBe("0");
		expect(formatPriceForOrder("1.23", { assetId: 10_000, szDecimals: 9 })).toBe("0");
	});

	it("keeps integer trailing zeros when size decimals are zero", () => {
		expect(formatSizeForOrder(100, 0)).toBe("100");
		expect(formatSizeForOrder(1000000, 0)).toBe("1000000");
		expect(formatSizeForOrder(10, 0)).toBe("10");
		expect(formatSizeForOrder(0, 0)).toBe("0");
		expect(formatSizeForOrder(100, 2)).toBe("100");
		expect(formatSizeForOrder(1.2, 2)).toBe("1.2");
	});
});

describe("price field fills", () => {
	it("fills the order's price at the decimals the official terminal shows", () => {
		expect(formatPriceForInput("85.8099", { assetId: 7, szDecimals: 2 })).toBe("85.810");
		expect(formatPriceForInput("77559.5", { assetId: 0, szDecimals: 5 })).toBe("77560");
		expect(formatPriceForInput("0.0012345", { assetId: 10_000, szDecimals: 2 })).toBe("0.001235");
		expect(formatPriceForInput("170", { assetId: 0, szDecimals: 3 })).toBe("170.00");
		expect(formatPriceForOrder("170.00", { assetId: 0, szDecimals: 3 })).toBe("170");
		expect(formatPriceForInput("1.23", { assetId: 0, szDecimals: 7 })).toBe("0");
		for (const missing of [undefined, null, ""]) {
			expect(formatPriceForInput(missing, { assetId: 0, szDecimals: 3 })).toBe("");
		}
	});
});

describe("scale order planning", () => {
	it("rejects invalid precision before Big.js exponent arithmetic", () => {
		expect(
			createScaleOrderLevelPlan({
				assetId: 0,
				sizeValue: 1,
				szDecimals: -1,
				scaleStartPriceInput: "10",
				scaleEndPriceInput: "20",
				scaleLevelsNum: 2,
				scaleSkew: 1,
			}),
		).toEqual({ levels: [], issues: ["invalid-precision"] });
	});

	it("distributes size units without dropping the remainder", () => {
		const plan = createScaleOrderLevelPlan({
			assetId: 0,
			sizeValue: 7,
			szDecimals: 0,
			scaleStartPriceInput: "10",
			scaleEndPriceInput: "30",
			scaleLevelsNum: 4,
			scaleSkew: 1,
		});

		expect(plan.issues).toEqual([]);
		expect(plan.levels.map((level) => level.size)).toEqual(["2", "2", "2", "1"]);
		expect(plan.levels.reduce((total, level) => total.plus(level.size), Big(0)).toString()).toBe("7");
	});

	it("rejects a size that cannot allocate one lot to every level", () => {
		const plan = createScaleOrderLevelPlan({
			assetId: 0,
			sizeValue: 3,
			szDecimals: 0,
			scaleStartPriceInput: "10",
			scaleEndPriceInput: "30",
			scaleLevelsNum: 4,
			scaleSkew: 1,
		});

		expect(plan.issues).toContain("insufficient-size");
		expect(plan.levels).toEqual([]);
	});

	it("checks minimum notional on every formatted level", () => {
		const plan = createScaleOrderLevelPlan({
			assetId: 0,
			sizeValue: 2,
			szDecimals: 1,
			scaleStartPriceInput: "10",
			scaleEndPriceInput: "30",
			scaleLevelsNum: 4,
			scaleSkew: 1,
		});

		expect(plan.issues).toContain("min-notional");
		expect(plan.levels[0]?.notional).toBe("5");
	});

	it("rejects distinct inputs that collapse to the same protocol tick", () => {
		const plan = createScaleOrderLevelPlan({
			assetId: 0,
			sizeValue: 4,
			szDecimals: 0,
			scaleStartPriceInput: "100.001",
			scaleEndPriceInput: "100.004",
			scaleLevelsNum: 4,
			scaleSkew: 1,
		});

		expect(plan.issues).toContain("duplicate-price");
	});

	it("rejects out-of-range levels instead of clamping them", () => {
		const plan = createScaleOrderLevelPlan({
			assetId: 0,
			sizeValue: 100,
			szDecimals: 0,
			scaleStartPriceInput: "10",
			scaleEndPriceInput: "30",
			scaleLevelsNum: 21,
			scaleSkew: 1,
		});

		expect(plan).toEqual({ levels: [], issues: ["invalid-levels"] });
	});
});

describe("scale order size skew", () => {
	function skewedPlan(scaleSkew: string | number | null, sizeValue = 8) {
		return createScaleOrderLevelPlan({
			assetId: 0,
			sizeValue,
			szDecimals: 0,
			scaleStartPriceInput: "10",
			scaleEndPriceInput: "30",
			scaleLevelsNum: 4,
			scaleSkew,
		});
	}

	function sizes(plan: ReturnType<typeof createScaleOrderLevelPlan>): Big[] {
		return plan.levels.map((level) => Big(level.size));
	}

	it("keeps the equal split when the skew is one", () => {
		const plan = skewedPlan(1, 7);

		expect(plan.issues).toEqual([]);
		expect(plan.levels.map((level) => level.size)).toEqual(["2", "2", "2", "1"]);
	});

	it("defaults an empty skew to the equal split", () => {
		expect(skewedPlan(null, 7).levels.map((level) => level.size)).toEqual(["2", "2", "2", "1"]);
		expect(skewedPlan("", 7).levels.map((level) => level.size)).toEqual(["2", "2", "2", "1"]);
	});

	it("ramps sizes up so the last level is skew times the first while preserving the total", () => {
		const plan = skewedPlan(3);
		const levelSizes = sizes(plan);

		expect(plan.issues).toEqual([]);
		expect(plan.levels.map((level) => level.size)).toEqual(["1", "2", "2", "3"]);
		expect(levelSizes.reduce((total, size) => total.plus(size), Big(0)).toString()).toBe("8");
		expect(levelSizes[3].div(levelSizes[0]).minus(3).abs().lte(1)).toBe(true);
		for (let index = 1; index < levelSizes.length; index += 1) {
			expect(levelSizes[index].gte(levelSizes[index - 1])).toBe(true);
		}
	});

	it("ramps sizes down when the skew is below one", () => {
		const plan = skewedPlan("0.5");
		const levelSizes = sizes(plan);

		expect(plan.issues).toEqual([]);
		expect(levelSizes.reduce((total, size) => total.plus(size), Big(0)).toString()).toBe("8");
		for (let index = 1; index < levelSizes.length; index += 1) {
			expect(levelSizes[index].lte(levelSizes[index - 1])).toBe(true);
		}
	});

	it("preserves the total in fractional size units", () => {
		const plan = createScaleOrderLevelPlan({
			assetId: 0,
			sizeValue: "1.234",
			szDecimals: 3,
			scaleStartPriceInput: "100",
			scaleEndPriceInput: "200",
			scaleLevelsNum: 5,
			scaleSkew: "2.5",
		});

		expect(plan.issues).toEqual([]);
		expect(plan.levels.reduce((total, level) => total.plus(level.size), Big(0)).toString()).toBe("1.234");
		expect(plan.levels.every((level) => /^\d+(\.\d{1,3})?$/.test(level.size))).toBe(true);
	});

	it("rejects a zero or negative skew", () => {
		expect(skewedPlan(0)).toEqual({ levels: [], issues: ["invalid-skew"] });
		expect(skewedPlan(-1)).toEqual({ levels: [], issues: ["invalid-skew"] });
		expect(skewedPlan("abc")).toEqual({ levels: [], issues: ["invalid-skew"] });
	});

	it("reports a skew that starves the smallest level of a full lot as a skew problem", () => {
		expect(skewedPlan(100)).toEqual({ levels: [], issues: ["insufficient-size-for-skew"] });
		expect(skewedPlan("0.01")).toEqual({ levels: [], issues: ["insufficient-size-for-skew"] });
	});

	it("still reports a total below one lot per level as insufficient size", () => {
		expect(skewedPlan(100, 3)).toEqual({ levels: [], issues: ["insufficient-size"] });
	});

	it("resolves the skew input the same way for validation and submission", () => {
		expect(resolveScaleSkewNumber("")).toBe(1);
		expect(resolveScaleSkewNumber("2.5")).toBe(2.5);
		expect(resolveScaleSkewNumber("0.0001")).toBe(0.0001);
		expect(resolveScaleSkewNumber("0")).toBeNull();
		expect(resolveScaleSkewNumber("-1")).toBeNull();
		expect(resolveScaleSkewNumber("abc")).toBeNull();
	});
});
