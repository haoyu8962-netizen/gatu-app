// @vitest-environment jsdom

import { act, createElement, type ReactNode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradingOnboardingGate } from "@/components/trade/components/trading-onboarding-gate";

const OWNER = "0x1111111111111111111111111111111111111111";

const testState = vi.hoisted(() => ({
	activeModal: null as string | null,
	agentReady: false,
	agentVerificationStatus: "missing" as "unknown" | "loading" | "ready" | "missing" | "error",
	balances: {
		allDexClearinghouseStates: [["", { marginSummary: { accountValue: "0" } }]],
		hasAllDexsSnapshot: true,
		hasError: false,
		hasSpotStateSnapshot: true,
		isLoading: false,
		marginSummary: { accountValue: "0" },
		spotBalances: [] as { total: string }[],
	},
	closeConnection: vi.fn(),
	connectionMounted: vi.fn(),
	connectionUnmounted: vi.fn(),
	connectionProps: null as { onClose: () => void; onConnected: () => void } | null,
	depositAvailable: true,
	depositAvailabilityReason: null as string | null,
	depositUnavailableReason: null as string | null,
	env: "Mainnet" as "Mainnet" | "Testnet",
	geoResolutionStatus: "resolved" as "loading" | "error" | "resolved",
	hasWalletAccess: true,
	openDeposit: vi.fn(),
	toastError: vi.fn(),
	walletAddress: "0x1111111111111111111111111111111111111111" as string | undefined,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		hasWalletAccess: testState.hasWalletAccess,
		walletAddress: testState.walletAddress,
	}),
}));

vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => ({
		available: testState.depositAvailable,
		geoResolutionStatus: testState.geoResolutionStatus,
		reason: testState.depositAvailabilityReason,
		unavailableReason: testState.depositUnavailableReason,
	}),
}));

vi.mock("sonner", () => ({
	toast: { error: testState.toastError },
}));

vi.mock("@/lib/hyperliquid", () => ({
	useAgentStatus: () => ({
		isAgentReady: testState.agentReady,
		agentVerificationStatus: testState.agentVerificationStatus,
	}),
	useHyperliquid: () => ({ env: testState.env }),
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	useDefaultDexBalances: () => testState.balances,
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ open: testState.openDeposit }),
	useEstablishConnectionModalActions: () => ({ close: testState.closeConnection }),
	useGlobalModalType: () => testState.activeModal,
}));

vi.mock("@/components/trade/components/establish-connection-modal", () => ({
	EstablishConnectionModal: (props: { onClose: () => void; onConnected: () => void }) => {
		testState.connectionProps = props;
		useEffect(() => {
			testState.connectionMounted();
			return () => testState.connectionUnmounted();
		}, []);
		return createElement("div", { "data-testid": "connection-modal" });
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("TradingOnboardingGate", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		testState.activeModal = null;
		testState.agentReady = false;
		testState.agentVerificationStatus = "missing";
		testState.balances = {
			allDexClearinghouseStates: [["", { marginSummary: { accountValue: "0" } }]],
			hasAllDexsSnapshot: true,
			hasError: false,
			hasSpotStateSnapshot: true,
			isLoading: false,
			marginSummary: { accountValue: "0" },
			spotBalances: [],
		};
		testState.closeConnection.mockReset();
		testState.connectionMounted.mockReset();
		testState.connectionUnmounted.mockReset();
		testState.connectionProps = null;
		testState.depositAvailable = true;
		testState.depositAvailabilityReason = null;
		testState.depositUnavailableReason = null;
		testState.env = "Mainnet";
		testState.geoResolutionStatus = "resolved";
		testState.hasWalletAccess = true;
		testState.openDeposit.mockReset();
		testState.toastError.mockReset();
		testState.walletAddress = OWNER;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function renderGate(child: ReactNode = createElement("div", { "data-testid": "content" })) {
		act(() => root.render(createElement(TradingOnboardingGate, null, child)));
	}

	it.each(["missing", "unknown", "loading", "error"] as const)(
		"does not automatically prompt while Agent status is %s",
		(agentVerificationStatus) => {
			testState.agentVerificationStatus = agentVerificationStatus;
			renderGate();

			expect(container.querySelector('[data-testid="connection-modal"]')).toBeNull();
			expect(container.querySelector('[data-testid="content"]')).not.toBeNull();
		},
	);

	it("does not prompt after a route remount while Agent status is missing", () => {
		renderGate();
		act(() => root.unmount());
		root = createRoot(container);

		renderGate();

		expect(container.querySelector('[data-testid="connection-modal"]')).toBeNull();
		expect(container.querySelector('[data-testid="content"]')).not.toBeNull();
	});

	it("keeps an explicitly requested modal mounted while Agent verification changes", () => {
		testState.activeModal = "establishConnection";
		renderGate();

		expect(container.querySelector('[data-testid="connection-modal"]')).not.toBeNull();
		expect(testState.connectionMounted).toHaveBeenCalledOnce();

		testState.agentVerificationStatus = "loading";
		renderGate();
		testState.agentVerificationStatus = "error";
		renderGate();

		expect(container.querySelector('[data-testid="connection-modal"]')).not.toBeNull();
		expect(testState.connectionMounted).toHaveBeenCalledOnce();
		expect(testState.connectionUnmounted).not.toHaveBeenCalled();
	});

	it("closes an explicitly requested modal after the Agent becomes ready", () => {
		testState.activeModal = "establishConnection";
		renderGate();
		testState.agentReady = true;
		testState.agentVerificationStatus = "ready";
		renderGate();

		expect(container.querySelector('[data-testid="connection-modal"]')).toBeNull();
		expect(container.querySelector('[data-testid="content"]')).not.toBeNull();
		expect(testState.connectionUnmounted).toHaveBeenCalledOnce();
		expect(testState.closeConnection).toHaveBeenCalledOnce();
	});

	it("closes an explicitly requested connection modal", () => {
		testState.activeModal = "establishConnection";
		renderGate();
		act(() => testState.connectionProps?.onClose());

		expect(testState.closeConnection).toHaveBeenCalledOnce();
	});

	it("opens deposit after Agent registration only for a definitively empty account", () => {
		testState.activeModal = "establishConnection";
		renderGate();
		act(() => testState.connectionProps?.onConnected());

		expect(testState.openDeposit).toHaveBeenCalledWith("deposit");
	});

	it("does not open deposit when any Hyperliquid account already has funds", () => {
		testState.balances.marginSummary.accountValue = "25";
		testState.activeModal = "establishConnection";
		renderGate();
		act(() => testState.connectionProps?.onConnected());

		expect(testState.openDeposit).not.toHaveBeenCalled();
	});

	it("reports an unavailable Deposit path instead of opening a guaranteed failure", () => {
		testState.depositAvailable = false;
		testState.depositAvailabilityReason = "external-deposit-disabled";
		testState.depositUnavailableReason = "Deposits from external wallets are not enabled on Mainnet.";
		testState.activeModal = "establishConnection";
		renderGate();
		act(() => testState.connectionProps?.onConnected());

		expect(testState.openDeposit).not.toHaveBeenCalled();
		expect(testState.toastError).toHaveBeenCalledWith("Deposits from external wallets are not enabled on Mainnet.");
	});

	it("preserves empty-account onboarding until regional availability resolves", () => {
		testState.depositAvailable = false;
		testState.depositAvailabilityReason = "geo-unresolved";
		testState.depositUnavailableReason = "Checking regional availability.";
		testState.geoResolutionStatus = "loading";
		testState.activeModal = "establishConnection";
		renderGate();
		act(() => testState.connectionProps?.onConnected());

		expect(testState.openDeposit).not.toHaveBeenCalled();
		expect(testState.toastError).not.toHaveBeenCalled();

		testState.depositAvailable = true;
		testState.depositAvailabilityReason = null;
		testState.depositUnavailableReason = null;
		testState.geoResolutionStatus = "resolved";
		renderGate();

		expect(testState.openDeposit).toHaveBeenCalledOnce();
		expect(testState.openDeposit).toHaveBeenCalledWith("deposit");
	});

	it("reports a terminal regional lookup error instead of waiting silently", () => {
		testState.depositAvailable = false;
		testState.depositAvailabilityReason = "geo-unresolved";
		testState.depositUnavailableReason = "Unable to verify regional availability.";
		testState.geoResolutionStatus = "error";
		testState.activeModal = "establishConnection";
		renderGate();
		act(() => testState.connectionProps?.onConnected());

		expect(testState.openDeposit).not.toHaveBeenCalled();
		expect(testState.toastError).toHaveBeenCalledWith("Unable to verify regional availability.");

		testState.depositAvailable = true;
		testState.depositAvailabilityReason = null;
		testState.depositUnavailableReason = null;
		testState.geoResolutionStatus = "resolved";
		renderGate();
		expect(testState.openDeposit).not.toHaveBeenCalled();
	});

	it("waits for complete account snapshots before deciding to open deposit", () => {
		testState.balances.hasSpotStateSnapshot = false;
		testState.balances.isLoading = true;
		testState.activeModal = "establishConnection";
		renderGate();
		act(() => testState.connectionProps?.onConnected());
		expect(testState.openDeposit).not.toHaveBeenCalled();

		testState.balances.hasSpotStateSnapshot = true;
		testState.balances.isLoading = false;
		renderGate();
		expect(testState.openDeposit).toHaveBeenCalledWith("deposit");
	});

	it("discards a pending deposit intent after the wallet identity changes", () => {
		testState.balances.hasSpotStateSnapshot = false;
		testState.balances.isLoading = true;
		testState.activeModal = "establishConnection";
		renderGate();
		act(() => testState.connectionProps?.onConnected());
		expect(testState.openDeposit).not.toHaveBeenCalled();

		testState.walletAddress = "0x2222222222222222222222222222222222222222";
		renderGate();
		testState.walletAddress = OWNER;
		testState.balances.hasSpotStateSnapshot = true;
		testState.balances.isLoading = false;
		renderGate();

		expect(testState.openDeposit).not.toHaveBeenCalled();
	});

	it("discards a pending deposit intent after the Hyperliquid environment changes", () => {
		testState.balances.hasSpotStateSnapshot = false;
		testState.balances.isLoading = true;
		testState.activeModal = "establishConnection";
		renderGate();
		act(() => testState.connectionProps?.onConnected());
		expect(testState.openDeposit).not.toHaveBeenCalled();

		testState.env = "Testnet";
		renderGate();
		testState.balances.hasSpotStateSnapshot = true;
		testState.balances.isLoading = false;
		renderGate();

		expect(testState.openDeposit).not.toHaveBeenCalled();
	});
});
