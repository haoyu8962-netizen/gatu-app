import { isRedirect } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({ bootstrap: vi.fn(), bootOrderbook: vi.fn(), marketName: "BTC" }));
const queryClient = {};

vi.mock("@/stores/use-market-store", () => ({
	getTradeHomeMarketName: () => testState.marketName,
}));
vi.mock("@/components/startup-fallback", () => ({ StartupFallback: () => null }));
vi.mock("@/components/trade/trade-terminal-page", () => ({ TradeTerminalPage: () => null }));
vi.mock("@/config/seo", () => ({ ROUTE_SEO: { TRADE: {} } }));
vi.mock("@/lib/hyperliquid/markets/market-catalog-bootstrap", () => ({
	startMarketCatalogBootstrap: testState.bootstrap,
}));
vi.mock("@/lib/trade/orderbook-boot", () => ({ bootOrderbook: testState.bootOrderbook }));
vi.mock("@/lib/lazy", () => ({
	createLazyComponent: () => Object.assign(() => null, { preload: vi.fn(async () => undefined) }),
}));
vi.mock("@/lib/seo", () => ({ buildPageHead: () => ({}) }));

import { StartupFallback } from "@/components/startup-fallback";
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
		testState.bootOrderbook.mockClear();
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
		expect(HomeRoute.options.ssr).toBe(false);
	});

	it("preserves a safe last-selected market in the redirect", () => {
		testState.marketName = "xyz:GOOGL";

		const result = runHomeBeforeLoad() as Response & { options: Record<string, unknown> };
		expect(result.options).toMatchObject({ to: "/trade/xyz:GOOGL", replace: true });
	});

	it("uses StartupFallback directly with no artificial minimum for every pending terminal route", () => {
		for (const route of [HomeRoute, TradeRoute, PerpRoute, SpotRoute, BuildersPerpIndexRoute, BuildersPerpDexRoute]) {
			expect(route.options.pendingMinMs).toBe(0);
			expect(route.options.pendingComponent).toBe(StartupFallback);
		}
	});

	it("starts the market catalog before the home redirect and direct trade route mount", () => {
		runHomeBeforeLoad();
		expect(testState.bootstrap).toHaveBeenCalledWith(queryClient);

		(
			TradeRoute.options.beforeLoad as (options: {
				context: { queryClient: object };
				location: { pathname: string };
			}) => void
		)({
			context: { queryClient },
			location: { pathname: "/trade/BTC" },
		});
		expect(testState.bootstrap).toHaveBeenCalledTimes(2);
		expect(testState.bootOrderbook).toHaveBeenCalledWith("/trade/BTC");
		expect((TradeRoute.options.component as { preload: () => Promise<void> }).preload).toHaveBeenCalledOnce();
	});

	it("starts the same bootstrap for every terminal entry route", () => {
		for (const route of [PerpRoute, SpotRoute, BuildersPerpRoute, BuildersPerpIndexRoute, BuildersPerpDexRoute]) {
			(
				route.options.beforeLoad as (options: {
					context: { queryClient: object };
					location: { pathname: string };
				}) => void
			)({
				context: { queryClient },
				location: { pathname: "/perp" },
			});
		}

		expect(testState.bootstrap).toHaveBeenCalledTimes(5);
		expect(testState.bootOrderbook).toHaveBeenCalledTimes(5);
		for (const route of [PerpRoute, SpotRoute, BuildersPerpIndexRoute, BuildersPerpDexRoute]) {
			expect(route.options.pendingMinMs).toBe(0);
			expect(route.options.pendingComponent).toBe(StartupFallback);
			expect((route.options.component as { preload: () => Promise<void> }).preload).toHaveBeenCalledOnce();
		}
	});
});
