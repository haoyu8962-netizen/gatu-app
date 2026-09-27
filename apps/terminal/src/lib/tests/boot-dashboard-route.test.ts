// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const preload = vi.hoisted(() => ({ chrome: vi.fn<() => Promise<void>>() }));
vi.mock("@/components/dashboard/dashboard-chrome", () => ({ preloadDashboardChrome: preload.chrome }));

const DASHBOARD_ROUTES = [
	"api-wallet.tsx",
	"fundingHistory.$address.tsx",
	"historicalOrders.$address.tsx",
	"leaderboard.tsx",
	"portfolio.tsx",
	"referrals.tsx",
	"staking.tsx",
	"tradeHistory.$address.tsx",
	"vaults.$vaultAddress.tsx",
	"vaults.index.tsx",
];

function pending(): { promise: Promise<void>; release: () => void } {
	let release: () => void = () => {};
	const promise = new Promise<void>((resolveRelease) => {
		release = resolveRelease;
	});
	return { promise, release };
}

describe("bootDashboardRoute", () => {
	afterEach(() => {
		vi.useRealTimers();
		preload.chrome.mockReset();
	});

	it("waits for the account menu, the modal host and the footer before revealing the route", async () => {
		const chrome = pending();
		preload.chrome.mockReturnValue(chrome.promise);
		const { bootDashboardRoute } = await import("@/lib/navigation/boot-dashboard-route");

		let settled = false;
		const boot = bootDashboardRoute().then(() => {
			settled = true;
		});
		await vi.waitFor(() => expect(preload.chrome).toHaveBeenCalledTimes(1));
		await new Promise((resolveTick) => setTimeout(resolveTick, 0));
		expect(settled).toBe(false);

		chrome.release();
		await boot;
		expect(settled).toBe(true);
	});

	it("reveals the route after the reveal budget when a lazy piece never loads", async () => {
		vi.useFakeTimers();
		preload.chrome.mockReturnValue(new Promise<void>(() => {}));
		const { bootDashboardRoute } = await import("@/lib/navigation/boot-dashboard-route");
		const { TRADE_ROUTE_REVEAL_BUDGET_MS } = await import("@/lib/trade/trade-route-boot");

		let settled = false;
		const boot = bootDashboardRoute().then(() => {
			settled = true;
		});
		await vi.advanceTimersByTimeAsync(TRADE_ROUTE_REVEAL_BUDGET_MS - 1);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await boot;
		expect(settled).toBe(true);
	});

	it("does not block the route when a preload fails", async () => {
		preload.chrome.mockRejectedValue(new Error("chunk missing"));
		const { bootDashboardRoute } = await import("@/lib/navigation/boot-dashboard-route");
		await expect(bootDashboardRoute()).resolves.toBeUndefined();
	});

	it("imports the page chrome lazily so the route tree chunk stays light", () => {
		const source = readFileSync(resolve(__dirname, "../navigation/boot-dashboard-route.ts"), "utf8");
		expect(source).toContain('import("@/components/dashboard/dashboard-chrome")');
		expect(source).not.toMatch(/^import .*header\/top-nav/m);
		expect(source).not.toMatch(/^import .*dashboard-chrome/m);
	});

	it.each(DASHBOARD_ROUTES)("is awaited from the beforeLoad of %s", (file) => {
		const source = readFileSync(resolve(__dirname, "../../routes", file), "utf8");
		expect(source).toContain("beforeLoad: () => bootDashboardRoute(),");
		expect(source).not.toContain("header/top-nav");
		expect(source).not.toContain("dashboard-chrome");
	});
});
