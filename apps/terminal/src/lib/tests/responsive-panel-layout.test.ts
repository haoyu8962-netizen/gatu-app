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

describe("responsive panel layout contract", () => {
	it("adapts order book columns and trade controls to their own container width", () => {
		expect(ORDERBOOK_PANEL_SOURCE).toContain("orderbook-panel-container");
		expect(ORDERBOOK_PANEL_SOURCE).toContain("orderbook-grid");
		expect(TERMINAL_STYLES).toContain("container-name: orderbook-panel");
		expect(TERMINAL_STYLES).toContain("@container orderbook-panel (max-width: 11.1875rem)");
		expect(TERMINAL_STYLES).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");

		expect(TRADE_PANEL_SOURCE).toContain("trade-panel-container");
		expect(TERMINAL_STYLES).toContain("container-name: trade-panel");
		expect(TERMINAL_STYLES).toContain("@container trade-panel (max-width: 12.4375rem)");
		expect(TERMINAL_STYLES).toContain(".trade-compact-label");
	});
});
