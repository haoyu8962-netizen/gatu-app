import { TwapOrderRequest } from "@nktkas/hyperliquid/api/exchange";
import { describe, expect, it } from "vitest";

function request(minutes: number) {
	return {
		action: {
			type: "twapOrder" as const,
			twap: { a: 0, b: true, s: "1", r: false, m: minutes, t: false },
		},
		nonce: 1,
		signature: {
			r: `0x${"0".repeat(64)}`,
			s: `0x${"0".repeat(64)}`,
			v: 27 as const,
		},
	};
}

describe("pinned Hyperliquid TWAP request schema", () => {
	it("accepts the official seven-day maximum and rejects one minute beyond it", async () => {
		const maximum = await TwapOrderRequest["~standard"].validate(request(10_080));
		const beyondMaximum = await TwapOrderRequest["~standard"].validate(request(10_081));

		expect("issues" in maximum).toBe(false);
		expect("issues" in beyondMaximum).toBe(true);
	});
});
