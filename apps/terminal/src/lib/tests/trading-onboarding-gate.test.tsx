// @vitest-environment jsdom

import { act, createElement, type ReactNode, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradingOnboardingGate } from "@/components/trade/components/trading-onboarding-gate";
import { clearEmailOnboardingIntent, recordEmailOnboardingIntent } from "@/lib/wallet/email-onboarding-intent";

const OWNER = "0x1111111111111111111111111111111111111111";
const PRIVY_USER_ID = "did:privy:onboarding-user";

const testState = vi.hoisted(() => ({
	activeModal: null as string | null,
	authenticated: true,
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
	embeddedWalletAddress: undefined as `0x${string}` | undefined,
	geoResolutionStatus: "resolved" as "loading" | "error" | "resolved",
	hasWalletAccess: true,
	openDeposit: vi.fn(),
	ready: true,
	signerMode: "agent" as "owner" | "agent",
	toastError: vi.fn(),
	user: { id: "did:privy:onboarding-user" },
	walletAddress: "0x1111111111111111111111111111111111111111" as string | undefined,
	walletIntent: "external" as "embedded" | "external",
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		authenticated: testState.authenticated,
		embeddedWalletAddress: testState.embeddedWalletAddress,
		hasWalletAccess: testState.hasWalletAccess,
		ready: testState.ready,
		user: testState.user,
		walletAddress: testState.walletAddress,
		walletIntent: testState.walletIntent,
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
	useTradingStatus: () => ({
		isSignerReady: testState.agentReady,
		signerMode: testState.signerMode,
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
		clearEmailOnboardingIntent();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		testState.activeModal = null;
		testState.authenticated = true;
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
		testState.embeddedWalletAddress = undefined;
		testState.geoResolutionStatus = "resolved";
		testState.hasWalletAccess = true;
		testState.openDeposit.mockReset();
		testState.ready = true;
		testState.signerMode = "agent";
		testState.toastError.mockReset();
		testState.user = { id: PRIVY_USER_ID };
		testState.walletAddress = OWNER;
		testState.walletIntent = "external";
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function renderGate(child: ReactNode = createElement("div", { "data-testid": "content" })) {
		act(() => root.render(createElement(TradingOnboardingGate, null, child)));
	}

	function startEmailOnboarding(ownerAddress: `0x${string}` | null = OWNER) {
		testState.walletIntent = "embedded";
		testState.signerMode = "owner";
		testState.embeddedWalletAddress = ownerAddress ?? undefined;
		testState.agentReady = true;
		act(() =>
			recordEmailOnboardingIntent({ userId: PRIVY_USER_ID, env: "Mainnet", ownerAddress: ownerAddress ?? undefined }),
		);
	}

	it("opens Deposit once after fresh email login without an Agent modal", () => {
		startEmailOnboarding();
		renderGate();
		expect(testState.openDeposit).toHaveBeenCalledOnce();
		expect(container.querySelector('[data-testid="connection-modal"]')).toBeNull();
		renderGate();
		act(() => root.unmount());
		root = createRoot(container);
		renderGate();
		expect(testState.openDeposit).toHaveBeenCalledOnce();
	});

	it("consumes the login event once through Strict Mode effect replay", () => {
		startEmailOnboarding();
		act(() => root.render(createElement(StrictMode, null, createElement(TradingOnboardingGate, null, "Ready"))));
		expect(testState.openDeposit).toHaveBeenCalledOnce();
	});

	it("closes a stale Agent dialog instead of registering when an email signer is still restoring", () => {
		startEmailOnboarding();
		testState.activeModal = "establishConnection";
		testState.agentReady = false;
		renderGate();
		expect(testState.closeConnection).toHaveBeenCalledOnce();
		expect(container.querySelector('[data-testid="connection-modal"]')).toBeNull();
		expect(testState.openDeposit).not.toHaveBeenCalled();
	});

	it("does not open Deposit for a restored email session without a login event", () => {
		testState.walletIntent = "embedded";
		testState.embeddedWalletAddress = OWNER;
		testState.agentReady = true;
		renderGate();
		expect(testState.openDeposit).not.toHaveBeenCalled();
	});

	it("preserves the event while the legal gate is mounted instead of onboarding", () => {
		startEmailOnboarding();
		act(() => root.render(createElement("div", null, "Legal review")));
		expect(testState.openDeposit).not.toHaveBeenCalled();
		renderGate();
		expect(testState.openDeposit).toHaveBeenCalledOnce();
	});

	it("waits for the exact newly created email wallet to be activated", () => {
		startEmailOnboarding(null);
		testState.embeddedWalletAddress = undefined;
		testState.walletAddress = undefined;
		testState.hasWalletAccess = false;
		testState.agentReady = false;
		renderGate();
		expect(testState.openDeposit).not.toHaveBeenCalled();
		testState.embeddedWalletAddress = OWNER;
		renderGate();
		expect(testState.openDeposit).not.toHaveBeenCalled();
		testState.walletAddress = OWNER;
		testState.hasWalletAccess = true;
		testState.agentReady = true;
		renderGate();
		expect(testState.openDeposit).toHaveBeenCalledOnce();
	});

	it.each(["loading", "error"])("does not treat an email funding %s as empty", (status) => {
		startEmailOnboarding();
		testState.balances.isLoading = status === "loading";
		testState.balances.hasSpotStateSnapshot = status !== "loading";
		testState.balances.hasError = status === "error";
		renderGate();
		expect(testState.openDeposit).not.toHaveBeenCalled();
		expect(testState.toastError).not.toHaveBeenCalled();
		testState.balances.isLoading = false;
		testState.balances.hasSpotStateSnapshot = true;
		testState.balances.hasError = false;
		renderGate();
		expect(testState.openDeposit).toHaveBeenCalledOnce();
	});

	it("consumes a funded email login without reopening when balances later become zero", () => {
		startEmailOnboarding();
		testState.balances.spotBalances = [{ total: "5" }];
		renderGate();
		testState.balances.spotBalances = [];
		renderGate();
		expect(testState.openDeposit).not.toHaveBeenCalled();
	});

	it("keeps a pending email intent quiet until geo resolves and opens only once", () => {
		startEmailOnboarding();
		testState.depositAvailable = false;
		testState.geoResolutionStatus = "loading";
		renderGate();
		expect(testState.openDeposit).not.toHaveBeenCalled();
		expect(testState.toastError).not.toHaveBeenCalled();
		testState.depositAvailable = true;
		testState.geoResolutionStatus = "resolved";
		renderGate();
		expect(testState.openDeposit).toHaveBeenCalledOnce();
	});

	it.each(["geo", "feature"])("does not toast or retry a passive email %s restriction", (restriction) => {
		startEmailOnboarding();
		testState.depositAvailable = false;
		testState.geoResolutionStatus = restriction === "geo" ? "error" : "resolved";
		testState.depositUnavailableReason = "Deposit unavailable";
		renderGate();
		expect(testState.openDeposit).not.toHaveBeenCalled();
		expect(testState.toastError).not.toHaveBeenCalled();
		testState.geoResolutionStatus = "resolved";
		testState.depositAvailable = true;
		renderGate();
		expect(testState.openDeposit).not.toHaveBeenCalled();
	});

	it("does not reopen Deposit after the user opened and dismissed it while funding was loading", () => {
		startEmailOnboarding();
		testState.balances.isLoading = true;
		testState.activeModal = "deposit";
		renderGate();
		testState.activeModal = null;
		testState.balances.isLoading = false;
		renderGate();
		expect(testState.openDeposit).not.toHaveBeenCalled();
	});

	it("consumes a manually opened email Deposit before the new wallet is available", () => {
		startEmailOnboarding(null);
		testState.hasWalletAccess = false;
		testState.walletAddress = undefined;
		testState.agentReady = false;
		testState.activeModal = "deposit";
		renderGate();
		testState.activeModal = null;
		testState.hasWalletAccess = true;
		testState.walletAddress = OWNER;
		testState.embeddedWalletAddress = OWNER;
		testState.agentReady = true;
		renderGate();
		expect(testState.openDeposit).not.toHaveBeenCalled();
	});

	it.each(["user", "owner", "environment"])("discards an email intent when %s changes", (identity) => {
		startEmailOnboarding();
		testState.balances.isLoading = true;
		renderGate();
		if (identity === "user") testState.user = { id: "did:privy:other-user" };
		if (identity === "owner") testState.embeddedWalletAddress = "0x2222222222222222222222222222222222222222";
		if (identity === "environment") testState.env = "Testnet";
		renderGate();
		testState.user = { id: PRIVY_USER_ID };
		testState.embeddedWalletAddress = OWNER;
		testState.env = "Mainnet";
		testState.balances.isLoading = false;
		renderGate();
		expect(testState.openDeposit).not.toHaveBeenCalled();
	});

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

	it("does not replace another modal while a pending empty-account deposit intent resolves", () => {
		testState.balances.hasSpotStateSnapshot = false;
		testState.balances.isLoading = true;
		testState.activeModal = "establishConnection";
		renderGate();
		act(() => testState.connectionProps?.onConnected());
		expect(testState.openDeposit).not.toHaveBeenCalled();

		testState.activeModal = "settings";
		testState.balances.hasSpotStateSnapshot = true;
		testState.balances.isLoading = false;
		renderGate();
		expect(testState.openDeposit).not.toHaveBeenCalled();

		testState.activeModal = null;
		renderGate();
		expect(testState.openDeposit).toHaveBeenCalledOnce();
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
