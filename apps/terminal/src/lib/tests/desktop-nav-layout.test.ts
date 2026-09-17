import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DESKTOP_NAV_ITEMS } from "@/config/desktop-nav";
import {
	DESKTOP_NAV_COMPACT_MAX_PX,
	DESKTOP_NAV_COMPACT_MEDIA_QUERY,
	DESKTOP_NAV_NARROW_MAX_PX,
	DESKTOP_NAV_NARROW_MEDIA_QUERY,
	MOBILE_BREAKPOINT_PX,
} from "@/config/layout";
import { isDesktopNavItemActive, resolveDesktopNavLayout } from "@/lib/navigation/desktop-nav";

const ids = (items: ReadonlyArray<{ id: string }>) => items.map((item) => item.id);
const byId = (id: string) => {
	const item = DESKTOP_NAV_ITEMS.find((candidate) => candidate.id === id);
	if (!item) throw new Error(`Missing nav item ${id}`);
	return item;
};

describe("desktop navigation layout", () => {
	it("pins the compact breakpoint to the nav-compact Tailwind variant and orders the widths", () => {
		const stylesCss = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
		expect(stylesCss).toContain(`@custom-variant nav-compact (@media (max-width: ${DESKTOP_NAV_COMPACT_MAX_PX}px));`);
		expect(DESKTOP_NAV_COMPACT_MEDIA_QUERY).toBe(`(max-width: ${DESKTOP_NAV_COMPACT_MAX_PX}px)`);
		expect(DESKTOP_NAV_NARROW_MEDIA_QUERY).toBe(`(max-width: ${DESKTOP_NAV_NARROW_MAX_PX}px)`);
		expect(DESKTOP_NAV_NARROW_MAX_PX).toBeLessThan(DESKTOP_NAV_COMPACT_MAX_PX);
		expect(DESKTOP_NAV_NARROW_MAX_PX).toBeGreaterThan(MOBILE_BREAKPOINT_PX);
	});

	it("keeps every entry uniquely identified with a destination or a Soon placeholder", () => {
		expect(new Set(ids(DESKTOP_NAV_ITEMS)).size).toBe(DESKTOP_NAV_ITEMS.length);
		for (const item of DESKTOP_NAV_ITEMS) {
			const hasDestination = ("path" in item && !!item.path) || ("href" in item && !!item.href);
			const isSoon = "soon" in item && item.soon === true;
			expect(hasDestination || isSoon).toBe(true);
		}
	});

	it("shows every entry at wide widths and keeps Statistics and API Wallet in More", () => {
		const layout = resolveDesktopNavLayout({ compact: false, narrow: false, connected: true });
		expect(ids(layout.topLevel)).toEqual([
			"trade",
			"portfolio",
			"earn",
			"vaults",
			"staking",
			"referrals",
			"leaderboard",
		]);
		expect(ids(layout.more)).toEqual(["statistics", "api-wallet"]);
	});

	it("collapses the Soon placeholder for everyone and the lower entries only when connected at compact widths", () => {
		const connected = resolveDesktopNavLayout({ compact: true, narrow: false, connected: true });
		expect(ids(connected.topLevel)).toEqual(["trade", "portfolio"]);
		expect(ids(connected.more)).toEqual([
			"earn",
			"vaults",
			"staking",
			"referrals",
			"leaderboard",
			"statistics",
			"api-wallet",
		]);
		const disconnected = resolveDesktopNavLayout({ compact: true, narrow: false, connected: false });
		expect(ids(disconnected.topLevel)).toEqual(["trade", "portfolio", "vaults", "staking", "referrals", "leaderboard"]);
		expect(ids(disconnected.more)).toEqual(["earn", "statistics", "api-wallet"]);
	});

	it("collapses the lower entries for every wallet state at narrow widths", () => {
		for (const connected of [true, false]) {
			const layout = resolveDesktopNavLayout({ compact: true, narrow: true, connected });
			expect(ids(layout.topLevel)).toEqual(["trade", "portfolio"]);
			expect(ids(layout.more)).toEqual([
				"earn",
				"vaults",
				"staking",
				"referrals",
				"leaderboard",
				"statistics",
				"api-wallet",
			]);
		}
	});

	it.each([
		["trade", "/trade/HYPE", true],
		["trade", "/perp/BTC", true],
		["trade", "/portfolio", false],
		["portfolio", "/portfolio", true],
		["portfolio", "/portfolio/history", false],
		["vaults", "/vaults", true],
		["vaults", "/vaults/0x123", true],
		["vaults", "/vaultsx", false],
		["staking", "/staking", true],
		["api-wallet", "/api-wallet", true],
		["statistics", "/statistics", false],
		["earn", "/earn", false],
	] as const)("derives %s activity from %s", (id, pathname, active) => {
		expect(isDesktopNavItemActive(byId(id), pathname)).toBe(active);
	});
});
