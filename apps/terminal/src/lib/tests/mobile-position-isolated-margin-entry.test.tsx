// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobilePositionCard } from "@/components/trade/mobile/mobile-position-card";
import type { Position } from "@/lib/hyperliquid";
import type { Markets } from "@/lib/hyperliquid/markets";
import { createI18nRoot } from "./harness/react";

vi.mock("@/components/trade/components/asset-badge", async () => {
	const React = await import("react");
	return {
		AssetBadge: ({ coin, onClick }: { coin: string; onClick?: () => void }) =>
			React.createElement("button", { type: "button", onClick }, coin),
	};
});

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
		pairName: "CXMT-USDC",
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
					markets,
					markPx: "7.5759",
					tpSlInfo: undefined,
					isRowClosing: false,
					closeErrorMessage: null,
					onClose: vi.fn(),
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
	});

	it("keeps the mobile summary compact until the user expands the position", () => {
		const onExpandedChange = vi.fn();

		act(() => {
			root.render(
				createElement(MobilePositionCard, {
					position: isolatedPosition,
					markets,
					markPx: "7.5759",
					tpSlInfo: undefined,
					isRowClosing: false,
					closeErrorMessage: null,
					expanded: false,
					onExpandedChange,
					onClose: vi.fn(),
					onReverse: vi.fn(),
					onLimitClose: vi.fn(),
					onOpenTpSl: vi.fn(),
					onAdjustMargin: vi.fn(),
					onSelectMarket: vi.fn(),
				}),
			);
		});

		expect(container.textContent).toContain("205.9 CXMT");
		expect(container.textContent).toContain("10x");
		expect(container.textContent).toContain("xyz");
		expect(container.querySelector('button[aria-label="Adjust isolated margin for CXMT-USDC"]')).toBeNull();

		const expandButton = container.querySelector('button[aria-label="Expand market details"]');
		if (!(expandButton instanceof HTMLButtonElement)) throw new Error("Position details trigger was not rendered");

		act(() => expandButton.click());

		expect(onExpandedChange).toHaveBeenCalledWith(true);
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
					markets,
					markPx: "7.5759",
					tpSlInfo: undefined,
					isRowClosing: false,
					closeErrorMessage: null,
					onClose: vi.fn(),
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
