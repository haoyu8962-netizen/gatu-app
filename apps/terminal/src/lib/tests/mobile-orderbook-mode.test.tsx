// @vitest-environment jsdom

import { act, useRef, useState } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CompactOrderbook, type CompactOrderbookMode } from "@/components/trade/mobile/mobile-book-view";
import { createI18nRoot } from "./harness/react";

const ASKS = [
	{ price: 101, size: 1, total: 1 },
	{ price: 102, size: 2, total: 3 },
];
const BIDS = [
	{ price: 99, size: 1.5, total: 1.5 },
	{ price: 98, size: 2.5, total: 4 },
];

function CompactOrderbookHarness() {
	const [mode, setMode] = useState<CompactOrderbookMode>("both");
	const askLadderRef = useRef<HTMLDivElement>(null);
	const bidLadderRef = useRef<HTMLDivElement>(null);

	return (
		<CompactOrderbook
			asks={ASKS}
			bids={BIDS}
			askLevelCount={2}
			bidLevelCount={2}
			askLadderRef={askLadderRef}
			bidLadderRef={bidLadderRef}
			bookStatus="open"
			flashResetKey="HYPE:0.1"
			isTransitioning={false}
			priceDecimals={1}
			showOrderbookInQuote={false}
			szDecimals={2}
			mid={100}
			midDirection="up"
			spreadText="2.0 (2.000%)"
			selectedOptionLabel="0.1"
			priceGroupingOptions={[]}
			setSelectedOptionKey={() => undefined}
			mode={mode}
			onModeChange={setMode}
			priceToken="USDC"
			sizeToken="HYPE"
		/>
	);
}

describe("compact mobile orderbook modes", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(<CompactOrderbookHarness />));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("switches between both, asks-only, and bids-only without remounting a subscription surface", () => {
		const asks = container.querySelector<HTMLElement>('[data-slot="compact-orderbook-asks"]');
		const bids = container.querySelector<HTMLElement>('[data-slot="compact-orderbook-bids"]');
		const bothButton = container.querySelector<HTMLButtonElement>('[aria-label="Show both sides"]');
		const asksButton = container.querySelector<HTMLButtonElement>('[aria-label="Show asks only"]');
		const bidsButton = container.querySelector<HTMLButtonElement>('[aria-label="Show bids only"]');

		expect(asks?.classList.contains("hidden")).toBe(false);
		expect(bids?.classList.contains("hidden")).toBe(false);
		expect(bothButton?.getAttribute("aria-pressed")).toBe("true");
		expect(container.querySelector('[data-slot="compact-orderbook-mid"]')).not.toBeNull();

		act(() => asksButton?.click());
		expect(asks?.classList.contains("hidden")).toBe(false);
		expect(bids?.classList.contains("hidden")).toBe(true);
		expect(asksButton?.getAttribute("aria-pressed")).toBe("true");
		expect(container.querySelector('[data-slot="compact-orderbook-mid"]')).toBeNull();
		expect(asks?.querySelector<HTMLElement>(".depth-bar-ask")?.style.width).toBe("100%");
		expect(asks?.querySelector<HTMLElement>(".depth-bar-ask")?.style.backgroundColor).toBe(
			"var(--orderbook-compact-depth-ask)",
		);

		act(() => bidsButton?.click());
		expect(asks?.classList.contains("hidden")).toBe(true);
		expect(bids?.classList.contains("hidden")).toBe(false);
		expect(bidsButton?.getAttribute("aria-pressed")).toBe("true");
	});

	it("uses directional mid-price color and a neutral spread treatment", () => {
		const mid = container.querySelector<HTMLElement>('[data-slot="compact-orderbook-mid"]');
		const midValue = mid?.querySelector("span");
		const spread = container.querySelector<HTMLElement>('[data-slot="compact-orderbook-spread"]');

		expect(mid?.className).toContain("justify-start");
		expect(mid?.getAttribute("data-direction")).toBe("up");
		expect(midValue?.className).toContain("text-trading-panel-success");
		expect(midValue?.className).not.toContain("text-warning");
		expect(spread?.className).toContain("sr-only");
		expect(spread?.className).not.toContain("text-warning");
		expect(mid?.title).toContain("2.0 (2.000%)");
		expect(container.textContent).toContain("Price USDC");
		expect(container.textContent).toContain("Size HYPE");
		expect(container.querySelector('[data-slot="compact-orderbook-price-token"]')?.className).toContain(
			"max-[339px]:hidden",
		);
		expect(container.querySelector('[data-slot="compact-orderbook-size-token"]')?.className).toContain(
			"max-[339px]:hidden",
		);
		expect(container.querySelector('[aria-label="Price precision"]')?.className).toContain("min-h-6");
		expect(container.querySelector('[aria-label="Show both sides"]')?.className).toContain("size-6");
	});
});
