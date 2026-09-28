// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	isMobile: false,
	viewportIsMobile: false,
	preloadTopNav: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/hooks/use-mobile", () => ({
	MOBILE_MEDIA_QUERY: "(max-width: 1000px)",
	useIsMobile: () => testState.isMobile,
}));
vi.mock("@/stores/use-global-settings-store", () => ({ useIsTestnet: () => false }));
vi.mock("@/components/trade/header/top-nav", () => ({
	preloadTopNav: testState.preloadTopNav,
	TopNav: () => <header data-testid="top-nav">Top navigation</header>,
}));
vi.mock("@/components/trade/mobile/mobile-header", () => ({
	MobileHeader: () => <header data-testid="mobile-header">Mobile header</header>,
}));
vi.mock("@/components/trade/testnet-banner", () => ({ TestnetBanner: () => null }));
vi.mock("@/components/trade/footer/footer-bar", () => ({
	FooterBar: () => <footer data-testid="footer-bar">Footer</footer>,
}));
vi.mock("@/components/trade/components/global-modals", () => ({
	GlobalModals: () => <div data-testid="global-modals" />,
}));
vi.mock("@/components/referrals/referral-dashboard", () => ({
	ReferralDashboard: () => <main data-testid="page-main" />,
}));
vi.mock("@/components/leaderboard/leaderboard-fixture", () => ({
	getLeaderboardFixtureFromLocation: () => null,
	LeaderboardFixture: () => null,
}));
vi.mock("@/components/leaderboard/use-leaderboard-controller", () => ({ useLeaderboardController: () => ({}) }));
vi.mock("@/components/leaderboard/leaderboard-view", () => ({
	LeaderboardView: () => <main data-testid="page-main" />,
}));
vi.mock("@/components/api-wallet/api-wallet-fixture", () => ({
	getApiWalletFixtureFromLocation: () => null,
	ApiWalletFixture: () => null,
}));
vi.mock("@/components/api-wallet/use-api-wallet-controller", () => ({ useApiWalletController: () => ({}) }));
vi.mock("@/components/api-wallet/api-wallet-view", () => ({
	ApiWalletView: () => <main data-testid="page-main" />,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const DASHBOARD_PAGES = [
	"api-wallet/api-wallet-page",
	"earn/earn-page",
	"funding-history/funding-history-page",
	"historical-orders/historical-orders-page",
	"leaderboard/leaderboard-page",
	"portfolio/portfolio-page",
	"referrals/referrals-page",
	"staking/staking-page",
	"trade-history/trade-history-page",
	"vaults/vaults-page",
];

function stubMatchMedia(matches: boolean) {
	testState.viewportIsMobile = matches;
	vi.stubGlobal(
		"matchMedia",
		vi.fn((query: string) => ({
			matches: query === "(max-width: 1000px)" && testState.viewportIsMobile,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		})),
	);
}

describe("dashboard chrome", () => {
	let container: HTMLDivElement;
	let root: Root | undefined;

	beforeEach(() => {
		vi.resetModules();
		testState.isMobile = false;
		testState.preloadTopNav.mockReset();
		testState.preloadTopNav.mockImplementation(() => Promise.resolve());
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		if (root) {
			act(() => root?.unmount());
			root = undefined;
		}
		container.remove();
		vi.unstubAllGlobals();
	});

	it("skips the footer chunk where the mobile layout does not render it", async () => {
		stubMatchMedia(true);
		const chrome = await import("@/components/dashboard/dashboard-chrome");
		const footerPreload = vi.spyOn(chrome.FooterBar, "preload");
		await chrome.preloadDashboardChrome();
		expect(footerPreload).not.toHaveBeenCalled();

		testState.isMobile = true;
		const { ReferralsPage } = await import("@/components/referrals/referrals-page");
		root = createRoot(container);
		act(() => root?.render(<ReferralsPage />));
		expect(container.querySelector('[data-testid="mobile-header"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="global-modals"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="footer-bar"]')).toBeNull();
	});

	it.each([
		["ReferralsPage", () => import("@/components/referrals/referrals-page").then((module) => module.ReferralsPage)],
		[
			"LeaderboardPage",
			() => import("@/components/leaderboard/leaderboard-page").then((module) => module.LeaderboardPage),
		],
		["ApiWalletPage", () => import("@/components/api-wallet/api-wallet-page").then((module) => module.ApiWalletPage)],
	])(
		"commits the footer and the modal host in the first render of %s once the route preload settles",
		async (_name, load) => {
			stubMatchMedia(false);
			const chrome = await import("@/components/dashboard/dashboard-chrome");
			const footerPreload = vi.spyOn(chrome.FooterBar, "preload");
			await chrome.preloadDashboardChrome();
			expect(footerPreload).toHaveBeenCalledTimes(1);

			const Page = await load();
			root = createRoot(container);
			act(() => root?.render(<Page />));

			expect(container.querySelector('[data-testid="top-nav"]')).not.toBeNull();
			expect(container.querySelector('[data-testid="page-main"]')).not.toBeNull();
			expect(container.querySelector('[data-testid="footer-bar"]')).not.toBeNull();
			expect(container.querySelector('[data-testid="global-modals"]')).not.toBeNull();
		},
	);

	it("waits for the account menu before settling", async () => {
		stubMatchMedia(false);
		let releaseTopNav: () => void = () => {};
		testState.preloadTopNav.mockImplementation(
			() =>
				new Promise<void>((resolveTopNav) => {
					releaseTopNav = resolveTopNav;
				}),
		);
		const chrome = await import("@/components/dashboard/dashboard-chrome");
		let settled = false;
		const preload = chrome.preloadDashboardChrome().then(() => {
			settled = true;
		});
		await new Promise((resolveTick) => setTimeout(resolveTick, 0));
		expect(testState.preloadTopNav).toHaveBeenCalledTimes(1);
		expect(settled).toBe(false);
		releaseTopNav();
		await preload;
		expect(settled).toBe(true);
	});

	it("adds the footer when the viewport becomes desktop while the account menu is still loading", async () => {
		stubMatchMedia(true);
		let releaseTopNav: () => void = () => {};
		testState.preloadTopNav.mockImplementation(
			() =>
				new Promise<void>((resolveTopNav) => {
					releaseTopNav = resolveTopNav;
				}),
		);
		const chrome = await import("@/components/dashboard/dashboard-chrome");
		let releaseFooter: () => void = () => {};
		const footerPreload = vi.spyOn(chrome.FooterBar, "preload").mockImplementation(
			() =>
				new Promise<void>((resolveFooter) => {
					releaseFooter = resolveFooter;
				}),
		);
		let settled = false;
		const preload = chrome.preloadDashboardChrome().then(() => {
			settled = true;
		});
		await new Promise((resolveTick) => setTimeout(resolveTick, 0));
		expect(footerPreload).not.toHaveBeenCalled();

		testState.viewportIsMobile = false;
		releaseTopNav();
		await vi.waitFor(() => expect(footerPreload).toHaveBeenCalledTimes(1));
		await new Promise((resolveTick) => setTimeout(resolveTick, 0));
		expect(settled).toBe(false);

		releaseFooter();
		await preload;
		expect(settled).toBe(true);
	});

	it.each(DASHBOARD_PAGES)("%s renders the shared header and the preloaded footer and modal host", (page) => {
		const source = readFileSync(resolve(process.cwd(), `src/components/${page}.tsx`), "utf8");
		expect(source).toContain(
			'import { DashboardHeader, FooterBar, GlobalModals } from "@/components/dashboard/dashboard-chrome";',
		);
		expect(source).toContain("<DashboardHeader isMobile={isMobile} />");
		expect(source).not.toContain("footer/footer-bar");
		expect(source).not.toContain("header/top-nav");
		expect(source).not.toContain("mobile/mobile-header");
		expect(source).not.toContain("components/global-modals");
	});
});
