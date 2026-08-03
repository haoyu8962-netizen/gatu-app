import { describe, expect, it } from "vitest";
import { deriveLegalGateState } from "@/hooks/trade/use-legal-gate";

const READY = {
	hasWalletAccess: true,
	isPending: false,
	isError: false,
	isSubmitting: false,
	acceptedTerms: true,
	userAllowed: true,
	canPerformActions: true,
};

describe("legal gate state", () => {
	it("does not gate sessions without master-wallet access", () => {
		expect(deriveLegalGateState({ ...READY, hasWalletAccess: false })).toBe("inactive");
	});

	it("keeps lower-priority flows blocked while legal status loads", () => {
		expect(deriveLegalGateState({ ...READY, isPending: true })).toBe("checking");
	});

	it("requires acceptance only for an allowed wallet with unaccepted terms", () => {
		expect(deriveLegalGateState({ ...READY, acceptedTerms: false })).toBe("required");
		expect(deriveLegalGateState({ ...READY, acceptedTerms: false, isSubmitting: true })).toBe("submitting");
	});

	it("fails closed for blocked, unknown, and failed legal responses", () => {
		expect(deriveLegalGateState({ ...READY, userAllowed: false })).toBe("blocked");
		expect(deriveLegalGateState({ ...READY, canPerformActions: false })).toBe("blocked");
		expect(deriveLegalGateState({ ...READY, acceptedTerms: undefined })).toBe("error");
		expect(deriveLegalGateState({ ...READY, isError: true })).toBe("error");
	});

	it("allows normal modals only after acceptance is confirmed", () => {
		expect(deriveLegalGateState(READY)).toBe("accepted");
	});
});
