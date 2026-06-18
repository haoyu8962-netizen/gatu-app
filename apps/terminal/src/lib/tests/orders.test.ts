import { describe, expect, it } from "vitest";
import { formatPriceForOrder, formatSizeForOrder, getDefaultLeverage } from "@/domain/trade/orders";

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

	it("formats order sizes using size decimals", () => {
		expect(formatSizeForOrder(1.234567, 3)).toBe("1.234");
		expect(formatSizeForOrder(1.2, 0)).toBe("1");
	});
});
