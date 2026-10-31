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

	it("takes a scale order's margin from the value of its levels rather than size × price", () => {
		expect(getOrderMetrics({ sizeValue: 3, price: 60, leverage: 10, scaleOrderValue: 220 })).toEqual({
			marginRequired: 22,
		});
		expect(getOrderMetrics({ sizeValue: 3, price: 60, leverage: 10, scaleOrderValue: undefined })).toEqual({
			marginRequired: 18,
		});
		expect(
			getOrderMetrics({ sizeValue: 3, price: 60, leverage: 10, reduceOnly: true, scaleOrderValue: 220 }).marginRequired,
		).toBeNull();
	});
});
