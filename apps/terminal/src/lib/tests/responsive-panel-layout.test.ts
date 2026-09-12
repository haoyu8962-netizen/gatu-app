import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TERMINAL_STYLES = readFileSync(resolve(TEST_DIR, "../..", "styles.css"), "utf8");
const ORDERBOOK_PANEL_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/orderbook/orderbook-panel.tsx"),
	"utf8",
);
const TRADE_PANEL_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/tradebox/trade-panel.tsx"),
	"utf8",
);
const TRADES_PANEL_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/orderbook/trades-panel.tsx"),
	"utf8",
);
const TRADE_ROW_SOURCE = readFileSync(resolve(TEST_DIR, "../..", "components/trade/orderbook/trade-row.tsx"), "utf8");
const MAIN_WORKSPACE_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/layout/main-workspace.tsx"),
	"utf8",
);
const APP_SHELL_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/layout/app-shell-skeleton.tsx"),
	"utf8",
);
const TERMINAL_LOADING_WORKSPACE_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/layout/terminal-loading-workspace.tsx"),
	"utf8",
);
const DESKTOP_GRID_LOADING_SURFACE_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/layout/desktop-grid-loading-surface.tsx"),
	"utf8",
);
const GRID_CONTENT_HEIGHT_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/layout/use-grid-content-height.ts"),
	"utf8",
);

describe("responsive panel layout contract", () => {
	it("adapts order book columns and trade controls to their own container width", () => {
		expect(ORDERBOOK_PANEL_SOURCE).toContain("orderbook-panel-container");
		expect(ORDERBOOK_PANEL_SOURCE).toContain("fullWidth");
		expect(ORDERBOOK_PANEL_SOURCE).toContain("orderbook-grid");
		expect(TERMINAL_STYLES).toContain("container-name: orderbook-panel");
		expect(TERMINAL_STYLES).toContain("@container orderbook-panel (max-width: 11.1875rem)");
		expect(TERMINAL_STYLES).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
		expect(TERMINAL_STYLES).toContain("grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) minmax(0, 2fr)");
		const baseOrderbookRule = readCssBlock(TERMINAL_STYLES, ".orderbook-grid");
		expect(baseOrderbookRule).toContain("grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) minmax(0, 2fr)");
		expect(baseOrderbookRule).not.toContain("repeat(3, minmax(0, 1fr))");
		const narrowOrderbookRule = readCssBlock(TERMINAL_STYLES, "@container orderbook-panel (max-width: 17.4375rem)");
		expect(narrowOrderbookRule).toContain(".orderbook-grid");
		expect(narrowOrderbookRule).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
		expect(narrowOrderbookRule).toContain(".trades-grid");

		expect(TRADES_PANEL_SOURCE).toContain("trades-grid");
		expect(TRADE_ROW_SOURCE).toContain("trades-grid");
		expect(TERMINAL_STYLES).toContain("@container orderbook-panel (max-width: 12.4375rem)");
		expect(TERMINAL_STYLES).toContain(".trades-grid > :nth-child(3)");
		const narrowTradesRule = readCssBlock(TERMINAL_STYLES, "@container orderbook-panel (max-width: 17.4375rem)");
		expect(narrowTradesRule).toContain(
			"grid-template-columns: minmax(3.25rem, 1fr) minmax(0, 1fr) minmax(4.5rem, 1fr)",
		);
		expect(ORDERBOOK_PANEL_SOURCE).toContain("orderbook-tab-label min-w-0 truncate");
		expect(TERMINAL_STYLES).toContain(".orderbook-tab-label");

		expect(TRADE_PANEL_SOURCE).toContain("trade-panel-container");
		expect(TRADE_PANEL_SOURCE).toContain("trade-panel-container flex h-full flex-col bg-surface font-market-close");
		expect(TERMINAL_STYLES).toContain("container-name: trade-panel");
		expect(TERMINAL_STYLES).toContain("@container trade-panel (max-width: 12.4375rem)");
		expect(TERMINAL_STYLES).toContain(".trade-compact-label");
		expect(TERMINAL_STYLES).toContain("@container trade-panel (max-width: 22.25rem)");
		expect(TERMINAL_STYLES).toMatch(
			/@container trade-panel \(max-width: 22\.25rem\)[\s\S]*?\.trade-control-button\s*{\s*padding-inline:\s*0\.3125rem;/,
		);
		expect(TERMINAL_STYLES).toContain(".trade-account-value-compact");
	});

	it("keeps order book and recent trades in one mutually exclusive tab panel", () => {
		expect(ORDERBOOK_PANEL_SOURCE.match(/<TradesPanel/g)).toHaveLength(1);
		expect(ORDERBOOK_PANEL_SOURCE).toMatch(/<TabsContent\s+value="book"/);
		expect(ORDERBOOK_PANEL_SOURCE).toMatch(/<TabsContent\s+value="trades"\s+keepMounted/);
		expect(ORDERBOOK_PANEL_SOURCE).toContain("<TradesPanel showInQuote={showOrderbookInQuote} />");
		expect(ORDERBOOK_PANEL_SOURCE).not.toContain("<TradesPanel key=");
		expect(ORDERBOOK_PANEL_SOURCE).toContain("useSizeMode");
		expect(ORDERBOOK_PANEL_SOURCE).not.toContain("use-global-settings-store");
		expect(TRADE_ROW_SOURCE).toContain('"grid h-6 items-center tabular-nums');
		expect(TRADES_PANEL_SOURCE).toContain('"trades-grid gap-1 px-2 h-8 text-xs"');
		expect(TRADES_PANEL_SOURCE).not.toContain("Waiting for trades...");
	});

	it("keeps every desktop panel mounted once while responsive grid geometry changes", () => {
		expect(MAIN_WORKSPACE_SOURCE).toContain("<main ref={containerRef} data-main-workspace");
		expect(TERMINAL_LOADING_WORKSPACE_SOURCE).toContain("<main");
		for (const panelKey of [
			"favoriteCoins",
			"coinInfo",
			"chart",
			"marketData",
			"tradingInterface",
			"accountTable",
			"accountInfo",
		]) {
			expect(MAIN_WORKSPACE_SOURCE.match(new RegExp(`key=\\"${panelKey}\\"`, "g"))).toHaveLength(1);
		}

		expect(MAIN_WORKSPACE_SOURCE).toContain("<Responsive");
		expect(MAIN_WORKSPACE_SOURCE).toContain("useDesktopGridLayout(width, mounted)");
		expect(MAIN_WORKSPACE_SOURCE).toContain("<PositionsPanel />");
		expect(MAIN_WORKSPACE_SOURCE).toContain('data-panel-id="accountInfo"');
		expect(MAIN_WORKSPACE_SOURCE).not.toContain("useIsMobile");
	});

	it("adapts account risk metrics to the compact desktop column", () => {
		expect(MAIN_WORKSPACE_SOURCE).toContain("account-panel-container desktop-grid-panel");
		expect(TERMINAL_STYLES).toContain("container-name: account-panel");
		const compactRule = readCssBlock(TERMINAL_STYLES, "@container account-panel (max-width: 15rem)");
		expect(compactRule).toContain(".account-panel-risk-bar");
		expect(compactRule).toContain("display: none");
	});

	it("starts the primary lazy panel imports when the terminal module is evaluated", () => {
		expect(MAIN_WORKSPACE_SOURCE).toContain("preloadPrimaryWorkspacePanels();");
		expect(MAIN_WORKSPACE_SOURCE).not.toContain("useEffect(preloadPrimaryWorkspacePanels");
		expect(MAIN_WORKSPACE_SOURCE).toContain("MOBILE_BREAKPOINT_PX + 1");
		expect(MAIN_WORKSPACE_SOURCE).toContain("window.matchMedia");
		expect(MAIN_WORKSPACE_SOURCE).toContain("ChartPanel.preload?.()");
		expect(MAIN_WORKSPACE_SOURCE).toContain("OrderbookPanel.preload?.()");
		expect(MAIN_WORKSPACE_SOURCE).toContain("TradePanel.preload?.()");
	});

	it("reuses one static desktop grid for the AppShell, market loading, and workspace measurement", () => {
		expect(APP_SHELL_SOURCE).toContain("<DesktopGridLoadingSurface");
		expect(APP_SHELL_SOURCE).toContain("markShellPanels");
		expect(TERMINAL_LOADING_WORKSPACE_SOURCE).toContain("<DesktopGridLoadingSurface");
		expect(TERMINAL_LOADING_WORKSPACE_SOURCE).toContain('panelClassName="desktop-grid-panel bg-surface"');
		expect(MAIN_WORKSPACE_SOURCE).toContain("<DesktopGridLoadingSurface");
		expect(DESKTOP_GRID_LOADING_SURFACE_SOURCE).not.toContain('from "react-grid-layout"');

		expect(MAIN_WORKSPACE_SOURCE).toContain('panelClassName="desktop-grid-panel bg-surface"');
		expect(APP_SHELL_SOURCE).not.toContain("animate-pulse");
		expect(TERMINAL_LOADING_WORKSPACE_SOURCE).not.toContain("animate-pulse");
		expect(MAIN_WORKSPACE_SOURCE).not.toContain("animate-pulse");
		expect(MAIN_WORKSPACE_SOURCE).not.toContain("animate-spin");
	});

	it("batches border-box measurements and persists only committed layouts", () => {
		expect(GRID_CONTENT_HEIGHT_SOURCE).toContain("entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height");
		expect(GRID_CONTENT_HEIGHT_SOURCE).not.toContain("offsetHeight");
		expect(GRID_CONTENT_HEIGHT_SOURCE).toContain("requestAnimationFrame");
		expect(GRID_CONTENT_HEIGHT_SOURCE).toContain("cancelAnimationFrame");
		expect(GRID_CONTENT_HEIGHT_SOURCE).toContain("observer.disconnect()");
		expect(MAIN_WORKSPACE_SOURCE).not.toContain("onLayoutChange=");
	});

	it("reveals the dedicated grid container surface through desktop panel gutters", () => {
		expect(readCssVariable(TERMINAL_STYLES, ":root", "--bg-grid-container")).toBe("#f1f3f6");
		expect(readCssVariable(TERMINAL_STYLES, ".dark", "--bg-grid-container")).toBe("#1b2429");
		expect(readCssVariable(TERMINAL_STYLES, "@theme inline", "--color-grid-container")).toBe(
			"var(--bg-grid-container)",
		);
		expect(MAIN_WORKSPACE_SOURCE).toContain('className="min-h-0 flex-1 bg-grid-container"');
		expect(TERMINAL_STYLES).toMatch(
			/\.desktop-terminal-grid\.react-grid-layout\s*{\s*background-color:\s*transparent;\s*transition-property:\s*none\s*!important;/,
		);
		expect(TERMINAL_STYLES).toMatch(
			/\.desktop-terminal-grid\s*>\s*\.react-grid-item\s*{\s*min-width:\s*0;\s*transition-property:\s*none\s*!important;/,
		);
	});
});

function readCssVariable(source: string, selector: string, variable: string): string | undefined {
	const selectorStart = source.indexOf(`${selector} {`);
	if (selectorStart === -1) return undefined;

	const blockStart = source.indexOf("{", selectorStart);
	const blockEnd = source.indexOf("}", blockStart);
	if (blockStart === -1 || blockEnd === -1) return undefined;

	const declaration = new RegExp(`${variable}:\\s*([^;]+);`).exec(source.slice(blockStart + 1, blockEnd));
	return declaration?.[1]?.trim();
}

function readCssBlock(source: string, selector: string): string | undefined {
	const selectorStart = source.indexOf(`${selector} {`);
	if (selectorStart === -1) return undefined;

	const blockStart = source.indexOf("{", selectorStart);
	let depth = 0;
	for (let index = blockStart; index < source.length; index += 1) {
		if (source[index] === "{") depth += 1;
		if (source[index] !== "}") continue;

		depth -= 1;
		if (depth === 0) return source.slice(blockStart + 1, index);
	}

	return undefined;
}
