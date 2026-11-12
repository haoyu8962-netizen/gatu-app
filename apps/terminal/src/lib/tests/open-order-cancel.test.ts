import { ApiRequestError } from "@nktkas/hyperliquid";
import { describe, expect, it, vi } from "vitest";
import {
	buildOpenOrderCancelActions,
	getPartialOpenOrderCancel,
	isConfirmedOpenOrderCancelResponse,
	isConfirmedTwapCancelResponse,
	resolveOpenOrderCancelAssetId,
	resolveOpenOrderCancelResponse,
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

	it("accepts a TWAP termination only from the exact success response", () => {
		expect(
			isConfirmedTwapCancelResponse({ status: "ok", response: { type: "twapCancel", data: { status: "success" } } }),
		).toBe(true);
		for (const response of [
			undefined,
			{ status: "ok", response: { type: "default" } },
			{ status: "ok", response: { type: "twapCancel", data: { status: "pending" } } },
			{ status: "ok", response: { type: "twapCancel", data: { status: { error: "TWAP 1 is not active" } } } },
			{ status: "ok", response: { type: "cancel", data: { status: "success" } } },
			{ status: "err", response: { type: "twapCancel", data: { status: "success" } } },
		]) {
			expect(isConfirmedTwapCancelResponse(response)).toBe(false);
		}
	});
});

describe("open order cancel response resolution", () => {
	const rejection = "Order was never placed, already canceled, or filled.";
	function cancelResponse(statuses: unknown[]) {
		return { status: "ok", response: { type: "cancel", data: { statuses } } };
	}

	it("counts each status as the official terminal does: all success, a mix, or none", () => {
		expect(resolveOpenOrderCancelResponse(cancelResponse(["success", "success"]), 2)).toEqual({
			status: "accepted",
			totalCount: 2,
			acceptedIndexes: [0, 1],
			errors: [],
		});
		expect(resolveOpenOrderCancelResponse(cancelResponse(["success", { error: rejection }, "success"]), 3)).toEqual({
			status: "partial",
			totalCount: 3,
			acceptedIndexes: [0, 2],
			errors: [{ index: 1, text: rejection }],
		});
		expect(resolveOpenOrderCancelResponse(cancelResponse([{ error: "a" }, { error: "b" }]), 2)).toEqual({
			status: "rejected",
			totalCount: 2,
			acceptedIndexes: [],
			errors: [
				{ index: 0, text: "a" },
				{ index: 1, text: "b" },
			],
		});
	});

	it("rejects the whole batch on a top-level error or one error for several cancels", () => {
		expect(
			resolveOpenOrderCancelResponse({ status: "err", response: "User or API Wallet does not exist." }, 2),
		).toEqual({
			status: "rejected",
			totalCount: 2,
			acceptedIndexes: [],
			errors: [{ text: "User or API Wallet does not exist." }],
		});
		expect(resolveOpenOrderCancelResponse(cancelResponse([{ error: rejection }]), 2)).toEqual({
			status: "rejected",
			totalCount: 2,
			acceptedIndexes: [],
			errors: [{ text: rejection }],
		});
	});

	it("leaves statuses it cannot match to the submitted cancels unresolved", () => {
		for (const response of [
			cancelResponse(["success"]),
			cancelResponse(["success", "success", "success"]),
			cancelResponse(["success", "waiting"]),
			cancelResponse(["success", { error: "" }]),
			{ status: "ok", response: { type: "order", data: { statuses: ["success", "success"] } } },
			{ status: "err", response: { message: "not text" } },
			null,
		]) {
			expect(resolveOpenOrderCancelResponse(response, 2)).toBeNull();
		}
		expect(resolveOpenOrderCancelResponse(cancelResponse([]), 0)).toBeNull();
	});

	it("reads a partial batch only from the SDK's response error", () => {
		const partial = cancelResponse(["success", { error: rejection }]);
		expect(getPartialOpenOrderCancel(new ApiRequestError(partial as never, "cancel 1"), 2)?.acceptedIndexes).toEqual([
			0,
		]);
		expect(
			getPartialOpenOrderCancel(new ApiRequestError(cancelResponse([{ error: "a" }, { error: "b" }]) as never, "x"), 2),
		).toBeNull();
		expect(
			getPartialOpenOrderCancel(new ApiRequestError(cancelResponse(["success", "success"]) as never, "x"), 2),
		).toBeNull();
		expect(getPartialOpenOrderCancel(new Error("network"), 2)).toBeNull();
	});
});
