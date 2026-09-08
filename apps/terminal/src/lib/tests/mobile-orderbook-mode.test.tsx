// @vitest-environment jsdom

import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompactOrderbook, type CompactOrderbookMode } from "@/components/trade/mobile/mobile-book-view";
import { getOrderbookActionsStore } from "@/stores/use-orderbook-actions-store";
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
	hasSnapshot = true,
	isInteractive = true,
	showOrderbookInQuote = false,
}: {
	asks?: typeof ASKS;
	bids?: typeof BIDS;
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
		getOrderbookActionsStore().actions.clearSelectedPrice();
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

	it("adds another row only after its complete minimum height fits", () => {
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

	it("keeps pending skeleton ranks stable when the measured slot count grows", () => {
		act(() => {
			root.render(<CompactOrderbookHarness asks={[]} bids={[]} hasSnapshot={false} isInteractive={false} />);
		});

		const initialAskRows = [
			...getLadder("asks").querySelectorAll<HTMLElement>('[data-slot="compact-orderbook-row-position"]'),
		];
		const initialBidRows = [
			...getLadder("bids").querySelectorAll<HTMLElement>('[data-slot="compact-orderbook-row-position"]'),
		];
		const initialAskRowsByRank = new Map(initialAskRows.map((row) => [row.dataset.rank, row]));
		const initialBidRowsByRank = new Map(initialBidRows.map((row) => [row.dataset.rank, row]));

		expect(initialAskRows.map((row) => row.dataset.rank)).toEqual(["4", "3", "2", "1", "0"]);
		expect(initialBidRows.map((row) => row.dataset.rank)).toEqual(["0", "1", "2", "3", "4"]);
		expect(initialAskRows.every((row) => row.querySelector('[data-slot="orderbook-skeleton-row"]'))).toBe(true);
		expect(initialBidRows.every((row) => row.querySelector('[data-slot="orderbook-skeleton-row"]'))).toBe(true);

		resizeBook(360);

		const resizedAskRows = [
			...getLadder("asks").querySelectorAll<HTMLElement>('[data-slot="compact-orderbook-row-position"]'),
		];
		const resizedBidRows = [
			...getLadder("bids").querySelectorAll<HTMLElement>('[data-slot="compact-orderbook-row-position"]'),
		];
		expect(resizedAskRows.map((row) => row.dataset.rank)).toEqual(["5", "4", "3", "2", "1", "0"]);
		expect(resizedBidRows.map((row) => row.dataset.rank)).toEqual(["0", "1", "2", "3", "4", "5"]);
		for (const rank of ["0", "1", "2", "3", "4"]) {
			expect(resizedAskRows.find((row) => row.dataset.rank === rank)).toBe(initialAskRowsByRank.get(rank));
			expect(resizedBidRows.find((row) => row.dataset.rank === rank)).toBe(initialBidRowsByRank.get(rank));
		}
	});

	it("anchors rank-positioned rows toward the midpoint", () => {
		const asks = getLadder("asks");
		const bids = getLadder("bids");
		const askRows = [...asks.querySelectorAll<HTMLElement>('[data-slot="compact-orderbook-row-position"]')];
		const bidRows = [...bids.querySelectorAll<HTMLElement>('[data-slot="compact-orderbook-row-position"]')];

		expect(asks.className).toContain("relative");
		expect(bids.className).toContain("relative");
		expect(askRows.map((row) => row.style.transform)).toEqual([
			"translateY(-112px)",
			"translateY(-84px)",
			"translateY(-56px)",
			"translateY(-28px)",
			"translateY(0px)",
		]);
		expect(bidRows.map((row) => row.style.transform)).toEqual([
			"translateY(0px)",
			"translateY(28px)",
			"translateY(56px)",
			"translateY(84px)",
			"translateY(112px)",
		]);
	});

	it("resizes complete rows while preserving price identity and selection", () => {
		const ask = getLadder("asks").querySelector<HTMLButtonElement>("button");
		const position = ask?.parentElement;
		expect(position?.style.height).toBe("24px");
		resizeBook(359);
		expect(getLadder("asks").querySelector("button")).toBe(ask);
		expect(position?.style.height).toBe("29.5px");
		expect(position?.style.transform).toBe("translateY(-134px)");
		expect(ask?.disabled).toBe(false);
		act(() => ask?.click());
		expect(getOrderbookActionsStore().selectedPrice).toEqual({ marketName: "HYPE", price: "105" });
		resizeBook(359.5);
		expect(getLadder("asks").querySelector("button")).toBe(ask);
		expect(position?.style.height).toBe("29.55px");
		resizeBook(360);
		expect([...getLadder("asks").querySelectorAll("button")]).toContain(ask);
		expect(position?.style.height).toBe("24px");
		expect(getLadder("asks").querySelectorAll("button:disabled")).toHaveLength(0);
	});

	it("fills single-side modes beyond the feed depth with complete placeholders", () => {
		resizeBook(700);
		expect(getLadder("asks").children).toHaveLength(12);
		act(() => container.querySelector<HTMLButtonElement>('button[data-mode="asks"]')?.click());
		expect(getLadder("asks").children).toHaveLength(25);
		expect(getLadder("asks").querySelectorAll('[data-slot="orderbook-placeholder-row"]')).toHaveLength(5);
		expect(getLadder("asks").querySelectorAll("button:disabled")).toHaveLength(0);
		resizeBook(331.5);
		expect(getLadder("asks").children).toHaveLength(11);
		expect(getLadder("asks").querySelectorAll("button:disabled")).toHaveLength(0);
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

		act(() => root.render(<CompactOrderbookHarness asks={[]} bids={[]} hasSnapshot={false} isInteractive={false} />));

		const alert = container.querySelector<HTMLElement>('[role="alert"]');
		const currentFieldset = container.querySelector("fieldset");
		expect(container.firstElementChild?.className).toContain("font-market-close");
		expect(currentFieldset).toBe(initialFieldset);
		expect(alert).toBeNull();
		expect(container.querySelector('[data-slot="compact-orderbook-row-position"]')).not.toBeNull();
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
		const askChildren = [
			...getLadder("asks").querySelectorAll<HTMLElement>('[data-slot="compact-orderbook-row-position"]'),
		];
		const bidChildren = [
			...getLadder("bids").querySelectorAll<HTMLElement>('[data-slot="compact-orderbook-row-position"]'),
		];

		expect(askChildren).toHaveLength(5);
		expect(askChildren.slice(0, 3).every((row) => row.firstElementChild?.getAttribute("aria-hidden") === "true")).toBe(
			true,
		);
		expect(askChildren.map((row) => [row.dataset.rank, row.style.transform])).toEqual([
			["4", "translateY(-112px)"],
			["3", "translateY(-84px)"],
			["2", "translateY(-56px)"],
			["1", "translateY(-28px)"],
			["0", "translateY(0px)"],
		]);
		expect(askChildren.at(-1)?.querySelector("button")?.getAttribute("aria-label")).toContain("Ask, Price 101.0,");
		expect(bidChildren).toHaveLength(5);
		expect(bidChildren[0]?.querySelector("button")?.getAttribute("aria-label")).toContain("Bid, Price 99.0,");
		expect(bidChildren.slice(2).every((row) => row.firstElementChild?.getAttribute("aria-hidden") === "true")).toBe(
			true,
		);
		expect(bidChildren.map((row) => [row.dataset.rank, row.style.transform])).toEqual([
			["0", "translateY(0px)"],
			["1", "translateY(28px)"],
			["2", "translateY(56px)"],
			["3", "translateY(84px)"],
			["4", "translateY(112px)"],
		]);
	});

	it("moves price-keyed rows by one compact stride without losing focus, flash, or click intent", () => {
		const askPosition = container.querySelector<HTMLElement>('[data-side="ask"][data-price="101"]');
		const bidPosition = container.querySelector<HTMLElement>('[data-side="bid"][data-price="99"]');
		const askRow = askPosition?.querySelector<HTMLButtonElement>("button");
		const bidRow = bidPosition?.querySelector<HTMLButtonElement>("button");
		expect(askPosition?.style.transform).toBe("translateY(0px)");
		expect(bidPosition?.style.transform).toBe("translateY(0px)");
		act(() => askRow?.focus());

		act(() => {
			root.render(
				<CompactOrderbookHarness
					asks={[
						{ price: "100.5", quoteSize: "100.5", quoteTotal: "100.5", size: "1", total: "1" },
						{ price: "101", quoteSize: "126.25", quoteTotal: "226.75", size: "1.25", total: "2.25" },
						ASKS[1],
					]}
					bids={[{ price: "99.5", quoteSize: "99.5", quoteTotal: "99.5", size: "1", total: "1" }, BIDS[0], BIDS[1]]}
				/>,
			);
		});

		expect(container.querySelector('[data-side="ask"][data-price="101"]')).toBe(askPosition);
		expect(container.querySelector('[data-side="bid"][data-price="99"]')).toBe(bidPosition);
		expect(askPosition?.querySelector("button")).toBe(askRow);
		expect(bidPosition?.querySelector("button")).toBe(bidRow);
		expect(askPosition?.style.transform).toBe("translateY(-28px)");
		expect(bidPosition?.style.transform).toBe("translateY(28px)");
		expect(document.activeElement).toBe(askRow);
		expect(askRow?.querySelector('[data-slot="orderbook-size-value"]')?.getAttribute("data-direction")).toBe("up");

		act(() => askRow?.click());
		expect(getOrderbookActionsStore().selectedPrice).toEqual({ marketName: "HYPE", price: "101" });
		expect(
			[...container.querySelectorAll<HTMLElement>('[data-side="ask"][data-price]')].map((row) => row.dataset.price),
		).toEqual(["102", "101", "100.5"]);
		expect(
			[...container.querySelectorAll<HTMLElement>('[data-side="bid"][data-price]')].map((row) => row.dataset.price),
		).toEqual(["99.5", "99", "98"]);
	});

	it("observes only the shared fieldset and disconnects on unmount", () => {
		expect(observedElement?.tagName).toBe("FIELDSET");
		expect(disconnectCallCount).toBe(0);

		act(() => root.unmount());
		expect(disconnectCallCount).toBe(1);
		root = createI18nRoot(container);
	});
});
