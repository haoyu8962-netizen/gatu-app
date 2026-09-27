// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const preloadTopNav = vi.fn<() => Promise<void>>();
vi.mock("@/components/trade/header/top-nav", () => ({ preloadTopNav }));

const DASHBOARD_ROUTES = [
	"api-wallet.tsx",
	"fundingComparison.tsx",
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

describe("bootDashboardRoute", () => {
	it("waits for the account menu chunk and swallows preload failures", async () => {
		let release: () => void = () => {};
		preloadTopNav.mockReturnValueOnce(
			new Promise<void>((resolveRelease) => {
				release = resolveRelease;
			}),
		);
		const { bootDashboardRoute } = await import("@/lib/navigation/boot-dashboard-route");
		let settled = false;
		const boot = bootDashboardRoute().then(() => {
			settled = true;
		});
		await vi.waitFor(() => expect(preloadTopNav).toHaveBeenCalledTimes(1));
		await new Promise((resolveTick) => setTimeout(resolveTick, 0));
		expect(settled).toBe(false);
		release();
		await boot;
		expect(settled).toBe(true);
		preloadTopNav.mockRejectedValueOnce(new Error("chunk missing"));
		await expect(bootDashboardRoute()).resolves.toBeUndefined();
	});

	it("imports the navigation module lazily so the route tree chunk stays light", () => {
		const source = readFileSync(resolve(__dirname, "../navigation/boot-dashboard-route.ts"), "utf8");
		expect(source).toContain('import("@/components/trade/header/top-nav")');
		expect(source).not.toMatch(/^import .*header\/top-nav/m);
	});

	it.each(DASHBOARD_ROUTES)("is awaited from the beforeLoad of %s", (file) => {
		const source = readFileSync(resolve(__dirname, "../../routes", file), "utf8");
		expect(source).toContain("beforeLoad: () => bootDashboardRoute(),");
		expect(source).not.toContain("header/top-nav");
	});
});
