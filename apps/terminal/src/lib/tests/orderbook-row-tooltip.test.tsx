// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { act, useRef, useSyncExternalStore } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderbookHoverTooltip } from "@/components/trade/orderbook/orderbook-hover-tooltip";
import { OrderbookRow } from "@/components/trade/orderbook/orderbook-row";
import { useOrderbookHover } from "@/hooks/trade/use-orderbook-hover";
import { getOrderbookActionsStore } from "@/stores/use-orderbook-actions-store";
import { createI18nRoot } from "./harness/react";

const reference = vi.hoisted(() => ({
	midPx: "58.6" as string | null,
	markPriceStatus: "success",
	markPx: "58.5",
	revision: 0,
	listeners: new Set<() => void>(),
}));
vi.mock("@/lib/hyperliquid", () => ({
	useMarketsInfo: () => {
		useSyncExternalStore(
			(listener) => {
				reference.listeners.add(listener);
				return () => reference.listeners.delete(listener);
			},
			() => reference.revision,
		);
		return {
			getMarketByName: () => ({
				...reference,
				kind: "perp",
				markPriceReceivedAt: Date.now(),
				midPriceReceivedAt: Date.now(),
			}),
		};
	},
}));

function notifyReference() {
	act(() => {
		reference.revision += 1;
		for (const listener of reference.listeners) listener();
	});
}

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

function Scene({ side, compact }: { side: "ask" | "bid"; compact: boolean }) {
	const ref = useRef<HTMLDivElement>(null);
	const hover = useOrderbookHover({
		identity: "HYPE:full",
		viewKey: "test",
		enabled: true,
		bids: side === "bid" ? [LEVEL] : [],
		asks: side === "ask" ? [LEVEL] : [],
		rootRef: ref,
	});
	return (
		<div ref={ref} {...hover.containerProps}>
			<div data-orderbook-side-container={side}>
				<OrderbookRow
					rank={0}
					hoverState={hover.getHoverState(side, 0)}
					tooltipId={hover.activeLevel ? hover.tooltipId : undefined}
					compact={compact}
					flashResetKey="HYPE:full"
					level={LEVEL}
					marketName="HYPE"
					maxTotal="500"
					priceDecimals={3}
					side={side}
					szDecimals={2}
				/>
			</div>
			{hover.activeLevel && (
				<OrderbookHoverTooltip
					hover={hover}
					marketName="HYPE"
					baseAsset="HYPE"
					quoteAsset="USDC"
					szDecimals={2}
					priceDecimals={3}
				/>
			)}
		</div>
	);
}

describe("compact orderbook cumulative tooltip", () => {
	let container: HTMLDivElement;
	let root: Root;
	function renderRow(side: "ask" | "bid", compact = true) {
		act(() => root.render(<Scene side={side} compact={compact} />));
	}

	beforeEach(() => {
		vi.useFakeTimers();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		reference.midPx = "58.6";
		reference.markPriceStatus = "success";
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
		expect(tooltip?.getAttribute("role")).toBe("tooltip");
		expect(tooltip?.textContent).toContain("Total (HYPE)");
		expect(tooltip?.textContent).toContain("Total (USDC)");

		act(() => {
			row.dispatchEvent(createTouchEvent("pointerup"));
			row.click();
		});
		expect(getOrderbookActionsStore().selectedPrice).toBeNull();
	});

	it("updates reference prices and locale without replacing the selected row", () => {
		const row = container.querySelector<HTMLButtonElement>("button");
		if (!row) throw new Error("Missing row");
		act(() => row.focus());
		const content = () => document.body.querySelector('[data-slot="orderbook-cumulative-tooltip"]')?.textContent;
		expect(content()).toContain("0.0427%");
		expect(content()).toContain("Average Price");
		reference.midPx = null;
		notifyReference();
		expect(content()).toContain("Distance from mid—");
		expect(content()).not.toContain("0.2137%");
		reference.markPriceStatus = "stale";
		notifyReference();
		expect(content()).toContain("Distance from mid—");
		act(() =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: Object.fromEntries(
					Object.entries({ "Distance from mid": "距中间价", "Average Price": "平均价格", Total: "合计" }).map(
						([message, translation]) => [
							createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6),
							translation,
						],
					),
				),
			}),
		);
		expect(content()).toContain("距中间价—");
		expect(content()).toContain("合计 (HYPE)");
		expect(container.querySelector("button")).toBe(row);
		expect(row.getAttribute("aria-describedby")).toBe(
			document.body.querySelector('[data-slot="orderbook-cumulative-tooltip"]')?.id,
		);
	});

	it("uses shared order book price colors for compact and standard rows", () => {
		for (const compact of [true, false]) {
			renderRow("ask", compact);
			const askPrice = container.querySelector(".orderbook-price-ask");
			expect(askPrice).not.toBeNull();
			expect(askPrice?.getAttribute("data-slot")).toBe("orderbook-price-text");
			expect(askPrice?.className).not.toMatch(/(?:^|\s|:)bg-/);
			expect(askPrice?.classList.contains("text-trading-panel-error")).toBe(false);

			renderRow("bid", compact);
			const bidPrice = container.querySelector(".orderbook-price-bid");
			expect(bidPrice).not.toBeNull();
			expect(bidPrice?.className).not.toMatch(/(?:^|\s|:)bg-/);
			expect(bidPrice?.classList.contains("text-trading-panel-success")).toBe(false);
		}
	});
});
