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

	it("opens the shared market-close flow with exact exchange strings", async () => {
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
							markets,
							markPx: "7.575900",
							tpSlInfo: undefined,
							isRowClosing: false,
							isEven: false,
							pnlMode: "roe",
							onMarketClose,
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

		const marketButton = [...container.querySelectorAll("button")].find(
			(button) => button.textContent?.trim() === "Market Close",
		);
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

		const moreActions = container.querySelector<HTMLButtonElement>('button[aria-label="More position actions"]');
		if (!moreActions) throw new Error("Desktop position overflow menu was not rendered");

		await act(async () => moreActions.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		let menuItems = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')];
		expect(menuItems.map((item) => item.textContent?.trim())).toEqual([
			"Limit Close",
			"Adjust Margin",
			"Set TP/SL",
			"Reverse Position",
		]);

		const adjustMarginButton = menuItems.find((button) => button.textContent?.trim() === "Adjust Margin");
		await act(async () => adjustMarginButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		expect(onAdjustMargin).toHaveBeenCalledOnce();

		await act(async () => moreActions.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		menuItems = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')];
		const tpSlButton = menuItems.find((button) => button.textContent?.trim() === "Set TP/SL");
		await act(async () => tpSlButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		expect(onOpenTpSl).toHaveBeenCalledWith({
			coin: "xyz:CXMT",
			dex: "xyz",
			assetId: 120_031,
			isLong: false,
			szDecimals: 1,
			marginMode: "isolated",
		});

		await act(async () => moreActions.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		menuItems = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')];
		const reverseButton = menuItems.find((button) => button.textContent?.trim() === "Reverse Position");
		await act(async () => reverseButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		expect(onReverse).toHaveBeenCalledOnce();

		await act(async () => moreActions.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		menuItems = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')];
		const limitButton = menuItems.find((button) => button.textContent?.trim() === "Limit Close");
		if (!(limitButton instanceof HTMLElement)) throw new Error("Desktop limit close entry was not rendered");

		await act(async () => limitButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));

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
							markets,
							markPx: "7.575900",
							tpSlInfo: undefined,
							isRowClosing: false,
							isEven: false,
							pnlMode,
							onMarketClose: vi.fn(),
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
});
