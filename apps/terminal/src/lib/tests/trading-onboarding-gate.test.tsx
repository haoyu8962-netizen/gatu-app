// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradingOnboardingGate } from "@/components/trade/components/trading-onboarding-gate";

const OWNER = "0x1111111111111111111111111111111111111111";

const testState = vi.hoisted(() => ({
	activeModal: null as string | null,
	agentLoading: false,
	agentReady: false,
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
	connectionProps: null as { onClose: () => void; onConnected: () => void } | null,
	hasWalletAccess: true,
	openDeposit: vi.fn(),
	walletAddress: "0x1111111111111111111111111111111111111111" as string | undefined,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		hasWalletAccess: testState.hasWalletAccess,
		walletAddress: testState.walletAddress,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useAgentStatus: () => ({
		isAgentLoading: testState.agentLoading,
		isAgentReady: testState.agentReady,
	}),
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
		testState.agentLoading = false;
		testState.agentReady = false;
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
		testState.connectionProps = null;
		testState.hasWalletAccess = true;
		testState.openDeposit.mockReset();
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

	it("automatically presents Agent connection after the legal gate", () => {
		renderGate();

		expect(container.querySelector('[data-testid="connection-modal"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="content"]')).toBeNull();
	});

	it("allows the automatic prompt to be dismissed for the current wallet", () => {
		renderGate();
		act(() => testState.connectionProps?.onClose());

		expect(container.querySelector('[data-testid="connection-modal"]')).toBeNull();
		expect(container.querySelector('[data-testid="content"]')).not.toBeNull();
		expect(testState.closeConnection).not.toHaveBeenCalled();
	});

	it("closes an explicitly requested connection modal", () => {
		testState.activeModal = "establishConnection";
		renderGate();
		act(() => testState.connectionProps?.onClose());

		expect(testState.closeConnection).toHaveBeenCalledOnce();
	});

	it("opens deposit after Agent registration only for a definitively empty account", () => {
		renderGate();
		act(() => testState.connectionProps?.onConnected());

		expect(testState.openDeposit).toHaveBeenCalledWith("deposit");
	});

	it("does not open deposit when any Hyperliquid account already has funds", () => {
		testState.balances.marginSummary.accountValue = "25";
		renderGate();
		act(() => testState.connectionProps?.onConnected());

		expect(testState.openDeposit).not.toHaveBeenCalled();
	});

	it("waits for complete account snapshots before deciding to open deposit", () => {
		testState.balances.hasSpotStateSnapshot = false;
		testState.balances.isLoading = true;
		renderGate();
		act(() => testState.connectionProps?.onConnected());
		expect(testState.openDeposit).not.toHaveBeenCalled();

		testState.balances.hasSpotStateSnapshot = true;
		testState.balances.isLoading = false;
		renderGate();
		expect(testState.openDeposit).toHaveBeenCalledWith("deposit");
	});
});
