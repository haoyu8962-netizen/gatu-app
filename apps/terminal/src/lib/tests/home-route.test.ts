import { isRedirect } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({ bootstrap: vi.fn(), marketName: "BTC" }));
const queryClient = {};

vi.mock("@/stores/use-market-store", () => ({
	getTradeHomeMarketName: () => testState.marketName,
}));
vi.mock("@/components/trade/layout/app-shell-skeleton", () => ({ AppShellSkeleton: () => null }));
vi.mock("@/components/trade/trade-terminal-page", () => ({ TradeTerminalPage: () => null }));
vi.mock("@/config/seo", () => ({ ROUTE_SEO: { TRADE: {} } }));
vi.mock("@/lib/hyperliquid/markets/market-catalog-bootstrap", () => ({
	startMarketCatalogBootstrap: testState.bootstrap,
}));
vi.mock("@/lib/lazy", () => ({
	createLazyComponent: () => Object.assign(() => null, { preload: vi.fn(async () => undefined) }),
}));
vi.mock("@/lib/seo", () => ({ buildPageHead: () => ({}) }));

import { AppShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import { Route as BuildersPerpRoute } from "@/routes/builders-perp";
import { Route as BuildersPerpDexRoute } from "@/routes/builders-perp.$dex";
import { Route as BuildersPerpIndexRoute } from "@/routes/builders-perp.index";
import { Route as HomeRoute } from "@/routes/index";
import { Route as PerpRoute } from "@/routes/perp";
import { Route as SpotRoute } from "@/routes/spot";
import { Route as TradeRoute } from "@/routes/trade";

function runHomeBeforeLoad(): unknown {
	try {
		(HomeRoute.options.beforeLoad as unknown as (options: { context: { queryClient: object } }) => void)({
			context: { queryClient },
		});
	} catch (error) {
		return error;
	}
	throw new Error("Home route did not redirect");
}

describe("home route boot contract", () => {
	beforeEach(() => {
		testState.marketName = "BTC";
		testState.bootstrap.mockClear();
		for (const route of [TradeRoute, PerpRoute, SpotRoute, BuildersPerpIndexRoute, BuildersPerpDexRoute]) {
			vi.mocked((route.options.component as { preload: () => Promise<void> }).preload).mockClear();
		}
	});

	it("redirects a cold visit to the default market without mounting an empty component", () => {
		const result = runHomeBeforeLoad();

		expect(isRedirect(result)).toBe(true);
		expect((result as Response & { options: Record<string, unknown> }).options).toMatchObject({
			to: "/trade/BTC",
			search: { scope: "all" },
			replace: true,
			headers: { "cache-control": "no-store" },
		});
		expect(HomeRoute.options.component).toBeUndefined();
		expect(HomeRoute.options.ssr).toBe(true);
	});

	it("preserves a safe last-selected market in the redirect", () => {
		testState.marketName = "xyz:GOOGL";

		const result = runHomeBeforeLoad() as Response & { options: Record<string, unknown> };
		expect(result.options).toMatchObject({ to: "/trade/xyz:GOOGL", replace: true });
	});

	it("uses AppShellSkeleton directly with no artificial minimum for every pending terminal route", () => {
		for (const route of [HomeRoute, TradeRoute, PerpRoute, SpotRoute, BuildersPerpIndexRoute, BuildersPerpDexRoute]) {
			expect(route.options.pendingMinMs).toBe(0);
			expect(route.options.pendingComponent).toBe(AppShellSkeleton);
		}
	});

	it("starts the market catalog before the home redirect and direct trade route mount", () => {
		runHomeBeforeLoad();
		expect(testState.bootstrap).toHaveBeenCalledWith(queryClient);

		(TradeRoute.options.beforeLoad as (options: { context: { queryClient: object } }) => void)({
			context: { queryClient },
		});
		expect(testState.bootstrap).toHaveBeenCalledTimes(2);
		expect((TradeRoute.options.component as { preload: () => Promise<void> }).preload).toHaveBeenCalledOnce();
	});

	it("starts the same bootstrap for every terminal entry route", () => {
		for (const route of [PerpRoute, SpotRoute, BuildersPerpRoute, BuildersPerpIndexRoute, BuildersPerpDexRoute]) {
			(route.options.beforeLoad as (options: { context: { queryClient: object } }) => void)({
				context: { queryClient },
			});
		}

		expect(testState.bootstrap).toHaveBeenCalledTimes(5);
		for (const route of [PerpRoute, SpotRoute, BuildersPerpIndexRoute, BuildersPerpDexRoute]) {
			expect(route.options.pendingMinMs).toBe(0);
			expect(route.options.pendingComponent).toBe(AppShellSkeleton);
			expect((route.options.component as { preload: () => Promise<void> }).preload).toHaveBeenCalledOnce();
		}
	});
});
