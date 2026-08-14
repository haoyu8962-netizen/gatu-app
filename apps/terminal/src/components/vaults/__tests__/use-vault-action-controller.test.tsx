// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearFundsActionMarkersForTests,
	createFundsActionReference,
	FUNDS_ACTION_MARKER_STORAGE_KEY,
	type FundsActionReference,
	getFundsActionMarkers,
	persistFundsActionMarker,
} from "@/components/funds-action/funds-action-marker";
import { getFundsActionHistoryStartTime } from "@/components/funds-action/funds-action-reconciliation";
import type { VaultDetail, VaultOwnerViewState } from "@/components/vaults/domain/vaults";
import { createVaultIdentityKey, useVaultActionController } from "@/components/vaults/use-vault-action-controller";
import { createI18nRoot } from "@/lib/tests/harness/react";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const VAULT = "0x2222222222222222222222222222222222222222" as const;
const LEADER = "0x3333333333333333333333333333333333333333" as const;
const HASH = `0x${"ab".repeat(32)}`;

interface QueryState {
	data: unknown;
	refetch: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
	agentRegister: vi.fn(),
	agentRefetch: vi.fn(),
	activeAgentOwner: null as { env: "Mainnet" | "Testnet"; address: `0x${string}` } | null,
	clientKey: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
	exchangeGuard: null as null | ((params: { vaultAddress: `0x${string}`; isDeposit: boolean; usd: number }) => void),
	exchangeMutate: vi.fn(),
	geoRetry: vi.fn(),
	history: vi.fn(),
	legalRefetch: vi.fn(),
	locksRequest: vi.fn(),
	queries: new Map<string, QueryState>(),
	reconnectWallet: vi.fn(),
	sessionMode: "wallet" as "wallet" | "agent-only" | "disconnected",
	toastError: vi.fn(),
	wallet: {
		hasWalletAccess: true,
		walletAddress: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
	},
	preflightData: {
		equities: [{ vaultAddress: "0x2222222222222222222222222222222222222222", equity: "10", lockedUntilTimestamp: 1 }],
		clearinghouse: { withdrawable: "50" },
	},
	reconciliationData: {
		equities: [{ vaultAddress: "0x2222222222222222222222222222222222222222", equity: "11", lockedUntilTimestamp: 1 }],
		clearinghouse: { withdrawable: "49" },
	},
}));

vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({
		tradeRestricted: false,
		country: "SG",
		proxy: false,
		isError: false,
		isResolved: true,
		isResolving: false,
		retry: mocks.geoRetry,
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useReconnectWallet: () => ({ reconnectWallet: mocks.reconnectWallet }),
	useWalletSession: () => mocks.wallet,
}));

vi.mock("@/lib/hyperliquid", () => ({
	readPersistTradingConnection: () => true,
	useActiveAgentOwner: () => mocks.activeAgentOwner,
	useAgentRegistration: () => ({ register: mocks.agentRegister, status: "idle", error: null }),
	useAgentStatus: () => ({ refetchAgent: mocks.agentRefetch }),
	useExchange: (_method: string, options: { executionGuard: typeof mocks.exchangeGuard }) => {
		mocks.exchangeGuard = options.executionGuard;
		return {
			mutateAsync: async (params: { vaultAddress: `0x${string}`; isDeposit: boolean; usd: number }) => {
				options.executionGuard?.(params);
				return mocks.exchangeMutate(params);
			},
		};
	},
	useHyperliquid: () => ({
		env: mocks.env,
		clientKey: mocks.clientKey,
		sessionMode: mocks.sessionMode,
		info: {
			userNonFundingLedgerUpdates: mocks.history,
			vaultDetails: async () => mocks.queries.get("vaultDetails")?.data,
			userVaultEquities: async () => mocks.reconciliationData.equities,
			clearinghouseState: async () => mocks.reconciliationData.clearinghouse,
		},
	}),
	useInfo: (method: string) => {
		const query = mocks.queries.get(method);
		if (!query) throw new Error(`Missing query fixture for ${method}`);
		return query;
	},
	useLegalStatus: () => ({ refetch: mocks.legalRefetch }),
}));

let controller: ReturnType<typeof useVaultActionController> | null = null;

function Probe({ vaultAddress = VAULT, detail = DETAIL }: { vaultAddress?: string; detail?: VaultDetail | null }) {
	controller = useVaultActionController({ vaultAddress, detail, owner: OWNER_VIEW });
	return null;
}

function current() {
	if (!controller) throw new Error("Controller was not captured");
	return controller;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

describe("useVaultActionController", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.locksRequest
			.mockReset()
			.mockImplementation(async (_name: string, _options: LockOptions, callback: (lock: object) => unknown) =>
				callback({}),
			);
		Object.defineProperty(navigator, "locks", {
			configurable: true,
			value: {
				request: mocks.locksRequest,
			},
		});
		clearFundsActionMarkersForTests();
		mocks.clientKey = OWNER;
		mocks.activeAgentOwner = null;
		mocks.env = "Mainnet";
		mocks.sessionMode = "wallet";
		mocks.wallet = { hasWalletAccess: true, walletAddress: OWNER };
		mocks.preflightData = {
			equities: [{ vaultAddress: VAULT, equity: "10", lockedUntilTimestamp: 1 }],
			clearinghouse: { withdrawable: "50" },
		};
		mocks.reconciliationData = {
			equities: [{ vaultAddress: VAULT, equity: "11", lockedUntilTimestamp: 1 }],
			clearinghouse: { withdrawable: "49" },
		};
		mocks.agentRegister.mockReset();
		mocks.agentRefetch.mockReset().mockResolvedValue({ isAgentReady: true, needsAgent: false });
		mocks.exchangeMutate.mockReset().mockImplementation(async () => {
			expect(getFundsActionMarkers()).toHaveLength(1);
			return { status: "ok", response: { type: "default" } };
		});
		mocks.geoRetry.mockReset().mockResolvedValue({
			data: { tradeRestricted: false, country: "SG", proxy: false },
			error: null,
		});
		mocks.legalRefetch.mockReset().mockResolvedValue({
			data: { acceptedTerms: true, userAllowed: true, canPerformActions: true },
			error: null,
		});
		let historyReads = 0;
		mocks.history.mockReset().mockImplementation(async () => {
			historyReads += 1;
			if (historyReads === 1) return [];
			const marker = getFundsActionMarkers()[0];
			return marker
				? [
						{
							time: marker.startedAt,
							hash: HASH,
							delta: { type: "vaultDeposit", vault: VAULT, usdc: marker.displayAmount },
						},
					]
				: [];
		});
		mocks.toastError.mockReset();
		mocks.reconnectWallet.mockReset();
		mocks.queries = new Map([
			["vaultDetails", query(RAW_DETAIL)],
			["userVaultEquities", query(mocks.preflightData.equities)],
			["clearinghouseState", query(mocks.preflightData.clearinghouse)],
		]);
		controller = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(<Probe />));
	});

	afterEach(() => {
		vi.useRealTimers();
		act(() => root.unmount());
		container.remove();
		clearFundsActionMarkersForTests();
	});

	it("persists a public marker before the Agent-signed SDK call and succeeds only after exact ledger reconciliation", async () => {
		await openAndReview();
		await act(async () => current().confirm());

		expect(mocks.exchangeMutate).toHaveBeenCalledWith({ vaultAddress: VAULT, isDeposit: true, usd: 1_000_000 });
		expect(current().action).toMatchObject({
			state: { stage: "done", result: "success" },
			receipt: { hash: HASH, finalAmount: "1" },
		});
		expect(current().action?.receipt?.operationReference).toContain("vaultTransfer");
		const historyStartTimes = mocks.history.mock.calls.map(([params]) => params.startTime);
		expect(historyStartTimes).toHaveLength(2);
		expect(new Set(historyStartTimes).size).toBe(1);
		expect(historyStartTimes[0]).toEqual(expect.any(Number));
		expect(getFundsActionMarkers()).toHaveLength(0);
	});

	it("returns the real withdrawal hash, net amount, commission, and closing cost from the exact ledger event", async () => {
		mocks.reconciliationData = {
			equities: [{ vaultAddress: VAULT, equity: "9", lockedUntilTimestamp: 1 }],
			clearinghouse: { withdrawable: "50.91" },
		};
		mocks.history.mockImplementation(async () => {
			const marker = getFundsActionMarkers()[0];
			return marker
				? [
						{
							time: marker.startedAt,
							hash: HASH,
							delta: {
								type: "vaultWithdraw",
								vault: VAULT,
								user: OWNER,
								requestedUsd: marker.displayAmount,
								netWithdrawnUsd: "0.91",
								commission: "0.05",
								closingCost: "0.04",
							},
						},
					]
				: [];
		});
		await openAndReview("withdraw");
		await act(async () => current().confirm());

		expect(mocks.exchangeMutate).toHaveBeenCalledWith({ vaultAddress: VAULT, isDeposit: false, usd: 1_000_000 });
		expect(current().action).toMatchObject({
			state: { stage: "done", result: "success" },
			receipt: {
				hash: HASH,
				finalAmount: "0.91",
				commission: "0.05",
				closingCost: "0.04",
			},
		});
		expect(getFundsActionMarkers()).toHaveLength(0);
	});

	it("clears the marker for a deterministic ApiRequestError and does not claim ledger success", async () => {
		const apiError = new Error("Request was rejected by Hyperliquid");
		apiError.name = "ApiRequestError";
		mocks.exchangeMutate.mockRejectedValue(apiError);
		await openAndReview();
		await act(async () => current().confirm());

		expect(current().action).toMatchObject({ state: { stage: "done", result: "apiError" } });
		expect(current().action?.receipt).toBeUndefined();
		expect(getFundsActionMarkers()).toHaveLength(0);
		expect(mocks.history).toHaveBeenCalledOnce();
	});

	it("clears the marker and reports a wallet rejection separately", async () => {
		mocks.exchangeMutate.mockRejectedValue({ code: 4001, message: "User rejected the request" });
		await openAndReview();
		await act(async () => current().confirm());

		expect(current().action).toMatchObject({ state: { stage: "done", result: "rejected" } });
		expect(getFundsActionMarkers()).toHaveLength(0);
		expect(mocks.history).toHaveBeenCalledOnce();
	});

	it("returns rejected/apiError to review and performs every fresh preflight before creating a new marker", async () => {
		const firstMarkerEpochs: string[] = [];
		mocks.exchangeMutate
			.mockImplementationOnce(async () => {
				const marker = getFundsActionMarkers()[0];
				if (marker) firstMarkerEpochs.push(marker.identityEpoch);
				throw { code: 4001, message: "User rejected the request" };
			})
			.mockImplementationOnce(async () => {
				const marker = getFundsActionMarkers()[0];
				if (marker) firstMarkerEpochs.push(marker.identityEpoch);
				return { status: "ok", response: { type: "default" } };
			});
		await openAndReview();
		await act(async () => current().confirm());
		expect(current().action).toMatchObject({ state: { stage: "done", result: "rejected" } });
		const firstFreshDetailCalls = mocks.queries.get("vaultDetails")?.refetch.mock.calls.length ?? 0;

		act(() => current().retry());
		expect(current().action).toMatchObject({ state: { stage: "review", result: null } });
		expect(current().action?.marker).toBeUndefined();
		expect(current().action?.errorMessage).toBeUndefined();
		await act(async () => current().confirm());

		expect(mocks.queries.get("vaultDetails")?.refetch).toHaveBeenCalledTimes(firstFreshDetailCalls + 1);
		expect(mocks.exchangeMutate).toHaveBeenCalledTimes(2);
		expect(firstMarkerEpochs).toHaveLength(2);
		expect(firstMarkerEpochs[1]).not.toBe(firstMarkerEpochs[0]);
		expect(current().action).toMatchObject({ state: { stage: "done", result: "success" } });
		expect(getFundsActionMarkers()).toHaveLength(0);
	});

	it.each([
		{
			field: "identity epoch",
			tamper: (marker: FundsActionReference): FundsActionReference => ({
				...marker,
				identityEpoch: `${marker.identityEpoch}:tampered`,
			}),
		},
		{
			field: "history baseline",
			tamper: (marker: FundsActionReference): FundsActionReference => ({
				...marker,
				historyBaseline: {
					version: 1,
					observedAt: (marker.historyBaseline?.observedAt ?? marker.startedAt) + 1,
					hashes: marker.historyBaseline?.hashes ?? [],
				},
			}),
		},
	])("blocks the SDK mutation when a same-ID marker's $field changes before signing", async ({ tamper }) => {
		mocks.locksRequest.mockImplementationOnce(
			async (_name: string, _options: LockOptions, callback: (lock: object) => unknown) => {
				const acquired = await callback({});
				const marker = getFundsActionMarkers()[0];
				expect(marker).toBeDefined();
				if (marker) expect(persistFundsActionMarker(tamper(marker))).toBe(true);
				return acquired;
			},
		);
		await openAndReview();

		await act(async () => current().confirm());

		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
		expect(current().action).toMatchObject({ state: { stage: "done", result: "apiError" } });
		expect(getFundsActionMarkers()).toHaveLength(0);
	});

	it("fails a fresh closed-Vault preflight before persisting or calling the SDK", async () => {
		mocks.queries.set("vaultDetails", query({ ...RAW_DETAIL, isClosed: true }));
		await openAndReview();
		await act(async () => current().confirm());

		expect(current().action).toMatchObject({ state: { stage: "review", result: null } });
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
		expect(getFundsActionMarkers()).toHaveLength(0);
	});

	it("hydrates and verifies the exact owner marker read-only in an Agent-only session", async () => {
		act(() => root.unmount());
		controller = null;
		const marker = createPendingVaultMarker();
		expect(persistFundsActionMarker(marker)).toBe(true);
		mocks.sessionMode = "agent-only";
		mocks.clientKey = OWNER;
		mocks.wallet = { hasWalletAccess: false, walletAddress: undefined };
		mocks.activeAgentOwner = { env: "Mainnet", address: OWNER };
		mocks.history.mockResolvedValue([
			{
				time: marker.startedAt,
				hash: HASH,
				delta: { type: "vaultDeposit", vault: VAULT, usdc: marker.displayAmount },
			},
		]);

		root = createI18nRoot(container);
		act(() => root.render(<Probe />));

		expect(current().action).toMatchObject({
			ownerAddress: OWNER,
			state: { stage: "done", result: "unknown" },
			marker,
		});
		await act(async () => current().verifyAgain());

		expect(current().action).toMatchObject({ state: { stage: "done", result: "success" } });
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
		expect(getFundsActionMarkers()).toHaveLength(0);
		expect(mocks.history).toHaveBeenCalledWith({
			user: OWNER,
			startTime: getFundsActionHistoryStartTime(marker.startedAt),
		});
	});

	it("fails closed on an unknown jurisdiction before Agent verification", async () => {
		mocks.geoRetry.mockResolvedValueOnce({
			data: { tradeRestricted: false, country: null, proxy: false },
			error: null,
		});
		await act(async () => current().requestAction("deposit"));

		expect(current().action).toBeNull();
		expect(mocks.agentRefetch).not.toHaveBeenCalled();
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
	});

	it("registers only the Agent when one is missing, without a builder-fee path", async () => {
		const agentAddress = "0x4444444444444444444444444444444444444444" as const;
		mocks.agentRefetch
			.mockResolvedValueOnce({ isAgentReady: false, needsAgent: true })
			.mockResolvedValueOnce({ isAgentReady: true, needsAgent: false });
		mocks.agentRegister.mockResolvedValueOnce(agentAddress);
		await act(async () => current().requestAction("deposit"));

		expect(mocks.agentRegister).toHaveBeenCalledWith({ persistConnection: true });
		expect(mocks.agentRefetch).toHaveBeenNthCalledWith(2, agentAddress);
		expect(current().action?.state.stage).toBe("input");
	});

	it("refuses to dispatch when the approved Agent is not freshly verified at confirmation", async () => {
		mocks.agentRefetch
			.mockResolvedValueOnce({ isAgentReady: true, needsAgent: false })
			.mockResolvedValueOnce({ isAgentReady: false, needsAgent: true });
		await openAndReview();
		await act(async () => current().confirm());

		expect(current().action).toMatchObject({ state: { stage: "review", result: null } });
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
		expect(getFundsActionMarkers()).toHaveLength(0);
	});

	it("fails closed before SDK dispatch when the cross-tab marker slot cannot be acquired", async () => {
		vi.mocked(navigator.locks.request).mockResolvedValueOnce(false as never);
		await openAndReview();
		await act(async () => current().confirm());

		expect(current().action).toMatchObject({ state: { stage: "review", result: null } });
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
		expect(getFundsActionMarkers()).toHaveLength(0);
	});

	it("clears a marker when the local SDK-boundary guard cancels before dispatch", async () => {
		mocks.exchangeMutate.mockImplementation(async (params) => {
			const marker = getFundsActionMarkers()[0];
			expect(marker).toBeDefined();
			if (marker) window.localStorage.removeItem("gatu.funds_action.pending.v1");
			mocks.exchangeGuard?.(params);
		});
		await openAndReview();
		await act(async () => current().confirm());

		expect(current().action).toMatchObject({ state: { stage: "done", result: "apiError" } });
		expect(mocks.history).toHaveBeenCalledOnce();
		expect(getFundsActionMarkers()).toHaveLength(0);
	});

	it("retains an ambiguous marker and ends unknown without re-signing", async () => {
		vi.useFakeTimers();
		mocks.exchangeMutate.mockRejectedValue(new Error("transport disconnected after dispatch"));
		mocks.history.mockResolvedValue([]);
		await openAndReview();

		let confirmation!: Promise<void>;
		act(() => {
			confirmation = current().confirm();
		});
		await act(async () => {
			await vi.runAllTimersAsync();
			await confirmation;
		});

		expect(current().action).toMatchObject({ state: { stage: "done", result: "unknown" } });
		expect(getFundsActionMarkers()).toHaveLength(1);
		expect(mocks.exchangeMutate).toHaveBeenCalledOnce();
		expect(mocks.history).toHaveBeenCalledTimes(7);
	});

	it("treats a successful default response with no exact ledger event as unknown, then verifies read-only", async () => {
		vi.useFakeTimers();
		mocks.history.mockResolvedValue([]);
		await openAndReview();

		let confirmation!: Promise<void>;
		act(() => {
			confirmation = current().confirm();
		});
		await act(async () => {
			await vi.runAllTimersAsync();
			await confirmation;
		});
		expect(current().action).toMatchObject({ state: { stage: "done", result: "unknown" } });
		expect(getFundsActionMarkers()).toHaveLength(1);
		expect(mocks.exchangeMutate).toHaveBeenCalledOnce();
		const persistedMarker = getFundsActionMarkers()[0];
		expect(persistedMarker?.historyBaseline?.observedAt).toBeGreaterThanOrEqual(persistedMarker?.startedAt ?? 0);

		act(() => root.unmount());
		controller = null;
		root = createI18nRoot(container);
		act(() => root.render(<Probe />));
		expect(current().action).toMatchObject({
			state: { stage: "done", result: "unknown" },
			marker: persistedMarker,
		});
		expect(mocks.exchangeMutate).toHaveBeenCalledOnce();

		mocks.history.mockImplementation(async () => {
			const marker = getFundsActionMarkers()[0];
			return marker
				? [
						{
							time: marker.startedAt,
							hash: HASH,
							delta: { type: "vaultDeposit", vault: VAULT, usdc: marker.displayAmount },
						},
					]
				: [];
		});
		let verification!: Promise<void>;
		act(() => {
			verification = current().verifyAgain();
		});
		await act(async () => {
			await vi.runAllTimersAsync();
			await verification;
		});

		expect(current().action).toMatchObject({ state: { stage: "done", result: "success" } });
		expect(mocks.exchangeMutate).toHaveBeenCalledOnce();
		expect(getFundsActionMarkers()).toHaveLength(0);
	});

	it("hydrates an exact persisted Vault marker after refresh and verifies it without signing again", async () => {
		act(() => root.unmount());
		controller = null;
		const marker = createPendingVaultMarker();
		expect(persistFundsActionMarker(marker)).toBe(true);
		mocks.history.mockResolvedValue([
			{
				time: marker.startedAt,
				hash: HASH,
				delta: { type: "vaultDeposit", vault: VAULT, usdc: marker.displayAmount },
			},
		]);

		root = createI18nRoot(container);
		act(() => root.render(<Probe />));

		expect(current().action).toMatchObject({
			id: marker.identityEpoch,
			action: "deposit",
			amount: "1",
			state: { stage: "done", result: "unknown" },
			marker,
		});
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();

		await act(async () => current().verifyAgain());

		expect(current().action).toMatchObject({
			state: { stage: "done", result: "success" },
			receipt: { hash: HASH, finalAmount: "1" },
		});
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
		expect(getFundsActionMarkers()).toHaveLength(0);
	});

	it("hydrates a pending marker only after routing to its exact Vault", () => {
		const otherVault = "0x4444444444444444444444444444444444444444" as const;
		act(() => root.render(<Probe vaultAddress={otherVault} detail={{ ...DETAIL, vaultAddress: otherVault }} />));
		const marker = createPendingVaultMarker();
		act(() => {
			expect(persistFundsActionMarker(marker), JSON.stringify(marker)).toBe(true);
		});
		expect(current().action).toBeNull();

		act(() => root.render(<Probe />));

		expect(current().action).toMatchObject({
			state: { stage: "done", result: "unknown" },
			marker,
		});
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
	});

	it("stops rendering and signing an active action after routing to a different Vault", async () => {
		const otherVault = "0x4444444444444444444444444444444444444444" as const;
		await openAndReview();
		expect(current().action).toMatchObject({ state: { stage: "review", result: null } });

		act(() => root.render(<Probe vaultAddress={otherVault} detail={{ ...DETAIL, vaultAddress: otherVault }} />));

		expect(current().action).toBeNull();
		await act(async () => current().confirm());
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
		expect(getFundsActionMarkers()).toHaveLength(0);
	});

	it("discards a late requestAction result when the route changes during eligibility checks", async () => {
		const legal = deferred<{
			data: { acceptedTerms: boolean; userAllowed: boolean; canPerformActions: boolean };
			error: null;
		}>();
		mocks.legalRefetch.mockReturnValueOnce(legal.promise);
		let request!: Promise<void>;
		act(() => {
			request = current().requestAction("deposit");
		});
		expect(mocks.legalRefetch).toHaveBeenCalledOnce();

		const otherVault = "0x4444444444444444444444444444444444444444" as const;
		act(() => root.render(<Probe vaultAddress={otherVault} detail={{ ...DETAIL, vaultAddress: otherVault }} />));
		await act(async () => {
			legal.resolve({
				data: { acceptedTerms: true, userAllowed: true, canPerformActions: true },
				error: null,
			});
			await request;
		});

		expect(current().action).toBeNull();
		expect(mocks.agentRefetch).not.toHaveBeenCalled();
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
		expect(getFundsActionMarkers()).toHaveLength(0);
		expect(mocks.toastError).not.toHaveBeenCalled();
	});

	it("cancels confirmation without a marker or SDK call when routing changes during fresh preflight", async () => {
		const freshDetail = deferred<{ data: unknown; error: null }>();
		mocks.queries.set("vaultDetails", {
			data: RAW_DETAIL,
			refetch: vi.fn().mockReturnValue(freshDetail.promise),
		});
		await openAndReview();
		let confirmation!: Promise<void>;
		act(() => {
			confirmation = current().confirm();
		});
		expect(mocks.queries.get("vaultDetails")?.refetch).toHaveBeenCalledOnce();

		const otherVault = "0x4444444444444444444444444444444444444444" as const;
		act(() => root.render(<Probe vaultAddress={otherVault} detail={{ ...DETAIL, vaultAddress: otherVault }} />));
		await act(async () => {
			freshDetail.resolve({ data: RAW_DETAIL, error: null });
			await confirmation;
		});

		expect(current().action).toBeNull();
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
		expect(getFundsActionMarkers()).toHaveLength(0);
	});

	it("removes a just-acquired marker when routing changes before the SDK boundary", async () => {
		const markerStored = deferred<void>();
		const releaseLock = deferred<void>();
		mocks.locksRequest.mockImplementationOnce(
			async (_name: string, _options: LockOptions, callback: (lock: object) => unknown) => {
				const acquired = await callback({});
				markerStored.resolve();
				await releaseLock.promise;
				return acquired;
			},
		);
		await openAndReview();
		let confirmation!: Promise<void>;
		act(() => {
			confirmation = current().confirm();
		});
		await act(async () => markerStored.promise);
		expect(getFundsActionMarkers()).toHaveLength(1);

		const otherVault = "0x4444444444444444444444444444444444444444" as const;
		act(() => root.render(<Probe vaultAddress={otherVault} detail={{ ...DETAIL, vaultAddress: otherVault }} />));
		await act(async () => {
			releaseLock.resolve();
			await confirmation;
		});

		expect(current().action).toBeNull();
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
		expect(getFundsActionMarkers()).toHaveLength(0);
	});

	it("cancels confirmation on unmount without signing or reinstalling stale action state", async () => {
		const freshDetail = deferred<{ data: unknown; error: null }>();
		mocks.queries.set("vaultDetails", {
			data: RAW_DETAIL,
			refetch: vi.fn().mockReturnValue(freshDetail.promise),
		});
		await openAndReview();
		let confirmation!: Promise<void>;
		act(() => {
			confirmation = current().confirm();
		});
		expect(mocks.queries.get("vaultDetails")?.refetch).toHaveBeenCalledOnce();

		act(() => root.unmount());
		controller = null;
		await act(async () => {
			freshDetail.resolve({ data: RAW_DETAIL, error: null });
			await confirmation;
		});
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
		expect(getFundsActionMarkers()).toHaveLength(0);

		root = createI18nRoot(container);
		act(() => root.render(<Probe />));
		expect(current().action).toBeNull();
	});

	it("keeps an unknown-result dialog closed after one dismissal while its marker persists", async () => {
		vi.useFakeTimers();
		mocks.history.mockResolvedValue([]);
		await openAndReview();

		let confirmation!: Promise<void>;
		act(() => {
			confirmation = current().confirm();
		});
		await act(async () => {
			await vi.runAllTimersAsync();
			await confirmation;
		});
		expect(current().action).toMatchObject({ state: { stage: "done", result: "unknown" } });
		expect(getFundsActionMarkers()).toHaveLength(1);

		act(() => current().close());
		expect(current().action).toBeNull();
		await act(async () => {});
		expect(current().action).toBeNull();
		expect(getFundsActionMarkers()).toHaveLength(1);

		act(() => root.unmount());
		controller = null;
		root = createI18nRoot(container);
		act(() => root.render(<Probe />));
		expect(current().action).toMatchObject({
			state: { stage: "done", result: "unknown" },
			recoveredFromMarker: true,
		});
		expect(mocks.exchangeMutate).toHaveBeenCalledOnce();
	});

	it("rehydrates a never-dismissed unknown dialog after an in-place same-owner session-mode change", async () => {
		vi.useFakeTimers();
		mocks.history.mockResolvedValue([]);
		await openAndReview();

		let confirmation!: Promise<void>;
		act(() => {
			confirmation = current().confirm();
		});
		await act(async () => {
			await vi.runAllTimersAsync();
			await confirmation;
		});
		expect(current().action).toMatchObject({ state: { stage: "done", result: "unknown" } });

		mocks.sessionMode = "agent-only";
		mocks.wallet = { hasWalletAccess: false, walletAddress: undefined };
		mocks.activeAgentOwner = { env: "Mainnet", address: OWNER };
		act(() => root.render(<Probe />));
		await act(async () => {});

		expect(current().action).toMatchObject({
			state: { stage: "done", result: "unknown" },
			recoveredFromMarker: true,
		});
		expect(mocks.exchangeMutate).toHaveBeenCalledOnce();
	});

	it("clears stale recovered UI when another tab removes its marker", () => {
		const marker = createPendingVaultMarker();
		act(() => {
			expect(persistFundsActionMarker(marker)).toBe(true);
		});
		expect(current().action).toMatchObject({ marker, recoveredFromMarker: true });

		window.localStorage.removeItem(FUNDS_ACTION_MARKER_STORAGE_KEY);
		act(() => {
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: FUNDS_ACTION_MARKER_STORAGE_KEY,
					newValue: null,
					storageArea: window.localStorage,
				}),
			);
		});

		expect(current().action).toBeNull();
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
	});

	it("replaces stale recovered UI when another tab replaces its exact marker", () => {
		const marker = createPendingVaultMarker();
		act(() => {
			expect(persistFundsActionMarker(marker)).toBe(true);
		});
		const replacement = createPendingVaultMarker({
			atomicAmount: "2000000",
			displayAmount: "2",
			sequence: 2,
			startedAt: marker.startedAt + 10,
		});
		window.localStorage.setItem(FUNDS_ACTION_MARKER_STORAGE_KEY, JSON.stringify([replacement]));
		act(() => {
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: FUNDS_ACTION_MARKER_STORAGE_KEY,
					newValue: JSON.stringify([replacement]),
					storageArea: window.localStorage,
				}),
			);
		});

		expect(current().action).toMatchObject({
			amount: "2",
			marker: replacement,
			recoveredFromMarker: true,
			state: { stage: "done", result: "unknown" },
		});
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
	});

	it("refuses recovery markers with mismatched Vault action semantics, amount, or identity", () => {
		const base = createPendingVaultMarker();
		const storageRejectedMarkers: readonly FundsActionReference[] = [
			{ ...base, method: "cDeposit" },
			{ ...base, direction: "delegate" },
			{ ...base, asset: "HYPE" },
			{ ...base, atomicDecimals: 8 },
			{
				...base,
				stateBaseline: {
					kind: "staking",
					spotAvailable: "1",
					delegated: "0",
					undelegated: "0",
					totalPendingWithdrawal: "0",
					nPendingWithdrawals: 0,
					targetDelegation: "0",
				},
			},
		];
		for (const marker of storageRejectedMarkers) {
			expect(persistFundsActionMarker(marker), JSON.stringify(marker)).toBe(false);
		}

		const hydrationRejectedMarkers: readonly FundsActionReference[] = [
			{ ...base, atomicAmount: "1000001" },
			{ ...base, displayAmount: "9007199254.740992", atomicAmount: "9007199254740992" },
			{ ...base, identityEpoch: "Mainnet:another-owner:wallet:no-wallet:1:1" },
			{ ...base, id: base.id.replace("Mainnet:", "Testnet:") },
		];

		for (const marker of hydrationRejectedMarkers) {
			act(() => root.unmount());
			controller = null;
			clearFundsActionMarkersForTests();
			expect(persistFundsActionMarker(marker), JSON.stringify(marker)).toBe(true);
			root = createI18nRoot(container);
			act(() => root.render(<Probe />));
			expect(current().action).toBeNull();
		}

		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
	});

	it("does not let an old unknown dialog reconcile or clear a replacement marker", async () => {
		vi.useFakeTimers();
		mocks.history.mockResolvedValue([]);
		await openAndReview();
		let confirmation!: Promise<void>;
		act(() => {
			confirmation = current().confirm();
		});
		await act(async () => {
			await vi.runAllTimersAsync();
			await confirmation;
		});
		const staleReference = current().action?.marker;
		expect(staleReference).toBeDefined();
		if (!staleReference) return;
		const replacement = { ...staleReference, id: `${staleReference.id}:replacement`, identityEpoch: "replacement" };
		act(() => {
			window.localStorage.removeItem("gatu.funds_action.pending.v1");
			clearFundsActionMarkersForTests();
			expect(persistFundsActionMarker(replacement)).toBe(true);
		});
		mocks.history.mockResolvedValue([
			{ time: 1, hash: HASH, delta: { type: "vaultDeposit", vault: VAULT, usdc: "1" } },
		]);

		await act(async () => current().verifyAgain());

		expect(current().action).toMatchObject({ state: { stage: "done", result: "unknown" } });
		expect(getFundsActionMarkers()).toEqual([replacement]);
	});

	it("does not commit a late matching ledger result after the network identity changes", async () => {
		const ledger = deferred<unknown>();
		const historyStarted = deferred<void>();
		let historyReads = 0;
		mocks.history.mockImplementation(() => {
			historyReads += 1;
			if (historyReads === 1) return Promise.resolve([]);
			historyStarted.resolve();
			return ledger.promise;
		});
		await openAndReview();

		let confirmation!: Promise<void>;
		act(() => {
			confirmation = current().confirm();
		});
		await act(async () => historyStarted.promise);
		const marker = getFundsActionMarkers()[0];
		expect(marker).toBeDefined();
		mocks.env = "Testnet";
		act(() => root.render(<Probe />));
		await act(async () => {
			ledger.resolve([
				{
					time: marker?.startedAt,
					hash: HASH,
					delta: { type: "vaultDeposit", vault: VAULT, usdc: "1" },
				},
			]);
			await confirmation;
		});

		expect(current().action).toBeNull();
		expect(getFundsActionMarkers()).toHaveLength(1);
	});

	async function openAndReview(action: "deposit" | "withdraw" = "deposit") {
		await act(async () => current().requestAction(action));
		act(() => current().setAmount("1"));
		expect(current().canReview).toBe(true);
		act(() => current().review());
		expect(current().action?.state.stage).toBe("review");
	}
});

function query(data: unknown): QueryState {
	return { data, refetch: vi.fn().mockResolvedValue({ data, error: null }) };
}

function createPendingVaultMarker({
	atomicAmount = "1000000",
	displayAmount = "1",
	sequence = 1,
	startedAt = 1_700_000_000_001,
}: {
	atomicAmount?: string;
	displayAmount?: string;
	sequence?: number;
	startedAt?: number;
} = {}): FundsActionReference {
	const createdAt = startedAt - 1;
	const identityKey = createVaultIdentityKey({
		env: mocks.env,
		clientKey: mocks.clientKey,
		sessionMode: mocks.sessionMode,
		walletAddress: mocks.wallet.walletAddress,
	});
	return createFundsActionReference({
		env: mocks.env,
		owner: OWNER,
		method: "vaultTransfer",
		target: VAULT,
		direction: "deposit",
		displayAmount,
		atomicAmount,
		atomicDecimals: 6,
		asset: "USDC",
		startedAt,
		identityEpoch: `${identityKey}:${createdAt}:${sequence}`,
		historyBaseline: { version: 1, observedAt: createdAt, hashes: [] },
		stateBaseline: { kind: "vault", vaultEquity: "10", withdrawable: "50" },
	});
}

const SNAPSHOT = {
	accountValueHistory: [{ timestamp: 1, value: "100" }],
	pnlHistory: [{ timestamp: 1, value: "0" }],
	volume: "100",
} as const;

const DETAIL: VaultDetail = {
	name: "Safety Vault",
	vaultAddress: VAULT,
	leader: LEADER,
	description: "Fixture",
	portfolio: { day: SNAPSHOT, week: SNAPSHOT, month: SNAPSHOT, allTime: SNAPSHOT },
	apr: "0.1",
	followerState: null,
	leaderFraction: "0.1",
	leaderCommission: "0.1",
	followers: [],
	maxDistributable: "0",
	maxWithdrawable: "10",
	isClosed: false,
	relationship: "normal",
	allowDeposits: true,
	alwaysCloseOnWithdraw: false,
};

const OWNER_VIEW: VaultOwnerViewState = {
	status: "ready",
	equity: "10",
	pnl: "0",
	allTimePnl: "0",
	entryTime: 1,
	lockedUntil: 1,
	isLocked: false,
	lockProgress: "1",
	maxWithdrawable: "10",
	canWithdraw: true,
};

const RAW_PORTFOLIO = {
	accountValueHistory: [[1, "100"]],
	pnlHistory: [[1, "0"]],
	vlm: "100",
};

const RAW_DETAIL = {
	name: "Safety Vault",
	vaultAddress: VAULT,
	leader: LEADER,
	description: "Fixture",
	portfolio: [
		["day", RAW_PORTFOLIO],
		["week", RAW_PORTFOLIO],
		["month", RAW_PORTFOLIO],
		["allTime", RAW_PORTFOLIO],
	],
	apr: 0.1,
	followerState: null,
	leaderFraction: 0.1,
	leaderCommission: 0.1,
	followers: [],
	maxDistributable: 0,
	maxWithdrawable: 10,
	isClosed: false,
	relationship: { type: "normal" },
	allowDeposits: true,
	alwaysCloseOnWithdraw: false,
};
