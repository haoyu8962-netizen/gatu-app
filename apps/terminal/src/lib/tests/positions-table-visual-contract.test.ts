import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
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

function readPositionSource(file: string): string {
	return readFileSync(resolve(TEST_DIR, "../..", `components/trade/positions/${file}`), "utf8");
}

function readMobilePositionSource(file: string): string {
	return readFileSync(resolve(TEST_DIR, "../..", `components/trade/mobile/${file}`), "utf8");
}

const POSITIONS_PANEL_SOURCE = readPositionSource("positions-panel.tsx");
const POSITIONS_TAB_SOURCE = readPositionSource("positions-tab.tsx");
const POSITION_ROW_SOURCE = readPositionSource("position-row.tsx");
const POSITION_ACTIONS_SOURCE = readPositionSource("position-actions-dropdown.tsx");
const MOBILE_POSITION_CARD_SOURCE = readMobilePositionSource("mobile-position-card.tsx");

describe("positions table visual contract", () => {
	it("uses the compact official-style hierarchy with a sticky table header", () => {
		expect(positionTableHeadClass).toContain("sticky top-0");
		expect(positionTableHeadClass).toContain("h-6");
		expect(positionTableHeadClass).toContain("font-normal");
		expect(positionTableHeadClass).not.toContain("overflow-hidden");
		expect(positionTableCellClass).toContain("h-6");
		expect(positionTableCellClass).toContain("overflow-y-hidden");
		expect(positionTableCellClass).not.toContain("overflow-hidden");
		expect(positionTableCellClass).toContain("whitespace-nowrap");
		expect(positionTableCellClass).toContain("leading-none");
		expect(positionTableBodyClass).toContain("[&_tr]:border-0");
		expect(POSITIONS_TAB_SOURCE).toContain('containerClassName="overflow-visible"');
		expect(POSITIONS_TAB_SOURCE).toContain("table-auto w-full");
		expect(POSITIONS_TAB_SOURCE).not.toContain("table-fixed");
		expect(POSITIONS_TAB_SOURCE).toContain("style={{ minWidth: POSITION_TABLE_MIN_WIDTH }}");
		expect(POSITIONS_TAB_SOURCE).not.toContain("<colgroup>");
		expect(POSITIONS_TAB_SOURCE).not.toContain("positionsPanelTableCaptionRowClass");
	});

	it("keeps minimum column geometry while allowing content to expand the table", () => {
		expect(POSITION_TABLE_MIN_WIDTH).toBe(1096);
		expect(POSITION_ROW_SOURCE).not.toContain("truncate");
		expect(POSITION_ROW_SOURCE).toContain("<AssetBadge");
		expect(POSITION_ROW_SOURCE).toContain('side={isLong ? "buy" : "sell"}');
		expect(POSITION_ROW_SOURCE).toContain("{p.leverage.value}x");
		expect(POSITION_ROW_SOURCE).toContain("{p.dex}");
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
	});

	it("switches striped row backgrounds synchronously with the active theme", () => {
		const rowClassTokens = positionsPanelRowHoverClass.split(/\s+/);

		expect(positionsPanelRowHoverClass).toContain("bg-fill-hover");
		expect(rowClassTokens).not.toContain("transition-colors");
		expect(rowClassTokens).not.toContain("transition-all");
		expect(rowClassTokens.some((token) => token.includes("background-color"))).toBe(false);
		expect(positionsPanelRowStripeClass).toBe("bg-alternate");
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

	it("uses direct close commands on wide desktop and preserves the compact dropdown", () => {
		expect(positionTableInlineActionClass).toContain("h-6");
		expect(POSITION_ACTIONS_SOURCE).toContain("min-[1180px]:flex");
		expect(POSITION_ACTIONS_SOURCE).toContain("min-[1180px]:hidden");
		expect(POSITION_ACTIONS_SOURCE).toContain("onClick={onLimitClose}");
		expect(POSITION_ACTIONS_SOURCE).toContain("onClick={onMarketClose}");
		expect(POSITION_ACTIONS_SOURCE).toContain("onClick={onReverse}");
		expect(POSITION_ACTIONS_SOURCE).toContain("<Dropdown");
	});

	it("uses the handoff mobile disclosure card without internal cell dividers", () => {
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("<MobileDisclosureHeader");
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("grid-cols-3");
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_16px]");
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("rounded-[14px]");
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("border-market-close-stroke-card");
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("bg-modal");
		expect(MOBILE_POSITION_CARD_SOURCE).toContain('context: "Cumulative position funding"');
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("formatQuoteAmount(p.positionValue, quoteSymbol");
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("t`Entry Price`");
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("t`Mark Price`");
		expect(MOBILE_POSITION_CARD_SOURCE).toContain("t`Liquidation Price`");
		expect(MOBILE_POSITION_CARD_SOURCE).not.toContain("divide-x");
		expect(MOBILE_POSITION_CARD_SOURCE).not.toContain("Margin · Iso");
	});
});
