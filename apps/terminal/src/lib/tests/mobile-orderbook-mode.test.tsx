// @vitest-environment jsdom

import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompactOrderbook, type CompactOrderbookMode } from "@/components/trade/mobile/mobile-book-view";
import { createI18nRoot } from "./harness/react";

const ASKS = Array.from({ length: 20 }, (_, index) => ({
	price: String(101 + index),
	quoteSize: String(101 + index),
	quoteTotal: String(((index + 1) * (202 + index)) / 2),
	size: "1",
	total: String(index + 1),
}));
const BIDS = Array.from({ length: 20 }, (_, index) => ({
	price: String(99 - index),
	quoteSize: String(99 - index),
	quoteTotal: String(((index + 1) * (198 - index)) / 2),
	size: "1",
	total: String(index + 1),
}));

function CompactOrderbookHarness({
	asks = ASKS,
	bids = BIDS,
	bookStatus = "active",
	hasSnapshot = true,
	isInteractive = true,
	showOrderbookInQuote = false,
}: {
	asks?: typeof ASKS;
	bids?: typeof BIDS;
	bookStatus?: string;
	hasSnapshot?: boolean;
	isInteractive?: boolean;
	showOrderbookInQuote?: boolean;
}) {
	const [mode, setMode] = useState<CompactOrderbookMode>("both");

	return (
		<CompactOrderbook
			asks={asks}
			baseToken="HYPE"
			bids={bids}
			bookStatus={bookStatus}
			flashResetKey="HYPE:0.1"
			hasSnapshot={hasSnapshot}
			isInteractive={isInteractive}
			isTransitioning={false}
			marketName="HYPE"
			priceDecimals={1}
			showOrderbookInQuote={showOrderbookInQuote}
			szDecimals={2}
			mid="100"
			midDirection="up"
			spreadText="2.0 (2.000%)"
			selectedOptionLabel="0.1"
			priceGroupingOptions={[]}
			setSelectedOptionKey={() => undefined}
			mode={mode}
			onModeChange={setMode}
			priceToken="USDC"
			quoteToken="USDC"
			sizeToken={showOrderbookInQuote ? "USDC" : "HYPE"}
		/>
	);
}

describe("compact mobile orderbook modes", () => {
	let container: HTMLDivElement;
	let disconnectCallCount: number;
	let observedElement: Element | undefined;
	let observerCallback: ResizeObserverCallback | undefined;
	let observerInstance: ResizeObserver | undefined;
	let measuredHeight: number;
	let root: Root;

	beforeEach(() => {
		measuredHeight = 304;
		disconnectCallCount = 0;
		observedElement = undefined;
		observerCallback = undefined;
		observerInstance = undefined;
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
			() =>
				({
					bottom: measuredHeight,
					height: measuredHeight,
					left: 0,
					right: 154,
					top: 0,
					width: 154,
					x: 0,
					y: 0,
					toJSON: () => ({}),
				}) as DOMRect,
		);
		vi.stubGlobal(
			"ResizeObserver",
			class implements ResizeObserver {
				constructor(callback: ResizeObserverCallback) {
					observerCallback = callback;
					observerInstance = this;
				}

				disconnect() {
					disconnectCallCount += 1;
				}
				observe = (element: Element) => {
					observedElement = element;
				};
				unobserve() {}
			},
		);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(<CompactOrderbookHarness />));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	function resizeBook(height: number) {
		measuredHeight = height;
		if (!observerCallback || !observerInstance || !observedElement) throw new Error("Order book was not observed");
		act(() => {
			observerCallback?.([{ target: observedElement } as ResizeObserverEntry], observerInstance as ResizeObserver);
		});
	}

	function getLadder(side: "asks" | "bids") {
		const ladder = container.querySelector<HTMLElement>(`[data-slot="compact-orderbook-${side}"]`);
		if (!ladder) throw new Error(`Missing ${side} ladder`);
		return ladder;
	}

	it("keeps one fixed slot budget across the three persistent view controls", () => {
		const controls = [...container.querySelectorAll<HTMLButtonElement>("button[data-mode]")];
		const footer = controls[0]?.closest("div");

		expect(controls.map((button) => button.dataset.mode)).toEqual(["both", "asks", "bids"]);
		expect(controls.map((button) => button.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);
		expect(getLadder("asks").children).toHaveLength(5);
		expect(getLadder("bids").children).toHaveLength(5);
		expect(container.querySelector('[data-slot="compact-orderbook-mid"]')).not.toBeNull();

		act(() => controls[1]?.click());
		expect(getLadder("asks").children).toHaveLength(11);
		expect(getLadder("bids").classList.contains("hidden")).toBe(true);
		expect(container.querySelector('[data-slot="compact-orderbook-mid"]')).toBeNull();
		expect(controls.map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
		expect(controls[0]?.closest("div")).toBe(footer);

		act(() => controls[2]?.click());
		expect(getLadder("bids").children).toHaveLength(11);
		expect(getLadder("asks").classList.contains("hidden")).toBe(true);
		expect(controls.map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "false", "true"]);
	});

	it("grows from eleven to thirteen slots when the shared fieldset grows", () => {
		expect(getLadder("asks").children).toHaveLength(5);
		expect(getLadder("bids").children).toHaveLength(5);
		resizeBook(359);
		expect(getLadder("asks").children).toHaveLength(5);
		expect(getLadder("bids").children).toHaveLength(5);

		resizeBook(360);

		expect(getLadder("asks").children).toHaveLength(6);
		expect(getLadder("bids").children).toHaveLength(6);
		act(() => container.querySelector<HTMLButtonElement>('button[data-mode="asks"]')?.click());
		expect(getLadder("asks").children).toHaveLength(13);
	});

	it("keeps four-pixel row gaps and leaves surplus height away from the midpoint", () => {
		const asks = getLadder("asks");
		const bids = getLadder("bids");

		expect(asks.className).toContain("justify-end");
		expect(bids.className).toContain("justify-start");
		expect(asks.className).toContain("gap-[4px]");
		expect(bids.className).toContain("gap-[4px]");
		expect(asks.className).not.toContain("justify-between");
		expect(bids.className).not.toContain("justify-between");
	});

	it("shows a dollar-prefixed directional mid price and a visible compact spread", () => {
		const mid = container.querySelector<HTMLElement>('[data-slot="compact-orderbook-mid"]');
		const midValue = container.querySelector<HTMLElement>('[data-slot="compact-orderbook-mid-price"]');
		const spread = container.querySelector<HTMLElement>('[data-slot="compact-orderbook-spread"]');

		expect(mid?.getAttribute("data-direction")).toBe("up");
		expect(midValue?.textContent).toBe("$100.0");
		expect(midValue?.className).toContain("text-trading-panel-success");
		expect(mid?.querySelector("svg")).toBeNull();
		expect(spread?.textContent).toBe("2.0 (2.000%)");
		expect(spread?.className).not.toContain("sr-only");
		expect(container.textContent).toContain("Price (USDC)");
		expect(container.textContent).toContain("Size (HYPE)");
		expect(container.firstElementChild?.className).toContain("orderbook-panel-container");
		expect(container.querySelector('[data-slot="compact-orderbook-price-token"]')?.className).toContain(
			"orderbook-asset-heading",
		);
		expect(container.querySelector('[data-slot="compact-orderbook-size-token"]')?.className).toContain(
			"orderbook-asset-heading",
		);
		expect(container.innerHTML).not.toContain("max-[339px]:hidden");
	});

	it("uses the order book palette for every compact view icon", () => {
		const colors = [...container.querySelectorAll<HTMLButtonElement>("button[data-mode]")].map((button) =>
			[...button.querySelectorAll<HTMLElement>("[aria-hidden='true'] > span")].map((bar) =>
				bar.style.getPropertyValue("background-color"),
			),
		);

		expect(colors).toEqual([
			["var(--orderbook-depth-ask)", "var(--orderbook-depth-bid)"],
			["var(--orderbook-depth-ask)", "var(--orderbook-depth-ask)"],
			["var(--orderbook-depth-bid)", "var(--orderbook-depth-bid)"],
		]);
	});

	it("keeps compact chrome and typography in the error state", () => {
		const initialFieldset = observedElement;

		act(() =>
			root.render(
				<CompactOrderbookHarness asks={[]} bids={[]} bookStatus="error" hasSnapshot={false} isInteractive={false} />,
			),
		);

		const alert = container.querySelector<HTMLElement>('[role="alert"]');
		const currentFieldset = container.querySelector("fieldset");
		expect(container.firstElementChild?.className).toContain("font-market-close");
		expect(currentFieldset).toBe(initialFieldset);
		expect(alert?.className).toContain("text-xs");
		expect(alert?.className).toContain("text-trading-panel-error");
		expect(currentFieldset?.contains(alert ?? null)).toBe(true);
		expect(container.querySelector('[data-slot="compact-orderbook-price-token"]')).not.toBeNull();
		expect(container.querySelector('[data-slot="compact-orderbook-size-token"]')).not.toBeNull();
		expect(container.querySelector('[aria-label="Price precision"]')).not.toBeNull();
		expect(container.querySelectorAll("button[data-mode]")).toHaveLength(3);
		expect(container.querySelector('button[aria-label^="Ask,"]')).toBeNull();
		expect(container.querySelector('button[aria-label^="Bid,"]')).toBeNull();
	});

	it("uses the controlled quote unit for the header and displayed sizes", () => {
		act(() => root.render(<CompactOrderbookHarness showOrderbookInQuote />));

		expect(container.textContent).toContain("Size (USDC)");
		expect(getLadder("asks").textContent).toContain("101.00");
	});

	it("fills sparse snapshots from the far edge while keeping each BBO next to the mid", () => {
		act(() => root.render(<CompactOrderbookHarness asks={ASKS.slice(0, 2)} bids={BIDS.slice(0, 2)} />));
		const askChildren = [...getLadder("asks").children];
		const bidChildren = [...getLadder("bids").children];

		expect(askChildren).toHaveLength(5);
		expect(askChildren.slice(0, 3).every((row) => row.getAttribute("aria-hidden") === "true")).toBe(true);
		expect(askChildren.at(-1)?.getAttribute("aria-label")).toContain("Ask, Price 101.0,");
		expect(bidChildren).toHaveLength(5);
		expect(bidChildren[0]?.getAttribute("aria-label")).toContain("Bid, Price 99.0,");
		expect(bidChildren.slice(2).every((row) => row.getAttribute("aria-hidden") === "true")).toBe(true);
	});

	it("observes only the shared fieldset and disconnects on unmount", () => {
		expect(observedElement?.tagName).toBe("FIELDSET");
		expect(disconnectCallCount).toBe(0);

		act(() => root.unmount());
		expect(disconnectCallCount).toBe(1);
		root = createI18nRoot(container);
	});
});
