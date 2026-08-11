import { describe, expect, it } from "vitest";
import { getUsdcRoutingQueryStatus, getWithdrawalRoute, normalizeUsdcRouting } from "@/domain/trade/usdc-routing";

describe("USDC routing", () => {
	it.each([
		{ depositRoute: "bridge", withdrawalRoute: "bridge" },
		{ depositRoute: "bridge", withdrawalRoute: "cctp" },
		{ depositRoute: "cctp", withdrawalRoute: "bridge" },
		{ depositRoute: "cctp", withdrawalRoute: "cctp" },
	])("accepts the documented route combination %#", (routing) => {
		expect(normalizeUsdcRouting(routing)).toEqual(routing);
	});

	it.each([
		null,
		{},
		{ depositRoute: "unknown", withdrawalRoute: "cctp" },
		{ depositRoute: "bridge", withdrawalRoute: "unknown" },
	])("rejects an undocumented route response %#", (routing) => {
		expect(normalizeUsdcRouting(routing)).toBeNull();
	});

	it.each([
		{ expected: "loading", data: null, isError: false, isFetching: true },
		{ expected: "loading", data: null, isError: true, isFetching: true },
		{ expected: "error", data: null, isError: true, isFetching: false },
		{ expected: "unknown", data: null, isError: false, isFetching: false },
		{
			expected: "ready",
			data: { depositRoute: "bridge" as const, withdrawalRoute: "cctp" as const },
			isError: false,
			isFetching: false,
		},
	])("derives $expected for a query snapshot", ({ data, expected, isError, isFetching }) => {
		expect(getUsdcRoutingQueryStatus({ data, isError, isFetching })).toBe(expected);
	});

	it("maps the official withdrawal route to the supported Arbitrum action", () => {
		expect(getWithdrawalRoute({ depositRoute: "bridge", withdrawalRoute: "cctp" })).toBe("arbitrum-cctp");
		expect(getWithdrawalRoute({ depositRoute: "bridge", withdrawalRoute: "bridge" })).toBe("arbitrum-legacy");
		expect(getWithdrawalRoute(null)).toBeNull();
	});
});
