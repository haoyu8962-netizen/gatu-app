import { describe, expect, it } from "vitest";
import type { StakingActionSubmission } from "../domain/staking";
import {
	assertStakingActionPreflight,
	buildStakingExchangeParameters,
	classifyStakingActionError,
	createStakingIdentityKey,
	decideStakingActionError,
	StakingActionPreflightError,
} from "../use-staking-actions";

const VALIDATOR = "0x1111111111111111111111111111111111111111" as const;
const SIGNER = "0x2222222222222222222222222222222222222222" as const;

function submission(
	kind: StakingActionSubmission["request"]["kind"],
	overrides: Partial<StakingActionSubmission["request"]> = {},
): StakingActionSubmission {
	return {
		request: {
			kind,
			maxAmount: "10",
			...(kind === "delegate" || kind === "undelegate" ? { validator: VALIDATOR } : {}),
			...overrides,
		},
		amount: "2",
		wei: 200_000_000,
	};
}

function validator(overrides: Record<string, unknown> = {}) {
	return {
		validator: VALIDATOR,
		signer: SIGNER,
		name: "Validator",
		description: "Verified fixture",
		nRecentBlocks: 100,
		stake: 100_000_000,
		isJailed: false,
		unjailableAfter: null,
		isActive: true,
		commission: "0.03",
		stats: [
			["day", { uptimeFraction: "1", predictedApr: "0.02", nSamples: 10 }],
			["week", { uptimeFraction: "1", predictedApr: "0.03", nSamples: 70 }],
			["month", { uptimeFraction: "1", predictedApr: "0.04", nSamples: 300 }],
		],
		...overrides,
	};
}

describe("staking action safety", () => {
	it("requires a fresh exact Spot balance for cDeposit", () => {
		expect(() =>
			assertStakingActionPreflight(submission("cDeposit"), {
				spot: { balances: [{ coin: "HYPE", token: 150, total: "2", hold: "0" }] },
			}),
		).not.toThrow();
		expect(() =>
			assertStakingActionPreflight(submission("cDeposit"), {
				spot: { balances: [{ coin: "HYPE", token: 150, total: "1.99999999", hold: "0" }] },
			}),
		).toThrow(StakingActionPreflightError);
	});

	it("fails closed at five pending cWithdraw operations and on insufficient staking availability", () => {
		expect(() =>
			assertStakingActionPreflight(submission("cWithdraw"), {
				summary: { delegated: "5", undelegated: "2", totalPendingWithdrawal: "1", nPendingWithdrawals: 4 },
			}),
		).not.toThrow();
		expect(() =>
			assertStakingActionPreflight(submission("cWithdraw"), {
				summary: { delegated: "5", undelegated: "2", totalPendingWithdrawal: "1", nPendingWithdrawals: 5 },
			}),
		).toThrow(StakingActionPreflightError);
		expect(() =>
			assertStakingActionPreflight(submission("cWithdraw"), {
				summary: { delegated: "5", undelegated: "1.99", totalPendingWithdrawal: "1", nPendingWithdrawals: 0 },
			}),
		).toThrow(StakingActionPreflightError);
	});

	it("requires an active non-jailed validator and fresh staking availability for delegation", () => {
		const ready = {
			summary: { delegated: "5", undelegated: "2", totalPendingWithdrawal: "0", nPendingWithdrawals: 0 },
			delegations: [],
			validators: [validator()],
		};
		expect(() => assertStakingActionPreflight(submission("delegate"), ready)).not.toThrow();
		expect(() =>
			assertStakingActionPreflight(submission("delegate"), {
				...ready,
				validators: [validator({ isJailed: true })],
			}),
		).toThrow(StakingActionPreflightError);
	});

	it("requires an exact unlocked delegation before undelegating", () => {
		const snapshot = {
			delegations: [{ validator: VALIDATOR, amount: "2", lockedUntilTimestamp: 999 }],
			validators: [validator()],
		};
		expect(() => assertStakingActionPreflight(submission("undelegate"), snapshot, 1_000)).not.toThrow();
		expect(() =>
			assertStakingActionPreflight(
				submission("undelegate"),
				{ ...snapshot, delegations: [{ validator: VALIDATOR, amount: "2", lockedUntilTimestamp: 1_001 }] },
				1_000,
			),
		).toThrow(StakingActionPreflightError);
	});

	it("clears only deterministic post-preflight errors and treats every other post-dispatch failure as unknown", () => {
		expect(classifyStakingActionError(new Error("provider unavailable"), false)).toBe("preflight");
		expect(classifyStakingActionError({ code: 4001 }, true)).toBe("rejected");
		const wrappedRejection = new Error("Failed to sign the typed data using the wallet", {
			cause: { code: 4001, message: "User rejected the request" },
		});
		wrappedRejection.name = "AbstractWalletError";
		expect(classifyStakingActionError(wrappedRejection, true)).toBe("rejected");
		expect(classifyStakingActionError(new Error("Request rejected by user"), true)).toBe("rejected");
		expect(classifyStakingActionError(new Error("You rejected the request in the wallet"), true)).toBe("rejected");
		expect(classifyStakingActionError(new Error("Request rejected by Hyperliquid"), true)).toBe("unknown");
		const apiError = new Error("bad request");
		apiError.name = "ApiRequestError";
		expect(classifyStakingActionError(apiError, true)).toBe("apiError");
		const validationError = new Error("invalid wei");
		validationError.name = "ValidationError";
		expect(classifyStakingActionError(validationError, true)).toBe("apiError");
		expect(classifyStakingActionError(new Error("transport disconnected"), true)).toBe("unknown");
		const deadlineError = Object.assign(new Error("deadline"), { name: "ExchangeActionDeadlineError" });
		expect(classifyStakingActionError(deadlineError, true)).toBe("preflight");
		expect(decideStakingActionError(deadlineError, true)).toEqual({
			result: "apiError",
			clearMarker: true,
			reconcile: false,
		});
		expect(decideStakingActionError({ code: 4001 }, true)).toEqual({
			result: "rejected",
			clearMarker: true,
			reconcile: false,
		});
		expect(decideStakingActionError(apiError, true)).toEqual({
			result: "apiError",
			clearMarker: true,
			reconcile: false,
		});
		expect(decideStakingActionError(new Error("lost response"), true)).toEqual({
			result: "unknown",
			clearMarker: false,
			reconcile: true,
		});
	});

	it("maps all four reviewed operations to the exact pinned SDK fields", () => {
		expect(buildStakingExchangeParameters(submission("cDeposit"))).toEqual({
			method: "cDeposit",
			params: { wei: 200_000_000 },
		});
		expect(buildStakingExchangeParameters(submission("cWithdraw"))).toEqual({
			method: "cWithdraw",
			params: { wei: 200_000_000 },
		});
		expect(buildStakingExchangeParameters(submission("delegate"))).toEqual({
			method: "tokenDelegate",
			params: { validator: VALIDATOR, wei: 200_000_000, isUndelegate: false },
		});
		expect(buildStakingExchangeParameters(submission("undelegate"))).toEqual({
			method: "tokenDelegate",
			params: { validator: VALIDATOR, wei: 200_000_000, isUndelegate: true },
		});
	});

	it("binds UI sessions to normalized owner, signer, client, environment, and access state", () => {
		const base = {
			env: "Mainnet" as const,
			clientKey: VALIDATOR,
			owner: VALIDATOR,
			walletAddress: VALIDATOR,
			sessionMode: "wallet" as const,
			hasWalletAccess: true,
		};
		expect(createStakingIdentityKey(base)).toBe(
			createStakingIdentityKey({ ...base, owner: VALIDATOR.toUpperCase() as `0x${string}` }),
		);
		expect(createStakingIdentityKey(base)).not.toBe(createStakingIdentityKey({ ...base, env: "Testnet" }));
		expect(createStakingIdentityKey(base)).not.toBe(createStakingIdentityKey({ ...base, walletAddress: SIGNER }));
	});
});
