// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { i18n, type Messages } from "@lingui/core";
import { act, createElement, Fragment } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrderToast } from "@/components/trade/tradebox/order-toast";
import { MOBILE_BOTTOM_NAV_HEIGHT_PX } from "@/config/layout";
import { orderSubmissionFeedback } from "@/lib/trade/order-submission-feedback";
import { type OrderQueueItem, useOrderQueue, useOrderQueueActions } from "@/stores/use-order-queue-store";
import { createI18nRoot } from "./harness/react";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TRADE_COMPONENT_DIR = resolve(TEST_DIR, "../..", "components/trade");
const ORDER_TOAST_MOBILE_GAP_PX = 12;
const COORDINATION_MESSAGE = "Safe order coordination across tabs is unavailable in this browser.";
const COORDINATION_MESSAGE_AR = "تعذر تنسيق الطلبات بأمان عبر علامات التبويب في هذا المتصفح.";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(COORDINATION_MESSAGE)]: COORDINATION_MESSAGE_AR,
};

let queueActions: ReturnType<typeof useOrderQueueActions>;

function OrderToastHarness() {
	const orders = useOrderQueue();
	queueActions = useOrderQueueActions();
	const { addOrder, removeOrder } = queueActions;

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
				"data-testid": "add-client-error-order",
				onClick: () =>
					addOrder({
						error: orderSubmissionFeedback("coordination-unavailable"),
						market: "HYPE",
						orderType: "market",
						side: "sell",
						size: "1",
						status: "failed",
					}),
				type: "button",
			},
			"Add client error order",
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
		i18n.loadAndActivate({ locale: "en", messages: {} });
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

		const queue = document.body.querySelector<HTMLElement>('section[aria-label="Order Queue"]');
		expect(queue).not.toBeNull();
		expect(container.querySelector('section[aria-label="Order Queue"]')).toBeNull();
		expect(queue?.parentElement).toBe(document.body);
		expect(queue?.hasAttribute("aria-live")).toBe(false);
		expect(queue?.className).toContain("z-[var(--z-toast)]");
		expect(queue?.className).toContain("left-[max(1rem,var(--sal))]");
		expect(queue?.className).toContain("right-[max(1rem,var(--sar))]");
		expect(queue?.className).toContain("w-auto");
		expect(queue?.className).toContain("min-[1001px]:left-auto");
		expect(queue?.className).toContain("min-[1001px]:right-6");
		expect(queue?.className).toContain("min-[1001px]:w-80");
		expect(queue?.className).toContain("bottom-[var(--order-toast-mobile-bottom)]");
		expect(queue?.className).toContain("min-[1001px]:bottom-[calc(env(safe-area-inset-bottom)+3.5rem)]");
		expect(queue?.className).toContain("bg-overlay/95");
		expect(queue?.style.getPropertyValue("--order-toast-mobile-bottom")).toBe(
			`calc(env(safe-area-inset-bottom) + ${MOBILE_BOTTOM_NAV_HEIGHT_PX + ORDER_TOAST_MOBILE_GAP_PX}px)`,
		);
		const orderStatus = queue?.querySelector<HTMLElement>('[role="status"]');
		expect(orderStatus?.getAttribute("aria-atomic")).toBe("true");

		const list = queue?.querySelector<HTMLDivElement>("div.overflow-y-auto");
		expect(list?.className).toContain("max-h-[min(18rem,40dvh)]");
	});

	it("counts mixed statuses and preserves badge order, colors and locale reactivity", () => {
		const statuses: OrderQueueItem["status"][] = [
			"failed",
			"success",
			"canceled",
			"partial",
			"unconfirmed",
			"confirming",
			"pending",
			"pending",
		];
		act(() => {
			for (const status of statuses) {
				queueActions.addOrder({ market: "HYPE", side: "buy", size: "1", orderType: "limit", status });
			}
		});
		const queue = document.body.querySelector<HTMLElement>('section[aria-label="Order Queue"]');
		const badges = Array.from(queue?.firstElementChild?.lastElementChild?.querySelectorAll("span") ?? []);
		expect(badges.map((badge) => badge.textContent)).toEqual([
			"2 pending",
			"1 confirming",
			"1 unconfirmed",
			"1 partial",
			"1 Canceled",
			"1 failed",
		]);
		expect(badges[0].classList.contains("text-fg-muted")).toBe(true);
		for (const badge of badges.slice(1, 5)) expect(badge.classList.contains("text-warning")).toBe(true);
		expect(badges[5].classList.contains("text-error")).toBe(true);
		expect(queue?.classList.contains("ring-stroke-strong/30")).toBe(true);
		act(() => i18n.loadAndActivate({ locale: "ar", messages: { [getMessageId("pending")]: "قيد الانتظار" } }));
		expect(badges[0].isConnected).toBe(true);
		expect(badges[0].textContent).toBe("2 قيد الانتظار");
	});

	it.each<{ statuses: OrderQueueItem["status"][]; ring: string }>([
		{ statuses: ["success"], ring: "success" },
		{ statuses: ["success", "failed"], ring: "error" },
		{ statuses: ["success", "failed", "confirming"], ring: "warning" },
		{ statuses: ["success", "failed", "unconfirmed"], ring: "warning" },
		{ statuses: ["success", "failed", "partial"], ring: "warning" },
		{ statuses: ["success", "failed", "canceled"], ring: "warning" },
	])("preserves the $ring ring for $statuses", ({ statuses, ring }) => {
		act(() => {
			for (const status of statuses) {
				queueActions.addOrder({ market: "HYPE", side: "buy", size: "1", orderType: "limit", status });
			}
		});
		const queue = document.body.querySelector<HTMLElement>('section[aria-label="Order Queue"]');
		const ringColors = Array.from(queue?.classList ?? []).filter((name) => name.startsWith("ring-stroke-"));
		expect(ringColors).toEqual([`ring-stroke-${ring}-strong/30`]);
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

		const queue = document.body.querySelector<HTMLElement>('section[aria-label="Order Queue"]');
		const status = queue?.querySelector<HTMLElement>('[role="status"]');
		expect(queue?.textContent).toContain("unconfirmed");
		expect(status?.textContent).toContain("Review open orders and positions before retrying.");
		expect(status?.getAttribute("aria-atomic")).toBe("true");

		const dismissButton = queue?.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]');
		if (!dismissButton) throw new Error("Dismiss button not found");
		act(() => dismissButton.click());

		expect(document.body.querySelector('section[aria-label="Order Queue"]')).toBeNull();
	});

	it("renders an accepted-then-canceled order as a dismissible canceled state", () => {
		const addButton = container.querySelector<HTMLButtonElement>('[data-testid="add-canceled-order"]');
		if (!addButton) throw new Error("Add canceled order button not found");
		act(() => addButton.click());

		const queue = document.body.querySelector<HTMLElement>('section[aria-label="Order Queue"]');
		const status = queue?.querySelector<HTMLElement>('[role="status"]');
		expect(status?.textContent).toContain("Canceled");
		expect(status?.textContent).not.toContain("unconfirmed");

		const dismissButton = queue?.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]');
		expect(dismissButton).not.toBeNull();
	});

	it("retranslates a persisted client error when the locale changes", () => {
		const addButton = container.querySelector<HTMLButtonElement>('[data-testid="add-client-error-order"]');
		if (!addButton) throw new Error("Add client error order button not found");
		act(() => addButton.click());

		const queue = document.body.querySelector<HTMLElement>('section[aria-label="Order Queue"]');
		const status = queue?.querySelector<HTMLElement>('[role="alert"]');
		expect(status?.textContent).toContain(COORDINATION_MESSAGE);
		expect(status?.getAttribute("aria-atomic")).toBe("true");

		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));

		expect(status?.textContent).toContain(COORDINATION_MESSAGE_AR);
		expect(status?.textContent).not.toContain(COORDINATION_MESSAGE);
	});
});

function readTradeComponent(relativePath: string): string {
	return readFileSync(resolve(TRADE_COMPONENT_DIR, relativePath), "utf8");
}
