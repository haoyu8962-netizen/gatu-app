import { describe, expect, it } from "vitest";
import { applyReferralDiscountToFeeRate } from "@/domain/trade/fees";

describe("trade fee rates", () => {
	it("applies the active referral discount to positive user fee rates", () => {
		expect(applyReferralDiscountToFeeRate("0.0007", "0.04")).toBe(0.000672);
	});

	it("does not reduce maker rebates", () => {
		expect(applyReferralDiscountToFeeRate("-0.00001", "0.04")).toBe(-0.00001);
	});

	it("rejects invalid fee rates and bounds invalid discounts", () => {
		expect(applyReferralDiscountToFeeRate(undefined, "0.04")).toBeNull();
		expect(applyReferralDiscountToFeeRate("0.0007", "2")).toBe(0);
	});
});
