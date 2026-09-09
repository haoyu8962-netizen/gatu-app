// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderbookLevelPulse } from "@/components/trade/orderbook/orderbook-level-pulse";
import { OrderbookRow } from "@/components/trade/orderbook/orderbook-row";
import type { OrderbookLevelPulseEvent } from "@/lib/ui/orderbook-level-pulses";
import { createI18nRoot } from "./harness/react";

const EVENT: OrderbookLevelPulseEvent = {
	id: 1,
	side: "ask",
	priceKey: "84",
	createdAt: 100,
	delayMs: 200,
	expiresAt: 1100,
};

const LEVEL = { price: "84", size: "1", total: "2", quoteSize: "84", quoteTotal: "168" };

describe("OrderbookLevelPulse", () => {
	let container: HTMLDivElement;
	let root: Root;
	let currentTime: number;
	const onAnimationEnd = vi.fn();

	beforeEach(() => {
		currentTime = 100;
		vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
		vi.spyOn(performance, "now").mockImplementation(() => currentTime);
		onAnimationEnd.mockClear();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.append(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	it("joins the event timeline with a negative delay after its scheduled start", () => {
		currentTime = 400;
		act(() => root.render(<OrderbookLevelPulse event={EVENT} onAnimationEnd={onAnimationEnd} />));
		const pulse = container.querySelector<HTMLElement>('[data-slot="orderbook-level-pulse"]');
		expect(pulse?.style.getPropertyValue("--orderbook-pulse-delay")).toBe("-100ms");
		expect(pulse?.dataset.active).toBe("true");
		expect(pulse?.getAttribute("aria-hidden")).toBe("true");
		expect(onAnimationEnd).not.toHaveBeenCalled();
	});

	it("discards an expired event instead of replaying it", () => {
		currentTime = 1100;
		act(() => root.render(<OrderbookLevelPulse event={EVENT} onAnimationEnd={onAnimationEnd} />));
		expect(container.querySelector("[data-active]")).toBeNull();
		expect(onAnimationEnd).toHaveBeenCalledExactlyOnceWith(EVENT.id);
	});

	it("reports the completed event identity", () => {
		act(() => root.render(<OrderbookLevelPulse event={EVENT} onAnimationEnd={onAnimationEnd} />));
		const pulse = container.querySelector("span");
		const eventName = "AnimationEvent" in window ? "animationend" : "webkitAnimationEnd";
		act(() => pulse?.dispatchEvent(new Event(eventName, { bubbles: true })));
		expect(onAnimationEnd).toHaveBeenCalledExactlyOnceWith(EVENT.id);
	});

	it("retains the pulse, row and focus while quantity feedback changes independently", () => {
		renderRow();
		const button = container.querySelector("button");
		const pulse = container.querySelector<HTMLElement>('[data-slot="orderbook-level-pulse"]');
		const initialSize = container.querySelector('[data-slot="orderbook-size-value"]');
		button?.focus();
		currentTime = 500;
		renderRow("2");
		expect(container.querySelector("button")).toBe(button);
		expect(document.activeElement).toBe(button);
		expect(container.querySelector('[data-slot="orderbook-level-pulse"]')).toBe(pulse);
		expect(pulse?.style.getPropertyValue("--orderbook-pulse-delay")).toBe("200ms");
		const nextSize = container.querySelector('[data-slot="orderbook-size-value"]');
		expect(nextSize).not.toBe(initialSize);
		expect(nextSize?.getAttribute("data-direction")).toBe("up");
	});

	it("updates the memoized row language without remounting its pulse or button", () => {
		renderRow();
		const button = container.querySelector("button");
		const pulse = container.querySelector('[data-slot="orderbook-level-pulse"]');
		const askMessageId = createHash("sha256").update("Ask\x1f").digest("base64").slice(0, 6);
		act(() => i18n.loadAndActivate({ locale: "zh", messages: { [askMessageId]: "卖盘" } }));
		expect(button?.getAttribute("aria-label")).toMatch(/^卖盘,/);
		expect(container.querySelector("button")).toBe(button);
		expect(container.querySelector('[data-slot="orderbook-level-pulse"]')).toBe(pulse);
	});

	it("does not render a pulse on disabled data", () => {
		renderRow("1", true);
		expect(container.querySelector('[data-slot="orderbook-level-pulse"]')).toBeNull();
		expect(container.querySelector("button")?.disabled).toBe(true);
	});

	function renderRow(size = "1", disabled = false) {
		act(() =>
			root.render(
				<OrderbookRow
					flashResetKey="Mainnet:HYPE:full"
					level={{ ...LEVEL, size }}
					marketName="HYPE"
					side="ask"
					maxTotal="2"
					priceDecimals={2}
					szDecimals={2}
					pulse={EVENT}
					onPulseEnd={onAnimationEnd}
					disabled={disabled}
				/>,
			),
		);
	}
});
