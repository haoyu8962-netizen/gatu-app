import { describe, expect, it } from "vitest";
import { deriveEmailOwnerSetup, deriveLegalGateSession, deriveLegalGateState } from "@/hooks/trade/use-legal-gate";

const READY = {
	hasSession: true,
	isSessionPending: false,
	authenticationModalOpen: false,
	hasOwnerIdentity: true,
	ownerSetup: "settled" as const,
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

	it("waits for an email owner wallet that is still being set up instead of asking to reconnect", () => {
		const missingOwner = { ...READY, hasOwnerIdentity: false, hasWalletAccess: false, acceptedTerms: undefined };

		expect(deriveLegalGateState({ ...missingOwner, ownerSetup: "pending" })).toBe("checking");
		expect(deriveLegalGateState({ ...missingOwner, ownerSetup: "failed" })).toBe("wallet_setup_failed");
		expect(deriveLegalGateState({ ...missingOwner, ownerSetup: "settled" })).toBe("wallet_required");
	});

	it("holds every legal dialog while the Privy modal is visible", () => {
		const behindPrivy = { ...READY, authenticationModalOpen: true };

		expect(deriveLegalGateState({ ...behindPrivy, acceptedTerms: false })).toBe("checking");
		expect(deriveLegalGateState({ ...behindPrivy, userAllowed: false })).toBe("checking");
		expect(deriveLegalGateState({ ...behindPrivy, hasStatusError: true })).toBe("checking");
		expect(
			deriveLegalGateState({ ...behindPrivy, hasOwnerIdentity: false, hasWalletAccess: false, ownerSetup: "failed" }),
		).toBe("checking");
		expect(deriveLegalGateState({ ...behindPrivy, hasOwnerIdentity: false, hasWalletAccess: false })).toBe("checking");
	});

	it("keeps accepted, inactive and submitting states while the Privy modal is visible", () => {
		const behindPrivy = { ...READY, authenticationModalOpen: true };

		expect(deriveLegalGateState(behindPrivy)).toBe("accepted");
		expect(deriveLegalGateState({ ...behindPrivy, hasSession: false, hasOwnerIdentity: false })).toBe("inactive");
		expect(deriveLegalGateState({ ...behindPrivy, acceptedTerms: false, isSubmitting: true })).toBe("submitting");
	});
});

describe("email owner setup", () => {
	const EMAIL_SESSION = {
		walletIntent: "embedded" as const,
		hasOwnerIdentity: false,
		needsEmbeddedWallet: false,
		isCreatingEmbeddedWallet: false,
		hasEmbeddedWalletError: false,
		withinActivationGrace: false,
	};

	it("is pending while the wallet is missing or being created", () => {
		expect(deriveEmailOwnerSetup({ ...EMAIL_SESSION, needsEmbeddedWallet: true })).toBe("pending");
		expect(deriveEmailOwnerSetup({ ...EMAIL_SESSION, needsEmbeddedWallet: true, isCreatingEmbeddedWallet: true })).toBe(
			"pending",
		);
	});

	it("reports a failed creation until a retry starts", () => {
		expect(deriveEmailOwnerSetup({ ...EMAIL_SESSION, needsEmbeddedWallet: true, hasEmbeddedWalletError: true })).toBe(
			"failed",
		);
		expect(
			deriveEmailOwnerSetup({
				...EMAIL_SESSION,
				needsEmbeddedWallet: true,
				hasEmbeddedWalletError: true,
				isCreatingEmbeddedWallet: true,
			}),
		).toBe("pending");
	});

	it("waits for activation of an existing wallet only during the grace period", () => {
		expect(deriveEmailOwnerSetup({ ...EMAIL_SESSION, withinActivationGrace: true })).toBe("pending");
		expect(deriveEmailOwnerSetup(EMAIL_SESSION)).toBe("settled");
	});

	it("does not apply to an active owner or to sessions that are not email sessions", () => {
		expect(deriveEmailOwnerSetup({ ...EMAIL_SESSION, needsEmbeddedWallet: true, hasOwnerIdentity: true })).toBe(
			"settled",
		);
		for (const walletIntent of ["external", "ambiguous", "unavailable"] as const) {
			expect(deriveEmailOwnerSetup({ ...EMAIL_SESSION, walletIntent, needsEmbeddedWallet: true })).toBe("settled");
		}
	});
});
