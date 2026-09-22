import { describe, expect, it } from "vitest";
import { getOrderExecutionSummary, isPartialIocExecutionForOrder } from "@/domain/trade/order-execution-summary";
import type { TrackedOrderParams } from "@/domain/trade/order-tracking";

function order(size = "1", asset = 0, buy = true): TrackedOrderParams["orders"][number] {
	return { a: asset, b: buy, s: size, p: "101", r: false, t: { limit: { tif: "Gtc" } } };
}

function response(statuses: unknown[]) {
	return { status: "ok", response: { type: "order", data: { statuses } } };
}

function filled(totalSz = "1", avgPx = "100", oid = 1) {
	return { filled: { totalSz, avgPx, oid } };
}

describe("order execution summary", () => {
	it("uses actual execution values instead of the request price", () => {
		expect(getOrderExecutionSummary([order("0.68")], response([filled("0.68", "92.762")]), 1)).toEqual({
			evidence: "exchange-response",
			filledSize: "0.68",
			requestedSize: "0.68",
			averagePrice: "92.762",
			orderIds: [1],
			completeness: "full",
		});
	});

	it("recognizes a terminal filled response whose size is partial", () => {
		expect(getOrderExecutionSummary([order()], response([filled("0.3")]), 1)).toMatchObject({
			filledSize: "0.3",
			requestedSize: "1",
			completeness: "partial",
		});
	});

	it("binds a partial IOC remainder to the submitted cloid and verified execution oid", () => {
		const cloid = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		const requested = { ...order(), c: cloid, t: { limit: { tif: "Ioc" as const } } };
		const execution = getOrderExecutionSummary([requested], response([filled("0.3", "100", 7)]), 1);
		expect(execution?.partialIoc).toEqual({ cloid, orderId: 7 });
		if (!execution) throw new Error("Expected partial execution");
		expect(isPartialIocExecutionForOrder(execution, cloid.toUpperCase())).toBe(true);
		expect(isPartialIocExecutionForOrder(execution, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")).toBe(false);
		expect(isPartialIocExecutionForOrder({ ...execution, partialIoc: { cloid, orderId: 8 } }, cloid)).toBe(false);
		expect(getOrderExecutionSummary([requested], response([filled()]), 1)?.partialIoc).toBeUndefined();
		expect(
			getOrderExecutionSummary([{ ...requested, c: undefined }], response([filled("0.3")]), 1)?.partialIoc,
		).toBeUndefined();
	});

	it.each(["Gtc", "Alo"] as const)("does not infer an IOC remainder from a %s partial fill", (tif) => {
		const requested = { ...order(), c: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", t: { limit: { tif } } };
		expect(getOrderExecutionSummary([requested], response([filled("0.3")]), 1)?.partialIoc).toBeUndefined();
	});

	it("excludes attached TP/SL fills from the entry execution", () => {
		expect(
			getOrderExecutionSummary([order(), order("1", 0, false)], response([filled(), filled("1", "120", 2)]), 1),
		).toMatchObject({ filledSize: "1", averagePrice: "100", orderIds: [1], completeness: "full" });
	});

	it("keeps the main execution when an attached order is rejected", () => {
		expect(
			getOrderExecutionSummary([order(), order("1", 0, false)], response([filled(), { error: "Invalid TP" }]), 1),
		).toMatchObject({ filledSize: "1", completeness: "full" });
	});

	it("weights Scale fills by actual quantity with decimal arithmetic", () => {
		expect(
			getOrderExecutionSummary(
				[order("0.1"), order("0.2")],
				response([filled("0.1", "100", 1), filled("0.2", "103", 2)]),
				2,
			),
		).toEqual({
			evidence: "exchange-response",
			filledSize: "0.3",
			requestedSize: "0.3",
			averagePrice: "102",
			orderIds: [1, 2],
			completeness: "full",
		});
	});

	it.each([{ resting: { oid: 2 } }, { error: "Rejected" }, {}])(
		"retains only known executions in mixed batches (%j)",
		(status) => {
			expect(getOrderExecutionSummary([order(), order()], response([filled(), status]), 2)).toMatchObject({
				filledSize: "1",
				requestedSize: "2",
				averagePrice: "100",
				orderIds: [1],
				completeness: "partial",
			});
		},
	);

	it.each([[[{ resting: { oid: 1 } }]], [["filled"]], [["waitingForFill"]]])(
		"does not invent quantity from status-only evidence (%j)",
		(statuses) => {
			expect(getOrderExecutionSummary([order()], response(statuses), 1)).toBeUndefined();
		},
	);

	it.each([filled("2"), filled("0"), filled("bad"), filled("1", "0"), filled("1", "bad"), filled("1", "100", -1)])(
		"omits invalid fills (%j)",
		(status) => {
			expect(getOrderExecutionSummary([order()], response([status]), 1)).toBeUndefined();
		},
	);

	it("matches a supplied exchange cloid to the submitted order", () => {
		const cloid = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		const requested = { ...order(), c: cloid };
		const matching = { filled: { ...filled().filled, cloid: cloid.toUpperCase().replace("0X", "0x") } };
		expect(getOrderExecutionSummary([requested], response([matching]), 1)).toMatchObject({ completeness: "full" });
		expect(
			getOrderExecutionSummary(
				[requested],
				response([{ filled: { ...filled().filled, cloid: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" } }]),
				1,
			),
		).toBeUndefined();
		expect(
			getOrderExecutionSummary([requested], response([{ filled: { ...filled().filled, cloid: 1 } }]), 1),
		).toBeUndefined();
	});

	it("rejects ambiguous response cardinality and duplicate execution identities", () => {
		expect(getOrderExecutionSummary([order(), order()], response([filled()]), 2)).toBeUndefined();
		expect(getOrderExecutionSummary([order(), order()], response([filled(), filled()]), 2)).toBeUndefined();
	});

	it.each([order("1", 1), order("1", 0, false)])("never combines unrelated asset or side executions", (other) => {
		expect(getOrderExecutionSummary([order(), other], response([filled(), filled("1", "100", 2)]), 2)).toBeUndefined();
	});
});
