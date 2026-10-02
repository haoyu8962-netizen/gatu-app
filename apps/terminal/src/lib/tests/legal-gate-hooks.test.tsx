// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLegalGate } from "@/hooks/trade/use-legal-gate";
import { useReferralLegalGate } from "@/hooks/trade/use-referral-legal-gate";

const OWNER = "0x1111111111111111111111111111111111111111";
const EMBEDDED_OWNER = "0x2222222222222222222222222222222222222222";

const testState = vi.hoisted(() => ({
	walletSession: {
		address: "0x1111111111111111111111111111111111111111" as string | undefined,
		authenticated: true,
		authenticationModalOpen: false,
		authenticationReady: true,
		hasWalletAccess: true,
		isConnected: true,
		isConnecting: false,
		isReconnecting: false,
		sessionMode: "wallet" as "wallet" | "agent-only" | "disconnected",
		walletDirectoryReady: true,
		walletIntent: "external" as "ambiguous" | "embedded" | "external" | "unavailable",
	},
	emailWallet: {
		embeddedWalletAddress: undefined as string | undefined,
		needsEmbeddedWallet: false,
		isCreatingEmbeddedWallet: false,
		embeddedWalletError: null as Error | null,
		ensureEmailEmbeddedWallet: vi.fn(() => Promise.resolve("0x2222222222222222222222222222222222222222")),
	},
	legalStatus: {
		data: {
			acceptedTerms: true as boolean,
			userAllowed: true,
			canPerformActions: true,
			canUseReferrals: true,
		},
		error: null as Error | null,
		isError: false,
		isPending: false,
		refetch: vi.fn(),
	},
	acceptance: {
		error: null as Error | null,
		isPending: false,
		mutateAsync: vi.fn(),
		reset: vi.fn(),
	},
	reportClientError: vi.fn(),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => testState.walletSession,
}));

vi.mock("@/hooks/wallet/use-email-embedded-wallet", () => ({
	useEmailEmbeddedWallet: () => testState.emailWallet,
}));

vi.mock("@/hooks/wallet/use-explicit-terms-acceptance", () => ({
	useExplicitTermsAcceptance: () => testState.acceptance,
}));

vi.mock("@/lib/hyperliquid", () => ({
	classifyLegalStatusError: () => "unknown",
	useLegalStatus: () => testState.legalStatus,
}));

vi.mock("@/lib/error-reporting/client", () => ({
	reportClientError: testState.reportClientError,
}));

let latestLegalGate: ReturnType<typeof useLegalGate> | null = null;

function LegalGateProbe() {
	const legalGate = useLegalGate();
	const referralGate = useReferralLegalGate();
	latestLegalGate = legalGate;

	return createElement("output", {
		"data-legal-state": legalGate.state,
		"data-referral-state": referralGate.state,
	});
}

describe("legal gate hooks", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		Object.assign(testState.walletSession, {
			address: OWNER,
			authenticated: true,
			authenticationModalOpen: false,
			authenticationReady: true,
			hasWalletAccess: true,
			isConnected: true,
			isConnecting: false,
			isReconnecting: false,
			sessionMode: "wallet",
			walletDirectoryReady: true,
			walletIntent: "external",
		});
		Object.assign(testState.emailWallet, {
			embeddedWalletAddress: undefined,
			needsEmbeddedWallet: false,
			isCreatingEmbeddedWallet: false,
			embeddedWalletError: null,
		});
		testState.legalStatus.data.acceptedTerms = true;
		testState.legalStatus.isError = false;
		latestLegalGate = null;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	function setEmailSessionWithoutActiveOwner(embeddedWalletAddress: string | undefined) {
		Object.assign(testState.walletSession, {
			address: undefined,
			hasWalletAccess: false,
			isConnected: false,
			sessionMode: "disconnected",
			walletIntent: "embedded",
		});
		testState.emailWallet.embeddedWalletAddress = embeddedWalletAddress;
	}

	function renderProbe() {
		act(() => root.render(createElement(LegalGateProbe)));
		return container.querySelector("output");
	}

	function expectStates(state: string) {
		const probe = container.querySelector("output");
		expect(probe?.getAttribute("data-legal-state")).toBe(state);
		expect(probe?.getAttribute("data-referral-state")).toBe(state);
	}

	it("keeps both gates checking until the authenticated signer state is resolved", () => {
		testState.walletSession.authenticationReady = false;
		renderProbe();
		expectStates("checking");

		Object.assign(testState.walletSession, {
			authenticationReady: true,
			walletDirectoryReady: false,
		});
		renderProbe();
		expectStates("checking");

		Object.assign(testState.walletSession, {
			walletDirectoryReady: true,
			isReconnecting: true,
		});
		renderProbe();
		expectStates("checking");

		Object.assign(testState.walletSession, {
			address: undefined,
			hasWalletAccess: false,
			isConnected: false,
			isReconnecting: false,
			sessionMode: "disconnected",
		});
		renderProbe();
		expectStates("wallet_required");
	});

	it("treats a resolved unauthenticated session as inactive", () => {
		Object.assign(testState.walletSession, {
			address: undefined,
			authenticated: false,
			hasWalletAccess: false,
			isConnected: false,
			sessionMode: "disconnected",
			walletDirectoryReady: false,
		});

		renderProbe();
		expectStates("checking");

		testState.walletSession.walletDirectoryReady = true;
		renderProbe();
		expectStates("inactive");
	});

	it("preserves verified agent-only authorization after Privy initializes", () => {
		Object.assign(testState.walletSession, {
			authenticated: false,
			hasWalletAccess: false,
			sessionMode: "agent-only",
		});

		renderProbe();
		expectStates("accepted");
	});

	it("fails closed when a legal-status refetch errors with stale accepted data", () => {
		testState.legalStatus.isError = true;
		renderProbe();
		expectStates("error");
	});

	it("waits while an email session's wallet is created silently and offers a retry when it fails", () => {
		setEmailSessionWithoutActiveOwner(undefined);
		testState.emailWallet.needsEmbeddedWallet = true;
		renderProbe();
		expectStates("checking");

		testState.emailWallet.isCreatingEmbeddedWallet = true;
		renderProbe();
		expectStates("checking");

		Object.assign(testState.emailWallet, {
			isCreatingEmbeddedWallet: false,
			embeddedWalletError: new Error("Embedded wallet creation timed out"),
		});
		renderProbe();
		expectStates("wallet_setup_failed");

		act(() => latestLegalGate?.retryWalletSetup());
		expect(testState.emailWallet.ensureEmailEmbeddedWallet).toHaveBeenCalledOnce();
	});

	it("gives a created email wallet a bounded grace period to become the active owner", () => {
		vi.useFakeTimers();
		setEmailSessionWithoutActiveOwner(EMBEDDED_OWNER);
		renderProbe();
		expectStates("checking");

		act(() => vi.advanceTimersByTime(9_999));
		expectStates("checking");

		act(() => vi.advanceTimersByTime(1));
		expectStates("wallet_required");

		Object.assign(testState.walletSession, {
			address: EMBEDDED_OWNER,
			hasWalletAccess: true,
			isConnected: true,
			sessionMode: "wallet",
		});
		renderProbe();
		expectStates("accepted");

		setEmailSessionWithoutActiveOwner(EMBEDDED_OWNER);
		renderProbe();
		expectStates("checking");
	});

	it("counts the activation grace from the moment the wallet exists, also while the signer is still connecting", () => {
		vi.useFakeTimers();
		setEmailSessionWithoutActiveOwner(EMBEDDED_OWNER);
		testState.walletSession.isConnecting = true;
		renderProbe();
		expectStates("checking");

		act(() => vi.advanceTimersByTime(11_000));
		expectStates("checking");

		testState.walletSession.isConnecting = false;
		renderProbe();
		expectStates("wallet_required");
	});

	it("never applies the email wallet setup to an external wallet session", () => {
		Object.assign(testState.walletSession, {
			address: undefined,
			hasWalletAccess: false,
			isConnected: false,
			sessionMode: "disconnected",
		});
		Object.assign(testState.emailWallet, { embeddedWalletAddress: EMBEDDED_OWNER, needsEmbeddedWallet: true });
		renderProbe();
		expectStates("wallet_required");
	});

	it("opens the policy dialog only after the Privy modal closes", () => {
		testState.legalStatus.data.acceptedTerms = false;
		testState.walletSession.authenticationModalOpen = true;
		renderProbe();
		expectStates("checking");

		testState.walletSession.authenticationModalOpen = false;
		renderProbe();
		expectStates("required");
	});
});
