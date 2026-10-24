import { describe, expect, it } from "vitest";
import { isTradeRestricted, TRADE_RESTRICTED_COUNTRIES, TRADE_RESTRICTED_REGIONS } from "@/config/geo";

describe("trade-restricted jurisdictions", () => {
	it("pins the restricted list so a jurisdiction change is deliberate", () => {
		expect(TRADE_RESTRICTED_COUNTRIES).toEqual(["US", "CN", "CU", "IR", "KP", "SY"]);
		expect(TRADE_RESTRICTED_REGIONS).toEqual({ CA: ["ON"] });
	});

	it("allows trading from Japan", () => {
		expect(isTradeRestricted("JP")).toBe(false);
		expect(isTradeRestricted("jp", "13")).toBe(false);
	});

	it("keeps the named and sanctioned jurisdictions restricted", () => {
		for (const country of ["US", "cn", "CU", "IR", "KP", "SY"]) {
			expect(isTradeRestricted(country)).toBe(true);
		}
		expect(isTradeRestricted("CA", "ON")).toBe(true);
		expect(isTradeRestricted("CA", "BC")).toBe(false);
		expect(isTradeRestricted(null)).toBe(false);
	});
});
