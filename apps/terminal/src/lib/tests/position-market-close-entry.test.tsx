// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PositionRow } from "@/components/trade/positions/position-row";
import type { Position } from "@/lib/hyperliquid";
import type { Markets } from "@/lib/hyperliquid/markets";
import { createI18nRoot } from "./harness/react";

vi.mock("@/components/trade/components/asset-badge", () => ({
	AssetBadge: ({ coin }: { coin: string }) => <span data-testid="position-asset" data-coin={coin} />,
}));

const position: Position = {
	dex: "xyz",
	coin: "xyz:CXMT",
	szi: "-205.9000",
	entryPx: "7.79995",
	positionValue: "1559.84",
	unrealizedPnl: "-46.18",
	returnOnEquity: "-0.3366",
	liquidationPx: "8.27304",
	marginUsed: "137.19",
	maxLeverage: 10,
	leverage: { type: "isolated", value: 10, rawUsd: "-18.794" },
	cumFunding: { allTime: "-22.59", sinceChange: "0", sinceOpen: "-22.59" },
};

const markets = {
	getMarket: () => ({
		kind: "builderPerp",
		name: "xyz:CXMT",
		shortName: "CXMT",
		pairName: "CXMT-USDC",
		assetId: 120_031,
		szDecimals: 1,
		marginMode: "noCross",
	}),
} as unknown as Markets;

describe("PositionRow market close entry", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("opens the shared market-close flow with exact exchange strings", () => {
		const onMarketClose = vi.fn();
		const onShare = vi.fn();
		const onLimitClose = vi.fn();
		const onReverse = vi.fn();
		const onOpenTpSl = vi.fn();
		const onAdjustMargin = vi.fn();

		act(() => {
			root.render(
				createElement(
					"table",
					null,
					createElement(
						"tbody",
						null,
						createElement(PositionRow, {
							position,
							env: "Mainnet",
							isDataStale: false,
							markets,
							markPx: "7.575900",
							markPriceStatus: "success",
							tpSlInfo: undefined,
							isRowClosing: false,
							isEven: false,
							pnlMode: "roe",
							onMarketClose,
							onShare,
							onLimitClose,
							onReverse,
							onOpenTpSl,
							onAdjustMargin,
							onSelectMarket: vi.fn(),
						}),
					),
				),
			);
		});

		const cells = [...container.querySelectorAll<HTMLTableCellElement>("tbody tr > td")];
		const metricTitles = cells.slice(1, 5).map((cell) => cell.querySelector<HTMLElement>("[title]")?.title);
		expect(cells).toHaveLength(11);
		expect(metricTitles[0]).toContain("CXMT");
		expect(metricTitles[1]).toContain("USDC");
		expect(metricTitles[2]).not.toBe(metricTitles[3]);
		expect(metricTitles.every((title) => title !== undefined && !title.includes(" / "))).toBe(true);
		expect(cells[1]?.querySelector("span")?.classList).toContain("text-market-close-danger");

		const marketButton = container.querySelector<HTMLButtonElement>('button[aria-label="Market Close"]');
		if (!(marketButton instanceof HTMLButtonElement)) throw new Error("Desktop market close entry was not rendered");

		act(() => marketButton.click());

		expect(onMarketClose).toHaveBeenCalledWith({
			coin: "xyz:CXMT",
			dex: "xyz",
			assetId: 120_031,
			szDecimals: 1,
			signedPositionSize: "-205.9000",
			markPx: "7.575900",
			marginMode: "isolated",
		});

		const shareButton = container.querySelector<HTMLButtonElement>('button[aria-label="Share PNL for CXMT-USDC"]');
		if (!shareButton) throw new Error("Desktop PNL share entry was not rendered");
		act(() => shareButton.click());
		expect(onShare).toHaveBeenCalledWith(
			expect.objectContaining({
				coin: "xyz:CXMT",
				dex: "xyz",
				env: "Mainnet",
				symbol: "CXMT-USDC",
				quoteSymbol: "USDC",
				entryPx: "7.79995",
				markPx: "7.575900",
			}),
		);

		expect(container.querySelector('button[aria-label="More position actions"]')).toBeNull();
		expect(document.body.querySelector('[role="menuitem"]')).toBeNull();

		const adjustMarginButton = container.querySelector<HTMLButtonElement>('button[aria-label="Adjust Margin"]');
		if (!adjustMarginButton) throw new Error("Desktop isolated margin entry was not rendered");
		act(() => adjustMarginButton.click());
		expect(onAdjustMargin).toHaveBeenCalledOnce();

		const tpSlButton = container.querySelector<HTMLButtonElement>('button[aria-label="Add TP/SL"]');
		if (!tpSlButton) throw new Error("Desktop TP/SL entry was not rendered");
		act(() => tpSlButton.click());
		expect(onOpenTpSl).toHaveBeenCalledWith({
			coin: "xyz:CXMT",
			dex: "xyz",
			assetId: 120_031,
			isLong: false,
			szDecimals: 1,
			marginMode: "isolated",
		});

		const reverseButton = container.querySelector<HTMLButtonElement>('button[aria-label="Reverse Position"]');
		if (!reverseButton) throw new Error("Desktop reverse entry was not rendered");
		act(() => reverseButton.click());
		expect(onReverse).toHaveBeenCalledOnce();

		const limitButton = container.querySelector<HTMLButtonElement>('button[aria-label="Limit Close"]');
		if (!limitButton) throw new Error("Desktop limit close entry was not rendered");
		act(() => limitButton.click());

		expect(onLimitClose).toHaveBeenCalledWith({
			coin: "xyz:CXMT",
			dex: "xyz",
			assetId: 120_031,
			signedPositionSize: "-205.9000",
			entryPx: "7.79995",
			markPx: "7.575900",
			szDecimals: 1,
			marginMode: "isolated",
		});
	});

	it("keeps risk-reducing close entries available without a toolbar mark", () => {
		const onMarketClose = vi.fn();
		const onLimitClose = vi.fn();

		act(() => {
			root.render(
				createElement(
					"table",
					null,
					createElement(
						"tbody",
						null,
						createElement(PositionRow, {
							position,
							env: "Mainnet",
							isDataStale: false,
							markets,
							markPx: undefined,
							markPriceStatus: "loading",
							tpSlInfo: undefined,
							isRowClosing: false,
							isEven: false,
							pnlMode: "roe",
							onMarketClose,
							onShare: vi.fn(),
							onLimitClose,
							onReverse: vi.fn(),
							onOpenTpSl: vi.fn(),
							onAdjustMargin: vi.fn(),
							onSelectMarket: vi.fn(),
						}),
					),
				),
			);
		});

		const marketButton = container.querySelector<HTMLButtonElement>('button[aria-label="Market Close"]');
		const limitButton = container.querySelector<HTMLButtonElement>('button[aria-label="Limit Close"]');
		expect(marketButton?.disabled).toBe(false);
		expect(limitButton?.disabled).toBe(false);
		expect(container.querySelector('[aria-label="Loading..."]')).not.toBeNull();
		expect(container.querySelector('[aria-label^="Mark price is unavailable"]')).toBeNull();

		act(() => {
			marketButton?.click();
			limitButton?.click();
		});
		expect(onMarketClose).toHaveBeenCalledWith({
			coin: "xyz:CXMT",
			dex: "xyz",
			assetId: 120_031,
			szDecimals: 1,
			signedPositionSize: "-205.9000",
			marginMode: "isolated",
		});
		expect(onLimitClose).toHaveBeenCalledWith({
			coin: "xyz:CXMT",
			dex: "xyz",
			assetId: 120_031,
			signedPositionSize: "-205.9000",
			entryPx: "7.79995",
			szDecimals: 1,
			marginMode: "isolated",
		});
	});

	it("labels a cached stale mark without disabling risk-reducing actions", () => {
		act(() => {
			root.render(
				createElement(
					"table",
					null,
					createElement(
						"tbody",
						null,
						createElement(PositionRow, {
							position,
							env: "Mainnet",
							isDataStale: false,
							markets,
							markPx: "7.575900",
							markPriceStatus: "stale",
							tpSlInfo: undefined,
							isRowClosing: false,
							isEven: false,
							pnlMode: "roe",
							onMarketClose: vi.fn(),
							onShare: vi.fn(),
							onLimitClose: vi.fn(),
							onReverse: vi.fn(),
							onOpenTpSl: vi.fn(),
							onAdjustMargin: vi.fn(),
							onSelectMarket: vi.fn(),
						}),
					),
				),
			);
		});

		expect(container.querySelector('[aria-label^="Mark price is unavailable"]')).not.toBeNull();
		expect(container.querySelector<HTMLButtonElement>('button[aria-label="Market Close"]')?.disabled).toBe(false);
		expect(container.querySelector<HTMLButtonElement>('button[aria-label="Limit Close"]')?.disabled).toBe(false);
	});

	it("renders ROE or entry-notional price change from the selected PNL mode", () => {
		function render(pnlMode: "roe" | "priceChange") {
			root.render(
				createElement(
					"table",
					null,
					createElement(
						"tbody",
						null,
						createElement(PositionRow, {
							position,
							env: "Mainnet",
							isDataStale: false,
							markets,
							markPx: "7.575900",
							markPriceStatus: "success",
							tpSlInfo: undefined,
							isRowClosing: false,
							isEven: false,
							pnlMode,
							onMarketClose: vi.fn(),
							onShare: vi.fn(),
							onLimitClose: vi.fn(),
							onReverse: vi.fn(),
							onOpenTpSl: vi.fn(),
							onAdjustMargin: vi.fn(),
							onSelectMarket: vi.fn(),
						}),
					),
				),
			);
		}

		act(() => render("roe"));
		expect(container.textContent).toMatch(/33\.7%/);

		act(() => render("priceChange"));
		expect(container.textContent).toMatch(/2\.9%/);
		expect(container.textContent).not.toMatch(/33\.7%/);
	});

	it("disables PNL sharing while the position stream is stale", () => {
		act(() => {
			root.render(
				createElement(
					"table",
					null,
					createElement(
						"tbody",
						null,
						createElement(PositionRow, {
							position,
							env: "Mainnet",
							isDataStale: true,
							markets,
							markPx: "7.575900",
							markPriceStatus: "success",
							tpSlInfo: undefined,
							isRowClosing: false,
							isEven: false,
							pnlMode: "roe",
							onMarketClose: vi.fn(),
							onShare: vi.fn(),
							onLimitClose: vi.fn(),
							onReverse: vi.fn(),
							onOpenTpSl: vi.fn(),
							onAdjustMargin: vi.fn(),
							onSelectMarket: vi.fn(),
						}),
					),
				),
			);
		});

		expect(container.querySelector<HTMLButtonElement>('button[aria-label="Share PNL for CXMT-USDC"]')?.disabled).toBe(
			true,
		);
	});

	it("disables every position mutation while a market close is pending", () => {
		const onMarketClose = vi.fn();
		const onLimitClose = vi.fn();
		const onReverse = vi.fn();
		const onOpenTpSl = vi.fn();
		const onAdjustMargin = vi.fn();

		act(() => {
			root.render(
				createElement(
					"table",
					null,
					createElement(
						"tbody",
						null,
						createElement(PositionRow, {
							position,
							env: "Mainnet",
							isDataStale: false,
							markets,
							markPx: "7.575900",
							markPriceStatus: "success",
							tpSlInfo: undefined,
							isRowClosing: true,
							isEven: false,
							pnlMode: "roe",
							onMarketClose,
							onShare: vi.fn(),
							onLimitClose,
							onReverse,
							onOpenTpSl,
							onAdjustMargin,
							onSelectMarket: vi.fn(),
						}),
					),
				),
			);
		});

		const actionLabels = ["Limit Close", "Market Close", "Reverse Position", "Add TP/SL", "Adjust Margin"];
		for (const label of actionLabels) {
			const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
			expect(button?.disabled, label).toBe(true);
			act(() => button?.click());
		}

		expect(onMarketClose).not.toHaveBeenCalled();
		expect(onLimitClose).not.toHaveBeenCalled();
		expect(onReverse).not.toHaveBeenCalled();
		expect(onOpenTpSl).not.toHaveBeenCalled();
		expect(onAdjustMargin).not.toHaveBeenCalled();
	});
});
