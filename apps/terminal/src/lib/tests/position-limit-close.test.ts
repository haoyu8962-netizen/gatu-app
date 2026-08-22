import { describe, expect, it } from "vitest";
import { estimatePositionLimitClosePnl } from "@/domain/trade/position-limit-close";

describe("position limit close PnL estimate", () => {
	it("preserves exact decimal precision for a partial long close", () => {
		expect(
			estimatePositionLimitClosePnl({
				signedPositionSize: "12345678901234567890.123456",
				normalizedCloseSize: "0.123456",
				entryPx: "101.000001",
				limitPx: "101.000009",
			}),
		).toBe("9.87648e-7");
	});

	it("uses the opposite direction for a short position", () => {
		expect(
			estimatePositionLimitClosePnl({
				signedPositionSize: "-4",
				normalizedCloseSize: "1.5",
				entryPx: "100",
				limitPx: "90",
			}),
		).toBe("15");
	});

	it.each([
		{ signedPositionSize: "0", normalizedCloseSize: "1", entryPx: "100", limitPx: "90" },
		{ signedPositionSize: "1", normalizedCloseSize: "0", entryPx: "100", limitPx: "90" },
		{ signedPositionSize: "1", normalizedCloseSize: "2", entryPx: "100", limitPx: "90" },
		{ signedPositionSize: "1", normalizedCloseSize: "1", entryPx: "0", limitPx: "90" },
		{ signedPositionSize: "1", normalizedCloseSize: "1", entryPx: "100", limitPx: "invalid" },
	])("fails closed for invalid or oversized inputs", (input) => {
		expect(estimatePositionLimitClosePnl(input)).toBeNull();
	});
});
