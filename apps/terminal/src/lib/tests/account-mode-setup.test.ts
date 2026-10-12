import { ApiRequestError } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import {
	ACCOUNT_MODE_SETUP_MAX_ATTEMPTS,
	type AccountModeSetupInput,
	getAccountModeSetupAttemptStatusAfterFailure,
	getAccountModeSetupDecision,
	getAccountModeSetupFundingState,
	getExchangeRejectionText,
	isTerminalAccountModeSetupRejection,
} from "@/domain/trade/account-mode-setup";
import { getAccountModeAvailabilityStatus } from "@/domain/trade/order/availability";
import { getOrderActionStage } from "@/domain/trade/order-action-stage";

const ready: AccountModeSetupInput = {
	accountAbstraction: "default",
	isAgentOnlySession: false,
	isBuilderAccount: false,
	fundingState: "funded",
	legal: "allowed",
	signer: "ready",
	orderHistory: "empty",
	attempt: "idle",
};

describe("automatic unified account decision (ADR 0041)", () => {
	const idle = { conditionsHold: false, canAttempt: false };

	it("attempts only when every condition holds", () => {
		expect(getAccountModeSetupDecision(ready)).toEqual({ kind: "pending", conditionsHold: true, canAttempt: true });
	});

	it.each(["disabled", "unifiedAccount", "portfolioMargin", "dexAbstraction", null, undefined, "somethingNew"])(
		"never touches an account whose mode is %s",
		(accountAbstraction) => {
			expect(getAccountModeSetupDecision({ ...ready, accountAbstraction })).toEqual({
				kind: "not-applicable",
				...idle,
			});
		},
	);

	it("presents a new account with a confirmed empty snapshot as an ordinary empty account", () => {
		expect(getAccountModeSetupDecision({ ...ready, fundingState: "empty" })).toEqual({
			kind: "awaiting-funds",
			...idle,
		});
	});

	it.each(["loading", "error"] as const)("waits without signing while the funding snapshot is %s", (fundingState) => {
		expect(getAccountModeSetupDecision({ ...ready, fundingState })).toEqual({ kind: "pending", ...idle });
	});

	it.each([
		["an Agent-only session", { isAgentOnlySession: true }],
		["the builder address", { isBuilderAccount: true }],
		["an account that already has orders", { orderHistory: "present" }],
		["an order history that could not be read", { orderHistory: "error" }],
		["an account that may not perform actions", { legal: "blocked" }],
		["a signer that needs the user", { signer: "action-required" }],
		["a terminal rejection", { attempt: "rejected" }],
		["exhausted attempts", { attempt: "exhausted" }],
	] as const)("leaves %s to the manual selection", (_name, override) => {
		expect(getAccountModeSetupDecision({ ...ready, ...override })).toEqual({ kind: "manual", ...idle });
	});

	it.each([
		["an Agent-only session", { isAgentOnlySession: true }],
		["the builder address", { isBuilderAccount: true }],
		["a terminal rejection", { attempt: "rejected" }],
		["exhausted attempts", { attempt: "exhausted" }],
		["a known order history", { orderHistory: "present" }],
	] as const)("keeps %s on the manual selection when the account is empty again", (_name, override) => {
		expect(getAccountModeSetupDecision({ ...ready, fundingState: "empty", ...override })).toEqual({
			kind: "manual",
			...idle,
		});
	});

	it("leaves an account whose funding cannot be confirmed to the manual selection instead of loading forever", () => {
		expect(getAccountModeSetupDecision({ ...ready, fundingState: "unconfirmed" })).toEqual({ kind: "manual", ...idle });
		expect(
			getAccountModeSetupDecision({ ...ready, fundingState: "unconfirmed", attempt: "in-flight" }).conditionsHold,
		).toBe(false);
	});

	it("still presents an empty account as empty when its order history could not be read or it is not allowed yet", () => {
		for (const override of [{ orderHistory: "error" }, { legal: "blocked" }, { signer: "action-required" }] as const) {
			expect(getAccountModeSetupDecision({ ...ready, fundingState: "empty", ...override }).kind).toBe("awaiting-funds");
		}
	});

	it.each([
		["the legal status is loading", { legal: "loading" }],
		["the signer is loading", { signer: "loading" }],
		["the order history is loading", { orderHistory: "loading" }],
	] as const)("stays pending, with a condition missing, while %s", (_name, override) => {
		expect(getAccountModeSetupDecision({ ...ready, ...override })).toEqual({ kind: "pending", ...idle });
	});

	it.each([
		["an attempt is in flight", "in-flight"],
		["a retry is waiting", "waiting"],
		["an attempt settled and the mode has not refreshed yet", "settled"],
	] as const)("starts no second attempt while %s, though the conditions still hold", (_name, attempt) => {
		expect(getAccountModeSetupDecision({ ...ready, attempt })).toEqual({
			kind: "pending",
			conditionsHold: true,
			canAttempt: false,
		});
	});

	it("reports that the conditions no longer hold for an attempt in flight when one of them is lost", () => {
		for (const override of [
			{ fundingState: "loading" },
			{ fundingState: "empty" },
			{ legal: "loading" },
			{ signer: "loading" },
			{ orderHistory: "present" },
			{ accountAbstraction: "unifiedAccount" },
			{ isAgentOnlySession: true },
		] as const) {
			expect(getAccountModeSetupDecision({ ...ready, attempt: "in-flight", ...override }).conditionsHold).toBe(false);
		}
	});
});

describe("automatic unified account rejections and retries", () => {
	it("recognises the two terminal exchange rejections exactly", () => {
		expect(isTerminalAccountModeSetupRejection("Abstraction transition not allowed")).toBe(true);
		expect(isTerminalAccountModeSetupRejection(" Abstraction transition not allowed. ")).toBe(true);
		expect(isTerminalAccountModeSetupRejection("Cannot set abstraction for deployer or fee recipient")).toBe(true);
		expect(isTerminalAccountModeSetupRejection("Must deposit before performing actions")).toBe(false);
		expect(isTerminalAccountModeSetupRejection("Abstraction transition not allowed for this user today")).toBe(false);
		expect(isTerminalAccountModeSetupRejection("")).toBe(false);
	});

	it("reads the exchange's rejection text from the SDK error and nothing from any other failure", () => {
		const rejection = new ApiRequestError(
			{ status: "err", response: "Abstraction transition not allowed" },
			"Abstraction transition not allowed",
		);
		expect(getExchangeRejectionText(rejection)).toBe("Abstraction transition not allowed");
		expect(getExchangeRejectionText({ name: "ApiRequestError", response: { status: "err", response: "x" } })).toBe("x");
		expect(getExchangeRejectionText(new ApiRequestError({ status: "ok", response: { type: "default" } }))).toBeNull();
		expect(getExchangeRejectionText(new ApiRequestError("Abstraction transition not allowed"))).toBeNull();
		expect(getExchangeRejectionText(new Error("Abstraction transition not allowed"))).toBeNull();
		expect(getExchangeRejectionText(new TypeError("Failed to fetch"))).toBeNull();
		expect(getExchangeRejectionText("Abstraction transition not allowed")).toBeNull();
		expect(getExchangeRejectionText(null)).toBeNull();
		expect(getExchangeRejectionText(undefined)).toBeNull();
	});

	it("stops after a skip or a terminal rejection and retries other failures up to the limit", () => {
		expect(getAccountModeSetupAttemptStatusAfterFailure("skipped", 1)).toBe("settled");
		expect(getAccountModeSetupAttemptStatusAfterFailure("rejected", 1)).toBe("rejected");
		expect(getAccountModeSetupAttemptStatusAfterFailure("failed", 1)).toBe("waiting");
		expect(getAccountModeSetupAttemptStatusAfterFailure("failed", ACCOUNT_MODE_SETUP_MAX_ATTEMPTS - 1)).toBe("waiting");
		expect(getAccountModeSetupAttemptStatusAfterFailure("failed", ACCOUNT_MODE_SETUP_MAX_ATTEMPTS)).toBe("exhausted");
	});
});

describe("order availability for an account mode this terminal does not trade in", () => {
	const base = {
		isConnected: true,
		isModeSupported: false,
		areBalancesLoading: false,
		accountModeSetup: "manual" as const,
		streamStatus: "success" as const,
	};

	it("passes the stream status through for supported modes and disconnected sessions", () => {
		expect(
			getAccountModeAvailabilityStatus({ ...base, isModeSupported: true, accountModeSetup: "not-applicable" }),
		).toBe("success");
		expect(getAccountModeAvailabilityStatus({ ...base, isConnected: false, streamStatus: "idle" })).toBe("idle");
	});

	it("never opens order entry for a new empty account, whatever the trade-size stream reports", () => {
		expect(getAccountModeAvailabilityStatus({ ...base, accountModeSetup: "awaiting-funds" })).toBe("error");
		expect(
			getAccountModeAvailabilityStatus({ ...base, accountModeSetup: "awaiting-funds", streamStatus: "stale" }),
		).toBe("error");
	});

	it.each(["awaiting-funds", "pending", "manual", "not-applicable"] as const)(
		"never reports success for an unsupported mode whose setup is %s",
		(accountModeSetup) => {
			for (const areBalancesLoading of [true, false]) {
				expect(getAccountModeAvailabilityStatus({ ...base, accountModeSetup, areBalancesLoading })).not.toBe("success");
			}
		},
	);

	it("is loading while the mode is being set up or balances are loading", () => {
		expect(getAccountModeAvailabilityStatus({ ...base, accountModeSetup: "pending" })).toBe("loading");
		expect(getAccountModeAvailabilityStatus({ ...base, areBalancesLoading: true })).toBe("loading");
	});

	it("blocks order entry for every other unsupported mode", () => {
		expect(getAccountModeAvailabilityStatus(base)).toBe("error");
		expect(getAccountModeAvailabilityStatus({ ...base, accountModeSetup: "not-applicable" })).toBe("error");
	});
});

describe("funding conclusions for the automatic setup", () => {
	const current = { snapshots: "funded", withCachedSummary: "funded", snapshotsCurrent: true } as const;

	it("accepts a funded or an empty conclusion only from current snapshots", () => {
		expect(getAccountModeSetupFundingState(current)).toBe("funded");
		expect(getAccountModeSetupFundingState({ ...current, snapshots: "empty", withCachedSummary: "empty" })).toBe(
			"empty",
		);
		expect(getAccountModeSetupFundingState({ ...current, snapshotsCurrent: false })).toBe("loading");
		expect(
			getAccountModeSetupFundingState({
				snapshots: "empty",
				withCachedSummary: "empty",
				snapshotsCurrent: false,
			}),
		).toBe("loading");
		expect(
			getAccountModeSetupFundingState({ snapshots: "loading", withCachedSummary: "funded", snapshotsCurrent: false }),
		).toBe("loading");
		expect(
			getAccountModeSetupFundingState({ snapshots: "error", withCachedSummary: "funded", snapshotsCurrent: false }),
		).toBe("error");
	});

	it("never lets a cached summary make an account funded, nor confirms an empty conclusion it contradicts", () => {
		expect(
			getAccountModeSetupFundingState({ snapshots: "empty", withCachedSummary: "funded", snapshotsCurrent: true }),
		).toBe("unconfirmed");
		expect(
			getAccountModeSetupFundingState({ snapshots: "empty", withCachedSummary: "funded", snapshotsCurrent: false }),
		).toBe("loading");
		expect(
			getAccountModeSetupFundingState({ snapshots: "loading", withCachedSummary: "funded", snapshotsCurrent: true }),
		).toBe("loading");
	});
});

describe("order action stage for a new account awaiting its first deposit", () => {
	const blocked = {
		isConnected: true,
		needsApproval: false,
		isSignerReady: true,
		hasBalanceError: true,
		isBalanceLoading: true,
		availableBalance: 100,
	};

	it("offers Deposit instead of the blocked order states", () => {
		expect(getOrderActionStage(blocked)).toBe("balanceError");
		expect(getOrderActionStage({ ...blocked, isAwaitingFirstDeposit: true })).toBe("deposit");
		expect(getOrderActionStage({ ...blocked, isAwaitingFirstDeposit: true, reduceOnly: true })).toBe("deposit");
	});

	it("keeps Connect and signer setup ahead of it", () => {
		expect(getOrderActionStage({ ...blocked, isAwaitingFirstDeposit: true, isConnected: false })).toBe("connect");
		expect(
			getOrderActionStage({ ...blocked, isAwaitingFirstDeposit: true, needsApproval: true, isSignerReady: false }),
		).toBe("agent");
	});
});
