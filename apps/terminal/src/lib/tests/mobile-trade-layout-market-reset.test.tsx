/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMobilePositionsDisclosureStates } from "@/components/trade/mobile/use-mobile-disclosure-set";
import { createI18nRoot } from "./harness/react";

const marketState = vi.hoisted(() => ({
	routeMarketName: "xyz:GOOGL" as string | undefined,
	selectedMarketName: "xyz:GOOGL",
	mountCount: 0,
	marketBarMountCount: 0,
}));

vi.mock("@/providers/exchange-scope", () => ({
	useExchangeScope: () => ({ routeMarketName: marketState.routeMarketName }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useSelectedMarketInfo: () => ({ data: { name: marketState.selectedMarketName } }),
}));

vi.mock("@/components/trade/mobile/mobile-trade-view", async () => {
	const React = await import("react");
	return {
		MobileTradeView: ({
			active,
			sizeMode,
			onSizeModeChange,
		}: {
			active?: boolean;
			sizeMode: "base" | "quote";
			onSizeModeChange: (sizeMode: "base" | "quote") => void;
		}) => {
			const [mountId] = React.useState(() => ++marketState.mountCount);
			return (
				<>
					<input aria-label="Mobile order size" data-active={String(active)} data-mount-id={mountId} />
					<button
						type="button"
						aria-label="Toggle mobile size mode"
						data-size-mode={sizeMode}
						onClick={() => onSizeModeChange(sizeMode === "base" ? "quote" : "base")}
					/>
				</>
			);
		},
	};
});

vi.mock("@/components/trade/mobile/mobile-book-view", () => ({
	MobileBookView: ({ showOrderbookInQuote, view }: { showOrderbookInQuote?: boolean; view?: string }) => (
		<div data-mobile-book data-show-in-quote={String(showOrderbookInQuote)} data-view={view} />
	),
}));

vi.mock("@/components/trade/mobile/mobile-chart-view", () => ({
	MobileChartView: () => <div data-mobile-chart />,
}));

vi.mock("@/components/trade/mobile/mobile-market-bar", async () => {
	const React = await import("react");
	return {
		MobileMarketBar: () => {
			const [mountId] = React.useState(() => ++marketState.marketBarMountCount);
			return <div data-mobile-market-bar data-mount-id={mountId} />;
		},
	};
});

vi.mock("@/components/trade/mobile/mobile-balances-tab", () => ({
	MobileBalancesTab: () => <div data-mobile-balances />,
}));

vi.mock("@/components/trade/mobile/mobile-positions-view", () => ({
	MobilePositionsView: ({
		balancesContent,
		includeBottomNavSpacer,
	}: {
		balancesContent?: ReactNode;
		includeBottomNavSpacer?: boolean;
	}) => (
		<div data-mobile-positions data-bottom-nav-spacer={String(includeBottomNavSpacer)}>
			{balancesContent}
		</div>
	),
}));

import { MobileTradeLayout } from "@/components/trade/mobile/mobile-trade-layout";

function MobileTradeLayoutHarness({
	active,
	showOrderForm,
	orderEntryDraftReady = true,
}: {
	active: boolean;
	showOrderForm: boolean;
	orderEntryDraftReady?: boolean;
}) {
	const disclosureStates = useMobilePositionsDisclosureStates("Mainnet:0x1234");
	return (
		<MobileTradeLayout
			active={active}
			showMarketBar
			showOrderForm={showOrderForm}
			orderEntryDraftReady={orderEntryDraftReady}
			disclosureStates={disclosureStates}
		/>
	);
}

describe("MobileTradeLayout market identity", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		marketState.routeMarketName = "xyz:GOOGL";
		marketState.selectedMarketName = "xyz:GOOGL";
		marketState.mountCount = 0;
		marketState.marketBarMountCount = 0;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		document.documentElement.removeAttribute("dir");
	});

	function render(active = true, showOrderForm = true, orderEntryDraftReady = true) {
		act(() => {
			root.render(
				<MobileTradeLayoutHarness
					active={active}
					showOrderForm={showOrderForm}
					orderEntryDraftReady={orderEntryDraftReady}
				/>,
			);
		});
	}

	it("gates only the form while the next market draft is reset", () => {
		render(true, true, false);
		const book = container.querySelector("[data-mobile-book]");
		const account = container.querySelector("[data-mobile-positions]");
		expect(container.querySelector('[aria-label="Mobile order size"]')).toBeNull();
		expect(container.querySelector('[data-testid="mobile-order-entry-draft-loading"]')).not.toBeNull();
		render();
		expect(container.querySelector('[aria-label="Mobile order size"]')).not.toBeNull();
		expect(container.querySelector("[data-mobile-book]")).toBe(book);
		expect(container.querySelector("[data-mobile-positions]")).toBe(account);
	});

	it.each([true, false])("provides spot balances to the mobile account tabs when showOrderForm=%s", (showOrderForm) => {
		render(true, showOrderForm);

		expect(container.querySelector("[data-mobile-positions]")).not.toBeNull();
		expect(container.querySelector("[data-mobile-balances]")).not.toBeNull();
		expect(container.querySelector("[data-mobile-positions]")?.getAttribute("data-bottom-nav-spacer")).toBe("false");
	});

	it("keeps the split viewport-based and independent of form content", () => {
		render();

		expect(container.querySelector('[data-slot="mobile-trade-order-split"]')?.className).toContain(
			"h-[clamp(370px,60svh,480px)]",
		);
	});

	it("controls the order-book unit from the order form without synchronizing effects", () => {
		render();
		expect(container.querySelector("[data-mobile-book]")?.getAttribute("data-show-in-quote")).toBe("true");

		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Toggle mobile size mode"]')?.click());

		expect(container.querySelector("[data-mobile-book]")?.getAttribute("data-show-in-quote")).toBe("false");
	});

	it("forwards surface visibility so the hidden order form can pause live BBO updates", () => {
		render(false);
		expect(container.querySelector('[aria-label="Mobile order size"]')?.getAttribute("data-active")).toBe("false");

		render(true);
		expect(container.querySelector('[aria-label="Mobile order size"]')?.getAttribute("data-active")).toBe("true");
	});

	it("remounts the order form when the canonical route market changes", () => {
		render();
		const initialInput = container.querySelector<HTMLInputElement>('input[aria-label="Mobile order size"]');
		expect(initialInput).not.toBeNull();
		if (!initialInput) return;
		const initialMountId = initialInput.dataset.mountId;
		const initialMarketBarMountId = container.querySelector<HTMLElement>("[data-mobile-market-bar]")?.dataset.mountId;

		render();
		const sameMarketInput = container.querySelector<HTMLInputElement>('input[aria-label="Mobile order size"]');
		expect(sameMarketInput?.dataset.mountId).toBe(initialMountId);

		const sizeModeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Toggle mobile size mode"]');
		act(() => sizeModeButton?.click());
		expect(sizeModeButton?.dataset.sizeMode).toBe("base");

		marketState.routeMarketName = "xyz:NVDA";
		marketState.selectedMarketName = "xyz:NVDA";
		render(false);

		const nextMarketInput = container.querySelector<HTMLInputElement>('input[aria-label="Mobile order size"]');
		expect(nextMarketInput?.dataset.mountId).not.toBe(initialMountId);
		expect(container.querySelector<HTMLElement>("[data-mobile-market-bar]")?.dataset.mountId).not.toBe(
			initialMarketBarMountId,
		);
		const nextSizeModeButton = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Toggle mobile size mode"]',
		);
		expect(nextSizeModeButton?.dataset.sizeMode).toBe("base");
	});

	it("exposes an RTL-aware tab model without remounting chart or book content", () => {
		render(true, false);

		const tablist = container.querySelector<HTMLElement>('[role="tablist"]');
		const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
		const chart = container.querySelector<HTMLElement>("[data-mobile-chart]");
		const book = container.querySelector<HTMLElement>("[data-mobile-book]");
		const chartPanel = chart?.closest<HTMLElement>('[role="tabpanel"]');
		const bookPanel = book?.closest<HTMLElement>('[role="tabpanel"]');
		const bookPanelId = tabs[1]?.getAttribute("aria-controls");
		const tradesPanelId = tabs[2]?.getAttribute("aria-controls");

		expect(tablist?.getAttribute("aria-label")).toBe("Market data views");
		expect(tabs.map((tab) => tab.textContent)).toEqual(["Chart", "Order Book", "Trades"]);
		expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
		expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
		expect(tabs[0]?.getAttribute("aria-controls")).toBe(chartPanel?.id);
		expect(bookPanelId).toBe(bookPanel?.id);
		expect(tradesPanelId).not.toBe(bookPanelId);
		expect(container.querySelectorAll('[role="tabpanel"]')).toHaveLength(3);
		expect(container.ownerDocument.getElementById(tradesPanelId ?? "")?.hidden).toBe(true);
		expect(chartPanel?.tabIndex).toBe(0);
		expect(bookPanel?.tabIndex).toBe(-1);

		act(() => tabs[1]?.click());

		expect(container.querySelector("[data-mobile-chart]")).toBe(chart);
		expect(container.querySelector("[data-mobile-book]")).toBe(book);
		expect(book?.dataset.view).toBe("book");
		expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
		expect(bookPanel?.getAttribute("aria-labelledby")).toBe(tabs[1]?.id);
		expect(bookPanel?.tabIndex).toBe(0);

		act(() => tabs[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));

		expect(container.querySelector("[data-mobile-chart]")).toBe(chart);
		expect(container.querySelector("[data-mobile-book]")).toBe(book);
		expect(book?.dataset.view).toBe("trades");
		expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "false", "true"]);
		expect(bookPanel?.id).toBe(tradesPanelId);
		expect(bookPanel?.getAttribute("aria-labelledby")).toBe(tabs[2]?.id);
		expect(container.ownerDocument.getElementById(bookPanelId ?? "")?.hidden).toBe(true);
		expect(document.activeElement).toBe(tabs[2]);

		document.documentElement.dir = "rtl";
		act(() => tabs[2]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
		expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
		expect(document.activeElement).toBe(tabs[1]);
	});
});
