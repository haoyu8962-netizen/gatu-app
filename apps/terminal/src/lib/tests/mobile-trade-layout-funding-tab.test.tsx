/** @vitest-environment jsdom */

import { act, useSyncExternalStore } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMobilePositionsDisclosureStates } from "@/components/trade/mobile/use-mobile-disclosure-set";
import { createI18nRoot } from "./harness/react";

const state = vi.hoisted(() => ({
	listeners: new Set<() => void>(),
	market: { kind: "perp", name: "BTC" } as { kind: string; name: string } | undefined,
	warm: vi.fn(),
}));

function useMockMarket() {
	return useSyncExternalStore(
		(listener) => {
			state.listeners.add(listener);
			return () => state.listeners.delete(listener);
		},
		() => state.market,
	);
}

function setMarket(market: { kind: string; name: string }) {
	state.market = market;
	act(() => {
		for (const listener of state.listeners) listener();
	});
}

vi.mock("@/providers/exchange-scope", () => ({
	useExchangeScope: () => ({ routeMarketName: "BTC" }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useSelectedMarketInfo: () => ({ data: useMockMarket() }),
}));

vi.mock("@/components/trade/chart/lazy-funding-history-panel", () => ({
	FundingHistoryPanel: ({ active, market }: { active: boolean; market?: { name: string } }) => (
		<div data-funding-panel data-active={String(active)} data-market={market?.name} />
	),
	warmFundingHistoryPanel: state.warm,
}));

vi.mock("@/components/trade/mobile/mobile-trade-view", () => ({
	MobileTradeView: () => <div data-mobile-trade-view />,
}));

vi.mock("@/components/trade/mobile/mobile-book-view", () => ({
	MobileBookView: ({ active, view }: { active?: boolean; view?: string }) => (
		<div data-mobile-book data-active={String(active)} data-view={view} />
	),
}));

vi.mock("@/components/trade/mobile/mobile-chart-view", () => ({
	MobileChartView: ({ active }: { active?: boolean }) => <div data-mobile-chart data-active={String(active)} />,
}));

vi.mock("@/components/trade/mobile/mobile-market-bar", () => ({
	MobileMarketBar: () => <div data-mobile-market-bar />,
}));

vi.mock("@/components/trade/mobile/mobile-balances-tab", () => ({
	MobileBalancesTab: () => null,
}));

vi.mock("@/components/trade/mobile/mobile-positions-view", () => ({
	MobilePositionsView: () => <div data-mobile-positions />,
}));

import { MobileTradeLayout } from "@/components/trade/mobile/mobile-trade-layout";

function Harness({ showOrderForm }: { showOrderForm: boolean }) {
	const disclosureStates = useMobilePositionsDisclosureStates("Mainnet:0x1234");
	return <MobileTradeLayout active showMarketBar showOrderForm={showOrderForm} disclosureStates={disclosureStates} />;
}

describe("MobileTradeLayout funding tab", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		state.market = { kind: "perp", name: "BTC" };
		state.warm.mockReset();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		document.documentElement.removeAttribute("dir");
	});

	function render(showOrderForm = false) {
		act(() => root.render(<Harness showOrderForm={showOrderForm} />));
	}

	function tabs() {
		return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
	}

	function tabLabels() {
		return tabs().map((tab) => tab.textContent);
	}

	function press(tab: HTMLButtonElement | undefined, key: string) {
		act(() => tab?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
	}

	it("adds a fourth Funding tab for perpetual markets only", () => {
		render();
		expect(tabLabels()).toEqual(["Chart", "Order Book", "Trades", "Funding"]);

		setMarket({ kind: "builderPerp", name: "xyz:AAPL" });
		expect(tabLabels()).toEqual(["Chart", "Order Book", "Trades", "Funding"]);

		setMarket({ kind: "spot", name: "@107" });
		expect(tabLabels()).toEqual(["Chart", "Order Book", "Trades"]);
		expect(container.querySelector("[data-funding-layer]")).toBeNull();
	});

	it("shows funding with the chart and book mounted but inactive", () => {
		render();
		const chart = container.querySelector<HTMLElement>("[data-mobile-chart]");
		const book = container.querySelector<HTMLElement>("[data-mobile-book]");
		expect(container.querySelector("[data-funding-panel]")).toBeNull();

		act(() => tabs()[3]?.click());

		const funding = container.querySelector<HTMLElement>("[data-funding-panel]");
		expect(container.querySelector("[data-mobile-chart]")).toBe(chart);
		expect(container.querySelector("[data-mobile-book]")).toBe(book);
		expect(chart?.dataset.active).toBe("false");
		expect(book?.dataset.active).toBe("false");
		expect(funding?.dataset.active).toBe("true");
		expect(funding?.dataset.market).toBe("BTC");
		expect(tabs().map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "false", "false", "true"]);

		const fundingLayer = funding?.closest<HTMLElement>('[role="tabpanel"]');
		expect(tabs()[3]?.getAttribute("aria-controls")).toBe(fundingLayer?.id);
		expect(fundingLayer?.getAttribute("aria-labelledby")).toBe(tabs()[3]?.id);
		expect(fundingLayer?.getAttribute("aria-hidden")).toBe("false");
		expect(chart?.closest('[role="tabpanel"]')?.getAttribute("aria-hidden")).toBe("true");
		expect(book?.closest('[role="tabpanel"]')?.getAttribute("aria-hidden")).toBe("true");
		expect(book?.closest('[role="tabpanel"]')?.className).toContain("invisible");

		act(() => tabs()[1]?.click());
		expect(book?.dataset.active).toBe("true");
		expect(container.querySelector("[data-funding-panel]")).toBe(funding);
		expect(funding?.dataset.active).toBe("false");
		expect(fundingLayer?.getAttribute("aria-hidden")).toBe("true");
	});

	it("warms the funding chunk on intent without mounting it", () => {
		render();
		act(() => tabs()[3]?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
		act(() => tabs()[3]?.focus());

		expect(state.warm).toHaveBeenCalled();
		expect(container.querySelector("[data-funding-panel]")).toBeNull();
	});

	it("moves across four tabs with Home, End and direction-aware arrows", () => {
		render();
		press(tabs()[0], "End");
		expect(tabs()[3]?.getAttribute("aria-selected")).toBe("true");
		expect(document.activeElement).toBe(tabs()[3]);

		press(tabs()[3], "ArrowRight");
		expect(tabs()[0]?.getAttribute("aria-selected")).toBe("true");

		press(tabs()[0], "ArrowLeft");
		expect(tabs()[3]?.getAttribute("aria-selected")).toBe("true");

		document.documentElement.dir = "rtl";
		press(tabs()[3], "ArrowLeft");
		expect(tabs()[0]?.getAttribute("aria-selected")).toBe("true");

		press(tabs()[0], "Home");
		expect(tabs()[0]?.getAttribute("aria-selected")).toBe("true");
	});

	it("falls back to the chart when a spot market is selected on the funding tab", () => {
		render();
		act(() => tabs()[3]?.click());
		const funding = container.querySelector<HTMLElement>("[data-funding-panel]");

		setMarket({ kind: "spot", name: "@107" });

		expect(tabLabels()).toEqual(["Chart", "Order Book", "Trades"]);
		expect(tabs()[0]?.getAttribute("aria-selected")).toBe("true");
		expect(container.querySelector<HTMLElement>("[data-mobile-chart]")?.dataset.active).toBe("true");
		expect(container.querySelector<HTMLElement>("[data-mobile-book]")?.dataset.active).toBe("false");
		expect(container.querySelector("[data-funding-panel]")).toBe(funding);
		expect(funding?.dataset.active).toBe("false");
	});

	it("leaves the Trade view without market data tabs", () => {
		render(true);

		expect(tabs()).toHaveLength(0);
		expect(container.querySelector("[data-funding-panel]")).toBeNull();
		expect(container.querySelector("[data-mobile-trade-view]")).not.toBeNull();
	});
});
