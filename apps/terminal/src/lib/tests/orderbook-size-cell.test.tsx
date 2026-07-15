// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrderbookSizeCell } from "@/components/trade/orderbook/orderbook-size-cell";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("OrderbookSizeCell", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function render(value: number) {
		act(() => root.render(<OrderbookSizeCell displayValue={value.toFixed(2)} value={value} />));
		return container.querySelector<HTMLElement>('[data-slot="orderbook-size-value"]');
	}

	it("does not flash when the level first appears or remains unchanged", () => {
		const initial = render(10);
		expect(initial?.classList.contains("orderbook-color-change")).toBe(false);

		const unchanged = render(10);
		expect(unchanged).toBe(initial);
	});

	it("restarts a green flash when size increases", () => {
		const initial = render(10);
		const increased = render(11);

		expect(increased).not.toBe(initial);
		expect(increased?.classList.contains("orderbook-color-change")).toBe(true);
		expect(increased?.dataset.direction).toBe("up");
	});

	it("restarts a red flash when size decreases", () => {
		render(10);
		const firstDecrease = render(9);
		const secondDecrease = render(8);

		expect(firstDecrease?.dataset.direction).toBe("down");
		expect(secondDecrease?.dataset.direction).toBe("down");
		expect(secondDecrease).not.toBe(firstDecrease);
	});
});
