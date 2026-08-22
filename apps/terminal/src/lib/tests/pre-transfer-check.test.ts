import { describe, expect, it } from "vitest";
import {
	assertPreTransferCheckMatchesReview,
	getCanonicalSpotSystemAddress,
	normalizePreTransferCheck,
} from "@/domain/trade/pre-transfer-check";

describe("pre-transfer check response validation", () => {
	it("accepts the complete SDK response and drops unrelated future fields", () => {
		expect(
			normalizePreTransferCheck({
				fee: "1.25",
				isSanctioned: false,
				userExists: true,
				userHasSentTx: false,
				futureField: "ignored",
			}),
		).toEqual({ fee: "1.25", isSanctioned: false, userExists: true, userHasSentTx: false });
	});

	it.each([
		null,
		{},
		{ fee: "", isSanctioned: false, userExists: true, userHasSentTx: false },
		{ fee: "-1", isSanctioned: false, userExists: true, userHasSentTx: false },
		{ fee: "1", isSanctioned: undefined, userExists: true, userHasSentTx: false },
		{ fee: "1", isSanctioned: false, userExists: "yes", userHasSentTx: false },
	])("rejects malformed or incomplete payloads", (payload) => {
		expect(() => normalizePreTransferCheck(payload)).toThrow("invalid pre-transfer check");
	});
});

describe("HyperCore spot system address derivation", () => {
	it("derives the address from the live canonical token index instead of a fixed USDC address", () => {
		expect(
			getCanonicalSpotSystemAddress(
				{
					tokens: [
						{ index: 0, isCanonical: true, name: "HYPE" },
						{ index: 37, isCanonical: true, name: "USDC" },
					],
				},
				"USDC",
			),
		).toBe("0x2000000000000000000000000000000000000025");
	});

	it.each([
		null,
		{},
		{ tokens: [] },
		{ tokens: [{ index: 0, isCanonical: false, name: "USDC" }] },
		{ tokens: [{ index: -1, isCanonical: true, name: "USDC" }] },
		{ tokens: [{ index: 0.5, isCanonical: true, name: "USDC" }] },
		{
			tokens: [
				{ index: 0, isCanonical: true, name: "USDC" },
				{ index: 1, isCanonical: true, name: "USDC" },
			],
		},
	])("fails closed when canonical token metadata is unavailable or ambiguous", (spotMeta) => {
		expect(() => getCanonicalSpotSystemAddress(spotMeta, "USDC")).toThrow("invalid spot metadata");
	});
});

describe("pre-transfer execution review", () => {
	const eligible = {
		fee: "1",
		isSanctioned: false,
		userExists: false,
		userHasSentTx: false,
	};

	it("accepts numerically equivalent activation fee formatting", () => {
		expect(() => assertPreTransferCheckMatchesReview("1.00", eligible)).not.toThrow();
	});

	it("rejects a fee change before signing", () => {
		expect(() => assertPreTransferCheckMatchesReview("0", eligible)).toThrow("activation fee changed");
	});

	it("rejects a newly sanctioned result before signing", () => {
		expect(() => assertPreTransferCheckMatchesReview("1", { ...eligible, isSanctioned: true })).toThrow(
			"unavailable for this address",
		);
	});
});
