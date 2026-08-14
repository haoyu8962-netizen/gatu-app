/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketCatalogState } from "@/lib/hyperliquid/markets/market-catalog-state";

const testState = vi.hoisted(() => ({
	pathname: "/trade/BTC",
	routeMarketName: "BTC" as string | undefined,
	market: undefined as { name: string; pairName: string; kind: "perp" } | undefined,
	catalogState: undefined as MarketCatalogState | undefined,
	retry: vi.fn(async () => undefined),
	navigate: vi.fn(async () => undefined),
}));

vi.mock("@tanstack/react-router", () => ({
	useLocation: () => ({ pathname: testState.pathname }),
	useNavigate: () => testState.navigate,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarketsInfo: () => ({
		getMarketByName: () => testState.market,
		getMarketInfo: () => testState.market,
		markets: testState.market ? [testState.market] : [],
		catalogState: testState.catalogState,
		retryMarketCatalog: testState.retry,
	}),
	useSelectedMarketInfo: () => ({ data: testState.market }),
}));

vi.mock("@/providers/exchange-scope", () => ({
	useExchangeScope: () => ({
		routeMarketName: testState.routeMarketName,
		routeScope: "all",
		setScope: vi.fn(),
	}),
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/use-document-title", () => ({ TabTitleSync: () => null }));
vi.mock("@/stores/use-global-settings-store", () => ({ useIsTestnet: () => false }));
vi.mock("@/stores/use-market-store", () => ({ useMarketActions: () => ({ setSelectedMarket: vi.fn() }) }));
vi.mock("@/lib/hyperliquid/market-scope", () => ({
	getExchangeDexForMarket: () => undefined,
	getExchangeScopeForMarket: () => "perp",
}));
vi.mock("@/lib/lazy", () => ({
	createLazyComponent: (_loader: unknown, name: string) => () => <div data-lazy-component={name} />,
}));
vi.mock("@/components/pages/not-found-page", () => ({
	NotFoundPage: () => <main data-testid="not-found" />,
}));
vi.mock("@/components/trade/layout/app-shell-skeleton", () => ({
	AppShellSkeleton: () => <main data-testid="app-shell-skeleton" />,
}));
vi.mock("@/components/trade/layout/main-workspace", () => ({
	MainWorkspace: () => <main data-testid="main-workspace" />,
}));
vi.mock("@/components/trade/header/top-nav", () => ({ TopNav: () => null }));
vi.mock("@/components/trade/geo/geo-restriction-banner", () => ({ GeoRestrictionBanner: () => null }));
vi.mock("@/components/trade/testnet-banner", () => ({ TestnetBanner: () => null }));
vi.mock("@/components/trade/mobile/mobile-loading-fallback", () => ({ MobileLoadingFallback: () => null }));
vi.mock("@/components/trade/mobile/mobile-terminal", () => ({ MobileTerminal: () => null }));
vi.mock("@/components/trade/tradebox/order-toast", () => ({ OrderToast: () => null }));

import { TradeTerminalPage } from "@/components/trade/trade-terminal-page";

function catalogState(overrides: Partial<MarketCatalogState> = {}): MarketCatalogState {
	return {
		status: "ready",
		canResolveNotFound: false,
		isRefreshing: false,
		isRestoring: false,
		isPaused: false,
		isStale: false,
		error: null,
		...overrides,
	} as MarketCatalogState;
}

describe("trade terminal page boot", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.pathname = "/trade/BTC";
		testState.routeMarketName = "BTC";
		testState.market = undefined;
		testState.catalogState = catalogState({ status: "loading" });
		testState.retry.mockClear();
		testState.navigate.mockClear();
		i18n.load("en", {});
		i18n.activate("en");
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function render() {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<TradeTerminalPage />
				</I18nProvider>,
			);
		});
	}

	it("keeps the same shell skeleton while a real catalog request is pending", () => {
		render();
		expect(container.querySelector('[data-testid="app-shell-skeleton"]')).not.toBeNull();
		expect(container.innerHTML).not.toBe("");
	});

	it("shows a fail-visible paused state instead of an empty page", () => {
		testState.catalogState = catalogState({ status: "paused", isPaused: true, isStale: true });
		render();

		expect(container.querySelector('[data-testid="terminal-boot-error"]')).not.toBeNull();
		expect(container.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
	});

	it("offers one explicit retry after a terminal catalog error", () => {
		testState.catalogState = catalogState({ status: "error", error: new Error("failed"), isStale: true });
		render();

		const retryButton = container.querySelector<HTMLButtonElement>("button");
		expect(retryButton?.disabled).toBe(false);
		act(() => retryButton?.click());
		expect(testState.retry).toHaveBeenCalledTimes(1);
	});

	it("uses a fresh catalog for not-found and rejects malformed trade paths immediately", () => {
		testState.catalogState = catalogState({ canResolveNotFound: true });
		render();
		expect(container.querySelector('[data-testid="not-found"]')).not.toBeNull();

		act(() => root.unmount());
		root = createRoot(container);
		testState.pathname = "/trade/BTC/USDC/extra";
		testState.routeMarketName = undefined;
		testState.catalogState = catalogState();
		render();
		expect(container.querySelector('[data-testid="not-found"]')).not.toBeNull();
	});

	it("never withdraws an already resolved terminal shell for a background catalog error", () => {
		testState.market = { name: "BTC", pairName: "BTC-USDC", kind: "perp" };
		testState.catalogState = catalogState({
			status: "ready",
			isStale: true,
			error: new Error("background refresh failed"),
		});
		render();

		expect(container.querySelector('[data-testid="main-workspace"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="app-shell-skeleton"]')).toBeNull();
	});
});
