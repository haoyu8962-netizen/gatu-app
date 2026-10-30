import { describe, expect, it } from "vitest";
import { getSendDestinationVerdict } from "@/domain/trade/send-destination";
import { getWithdrawDestinationIssue } from "@/domain/trade/withdraw-destination";

const OWNER = "0x1111111111111111111111111111111111111111";

describe("send destination verdict", () => {
	it("sends at once to an active destination without a fee", () => {
		expect(
			getSendDestinationVerdict({ fee: "0.0", isSanctioned: false, userExists: true, userHasSentTx: true }),
		).toEqual({ kind: "send" });
	});

	it("asks for a review when an activation fee is due or the destination has never sent a transaction", () => {
		expect(
			getSendDestinationVerdict({ fee: "1.0", isSanctioned: false, userExists: false, userHasSentTx: false }),
		).toEqual({ kind: "review", fee: "1.0", feeDue: true, destinationHasSentTx: false });
		expect(
			getSendDestinationVerdict({ fee: "0", isSanctioned: false, userExists: true, userHasSentTx: false }),
		).toEqual({
			kind: "review",
			fee: "0",
			feeDue: false,
			destinationHasSentTx: false,
		});
		expect(getSendDestinationVerdict({ fee: "1", isSanctioned: false, userExists: true, userHasSentTx: true })).toEqual(
			{
				kind: "review",
				fee: "1",
				feeDue: true,
				destinationHasSentTx: true,
			},
		);
	});

	it("refuses a sanctioned destination", () => {
		expect(
			getSendDestinationVerdict({ fee: "0.0", isSanctioned: true, userExists: true, userHasSentTx: true }),
		).toEqual({
			kind: "sanctioned",
		});
	});

	it.each([
		null,
		"ok",
		{ fee: "-1", isSanctioned: false, userHasSentTx: true },
		{ fee: "1e3", isSanctioned: false, userHasSentTx: true },
		{ fee: 1, isSanctioned: false, userHasSentTx: true },
		{ fee: "0", isSanctioned: "no", userHasSentTx: true },
		{ fee: "0", isSanctioned: false },
	])("sends nothing for an answer without the documented shape: %o", (answer) => {
		expect(getSendDestinationVerdict(answer)).toEqual({ kind: "unavailable" });
	});
});

describe("withdraw destination rules", () => {
	it("refuses the wallet itself in any letter case", () => {
		expect(getWithdrawDestinationIssue(` ${OWNER.toUpperCase().replace("0X", "0x")} `, [OWNER])).toBe("self");
		expect(getWithdrawDestinationIssue(OWNER, [null, OWNER])).toBe("self");
	});

	it("refuses the USDC token contracts of both networks", () => {
		expect(getWithdrawDestinationIssue("0xaf88d065e77c8cC2239327C5EDb3A432268e5831", [OWNER])).toBe("usdc-contract");
		expect(getWithdrawDestinationIssue("0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d", [OWNER])).toBe("usdc-contract");
	});

	it("accepts any other address and leaves an empty field to the required-field check", () => {
		expect(getWithdrawDestinationIssue("0x2222222222222222222222222222222222222222", [OWNER])).toBeNull();
		expect(getWithdrawDestinationIssue("", [OWNER])).toBeNull();
	});
});
