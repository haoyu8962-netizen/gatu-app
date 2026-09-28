import { i18n } from "@lingui/core";
import { HttpRequestError } from "@nktkas/hyperliquid";
import { beforeAll, describe, expect, it } from "vitest";
import { formatErrorForDisplay } from "@/lib/errors";
import {
	formatExchangeActionError,
	formatOrderPlanError,
	formatTransferError,
	isAmbiguousExchangeActionError,
} from "@/lib/errors/format";
import type { Translate } from "@/lib/translate";

const translate: Translate = (descriptor) => i18n._(descriptor);

beforeAll(() => {
	i18n.loadAndActivate({ locale: "en", messages: {} });
});

describe("errors", () => {
	it("maps cross-tab funds lock failures to actionable product messages", () => {
		expect(
			formatTransferError(new Error("Another funds operation is still in progress for this account."), translate),
		).toContain("Another funds operation");
		expect(
			formatTransferError(new Error("Secure cross-tab funds coordination requires Web Locks support."), translate),
		).toContain("supported browser");
	});

	it("maps fail-closed legal execution errors to actionable product messages", () => {
		expect(
			formatTransferError(new Error("Hyperliquid access could not be verified before this action"), translate),
		).toBe("Unable to verify regional availability. Trading is temporarily unavailable.");
		expect(
			formatTransferError(new Error("This account is not permitted to perform this Hyperliquid action"), translate),
		).toBe("This account is not currently permitted to perform trading actions on Hyperliquid.");
	});

	it("maps current and legacy no-reward claim errors to the unclaimed-balance message", () => {
		for (const wording of [
			"There are no unclaimed rewards available to claim",
			"There are no eligible rewards available to claim",
		]) {
			expect(formatExchangeActionError(new Error(wording), "Claim failed", translate)).toBe(
				"There are no unclaimed rewards available to claim.",
			);
		}
	});

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
		expect(formatTransferError(new Error("Transaction was not broadcast. Please retry."), translate)).toBe(
			"Transaction was not broadcast. Please retry.",
		);
	});

	it("formats deposit wallet response timeouts without truncating the retry warning", () => {
		expect(formatTransferError(new Error("Wallet did not return a transaction hash."), translate)).toBe(
			"Wallet did not return a transaction hash. Check your wallet activity before retrying to avoid sending the deposit twice.",
		);
	});

	it("formats invisible wallet transaction hashes without saying the hash was never returned", () => {
		expect(
			formatTransferError(
				new Error("Wallet returned a transaction hash, but it is not visible on Arbitrum yet."),
				translate,
			),
		).toBe(
			"Wallet returned a transaction hash, but it is not visible on Arbitrum yet. Check your wallet activity or Arbiscan before retrying to avoid sending the deposit twice.",
		);
	});

	it("formats wallet connection failures separately from broadcast failures", () => {
		expect(formatTransferError(new Error("Failed to connect to MetaMask"), translate)).toBe(
			"Wallet connection failed. Unlock your wallet, approve the connection, then retry.",
		);
		expect(formatTransferError(new Error("Wallet client not ready"), translate)).toBe(
			"Wallet connection failed. Unlock your wallet, approve the connection, then retry.",
		);
		expect(formatTransferError(new Error("Wallet connection request was rejected."), translate)).toBe(
			"Wallet connection request was rejected.",
		);
	});

	it("formats Arbitrum chain switch failures", () => {
		expect(formatTransferError(new Error("Arbitrum network switch was rejected."), translate)).toBe(
			"Arbitrum network switch was rejected.",
		);
		expect(formatTransferError(new Error("Wallet is not connected to Arbitrum."), translate)).toBe(
			"Unable to switch wallet to Arbitrum. Switch networks in your wallet and retry.",
		);
	});

	it("formats deposit confirmation timeouts", () => {
		expect(
			formatTransferError(new Error("Deposit transaction was broadcast but confirmation timed out."), translate),
		).toBe("Deposit transaction was broadcast but confirmation timed out. Check Arbiscan before retrying.");
	});

	it("formats deposit nonce sync failures", () => {
		expect(formatTransferError(new Error("wallet nonce may be out of sync with the network"), translate)).toBe(
			"Deposit transaction was submitted but did not confirm on Arbitrum. Your wallet nonce may be out of sync with the network. Clear pending activity or reset nonce data in your wallet, then retry.",
		);
	});

	it("redacts smart-wallet nonce conflicts instead of exposing RPC payloads", () => {
		const message =
			'RPC Request failed. URL: https://rpc.zerodev.app/private Request body: {"callData":"0xdeadbeef"} Details: AA25 invalid account nonce';

		const formatted = formatTransferError(new Error(message), translate);

		expect(formatted).toBe(
			"Smart wallet deposit state is syncing. Do not submit another deposit while the balance is being checked.",
		);
		expect(formatted).not.toContain("rpc.zerodev.app");
		expect(formatted).not.toContain("callData");
	});

	it("uses the surface's own fallback only when a failure has nothing more specific to say", () => {
		expect(
			formatTransferError(new Error("Paymaster policy rejected sponsored call"), translate, "Deposit failed"),
		).toBe("Deposit failed");
		expect(formatTransferError(null, translate, "Automatic USDC deposit failed")).toBe("Automatic USDC deposit failed");
		expect(formatTransferError(new Error("Wallet client not ready"), translate, "Deposit failed")).toBe(
			"Wallet connection failed. Unlock your wallet, approve the connection, then retry.",
		);
	});

	it("shows a translated generic message instead of an unrecognised English error", () => {
		expect(formatTransferError(new Error("Withdraw confirmation timed out."), translate)).toBe(
			"The request could not be completed. Try again.",
		);
		expect(formatExchangeActionError(new Error("Internal invariant failed"), "Transfer failed", translate)).toBe(
			"Transfer failed",
		);
	});

	it("warns against blind retries when a signed exchange request has an ambiguous transport result", () => {
		const error = new HttpRequestError({ detail: "Request timed out after 10000 ms" });

		expect(isAmbiguousExchangeActionError(error)).toBe(true);
		expect(formatExchangeActionError(error, "Withdrawal failed", translate)).toBe(
			"Request status could not be confirmed. Check balances and transfer history before retrying.",
		);
	});

	it("keeps rate-limit responses deterministic because the exchange rejected them before execution", () => {
		const error = new HttpRequestError({ response: new Response("rate limited", { status: 429 }) });

		expect(isAmbiguousExchangeActionError(error)).toBe(false);
		expect(formatExchangeActionError(error, "Transfer failed", translate)).toBe(
			"Too many requests. Wait a moment and try again.",
		);
	});

	it("routes scale build errors through localized presentation messages", () => {
		expect(formatOrderPlanError("Scale prices must resolve to distinct ticks", translate)).toBe(
			"Scale prices must resolve to distinct ticks",
		);
		expect(formatOrderPlanError("Enter a valid scale price range", translate)).toBe("Enter price range");
		expect(formatOrderPlanError("Enter a valid scale skew", translate)).toBe("Enter a valid scale skew");
		expect(formatOrderPlanError("Size skew is too aggressive for the total size", translate)).toBe(
			"Size skew is too aggressive for the total size",
		);
		expect(formatOrderPlanError("Unknown plan error", translate)).toBe(
			"Order conditions changed before it was confirmed. Review the order and submit it again.",
		);
	});
});
