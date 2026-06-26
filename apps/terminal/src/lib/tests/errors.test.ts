import { describe, expect, it, vi } from "vitest";
import { formatErrorForDisplay } from "@/lib/errors";
import { formatTransferError } from "@/lib/errors/format";

vi.mock("@lingui/core/macro", () => ({
	t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
		if (typeof strings === "string") return strings;
		return strings.reduce((message, part, index) => `${message}${part}${values[index] ?? ""}`, "");
	},
}));

describe("errors", () => {
	it("formats nested error details for display", () => {
		const error = new Error("Base error");
		(error as { shortMessage?: string }).shortMessage = "Short";
		(error as { details?: string }).details = "Detail";
		error.cause = new Error("Root cause");

		const result = formatErrorForDisplay(error);
		expect(result).toContain("Short");
		expect(result).toContain("Detail");
		expect(result).toContain("Base error");
		expect(result).toContain("Root cause");
	});

	it("falls back when no useful message is found", () => {
		expect(formatErrorForDisplay(null, "Fallback")).toBe("Fallback");
	});

	it("formats deposit broadcast failures without exposing raw provider output", () => {
		expect(formatTransferError(new Error("Transaction was not broadcast. Please retry."))).toBe(
			"Transaction was not broadcast. Please retry.",
		);
	});

	it("formats deposit confirmation timeouts", () => {
		expect(formatTransferError(new Error("Deposit transaction was broadcast but confirmation timed out."))).toBe(
			"Deposit transaction was broadcast but confirmation timed out. Check Arbiscan before retrying.",
		);
	});

	it("formats deposit nonce sync failures", () => {
		expect(formatTransferError(new Error("wallet nonce may be out of sync with the network"))).toBe(
			"Deposit transaction was submitted but did not confirm on Arbitrum. Your wallet nonce may be out of sync with the network. Clear pending activity or reset nonce data in your wallet, then retry.",
		);
	});

	it("does not label unrelated timeout errors as deposit failures", () => {
		expect(formatTransferError(new Error("Withdraw confirmation timed out."))).toBe("Withdraw confirmation timed out.");
	});
});
