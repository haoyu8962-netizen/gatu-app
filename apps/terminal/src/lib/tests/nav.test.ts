import { describe, expect, it } from "vitest";
import { isTradeRoutePath } from "@/config/nav";

describe("isTradeRoutePath", () => {
	it.each(["/", "/trade/HYPE", "/perp", "/spot", "/builders-perp/hyna"])(
		"recognizes the trading route %s",
		(pathname) => {
			expect(isTradeRoutePath(pathname)).toBe(true);
		},
	);

	it.each([
		"/docs",
		"/terms",
		"/privacy",
		"/support",
		"/trader",
		"/spotlight",
		"/vaults",
		"/vaults/0x123",
		"/staking",
		"/leaderboard",
	])("does not match the non-trading route %s", (pathname) => {
		expect(isTradeRoutePath(pathname)).toBe(false);
	});
});
