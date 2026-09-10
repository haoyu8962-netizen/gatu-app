// @vitest-environment jsdom

import { act, StrictMode, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type OrderbookHoverController, useOrderbookHover } from "@/hooks/trade/use-orderbook-hover";
import { type BookLevel, processLevels } from "@/lib/trade/orderbook";

const BIDS = processLevels([
	{ px: "100", sz: "1" },
	{ px: "99", sz: "2" },
	{ px: "98", sz: "3" },
]);
const ASKS = processLevels([
	{ px: "101", sz: "1" },
	{ px: "102", sz: "2" },
	{ px: "103", sz: "3" },
]);
let controller: OrderbookHoverController;
const onPriceSelected = vi.fn();

interface ProbeProps {
	identity?: string;
	viewKey?: string;
	enabled?: boolean;
	bids?: BookLevel[];
	asks?: BookLevel[];
	disabledRank?: number;
}

function Probe({
	identity = "mainnet:HYPE:full:l2",
	viewKey = "desktop:3:20",
	enabled = true,
	bids = BIDS,
	asks = ASKS,
	disabledRank,
}: ProbeProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	controller = useOrderbookHover({ identity, viewKey, enabled, bids, asks, rootRef });
	function rows(side: "ask" | "bid", levels: BookLevel[]) {
		return levels.map((level, rank) => (
			<button
				key={level.price}
				type="button"
				data-orderbook-side={side}
				data-orderbook-rank={rank}
				data-orderbook-price={level.price}
				disabled={!enabled || rank === disabledRank}
				onClick={() => onPriceSelected(level.price)}
			>
				{level.price}
			</button>
		));
	}
	return (
		<div ref={rootRef} {...controller.containerProps}>
			<div data-slot="header">Header</div>
			<div data-orderbook-side-container="ask">{rows("ask", asks).reverse()}</div>
			<div data-slot="spread">Spread</div>
			<div data-orderbook-side-container="bid">
				{rows("bid", bids)}
				<span data-slot="placeholder" />
			</div>
		</div>
	);
}

describe("useOrderbookHover", () => {
	let container: HTMLDivElement;
	let root: Root | null;
	beforeEach(() => {
		Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
		vi.useFakeTimers();
		onPriceSelected.mockClear();
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
			const rank = Number(this.dataset.orderbookRank);
			const top = this.dataset.orderbookSide === "ask" ? 60 - rank * 22 : 100 + rank * 22;
			return new DOMRect(0, top, 200, 20);
		});
	});
	afterEach(() => {
		act(() => root?.unmount());
		container.remove();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});
	function render(props: ProbeProps = {}, strict = false) {
		act(() =>
			root?.render(
				strict ? (
					<StrictMode>
						<Probe {...props} />
					</StrictMode>
				) : (
					<Probe {...props} />
				),
			),
		);
	}
	function row(side: "ask" | "bid", rank: number) {
		const element = container.querySelector<HTMLButtonElement>(
			`button[data-orderbook-side="${side}"][data-orderbook-rank="${rank}"]`,
		);
		if (!element) throw new Error("Missing order book row");
		return element;
	}
	function pointer(
		target: Element,
		type = "pointermove",
		properties: { pointerType?: string; clientX?: number; clientY?: number; buttons?: number } = {},
	) {
		const event = new MouseEvent(type, {
			bubbles: true,
			cancelable: true,
			button: 0,
			buttons: properties.buttons ?? 0,
			clientX: properties.clientX ?? 10,
			clientY: properties.clientY ?? 110,
		});
		Object.defineProperties(event, {
			pointerType: { value: properties.pointerType ?? "mouse" },
			pointerId: { value: 1 },
			isPrimary: { value: true },
		});
		act(() => target.dispatchEvent(event));
	}
	function click(target: Element) {
		act(() => target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })));
	}
	function advance(milliseconds: number) {
		act(() => vi.advanceTimersByTime(milliseconds));
	}

	it("tracks the current rank through live insertion without changing price keys", () => {
		render();
		const oldPriceRow = row("bid", 1);
		pointer(oldPriceRow);
		expect(controller.activeLevel?.price).toBe("99");
		expect(controller.getHoverState("bid", 0)).toBe("range");
		expect(controller.getHoverState("bid", 1)).toBe("active");
		expect(controller.getHoverState("ask", 0)).toBeUndefined();
		expect(controller.getHoverState("bid", 2)).toBeUndefined();

		const bids = processLevels([
			{ px: "100.5", sz: "4" },
			{ px: "100", sz: "5" },
			{ px: "99", sz: "6" },
		]);
		render({ bids });
		expect(row("bid", 2)).toBe(oldPriceRow);
		expect(controller.hoveredRank).toBe(1);
		expect(controller.activeLevel).toEqual(bids[1]);
		expect(controller.activeLevel?.total).toBe("9");
		expect(controller.anchor.getBoundingClientRect().top).toBe(122);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("uses best-first ask ranks despite reversed DOM order", () => {
		render();
		pointer(row("ask", 1));
		expect(controller.activeLevel?.price).toBe("102");
		expect(controller.getHoverState("ask", 0)).toBe("range");
		expect(controller.getHoverState("ask", 2)).toBeUndefined();
		expect(controller.anchor.getBoundingClientRect().top).toBe(38);
	});

	it("updates the virtual anchor only when the active side or slot changes", () => {
		render();
		pointer(row("bid", 0));
		const anchor = controller.anchor;
		render({
			bids: processLevels([
				{ px: "100", sz: "7" },
				{ px: "99", sz: "2" },
			]),
		});
		expect(controller.anchor).toBe(anchor);
		pointer(row("bid", 1));
		expect(controller.anchor).not.toBe(anchor);
		expect(controller.anchor.getBoundingClientRect().top).toBe(122);
	});

	it.each(["identity", "viewKey", "enabled"] as const)(
		"closes across %s boundaries without resurrecting the old slot",
		(field) => {
			render();
			pointer(row("bid", 1));
			render(field === "enabled" ? { enabled: false } : { [field]: "changed" });
			expect(controller.activeLevel).toBeNull();
			render();
			expect(controller.activeLevel).toBeNull();
		},
	);

	it("does not resurrect a rank removed by a shallower snapshot", () => {
		render();
		pointer(row("bid", 2));
		render({ bids: BIDS.slice(0, 2) });
		expect(controller.activeLevel).toBeNull();
		render();
		expect(controller.activeLevel).toBeNull();
	});

	it("retains only an internal gap on the current ladder and clears chrome, placeholders and disabled rows", () => {
		render({ disabledRank: 2 });
		pointer(row("bid", 0));
		const ladder = container.querySelector('[data-orderbook-side-container="bid"]');
		if (!ladder) throw new Error("Missing ladder");
		pointer(ladder, "pointermove", { clientY: 121 });
		expect(controller.hoveredRank).toBe(0);
		pointer(ladder, "pointermove", { clientY: 180 });
		expect(controller.activeLevel).toBeNull();
		for (const target of [
			row("bid", 2),
			container.querySelector('[data-slot="header"]'),
			container.querySelector('[data-slot="spread"]'),
			container.querySelector('[data-slot="placeholder"]'),
		]) {
			if (!target) throw new Error("Missing test target");
			pointer(row("bid", 0));
			pointer(target);
			expect(controller.activeLevel).toBeNull();
		}
	});

	it("preserves keyboard price identity as its rank changes, then closes when the price disappears", () => {
		render();
		act(() => row("bid", 1).focus());
		expect(controller.activeLevel?.price).toBe("99");
		const bids = processLevels([
			{ px: "100.5", sz: "1" },
			{ px: "100", sz: "1" },
			{ px: "99", sz: "1" },
		]);
		render({ bids });
		expect(controller.hoveredRank).toBe(2);
		expect(controller.activeLevel?.price).toBe("99");
		render({ bids: bids.slice(0, 2) });
		expect(controller.activeLevel).toBeNull();
		render();
		expect(controller.activeLevel).toBeNull();
	});

	it("closes on Escape and window blur without preventing ordinary price clicks", () => {
		render();
		const target = row("bid", 1);
		pointer(target);
		act(() => target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
		expect(controller.activeLevel).toBeNull();
		pointer(target);
		act(() => window.dispatchEvent(new Event("blur")));
		expect(controller.activeLevel).toBeNull();
		pointer(target, "pointerdown");
		pointer(target, "pointerup");
		click(target);
		expect(onPriceSelected).toHaveBeenCalledWith("99");
	});

	it("closes on a width-only window resize even when the book geometry key remains unchanged", () => {
		render();
		pointer(row("bid", 1));
		const originalHeight = window.innerHeight;
		const originalWidth = window.innerWidth;
		vi.spyOn(window, "innerWidth", "get").mockReturnValue(originalWidth - 20);
		act(() => window.dispatchEvent(new Event("resize")));
		expect(window.innerHeight).toBe(originalHeight);
		expect(controller.activeLevel).toBeNull();
		render();
		expect(controller.activeLevel).toBeNull();
	});

	it.each(["document", "ancestor"] as const)(
		"closes on captured %s scroll without waiting for pointer movement",
		(target) => {
			render();
			pointer(row("bid", 1));
			act(() => (target === "document" ? document : container).dispatchEvent(new Event("scroll")));
			expect(controller.activeLevel).toBeNull();
			render();
			expect(controller.activeLevel).toBeNull();
		},
	);

	it.each(["resize", "scroll"] as const)("cancels a pending long press on %s", (type) => {
		render();
		pointer(row("bid", 1), "pointerdown", { pointerType: "touch" });
		advance(449);
		act(() => window.dispatchEvent(new Event(type)));
		advance(1);
		expect(controller.activeLevel).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("opens a touch hold after 450ms, suppresses its click, and dismisses after 2500ms", () => {
		render();
		const target = row("bid", 1);
		pointer(target, "pointerdown", { pointerType: "touch" });
		advance(449);
		expect(controller.activeLevel).toBeNull();
		advance(1);
		expect(controller.activeLevel?.price).toBe("99");
		pointer(target, "pointerup", { pointerType: "touch" });
		click(target);
		expect(onPriceSelected).not.toHaveBeenCalled();
		advance(2499);
		expect(controller.activeLevel?.price).toBe("99");
		advance(1);
		expect(controller.activeLevel).toBeNull();
		pointer(target, "pointerdown");
		pointer(target, "pointerup");
		click(target);
		expect(onPriceSelected).toHaveBeenCalledOnce();
	});

	it("follows the touched price when live ranks change before and after the long press", () => {
		render();
		const target = row("bid", 1);
		pointer(target, "pointerdown", { pointerType: "touch" });
		advance(449);
		const bids = processLevels([
			{ px: "100.5", sz: "1" },
			{ px: "100", sz: "1" },
			{ px: "99", sz: "3" },
		]);
		render({ bids });
		advance(1);
		expect(controller.activeLevel?.price).toBe("99");
		expect(controller.hoveredRank).toBe(2);
		render();
		expect(controller.activeLevel?.price).toBe("99");
		expect(controller.hoveredRank).toBe(1);
		pointer(target, "pointerup", { pointerType: "touch" });
		click(target);
		expect(onPriceSelected).not.toHaveBeenCalled();
	});

	it("closes an earlier touch tooltip before a new ordinary tap", () => {
		render();
		pointer(row("bid", 0), "pointerdown", { pointerType: "touch" });
		advance(450);
		pointer(row("bid", 0), "pointerup", { pointerType: "touch" });
		click(row("bid", 0));
		expect(controller.activeLevel?.price).toBe("100");
		pointer(row("bid", 1), "pointerdown", { pointerType: "touch" });
		expect(controller.activeLevel).toBeNull();
		pointer(row("bid", 1), "pointerup", { pointerType: "touch" });
		click(row("bid", 1));
		expect(onPriceSelected).toHaveBeenCalledWith("99");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("can long press the same price again while its previous tooltip is open", () => {
		render();
		const target = row("bid", 0);
		for (let press = 0; press < 2; press += 1) {
			pointer(target, "pointerdown", { pointerType: "touch" });
			expect(controller.activeLevel).toBeNull();
			advance(450);
			expect(controller.activeLevel?.price).toBe("100");
			pointer(target, "pointerup", { pointerType: "touch" });
			click(target);
		}
		expect(onPriceSelected).not.toHaveBeenCalled();
	});

	it("still suppresses a completed long press click after the same price row changes feed identity", () => {
		render();
		const target = row("bid", 0);
		pointer(target, "pointerdown", { pointerType: "touch" });
		advance(450);
		expect(controller.activeLevel?.price).toBe("100");
		render({ identity: "mainnet:HYPE:full:l2Book-fast" });
		expect(row("bid", 0)).toBe(target);
		expect(controller.activeLevel).toBeNull();
		pointer(target, "pointerup", { pointerType: "touch" });
		click(target);
		expect(onPriceSelected).not.toHaveBeenCalled();
		pointer(target, "pointerdown");
		pointer(target, "pointerup");
		click(target);
		expect(onPriceSelected).toHaveBeenCalledOnce();
	});

	it("closes when the document is hidden and rejects activation until it is visible again", () => {
		render();
		pointer(row("bid", 1));
		const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
		act(() => document.dispatchEvent(new Event("visibilitychange")));
		expect(controller.activeLevel).toBeNull();
		pointer(row("bid", 1));
		pointer(row("bid", 1), "pointerdown", { pointerType: "touch" });
		advance(450);
		expect(controller.activeLevel).toBeNull();
		visibility.mockReturnValue("visible");
		act(() => document.dispatchEvent(new Event("visibilitychange")));
		expect(controller.activeLevel).toBeNull();
		pointer(row("bid", 1));
		expect(controller.activeLevel?.price).toBe("99");
	});

	it.each(["move", "release", "cancel", "scope"] as const)("cancels pending long press on %s", (reason) => {
		render();
		const target = row("bid", 1);
		pointer(target, "pointerdown", { pointerType: "touch" });
		advance(300);
		if (reason === "move") pointer(target, "pointermove", { pointerType: "touch", clientX: 19 });
		if (reason === "release") pointer(target, "pointerup", { pointerType: "touch" });
		if (reason === "cancel") pointer(target, "pointercancel", { pointerType: "touch" });
		if (reason === "scope") render({ identity: "different-market" });
		advance(150);
		expect(controller.activeLevel).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("does not reopen a removed touch target and cleans pending timers on StrictMode unmount", () => {
		render({}, true);
		pointer(row("bid", 2), "pointerdown", { pointerType: "touch" });
		render({ bids: BIDS.slice(0, 2) }, true);
		advance(450);
		expect(controller.activeLevel).toBeNull();
		pointer(row("bid", 0), "pointerdown", { pointerType: "touch" });
		expect(vi.getTimerCount()).toBe(1);
		act(() => root?.unmount());
		root = null;
		expect(vi.getTimerCount()).toBe(0);
	});
});
