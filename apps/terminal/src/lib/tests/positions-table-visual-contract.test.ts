import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	POSITION_TABLE_COLUMNS,
	POSITION_TABLE_MIN_WIDTH,
	positionTableBodyClass,
	positionTableCellClass,
	positionTableHeadClass,
	positionTableInlineActionClass,
} from "@/components/trade/positions/position-table-styles";
import {
	positionsPanelRowHoverClass,
	positionsPanelRowStripeClass,
} from "@/components/trade/positions/positions-panel-table-styles";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const UI_GLOBALS_SOURCE = readFileSync(resolve(TEST_DIR, "../../../../..", "packages/ui/src/globals.css"), "utf8");

function readPositionSource(file: string): string {
	return readFileSync(resolve(TEST_DIR, "../..", `components/trade/positions/${file}`), "utf8");
}

function readMobilePositionSource(file: string): string {
	return readFileSync(resolve(TEST_DIR, "../..", `components/trade/mobile/${file}`), "utf8");
}

const POSITIONS_PANEL_SOURCE = readPositionSource("positions-panel.tsx");
const POSITIONS_TAB_SOURCE = readPositionSource("positions-tab.tsx");
const POSITION_ROW_SOURCE = readPositionSource("position-row.tsx");
const POSITION_ACTIONS_SOURCE = readPositionSource("position-inline-actions.tsx");
const POSITION_MARKET_CLOSE_MODAL_SOURCE = readPositionSource("position-market-close-modal.tsx");
const POSITION_LIMIT_CLOSE_MODAL_SOURCE = readPositionSource("position-limit-close-modal.tsx");
const POSITION_CLOSE_ALL_MODAL_SOURCE = readPositionSource("position-close-all-modal.tsx");
const MOBILE_POSITION_CARD_SOURCE = readMobilePositionSource("mobile-position-card.tsx");

describe("positions table visual contract", () => {
	it("uses the compact official-style hierarchy with a sticky table header", () => {
		expect(positionTableHeadClass).toContain("sticky top-0");
		expect(positionTableHeadClass).toContain("h-[33px]");
		expect(positionTableHeadClass).toContain("text-2xs");
		expect(positionTableHeadClass).toContain("font-semibold");
		expect(positionTableHeadClass).not.toContain("overflow-hidden");
		expect(positionTableCellClass).toContain("h-14");
		expect(positionTableCellClass).not.toContain("overflow-hidden");
		expect(positionTableCellClass).toContain("whitespace-nowrap");
		expect(positionTableCellClass).toContain("leading-4");
		expect(positionTableBodyClass).toContain("[&_tr]:border-0");
		expect(POSITIONS_TAB_SOURCE).toContain('containerClassName="overflow-visible"');
		expect(POSITIONS_TAB_SOURCE).toContain("table-fixed w-full");
		expect(POSITIONS_TAB_SOURCE).toContain("style={{ minWidth: POSITION_TABLE_MIN_WIDTH }}");
		expect(POSITIONS_TAB_SOURCE).toContain("<colgroup>");
		expect(POSITIONS_TAB_SOURCE).not.toContain("positionsPanelTableCaptionRowClass");
	});

	it("uses the official-density fixed eleven-column geometry", () => {
		expect(POSITION_TABLE_MIN_WIDTH).toBe(1332);
		expect(POSITION_TABLE_COLUMNS.map(({ id, width }) => [id, width])).toEqual([
			["market", 150],
			["size", 112],
			["positionValue", 132],
			["entryPrice", 106],
			["markPrice", 106],
			["pnl", 144],
			["liquidation", 104],
			["tpsl", 100],
			["margin", 116],
			["funding", 78],
			["actions", 184],
		]);
		expect(POSITION_TABLE_COLUMNS.reduce((total, column) => total + column.width, 0)).toBe(POSITION_TABLE_MIN_WIDTH);
		expect(POSITION_ROW_SOURCE).not.toContain("truncate");
		expect(POSITION_ROW_SOURCE).toContain("<AssetBadge");
		expect(POSITION_ROW_SOURCE).toContain("{directionLabel} · {p.leverage.value}x");
		expect(POSITION_ROW_SOURCE).toContain("{p.dex}");
	});

	it("uses eleven independent semantic position columns", () => {
		expect(POSITIONS_TAB_SOURCE.match(/<TableHead\b/g)).toHaveLength(11);
		expect(POSITION_ROW_SOURCE.match(/<TableCell\b/g)).toHaveLength(11);
		expect(POSITIONS_TAB_SOURCE).toContain("{t`Size`}");
		expect(POSITIONS_TAB_SOURCE).toContain("{t`Position Value`}");
		expect(POSITIONS_TAB_SOURCE).toContain("{t`Entry Price`}");
		expect(POSITIONS_TAB_SOURCE).toContain("{t`Mark Price`}");
		expect(POSITIONS_TAB_SOURCE).not.toContain("{t`Size`} / {t`Position Value`}");
		expect(POSITIONS_TAB_SOURCE).not.toContain("{t`Entry Price`} / {t`Mark Price`}");
		expect(POSITION_ROW_SOURCE).toContain("title={sizeDisplay}");
		expect(POSITION_ROW_SOURCE).toContain("title={positionValueDisplay}");
		expect(POSITION_ROW_SOURCE).toContain("title={entryPriceDisplay}");
		expect(POSITION_ROW_SOURCE).toContain("title={markPriceDisplay}");
		expect(POSITION_ROW_SOURCE).toContain('cn("block text-[13px] font-semibold", sideClass)');
		expect(POSITIONS_TAB_SOURCE).toContain("{t`Liquidation Price`}");
		expect(POSITIONS_TAB_SOURCE).not.toContain("{t`Margin Ratio`}");
		expect(POSITION_ROW_SOURCE).toContain("liqIsNear");
		expect(POSITION_ROW_SOURCE).not.toContain("riskFill");
	});

	it("keeps the positions workspace focused on position rows without a duplicate account summary", () => {
		expect(POSITIONS_TAB_SOURCE).not.toContain('data-testid="positions-summary-bar"');
		expect(POSITIONS_TAB_SOURCE).not.toContain("getTotalPositionUnrealizedPnl");
		expect(POSITIONS_TAB_SOURCE).not.toContain("accountSummary");
		expect(POSITIONS_PANEL_SOURCE).not.toContain("positionsAccountSummary");
		expect(POSITIONS_TAB_SOURCE).not.toContain("Account Equity");
		expect(POSITIONS_TAB_SOURCE).not.toContain("Maintenance Margin Ratio");
		expect(POSITIONS_TAB_SOURCE).toContain("openCloseAll(resolution.snapshot)");
		expect(POSITIONS_TAB_SOURCE).not.toContain("PositionCloseAllController");
		expect(POSITIONS_TAB_SOURCE).toContain("Close All Positions");
		expect(POSITIONS_TAB_SOURCE).toContain("candidates: positions.map");
		expect(POSITIONS_TAB_SOURCE).toContain("focusableWhenDisabled");
		expect(POSITIONS_TAB_SOURCE).not.toContain("getToolbarAccountMarginRatio");
	});

	it("keeps Close All readiness independent from the incremental fast mark stream", () => {
		expect(POSITIONS_TAB_SOURCE).not.toContain("allPositionMarksFresh");
		expect(POSITIONS_TAB_SOURCE).not.toContain("markPx: marketInfo?.markPx");
		expect(POSITIONS_TAB_SOURCE).toContain("Close all is unavailable until every position market has loaded.");
	});

	it("uses native horizontal overflow without hiding the vertical scroll affordance", () => {
		expect(POSITIONS_TAB_SOURCE).not.toContain("[&_[data-slot=scroll-area-scrollbar]]:hidden");
		expect(POSITIONS_TAB_SOURCE).toContain("[&_[data-slot=scroll-area-viewport]]:overscroll-x-none");
		expect(POSITIONS_TAB_SOURCE).not.toContain('<ScrollBar orientation="horizontal"');
	});

	it("keeps position identity and financial values visible without compact-number loss", () => {
		expect(POSITIONS_TAB_SOURCE).toContain("Position Value");
		expect(POSITIONS_TAB_SOURCE).toContain('context: "Cumulative position funding"');
		expect(POSITION_ROW_SOURCE).toContain("formatQuoteAmount(p.positionValue, quoteSymbol");
		expect(POSITION_ROW_SOURCE).toContain('style: "decimal"');
		expect(POSITION_ROW_SOURCE).toContain('currencyDisplay: "narrowSymbol"');
		expect(POSITION_ROW_SOURCE).not.toContain(".toNumber()");
		expect(POSITION_ROW_SOURCE).not.toContain("Math.abs(");
		expect(MOBILE_POSITION_CARD_SOURCE).not.toContain(".toNumber()");
		expect(MOBILE_POSITION_CARD_SOURCE).not.toContain("Math.abs(");
	});

	it("provides header help and switches PNL percentage modes through the Big.js domain metric", () => {
		expect(POSITIONS_TAB_SOURCE.match(/<Tooltip\b/g)).toHaveLength(5);
		expect(POSITIONS_TAB_SOURCE).toContain("border-dotted");
		expect(POSITIONS_TAB_SOURCE).toContain('useState<PositionPnlMode>("roe")');
		expect(POSITIONS_TAB_SOURCE).toContain('current === "roe" ? "priceChange" : "roe"');
		expect(POSITIONS_TAB_SOURCE).toContain("pnlMode={pnlMode}");
		expect(POSITION_ROW_SOURCE).toContain("getToolbarPositionChangeRatio");
		expect(POSITION_ROW_SOURCE).toContain('pnlMode === "roe" ? roeDisplay : formatPercent(priceChangeRatio, 1)');
	});

	it("uses non-striped rows and synchronous hover backgrounds", () => {
		const rowClassTokens = positionsPanelRowHoverClass.split(/\s+/);

		expect(positionsPanelRowHoverClass).toContain("bg-fill-hover");
		expect(positionsPanelRowHoverClass).not.toContain(":has(");
		expect(UI_GLOBALS_SOURCE).toContain("@custom-variant hover");
		expect(UI_GLOBALS_SOURCE).toContain("@media (hover: hover)");
		expect(rowClassTokens).not.toContain("transition-colors");
		expect(rowClassTokens).not.toContain("transition-all");
		expect(rowClassTokens.some((token) => token.includes("background-color"))).toBe(false);
		expect(positionsPanelRowStripeClass).toBe("");
	});

	it("keys desktop positions by their dex and coin identity", () => {
		expect(POSITIONS_TAB_SOURCE).toMatch(/key=\{`\$\{p\.dex\}:\$\{p\.coin\}`\}/);
		expect(POSITIONS_TAB_SOURCE).not.toContain("key={p.coin}");
	});

	it("places direction and market filters beside the active positions tab", () => {
		expect(POSITIONS_PANEL_SOURCE).toContain("<PositionFilterToolbar");
		expect(POSITIONS_PANEL_SOURCE).toContain("direction={positionDirectionFilter}");
		expect(POSITIONS_PANEL_SOURCE).toContain("market={positionMarketFilter}");
		expect(POSITIONS_PANEL_SOURCE).toContain("positionsCount !== null");
		expect(POSITIONS_PANEL_SOURCE).toContain("hasAllDexsSnapshot && !positionsLoading");
		expect(POSITIONS_PANEL_SOURCE).toContain("ordersEvent !== undefined");
		expect(POSITIONS_PANEL_SOURCE).toContain("twapStatesEvent !== undefined");
	});

	it("shows limit, market, and reverse as direct row actions without a duplicate overflow menu", () => {
		expect(positionTableInlineActionClass).toContain("h-[26px]");
		expect(positionTableInlineActionClass).toContain("text-market-close-success");
		expect(POSITION_ACTIONS_SOURCE).toContain("onClick={onMarketClose}");
		expect(POSITION_ACTIONS_SOURCE).toContain("onClick={onLimitClose}");
		expect(POSITION_ACTIONS_SOURCE).toContain("onClick={onReverse}");
		expect(POSITION_ACTIONS_SOURCE).not.toContain("<Dropdown");
		expect(POSITION_ACTIONS_SOURCE).toContain("t`Limit Close`");
		expect(POSITION_ACTIONS_SOURCE).toContain("t`Reverse Position`");
		expect(POSITION_ACTIONS_SOURCE).toContain('context: "Order type"');
		expect(POSITION_ACTIONS_SOURCE).toContain('context: "Position action"');
		expect(POSITION_ROW_SOURCE).toContain("onClick={handleAdjustMargin}");
		expect(POSITION_ROW_SOURCE).toContain("onClick={handleOpenTpSl}");
		expect(POSITION_ROW_SOURCE).toContain("<PositionInlineActions");
		expect(POSITION_ROW_SOURCE).not.toContain("title={marginDisplay}");
		expect(POSITIONS_TAB_SOURCE).not.toContain("title={closeAllUnavailableReason");
	});

	it("does not animate destructive action colors while live safety gates change", () => {
		for (const source of [
			POSITION_MARKET_CLOSE_MODAL_SOURCE,
			POSITION_LIMIT_CLOSE_MODAL_SOURCE,
			POSITION_CLOSE_ALL_MODAL_SOURCE,
		]) {
			expect(source).toMatch(/className="[^"]*!transition-none[^"]*data-disabled:!bg-market-close-danger-disabled/);
			expect(source).not.toContain("!transition-[background-color]");
		}
	});

	it("uses the official mobile disclosure card structure without internal cell dividers", () => {
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("<MobileDisclosureHeader");
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("grid-cols-3");
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_16px]");
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("rounded-[14px]");
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("border-market-close-stroke-card");
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("bg-surface");
		expect(MOBILE_POSITION_CARD_SOURCE).not.toContain("bg-modal");
		expect(MOBILE_POSITION_CARD_SOURCE).toContain('context: "Cumulative position funding"');
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("formatQuoteAmount(p.positionValue, quoteSymbol");
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("t`Entry Price`");
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("t`Mark Price`");
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("t`Liquidation Price`");
		expect(MOBILE_POSITION_CARD_SOURCE).not.toContain('d="M3.5 10 8 5.5l4.5 4.5"');
		expect(MOBILE_POSITION_CARD_SOURCE).not.toContain("aria-controls={detailsId}");
		expect(MOBILE_POSITION_CARD_SOURCE).not.toContain("divide-x");
		expect(MOBILE_POSITION_CARD_SOURCE).not.toContain("Margin · Iso");
	});
});
