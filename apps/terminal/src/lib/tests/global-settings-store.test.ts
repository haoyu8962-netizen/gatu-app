import { describe, expect, it } from "vitest";
import { marketOrderSlippagePercentToBpsString } from "@/stores/use-global-settings-store";

describe("global settings market-order slippage", () => {
	it.each([
		[0.1, "10"],
		[0.29, "29"],
		[0.57, "57"],
		[2.5, "250"],
		[5, "500"],
	])("converts %s percent to an exact basis-point string", (percent, expected) => {
		expect(marketOrderSlippagePercentToBpsString(percent)).toBe(expected);
	});
});
