// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderbookRow } from "@/components/trade/orderbook/orderbook-row";
import { getOrderbookActionsStore } from "@/stores/use-orderbook-actions-store";
import { createI18nRoot } from "./harness/react";

const LEVEL = {
	price: "58.625",
	quoteSize: "7357.4375",
	quoteTotal: "18192.78125",
	size: "125.5",
	total: "310.25",
};

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function createTouchEvent(type: string): MouseEvent {
	const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: 12, clientY: 8 });
	Object.defineProperties(event, {
		isPrimary: { value: true },
		pointerId: { value: 1 },
		pointerType: { value: "touch" },
	});
	return event;
}

describe("compact orderbook cumulative tooltip", () => {
	let container: HTMLDivElement;
	let root: Root;
	function renderRow(side: "ask" | "bid", compact = true) {
		act(() => {
			root.render(
				<OrderbookRow
					baseAsset="HYPE"
					compact={compact}
					flashResetKey="HYPE:full"
					level={LEVEL}
					marketName="HYPE"
					maxTotal="500"
					priceDecimals={3}
					quoteAsset="USDC"
					side={side}
					szDecimals={2}
				/>,
			);
		});
	}

	beforeEach(() => {
		vi.useFakeTimers();
		getOrderbookActionsStore().actions.clearSelectedPrice();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		renderRow("ask");
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		document.querySelectorAll("[data-base-ui-portal]").forEach((portal) => {
			portal.remove();
		});
		getOrderbookActionsStore().actions.clearSelectedPrice();
		vi.useRealTimers();
	});

	it("shows both cumulative units on touch hold without selecting the price", () => {
		const row = container.querySelector("button");
		if (!(row instanceof HTMLButtonElement)) throw new Error("Missing compact orderbook row");

		act(() => {
			row.dispatchEvent(createTouchEvent("pointerdown"));
			vi.advanceTimersByTime(450);
		});

		const tooltip = document.body.querySelector('[data-slot="orderbook-cumulative-tooltip"]');
		expect(tooltip?.textContent).toContain("Total (HYPE):");
		expect(tooltip?.textContent).toContain("Total notional (USDC):");

		act(() => {
			row.dispatchEvent(createTouchEvent("pointerup"));
			row.click();
		});
		expect(getOrderbookActionsStore().selectedPrice).toBeNull();
	});

	it("uses shared order book price colors for compact and standard rows", () => {
		for (const compact of [true, false]) {
			renderRow("ask", compact);
			const askPrice = container.querySelector(".orderbook-price-ask");
			expect(askPrice).not.toBeNull();
			expect(askPrice?.getAttribute("data-slot")).toBe("orderbook-price-text");
			expect(askPrice?.classList.contains("bg-surface")).toBe(true);
			expect(askPrice?.classList.contains("text-trading-panel-error")).toBe(false);

			renderRow("bid", compact);
			const bidPrice = container.querySelector(".orderbook-price-bid");
			expect(bidPrice).not.toBeNull();
			expect(bidPrice?.classList.contains("text-trading-panel-success")).toBe(false);
		}
	});
});
