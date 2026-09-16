import { describe, expect, it } from "vitest";
import { getAppRouteSurface, isDocumentRoutePath } from "@/providers/client-runtime";

describe("application route surface classification", () => {
	it.each(["/docs", "/docs/", "/terms", "/privacy", "/risk", "/support", "/cookies"])(
		"classifies %s as a provider-independent document",
		(pathname) => {
			expect(getAppRouteSurface(pathname)).toBe("document");
			expect(isDocumentRoutePath(pathname)).toBe(true);
		},
	);

	it.each(["/", "/trade", "/trade/HYPE", "/perp/BTC", "/spot/PURR_USDC", "/builders-perp/HYPE"])(
		"classifies %s as a terminal route",
		(pathname) => {
			expect(getAppRouteSurface(pathname)).toBe("terminal");
			expect(isDocumentRoutePath(pathname)).toBe(false);
		},
	);

	it.each([
		"/referrals",
		"/portfolio",
		"/api-wallet",
		"/vaults",
		"/vaults/0x1234",
		"/leaderboard",
		"/staking",
		"/tradeHistory/0x1234",
		"/mobile-agent-sync",
		"/unknown",
	])("classifies %s as a dashboard route", (pathname) => {
		expect(getAppRouteSurface(pathname)).toBe("dashboard");
		expect(isDocumentRoutePath(pathname)).toBe(false);
	});

	it.each(["/trader", "/spotlight", "/builders-perpetual", "/terms-extra", "/docs/intro"])(
		"does not let a partial route prefix classify %s",
		(pathname) => {
			expect(getAppRouteSurface(pathname)).toBe("dashboard");
		},
	);
});
