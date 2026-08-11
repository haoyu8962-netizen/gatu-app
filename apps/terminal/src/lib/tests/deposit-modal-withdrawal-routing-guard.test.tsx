// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DepositModal } from "@/components/trade/tradebox/deposit-modal";

const testState = vi.hoisted(() => ({
	accountGuard: vi.fn(),
	activeTab: "deposit" as "deposit" | "withdraw",
	deposit: vi.fn(),
	exchangeGuards: new Map<string, ((params?: unknown, signal?: AbortSignal) => Promise<void>) | undefined>(),
	exchangeMutations: new Map<string, ReturnType<typeof vi.fn>>(),
	fetchFreshRouting: vi.fn(),
	freshRoutingError: null as Error | null,
	freshRoutingResponse: { depositRoute: "bridge", withdrawalRoute: "cctp" } as unknown,
	modalOpen: false,
	routingRefetch: vi.fn(),
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

vi.mock("@/hooks/trade/use-usdc-routing", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/hooks/trade/use-usdc-routing")>();
	return {
		...original,
		useFreshUsdcRouting: () => testState.fetchFreshRouting,
		useUsdcRouting: () => ({
			data: { depositRoute: "bridge", withdrawalRoute: "cctp" },
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
		emailAddress: null,
		embeddedWalletAddress: null,
		embeddedWalletError: null,
		ensureEmailEmbeddedWallet: vi.fn(),
		isCreatingEmbeddedWallet: false,
		needsEmbeddedWallet: false,
		shouldUseEmbeddedWallet: false,
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useReconnectWallet: () => ({
		isReconnecting: false,
		reconnectWallet: vi.fn(),
		walletsReady: true,
	}),
	useWalletSession: () => ({
		embeddedWalletAddress: null,
		hasWalletAccess: true,
		user: null,
		walletAddress: "0x1111111111111111111111111111111111111111",
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useExchange: (
		method: string,
		options?: { preExecutionGuard?: (params?: unknown, signal?: AbortSignal) => Promise<void> },
	) => {
		testState.exchangeGuards.set(method, options?.preExecutionGuard);
		const mutateAsync = testState.exchangeMutations.get(method) ?? vi.fn();
		testState.exchangeMutations.set(method, mutateAsync);
		return {
			error: null,
			isPending: false,
			isSuccess: false,
			mutateAsync,
			reset: vi.fn(),
		};
	},
	useInfo: () => ({
		data: { fee: "0", isSanctioned: false },
		isError: false,
		isFetching: false,
		isSuccess: true,
		refetch: vi.fn().mockResolvedValue({ data: { fee: "0", isSanctioned: false }, isError: false }),
	}),
}));

vi.mock("@/lib/hyperliquid/use-deposit", () => ({
	useDeposit: () => ({
		balance: "0",
		balanceError: null,
		balanceStatus: "idle",
		deposit: testState.deposit,
		error: null,
		executionAmount: null,
		hash: undefined,
		isArbitrum: true,
		isSwitching: false,
		maxAmount: "10",
		maxDepositRaw: 10_000_000n,
		networkName: "Arbitrum",
		reset: vi.fn(),
		smartDepositEnabled: true,
		status: "idle",
		switchError: null,
		switchToArbitrum: vi.fn(),
		validate: () => ({ error: null, valid: true }),
		walletProviderError: null,
		walletProviderStatus: "idle",
		walletResponseDelayed: false,
	}),
}));

vi.mock("@/lib/lazy", () => ({
	createLazyComponent: () => () => null,
}));

vi.mock("@/lib/lifi/bridge-execution-state", () => ({
	useHasExistingBridgeExecution: () => false,
}));

vi.mock("@/lib/wallet/privy-wagmi", () => ({
	getPrivyEmailAddress: () => null,
	shouldUsePrivyEmbeddedWallet: () => false,
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
		routingStatus,
	}: {
		onRetryRouting: () => void;
		onSubmit: () => void;
		routingStatus: string;
	}) =>
		createElement(
			"div",
			{ "data-testid": "deposit-routing-status", "data-status": routingStatus },
			createElement("button", { onClick: onSubmit, type: "button" }, "Submit deposit"),
			createElement("button", { onClick: onRetryRouting, type: "button" }, "Retry deposit route"),
		),
}));

vi.mock("@/components/trade/tradebox/deposit/shared-ui", () => ({
	StatusScreen: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
	WalletNotConnected: () => null,
}));

vi.mock("@/components/trade/tradebox/deposit/withdraw-form", () => ({
	WithdrawForm: ({
		onAmountChange,
		onRetryPrerequisites,
		onSubmit,
		routingStatus,
	}: {
		onAmountChange: (amount: string) => void;
		onRetryPrerequisites: () => void;
		onSubmit: () => void;
		routingStatus: string;
	}) =>
		createElement(
			"div",
			{ "data-testid": "withdraw-routing-status", "data-status": routingStatus },
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
	let root: Root;

	beforeEach(async () => {
		vi.clearAllMocks();
		testState.exchangeGuards.clear();
		testState.exchangeMutations.clear();
		testState.accountGuard.mockReset();
		testState.accountGuard.mockResolvedValue(undefined);
		testState.freshRoutingError = null;
		testState.freshRoutingResponse = { depositRoute: "bridge", withdrawalRoute: "cctp" };
		testState.activeTab = "deposit";
		testState.modalOpen = false;
		testState.deposit.mockReset();
		testState.routingRefetch.mockReset();
		testState.routingRefetch.mockResolvedValue({
			data: { depositRoute: "bridge", withdrawalRoute: "cctp" },
			isError: false,
		});
		testState.fetchFreshRouting.mockImplementation(async () => {
			if (testState.freshRoutingError) throw testState.freshRoutingError;
			return testState.freshRoutingResponse;
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		await act(async () => {
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositModal)));
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
			root.render(createElement(I18nProvider, { i18n }, createElement(DepositModal)));
		});
	}

	function getButton(label: string): HTMLButtonElement {
		const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
		if (!button) throw new Error(`Missing ${label} button`);
		return button;
	}

	it("binds sendToEvmWithData only to the official CCTP withdrawal route", async () => {
		const cctpGuard = getGuard("sendToEvmWithData");
		const legacyGuard = getGuard("withdraw3");

		testState.freshRoutingResponse = { depositRoute: "bridge", withdrawalRoute: "cctp" };
		await expect(cctpGuard()).resolves.toBeUndefined();
		await expect(legacyGuard()).rejects.toThrow("withdrawal route changed");
	});

	it("binds withdraw3 only to the official legacy bridge withdrawal route", async () => {
		const cctpGuard = getGuard("sendToEvmWithData");
		const legacyGuard = getGuard("withdraw3");

		testState.freshRoutingResponse = { depositRoute: "bridge", withdrawalRoute: "bridge" };
		await expect(legacyGuard()).resolves.toBeUndefined();
		await expect(cctpGuard()).rejects.toThrow("withdrawal route changed");
	});

	it("passes the same scheduler AbortSignal to the route and account guards", async () => {
		const signal = new AbortController().signal;
		await expect(getGuard("sendToEvmWithData")({}, signal)).resolves.toBeUndefined();

		expect(testState.fetchFreshRouting).toHaveBeenCalledWith(signal);
		expect(testState.accountGuard).toHaveBeenCalledWith(signal);
	});

	it.each([
		{ name: "the fresh request fails", response: null, error: new Error("routing unavailable") },
		{ name: "the normalized fresh response is unavailable", response: null, error: null },
	])("fails both SDK-boundary guards closed when $name", async ({ error, response }) => {
		testState.freshRoutingError = error;
		testState.freshRoutingResponse = response;

		await expect(getGuard("sendToEvmWithData")()).rejects.toThrow("Unable to verify");
		await expect(getGuard("withdraw3")()).rejects.toThrow("Unable to verify");
	});

	it("surfaces a final deposit-route request failure instead of leaving a ready button silently active", async () => {
		testState.modalOpen = true;
		testState.activeTab = "deposit";
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
});
