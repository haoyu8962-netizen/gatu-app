import { isRedirect } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({ marketName: "BTC" }));

vi.mock("@/stores/use-market-store", () => ({
	getTradeHomeMarketName: () => testState.marketName,
}));
vi.mock("@/components/trade/layout/app-shell-skeleton", () => ({ AppShellSkeleton: () => null }));
vi.mock("@/components/trade/trade-terminal-page", () => ({ TradeTerminalPage: () => null }));
vi.mock("@/config/seo", () => ({ ROUTE_SEO: { TRADE: {} } }));
vi.mock("@/lib/seo", () => ({ buildPageHead: () => ({}) }));

import { Route as HomeRoute } from "@/routes/index";
import { Route as TradeRoute } from "@/routes/trade";

function runHomeBeforeLoad(): unknown {
	try {
		(HomeRoute.options.beforeLoad as () => void)();
	} catch (error) {
		return error;
	}
	throw new Error("Home route did not redirect");
}

describe("home route boot contract", () => {
	beforeEach(() => {
		testState.marketName = "BTC";
	});

	it("redirects a cold visit to the default market without mounting an empty component", () => {
		const result = runHomeBeforeLoad();

		expect(isRedirect(result)).toBe(true);
		expect((result as Response & { options: Record<string, unknown> }).options).toMatchObject({
			to: "/trade/BTC",
			search: { scope: "all" },
			replace: true,
		});
		expect(HomeRoute.options.component).toBeUndefined();
	});

	it("preserves a safe last-selected market in the redirect", () => {
		testState.marketName = "xyz:GOOGL";

		const result = runHomeBeforeLoad() as Response & { options: Record<string, unknown> };
		expect(result.options).toMatchObject({ to: "/trade/xyz:GOOGL", replace: true });
	});

	it("uses the same zero-minimum skeleton contract for home and trade", () => {
		expect(HomeRoute.options.pendingMinMs).toBe(0);
		expect(TradeRoute.options.pendingMinMs).toBe(0);
		expect(HomeRoute.options.pendingComponent).toBeDefined();
		expect(TradeRoute.options.pendingComponent).toBe(HomeRoute.options.pendingComponent);
	});
});
