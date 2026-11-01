// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketRow } from "@/components/trade/chart/token-selector-categories";
import { TokenSelectorRow } from "@/components/trade/chart/token-selector-row";

vi.mock("@/components/trade/components/asset-display", () => ({
	AssetDisplay: ({ coin }: { coin: string }) => <span>{coin}</span>,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function livePrice(overrides: Partial<MarketRow> = {}): Partial<MarketRow> {
	return {
		markPriceStatus: "success",
		markPriceReceivedAt: Date.now(),
		assetContextLive: true,
		...overrides,
	} as Partial<MarketRow>;
}

describe("TokenSelectorRow", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderRow(
		market: MarketRow,
		options: {
			mobile?: boolean;
			showSpotMarketCap?: boolean;
			isSelected?: boolean;
			onSelect?: (name: string) => void;
			onToggleFavorite?: (name: string) => void;
		} = {},
	) {
		const {
			mobile = true,
			showSpotMarketCap = false,
			isSelected = false,
			onSelect = vi.fn(),
			onToggleFavorite = vi.fn(),
		} = options;
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<TokenSelectorRow
						market={market}
						mobile={mobile}
						showDerivativesMetrics={!showSpotMarketCap}
						showSpotMarketCap={showSpotMarketCap}
						isSelected={isSelected}
						isHighlighted={false}
						isFavorite={false}
						top={0}
						height={48}
						onSelect={onSelect}
						onToggleFavorite={onToggleFavorite}
					/>
				</I18nProvider>,
			);
		});

		const marketButton = container.querySelector<HTMLButtonElement>(`button[data-index="${market.name}"]`);
		const row = marketButton?.parentElement;
		if (!marketButton || !row) throw new Error("Missing token selector row");
		return { marketButton, row };
	}

	function getSpanByText(row: HTMLElement, text: string): HTMLSpanElement {
		const span = Array.from(row.querySelectorAll<HTMLSpanElement>("span")).find(
			(candidate) => candidate.childElementCount === 0 && candidate.textContent === text,
		);
		if (!span) throw new Error(`Missing span with text: ${text}`);
		return span;
	}

	it.each([
		["mobile", true],
		["desktop", false],
	] as const)("renders the market max leverage in the %s metadata slot", (_surface, mobile) => {
		const { row } = renderRow(
			{
				name: "SOL",
				kind: "perp",
				shortName: "SOL",
				pairName: "SOL-USDC",
				szDecimals: 2,
				maxLeverage: 20,
				markPx: "180",
				prevDayPx: "175",
				dayNtlVlm: "125000000",
				openInterest: "2000000",
				funding: "0.00001",
			} as MarketRow,
			{ mobile },
		);

		const leverage = getSpanByText(row, "20x");
		const metadataRow = leverage.parentElement;
		expect(metadataRow?.previousElementSibling?.textContent).toContain("SOL-USDC");
		expect(leverage.className).toContain("whitespace-nowrap");
		expect(leverage.className).toContain("tabular-nums");

		if (mobile) {
			expect(metadataRow?.className).toContain("text-3xs");
			expect(leverage.className).toContain("rounded-[4px]");
			expect(leverage.className).toContain("bg-trading-panel-stroke-row");
			expect(leverage.className).toContain("px-[5px]");
			expect(leverage.className).toContain("py-px");
			expect(leverage.className).toContain("font-semibold");
			expect(leverage.className).toContain("text-trading-panel-muted");
		} else {
			expect(metadataRow?.className).toContain("text-[11px]");
			expect(metadataRow?.className).toContain("text-trading-panel-subtle");
			expect(leverage.className).not.toContain("rounded-");
			expect(leverage.className).not.toContain("bg-");
			expect(leverage.className).not.toContain("px-");
			expect(leverage.className).not.toContain("py-");
			expect(leverage.className).not.toContain("font-semibold");
		}
	});

	it.each([
		["mobile", true],
		["desktop", false],
	] as const)("replaces leverage with a Spot pill in the %s metadata slot", (_surface, mobile) => {
		const { row } = renderRow(
			{
				name: "@107",
				kind: "spot",
				shortName: "HYPE",
				pairName: "HYPE/USDC",
				maxLeverage: 20,
				markPx: "64.5",
				prevDayPx: "60",
				dayNtlVlm: "125000000",
				circulatingSupply: "100000000",
				tokensInfo: [
					{ name: "HYPE", displayName: "HYPE", szDecimals: 2 },
					{ name: "USDC", displayName: "USDC", szDecimals: 6 },
				],
			} as unknown as MarketRow,
			{ mobile, showSpotMarketCap: true },
		);

		const spot = getSpanByText(row, "Spot");
		const metadataRow = spot.parentElement;
		expect(row.textContent).not.toContain("20x");
		expect(metadataRow?.previousElementSibling?.textContent).toContain("HYPE/USDC");
		expect(spot.className).toContain("whitespace-nowrap");
		expect(spot.className).toContain("rounded-[4px]");
		expect(spot.className).toContain("bg-trading-panel-success-soft");
		expect(spot.className).toContain("px-[5px]");
		expect(spot.className).toContain("py-px");
		expect(spot.className).toContain("font-semibold");
		expect(spot.className).toContain("text-trading-panel-success");
		if (mobile) {
			expect(metadataRow?.className).toContain("text-3xs");
			expect(metadataRow?.className).toContain("leading-none");
		} else {
			expect(metadataRow?.className).toContain("text-[11px]");
			expect(metadataRow?.className).toContain("text-trading-panel-subtle");
			expect(spot.className).toContain("text-3xs");
			expect(spot.className).toContain("leading-none");
		}
	});

	it("stacks volume and open interest beside price and 24h change for perpetuals", () => {
		const { row } = renderRow({
			name: "HYPE",
			kind: "perp",
			shortName: "HYPE",
			pairName: "HYPE-USDC",
			szDecimals: 2,
			maxLeverage: 10,
			markPx: "64.5",
			prevDayPx: "60",
			dayNtlVlm: "125000000",
			openInterest: "2000000",
			funding: "0.00001",
			...livePrice(),
		} as MarketRow);

		expect(row.children).toHaveLength(4);
		expect(row.children[1]?.textContent).toContain("HYPE-USDC");
		expect(row.children[2]?.textContent).toContain("$125M");
		expect(row.children[2]?.textContent).toContain("$129M");
		expect(row.children[3]?.children[0]?.textContent).toBe("64.500");
		expect(row.children[3]?.children[1]?.textContent).toBe("+7.50%");
		const favoriteButton = row.querySelector<HTMLButtonElement>('button[aria-pressed="false"]');
		expect(favoriteButton?.className).toContain("size-11");
		expect(favoriteButton?.className).toContain("absolute");
		expect(favoriteButton?.className).toContain("top-1/2");
		expect(favoriteButton?.className).toContain("right-0");
		expect(favoriteButton?.className).toContain("-translate-y-1/2");
		expect(favoriteButton?.className).not.toContain("after:inset-x-0");
		expect(favoriteButton?.className).not.toContain("right-[-26px]");
		expect(favoriteButton?.parentElement?.parentElement?.className).toContain("pr-11");
		expect(row.className).toContain("grid-cols-[minmax(0,1fr)_74px_72px]");
		expect(row.className).toContain("min-[390px]:grid-cols-[minmax(0,1fr)_102px_84px]");
	});

	it("uses market cap instead of open interest for spot markets", () => {
		const { row } = renderRow(
			{
				name: "@1",
				kind: "spot",
				shortName: "HYPE",
				pairName: "HYPE-USDC",
				markPx: "64.5",
				prevDayPx: "60",
				dayNtlVlm: "125000000",
				circulatingSupply: "100000000",
				tokensInfo: [
					{ name: "HYPE", displayName: "HYPE", szDecimals: 2 },
					{ name: "USDC", displayName: "USDC", szDecimals: 6 },
				],
			} as MarketRow,
			{ showSpotMarketCap: true },
		);

		expect(row.children).toHaveLength(4);
		expect(row.children[2]?.textContent).toContain("$125M");
		expect(row.children[2]?.textContent).toContain("$6.45B");
		expect(row.children[2]?.textContent).not.toContain("--");
	});

	it("shows the raw API token for colliding desktop spot names", () => {
		const { row } = renderRow(
			{
				name: "@188",
				kind: "spot",
				shortName: "PUMP",
				pairName: "PUMP/USDC",
				markPx: "0.0000042",
				prevDayPx: "0.000004",
				dayNtlVlm: "1000",
				tokensInfo: [
					{ name: "UPUMP", displayName: "PUMP", szDecimals: 0 },
					{ name: "USDC", displayName: "USDC", szDecimals: 6 },
				],
			} as MarketRow,
			{ mobile: false, showSpotMarketCap: true },
		);

		expect(row.textContent).toContain("PUMP/USDC");
		expect(row.textContent).toContain("UPUMP");
		expect(row.querySelector('button[aria-pressed="false"]')).not.toBeNull();
	});

	it("preserves the protocol spot price precision", () => {
		const { row } = renderRow(
			{
				name: "@300",
				kind: "spot",
				shortName: "HREKT",
				pairName: "HREKT/USDC",
				markPx: "0.00000011",
				prevDayPx: "0.00000010",
				dayNtlVlm: "1000",
				tokensInfo: [
					{ name: "HREKT", displayName: "HREKT", szDecimals: 0 },
					{ name: "USDC", displayName: "USDC", szDecimals: 6 },
				],
				...livePrice(),
			} as MarketRow,
			{ mobile: false, showSpotMarketCap: true },
		);

		expect(row.textContent).toContain("0.00000011");
	});

	function getQuoteCells(row: HTMLElement, mobile: boolean) {
		if (mobile) {
			const column = row.children[3];
			return { price: column?.children[0], change: column?.children[1] };
		}
		return { price: row.children[2]?.firstElementChild, change: row.children[3]?.firstElementChild };
	}

	const HYPE_PERP = {
		name: "HYPE",
		kind: "perp",
		shortName: "HYPE",
		pairName: "HYPE-USDC",
		szDecimals: 2,
		maxLeverage: 10,
		markPx: "64.5",
		midPx: "64.45",
		prevDayPx: "60",
		dayNtlVlm: "125000000",
		openInterest: "2000000",
		funding: "0.00001",
	} as MarketRow;

	it.each([
		["mobile", true, "+7.42%", "$129M"],
		["desktop", false, "+4.450 / +7.42%", "$129,000,000"],
	] as const)(
		"prices a %s row from the live mid and keeps open interest on the mark",
		(_surface, mobile, change, oi) => {
			const { row } = renderRow({ ...HYPE_PERP, ...livePrice() } as MarketRow, { mobile });

			const cells = getQuoteCells(row, mobile);
			expect(cells.price?.textContent).toBe("64.450");
			expect(cells.change?.textContent).toBe(change);
			expect(cells.change?.className).toContain("text-trading-panel-success");
			expect(row.textContent).toContain(oi);
		},
	);

	it("falls back to the same context's mark only when the mid is null", () => {
		const { row } = renderRow({ ...HYPE_PERP, ...livePrice({ midPx: null }) } as MarketRow, { mobile: false });

		const cells = getQuoteCells(row, false);
		expect(cells.price?.textContent).toBe("64.500");
		expect(cells.change?.textContent).toBe("+4.500 / +7.50%");
	});

	it.each([
		["stale", livePrice({ markPriceStatus: "stale" })],
		["failed", livePrice({ markPriceStatus: "error" })],
		["still loading", livePrice({ markPriceStatus: "loading" })],
		["received too long ago", livePrice({ markPriceReceivedAt: Date.now() - 10_001 })],
		["missing its receipt", livePrice({ markPriceReceivedAt: undefined })],
	])("keeps the quiet placeholder when the price context is %s", (_state, fields) => {
		const { row } = renderRow({ ...HYPE_PERP, ...fields } as MarketRow, { mobile: false });

		const cells = getQuoteCells(row, false);
		expect(cells.price?.textContent).toBe("-");
		expect(cells.change?.textContent).toBe("-");
		expect(cells.change?.className).toContain("text-trading-panel-subtle");
		expect(row.textContent).not.toContain("64.4");
	});

	it("shows the live price without a 24h change while the asset context is not live", () => {
		const { row } = renderRow({ ...HYPE_PERP, ...livePrice({ assetContextLive: false }) } as MarketRow, {
			mobile: false,
		});

		const cells = getQuoteCells(row, false);
		expect(cells.price?.textContent).toBe("64.450");
		expect(cells.change?.textContent).toBe("-");
		expect(cells.change?.className).toContain("text-trading-panel-subtle");
	});

	it.each([
		["mobile", true, "+0.00%"],
		["desktop", false, "+0.000 / +0.00%"],
	] as const)("signs an unchanged %s price with a plus like the official selector", (_surface, mobile, change) => {
		const { row } = renderRow({ ...HYPE_PERP, ...livePrice({ midPx: "60" }) } as MarketRow, { mobile });

		const cells = getQuoteCells(row, mobile);
		expect(cells.change?.textContent).toBe(change);
		expect(cells.change?.className).toContain("text-trading-panel-fg");
	});

	it.each([
		["a large perp price", { szDecimals: 5, midPx: "77677.5", prevDayPx: "77000" }, "77,678"],
		["trailing zeros", { szDecimals: 2, midPx: "180.1", prevDayPx: "170" }, "180.10"],
		["the perp decimal cap", { szDecimals: 0, midPx: "0.00001234", prevDayPx: "0.00001" }, "0.000012"],
	])("formats %s with five significant figures and the market's decimal cap", (_case, fields, price) => {
		const { row } = renderRow({ ...HYPE_PERP, ...fields, ...livePrice() } as MarketRow, { mobile: false });

		expect(getQuoteCells(row, false).price?.textContent).toBe(price);
	});

	it("caps a spot price at eight decimals minus the base token's size decimals", () => {
		const { row } = renderRow(
			{
				name: "@300",
				kind: "spot",
				shortName: "TINY",
				pairName: "TINY/USDC",
				markPx: "0.0011",
				midPx: "0.0012345678",
				prevDayPx: "0.0012",
				dayNtlVlm: "1000",
				tokensInfo: [
					{ name: "TINY", displayName: "TINY", szDecimals: 2 },
					{ name: "USDC", displayName: "USDC", szDecimals: 6 },
				],
				...livePrice(),
			} as MarketRow,
			{ mobile: false, showSpotMarketCap: true },
		);

		expect(getQuoteCells(row, false).price?.textContent).toBe("0.001235");
	});

	it("gives the desktop price change the finer precision of the two prices", () => {
		const { row } = renderRow(
			{ ...HYPE_PERP, szDecimals: 1, ...livePrice({ midPx: "10.5", prevDayPx: "9.8" }) } as MarketRow,
			{ mobile: false },
		);

		const cells = getQuoteCells(row, false);
		expect(cells.price?.textContent).toBe("10.500");
		expect(cells.change?.textContent).toBe("+0.7000 / +7.14%");
	});

	it("keeps the spot market cap on the mark while the price follows the mid", () => {
		const { row } = renderRow(
			{
				name: "@1",
				kind: "spot",
				shortName: "HYPE",
				pairName: "HYPE-USDC",
				markPx: "64.5",
				midPx: "60",
				prevDayPx: "60",
				dayNtlVlm: "125000000",
				circulatingSupply: "100000000",
				tokensInfo: [
					{ name: "HYPE", displayName: "HYPE", szDecimals: 2 },
					{ name: "USDC", displayName: "USDC", szDecimals: 6 },
				],
				...livePrice(),
			} as MarketRow,
			{ showSpotMarketCap: true },
		);

		expect(row.children[2]?.textContent).toContain("$6.45B");
		expect(row.children[3]?.children[0]?.textContent).toBe("60.000");
	});

	it("uses a visible background for the selected row", () => {
		const { row } = renderRow(
			{
				name: "HYPE",
				kind: "perp",
				shortName: "HYPE",
				pairName: "HYPE-USDC",
				szDecimals: 2,
				markPx: "64.5",
			} as MarketRow,
			{ isSelected: true },
		);

		expect(row.classList.contains("bg-trading-panel-hover")).toBe(true);
	});

	it("does not infer a New listing badge from the local product catalog", () => {
		const { row } = renderRow({
			name: "APT",
			kind: "perp",
			shortName: "APT",
			pairName: "APT-USDC",
			szDecimals: 1,
			markPx: "4.2",
		} as MarketRow);

		expect(row.textContent).not.toContain("NEW");
	});

	it.each([false, true])("keeps the market and favorite actions as sibling controls when mobile is %s", (mobile) => {
		const onSelect = vi.fn();
		const onToggleFavorite = vi.fn();
		const { marketButton, row } = renderRow(
			{
				name: "HYPE",
				kind: "perp",
				shortName: "HYPE",
				pairName: "HYPE-USDC",
				szDecimals: 2,
				markPx: "64.5",
			} as MarketRow,
			{ mobile, onSelect, onToggleFavorite },
		);

		const favoriteButton = row.querySelector<HTMLButtonElement>('button[aria-pressed="false"]');
		expect(favoriteButton).not.toBeNull();
		expect(row.tagName).toBe("LI");
		expect(marketButton.getAttribute("tabindex")).toBeNull();
		expect(favoriteButton?.className).toContain(mobile ? "size-11" : "size-6");
		expect(marketButton.contains(favoriteButton)).toBe(false);
		act(() => favoriteButton?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
		expect(onSelect).not.toHaveBeenCalled();

		act(() => marketButton.click());
		expect(onSelect).toHaveBeenCalledWith("HYPE");
		expect(onToggleFavorite).not.toHaveBeenCalled();

		act(() => favoriteButton?.click());
		expect(onToggleFavorite).toHaveBeenCalledWith("HYPE");
		expect(onSelect).toHaveBeenCalledTimes(1);
	});
});
