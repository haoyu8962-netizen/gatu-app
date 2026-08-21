import { describe, expect, it } from "vitest";
import { deriveLegalGateState } from "@/hooks/trade/use-legal-gate";

const READY = {
	hasSession: true,
	hasOwnerIdentity: true,
	hasWalletAccess: true,
	isPending: false,
	isSubmitting: false,
	acceptedTerms: true,
	userAllowed: true,
	canPerformActions: true,
};

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

	it("requires acceptance only for an allowed wallet with unaccepted terms", () => {
		expect(deriveLegalGateState({ ...READY, acceptedTerms: false })).toBe("required");
		expect(deriveLegalGateState({ ...READY, acceptedTerms: false, isSubmitting: true })).toBe("submitting");
		expect(deriveLegalGateState({ ...READY, acceptedTerms: false, hasWalletAccess: false })).toBe("wallet_required");
	});

	it("fails closed for blocked, unknown, and failed legal responses", () => {
		expect(deriveLegalGateState({ ...READY, userAllowed: false })).toBe("blocked");
		expect(deriveLegalGateState({ ...READY, canPerformActions: false })).toBe("blocked");
		expect(deriveLegalGateState({ ...READY, acceptedTerms: undefined })).toBe("error");
	});

	it("allows normal modals only after acceptance is confirmed", () => {
		expect(deriveLegalGateState(READY)).toBe("accepted");
	});
});
