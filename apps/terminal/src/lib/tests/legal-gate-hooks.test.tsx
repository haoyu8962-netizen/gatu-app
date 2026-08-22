// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLegalGate } from "@/hooks/trade/use-legal-gate";
import { useReferralLegalGate } from "@/hooks/trade/use-referral-legal-gate";

const OWNER = "0x1111111111111111111111111111111111111111";

const testState = vi.hoisted(() => ({
	walletSession: {
		address: "0x1111111111111111111111111111111111111111" as string | undefined,
		authenticated: true,
		authenticationReady: true,
		hasWalletAccess: true,
		isConnected: true,
		isConnecting: false,
		isReconnecting: false,
		sessionMode: "wallet" as "wallet" | "agent-only" | "disconnected",
		walletDirectoryReady: true,
	},
	legalStatus: {
		data: {
			acceptedTerms: true,
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

function LegalGateProbe() {
	const legalGate = useLegalGate();
	const referralGate = useReferralLegalGate();

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
			authenticationReady: true,
			hasWalletAccess: true,
			isConnected: true,
			isConnecting: false,
			isReconnecting: false,
			sessionMode: "wallet",
			walletDirectoryReady: true,
		});
		testState.legalStatus.isError = false;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

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
});
