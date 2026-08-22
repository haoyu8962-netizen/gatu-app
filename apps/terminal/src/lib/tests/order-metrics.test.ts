import { describe, expect, it } from "vitest";
import { getOrderMetrics } from "@/domain/trade/order/metrics";

describe("order margin metrics", () => {
	it("derives required margin from notional and leverage", () => {
		expect(getOrderMetrics({ sizeValue: 0.25, price: 40_000, leverage: 10 })).toEqual({ marginRequired: 1_000 });
	});

	it("uses decimal arithmetic rather than binary floating-point multiplication", () => {
		expect(getOrderMetrics({ sizeValue: 0.3, price: 0.2, leverage: 3 })).toEqual({ marginRequired: 0.02 });
	});

	it("returns zero when leverage or numeric order inputs are unavailable", () => {
		expect(getOrderMetrics({ sizeValue: 1, price: 100, leverage: null })).toEqual({ marginRequired: 0 });
		expect(getOrderMetrics({ sizeValue: Number.NaN, price: 100, leverage: 10 })).toEqual({ marginRequired: 0 });
	});
});
