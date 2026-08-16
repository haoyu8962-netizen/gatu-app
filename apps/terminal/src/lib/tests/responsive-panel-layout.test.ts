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

		expect(TRADES_PANEL_SOURCE).toContain("trades-grid");
		expect(TRADE_ROW_SOURCE).toContain("trades-grid");
		expect(TERMINAL_STYLES).toContain("@container orderbook-panel (max-width: 12.4375rem)");
		expect(TERMINAL_STYLES).toContain(".trades-grid > :nth-child(3)");
		expect(ORDERBOOK_PANEL_SOURCE).toContain("orderbook-tab-label min-w-0 truncate");
		expect(TERMINAL_STYLES).toContain(".orderbook-tab-label");

		expect(TRADE_PANEL_SOURCE).toContain("trade-panel-container");
		expect(TRADE_PANEL_SOURCE).toContain("trade-panel-container flex flex-col bg-surface font-market-close");
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
		expect(ORDERBOOK_PANEL_SOURCE).toContain("<TradesPanel />");
		expect(ORDERBOOK_PANEL_SOURCE).not.toContain("<TradesPanel key=");
		expect(TRADE_ROW_SOURCE).toContain('"grid h-6 items-center tabular-nums');
		expect(TRADES_PANEL_SOURCE).toContain('"trades-grid gap-1 px-2 h-8 text-xs"');
		expect(TRADES_PANEL_SOURCE).not.toContain("Waiting for trades...");
	});

	it("keeps every desktop panel mounted once while responsive grid geometry changes", () => {
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
		expect(MAIN_WORKSPACE_SOURCE).toContain("layouts={layouts}");
		expect(MAIN_WORKSPACE_SOURCE).toContain(
			'useGridContentHeight(mounted, activeBreakpoint, "tradingInterface", setLayouts)',
		);
		expect(MAIN_WORKSPACE_SOURCE).toContain(
			'useGridContentHeight(mounted, activeBreakpoint, "accountInfo", setLayouts)',
		);
		expect(MAIN_WORKSPACE_SOURCE).not.toContain(
			'useGridContentHeight(mounted, activeBreakpoint, "accountTable", setLayouts)',
		);
		expect(MAIN_WORKSPACE_SOURCE).toContain("<PositionsPanel />");
		expect(MAIN_WORKSPACE_SOURCE).toContain("margin={gridSpacing}");
		expect(MAIN_WORKSPACE_SOURCE).toContain("containerPadding={gridSpacing}");
		expect(MAIN_WORKSPACE_SOURCE).toContain('data-panel-id="accountInfo"');
		expect(MAIN_WORKSPACE_SOURCE).not.toContain("useIsMobile");
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

	it("shares the default desktop loading surface with the shell skeleton and never animates it", () => {
		expect(MAIN_WORKSPACE_SOURCE).toContain("<DesktopGridLoadingSurface");
		expect(DESKTOP_GRID_LOADING_SURFACE_SOURCE).not.toContain('from "react-grid-layout"');

		expect(MAIN_WORKSPACE_SOURCE).toContain('panelClassName="desktop-grid-panel bg-surface"');
		expect(MAIN_WORKSPACE_SOURCE).not.toContain("animate-pulse");
		expect(MAIN_WORKSPACE_SOURCE).not.toContain("animate-spin");
	});

	it("observes border-box height with cleanup and persists RGL's compacted layouts", () => {
		expect(GRID_CONTENT_HEIGHT_SOURCE).toContain("entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height");
		expect(GRID_CONTENT_HEIGHT_SOURCE).not.toContain("offsetHeight");
		expect(GRID_CONTENT_HEIGHT_SOURCE).toContain("return () => observer.disconnect()");
		expect(MAIN_WORKSPACE_SOURCE).toContain("onLayoutChange={(_, allLayouts) =>");
		expect(MAIN_WORKSPACE_SOURCE).toContain("setLayouts(allLayouts)");
		expect(MAIN_WORKSPACE_SOURCE).toContain("writeDesktopGridLayouts(allLayouts)");
	});

	it("reveals the dedicated grid container surface through desktop panel gutters", () => {
		expect(readCssVariable(TERMINAL_STYLES, ":root", "--bg-grid-container")).toBe("#f1f3f6");
		expect(readCssVariable(TERMINAL_STYLES, ".dark", "--bg-grid-container")).toBe("#1b2429");
		expect(readCssVariable(TERMINAL_STYLES, "@theme inline", "--color-grid-container")).toBe(
			"var(--bg-grid-container)",
		);
		expect(MAIN_WORKSPACE_SOURCE).toContain('className="min-h-0 flex-1 bg-grid-container"');
		expect(TERMINAL_STYLES).toMatch(
			/\.desktop-terminal-grid\.react-grid-layout\s*{\s*background-color:\s*transparent;/,
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
