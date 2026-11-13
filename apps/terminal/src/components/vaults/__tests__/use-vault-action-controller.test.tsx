// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { ApiRequestError } from "@nktkas/hyperliquid";
import {
	type ExchangeSigningDeadlineSlot,
	hasExchangeActionDeadlinePassed,
} from "@sairn/hl-react/internal/exchange/request-scheduler";
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
import { describeActionFailure } from "@/lib/errors/action-error";
import { createI18nRoot } from "@/lib/tests/harness/react";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const VAULT = "0x2222222222222222222222222222222222222222" as const;
const LEADER = "0x3333333333333333333333333333333333333333" as const;
const HASH = `0x${"ab".repeat(32)}`;

interface QueryState {
	data: unknown;
	isSuccess: boolean;
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
	exchangeSubmit: vi.fn(),
	failBeforeSdkBoundary: null as Error | null,
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
	useTradingStatus: () => ({ signerMode: "agent", refetchSigner: mocks.agentRefetch }),
	useExchange: (_method: string, options: { executionGuard: typeof mocks.exchangeGuard }) => {
		mocks.exchangeGuard = options.executionGuard;
		return {
			mutateAsync: async (params: { vaultAddress: `0x${string}`; isDeposit: boolean; usd: number }) => {
				mocks.exchangeSubmit(params);
				options.executionGuard?.(params);
				if (mocks.failBeforeSdkBoundary) throw mocks.failBeforeSdkBoundary;
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

function Probe({
	vaultAddress = VAULT,
	detail = DETAIL,
	detailCurrent = true,
	owner = OWNER_VIEW,
}: {
	vaultAddress?: string;
	detail?: VaultDetail | null;
	detailCurrent?: boolean;
	owner?: VaultOwnerViewState;
}) {
	controller = useVaultActionController({ vaultAddress, detail, detailCurrent, owner });
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
		mocks.agentRefetch.mockReset().mockResolvedValue({ isSignerReady: true, needsAgent: false });
		mocks.exchangeSubmit.mockReset();
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
			["spotClearinghouseState", query({ balances: [] })],
			["userAbstraction", query("disabled")],
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
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	it("reports a failed eligibility check in the language active when it fails", async () => {
		mocks.geoRetry.mockResolvedValue({ data: { tradeRestricted: false, country: null, proxy: false }, error: null });

		await act(async () => current().requestAction("deposit"));
		expect(mocks.toastError).toHaveBeenLastCalledWith("Location eligibility could not be verified.");

		act(() =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: { [messageId("Location eligibility could not be verified.")]: "无法验证所在地资格。" },
			}),
		);
		await act(async () => current().requestAction("deposit"));
		expect(mocks.toastError).toHaveBeenLastCalledWith("无法验证所在地资格。");
		expect(current().action).toBeNull();
	});

	it("offers a Unified account its spot USDC for a Vault deposit and signs it after the same fresh check", async () => {
		mocks.queries.set("clearinghouseState", query({ withdrawable: "0.0" }));
		mocks.queries.set(
			"spotClearinghouseState",
			query({ balances: [{ coin: "USDC", token: 0, total: "10.1", hold: "0.0", entryNtl: "0.0" }] }),
		);
		mocks.queries.set("userAbstraction", query("unifiedAccount"));
		act(() => root.render(<Probe />));

		await act(async () => current().requestAction("deposit"));
		expect(current().availableAmount).toBe("10.1");
		expect(current().maxAmount).toBe("10.10");
		act(() => current().setAmount("4"));
		expect(current().canReview).toBe(false);
		expect(current().belowMinimum).toBe(true);
		act(() => current().setAmount("10.1"));
		expect(current().canReview).toBe(true);
		act(() => current().review());
		await act(async () => current().confirm());

		expect(mocks.exchangeMutate).toHaveBeenCalledWith({ vaultAddress: VAULT, isDeposit: true, usd: 10_100_000 });
	});

	it("holds the review step and both actions while the shown detail is the one kept after a failed refresh", async () => {
		mocks.queries.set("clearinghouseState", query({ withdrawable: "0.0" }));
		mocks.queries.set(
			"spotClearinghouseState",
			query({ balances: [{ coin: "USDC", token: 0, total: "10.1", hold: "0.0", entryNtl: "0.0" }] }),
		);
		mocks.queries.set("userAbstraction", query("unifiedAccount"));
		act(() => root.render(<Probe />));
		await act(async () => current().requestAction("deposit"));
		act(() => current().setAmount("10.1"));
		expect(current().canReview).toBe(true);

		act(() => root.render(<Probe detailCurrent={false} />));
		expect(current().action).not.toBeNull();
		expect(current().canReview).toBe(false);
		expect(current().actionAvailability).toEqual({
			deposit: { available: false, reason: "detail-unavailable" },
			withdraw: { available: false, reason: "detail-unavailable" },
		});

		act(() => root.render(<Probe />));
		expect(current().canReview).toBe(true);
	});

	it("pauses Confirm at the review step while the shown detail is the one kept after a failed refresh", async () => {
		await openAndReview();
		expect(current().canConfirm).toBe(true);

		act(() => root.render(<Probe detailCurrent={false} />));
		expect(current().action?.state.stage).toBe("review");
		expect(current().canConfirm).toBe(false);
		await act(async () => current().confirm());
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
		expect(current().action?.state.stage).toBe("review");

		act(() => root.render(<Probe />));
		expect(current().canConfirm).toBe(true);
	});

	it("pauses a withdrawal's Confirm at the review step while the owner balance is unverified", async () => {
		await openAndReview("withdraw");
		expect(current().canConfirm).toBe(true);

		act(() => root.render(<Probe owner={{ status: "error" }} />));
		expect(current().action?.state.stage).toBe("review");
		expect(current().canConfirm).toBe(false);
		await act(async () => current().confirm());
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();

		act(() => root.render(<Probe />));
		expect(current().canConfirm).toBe(true);
	});

	it("lets the Vault leader deposit after deposits from others are disabled", () => {
		act(() => root.render(<Probe detail={{ ...DETAIL, allowDeposits: false }} />));
		expect(current().actionAvailability.deposit).toEqual({ available: false, reason: "deposits-disabled" });

		act(() => root.render(<Probe detail={{ ...DETAIL, allowDeposits: false, leader: OWNER }} />));
		expect(current().actionAvailability.deposit).toEqual({ available: true, reason: null });
	});

	it("persists a public marker before the Agent-signed SDK call and succeeds only after exact ledger reconciliation", async () => {
		await openAndReview();
		await act(async () => current().confirm());

		expect(mocks.exchangeMutate).toHaveBeenCalledWith({ vaultAddress: VAULT, isDeposit: true, usd: 5_000_000 });
		expect(current().action).toMatchObject({
			state: { stage: "done", result: "success" },
			receipt: { hash: HASH, finalAmount: "5" },
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
		expect(current().action?.error).toBeUndefined();
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

	function refetching(cached: unknown, fresh: { data: unknown; error: unknown }): QueryState {
		return { data: cached, isSuccess: true, refetch: vi.fn().mockResolvedValue(fresh) };
	}

	function setUnifiedSpot(total: string) {
		mocks.queries.set(
			"spotClearinghouseState",
			query({ balances: [{ coin: "USDC", token: 0, total, hold: "0.0", entryNtl: "0.0" }] }),
		);
		mocks.queries.set("userAbstraction", query("unifiedAccount"));
	}

	function vaultErrorText() {
		const error = current().action?.error;
		return error ? describeActionFailure(error, (descriptor) => i18n._(descriptor)) : null;
	}

	it("signs nothing when the balance re-read before signing no longer covers the reviewed deposit", async () => {
		setUnifiedSpot("100");
		mocks.queries.set(
			"spotClearinghouseState",
			refetching(
				{ balances: [{ coin: "USDC", token: 0, total: "100", hold: "0.0", entryNtl: "0.0" }] },
				{ data: { balances: [{ coin: "USDC", token: 0, total: "2", hold: "0.0", entryNtl: "0.0" }] }, error: null },
			),
		);
		act(() => root.render(<Probe />));
		await openAndReview();
		await act(async () => current().confirm());

		expect(current().action).toMatchObject({ state: { stage: "review", result: null } });
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
		expect(getFundsActionMarkers()).toHaveLength(0);
	});

	it("signs nothing when a failed re-read still carries the earlier balance or the mode became default", async () => {
		const balance = { balances: [{ coin: "USDC", token: 0, total: "100", hold: "0.0", entryNtl: "0.0" }] };
		setUnifiedSpot("100");
		mocks.queries.set("spotClearinghouseState", refetching(balance, { data: balance, error: new Error("timeout") }));
		act(() => root.render(<Probe />));
		await openAndReview();
		await act(async () => current().confirm());

		expect(vaultErrorText()).not.toBeNull();
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();

		mocks.queries.set("spotClearinghouseState", query(balance));
		mocks.queries.set("userAbstraction", refetching("unifiedAccount", { data: "default", error: null }));
		act(() => root.render(<Probe />));
		await act(async () => current().confirm());

		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
		expect(getFundsActionMarkers()).toHaveLength(0);
	});

	it("does not offer Max from a balance whose last refresh failed", async () => {
		setUnifiedSpot("100");
		mocks.queries.set("spotClearinghouseState", {
			...query({ balances: [{ coin: "USDC", token: 0, total: "100", hold: "0.0", entryNtl: "0.0" }] }),
			isSuccess: false,
		});
		act(() => root.render(<Probe />));
		await act(async () => current().requestAction("deposit"));
		act(() => current().setAmount("5"));

		expect(current().availableAmount).toBeNull();
		expect(current().maxAmount).toBeNull();
		expect(current().canReview).toBe(false);
	});

	it.each(["disabled", "dexAbstraction"])(
		"deposits from the perp balance in %s mode even when the unused spot re-read fails",
		async (mode) => {
			mocks.queries.set("userAbstraction", query(mode));
			mocks.queries.set(
				"spotClearinghouseState",
				refetching({ balances: [] }, { data: undefined, error: new Error("down") }),
			);
			act(() => root.render(<Probe />));
			await openAndReview();
			await act(async () => current().confirm());

			expect(mocks.exchangeMutate).toHaveBeenCalledWith({ vaultAddress: VAULT, isDeposit: true, usd: 5_000_000 });
		},
	);

	it("rounds Max down to micro-USDC", async () => {
		mocks.queries.set("clearinghouseState", query({ withdrawable: "12.3456789" }));
		act(() => root.render(<Probe />));
		await act(async () => current().requestAction("deposit"));

		expect(current().maxAmount).toBe("12.345678");
	});

	it("fails a fresh closed-Vault preflight before persisting or calling the SDK", async () => {
		mocks.queries.set("vaultDetails", query({ ...RAW_DETAIL, isClosed: true }));
		await openAndReview();
		await act(async () => current().confirm());

		expect(current().action).toMatchObject({ state: { stage: "review", result: null } });
		const error = current().action?.error;
		expect(error && describeActionFailure(error, (descriptor) => i18n._(descriptor))).toBe(
			"This Vault no longer accepts deposits.",
		);
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
		expect(getFundsActionMarkers()).toHaveLength(0);
	});

	it("reports a failed fresh history read as a failed operation instead of a wallet or network change", async () => {
		await openAndReview();
		mocks.history.mockRejectedValueOnce(new Error("Network request failed"));
		await act(async () => current().confirm());

		const error = current().action?.error;
		expect(error && describeActionFailure(error, (descriptor) => i18n._(descriptor))).toBe(
			"Vault operation failed. Verify current balances and history before trying again.",
		);
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
		expect(getFundsActionMarkers()).toHaveLength(0);
	});

	it("shows an unknown exchange rejection of the Vault transfer exactly as the exchange sent it", async () => {
		const text = "Vault withdrawal limit exceeded: 12.34 USDC";
		mocks.exchangeMutate.mockRejectedValueOnce(new ApiRequestError({ status: "err", response: text }, text));
		await openAndReview();
		await act(async () => current().confirm());

		expect(current().action).toMatchObject({ state: { stage: "done", result: "apiError" } });
		const error = current().action?.error;
		expect(error && describeActionFailure(error, (descriptor) => i18n._(descriptor))).toBe(text);
	});

	it("keeps an exchange rejection that mentions a user rejection as the exchange's reason", async () => {
		const text = "User rejected the request because the vault is closed";
		mocks.exchangeMutate.mockRejectedValueOnce(new ApiRequestError({ status: "err", response: text }, text));
		await openAndReview();
		await act(async () => current().confirm());

		expect(current().action).toMatchObject({ state: { stage: "done", result: "apiError" } });
		const error = current().action?.error;
		expect(error && describeActionFailure(error, (descriptor) => i18n._(descriptor))).toBe(text);
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

	it("keeps new Vault deposits and withdrawals unavailable for an Agent-only session", async () => {
		act(() => root.unmount());
		controller = null;
		mocks.sessionMode = "agent-only";
		mocks.clientKey = OWNER;
		mocks.wallet = { hasWalletAccess: false, walletAddress: undefined };
		mocks.activeAgentOwner = { env: "Mainnet", address: OWNER };

		root = createI18nRoot(container);
		act(() => root.render(<Probe />));

		expect(current().actionAvailability).toEqual({
			deposit: { available: false, reason: "agent-only-session" },
			withdraw: { available: false, reason: "agent-only-session" },
		});
		await act(async () => current().requestAction("deposit"));
		expect(mocks.reconnectWallet).not.toHaveBeenCalled();
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
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
			.mockResolvedValueOnce({ isSignerReady: false, needsAgent: true })
			.mockResolvedValueOnce({ isSignerReady: true, needsAgent: false });
		mocks.agentRegister.mockResolvedValueOnce(agentAddress);
		await act(async () => current().requestAction("deposit"));

		expect(mocks.agentRegister).toHaveBeenCalledOnce();
		expect(mocks.agentRegister).toHaveBeenCalledWith({ persistConnection: true, deadline: expect.any(Object) });
		expect(mocks.agentRefetch).toHaveBeenNthCalledWith(2, agentAddress);
		expect(current().action?.state.stage).toBe("input");
	});

	it("refuses to dispatch when the approved Agent is not freshly verified at confirmation", async () => {
		mocks.agentRefetch
			.mockResolvedValueOnce({ isSignerReady: true, needsAgent: false })
			.mockResolvedValueOnce({ isSignerReady: false, needsAgent: true });
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
			if (marker) window.localStorage.removeItem("sairn.funds_action.pending.v1");
			mocks.exchangeGuard?.(params);
		});
		await openAndReview();
		await act(async () => current().confirm());

		expect(current().action).toMatchObject({ state: { stage: "done", result: "apiError" } });
		expect(mocks.history).toHaveBeenCalledOnce();
		expect(getFundsActionMarkers()).toHaveLength(0);
	});

	it("clears the marker when the request stops before the SDK boundary, since nothing was signed", async () => {
		mocks.failBeforeSdkBoundary = new Error("browser lock unavailable");
		await openAndReview();
		await act(async () => current().confirm());

		expect(current().action).toMatchObject({ state: { stage: "done", result: "apiError" } });
		expect(getFundsActionMarkers()).toHaveLength(0);
		expect(mocks.exchangeMutate).not.toHaveBeenCalled();
		mocks.failBeforeSdkBoundary = null;
	});

	it("reports a wallet rejection the SDK wrapped as rejected, not as an unknown outcome", async () => {
		const wrapped = new Error("Failed to sign the typed data using the wallet", {
			cause: { code: 4001, message: "User rejected the request" },
		});
		wrapped.name = "AbstractWalletError";
		mocks.exchangeMutate.mockRejectedValue(wrapped);
		await openAndReview();
		await act(async () => current().confirm());

		expect(current().action).toMatchObject({ state: { stage: "done", result: "rejected" } });
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
			isSuccess: true,
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
			isSuccess: true,
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
			window.localStorage.removeItem("sairn.funds_action.pending.v1");
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

	describe("when the checks before a signature finish long after the click", () => {
		const NOT_SENT = "The checks before this request took too long. Nothing was signed or sent. Try again.";
		const AGENT = "0x4444444444444444444444444444444444444444" as const;

		beforeEach(() => {
			vi.useFakeTimers();
		});

		const LEGAL_ALLOWED = {
			data: { acceptedTerms: true, userAllowed: true, canPerformActions: true },
			error: null,
		};
		const LOCATION_ALLOWED = { data: { tradeRestricted: false, country: "SG", proxy: false }, error: null };
		const AGENT_MISSING = { isSignerReady: false, needsAgent: true };

		function resolveAfter<T>(ms: number, value: T) {
			return () =>
				new Promise<T>((resolve) => {
					setTimeout(() => resolve(value), ms);
				});
		}

		function delayLegalCheck(ms: number) {
			mocks.legalRefetch.mockImplementationOnce(resolveAfter(ms, LEGAL_ALLOWED));
		}

		const SLOW_CHECKS_BEFORE_AGENT_APPROVAL = [
			{
				check: "legal",
				delay: (ms: number) => {
					delayLegalCheck(ms);
					mocks.agentRefetch.mockResolvedValueOnce(AGENT_MISSING);
				},
			},
			{
				check: "location",
				delay: (ms: number) => {
					mocks.geoRetry.mockImplementationOnce(resolveAfter(ms, LOCATION_ALLOWED));
					mocks.agentRefetch.mockResolvedValueOnce(AGENT_MISSING);
				},
			},
			{
				check: "signer",
				delay: (ms: number) => {
					mocks.agentRefetch.mockImplementationOnce(resolveAfter(ms, AGENT_MISSING));
				},
			},
		];

		async function runFor(ms: number, start: () => Promise<void>) {
			const wallClock = Date.now();
			const monotonicClock = performance.now();
			let pending!: Promise<void>;
			act(() => {
				pending = start();
			});
			await act(async () => {
				await vi.advanceTimersByTimeAsync(ms);
				await pending;
			});
			expect(Date.now() - wallClock).toBeGreaterThanOrEqual(ms);
			expect(performance.now() - monotonicClock).toBeGreaterThanOrEqual(ms);
		}

		it("signs nothing and ends as a definite failure when the fresh checks return 16 seconds after Confirm", async () => {
			await openAndReview();
			delayLegalCheck(16_000);
			await runFor(16_000, () => current().confirm());

			expect(mocks.exchangeSubmit).not.toHaveBeenCalled();
			expect(mocks.exchangeMutate).not.toHaveBeenCalled();
			expect(current().action).toMatchObject({ state: { stage: "done", result: "apiError" } });
			expect(vaultErrorText()).toBe(NOT_SENT);
			expect(getFundsActionMarkers()).toHaveLength(0);
			expect(mocks.history).toHaveBeenCalledOnce();

			act(() => current().retry());
			await runFor(0, () => current().confirm());

			expect(mocks.exchangeSubmit).toHaveBeenCalledOnce();
			expect(current().action).toMatchObject({ state: { stage: "done", result: "success" } });
			expect(getFundsActionMarkers()).toHaveLength(0);
		});

		it("signs the transfer once when the fresh checks return 14 seconds after Confirm", async () => {
			await openAndReview();
			delayLegalCheck(14_000);
			await runFor(14_000, () => current().confirm());

			expect(mocks.exchangeSubmit).toHaveBeenCalledOnce();
			expect(mocks.exchangeMutate).toHaveBeenCalledOnce();
			expect(mocks.exchangeMutate).toHaveBeenCalledWith({ vaultAddress: VAULT, isDeposit: true, usd: 5_000_000 });
			expect(current().action).toMatchObject({ state: { stage: "done", result: "success" } });
			expect(getFundsActionMarkers()).toHaveLength(0);
		});

		it.each(SLOW_CHECKS_BEFORE_AGENT_APPROVAL)(
			"starts no Agent approval and reports nothing was sent when the $check check returns 16 seconds after the click",
			async ({ delay }) => {
				delay(16_000);
				await runFor(16_000, () => current().requestAction("deposit"));

				expect(mocks.agentRegister).not.toHaveBeenCalled();
				expect(mocks.legalRefetch).toHaveBeenCalledOnce();
				expect(mocks.geoRetry).toHaveBeenCalledOnce();
				expect(mocks.agentRefetch).toHaveBeenCalledOnce();
				expect(mocks.toastError).toHaveBeenCalledOnce();
				expect(mocks.toastError).toHaveBeenCalledWith(NOT_SENT);
				expect(current().action).toBeNull();

				mocks.agentRefetch.mockResolvedValueOnce(AGENT_MISSING);
				mocks.agentRegister.mockResolvedValueOnce(AGENT);
				await runFor(0, () => current().requestAction("deposit"));

				expect(mocks.agentRegister).toHaveBeenCalledOnce();
				expect(mocks.toastError).toHaveBeenCalledOnce();
				expect(current().action?.state.stage).toBe("input");
			},
		);

		it.each(SLOW_CHECKS_BEFORE_AGENT_APPROVAL)(
			"hands the click's own deadline to the Agent approval when the $check check returns 14 seconds after the click",
			async ({ delay }) => {
				let expiredWhenRegistered: boolean | null = null;
				mocks.agentRegister.mockImplementationOnce(async (options: { deadline?: ExchangeSigningDeadlineSlot }) => {
					if (options.deadline) expiredWhenRegistered = hasExchangeActionDeadlinePassed(options.deadline);
					return AGENT;
				});
				delay(14_000);
				await runFor(14_000, () => current().requestAction("deposit"));

				expect(mocks.agentRegister).toHaveBeenCalledOnce();
				expect(mocks.agentRegister).toHaveBeenCalledWith({ persistConnection: true, deadline: expect.any(Object) });
				expect(expiredWhenRegistered).toBe(false);
				expect(mocks.agentRefetch).toHaveBeenNthCalledWith(2, AGENT);
				expect(mocks.toastError).not.toHaveBeenCalled();
				expect(current().action?.state.stage).toBe("input");

				const { deadline } = mocks.agentRegister.mock.calls[0][0] as { deadline: ExchangeSigningDeadlineSlot };
				act(() => {
					vi.advanceTimersByTime(999);
				});
				expect(hasExchangeActionDeadlinePassed(deadline)).toBe(false);
				act(() => {
					vi.advanceTimersByTime(1);
				});
				expect(hasExchangeActionDeadlinePassed(deadline)).toBe(true);
			},
		);

		it("still opens the amount step after slow eligibility checks when no approval has to be signed", async () => {
			delayLegalCheck(16_000);
			await runFor(16_000, () => current().requestAction("deposit"));

			expect(mocks.agentRegister).not.toHaveBeenCalled();
			expect(mocks.toastError).not.toHaveBeenCalled();
			expect(current().action?.state.stage).toBe("input");
		});
	});

	async function openAndReview(action: "deposit" | "withdraw" = "deposit") {
		await act(async () => current().requestAction(action));
		act(() => current().setAmount(action === "deposit" ? "5" : "1"));
		expect(current().canReview).toBe(true);
		act(() => current().review());
		expect(current().action?.state.stage).toBe("review");
	}
});

function query(data: unknown): QueryState {
	return { data, isSuccess: true, refetch: vi.fn().mockResolvedValue({ data, error: null }) };
}

function messageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
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
