import { isNonZeroPositionSize } from "@gatu/hl-react";
import { describe, expect, it } from "vitest";

describe("position size string gate", () => {
	it.each(["1", "-0.1", `0.${"0".repeat(400)}1`, `1${"0".repeat(400)}`])(
		"preserves a finite non-zero protocol decimal without Number coercion: %s",
		(value) => {
			expect(isNonZeroPositionSize(value)).toBe(true);
		},
	);

	it.each(["0", "-0.000", "", "NaN", "Infinity", "1e-8", ".5", "1."])(
		"rejects zero or malformed protocol sizes: %s",
		(value) => {
			expect(isNonZeroPositionSize(value)).toBe(false);
		},
	);
});
