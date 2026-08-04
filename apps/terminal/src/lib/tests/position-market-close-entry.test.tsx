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
							markets,
							markPx: "7.575900",
							tpSlInfo: undefined,
							isRowClosing: false,
							isEven: false,
							onMarketClose,
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

		const marketButton = [...container.querySelectorAll("button")].find(
			(button) => button.textContent?.trim() === "Market",
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

		const limitButton = [...container.querySelectorAll("button")].find(
			(button) => button.textContent?.trim() === "Limit",
		);
		if (!(limitButton instanceof HTMLButtonElement)) throw new Error("Desktop limit close entry was not rendered");

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
});
