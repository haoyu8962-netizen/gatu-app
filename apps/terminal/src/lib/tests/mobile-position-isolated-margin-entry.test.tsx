// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobilePositionCard } from "@/components/trade/mobile/mobile-position-card";
import type { Position } from "@/lib/hyperliquid";
import type { Markets } from "@/lib/hyperliquid/markets";
import { createI18nRoot } from "./harness/react";

vi.mock("@/components/trade/components/asset-display", () => ({
	AssetDisplay: ({ coin }: { coin: string }) => <span data-testid="position-asset-logo" data-coin={coin} />,
}));

const isolatedPosition: Position = {
	dex: "xyz",
	coin: "xyz:CXMT",
	szi: "205.9",
	entryPx: "7.79995",
	positionValue: "1559.84",
	unrealizedPnl: "-46.18",
	returnOnEquity: "-0.3366",
	liquidationPx: "7.27304",
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
		iconUrl: "https://assets.example/CXMT.svg",
		assetId: 120_031,
		szDecimals: 1,
		marginMode: "noCross",
	}),
} as unknown as Markets;

describe("MobilePositionCard isolated margin entry", () => {
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

	it("opens the margin flow with the exact HIP-3 market identity", () => {
		const onAdjustMargin = vi.fn();

		act(() => {
			root.render(
				createElement(MobilePositionCard, {
					position: isolatedPosition,
					env: "Mainnet",
					isDataStale: false,
					markets,
					markPx: "7.5759",
					tpSlInfo: undefined,
					isRowClosing: false,
					onMarketClose: vi.fn(),
					onShare: vi.fn(),
					onReverse: vi.fn(),
					onLimitClose: vi.fn(),
					onOpenTpSl: vi.fn(),
					onAdjustMargin,
					onSelectMarket: vi.fn(),
				}),
			);
		});

		const button = container.querySelector('button[aria-label="Adjust isolated margin for CXMT-USDC"]');
		if (!(button instanceof HTMLButtonElement)) throw new Error("Isolated margin entry was not rendered");
		expect(button.className).toContain("after:h-11");
		expect(button.className).toContain("after:min-w-11");

		act(() => button.click());

		expect(onAdjustMargin).toHaveBeenCalledWith({
			coin: "xyz:CXMT",
			dex: "xyz",
			assetId: 120_031,
			isLong: true,
			szDecimals: 1,
			marginConstraint: "noCross",
			marginUsed: "137.19",
			positionValue: "1559.84",
			liquidationPx: "7.27304",
		});
		expect(container.textContent).toContain("1,559.84 USDC");
		expect(container.textContent).toContain("$137.19");
		expect(container.textContent).toContain("(Isolated)");
		const tpSlButton = [...container.querySelectorAll("button")].find((element) =>
			element.textContent?.startsWith("TP/SL"),
		);
		expect(tpSlButton?.textContent).toContain("--/--");
		expect(tpSlButton?.className).toContain("after:h-11");
		expect(tpSlButton?.className).toContain("after:min-w-11");
	});

	it("preserves limit close, market close, and reverse actions in the expanded card", () => {
		const onMarketClose = vi.fn();
		const onReverse = vi.fn();
		const onLimitClose = vi.fn();

		act(() => {
			root.render(
				createElement(MobilePositionCard, {
					position: isolatedPosition,
					env: "Mainnet",
					isDataStale: false,
					markets,
					markPx: "7.5759",
					tpSlInfo: undefined,
					isRowClosing: false,
					onMarketClose,
					onShare: vi.fn(),
					onReverse,
					onLimitClose,
					onOpenTpSl: vi.fn(),
					onAdjustMargin: vi.fn(),
					onSelectMarket: vi.fn(),
				}),
			);
		});

		function getButton(label: string): HTMLButtonElement {
			const button = [...container.querySelectorAll("button")].find((element) => element.textContent?.trim() === label);
			if (!button) throw new Error(`${label} button was not rendered`);
			return button;
		}

		act(() => getButton("Limit Close").click());
		expect(onLimitClose).toHaveBeenCalledWith({
			coin: "xyz:CXMT",
			dex: "xyz",
			assetId: 120_031,
			signedPositionSize: "205.9",
			entryPx: "7.79995",
			markPx: "7.5759",
			szDecimals: 1,
			marginMode: "isolated",
		});

		act(() => getButton("Market Close").click());
		expect(onMarketClose).toHaveBeenCalledWith({
			coin: "xyz:CXMT",
			dex: "xyz",
			assetId: 120_031,
			szDecimals: 1,
			signedPositionSize: "205.9",
			markPx: "7.5759",
			marginMode: "isolated",
		});
		expect(container.textContent).not.toContain("Confirm Close");

		act(() => getButton("Reverse").click());
		expect(onReverse).toHaveBeenCalledWith({
			coin: "xyz:CXMT",
			dex: "xyz",
			assetId: 120_031,
			signedPositionSize: "205.9",
			szDecimals: 1,
			marginMode: "isolated",
		});
	});

	it("keeps reverse available while cached mark data is temporarily unavailable", () => {
		const onReverse = vi.fn();
		act(() => {
			root.render(
				createElement(MobilePositionCard, {
					position: isolatedPosition,
					env: "Mainnet",
					isDataStale: false,
					markets,
					markPx: undefined,
					tpSlInfo: undefined,
					isRowClosing: false,
					onMarketClose: vi.fn(),
					onShare: vi.fn(),
					onReverse,
					onLimitClose: vi.fn(),
					onOpenTpSl: vi.fn(),
					onAdjustMargin: vi.fn(),
					onSelectMarket: vi.fn(),
				}),
			);
		});

		const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")];
		const marketClose = buttons.find((button) => button.textContent?.trim() === "Market Close");
		const limitClose = buttons.find((button) => button.textContent?.trim() === "Limit Close");
		const reverse = buttons.find((button) => button.textContent?.trim() === "Reverse");
		expect(marketClose?.disabled).toBe(true);
		expect(limitClose?.disabled).toBe(true);
		expect(reverse?.disabled).toBe(false);
		act(() => reverse?.click());
		expect(onReverse).toHaveBeenCalledOnce();
	});

	it("keeps the mobile summary compact until the user expands the position", () => {
		const onExpandedChange = vi.fn();
		const onSelectMarket = vi.fn();

		act(() => {
			root.render(
				createElement(MobilePositionCard, {
					position: isolatedPosition,
					env: "Mainnet",
					isDataStale: false,
					markets,
					markPx: "7.5759",
					tpSlInfo: undefined,
					isRowClosing: false,
					expanded: false,
					onExpandedChange,
					onMarketClose: vi.fn(),
					onShare: vi.fn(),
					onReverse: vi.fn(),
					onLimitClose: vi.fn(),
					onOpenTpSl: vi.fn(),
					onAdjustMargin: vi.fn(),
					onSelectMarket,
				}),
			);
		});

		expect(container.textContent).toContain("205.9 CXMT");
		expect(container.textContent).toContain("10x");
		expect(container.textContent).toContain("Long 10x");
		expect(container.querySelector('[data-testid="position-asset-logo"]')).toBeNull();
		expect(container.querySelector('button[aria-label="Adjust isolated margin for CXMT-USDC"]')).toBeNull();

		const marketButton = container.querySelector('button[aria-label="Switch to CXMT-USDC market, long position"]');
		if (!(marketButton instanceof HTMLButtonElement)) throw new Error("Market identity button was not rendered");
		expect(marketButton.className).toContain("after:h-11");
		expect(marketButton.className).toContain("after:min-w-11");
		act(() => marketButton.click());
		expect(onSelectMarket).toHaveBeenCalledWith("xyz:CXMT", "buy");

		const expandButton = container.querySelector('button[aria-label="Expand CXMT-USDC position details"]');
		if (!(expandButton instanceof HTMLButtonElement)) throw new Error("Position details trigger was not rendered");

		act(() => expandButton.click());

		expect(onExpandedChange).toHaveBeenCalledWith(true);
	});

	it("wraps long market and PNL values without hiding the position summary", () => {
		const longMarketPosition: Position = {
			...isolatedPosition,
			coin: "xyz:BRENTOIL",
			szi: "-2",
			unrealizedPnl: "-159.41",
			returnOnEquity: "-0.22",
			leverage: { type: "cross", value: 20 },
		};
		const longNameMarkets = {
			getMarket: () => ({
				kind: "builderPerp",
				name: "xyz:BRENTOIL",
				shortName: "BRENTOIL",
				pairName: "BRENTOIL-USDC",
				iconUrl: "https://assets.example/BRENTOIL.svg",
				assetId: 120_032,
				szDecimals: 2,
				marginMode: "noCross",
			}),
		} as unknown as Markets;

		act(() => {
			root.render(
				createElement(MobilePositionCard, {
					position: longMarketPosition,
					env: "Mainnet",
					isDataStale: false,
					markets: longNameMarkets,
					markPx: "83.528",
					tpSlInfo: undefined,
					isRowClosing: false,
					expanded: false,
					onExpandedChange: vi.fn(),
					onMarketClose: vi.fn(),
					onShare: vi.fn(),
					onReverse: vi.fn(),
					onLimitClose: vi.fn(),
					onOpenTpSl: vi.fn(),
					onAdjustMargin: vi.fn(),
					onSelectMarket: vi.fn(),
				}),
			);
		});

		const marketButton = container.querySelector('button[aria-label="Switch to BRENTOIL-USDC market, short position"]');
		if (!(marketButton instanceof HTMLButtonElement)) throw new Error("Long market identity button was not rendered");
		expect(marketButton.className).toContain("flex-wrap");

		const marketName = [...marketButton.children].find((element) => element.textContent === "BRENTOIL");
		if (!(marketName instanceof HTMLElement)) throw new Error("Long market name was not rendered");
		expect(marketName.className).toContain("shrink-0");
		expect(marketName.className).toContain("break-words");
		expect(marketName.className).not.toContain("truncate");
		for (const label of ["Market", "Size", "PNL (ROE %)"]) {
			const labelElement = [...container.querySelectorAll<HTMLElement>("div")].find(
				(element) => element.children.length === 0 && element.textContent === label,
			);
			if (!(labelElement instanceof HTMLElement)) throw new Error(`${label} summary label was not rendered`);
			expect(labelElement.className).toContain("whitespace-normal");
			expect(labelElement.className).not.toContain("truncate");
		}

		const titledValues = [...container.querySelectorAll<HTMLElement>("[title]")];
		const sizeValue = titledValues.find((element) => element.textContent?.trim() === "2.00 BRENTOIL");
		if (!(sizeValue instanceof HTMLElement)) throw new Error("Long position size was not rendered");
		expect(sizeValue.className).toContain("whitespace-normal");
		expect(sizeValue.className).not.toContain("truncate");

		const pnlValue = titledValues.find(
			(element) => element.textContent?.includes("-$159.41") && element.textContent.includes("-22.0%"),
		);
		if (!(pnlValue instanceof HTMLElement)) throw new Error("Long position PNL was not rendered");
		expect(pnlValue.textContent).toBe("-$159.41 (-22.0%)");
		expect(pnlValue.className).toContain("flex-wrap");
		expect(pnlValue.className).not.toContain("truncate");
		expect([...pnlValue.children]).toHaveLength(2);
		expect([...pnlValue.children].every((element) => element.className.includes("shrink-0"))).toBe(true);

		const summary = marketButton.closest("div.grid");
		if (!(summary instanceof HTMLDivElement)) throw new Error("Position summary was not rendered");
		expect(summary.className).toContain("items-start");
		expect(summary.className).toContain("[&>svg]:self-center");
		expect(container.querySelector('button[aria-label="Share PNL for BRENTOIL-USDC"]')).not.toBeNull();
	});

	it("does not expose the entry for cross-margin positions", () => {
		const onAdjustMargin = vi.fn();

		act(() => {
			root.render(
				createElement(MobilePositionCard, {
					position: {
						...isolatedPosition,
						leverage: { type: "cross", value: 10 },
					},
					env: "Mainnet",
					isDataStale: false,
					markets,
					markPx: "7.5759",
					tpSlInfo: undefined,
					isRowClosing: false,
					onMarketClose: vi.fn(),
					onShare: vi.fn(),
					onReverse: vi.fn(),
					onLimitClose: vi.fn(),
					onOpenTpSl: vi.fn(),
					onAdjustMargin,
					onSelectMarket: vi.fn(),
				}),
			);
		});

		expect(container.querySelector('button[aria-label="Adjust isolated margin for CXMT-USDC"]')).toBeNull();
	});
});
