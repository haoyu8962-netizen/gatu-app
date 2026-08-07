// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SplitOrderbookRow } from "@/components/trade/mobile/mobile-book-view";
import { OrderbookRow } from "@/components/trade/orderbook/orderbook-row";
import { getOrderbookActionsStore } from "@/stores/use-orderbook-actions-store";
import { createI18nRoot } from "./harness/react";

const LEVEL = { price: 58.625, size: 125.5, total: 310.25 };

describe("orderbook price selection", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		getOrderbookActionsStore().actions.clearSelectedPrice();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		getOrderbookActionsStore().actions.clearSelectedPrice();
	});

	it("selects the desktop price when the size or depth area is clicked", () => {
		act(() => {
			root.render(
				<OrderbookRow
					flashResetKey="HYPE:0.01"
					level={LEVEL}
					side="ask"
					maxTotal={500}
					priceDecimals={3}
					szDecimals={2}
				/>,
			);
		});

		const size = container.querySelector('[data-slot="orderbook-size-value"]');
		if (!(size instanceof HTMLElement)) throw new Error("Missing size cell");
		act(() => size.click());

		expect(getOrderbookActionsStore().selectedPrice).toBe(LEVEL.price);
		expect(container.querySelectorAll("button")).toHaveLength(1);
		expect(container.querySelector("button")?.getAttribute("aria-label")).toContain("limit price");
		expect(container.querySelector("button")?.className).toContain("focus-visible:outline-2");
	});

	it("selects the mobile split price from either side of the complete row", () => {
		act(() => {
			root.render(
				<SplitOrderbookRow
					level={LEVEL}
					side="bid"
					maxTotal={500}
					priceDecimals={3}
					showInQuote={false}
					szDecimals={2}
				/>,
			);
		});

		const row = container.querySelector("button");
		if (!(row instanceof HTMLButtonElement)) throw new Error("Missing split orderbook row");
		const totalCell = row.querySelector("span span");
		if (!(totalCell instanceof HTMLElement)) throw new Error("Missing total cell");
		act(() => totalCell.click());

		expect(getOrderbookActionsStore().selectedPrice).toBe(LEVEL.price);
		expect(container.querySelectorAll("button")).toHaveLength(1);
		expect(row.getAttribute("aria-label")).toContain("limit price");
		expect(row.className).toContain("focus-visible:outline-2");
	});
});
