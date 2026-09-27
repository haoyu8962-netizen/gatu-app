import { describe, expect, it } from "vitest";
import { getAppRouteSurface } from "@/config/app-route-surface";

describe("application route surface classification", () => {
	it.each(["/", "/trade", "/trade/HYPE", "/perp/BTC", "/spot/PURR_USDC", "/builders-perp/HYPE"])(
		"classifies %s as a terminal route",
		(pathname) => {
			expect(getAppRouteSurface(pathname)).toBe("terminal");
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
		"/docs",
		"/docs/",
		"/terms",
		"/privacy",
		"/risk",
		"/support",
		"/cookies",
		"/unknown",
	])("classifies %s as a dashboard route", (pathname) => {
		expect(getAppRouteSurface(pathname)).toBe("dashboard");
	});

	it.each(["/trader", "/spotlight", "/builders-perpetual", "/terms-extra", "/docs/intro"])(
		"does not let a partial route prefix classify %s",
		(pathname) => {
			expect(getAppRouteSurface(pathname)).toBe("dashboard");
		},
	);
});
