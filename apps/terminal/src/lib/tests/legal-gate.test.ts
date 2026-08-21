import { describe, expect, it } from "vitest";
import { deriveLegalGateSession, deriveLegalGateState } from "@/hooks/trade/use-legal-gate";

const READY = {
	hasSession: true,
	isSessionPending: false,
	hasOwnerIdentity: true,
	hasWalletAccess: true,
	hasStatusError: false,
	isPending: false,
	isSubmitting: false,
	acceptedTerms: true,
	userAllowed: true,
	canPerformActions: true,
};

const STABLE_WALLET_SESSION = {
	authenticationReady: true,
	authenticated: true,
	walletDirectoryReady: true,
	isConnecting: false,
	isReconnecting: false,
	isConnected: true,
	sessionMode: "wallet" as const,
};

describe("legal gate session", () => {
	it("waits for Privy authentication and the connected-wallet directory", () => {
		expect(deriveLegalGateSession({ ...STABLE_WALLET_SESSION, authenticationReady: false })).toEqual({
			hasSession: false,
			isSessionPending: true,
		});
		expect(deriveLegalGateSession({ ...STABLE_WALLET_SESSION, walletDirectoryReady: false })).toEqual({
			hasSession: false,
			isSessionPending: true,
		});
	});

	it("waits while the exact signer is connecting or reconnecting", () => {
		expect(deriveLegalGateSession({ ...STABLE_WALLET_SESSION, isConnecting: true })).toEqual({
			hasSession: false,
			isSessionPending: true,
		});
		expect(deriveLegalGateSession({ ...STABLE_WALLET_SESSION, isReconnecting: true })).toEqual({
			hasSession: false,
			isSessionPending: true,
		});
	});

	it("treats only a resolved unauthenticated state as inactive", () => {
		expect(
			deriveLegalGateSession({
				...STABLE_WALLET_SESSION,
				authenticated: false,
				isConnected: false,
				sessionMode: "disconnected",
			}),
		).toEqual({ hasSession: false, isSessionPending: false });
		expect(
			deriveLegalGateSession({
				...STABLE_WALLET_SESSION,
				authenticated: false,
				walletDirectoryReady: false,
				isConnected: false,
				sessionMode: "disconnected",
			}),
		).toEqual({ hasSession: false, isSessionPending: true });
	});

	it("preserves a verified agent-only session after Privy is resolved", () => {
		expect(
			deriveLegalGateSession({
				...STABLE_WALLET_SESSION,
				authenticated: false,
				sessionMode: "agent-only",
			}),
		).toEqual({ hasSession: true, isSessionPending: false });
	});
});

describe("legal gate state", () => {
	it("does not gate disconnected sessions and permits verified agent-only sessions", () => {
		expect(deriveLegalGateState({ ...READY, hasSession: false, hasOwnerIdentity: false, hasWalletAccess: false })).toBe(
			"inactive",
		);
		expect(deriveLegalGateState({ ...READY, hasWalletAccess: false })).toBe("accepted");
	});

	it("requires reconnection when authentication exists without an unambiguous owner", () => {
		expect(
			deriveLegalGateState({
				...READY,
				hasOwnerIdentity: false,
				hasWalletAccess: false,
				acceptedTerms: undefined,
				isPending: true,
			}),
		).toBe("wallet_required");
	});

	it("keeps lower-priority flows blocked while legal status loads", () => {
		expect(deriveLegalGateState({ ...READY, acceptedTerms: undefined, isPending: true })).toBe("checking");
	});

	it("keeps lower-priority flows blocked while the wallet session resolves", () => {
		expect(
			deriveLegalGateState({
				...READY,
				hasSession: false,
				isSessionPending: true,
				hasOwnerIdentity: false,
				acceptedTerms: undefined,
			}),
		).toBe("checking");
	});

	it("requires acceptance only for an allowed wallet with unaccepted terms", () => {
		expect(deriveLegalGateState({ ...READY, acceptedTerms: false })).toBe("required");
		expect(deriveLegalGateState({ ...READY, acceptedTerms: false, isSubmitting: true })).toBe("submitting");
		expect(deriveLegalGateState({ ...READY, acceptedTerms: false, hasWalletAccess: false })).toBe("wallet_required");
	});

	it("fails closed for blocked, unknown, and failed legal responses", () => {
		expect(deriveLegalGateState({ ...READY, userAllowed: false })).toBe("blocked");
		expect(deriveLegalGateState({ ...READY, canPerformActions: false })).toBe("blocked");
		expect(deriveLegalGateState({ ...READY, acceptedTerms: undefined })).toBe("error");
		expect(deriveLegalGateState({ ...READY, hasStatusError: true })).toBe("error");
	});

	it("allows normal modals only after acceptance is confirmed", () => {
		expect(deriveLegalGateState(READY)).toBe("accepted");
	});
});
