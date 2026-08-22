import { HttpRequestError } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import {
	createClientOrderId,
	getOrderIntentKey,
	getReconciliationDelayMs,
	isAcceptedOrderStatus,
	isAmbiguousOrderRequestError,
	isCanceledOrderStatus,
	resolveFilledOrderBatchResponse,
	resolveOrderBatchResponse,
	type TrackedOrderParams,
	trackOrderRequest,
} from "@/domain/trade/order-tracking";

function createParams(orderCount = 1): TrackedOrderParams {
	return {
		grouping: "na",
		orders: Array.from({ length: orderCount }, (_, index) => ({
			a: index,
			b: true,
			p: "10",
			r: false,
			s: "1",
			t: { limit: { tif: "Gtc" as const } },
		})),
	};
}

describe("order tracking", () => {
	it("creates SDK-compatible 128-bit client order IDs", () => {
		const ids = new Set(Array.from({ length: 100 }, createClientOrderId));
		expect(ids.size).toBe(100);
		for (const id of ids) expect(id).toMatch(/^0x[a-f0-9]{32}$/);
	});

	it("adds a unique cloid to every child without mutating the order plan", () => {
		const params = createParams(20);
		const tracked = trackOrderRequest(params);

		expect(params.orders.every((order) => order.c === undefined)).toBe(true);
		expect(new Set(tracked.children.map((child) => child.cloid)).size).toBe(20);
		expect(tracked.params.orders.map((order) => order.c)).toEqual(tracked.children.map((child) => child.cloid));
	});

	it("keeps the logical intent key stable when only cloids change", () => {
		const params = createParams();
		const first = trackOrderRequest(params).params;
		const second = trackOrderRequest(params).params;

		expect(first.orders[0]?.c).not.toBe(second.orders[0]?.c);
		expect(getOrderIntentKey(first)).toBe(getOrderIntentKey(second));
	});

	it("rejects duplicate caller-provided cloids in a batch", () => {
		const params = createParams(2);
		const cloid = createClientOrderId();
		params.orders = params.orders.map((order) => ({ ...order, c: cloid }));

		expect(() => trackOrderRequest(params)).toThrow("Duplicate client order ID");
	});

	it("classifies only accepted exchange states as successful reconciliation", () => {
		expect(isAcceptedOrderStatus("open")).toBe(true);
		expect(isAcceptedOrderStatus("filled")).toBe(true);
		expect(isAcceptedOrderStatus("triggered")).toBe(true);
		expect(isAcceptedOrderStatus("rejected")).toBe(false);
		expect(isAcceptedOrderStatus("perpMarginRejected")).toBe(false);
	});

	it("distinguishes accepted-then-canceled states from placement rejections", () => {
		expect(isCanceledOrderStatus("canceled")).toBe(true);
		expect(isCanceledOrderStatus("marginCanceled")).toBe(true);
		expect(isCanceledOrderStatus("siblingFilledCanceled")).toBe(true);
		expect(isCanceledOrderStatus("scheduledCancel")).toBe(true);
		expect(isCanceledOrderStatus("outcomeSettledCanceled")).toBe(true);
		expect(isCanceledOrderStatus("internalCancel")).toBe(true);
		expect(isCanceledOrderStatus("rejected")).toBe(false);
		expect(isCanceledOrderStatus("perpMarginRejected")).toBe(false);
		expect(isCanceledOrderStatus("tooManyOpenOrdersRejected")).toBe(false);
		expect(isCanceledOrderStatus("filled")).toBe(false);
	});

	it("backs off reconciliation checks with a 30 second cap", () => {
		expect(getReconciliationDelayMs(0)).toBe(2_000);
		expect(getReconciliationDelayMs(3)).toBe(16_000);
		expect(getReconciliationDelayMs(10)).toBe(30_000);
	});

	it("only reconciles transport outcomes that may have reached the exchange", () => {
		expect(isAmbiguousOrderRequestError(new HttpRequestError({ detail: "Request timed out" }))).toBe(true);
		expect(
			isAmbiguousOrderRequestError(Object.assign(new Error("Request timed out"), { name: "HttpRequestError" })),
		).toBe(true);
		expect(
			isAmbiguousOrderRequestError(
				new HttpRequestError({ response: new Response("gateway failure", { status: 503 }) }),
			),
		).toBe(true);
		expect(
			isAmbiguousOrderRequestError(new HttpRequestError({ response: new Response("bad request", { status: 400 }) })),
		).toBe(false);
		expect(
			isAmbiguousOrderRequestError(new HttpRequestError({ response: new Response("rate limited", { status: 429 }) })),
		).toBe(false);
	});

	it("preserves partial batch acceptance from the SDK error response", () => {
		const resolution = resolveOrderBatchResponse(
			{
				status: "ok",
				response: {
					type: "order",
					data: {
						statuses: [
							{ resting: { oid: 1 } },
							{ error: "Order must have minimum value of $10." },
							"waitingForTrigger",
						],
					},
				},
			},
			3,
		);

		expect(resolution).toEqual({
			status: "partial",
			totalCount: 3,
			acceptedCount: 2,
			rejectedCount: 1,
			errors: ["Order 2: Order must have minimum value of $10."],
		});
	});

	it("treats a single batch prevalidation error as rejection of every child", () => {
		const resolution = resolveOrderBatchResponse(
			{
				status: "ok",
				response: { type: "order", data: { statuses: [{ error: "Invalid order request" }] } },
			},
			4,
		);

		expect(resolution).toEqual({
			status: "rejected",
			totalCount: 4,
			acceptedCount: 0,
			rejectedCount: 4,
			errors: ["Invalid order request"],
		});
	});

	it("leaves malformed status vectors for cloid reconciliation", () => {
		const resolution = resolveOrderBatchResponse(
			{
				status: "ok",
				response: { type: "order", data: { statuses: [{ resting: { oid: 1 } }] } },
			},
			2,
		);

		expect(resolution).toBeNull();
	});

	it.each([[{}], ["success"], [{ resting: { oid: -1 } }], [{ filled: { oid: 1, totalSz: "1" } }]])(
		"does not treat malformed or cancel-only statuses as accepted orders",
		(statuses) => {
			expect(
				resolveOrderBatchResponse({ status: "ok", response: { type: "order", data: { statuses } } }, 1),
			).toBeNull();
		},
	);

	it("rejects a non-order response even when its status entries look order-shaped", () => {
		expect(
			resolveOrderBatchResponse(
				{ status: "ok", response: { type: "cancel", data: { statuses: [{ resting: { oid: 1 } }] } } },
				1,
			),
		).toBeNull();
	});

	it("rejects a non-ok response even when its payload looks order-shaped", () => {
		expect(
			resolveOrderBatchResponse(
				{ status: "err", response: { type: "order", data: { statuses: [{ resting: { oid: 1 } }] } } },
				1,
			),
		).toBeNull();
	});

	it("requires every filled child to report the complete submitted size", () => {
		const resolution = resolveFilledOrderBatchResponse(
			{
				status: "ok",
				response: {
					type: "order",
					data: {
						statuses: [
							{ filled: { totalSz: "1.250", avgPx: "10", oid: 1 } },
							{ filled: { totalSz: "0.4", avgPx: "11", oid: 2 } },
						],
					},
				},
			},
			["1.25", "1"],
		);

		expect(resolution).toEqual({
			status: "partial",
			totalCount: 2,
			acceptedCount: 1,
			rejectedCount: 1,
			errors: ["Order 2: filled 0.4 of 1."],
		});
	});

	it("keeps mixed terminal and non-terminal filled-mode statuses in reconciliation", () => {
		expect(
			resolveFilledOrderBatchResponse(
				{
					status: "ok",
					response: {
						type: "order",
						data: { statuses: [{ resting: { oid: 1 } }, { error: "Rejected" }] },
					},
				},
				["1", "1"],
			),
		).toBeNull();
	});

	it("accepts a filled batch only when every exact size is terminal", () => {
		expect(
			resolveFilledOrderBatchResponse(
				{
					status: "ok",
					response: {
						type: "order",
						data: {
							statuses: [
								{ filled: { totalSz: "2", avgPx: "10", oid: 1 } },
								{ filled: { totalSz: "3.000", avgPx: "11", oid: 2 } },
							],
						},
					},
				},
				["2.0", "3"],
			),
		).toEqual({ status: "accepted", totalCount: 2, acceptedCount: 2, rejectedCount: 0, errors: [] });
	});
});
