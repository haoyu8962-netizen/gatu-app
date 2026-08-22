import { describe, expect, it, vi } from "vitest";
import {
	buildOpenOrderCancelActions,
	isConfirmedOpenOrderCancelResponse,
	resolveOpenOrderCancelAssetId,
} from "@/domain/trade/open-order-cancel";

describe("open order cancellation asset binding", () => {
	it("uses market metadata for standard assets and the official encoding for outcomes", () => {
		const getMarketAssetId = vi.fn((coin: string) => (coin === "xyz:ORCL" ? 120_001 : undefined));

		expect(resolveOpenOrderCancelAssetId("xyz:ORCL", getMarketAssetId)).toBe(120_001);
		expect(resolveOpenOrderCancelAssetId("#10", getMarketAssetId)).toBe(100_000_010);
		expect(getMarketAssetId).toHaveBeenCalledOnce();
	});

	it("builds a mixed standard and outcome cancel batch without reordering", () => {
		expect(
			buildOpenOrderCancelActions(
				[
					{ coin: "xyz:ORCL", oid: 42 },
					{ coin: "#11", oid: 43 },
				],
				(coin) => (coin === "xyz:ORCL" ? 120_001 : undefined),
			),
		).toEqual([
			{ a: 120_001, o: 42 },
			{ a: 100_000_011, o: 43 },
		]);
	});

	it.each(["#", "#01", "#12", "#-10", "#9007199254740991"])(
		"fails closed for malformed outcome coin %s even if the market resolver has a fallback",
		(coin) => {
			expect(buildOpenOrderCancelActions([{ coin, oid: 42 }], () => 120_001)).toBeNull();
		},
	);

	it("fails closed for invalid market IDs and order IDs", () => {
		expect(buildOpenOrderCancelActions([{ coin: "BTC", oid: 42 }], () => undefined)).toBeNull();
		expect(buildOpenOrderCancelActions([{ coin: "BTC", oid: 42 }], () => Number.NaN)).toBeNull();
		expect(buildOpenOrderCancelActions([{ coin: "BTC", oid: -1 }], () => 0)).toBeNull();
		expect(buildOpenOrderCancelActions([{ coin: "BTC", oid: 1.5 }], () => 0)).toBeNull();
	});
});

describe("open order cancel responses", () => {
	it("accepts only an exact vector of official cancel success statuses", () => {
		expect(
			isConfirmedOpenOrderCancelResponse(
				{ status: "ok", response: { type: "cancel", data: { statuses: ["success", "success"] } } },
				2,
			),
		).toBe(true);
	});

	it.each([
		{},
		{ status: "err", response: "failed" },
		{ status: "ok", response: { type: "order", data: { statuses: ["success"] } } },
		{ status: "ok", response: { type: "cancel", data: { statuses: [] } } },
		{ status: "ok", response: { type: "cancel", data: { statuses: [{}] } } },
	])("rejects malformed, mismatched, and non-success responses", (response) => {
		expect(isConfirmedOpenOrderCancelResponse(response, 1)).toBe(false);
	});
});
