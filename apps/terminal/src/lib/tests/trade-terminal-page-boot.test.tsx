/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { act, useEffect, useState } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketCatalogState } from "@/lib/hyperliquid/markets/market-catalog-state";
import { useOrderEntryActions, useOrderSize } from "@/stores/use-order-entry-store";
import { createI18nRoot } from "./harness/react";

interface TestMarket {
	name: string;
	pairName: string;
	kind: "perp" | "spot";
}

const testState = vi.hoisted(() => ({
	catalogState: undefined as MarketCatalogState | undefined,
	footerMounts: 0,
	footerUnmounts: 0,
	isMobile: false,
	isTestnet: false,
	markets: [] as TestMarket[],
	navigate: vi.fn(async (_options?: unknown) => undefined),
	pathname: "/trade/BTC",
	retry: vi.fn(async () => undefined),
	routeMarketName: "BTC" as string | undefined,
	routeScope: "all" as "all" | "perp" | "spot" | "builders-perp",
	selectedMarket: undefined as TestMarket | undefined,
	selectedMarketInfoReads: 0,
	setScope: vi.fn(),
	setSelectedMarket: vi.fn(),
	tabTitleRenders: 0,
	topNavMounts: 0,
	topNavUnmounts: 0,
	userMenuMounts: 0,
	userMenuUnmounts: 0,
}));

const BTC_MARKET: TestMarket = { name: "BTC", pairName: "BTC-USDC", kind: "perp" };
const CXMT_MARKET: TestMarket = { name: "xyz:CXMT", pairName: "CXMT-USDC", kind: "perp" };
let draftActions: ReturnType<typeof useOrderEntryActions>;

vi.mock("@tanstack/react-router", () => ({
	useLocation: () => ({ pathname: testState.pathname }),
	useNavigate: () => testState.navigate,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarketsInfo: () => ({
		getMarketByName: (name: string) => testState.markets.find((market) => market.name === name),
		getMarketInfo: (name: string) =>
			testState.markets.find((market) => market.name === name || market.pairName === name),
		markets: testState.markets,
		catalogState: testState.catalogState,
		retryMarketCatalog: testState.retry,
	}),
	useSelectedMarketInfo: () => {
		testState.selectedMarketInfoReads += 1;
		return { data: testState.selectedMarket };
	},
}));

vi.mock("@/providers/exchange-scope", () => ({
	useExchangeScope: () => ({
		routeMarketName: testState.routeMarketName,
		routeScope: testState.routeScope,
		setScope: testState.setScope,
	}),
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("@/hooks/use-document-title", () => ({
	TabTitleSync: () => {
		testState.tabTitleRenders += 1;
		return <div data-testid="tab-title-sync" />;
	},
}));

vi.mock("@/components/trade/account-activity-feed-owner", () => ({
	AccountActivityFeedOwner: () => <div data-testid="account-activity-feed-owner" />,
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useIsTestnet: () => testState.isTestnet,
	useMarketOrderSlippagePercent: () => 2.5,
	usePositionsActiveTab: () => "positions",
	getResolvedFormatLocale: () => "en-US",
}));

vi.mock("@/stores/use-market-store", () => ({
	useSelectedMarket: () => testState.selectedMarket?.name ?? "BTC",
	useMarketActions: () => ({ setSelectedMarket: testState.setSelectedMarket }),
}));

vi.mock("@/lib/hyperliquid/market-scope", () => ({
	getExchangeDexForMarket: (market: TestMarket) => (market.name.split(":")[1] ? market.name.split(":")[0] : undefined),
	getExchangeScopeForMarket: (market: TestMarket) =>
		market.kind === "spot" ? "spot" : market.name.includes(":") ? "builders-perp" : "perp",
}));

vi.mock("@/lib/lazy", () => ({
	createLazyComponent: (_loader: unknown, exportName: string) => {
		if (exportName === "FooterBar") {
			return function FooterProbe({ mode = "default" }: { mode?: string }) {
				useEffect(() => {
					testState.footerMounts += 1;
					return () => {
						testState.footerUnmounts += 1;
					};
				}, []);
				return <footer data-mode={mode} data-testid="footer-bar" />;
			};
		}

		return function LazyProbe() {
			return <div data-testid={exportName} />;
		};
	},
}));

vi.mock("@/components/pages/not-found-page", () => ({
	NotFoundPage: () => <main data-testid="not-found" />,
}));

vi.mock("@/components/trade/header/top-nav", () => {
	function UserMenuProbe() {
		const [walletModalOpen, setWalletModalOpen] = useState(false);

		useEffect(() => {
			testState.userMenuMounts += 1;
			return () => {
				testState.userMenuUnmounts += 1;
			};
		}, []);

		return (
			<div data-testid="user-menu">
				<button type="button" onClick={() => setWalletModalOpen(true)}>
					Connect Wallet
				</button>
				{walletModalOpen ? <div data-testid="wallet-modal">Wallet</div> : null}
			</div>
		);
	}

	return {
		TopNav: ({ mode = "default" }: { mode?: string }) => {
			useEffect(() => {
				testState.topNavMounts += 1;
				return () => {
					testState.topNavUnmounts += 1;
				};
			}, []);

			return (
				<header data-mode={mode} data-testid="top-nav">
					<UserMenuProbe />
				</header>
			);
		},
	};
});

vi.mock("@/components/trade/layout/main-workspace", () => ({
	MainWorkspace: () => {
		draftActions = useOrderEntryActions();
		return <main data-testid="main-workspace" data-size={useOrderSize()} />;
	},
}));

vi.mock("@/components/trade/geo/geo-restriction-banner", () => ({
	GeoRestrictionBanner: () => <aside data-testid="geo-restriction-banner" />,
}));

vi.mock("@/components/trade/testnet-banner", () => ({
	TestnetBanner: () => <aside data-testid="testnet-banner" />,
}));

vi.mock("@/components/trade/mobile/mobile-loading-fallback", () => ({
	MobileLoadingFallback: () => <main aria-busy="true" data-testid="mobile-loading-fallback" />,
}));

vi.mock("@/components/trade/mobile/mobile-terminal", () => ({
	MobileTerminal: () => <main data-testid="mobile-terminal" />,
}));

vi.mock("@/components/trade/tradebox/order-toast", () => ({
	OrderToast: () => <div data-testid="order-toast" />,
}));

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

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("trade terminal page boot", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		testState.catalogState = catalogState({ status: "loading" });
		testState.footerMounts = 0;
		testState.footerUnmounts = 0;
		testState.isMobile = false;
		testState.isTestnet = false;
		testState.markets = [];
		testState.navigate.mockClear();
		testState.pathname = "/trade/BTC";
		testState.retry.mockClear();
		testState.routeMarketName = "BTC";
		testState.routeScope = "all";
		testState.selectedMarket = BTC_MARKET;
		testState.selectedMarketInfoReads = 0;
		testState.setScope.mockClear();
		testState.setSelectedMarket.mockClear();
		testState.tabTitleRenders = 0;
		testState.topNavMounts = 0;
		testState.topNavUnmounts = 0;
		testState.userMenuMounts = 0;
		testState.userMenuUnmounts = 0;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderPage() {
		act(() => root.render(<TradeTerminalPage />));
	}

	function expectNoReadyOnlyRuntime() {
		expect(container.querySelector('[data-testid="main-workspace"]')).toBeNull();
		expect(container.querySelector('[data-testid="tab-title-sync"]')).toBeNull();
		expect(container.querySelector('[data-testid="order-toast"]')).toBeNull();
		expect(container.querySelector('[data-testid="GlobalModals"]')).toBeNull();
		expect(testState.selectedMarketInfoReads).toBe(0);
		expect(testState.setScope).not.toHaveBeenCalled();
		expect(testState.setSelectedMarket).not.toHaveBeenCalled();
	}

	function expectDesktopLoadingSurface() {
		expect(container.querySelector('[data-testid="desktop-terminal-surface"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="top-nav"]')?.getAttribute("data-mode")).toBe("market-loading");
		expect(container.querySelector('[data-testid="footer-bar"]')?.getAttribute("data-mode")).toBe("market-loading");
		expect(container.querySelector('[data-testid="terminal-loading-workspace"]')?.getAttribute("aria-busy")).toBe(
			"true",
		);
		expectNoReadyOnlyRuntime();
	}

	it("keeps the same desktop surface while loading and canonical redirecting, and still runs the redirect effect", () => {
		testState.pathname = "/trade/SOL";
		testState.routeMarketName = "SOL";
		renderPage();

		expectDesktopLoadingSurface();
		const surface = container.querySelector('[data-testid="desktop-terminal-surface"]');
		const topNav = container.querySelector('[data-testid="top-nav"]');
		const footer = container.querySelector('[data-testid="footer-bar"]');
		expect(testState.navigate).not.toHaveBeenCalled();

		testState.pathname = "/trade/btc";
		testState.routeMarketName = "btc";
		testState.markets = [BTC_MARKET];
		renderPage();

		expectDesktopLoadingSurface();
		expect(container.querySelector('[data-testid="desktop-terminal-surface"]')).toBe(surface);
		expect(container.querySelector('[data-testid="top-nav"]')).toBe(topNav);
		expect(container.querySelector('[data-testid="footer-bar"]')).toBe(footer);
		expect(testState.navigate).toHaveBeenCalledTimes(1);
		const options = testState.navigate.mock.calls[0]?.[0] as {
			to: string;
			search: (previous: Record<string, unknown>) => Record<string, unknown>;
			replace: boolean;
			resetScroll: boolean;
		};
		expect(options).toMatchObject({ to: "/trade/BTC", replace: true, resetScroll: false });
		expect(options.search({ retained: true })).toEqual({ retained: true, scope: "all" });
	});

	it("resets a draft on route-driven market changes without replacing the workspace", () => {
		testState.catalogState = catalogState();
		testState.markets = [BTC_MARKET, CXMT_MARKET];
		renderPage();
		const workspace = container.querySelector('[data-testid="main-workspace"]');
		act(() => draftActions.setSize("2"));
		expect(workspace?.getAttribute("data-size")).toBe("2");
		testState.routeMarketName = CXMT_MARKET.name;
		testState.pathname = "/trade/xyz:CXMT";
		testState.selectedMarket = CXMT_MARKET;
		renderPage();
		expect(container.querySelector('[data-testid="main-workspace"]')).toBe(workspace);
		expect(workspace?.getAttribute("data-size")).toBe("");
	});

	it("does not subscribe or synchronize a default BTC while xyz:CXMT is unresolved", () => {
		testState.pathname = "/trade/xyz%3ACXMT";
		testState.routeMarketName = "xyz:CXMT";
		testState.markets = [BTC_MARKET];
		testState.selectedMarket = BTC_MARKET;
		renderPage();

		expectDesktopLoadingSurface();

		testState.catalogState = catalogState();
		testState.markets = [BTC_MARKET, CXMT_MARKET];
		testState.selectedMarket = CXMT_MARKET;
		renderPage();

		expect(container.querySelector('[data-testid="main-workspace"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="terminal-loading-workspace"]')).toBeNull();
		expect(testState.selectedMarketInfoReads).toBe(1);
		expect(testState.setScope).toHaveBeenCalledOnce();
		expect(testState.setScope).toHaveBeenCalledWith("all", "xyz", "xyz:CXMT");
		expect(testState.setSelectedMarket).toHaveBeenNthCalledWith(1, "builders-perp", "xyz:CXMT");
		expect(testState.setSelectedMarket).toHaveBeenNthCalledWith(2, "all", "xyz:CXMT");
	});

	it("preserves TopNav, Footer, UserMenu, and open wallet state when loading becomes ready", () => {
		renderPage();

		const surface = container.querySelector('[data-testid="desktop-terminal-surface"]');
		const topNav = container.querySelector('[data-testid="top-nav"]');
		const footer = container.querySelector('[data-testid="footer-bar"]');
		const userMenu = container.querySelector('[data-testid="user-menu"]');
		expect(testState.topNavMounts).toBe(1);
		expect(testState.footerMounts).toBe(1);
		expect(testState.userMenuMounts).toBe(1);

		act(() => {
			container.querySelector<HTMLButtonElement>('[data-testid="user-menu"] button')?.click();
		});
		expect(container.querySelector('[data-testid="wallet-modal"]')).not.toBeNull();

		testState.catalogState = catalogState();
		testState.markets = [BTC_MARKET];
		renderPage();

		expect(container.querySelector('[data-testid="desktop-terminal-surface"]')).toBe(surface);
		expect(container.querySelector('[data-testid="top-nav"]')).toBe(topNav);
		expect(container.querySelector('[data-testid="footer-bar"]')).toBe(footer);
		expect(container.querySelector('[data-testid="user-menu"]')).toBe(userMenu);
		expect(container.querySelector('[data-testid="wallet-modal"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="top-nav"]')?.getAttribute("data-mode")).toBe("default");
		expect(container.querySelector('[data-testid="footer-bar"]')?.getAttribute("data-mode")).toBe("default");
		expect(testState.topNavMounts).toBe(1);
		expect(testState.topNavUnmounts).toBe(0);
		expect(testState.footerMounts).toBe(1);
		expect(testState.footerUnmounts).toBe(0);
		expect(testState.userMenuMounts).toBe(1);
		expect(testState.userMenuUnmounts).toBe(0);
		expect(container.querySelector('[data-testid="main-workspace"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="tab-title-sync"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="order-toast"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="GlobalModals"]')).not.toBeNull();
	});

	it("accepts a unique pair-name lookup as ready", () => {
		testState.pathname = "/trade/BTC-USDC";
		testState.routeMarketName = "BTC-USDC";
		testState.markets = [BTC_MARKET];
		renderPage();

		expect(container.querySelector('[data-testid="main-workspace"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="top-nav"]')?.getAttribute("data-mode")).toBe("default");
		expect(testState.setScope).toHaveBeenCalledWith("all", undefined, "BTC");
		expect(testState.setSelectedMarket).toHaveBeenNthCalledWith(1, "perp", "BTC");
		expect(testState.navigate).not.toHaveBeenCalled();
	});

	it("treats the bare trade route as ready without synchronizing a missing route market", () => {
		testState.pathname = "/trade";
		testState.routeMarketName = undefined;
		renderPage();

		expect(container.querySelector('[data-testid="main-workspace"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="terminal-loading-workspace"]')).toBeNull();
		expect(testState.selectedMarketInfoReads).toBe(1);
		expect(testState.setScope).not.toHaveBeenCalled();
		expect(testState.setSelectedMarket).not.toHaveBeenCalled();
	});

	it("keeps mobile loading isolated from every desktop and ready-only surface", () => {
		testState.isMobile = true;
		renderPage();

		expect(container.querySelector('[data-testid="mobile-loading-fallback"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="desktop-terminal-surface"]')).toBeNull();
		expect(container.querySelector('[data-testid="mobile-terminal"]')).toBeNull();
		expectNoReadyOnlyRuntime();

		testState.catalogState = catalogState();
		testState.markets = [BTC_MARKET];
		renderPage();

		expect(container.querySelector('[data-testid="mobile-loading-fallback"]')).toBeNull();
		expect(container.querySelector('[data-testid="mobile-terminal"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="desktop-terminal-surface"]')).toBeNull();
		expect(container.querySelector('[data-testid="tab-title-sync"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="order-toast"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="GlobalModals"]')).not.toBeNull();
	});

	it("uses the combined testnet header offset on the stable desktop surface", () => {
		testState.isTestnet = true;
		renderPage();

		const surface = container.querySelector<HTMLElement>('[data-testid="desktop-terminal-surface"]');
		expect(surface?.className).toContain("pt-[5.5rem]");
		expect(surface?.className).toContain("testnet-bg");
		expect(container.querySelector('[data-testid="testnet-banner"]')).not.toBeNull();
		expectDesktopLoadingSurface();
	});

	it("shows a fail-visible paused state and does not retry while offline", () => {
		testState.catalogState = catalogState({ status: "paused", isPaused: true, isStale: true });
		renderPage();

		expect(container.querySelector('[data-testid="terminal-boot-error"]')).not.toBeNull();
		const retryButton = container.querySelector<HTMLButtonElement>("button");
		expect(retryButton?.disabled).toBe(true);
		act(() => retryButton?.click());
		expect(testState.retry).not.toHaveBeenCalled();
		expect(container.querySelector('[data-testid="desktop-terminal-surface"]')).toBeNull();
	});

	it("offers exactly one explicit retry after a terminal catalog error", () => {
		testState.catalogState = catalogState({ status: "error", error: new Error("failed"), isStale: true });
		renderPage();

		const retryButton = container.querySelector<HTMLButtonElement>("button");
		expect(retryButton?.disabled).toBe(false);
		act(() => retryButton?.click());
		expect(testState.retry).toHaveBeenCalledTimes(1);
	});

	it("uses a fresh catalog for not-found and rejects malformed trade paths immediately", () => {
		testState.catalogState = catalogState({ canResolveNotFound: true });
		renderPage();
		expect(container.querySelector('[data-testid="not-found"]')).not.toBeNull();

		testState.pathname = "/trade/BTC/USDC/extra";
		testState.routeMarketName = undefined;
		testState.catalogState = catalogState({ status: "loading" });
		renderPage();
		expect(container.querySelector('[data-testid="not-found"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="desktop-terminal-surface"]')).toBeNull();
	});

	it.each([
		["refresh", catalogState({ status: "loading", isRefreshing: true })],
		[
			"background error",
			catalogState({ status: "error", error: new Error("background refresh failed"), isStale: true }),
		],
	])("keeps an already resolved terminal ready during %s", (_label, state) => {
		testState.catalogState = state;
		testState.markets = [BTC_MARKET];
		renderPage();

		expect(container.querySelector('[data-testid="main-workspace"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="terminal-loading-workspace"]')).toBeNull();
		expect(container.querySelector('[data-testid="top-nav"]')?.getAttribute("data-mode")).toBe("default");
	});
});
