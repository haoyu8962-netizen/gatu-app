import { describe, expect, it } from "vitest";
import { getOrderDirection } from "@/lib/trade/order-direction";

describe("getOrderDirection", () => {
	it.each([
		["B", false, "buy"],
		["A", false, "sell"],
		["B", true, "closeShort"],
		["A", true, "closeLong"],
	] as const)("maps side %s with reduceOnly=%s to %s", (side, reduceOnly, expected) => {
		expect(getOrderDirection(side, reduceOnly)).toBe(expected);
	});

	it.each([
		["C", false],
		["B", undefined],
		[null, true],
	] as const)("fails closed for an invalid exchange payload", (side, reduceOnly) => {
		expect(getOrderDirection(side, reduceOnly)).toBeNull();
	});
});
