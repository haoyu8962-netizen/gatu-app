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
		} as MarketRow);

		expect(row.children).toHaveLength(4);
		expect(row.children[1]?.textContent).toContain("HYPE-USDC");
		expect(row.children[2]?.textContent).toContain("$125M");
		expect(row.children[2]?.textContent).toContain("$129M");
		expect(row.children[3]?.textContent).toContain("64.5");
		expect(row.children[3]?.textContent).toContain("+7.50%");
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
			} as MarketRow,
			{ mobile: false, showSpotMarketCap: true },
		);

		expect(row.textContent).toContain("0.00000011");
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
