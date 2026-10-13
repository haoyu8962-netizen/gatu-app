import type { Hash } from "viem";
import { describe, expect, it } from "vitest";
import {
	getWalletErrorCode,
	isDefinitiveWalletSubmissionFailure,
	isDepositSubmissionOutcomeUnknown,
} from "@/lib/hyperliquid/deposit-submission-outcome";

const HASH = `0x${"1".repeat(64)}` as Hash;

function nested(code: number, depth: number): Error {
	let error: Error = Object.assign(new Error("inner"), { code });
	for (let level = 0; level < depth; level += 1) error = new Error("outer", { cause: error });
	return error;
}

describe("deposit submission outcome", () => {
	it("finds the provider code through the viem cause chain", () => {
		expect(getWalletErrorCode(nested(4001, 3))).toBe(4001);
		expect(getWalletErrorCode(new Error("plain"))).toBeUndefined();
		expect(getWalletErrorCode(nested(-32003, 7))).toBeUndefined();
	});

	it("treats wallet refusals as definitive and everything else as possibly broadcast", () => {
		expect(isDefinitiveWalletSubmissionFailure(nested(4001, 1), false)).toBe(true);
		expect(isDefinitiveWalletSubmissionFailure(nested(-32602, 2), false)).toBe(true);
		expect(isDefinitiveWalletSubmissionFailure(new Error("User rejected"), true)).toBe(true);
		expect(isDefinitiveWalletSubmissionFailure(nested(4900, 1), false)).toBe(false);
		expect(isDefinitiveWalletSubmissionFailure(nested(4901, 2), false)).toBe(false);
		expect(isDefinitiveWalletSubmissionFailure(nested(-32000, 1), false)).toBe(false);
		expect(isDefinitiveWalletSubmissionFailure(nested(-32603, 1), false)).toBe(false);
		expect(isDefinitiveWalletSubmissionFailure(new Error("Request timed out"), false)).toBe(false);
	});

	it("reports an external-wallet broadcast without a hash as unknown unless the wallet refused", () => {
		const base = { sponsoredSubmissionStarted: false, hash: undefined, userRejected: false };

		expect(
			isDepositSubmissionOutcomeUnknown({ ...base, directSubmissionStarted: true, error: new Error("timeout") }),
		).toBe(true);
		expect(isDepositSubmissionOutcomeUnknown({ ...base, directSubmissionStarted: true, error: nested(4001, 2) })).toBe(
			false,
		);
		expect(
			isDepositSubmissionOutcomeUnknown({
				...base,
				directSubmissionStarted: true,
				error: new Error("denied"),
				userRejected: true,
			}),
		).toBe(false);
		expect(
			isDepositSubmissionOutcomeUnknown({ ...base, directSubmissionStarted: false, error: new Error("gas") }),
		).toBe(false);
	});

	it("keeps the sponsored and hashed rules", () => {
		expect(
			isDepositSubmissionOutcomeUnknown({
				sponsoredSubmissionStarted: true,
				directSubmissionStarted: false,
				hash: undefined,
				error: nested(4001, 1),
				userRejected: true,
			}),
		).toBe(true);
		expect(
			isDepositSubmissionOutcomeUnknown({
				sponsoredSubmissionStarted: true,
				directSubmissionStarted: true,
				hash: HASH,
				error: new Error("rpc"),
				userRejected: false,
			}),
		).toBe(false);
	});
});
