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
		options: { mobile?: boolean; showSpotMarketCap?: boolean; isSelected?: boolean } = {},
	) {
		const { mobile = true, showSpotMarketCap = false, isSelected = false } = options;
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
						onSelect={vi.fn()}
						onToggleFavorite={vi.fn()}
					/>
				</I18nProvider>,
			);
		});

		const row = container.querySelector<HTMLElement>('[role="option"]');
		if (!row) throw new Error("Missing token selector row");
		return row;
	}

	it("stacks volume and open interest beside price and 24h change for perpetuals", () => {
		const row = renderRow({
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

		expect(row.children).toHaveLength(3);
		expect(row.children[0]?.textContent).toContain("HYPE-USDC");
		expect(row.children[1]?.textContent).toContain("$125M");
		expect(row.children[1]?.textContent).toContain("$129M");
		expect(row.children[2]?.textContent).toContain("64.5");
		expect(row.children[2]?.textContent).toContain("+7.50%");
	});

	it("uses market cap instead of open interest for spot markets", () => {
		const row = renderRow(
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

		expect(row.children).toHaveLength(3);
		expect(row.children[1]?.textContent).toContain("$125M");
		expect(row.children[1]?.textContent).toContain("$6.45B");
		expect(row.children[1]?.textContent).not.toContain("--");
	});

	it("shows the raw API token for colliding desktop spot names", () => {
		const row = renderRow(
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
		const row = renderRow(
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
		const row = renderRow(
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

		expect(row.classList.contains("bg-fill-weak")).toBe(true);
	});
});
