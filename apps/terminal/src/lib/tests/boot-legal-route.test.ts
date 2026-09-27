// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

const preload = vi.hoisted(() => ({ page: vi.fn<() => Promise<void>>(), dashboard: vi.fn<() => Promise<void>>() }));

vi.mock("@/components/legal/legal-doc-page", () => ({ preloadLegalDocPage: preload.page }));
vi.mock("@/lib/navigation/boot-dashboard-route", () => ({ bootDashboardRoute: preload.dashboard }));

describe("bootLegalRoute", () => {
	afterEach(() => {
		vi.useRealTimers();
		preload.page.mockReset();
		preload.dashboard.mockReset();
	});

	it("waits for the page's lazy pieces and the navigation before revealing the route", async () => {
		let finishPage: () => void = () => {};
		preload.page.mockReturnValue(
			new Promise<void>((resolve) => {
				finishPage = resolve;
			}),
		);
		preload.dashboard.mockResolvedValue();
		const { bootLegalRoute } = await import("@/lib/navigation/boot-legal-route");

		let settled = false;
		const boot = bootLegalRoute().then(() => {
			settled = true;
		});
		await vi.waitFor(() => expect(preload.page).toHaveBeenCalledTimes(1));
		expect(preload.dashboard).toHaveBeenCalledTimes(1);
		await Promise.resolve();
		expect(settled).toBe(false);

		finishPage();
		await boot;
		expect(settled).toBe(true);
	});

	it("reveals the route after the reveal budget when a lazy piece never loads", async () => {
		vi.useFakeTimers();
		preload.page.mockReturnValue(new Promise<void>(() => {}));
		preload.dashboard.mockResolvedValue();
		const { bootLegalRoute } = await import("@/lib/navigation/boot-legal-route");
		const { TRADE_ROUTE_REVEAL_BUDGET_MS } = await import("@/lib/trade/trade-route-boot");

		let settled = false;
		const boot = bootLegalRoute().then(() => {
			settled = true;
		});
		await vi.advanceTimersByTimeAsync(TRADE_ROUTE_REVEAL_BUDGET_MS - 1);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await boot;
		expect(settled).toBe(true);
	});

	it("keeps waiting for the other preload when one fails", async () => {
		let finishDashboard: () => void = () => {};
		preload.page.mockRejectedValue(new Error("chunk failed"));
		preload.dashboard.mockReturnValue(
			new Promise<void>((resolve) => {
				finishDashboard = resolve;
			}),
		);
		const { bootLegalRoute } = await import("@/lib/navigation/boot-legal-route");

		let settled = false;
		const boot = bootLegalRoute().then(() => {
			settled = true;
		});
		await vi.waitFor(() => expect(preload.page).toHaveBeenCalledTimes(1));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(settled).toBe(false);

		finishDashboard();
		await boot;
		expect(settled).toBe(true);
	});

	it("does not block the route when a preload fails", async () => {
		preload.page.mockRejectedValue(new Error("chunk failed"));
		preload.dashboard.mockResolvedValue();
		const { bootLegalRoute } = await import("@/lib/navigation/boot-legal-route");
		await expect(bootLegalRoute()).resolves.toBeUndefined();
	});
});
