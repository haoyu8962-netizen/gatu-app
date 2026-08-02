import { HttpRequestError } from "@nktkas/hyperliquid";
import { describe, expect, it, vi } from "vitest";
import { formatErrorForDisplay } from "@/lib/errors";
import { formatExchangeActionError, formatTransferError, isAmbiguousExchangeActionError } from "@/lib/errors/format";

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

	it("formats deposit wallet response timeouts without truncating the retry warning", () => {
		expect(formatTransferError(new Error("Wallet did not return a transaction hash."))).toBe(
			"Wallet did not return a transaction hash. Check your wallet activity before retrying to avoid sending the deposit twice.",
		);
	});

	it("formats invisible wallet transaction hashes without saying the hash was never returned", () => {
		expect(
			formatTransferError(new Error("Wallet returned a transaction hash, but it is not visible on Arbitrum yet.")),
		).toBe(
			"Wallet returned a transaction hash, but it is not visible on Arbitrum yet. Check your wallet activity or Arbiscan before retrying to avoid sending the deposit twice.",
		);
	});

	it("formats wallet connection failures separately from broadcast failures", () => {
		expect(formatTransferError(new Error("Failed to connect to MetaMask"))).toBe(
			"Wallet connection failed. Unlock your wallet, approve the connection, then retry.",
		);
		expect(formatTransferError(new Error("Wallet client not ready"))).toBe(
			"Wallet connection failed. Unlock your wallet, approve the connection, then retry.",
		);
		expect(formatTransferError(new Error("Wallet connection request was rejected."))).toBe(
			"Wallet connection request was rejected.",
		);
	});

	it("formats Arbitrum chain switch failures", () => {
		expect(formatTransferError(new Error("Arbitrum network switch was rejected."))).toBe(
			"Arbitrum network switch was rejected.",
		);
		expect(formatTransferError(new Error("Wallet is not connected to Arbitrum."))).toBe(
			"Unable to switch wallet to Arbitrum. Switch networks in your wallet and retry.",
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

	it("redacts smart-wallet nonce conflicts instead of exposing RPC payloads", () => {
		const message =
			'RPC Request failed. URL: https://rpc.zerodev.app/private Request body: {"callData":"0xdeadbeef"} Details: AA25 invalid account nonce';

		const formatted = formatTransferError(new Error(message));

		expect(formatted).toBe(
			"Smart wallet deposit state is syncing. Do not submit another deposit while the balance is being checked.",
		);
		expect(formatted).not.toContain("rpc.zerodev.app");
		expect(formatted).not.toContain("callData");
	});

	it("does not label unrelated timeout errors as deposit failures", () => {
		expect(formatTransferError(new Error("Withdraw confirmation timed out."))).toBe("Withdraw confirmation timed out.");
	});

	it("warns against blind retries when a signed exchange request has an ambiguous transport result", () => {
		const error = new HttpRequestError({ detail: "Request timed out after 10000 ms" });

		expect(isAmbiguousExchangeActionError(error)).toBe(true);
		expect(formatExchangeActionError(error, "Withdrawal failed")).toBe(
			"Request status could not be confirmed. Check balances and transfer history before retrying.",
		);
	});

	it("keeps rate-limit responses deterministic because the exchange rejected them before execution", () => {
		const error = new HttpRequestError({ response: new Response("rate limited", { status: 429 }) });

		expect(isAmbiguousExchangeActionError(error)).toBe(false);
		expect(formatExchangeActionError(error, "Transfer failed")).not.toContain("status could not be confirmed");
	});
});
