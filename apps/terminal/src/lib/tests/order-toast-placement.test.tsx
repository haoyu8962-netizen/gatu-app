// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, createElement, Fragment } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrderToast } from "@/components/trade/tradebox/order-toast";
import { MOBILE_BOTTOM_NAV_HEIGHT_PX } from "@/config/layout";
import { useOrderQueue, useOrderQueueActions } from "@/stores/use-order-queue-store";
import { createI18nRoot } from "./harness/react";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TRADE_COMPONENT_DIR = resolve(TEST_DIR, "../..", "components/trade");
const ORDER_TOAST_MOBILE_GAP_PX = 12;

function OrderToastHarness() {
	const orders = useOrderQueue();
	const { addOrder, removeOrder } = useOrderQueueActions();

	return createElement(
		Fragment,
		null,
		createElement(
			"button",
			{
				"data-testid": "add-order",
				onClick: () =>
					addOrder({
						market: "HYPE",
						orderType: "limit",
						price: "60",
						side: "buy",
						size: "1",
						status: "pending",
					}),
				type: "button",
			},
			"Add order",
		),
		createElement(
			"button",
			{
				"data-testid": "add-unconfirmed-order",
				onClick: () =>
					addOrder({
						error: "Review open orders and positions before retrying.",
						market: "HYPE",
						orderType: "market",
						side: "sell",
						size: "1",
						status: "unconfirmed",
					}),
				type: "button",
			},
			"Add unconfirmed order",
		),
		createElement(
			"button",
			{
				"data-testid": "add-canceled-order",
				onClick: () =>
					addOrder({
						error: "Canceled. Some orders were accepted. Review open orders before retrying.",
						market: "HYPE",
						orderType: "limit",
						side: "buy",
						size: "1",
						status: "canceled",
					}),
				type: "button",
			},
			"Add canceled order",
		),
		createElement(
			"button",
			{
				"data-testid": "clear-orders",
				onClick: () => {
					for (const order of orders) removeOrder(order.id);
				},
				type: "button",
			},
			"Clear orders",
		),
		createElement(OrderToast),
	);
}

describe("OrderToast placement", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(createElement(OrderToastHarness)));
	});

	afterEach(() => {
		const clearButton = container.querySelector<HTMLButtonElement>('[data-testid="clear-orders"]');
		if (clearButton) act(() => clearButton.click());
		act(() => root.unmount());
		container.remove();
	});

	it("portals the queue to the body with viewport-safe responsive positioning", () => {
		const addButton = container.querySelector<HTMLButtonElement>('[data-testid="add-order"]');
		if (!addButton) throw new Error("Add order button not found");
		act(() => addButton.click());

		const status = document.body.querySelector<HTMLOutputElement>('output[aria-live="polite"]');
		expect(status).not.toBeNull();
		expect(container.querySelector('output[aria-live="polite"]')).toBeNull();
		expect(status?.parentElement).toBe(document.body);
		expect(status?.getAttribute("aria-live")).toBe("polite");
		expect(status?.className).toContain("z-[var(--z-toast)]");
		expect(status?.className).toContain("left-4 right-4 w-auto");
		expect(status?.className).toContain("min-[1001px]:left-auto");
		expect(status?.className).toContain("min-[1001px]:right-6");
		expect(status?.className).toContain("min-[1001px]:w-80");
		expect(status?.className).toContain("bottom-[var(--order-toast-mobile-bottom)]");
		expect(status?.className).toContain("min-[1001px]:bottom-[calc(env(safe-area-inset-bottom)+3.5rem)]");
		expect(status?.className).toContain("bg-overlay/95");
		expect(status?.style.getPropertyValue("--order-toast-mobile-bottom")).toBe(
			`calc(env(safe-area-inset-bottom) + ${MOBILE_BOTTOM_NAV_HEIGHT_PX + ORDER_TOAST_MOBILE_GAP_PX}px)`,
		);

		const list = status?.querySelector<HTMLDivElement>("div.overflow-y-auto");
		expect(list?.className).toContain("max-h-[min(18rem,40dvh)]");
	});

	it("mounts one queue outside the market-keyed desktop and mobile order forms", () => {
		const terminalPage = readTradeComponent("trade-terminal-page.tsx");
		const desktopPanel = readTradeComponent("tradebox/trade-panel.tsx");
		const mobilePanel = readTradeComponent("mobile/mobile-trade-view.tsx");

		expect(terminalPage.match(/<OrderToast\s*\/>/g)).toHaveLength(1);
		expect(desktopPanel).not.toContain("OrderToast");
		expect(mobilePanel).not.toContain("OrderToast");
	});

	it("renders an unconfirmed order as a dismissible warning", () => {
		const addButton = container.querySelector<HTMLButtonElement>('[data-testid="add-unconfirmed-order"]');
		if (!addButton) throw new Error("Add unconfirmed order button not found");
		act(() => addButton.click());

		const status = document.body.querySelector<HTMLOutputElement>('output[aria-live="polite"]');
		expect(status?.textContent).toContain("unconfirmed");
		expect(status?.textContent).toContain("Review open orders and positions before retrying.");

		const dismissButton = status?.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]');
		if (!dismissButton) throw new Error("Dismiss button not found");
		act(() => dismissButton.click());

		expect(document.body.querySelector('output[aria-live="polite"]')).toBeNull();
	});

	it("renders an accepted-then-canceled order as a dismissible canceled state", () => {
		const addButton = container.querySelector<HTMLButtonElement>('[data-testid="add-canceled-order"]');
		if (!addButton) throw new Error("Add canceled order button not found");
		act(() => addButton.click());

		const status = document.body.querySelector<HTMLOutputElement>('output[aria-live="polite"]');
		expect(status?.textContent).toContain("Canceled");
		expect(status?.textContent).not.toContain("unconfirmed");

		const dismissButton = status?.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]');
		expect(dismissButton).not.toBeNull();
	});
});

function readTradeComponent(relativePath: string): string {
	return readFileSync(resolve(TRADE_COMPONENT_DIR, relativePath), "utf8");
}
