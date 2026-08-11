/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeHeader } from "@/components/trade/tradebox/trade-header";
import { createI18nRoot } from "./harness/react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("TradeHeader mobile margin actions", () => {
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

	function renderHeader(callbacks: {
		accountMode?: "disabled" | "unifiedAccount" | "portfolioMargin" | "default";
		isLeveraged?: boolean;
		layout?: "desktop" | "mobile";
		marketKind?: "perp" | "spot";
		onAccountModeClick?: () => void;
		onLeverageClick?: () => void;
		onMarginLeverageClick?: () => void;
		onMarginModeClick?: () => void;
	}) {
		act(() => {
			root.render(
				<TradeHeader
					accountMode={callbacks.accountMode ?? "unifiedAccount"}
					isLeveraged={callbacks.isLeveraged ?? true}
					layout={callbacks.layout ?? "mobile"}
					leverage={10}
					marginMode="cross"
					marketKind={callbacks.marketKind ?? "perp"}
					onOrderTypeChange={vi.fn()}
					onAccountModeClick={callbacks.onAccountModeClick ?? vi.fn()}
					onSideChange={vi.fn()}
					orderType="market"
					side="buy"
					sideLabels={{ buy: "Buy", sell: "Sell", buyAria: "Buy", sellAria: "Sell" }}
					{...callbacks}
				/>,
			);
		});
	}

	it("routes margin mode and leverage to their independent mobile entries", () => {
		const onMarginModeClick = vi.fn();
		const onLeverageClick = vi.fn();
		const onMarginLeverageClick = vi.fn();
		renderHeader({ onMarginModeClick, onLeverageClick, onMarginLeverageClick });
		expect(getButton(container, "Cross").className).toContain("after:h-11");
		expect(getButton(container, "10x").className).toContain("after:h-11");

		act(() => getButton(container, "Cross").click());
		expect(onMarginModeClick).toHaveBeenCalledOnce();
		expect(onLeverageClick).not.toHaveBeenCalled();
		expect(onMarginLeverageClick).not.toHaveBeenCalled();

		act(() => getButton(container, "10x").click());
		expect(onMarginModeClick).toHaveBeenCalledOnce();
		expect(onLeverageClick).toHaveBeenCalledOnce();
		expect(onMarginLeverageClick).not.toHaveBeenCalled();
	});

	it("falls both mobile entries back to the legacy combined callback", () => {
		const onMarginLeverageClick = vi.fn();
		renderHeader({ onMarginLeverageClick });

		act(() => getButton(container, "Cross").click());
		act(() => getButton(container, "10x").click());

		expect(onMarginLeverageClick).toHaveBeenCalledTimes(2);
	});

	it("keeps account mode reachable on mobile spot markets", () => {
		const onAccountModeClick = vi.fn();
		renderHeader({
			accountMode: "default",
			isLeveraged: false,
			marketKind: "spot",
			onAccountModeClick,
		});

		act(() => getButton(container, "Select mode").click());
		expect(onAccountModeClick).toHaveBeenCalledOnce();
	});

	it("keeps account mode reachable on desktop spot markets", () => {
		const onAccountModeClick = vi.fn();
		renderHeader({
			accountMode: "default",
			isLeveraged: false,
			layout: "desktop",
			marketKind: "spot",
			onAccountModeClick,
		});

		const accountModeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Account mode"]');
		if (!accountModeButton) throw new Error("Expected desktop account mode button");
		act(() => accountModeButton.click());
		expect(onAccountModeClick).toHaveBeenCalledOnce();
	});
});

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
		(candidate) => candidate.textContent?.trim() === label,
	);
	if (!button) throw new Error(`Expected ${label} button`);
	return button;
}
