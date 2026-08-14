// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DepositModal } from "@/components/trade/tradebox/deposit-modal";
import { DefinitiveDepositSourceFailureError } from "@/lib/hyperliquid/deposit-source-error";

const testState = vi.hoisted(() => ({
	accountGuard: vi.fn(),
	activeTab: "deposit" as "deposit" | "withdraw",
	cctpDepositFeeCalls: [] as Array<{ amountRaw: bigint | undefined; enabled: boolean; isTestnet: boolean }>,
	deposit: vi.fn(),
	depositError: null as Error | null,
	depositExecutionRoute: null as "bridge" | "cctp" | null,
	depositHash: undefined as `0x${string}` | undefined,
	depositStatus: "idle" as "idle" | "pending" | "confirming" | "success" | "error",
	emailAddress: null as string | null,
	submissionOutcomeUnknown: false,
	exchangeSignal: undefined as AbortSignal | undefined,
	exchangeGuards: new Map<string, ((params?: unknown, signal?: AbortSignal) => Promise<void>) | undefined>(),
	exchangeMutations: new Map<string, ReturnType<typeof vi.fn>>(),
	exchangeSdkCalls: new Map<string, ReturnType<typeof vi.fn>>(),
	fetchFreshRouting: vi.fn(),
	freshRoutingError: null as Error | null,
	freshRoutingResponse: { depositRoute: "bridge", withdrawalRoute: "cctp" } as unknown,
	infoQueryCalls: [] as Array<{ enabled: boolean; method: string; params: unknown }>,
	modalOpen: false,
	preTransferFresh: {
		fee: "0",
		isSanctioned: false,
		userExists: true,
		userHasSentTx: true,
	},
	preTransferInfo: vi.fn(),
	preTransferRefetch: vi.fn(),
	preTransferReview: {
		fee: "0",
		isSanctioned: false,
		userExists: true,
		userHasSentTx: true,
	},
	routingResponse: { depositRoute: "bridge", withdrawalRoute: "cctp" } as unknown,
	routingRefetch: vi.fn(),
	spotMeta: {
		tokens: [{ index: 37, isCanonical: true, name: "USDC" }],
		universe: [],
	},
	spotMetaRefetch: vi.fn(),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@gatu/ui", () => ({
	Button: ({ children }: { children?: ReactNode }) => createElement("button", { type: "button" }, children),
	ModalContent: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
	ModalHeader: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
	ModalTitle: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));

vi.mock("@/domain/trade/balances", () => ({
	getAccountBalanceSummary: () => ({
		hasSpotFundsWhenPerpWithdrawableZero: false,
		isAvailable: true,
		usesSpotStateForPerps: false,
		spotUsdcAvailable: 0,
		withdrawable: "10",
	}),
}));

vi.mock("@/hooks/trade/use-account-abstraction-guard", () => ({
	useAccountAbstractionPreExecutionGuard: () => testState.accountGuard,
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	useDefaultDexBalances: () => ({
		accountAbstraction: "disabled",
		marginSummary: null,
		perpSummary: null,
		spotAvailableAfterMaintenance: null,
		spotBalances: [],
		withdrawable: "0",
	}),
}));

vi.mock("@/hooks/trade/use-cctp-withdrawal-fee", () => ({
	useCctpWithdrawalFee: () => ({
		data: "1",
		isError: false,
		isFetching: false,
		isSuccess: true,
		refetch: vi.fn().mockResolvedValue({ data: "1", isError: false }),
	}),
}));

vi.mock("@/hooks/trade/use-cctp-deposit-fee", () => ({
	useCctpDepositFee: (options: { amountRaw: bigint | undefined; enabled: boolean; isTestnet: boolean }) => {
		testState.cctpDepositFeeCalls.push(options);
		return {
			calculation: { maxFeeRaw: 200_000n, netAmountRaw: 4_800_000n },
			hasSufficientFastAllowance: true,
			isError: false,
			isLoading: false,
			refetch: vi.fn().mockResolvedValue({
				data: {
					fastAllowanceRaw: 100_000_000n,
					feeQuote: {
						finalityThreshold: 1000,
						forwardFeeRaw: { high: 200_001n, low: 199_999n, med: 200_000n },
						minimumFeeBps: "0",
					},
				},
				isError: false,
			}),
		};
	},
}));

vi.mock("@/config/cctp-deposit", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/config/cctp-deposit")>();
	return {
		...original,
		isCctpExternalDepositEnabled: () => true,
		isCctpSponsoredDepositEnabled: () => true,
	};
});

vi.mock("@/hooks/trade/use-cctp-deposit-tracking", () => ({
	useCctpDepositTracking: () => ({ data: undefined, isError: false, recoveryRecord: null }),
}));

vi.mock("@/hooks/trade/use-usdc-routing", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/hooks/trade/use-usdc-routing")>();
	return {
		...original,
		useFreshUsdcRouting: () => testState.fetchFreshRouting,
		useUsdcRouting: () => ({
			data: testState.routingResponse,
			isError: false,
			isFetching: false,
			refetch: testState.routingRefetch,
		}),
	};
});

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => false,
}));

vi.mock("@/hooks/wallet/use-email-embedded-wallet", () => ({
	useEmailEmbeddedWallet: () => ({
		emailAddress: testState.emailAddress,
		embeddedWalletAddress: testState.emailAddress ? "0x1111111111111111111111111111111111111111" : null,
		embeddedWalletError: null,
		ensureEmailEmbeddedWallet: vi.fn(),
		isCreatingEmbeddedWallet: false,
		needsEmbeddedWallet: false,
		shouldUseEmbeddedWallet: testState.emailAddress !== null,
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useReconnectWallet: () => ({
		isReconnecting: false,
		reconnectWallet: vi.fn(),
		walletsReady: true,
	}),
	useWalletSession: () => ({
		embeddedWalletAddress: testState.emailAddress ? "0x1111111111111111111111111111111111111111" : null,
		hasWalletAccess: true,
		user: testState.emailAddress ? {} : null,
		walletAddress: "0x1111111111111111111111111111111111111111",
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	infoQueryOptions: (_info: unknown, method: string, params: unknown, env: string) => ({
		queryKey: ["hl", env, method, params],
	}),
	useExchange: (
		method: string,
		options?: { preExecutionGuard?: (params?: unknown, signal?: AbortSignal) => Promise<void> },
	) => {
		testState.exchangeGuards.set(method, options?.preExecutionGuard);
		let sdkCall = testState.exchangeSdkCalls.get(method);
		if (!sdkCall) {
			sdkCall = vi.fn().mockResolvedValue(undefined);
			testState.exchangeSdkCalls.set(method, sdkCall);
		}
		let mutateAsync = testState.exchangeMutations.get(method);
		if (!mutateAsync) {
			const callSdk = sdkCall as (params: unknown) => unknown;
			mutateAsync = vi.fn(async (params: unknown) => {
				const signal = testState.exchangeSignal ?? new AbortController().signal;
				await options?.preExecutionGuard?.(params, signal);
				return callSdk(params);
			});
		}
		testState.exchangeMutations.set(method, mutateAsync);
		return {
			error: null,
			isPending: false,
			isSuccess: false,
			mutateAsync,
			reset: vi.fn(),
		};
	},
	useHyperliquid: () => ({
		env: "Mainnet",
		info: { preTransferCheck: testState.preTransferInfo },
	}),
	useInfo: (method: string, params: unknown, options?: { enabled?: boolean }) => {
		testState.infoQueryCalls.push({ enabled: options?.enabled !== false, method, params });
		if (method === "spotMeta") {
			return {
				data: testState.spotMeta,
				isError: false,
				isFetching: false,
				isSuccess: options?.enabled !== false,
				refetch: testState.spotMetaRefetch,
			};
		}
		if (method === "preTransferCheck") {
			return {
				data: testState.preTransferReview,
				isError: false,
				isFetching: false,
				isSuccess: options?.enabled !== false,
				refetch: testState.preTransferRefetch,
			};
		}
		throw new Error(`Unexpected info method: ${method}`);
	},
}));

vi.mock("@/lib/hyperliquid/use-deposit", () => ({
	useDeposit: () => ({
		balance: "0",
		balanceError: null,
		balanceStatus: "idle",
		deposit: testState.deposit,
		error: testState.depositError,
		executionAmount: null,
		executionRoute: testState.depositExecutionRoute,
		hash: testState.depositHash,
		isArbitrum: true,
		isSwitching: false,
		maxAmount: "10",
		maxDepositRaw: 10_000_000n,
		networkName: "Arbitrum",
		reset: vi.fn(),
		sponsoredCctpEnabled: true,
		status: testState.depositStatus,
		switchError: null,
		switchToArbitrum: vi.fn(),
		validate: () => ({ error: null, valid: true }),
		walletProviderError: null,
		walletProviderStatus: "idle",
		walletResponseDelayed: false,
		cctpRecoveryUnavailable: false,
		submissionOutcomeUnknown: testState.submissionOutcomeUnknown,
	}),
}));

vi.mock("@/lib/lazy", () => ({
	createLazyComponent: () => () => null,
}));

vi.mock("@/lib/lifi/bridge-execution-state", () => ({
	useHasExistingBridgeExecution: () => false,
}));

vi.mock("@/lib/wallet/privy-wagmi", () => ({
	getPrivyEmailAddress: () => testState.emailAddress,
	shouldUsePrivyEmbeddedWallet: () => testState.emailAddress !== null,
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ close: vi.fn() }),
	useDepositModalOpen: () => testState.modalOpen,
	useDepositModalTab: () => testState.activeTab,
	useTransferModalActions: () => ({ open: vi.fn() }),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useIsTestnet: () => false,
}));

vi.mock("@/components/trade/components/pending-action-modal", () => ({
	PendingActionModal: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));

vi.mock("@/components/trade/tradebox/deposit/deposit-form", () => ({
	DepositForm: ({
		onRetryRouting,
		onSubmit,
		requiresExplicitFundingDeposit,
		routingStatus,
		usesFundingAddressFlow,
	}: {
		onRetryRouting: () => void;
		onSubmit: () => void;
		requiresExplicitFundingDeposit?: boolean;
		routingStatus: string;
		usesFundingAddressFlow: boolean;
	}) =>
		createElement(
			"div",
			{ "data-testid": "deposit-routing-status", "data-status": routingStatus },
			!usesFundingAddressFlow || requiresExplicitFundingDeposit
				? createElement(
						"button",
						{ onClick: onSubmit, type: "button" },
						requiresExplicitFundingDeposit ? "Deposit 10 USDC" : "Submit deposit",
					)
				: null,
			createElement("button", { onClick: onRetryRouting, type: "button" }, "Retry deposit route"),
		),
}));

vi.mock("@/components/trade/tradebox/deposit/shared-ui", () => ({
	StatusScreen: ({
		children,
		description,
		heading,
	}: {
		children?: ReactNode;
		description?: ReactNode;
		heading?: ReactNode;
	}) =>
		createElement(
			"div",
			{ "data-testid": "status-screen" },
			createElement("p", { "data-testid": "status-heading" }, heading),
			createElement("p", { "data-testid": "status-description" }, description),
			children,
		),
	WalletNotConnected: () => null,
}));

vi.mock("@/components/trade/tradebox/deposit/withdraw-form", () => ({
	WithdrawForm: ({
		activationFee,
		maxAmount,
		onAmountChange,
		onRetryPrerequisites,
		onSubmit,
		routingStatus,
	}: {
		activationFee: string;
		maxAmount: string;
		onAmountChange: (amount: string) => void;
		onRetryPrerequisites: () => void;
		onSubmit: () => void;
		routingStatus: string;
	}) =>
		createElement(
			"div",
			{
				"data-activation-fee": activationFee,
				"data-max-amount": maxAmount,
				"data-testid": "withdraw-routing-status",
				"data-status": routingStatus,
			},
			createElement("button", { onClick: () => onAmountChange("2"), type: "button" }, "Set amount"),
			createElement("button", { onClick: onSubmit, type: "button" }, "Submit withdrawal"),
			createElement("button", { onClick: onRetryPrerequisites, type: "button" }, "Retry withdrawal route"),
		),
}));

vi.mock("@/components/trade/tradebox/deposit/wrong-network-screen", () => ({
	WrongNetworkScreen: () => null,
}));

describe("DepositModal withdrawal route pre-execution guard wiring", () => {
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	let root: Root;

	beforeEach(async () => {
		vi.clearAllMocks();
		testState.exchangeGuards.clear();
		testState.exchangeMutations.clear();
		testState.exchangeSdkCalls.clear();
		testState.exchangeSignal = new AbortController().signal;
		testState.accountGuard.mockReset();
		testState.accountGuard.mockResolvedValue(undefined);
		testState.freshRoutingError = null;
		testState.freshRoutingResponse = { depositRoute: "bridge", withdrawalRoute: "cctp" };
		testState.infoQueryCalls.length = 0;
		testState.activeTab = "deposit";
		testState.modalOpen = false;
		testState.deposit.mockReset();
		testState.depositError = null;
		testState.depositExecutionRoute = null;
		testState.depositHash = undefined;
		testState.depositStatus = "idle";
		testState.emailAddress = null;
		testState.cctpDepositFeeCalls.length = 0;
		testState.submissionOutcomeUnknown = false;
		testState.preTransferFresh = {
			fee: "0",
			isSanctioned: false,
			userExists: true,
			userHasSentTx: true,
		};
		testState.preTransferReview = {
			fee: "0",
			isSanctioned: false,
			userExists: true,
			userHasSentTx: true,
		};
		testState.preTransferInfo.mockReset();
		testState.preTransferInfo.mockImplementation(async () => testState.preTransferFresh);
		testState.preTransferRefetch.mockReset();
		testState.preTransferRefetch.mockImplementation(async () => ({
			data: testState.preTransferReview,
			isError: false,
		}));
		testState.routingResponse = { depositRoute: "bridge", withdrawalRoute: "cctp" };
		testState.routingRefetch.mockReset();
		testState.routingRefetch.mockResolvedValue({
			data: { depositRoute: "bridge", withdrawalRoute: "cctp" },
			isError: false,
		});
		testState.spotMeta = {
			tokens: [{ index: 37, isCanonical: true, name: "USDC" }],
			universe: [],
		};
		testState.spotMetaRefetch.mockReset();
		testState.spotMetaRefetch.mockImplementation(async () => ({ data: testState.spotMeta, isError: false }));
		testState.fetchFreshRouting.mockImplementation(async () => {
			if (testState.freshRoutingError) throw testState.freshRoutingError;
			return testState.freshRoutingResponse;
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		await act(async () => {
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(I18nProvider, { i18n }, createElement(DepositModal)),
				),
			);
		});
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function getGuard(method: "sendToEvmWithData" | "withdraw3") {
		const guard = testState.exchangeGuards.get(method);
		if (!guard) throw new Error(`Missing pre-execution guard for ${method}`);
		return guard;
	}

	async function rerender() {
		await act(async () => {
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(I18nProvider, { i18n }, createElement(DepositModal)),
				),
			);
		});
	}

	function getButton(label: string): HTMLButtonElement {
		const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
		if (!button) throw new Error(`Missing ${label} button`);
		return button;
	}

	async function submitWithdrawal() {
		await rerender();
		act(() => getButton("Set amount").click());
		await act(async () => getButton("Submit withdrawal").click());
	}

	it("derives the CCTP pre-transfer target from spotMeta and checks it at the SDK boundary", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		const signal = new AbortController().signal;
		testState.exchangeSignal = signal;

		await submitWithdrawal();

		const expectedParams = {
			source: "0x1111111111111111111111111111111111111111",
			user: "0x2000000000000000000000000000000000000025",
		};
		const preTransferQueryCall = testState.infoQueryCalls.find(
			(call) => call.method === "preTransferCheck" && call.enabled,
		);
		expect(preTransferQueryCall?.params).toEqual(expectedParams);
		expect(testState.preTransferInfo).toHaveBeenCalledWith(expectedParams, signal);
		expect(testState.fetchFreshRouting).toHaveBeenCalledWith(signal);
		expect(testState.accountGuard).toHaveBeenCalledWith(signal);
		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).toHaveBeenCalledOnce();
		expect(testState.exchangeSdkCalls.get("withdraw3")).not.toHaveBeenCalled();
	});

	it("keeps activation fees and pre-transfer checks out of the legacy withdrawal route", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.routingResponse = { depositRoute: "bridge", withdrawalRoute: "bridge" };
		testState.freshRoutingResponse = { depositRoute: "bridge", withdrawalRoute: "bridge" };
		testState.preTransferReview = { ...testState.preTransferReview, fee: "4" };

		await submitWithdrawal();

		const form = container.querySelector('[data-testid="withdraw-routing-status"]');
		expect(form?.getAttribute("data-activation-fee")).toBe("0");
		expect(form?.getAttribute("data-max-amount")).toBe("10");
		expect(testState.preTransferRefetch).not.toHaveBeenCalled();
		expect(testState.preTransferInfo).not.toHaveBeenCalled();
		expect(testState.exchangeSdkCalls.get("withdraw3")).toHaveBeenCalledOnce();
		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
	});

	it("rejects a queue-boundary activation fee change before calling the exchange SDK", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.preTransferFresh = { ...testState.preTransferFresh, fee: "0.5" };

		await submitWithdrawal();

		expect(testState.exchangeMutations.get("sendToEvmWithData")).toHaveBeenCalledOnce();
		expect(testState.preTransferInfo).toHaveBeenCalledOnce();
		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
		expect(
			queryClient.getQueryData([
				"hl",
				"Mainnet",
				"preTransferCheck",
				{
					user: "0x2000000000000000000000000000000000000025",
					source: "0x1111111111111111111111111111111111111111",
				},
			]),
		).toEqual(testState.preTransferFresh);
	});

	it("rejects a queue-boundary sanctions flip before calling the exchange SDK", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.preTransferFresh = { ...testState.preTransferFresh, isSanctioned: true };

		await submitWithdrawal();

		expect(testState.exchangeMutations.get("sendToEvmWithData")).toHaveBeenCalledOnce();
		expect(testState.preTransferInfo).toHaveBeenCalledOnce();
		expect(testState.exchangeSdkCalls.get("sendToEvmWithData")).not.toHaveBeenCalled();
	});

	it.each([
		{ name: "the fresh request fails", response: null, error: new Error("routing unavailable") },
		{ name: "the normalized fresh response is unavailable", response: null, error: null },
	])("fails the legacy SDK-boundary guard closed when $name", async ({ error, response }) => {
		testState.freshRoutingError = error;
		testState.freshRoutingResponse = response;

		await expect(getGuard("withdraw3")({}, new AbortController().signal)).rejects.toThrow("Unable to verify");
	});

	it("surfaces a final deposit-route request failure instead of leaving a ready button silently active", async () => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.freshRoutingError = new Error("transport failed");
		await rerender();

		await act(async () => getButton("Submit deposit").click());

		expect(testState.deposit).not.toHaveBeenCalled();
		expect(container.querySelector('[data-testid="deposit-routing-status"]')?.getAttribute("data-status")).toBe(
			"error",
		);

		await act(async () => getButton("Retry deposit route").click());
		expect(container.querySelector('[data-testid="deposit-routing-status"]')?.getAttribute("data-status")).toBe(
			"ready",
		);
	});

	it("queries the shared Circle fee cache for the embedded wallet's current sponsored deposit amount", async () => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";
		testState.emailAddress = "trader@example.com";
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.cctpDepositFeeCalls.length = 0;

		await rerender();

		expect(testState.cctpDepositFeeCalls).toContainEqual({
			amountRaw: 10_000_000n,
			enabled: true,
			isTestnet: false,
		});
	});

	it("submits a mainnet sponsored deposit only after the user explicitly confirms the reviewed full balance", async () => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";
		testState.emailAddress = "trader@example.com";
		testState.routingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };
		testState.freshRoutingResponse = { depositRoute: "cctp", withdrawalRoute: "cctp" };

		await rerender();

		expect(testState.deposit).not.toHaveBeenCalled();
		await act(async () => getButton("Deposit 10 USDC").click());

		expect(testState.deposit).toHaveBeenCalledOnce();
		expect(testState.deposit).toHaveBeenCalledWith("10", {
			expectedBalanceRaw: 10_000_000n,
			expectedCctpMaxFeeRaw: 200_000n,
		});
	});

	it("surfaces a final withdrawal-route request failure without entering either mutation", async () => {
		testState.modalOpen = true;
		testState.activeTab = "withdraw";
		testState.freshRoutingError = new Error("transport failed");
		await rerender();

		act(() => getButton("Set amount").click());
		await act(async () => getButton("Submit withdrawal").click());

		expect(testState.exchangeMutations.get("sendToEvmWithData")).not.toHaveBeenCalled();
		expect(testState.exchangeMutations.get("withdraw3")).not.toHaveBeenCalled();
		expect(container.querySelector('[data-testid="withdraw-routing-status"]')?.getAttribute("data-status")).toBe(
			"error",
		);

		await act(async () => getButton("Retry withdrawal route").click());
		expect(container.querySelector('[data-testid="withdraw-routing-status"]')?.getAttribute("data-status")).toBe(
			"ready",
		);
	});

	it("renders a localized definitive source failure as failed without parsing its wording", async () => {
		testState.modalOpen = true;
		testState.depositStatus = "error";
		testState.depositHash = `0x${"1".repeat(64)}`;
		testState.depositExecutionRoute = "cctp";
		testState.depositError = new DefinitiveDepositSourceFailureError(
			"source-transaction-reverted",
			"交易已在 Arbitrum 上回滚",
		);

		await rerender();

		expect(container.querySelector('[data-testid="status-heading"]')?.textContent).toBe("Deposit failed");
		expect(container.querySelector('[data-testid="status-description"]')?.textContent).toBe("交易已在 Arbitrum 上回滚");
	});

	it("does not infer a definitive outcome from an unstructured error message", async () => {
		testState.modalOpen = true;
		testState.depositStatus = "error";
		testState.depositHash = `0x${"2".repeat(64)}`;
		testState.depositExecutionRoute = "cctp";
		testState.depositError = new Error("Transaction reverted on Arbitrum");

		await rerender();

		expect(container.querySelector('[data-testid="status-heading"]')?.textContent).toBe("Deposit status unknown");
	});

	it("does not offer a retry when a sponsored submission may have reached the bundler without returning a hash", async () => {
		testState.modalOpen = true;
		testState.depositStatus = "error";
		testState.depositHash = undefined;
		testState.depositExecutionRoute = "cctp";
		testState.depositError = new Error("Bundler response was interrupted");
		testState.submissionOutcomeUnknown = true;

		await rerender();

		expect(container.querySelector('[data-testid="status-heading"]')?.textContent).toBe("Deposit status unknown");
		expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "Retry")).toBe(
			false,
		);
	});
});
