import { describe, expect, it } from "vitest";
import { shouldDefaultToUnifiedAccount } from "@/hooks/trade/use-default-unified-account";

describe("default unified account mode", () => {
	it("does not overwrite an explicit exchange account mode", () => {
		expect(shouldDefaultToUnifiedAccount("disabled", null)).toBe(false);
		expect(shouldDefaultToUnifiedAccount("disabled", "unifiedAccount")).toBe(false);
		expect(shouldDefaultToUnifiedAccount("unifiedAccount", null)).toBe(false);
		expect(shouldDefaultToUnifiedAccount("portfolioMargin", null)).toBe(false);
	});

	it("defaults only users without a conflicting preference", () => {
		expect(shouldDefaultToUnifiedAccount(null, null)).toBe(true);
		expect(shouldDefaultToUnifiedAccount("dexAbstraction", "unifiedAccount")).toBe(true);
		expect(shouldDefaultToUnifiedAccount(null, "disabled")).toBe(false);
		expect(shouldDefaultToUnifiedAccount(null, "portfolioMargin")).toBe(false);
	});
});
