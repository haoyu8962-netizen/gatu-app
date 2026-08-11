import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	useInfo: vi.fn(),
}));

vi.mock("@/lib/hyperliquid", () => ({
	getAccountLedgerRefreshKey: vi.fn(),
	useHyperliquid: vi.fn(),
	useInfo: testState.useInfo,
	useSubscription: vi.fn(),
}));

import {
	isSupportedAccountAbstraction,
	normalizeAccountAbstraction,
	resolveAccountAbstraction,
	useUserAbstraction,
} from "@/hooks/trade/use-account-balances";

const USER_ADDRESS = "0x1111111111111111111111111111111111111111";

describe("user abstraction query", () => {
	beforeEach(() => {
		testState.useInfo.mockReset();
		testState.useInfo.mockReturnValue({ data: "default" });
	});

	it("uses the SDK info method with the user-scoped query options", () => {
		const result = useUserAbstraction(USER_ADDRESS, true);

		expect(testState.useInfo).toHaveBeenCalledWith(
			"userAbstraction",
			{ user: USER_ADDRESS },
			expect.objectContaining({
				enabled: true,
				refetchInterval: 30_000,
				refetchIntervalInBackground: false,
				refetchOnWindowFocus: true,
				retry: 1,
				staleTime: 30_000,
				select: normalizeAccountAbstraction,
			}),
		);
		expect(result).toEqual({ data: "default" });
	});

	it("disables the SDK query when the user is unavailable", () => {
		useUserAbstraction(undefined, true);

		expect(testState.useInfo).toHaveBeenCalledWith(
			"userAbstraction",
			{ user: "" },
			expect.objectContaining({ enabled: false }),
		);
	});

	it("preserves protocol modes and normalizes legacy response values", () => {
		expect(normalizeAccountAbstraction("default")).toBe("default");
		expect(normalizeAccountAbstraction("disabled")).toBe("disabled");
		expect(normalizeAccountAbstraction("unifiedAccount")).toBe("unifiedAccount");
		expect(normalizeAccountAbstraction("portfolioMargin")).toBe("portfolioMargin");
		expect(normalizeAccountAbstraction("dexAbstraction")).toBe("dexAbstraction");
		expect(normalizeAccountAbstraction({ abstraction: "u" })).toBe("unifiedAccount");
		expect(normalizeAccountAbstraction("p")).toBe("portfolioMargin");
		expect(normalizeAccountAbstraction("i")).toBe("disabled");
		expect(normalizeAccountAbstraction("unexpected")).toBe("unknown");
		expect(normalizeAccountAbstraction(null)).toBeNull();
	});

	it("fails closed when REST and webData3 disagree and otherwise uses the available source", () => {
		expect(resolveAccountAbstraction("default", "unifiedAccount")).toBe("unknown");
		expect(resolveAccountAbstraction("disabled", "unifiedAccount")).toBe("unknown");
		expect(resolveAccountAbstraction("unifiedAccount", "unifiedAccount")).toBe("unifiedAccount");
		expect(resolveAccountAbstraction(null, "unifiedAccount")).toBe("unifiedAccount");
		expect(resolveAccountAbstraction("unexpected", "disabled")).toBe("unknown");
		expect(resolveAccountAbstraction(undefined, undefined)).toBeNull();
	});

	it("only accepts modes supported by userSetAbstraction as resolved balance modes", () => {
		expect(isSupportedAccountAbstraction("disabled")).toBe(true);
		expect(isSupportedAccountAbstraction("unifiedAccount")).toBe(true);
		expect(isSupportedAccountAbstraction("portfolioMargin")).toBe(true);
		expect(isSupportedAccountAbstraction("default")).toBe(false);
		expect(isSupportedAccountAbstraction("dexAbstraction")).toBe(false);
		expect(isSupportedAccountAbstraction("unknown")).toBe(false);
		expect(isSupportedAccountAbstraction(null)).toBe(false);
	});
});
