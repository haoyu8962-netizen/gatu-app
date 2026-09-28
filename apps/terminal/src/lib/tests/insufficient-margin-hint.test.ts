import { describe, expect, it } from "vitest";
import { getReduceOnlyMarginHint } from "@/domain/trade/insufficient-margin-hint";

describe("getReduceOnlyMarginHint", () => {
	it.each([
		{ side: "buy", size: "1", positionSize: "-0.5" },
		{ side: "sell", size: "0.3", positionSize: "2" },
		{ side: "sell", size: "0.000000000000000002", positionSize: "0.000000000000000001" },
	] as const)("suggests Reduce Only for an order of at most twice the opposite position: %o", (input) => {
		expect(getReduceOnlyMarginHint({ ...input, reduceOnly: false })).toEqual({ kind: "reduce-only" });
	});

	it.each([
		{ label: "an order over twice the position", side: "buy", size: "1.000000000000000001", positionSize: "-0.5" },
		{ label: "a position on the same side", side: "buy", size: "1", positionSize: "0.5" },
		{ label: "no position", side: "buy", size: "1", positionSize: undefined },
		{ label: "a flat position", side: "sell", size: "1", positionSize: "0" },
		{ label: "an unreadable size", side: "sell", size: "", positionSize: "2" },
	] as const)("gives no hint for $label", ({ side, size, positionSize }) => {
		expect(getReduceOnlyMarginHint({ side, size, positionSize, reduceOnly: false })).toBeUndefined();
	});

	it("gives no hint for an order that is already Reduce Only", () => {
		expect(getReduceOnlyMarginHint({ side: "buy", size: "1", positionSize: "-5", reduceOnly: true })).toBeUndefined();
	});
});
