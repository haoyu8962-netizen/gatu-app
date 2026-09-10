// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SplitOrderbookRow } from "@/components/trade/mobile/mobile-book-view";
import { OrderbookRow } from "@/components/trade/orderbook/orderbook-row";
import { getOrderbookActionsStore, getSelectedPriceForMarket } from "@/stores/use-orderbook-actions-store";
import { createI18nRoot } from "./harness/react";

const LEVEL = {
	price: "58.625",
	size: "125.5",
	total: "310.25",
	quoteSize: "7357.4375",
	quoteTotal: "18192.78125",
};

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
					marketName="HYPE"
					side="ask"
					maxTotal="500"
					priceDecimals={3}
					szDecimals={2}
				/>,
			);
		});

		const size = container.querySelector('[data-slot="orderbook-size-value"]');
		if (!(size instanceof HTMLElement)) throw new Error("Missing size cell");
		act(() => size.click());

		expect(getOrderbookActionsStore().selectedPrice).toEqual({ marketName: "HYPE", price: "58.625" });
		expect(container.querySelectorAll("button")).toHaveLength(1);
		expect(container.querySelector("button")?.getAttribute("aria-label")).toContain("limit price");
		expect(container.querySelector("button")?.className).toContain("focus-visible:outline-2");
	});

	it("renders exact quote totals and keeps non-zero sub-cent values visible", () => {
		act(() => {
			root.render(
				<OrderbookRow
					flashResetKey="MICRO:full"
					level={{
						price: "0.0001",
						size: "0.01",
						total: "0.01",
						quoteSize: "0.000001",
						quoteTotal: "0.000001",
					}}
					marketName="MICRO"
					side="ask"
					maxTotal="0.01"
					priceDecimals={4}
					showInQuote
					szDecimals={2}
				/>,
			);
		});

		const size = container.querySelector('[data-slot="orderbook-size-value"]');
		expect(size?.textContent).toBe("0.000001");
		expect(size?.textContent).not.toBe("0.00");
	});

	it("updates a memoized row when only its exact quote cumulative total changes", () => {
		const initialLevel = { ...LEVEL, quoteTotal: "98.25" };
		act(() => {
			root.render(
				<OrderbookRow
					flashResetKey="HYPE:full"
					level={initialLevel}
					marketName="HYPE"
					side="ask"
					maxTotal="500"
					priceDecimals={3}
					showInQuote
					szDecimals={2}
				/>,
			);
		});
		expect(container.querySelectorAll(".orderbook-value-text")[1]?.textContent).toBe("98.25");

		act(() => {
			root.render(
				<OrderbookRow
					flashResetKey="HYPE:full"
					level={{ ...initialLevel, quoteTotal: "99.25" }}
					marketName="HYPE"
					side="ask"
					maxTotal="500"
					priceDecimals={3}
					showInQuote
					szDecimals={2}
				/>,
			);
		});

		expect(container.querySelectorAll(".orderbook-value-text")[1]?.textContent).toBe("99.25");
	});

	it("does not select a price while the snapshot is disabled", () => {
		act(() => {
			root.render(
				<OrderbookRow
					disabled
					flashResetKey="HYPE:full"
					level={LEVEL}
					marketName="HYPE"
					side="bid"
					maxTotal="500"
					priceDecimals={3}
					szDecimals={2}
				/>,
			);
		});

		const row = container.querySelector("button");
		if (!(row instanceof HTMLButtonElement)) throw new Error("Missing orderbook row");
		act(() => row.click());

		expect(row.disabled).toBe(true);
		expect(getOrderbookActionsStore().selectedPrice).toBeNull();
	});

	it("selects the mobile split price from either side of the complete row", () => {
		act(() => {
			root.render(
				<SplitOrderbookRow
					level={LEVEL}
					marketName="HYPE"
					side="bid"
					maxTotal="500"
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

		expect(getOrderbookActionsStore().selectedPrice).toEqual({ marketName: "HYPE", price: "58.625" });
		expect(container.querySelectorAll("button")).toHaveLength(1);
		expect(row.getAttribute("aria-label")).toContain("limit price");
		expect(row.className).toContain("focus-visible:outline-2");
	});

	it("only exposes a selected price to the matching market", () => {
		const selection = { marketName: "HYPE", price: "58.625" };

		expect(getSelectedPriceForMarket(selection, "HYPE")).toBe("58.625");
		expect(getSelectedPriceForMarket(selection, "BTC")).toBeNull();
		expect(getSelectedPriceForMarket(selection, undefined)).toBeNull();
	});
});
