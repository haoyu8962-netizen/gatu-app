// @vitest-environment jsdom

import { ApiRequestError } from "@nktkas/hyperliquid";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exchangeActionFailure } from "@/lib/errors/action-error";
import {
	type CreateFundsActionReferenceInput,
	clearFundsActionMarkersForTests,
	createFundsActionReference,
	type FundsActionReference,
	findPendingFundsAction,
	persistFundsActionMarker,
	removeFundsActionMarker,
} from "../../funds-action/funds-action-marker";
import type { StakingActionSubmission } from "../domain/staking";
import {
	buildStakingRecoverySubmission,
	type StakingActionsController,
	useStakingActions,
} from "../use-staking-actions";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const OTHER = "0x2222222222222222222222222222222222222222" as const;
const VALIDATOR = "0x3333333333333333333333333333333333333333" as const;
const SIGNER = "0x4444444444444444444444444444444444444444" as const;
const HASH = `0x${"ab".repeat(32)}` as const;

const mocks = vi.hoisted(() => ({
	acquire: vi.fn(async (_reference: unknown) => true),
	afterPreflight: vi.fn(async () => {}),
	clientKey: "0x1111111111111111111111111111111111111111" as string,
	env: "Mainnet" as "Mainnet" | "Testnet",
	geo: vi.fn(async () => ({ checkedAt: Date.now(), country: "GB", status: "allowed", ttlMs: 60_000 })),
	history: [] as unknown[],
	legalRefetch: vi.fn(),
	methods: {
		cDeposit: vi.fn(),
		cWithdraw: vi.fn(),
		tokenDelegate: vi.fn(),
	},
	options: {} as Record<
		string,
		{
			executionGuard?: (params: unknown) => void;
			preExecutionGuard?: (params: unknown, signal: AbortSignal) => Promise<void>;
		}
	>,
	owner: "0x1111111111111111111111111111111111111111" as `0x${string}`,
	preflight: {
		delegations: [] as unknown[],
		spot: { balances: [{ coin: "HYPE", token: 150, total: "10", hold: "0" }] } as unknown,
		summary: { delegated: "5", undelegated: "10", totalPendingWithdrawal: "0", nPendingWithdrawals: 0 } as unknown,
		validators: [] as unknown[],
	},
	sdkBoundaryEvents: [] as string[],
	sessionMode: "wallet" as "wallet" | "agent-only" | "disconnected",
	spotReads: 0,
	hasWalletAccess: true,
	walletAddress: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
}));

vi.mock("../../funds-action/funds-action-marker", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../funds-action/funds-action-marker")>();
	return {
		...original,
		acquireFundsActionMarker: async (reference: Parameters<typeof original.acquireFundsActionMarker>[0]) => {
			if (!(await mocks.acquire(reference))) return false;
			return original.persistFundsActionMarker(reference);
		},
	};
});

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		hasWalletAccess: mocks.hasWalletAccess,
		sessionMode: mocks.sessionMode,
		walletAddress: mocks.walletAddress,
	}),
}));

vi.mock("@/lib/geo/get-referral-action-geo", () => ({ getReferralActionGeo: mocks.geo }));

vi.mock("@/lib/hyperliquid", () => ({
	useExchange: (
		method: keyof typeof mocks.methods,
		options: {
			executionGuard?: (params: unknown) => void;
			preExecutionGuard?: (params: unknown, signal: AbortSignal) => Promise<void>;
		},
	) => {
		mocks.options[method] = options;
		return {
			mutateAsync: async (params: unknown) => {
				options.executionGuard?.(params);
				mocks.sdkBoundaryEvents.push("executionGuard");
				const signal = new AbortController().signal;
				await options.preExecutionGuard?.(params, signal);
				await mocks.afterPreflight();
				options.executionGuard?.(params);
				return mocks.methods[method](params);
			},
		};
	},
	useHyperliquid: () => ({
		clientKey: mocks.clientKey,
		env: mocks.env,
		info: {
			delegations: vi.fn(async () => mocks.preflight.delegations),
			delegatorHistory: vi.fn(async () => mocks.history),
			delegatorSummary: vi.fn(async () => mocks.preflight.summary),
			spotClearinghouseState: vi.fn(async () => {
				mocks.spotReads += 1;
				mocks.sdkBoundaryEvents.push(`spotRead:${mocks.spotReads}`);
				const snapshot = mocks.preflight.spot;
				await mocks.afterPreflight();
				return snapshot;
			}),
			validatorSummaries: vi.fn(async () => mocks.preflight.validators),
		},
		sessionMode: mocks.sessionMode,
	}),
	useLegalStatus: () => ({
		data: { acceptedTerms: true, userAllowed: true, canPerformActions: true },
		isError: false,
		isPending: false,
		refetch: mocks.legalRefetch,
	}),
}));

let controller: StakingActionsController | null = null;

function Probe() {
	controller = useStakingActions(mocks.owner);
	return null;
}

function current(): StakingActionsController {
	if (!controller) throw new Error("Missing hook controller");
	return controller;
}

function cDeposit(): StakingActionSubmission {
	return { request: { kind: "cDeposit", maxAmount: "10" }, amount: "2", wei: 200_000_000 };
}

function validator() {
	return {
		validator: VALIDATOR,
		signer: SIGNER,
		name: "Validator",
		description: "Fixture",
		nRecentBlocks: 10,
		stake: 100_000_000,
		isJailed: false,
		unjailableAfter: null,
		isActive: true,
		commission: "0.03",
		stats: [
			["day", { uptimeFraction: "1", predictedApr: "0.02", nSamples: 1 }],
			["week", { uptimeFraction: "1", predictedApr: "0.03", nSamples: 7 }],
			["month", { uptimeFraction: "1", predictedApr: "0.04", nSamples: 30 }],
		],
	};
}

function history(amount = "2") {
	return [{ time: Date.now() + 1_000, hash: HASH, delta: { cDeposit: { amount } } }];
}

function stakingReference(overrides: Partial<CreateFundsActionReferenceInput> = {}): FundsActionReference {
	return createFundsActionReference({
		env: "Mainnet",
		owner: OWNER,
		method: "cDeposit",
		target: "staking",
		direction: "deposit",
		displayAmount: "2",
		atomicAmount: "200000000",
		atomicDecimals: 8,
		asset: "HYPE",
		startedAt: 1_720_000_000_000,
		identityEpoch: "staking-recovery-epoch",
		historyBaseline: { version: 1, observedAt: 1_720_000_000_000, hashes: [] },
		stateBaseline: {
			kind: "staking",
			spotAvailable: "10",
			delegated: "5",
			undelegated: "10",
			totalPendingWithdrawal: "0",
			nPendingWithdrawals: 0,
			targetDelegation: "0",
		},
		...overrides,
	});
}

describe("staking marker recovery validation", () => {
	it("reconstructs every SDK staking action only from its canonical persisted tuple", () => {
		expect(buildStakingRecoverySubmission(stakingReference())).toEqual({
			request: { kind: "cDeposit", maxAmount: "2" },
			amount: "2",
			wei: 200_000_000,
		});
		expect(buildStakingRecoverySubmission(stakingReference({ method: "cWithdraw", direction: "withdraw" }))).toEqual({
			request: { kind: "cWithdraw", maxAmount: "2" },
			amount: "2",
			wei: 200_000_000,
		});
		expect(
			buildStakingRecoverySubmission(
				stakingReference({ method: "tokenDelegate", direction: "delegate", target: VALIDATOR }),
			),
		).toEqual({
			request: { kind: "delegate", maxAmount: "2", validator: VALIDATOR },
			amount: "2",
			wei: 200_000_000,
		});
		expect(
			buildStakingRecoverySubmission(
				stakingReference({ method: "tokenDelegate", direction: "undelegate", target: VALIDATOR }),
			),
		).toEqual({
			request: { kind: "undelegate", maxAmount: "2", validator: VALIDATOR },
			amount: "2",
			wei: 200_000_000,
		});
	});

	it("rebuilds a checksummed persisted validator target as its lowercase canonical form", () => {
		expect(
			buildStakingRecoverySubmission(
				stakingReference({
					method: "tokenDelegate",
					direction: "delegate",
					target: "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B",
				}),
			),
		).toEqual({
			request: { kind: "delegate", maxAmount: "2", validator: "0xab5801a7d398351b8be11c439e05c5b3259aec9b" },
			amount: "2",
			wei: 200_000_000,
		});
	});

	it("fails closed for mismatched asset, decimals, direction, target, amount, safe wei, or baselines", () => {
		const base = stakingReference();
		const { historyBaseline: _historyBaseline, stateBaseline: _stateBaseline, ...legacy } = base;
		const invalid: FundsActionReference[] = [
			{ ...base, asset: "USDC" },
			{ ...base, atomicDecimals: 6 },
			{ ...base, direction: "withdraw" },
			{ ...base, target: "Staking" },
			{ ...base, displayAmount: "2.0" },
			{ ...base, displayAmount: "2.1" },
			{ ...base, atomicAmount: "200000001" },
			{ ...base, displayAmount: "90071992.54740992", atomicAmount: "9007199254740992" },
			{ ...base, method: "tokenDelegate", direction: "deposit", target: VALIDATOR },
			{ ...base, method: "tokenDelegate", direction: "delegate", target: "not-an-address" },
			{ ...base, method: "tokenDelegate", direction: "delegate", target: "0xaB5801a7D398351b8bE11C439e05C5B3259aeC9B" },
			legacy,
			{ ...base, stateBaseline: { kind: "vault", vaultEquity: "1", withdrawable: "1" } },
		];

		for (const reference of invalid) expect(buildStakingRecoverySubmission(reference)).toBeNull();
	});
});

describe("useStakingActions orchestration", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(async () => {
		vi.clearAllMocks();
		mocks.clientKey = OWNER;
		mocks.env = "Mainnet";
		mocks.owner = OWNER;
		mocks.sessionMode = "wallet";
		mocks.hasWalletAccess = true;
		mocks.walletAddress = OWNER;
		mocks.history = [];
		mocks.options = {};
		mocks.sdkBoundaryEvents = [];
		mocks.spotReads = 0;
		mocks.preflight = {
			delegations: [],
			spot: { balances: [{ coin: "HYPE", token: 150, total: "10", hold: "0" }] },
			summary: { delegated: "5", undelegated: "10", totalPendingWithdrawal: "0", nPendingWithdrawals: 0 },
			validators: [validator()],
		};
		mocks.acquire.mockResolvedValue(true);
		mocks.afterPreflight.mockResolvedValue(undefined);
		mocks.geo.mockResolvedValue({ checkedAt: Date.now(), country: "GB", status: "allowed", ttlMs: 60_000 });
		mocks.legalRefetch.mockResolvedValue({
			data: { acceptedTerms: true, userAllowed: true, canPerformActions: true },
			error: null,
		});
		for (const mutation of Object.values(mocks.methods)) mutation.mockResolvedValue({ status: "ok" });
		mocks.methods.cDeposit.mockImplementation(async () => {
			mocks.preflight.spot = { balances: [{ coin: "HYPE", token: 150, total: "8", hold: "0" }] };
			mocks.preflight.summary = {
				delegated: "5",
				undelegated: "12",
				totalPendingWithdrawal: "0",
				nPendingWithdrawals: 0,
			};
			return { status: "ok" };
		});
		Object.defineProperty(navigator, "locks", {
			configurable: true,
			value: { request: vi.fn(async (_name, _options, callback) => callback({ name: "test" })) },
		});
		clearFundsActionMarkersForTests();
		controller = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		const react = await import("react-dom/client");
		root = react.createRoot(container);
		act(() => root.render(<Probe />));
	});

	afterEach(() => {
		act(() => root.unmount());
		clearFundsActionMarkersForTests();
		vi.useRealTimers();
		container.remove();
	});

	async function reviewAndSubmit() {
		act(() => current().review(cDeposit()));
		await act(async () => current().submit());
	}

	async function remountWithMarker(reference: FundsActionReference) {
		act(() => root.unmount());
		expect(persistFundsActionMarker(reference)).toBe(true);
		controller = null;
		const react = await import("react-dom/client");
		root = react.createRoot(container);
		await act(async () => {
			root.render(<Probe />);
			await Promise.resolve();
		});
	}

	async function beginBlockedRecoveryVerification(reference: FundsActionReference) {
		vi.useFakeTimers();
		await remountWithMarker(reference);
		mocks.history = history();
		mocks.preflight.spot = { balances: [{ coin: "HYPE", token: 150, total: "8", hold: "0" }] };
		mocks.preflight.summary = {
			delegated: "5",
			undelegated: "12",
			totalPendingWithdrawal: "0",
			nPendingWithdrawals: 0,
		};
		let releaseSnapshot: (() => void) | undefined;
		mocks.afterPreflight.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					releaseSnapshot = resolve;
				}),
		);

		let verification!: Promise<void>;
		act(() => {
			verification = current().verify();
		});
		await act(async () => Promise.resolve());

		return {
			release() {
				if (!releaseSnapshot) throw new Error("Recovery snapshot did not start");
				releaseSnapshot();
			},
			verification,
		};
	}

	async function finishBlockedRecoveryVerification(verification: Promise<void>) {
		await act(async () => {
			await vi.runAllTimersAsync();
			await verification;
		});
	}

	it("hydrates an exact persisted marker after a route remount and verifies it without signing again", async () => {
		const reference = stakingReference();
		await remountWithMarker(reference);

		expect(current().active).toMatchObject({
			submission: { request: { kind: "cDeposit" }, amount: "2", wei: 200_000_000 },
			state: { stage: "done", result: "unknown" },
			errorMessage: "statusUnknown",
			reference,
			recoveredFromMarker: true,
		});
		expect(current().hasPendingMarker).toBe(true);
		expect(current().canStart).toBe(false);

		mocks.history = history();
		mocks.preflight.spot = { balances: [{ coin: "HYPE", token: 150, total: "8", hold: "0" }] };
		mocks.preflight.summary = {
			delegated: "5",
			undelegated: "12",
			totalPendingWithdrawal: "0",
			nPendingWithdrawals: 0,
		};
		await act(async () => current().verify());

		expect(current().active?.state).toEqual({ stage: "done", result: "success" });
		expect(findPendingFundsAction("Mainnet", OWNER)).toBeNull();
		expect(mocks.methods.cDeposit).not.toHaveBeenCalled();
		expect(mocks.methods.cWithdraw).not.toHaveBeenCalled();
		expect(mocks.methods.tokenDelegate).not.toHaveBeenCalled();
	});

	it("keeps recovery unknown when any persisted marker field changes during read-only reconciliation", async () => {
		const reference = stakingReference();
		const { release, verification } = await beginBlockedRecoveryVerification(reference);
		const replacement = { ...reference, identityEpoch: "replacement-recovery-epoch" };
		act(() => {
			expect(persistFundsActionMarker(replacement)).toBe(true);
			release();
		});
		await finishBlockedRecoveryVerification(verification);

		expect(current().active).toMatchObject({
			state: { stage: "done", result: "unknown" },
			reference: replacement,
			recoveredFromMarker: true,
		});
		expect(findPendingFundsAction("Mainnet", OWNER)).toEqual(replacement);
		expect(Object.values(mocks.methods).every((method) => method.mock.calls.length === 0)).toBe(true);
	});

	it("clears a recovered session when another tab removes its marker during read-only verification", async () => {
		const reference = stakingReference();
		const { release, verification } = await beginBlockedRecoveryVerification(reference);
		act(() => {
			removeFundsActionMarker(reference.id);
			release();
		});
		await finishBlockedRecoveryVerification(verification);

		expect(current().active).toBeNull();
		expect(findPendingFundsAction("Mainnet", OWNER)).toBeNull();
		expect(Object.values(mocks.methods).every((method) => method.mock.calls.length === 0)).toBe(true);
	});

	it("hydrates a new-ID replacement marker after a read-only verification race", async () => {
		const reference = stakingReference();
		const { release, verification } = await beginBlockedRecoveryVerification(reference);
		const replacement = {
			...reference,
			id: `${reference.id}:replacement`,
			identityEpoch: "replacement-recovery-epoch",
		};
		act(() => {
			removeFundsActionMarker(reference.id);
			expect(persistFundsActionMarker(replacement)).toBe(true);
			release();
		});
		await finishBlockedRecoveryVerification(verification);

		expect(current().active).toMatchObject({
			state: { stage: "done", result: "unknown" },
			reference: replacement,
			recoveredFromMarker: true,
		});
		expect(findPendingFundsAction("Mainnet", OWNER)).toEqual(replacement);
		expect(Object.values(mocks.methods).every((method) => method.mock.calls.length === 0)).toBe(true);
	});

	it("hydrates and read-only verifies an exact owner marker in an Agent-only session", async () => {
		mocks.sessionMode = "agent-only";
		mocks.hasWalletAccess = false;
		mocks.walletAddress = undefined;
		mocks.clientKey = OWNER;
		await remountWithMarker(stakingReference());

		expect(current().active).toMatchObject({
			state: { stage: "done", result: "unknown" },
			recoveredFromMarker: true,
		});
		expect(current().canStart).toBe(false);

		mocks.history = history();
		mocks.preflight.spot = { balances: [{ coin: "HYPE", token: 150, total: "8", hold: "0" }] };
		mocks.preflight.summary = {
			delegated: "5",
			undelegated: "12",
			totalPendingWithdrawal: "0",
			nPendingWithdrawals: 0,
		};
		await act(async () => current().verify());

		expect(current().active?.state).toEqual({ stage: "done", result: "success" });
		expect(Object.values(mocks.methods).every((method) => method.mock.calls.length === 0)).toBe(true);
	});

	it("never hydrates another owner's persisted marker into an Agent-only session", async () => {
		mocks.sessionMode = "agent-only";
		mocks.hasWalletAccess = false;
		mocks.walletAddress = undefined;
		mocks.owner = OTHER;
		mocks.clientKey = OTHER;
		await remountWithMarker(stakingReference());

		expect(current().active).toBeNull();
		expect(current().hasPendingMarker).toBe(false);
		expect(Object.values(mocks.methods).every((method) => method.mock.calls.length === 0)).toBe(true);
	});

	it("keeps a same-owner marker locked but refuses hydration when its staking tuple is inconsistent", async () => {
		const invalid = stakingReference({ atomicAmount: "200000001" });
		await remountWithMarker(invalid);

		expect(current().active).toBeNull();
		expect(current().hasPendingMarker).toBe(true);
		expect(current().canStart).toBe(false);
		expect(findPendingFundsAction("Mainnet", OWNER)).toEqual(invalid);
		expect(Object.values(mocks.methods).every((method) => method.mock.calls.length === 0)).toBe(true);
	});

	it("dispatches once and reports success only after exact history reconciliation", async () => {
		mocks.history = [];
		mocks.methods.cDeposit.mockImplementationOnce(async () => {
			mocks.preflight.spot = { balances: [{ coin: "HYPE", token: 150, total: "8", hold: "0" }] };
			mocks.preflight.summary = {
				delegated: "5",
				undelegated: "12",
				totalPendingWithdrawal: "0",
				nPendingWithdrawals: 0,
			};
			mocks.history = history();
			return { status: "ok" };
		});
		await reviewAndSubmit();
		expect(mocks.methods.cDeposit).toHaveBeenCalledExactlyOnceWith({ wei: 200_000_000 });
		expect(current().active).toMatchObject({ state: { stage: "done", result: "success" }, match: { hash: HASH } });
		expect(findPendingFundsAction("Mainnet", OWNER)).toBeNull();
	});

	it("keeps a non-exact history result unknown and verify never signs twice", async () => {
		vi.useFakeTimers();
		mocks.history = [];
		mocks.methods.cDeposit.mockImplementationOnce(async () => {
			mocks.preflight.spot = { balances: [{ coin: "HYPE", token: 150, total: "8", hold: "0" }] };
			mocks.history = history("3");
			return { status: "ok" };
		});
		act(() => current().review(cDeposit()));
		let submission!: Promise<void>;
		act(() => {
			submission = current().submit();
		});
		await act(async () => {
			await vi.runAllTimersAsync();
			await submission;
		});
		expect(current().active?.state).toEqual({ stage: "done", result: "unknown" });
		expect(current().active?.reference).toMatchObject({
			env: "Mainnet",
			owner: OWNER,
			method: "cDeposit",
			target: "staking",
			direction: "deposit",
			displayAmount: "2",
			atomicAmount: "200000000",
			atomicDecimals: 8,
		});
		expect(mocks.methods.cDeposit).toHaveBeenCalledTimes(1);

		mocks.history = history();
		mocks.preflight.summary = {
			delegated: "5",
			undelegated: "12",
			totalPendingWithdrawal: "0",
			nPendingWithdrawals: 0,
		};
		await act(async () => {
			await current().verify();
		});
		expect(mocks.methods.cDeposit).toHaveBeenCalledTimes(1);
		expect(current().active?.state).toEqual({ stage: "done", result: "success" });
	});

	it("rehydrates a tokenDelegate marker written by the real submit path after a remount", async () => {
		vi.useFakeTimers();
		const checksummedValidator = "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B" as const;
		mocks.preflight.validators = [{ ...validator(), validator: checksummedValidator }];
		mocks.history = [];
		act(() =>
			current().review({
				request: { kind: "delegate", maxAmount: "10", validator: checksummedValidator },
				amount: "2",
				wei: 200_000_000,
			}),
		);
		let submission!: Promise<void>;
		act(() => {
			submission = current().submit();
		});
		await act(async () => {
			await vi.runAllTimersAsync();
			await submission;
		});
		expect(mocks.methods.tokenDelegate).toHaveBeenCalledExactlyOnceWith({
			validator: checksummedValidator,
			wei: 200_000_000,
			isUndelegate: false,
		});
		expect(current().active?.state).toEqual({ stage: "done", result: "unknown" });
		const persisted = findPendingFundsAction("Mainnet", OWNER);
		expect(persisted).toMatchObject({
			method: "tokenDelegate",
			target: checksummedValidator.toLowerCase(),
			direction: "delegate",
			displayAmount: "2",
			atomicAmount: "200000000",
		});

		vi.useRealTimers();
		act(() => root.unmount());
		controller = null;
		const react = await import("react-dom/client");
		root = react.createRoot(container);
		await act(async () => {
			root.render(<Probe />);
			await Promise.resolve();
		});

		expect(current().active).toMatchObject({
			state: { stage: "done", result: "unknown" },
			recoveredFromMarker: true,
			reference: persisted,
			submission: {
				request: { kind: "delegate", maxAmount: "2", validator: checksummedValidator.toLowerCase() },
				amount: "2",
				wei: 200_000_000,
			},
		});
		expect(current().hasPendingMarker).toBe(true);
		expect(mocks.methods.tokenDelegate).toHaveBeenCalledTimes(1);
	});

	it("does not let an old unknown session verify or clear a replacement marker", async () => {
		vi.useFakeTimers();
		mocks.history = [];
		mocks.methods.cDeposit.mockImplementationOnce(async () => {
			mocks.preflight.spot = { balances: [{ coin: "HYPE", token: 150, total: "8", hold: "0" }] };
			mocks.history = history("3");
			return { status: "ok" };
		});
		act(() => current().review(cDeposit()));
		let submission!: Promise<void>;
		act(() => {
			submission = current().submit();
		});
		await act(async () => {
			await vi.runAllTimersAsync();
			await submission;
		});
		const staleReference = current().active?.reference;
		expect(staleReference).toBeDefined();
		if (!staleReference) return;
		act(() => {
			removeFundsActionMarker(staleReference.id);
		});
		const replacement = { ...staleReference, id: `${staleReference.id}:replacement`, identityEpoch: "replacement" };
		act(() => {
			expect(persistFundsActionMarker(replacement)).toBe(true);
		});
		mocks.history = history();

		await act(async () => current().verify());

		expect(current().active?.state).toEqual({ stage: "done", result: "unknown" });
		expect(findPendingFundsAction("Mainnet", OWNER)).toEqual(replacement);
	});

	it("never mutates when marker acquisition fails", async () => {
		mocks.acquire.mockResolvedValue(false);
		await reviewAndSubmit();
		expect(mocks.methods.cDeposit).not.toHaveBeenCalled();
		expect(current().active?.state).toEqual({ stage: "done", result: "apiError" });
		expect(current().active?.failure).toBeNull();
	});

	it("keeps the exchange's rejection text, complete, for the failure notice", async () => {
		const text = `Staking request rejected: ${"insufficient balance for the requested amount ".repeat(4).trim()}`;
		mocks.methods.cDeposit.mockRejectedValueOnce(new ApiRequestError({ status: "err", response: text }, text));

		await reviewAndSubmit();

		expect(current().active?.state).toEqual({ stage: "done", result: "apiError" });
		expect(current().active?.errorMessage).toBe("apiError");
		expect(current().active?.failure).toEqual(exchangeActionFailure(text));
		expect(findPendingFundsAction("Mainnet", OWNER)).toBeNull();

		act(() => current().retry());
		expect(current().active?.failure).toBeNull();
	});

	it("treats an exchange rejection that mentions a user rejection as the exchange's, not the wallet's", async () => {
		const text = "User rejected the request because the validator is jailed";
		mocks.methods.cDeposit.mockRejectedValueOnce(new ApiRequestError({ status: "err", response: text }, text));

		await reviewAndSubmit();

		expect(current().active?.state).toEqual({ stage: "done", result: "apiError" });
		expect(current().active?.failure).toEqual(exchangeActionFailure(text));
	});

	it("never mutates when the fresh preflight balance fails", async () => {
		mocks.preflight.spot = { balances: [{ coin: "HYPE", token: 150, total: "1", hold: "0" }] };
		await reviewAndSubmit();
		expect(mocks.methods.cDeposit).not.toHaveBeenCalled();
		expect(findPendingFundsAction("Mainnet", OWNER)).toBeNull();
	});

	it("rereads after the SDK guard and blocks a balance change that occurred after the reconciliation baseline", async () => {
		mocks.acquire.mockImplementationOnce(async () => {
			mocks.preflight.spot = { balances: [{ coin: "HYPE", token: 150, total: "1", hold: "0" }] };
			return true;
		});

		await reviewAndSubmit();

		expect(mocks.spotReads).toBe(2);
		expect(mocks.sdkBoundaryEvents.slice(0, 3)).toEqual(["spotRead:1", "executionGuard", "spotRead:2"]);
		expect(mocks.methods.cDeposit).not.toHaveBeenCalled();
		expect(findPendingFundsAction("Mainnet", OWNER)).toBeNull();
		expect(current().active?.state).toEqual({ stage: "done", result: "apiError" });
	});

	it("runs the SDK-bound guard again and never mutates when the marker changes during preflight", async () => {
		mocks.afterPreflight.mockImplementation(async () => {
			const marker = findPendingFundsAction("Mainnet", OWNER);
			if (marker) removeFundsActionMarker(marker.id);
		});

		await reviewAndSubmit();

		expect(mocks.methods.cDeposit).not.toHaveBeenCalled();
		expect(current().active?.state).toEqual({ stage: "done", result: "apiError" });
	});

	it("drops late results after owner and environment change while retaining the pending marker", async () => {
		let resolveMutation!: (value: unknown) => void;
		mocks.methods.cDeposit.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveMutation = resolve;
			}),
		);
		act(() => current().review(cDeposit()));
		let submission!: Promise<void>;
		act(() => {
			submission = current().submit();
		});
		await act(async () => Promise.resolve());
		expect(findPendingFundsAction("Mainnet", OWNER)).not.toBeNull();

		mocks.env = "Testnet";
		mocks.owner = OTHER;
		mocks.clientKey = OTHER;
		mocks.walletAddress = OTHER;
		act(() => root.render(<Probe />));
		expect(current().active).toBeNull();
		resolveMutation({ status: "ok" });
		await act(async () => submission);
		expect(current().active).toBeNull();
		expect(findPendingFundsAction("Mainnet", OWNER)).not.toBeNull();
	});
});
