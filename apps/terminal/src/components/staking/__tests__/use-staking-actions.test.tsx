// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearFundsActionMarkersForTests,
	findPendingFundsAction,
	persistFundsActionMarker,
	removeFundsActionMarker,
} from "../../funds-action/funds-action-marker";
import type { StakingActionSubmission } from "../domain/staking";
import { type StakingActionsController, useStakingActions } from "../use-staking-actions";

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
		hasWalletAccess: Boolean(mocks.walletAddress),
		sessionMode: mocks.walletAddress ? "wallet" : "disconnected",
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
				const snapshot = mocks.preflight.spot;
				await mocks.afterPreflight();
				return snapshot;
			}),
			validatorSummaries: vi.fn(async () => mocks.preflight.validators),
		},
		sessionMode: mocks.walletAddress ? "wallet" : "disconnected",
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

describe("useStakingActions orchestration", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(async () => {
		vi.clearAllMocks();
		mocks.clientKey = OWNER;
		mocks.env = "Mainnet";
		mocks.owner = OWNER;
		mocks.walletAddress = OWNER;
		mocks.history = [];
		mocks.options = {};
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
	});

	it("never mutates when the fresh preflight balance fails", async () => {
		mocks.preflight.spot = { balances: [{ coin: "HYPE", token: 150, total: "1", hold: "0" }] };
		await reviewAndSubmit();
		expect(mocks.methods.cDeposit).not.toHaveBeenCalled();
		expect(findPendingFundsAction("Mainnet", OWNER)).toBeNull();
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
