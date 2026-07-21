import { describe, expect, it } from "vitest";
import type { BridgeQuote } from "@/lib/lifi/use-quote";
import { getBridgeQuoteErrorKind, getBridgeQuoteRemainingSeconds, isBridgeQuoteWorse } from "@/lib/lifi/use-quote";

function createQuote(overrides: Partial<BridgeQuote> = {}): BridgeQuote {
	return {
		step: {} as BridgeQuote["step"],
		fromAmount: "1000000",
		fromAmountUSD: "1",
		toAmount: "997500",
		toAmountMin: "992512",
		toAmountUSD: "0.9965",
		executionDuration: 30,
		gasCosts: [],
		feeCosts: [],
		totalFeesUSD: "0.01",
		...overrides,
	};
}

describe("bridge quote safeguards", () => {
	it("expires quotes after the configured validity window", () => {
		expect(getBridgeQuoteRemainingSeconds(10_000, 10_000)).toBe(30);
		expect(getBridgeQuoteRemainingSeconds(10_000, 39_001)).toBe(1);
		expect(getBridgeQuoteRemainingSeconds(10_000, 40_000)).toBe(0);
	});

	it("requires review only when the protected minimum output is lower", () => {
		const current = createQuote();
		expect(isBridgeQuoteWorse(current, createQuote())).toBe(false);
		expect(isBridgeQuoteWorse(current, createQuote({ toAmountMin: "992511" }))).toBe(true);
		expect(isBridgeQuoteWorse(current, createQuote({ totalFeesUSD: "0.02" }))).toBe(false);
	});

	it("reads structured LI.FI tool errors without imposing a global minimum", () => {
		const amountError = {
			cause: {
				responseBody: { errors: [{ code: "AMOUNT_TOO_LOW", tool: "hyperliquidNative" }] },
			},
		};
		const feeError = {
			cause: {
				responseBody: { errors: [{ code: "FEES_HIGHER_THAN_AMOUNT", tool: "relaydepository" }] },
			},
		};

		expect(getBridgeQuoteErrorKind(amountError)).toBe("amount-too-low");
		expect(getBridgeQuoteErrorKind(feeError)).toBe("fees-exceed-amount");
		expect(
			getBridgeQuoteErrorKind({
				cause: {
					responseBody: { errors: [{ code: "AMOUNT_TOO_LOW" }, { code: "TOOL_TIMEOUT" }] },
				},
			}),
		).toBe("unavailable");
		expect(getBridgeQuoteErrorKind(new Error("network unavailable"))).toBe("unavailable");
	});
});
