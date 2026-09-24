import { describe, expect, it } from "vitest";
import { getCloseOrderFeedbackChildren, summarizeCloseOrderFeedback } from "@/domain/trade/close-order-feedback";

const targets = [
	{ assetId: 1, market: "BTC", size: "0.100000000000000001" },
	{ assetId: 100_001, market: "xyz:TEST", size: "2" },
];

function response(statuses: unknown[]) {
	return { status: "ok", response: { type: "order", data: { statuses } } };
}

describe("close order feedback", () => {
	it("keeps decimal fill quantities exact and counts only complete fills", () => {
		const children = getCloseOrderFeedbackChildren(
			targets,
			response([{ filled: { totalSz: "0.100000000000000000" } }, { filled: { totalSz: "2.000" } }]),
		);
		expect(children).toEqual([
			{ ...targets[0], status: "partial", filledSize: "0.100000000000000000" },
			{ ...targets[1], status: "filled", filledSize: "2.000" },
		]);
		expect(summarizeCloseOrderFeedback(children)).toMatchObject({
			filledCount: 1,
			totalCount: 2,
			hasPartialFill: true,
		});
	});

	it("preserves per-market rejection and distinguishes accepted from filled", () => {
		const children = getCloseOrderFeedbackChildren(
			targets,
			response([{ resting: { oid: 1 } }, { error: "No liquidity" }]),
		);
		expect(children).toEqual([
			{ ...targets[0], status: "accepted" },
			{ ...targets[1], status: "rejected", error: "No liquidity" },
		]);
		expect(summarizeCloseOrderFeedback(children)).toMatchObject({ filledCount: 0, hasUnknown: true });
	});

	it("attaches a shared batch rejection to every target", () => {
		expect(getCloseOrderFeedbackChildren(targets, response([{ error: "Batch rejected" }]))).toEqual(
			targets.map((target) => ({ ...target, status: "rejected", error: "Batch rejected" })),
		);
	});

	it.each([
		undefined,
		response([]),
		response([{ filled: { totalSz: "1" } }]),
		response([{ filled: { totalSz: "9" } }, {}]),
	])("does not infer execution from a missing, malformed or oversized response", (raw) => {
		const children = getCloseOrderFeedbackChildren(targets, raw);
		expect(children.every((child) => child.status === "unknown")).toBe(true);
		expect(summarizeCloseOrderFeedback(children).filledCount).toBe(0);
	});
});
