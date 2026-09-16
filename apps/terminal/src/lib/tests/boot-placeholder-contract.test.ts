import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const COMPONENTS_DIR = resolve(TEST_DIR, "../../components");

const BOOT_PLACEHOLDER_SOURCES = [
	"dashboard/dashboard-frame-view.tsx",
	"dashboard/dashboard-content-placeholder-view.tsx",
	"trade/mobile/mobile-token-selector-view.tsx",
	"trade/mobile/mobile-positions-tabs-view.tsx",
	"trade/mobile/mobile-trade-available-view.tsx",
	"trade/mobile/mobile-trade-summary-view.tsx",
	"trade/mobile/mobile-trade-size-view.tsx",
	"trade/mobile/mobile-terminal-frame-view.tsx",
	"trade/mobile/mobile-trade-frame-view.tsx",
	"trade/mobile/mobile-header-view.tsx",
	"trade/mobile/mobile-order-entry-placeholder-view.tsx",
	"trade/mobile/mobile-wallet-cta-view.tsx",
	"trade/mobile/mobile-market-bar-view.tsx",
	"trade/mobile/mobile-trade-header-view.tsx",
	"trade/mobile/mobile-bottom-nav-view.tsx",
	"trade/mobile/mobile-book-chrome-view.tsx",
	"trade/mobile/mobile-trade-cta-frame-view.tsx",

	"trade/positions/account-table-header-view.tsx",
	"trade/positions/account-tab-strip-view.tsx",
	"trade/tradebox/account-overview-view.tsx",
	"trade/tradebox/account-action-button-view.tsx",
	"trade/tradebox/account-panel-frame-view.tsx",
	"trade/components/trade-slider-view.tsx",
	"trade/tradebox/trade-input-frame-view.tsx",
	"trade/tradebox/trade-available-row-view.tsx",
	"trade/tradebox/side-toggle-view.tsx",
	"trade/tradebox/trade-checkbox-view.tsx",
	"trade/tradebox/trade-panel-body-view.tsx",
	"trade/tradebox/trade-control-button-view.tsx",
	"trade/tradebox/trade-percent-frame-view.tsx",
	"trade/tradebox/trade-header-view.tsx",
	"trade/tradebox/trade-size-unit-view.tsx",
	"trade/tradebox/trade-option-checkboxes-view.tsx",
	"trade/tradebox/trade-panel-footer-view.tsx",
	"trade/tradebox/trade-size-slider-row-view.tsx",
	"trade/tradebox/trade-cta-view.tsx",
	"trade/tradebox/order-type-tab-view.tsx",
	"trade/tradebox/trade-form-fields-view.tsx",
	"trade/components/summary-row-view.tsx",
	"dashboard/dashboard-shell-skeleton.tsx",
	"trade/layout/app-shell-skeleton.tsx",
	"trade/layout/desktop-grid-loading-surface.tsx",
	"trade/layout/desktop-placeholders.ts",
	"trade/orderbook/orderbook-panel-view.tsx",
	"trade/orderbook/orderbook-tabs-view.tsx",
	"trade/orderbook/orderbook-grouping-trigger-view.tsx",
	"trade/layout/desktop-terminal-frame-view.tsx",
	"trade/header/top-nav-view.tsx",
	"trade/header/nav-menu-trigger-view.tsx",
	"trade/header/header-icon-button-view.tsx",
	"trade/header/wallet-cta-view.tsx",
	"trade/footer/footer-bar-view.tsx",
	"trade/layout/desktop-terminal-surface.tsx",
	"trade/layout/main-workspace.tsx",
	"trade/layout/terminal-loading-workspace.tsx",
	"trade/mobile/mobile-loading-fallback.tsx",
	"trade/chart/chart-panel.tsx",
	"trade/header/top-nav.tsx",
];

const PHASE_ONE_LOADING_SOURCES = [
	"dashboard/dashboard-shell-skeleton.tsx",
	"trade/layout/app-shell-skeleton.tsx",
	"trade/layout/desktop-terminal-surface.tsx",
	"trade/layout/terminal-loading-workspace.tsx",
	"trade/mobile/mobile-loading-fallback.tsx",
	"trade/trade-terminal-page.tsx",
];

function readComponent(relativePath: string): string {
	return readFileSync(resolve(COMPONENTS_DIR, relativePath), "utf8");
}

describe("boot placeholder contract", () => {
	it("keeps every structural boot placeholder free of loading animation", () => {
		for (const relativePath of BOOT_PLACEHOLDER_SOURCES) {
			const source = readComponent(relativePath);
			expect(source, relativePath).not.toContain("animate-pulse");
			expect(source, relativePath).not.toContain("animate-spin");
		}
	});

	it("keeps the phase-one loading transition derived from state without clocks or animation frames", () => {
		for (const relativePath of PHASE_ONE_LOADING_SOURCES) {
			const source = readComponent(relativePath);
			expect(source, relativePath).not.toMatch(/\bset(?:Timeout|Interval)\s*\(/);
			expect(source, relativePath).not.toMatch(/\brequestAnimationFrame\s*\(/);
			expect(source, relativePath).not.toMatch(/\banimate-(?:pulse|spin)\b/);
		}
	});

	it("keeps the shared pre-runtime navigation inside the inert decorative frame", () => {
		const shell = readComponent("trade/layout/app-shell-skeleton.tsx");

		expect(shell).toContain('aria-busy="true"');
		expect(shell).toContain('<output className="sr-only">');
		expect(shell).toContain("<MobileShellSkeleton />");
		expect(shell).toContain("<DesktopGridLoadingSurface");
		expect(shell).toContain("<TopNavView");
		expect(shell).toContain("<FooterBarView");
		expect(shell).toContain('<div aria-hidden="true" inert>');
	});

	it("uses shared frame and inert chrome for dashboard startup", () => {
		const shell = readComponent("dashboard/dashboard-shell-skeleton.tsx");

		expect(shell).toContain('aria-busy="true"');
		expect(shell).toContain('<output className="sr-only">');
		expect(shell).toContain("<DashboardFrameView");
		expect(shell).toContain("<DashboardContentPlaceholderView");
		expect(shell).toContain('<div aria-hidden="true" inert>');
		expect(shell).not.toContain("DesktopGridLoadingSurface");
		expect(shell).toContain("<TopNavView");
		expect(shell).toContain("<MobileHeaderView");
		expect(shell).toContain("<FooterBarView");
		expect(shell).not.toContain("<nav");
		expect(shell).not.toContain("<button");
	});

	it("renders lazy workspace panels on the same surface as the shell skeleton", () => {
		const workspace = readComponent("trade/layout/main-workspace.tsx");

		expect(workspace).toContain(
			'const panelFallback = <div aria-hidden="true" className="h-full w-full bg-surface" />',
		);
		expect(workspace).not.toContain("chartPanelFallback");
		expect(workspace).not.toContain("bg-fill-weaker");
	});

	it("uses the branded orbit only for initial chart loading while retaining the recovery spinner", () => {
		const chartPanel = readComponent("trade/chart/chart-panel.tsx");
		const chartWidget = readComponent("trade/chart/tradingview-chart.tsx");

		expect(chartPanel).toContain('className="block h-full w-full bg-surface"');
		expect(chartPanel).toContain('<span className="sr-only">');
		expect(chartWidget).toContain("data-chart-loading");
		expect(chartWidget).toContain("text-fg-muted");
		expect(chartWidget).toContain("GatuOrbitLoader");
		expect(chartWidget).toContain('className="size-9 shrink-0"');
		expect(chartWidget).toContain('<span className="sr-only">{t`Loading...`}</span>');
		expect(chartWidget).toContain("hasCompletedInitialWidgetLoadRef.current");
		expect(chartWidget).toContain("SpinnerGapIcon");
		expect(chartWidget).toContain("animate-spin");
	});
});
