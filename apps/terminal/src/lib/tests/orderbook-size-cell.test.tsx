// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderbookSizeCell } from "@/components/trade/orderbook/orderbook-size-cell";

const preferences = vi.hoisted(() => ({ animateOrderbook: true }));

vi.mock("@/stores/use-global-settings-store", () => ({
	useAnimateOrderbook: () => preferences.animateOrderbook,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("OrderbookSizeCell", () => {
	let container: HTMLDivElement;
	let root: Root;
	let reducedMotion: boolean;
	let motionQuery: MediaQueryList;

	beforeEach(() => {
		preferences.animateOrderbook = true;
		reducedMotion = false;
		motionQuery = Object.assign(new EventTarget(), {
			media: "(prefers-reduced-motion: reduce)",
			onchange: null,
		}) as MediaQueryList;
		Object.defineProperty(motionQuery, "matches", { get: () => reducedMotion });
		vi.spyOn(motionQuery, "addEventListener");
		vi.spyOn(motionQuery, "removeEventListener");
		vi.stubGlobal(
			"matchMedia",
			vi.fn(() => motionQuery),
		);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	});

	function render(value: string, resetKey = "ETH:5:default", displayValue = value) {
		act(() => root.render(<OrderbookSizeCell displayValue={displayValue} resetKey={resetKey} value={value} />));
		return container.querySelector<HTMLElement>('[data-slot="orderbook-size-value"]');
	}

	function finishAnimation(element: HTMLElement | null, animationName = "orderbook-color-change") {
		const eventName = "AnimationEvent" in window ? "animationend" : "webkitAnimationEnd";
		const event = new Event(eventName, { bubbles: true });
		Object.defineProperty(event, "animationName", { value: animationName });
		act(() => element?.dispatchEvent(event));
	}

	function setReducedMotion(next: boolean) {
		reducedMotion = next;
		act(() => motionQuery.dispatchEvent(new Event("change")));
	}

	it("does not flash when the level first appears or remains unchanged", () => {
		const initial = render("10.00");
		expect(initial?.classList.contains("orderbook-color-change")).toBe(false);
		expect(initial?.parentElement?.getAttribute("title")).toBe("10.00");

		const unchanged = render("10.00");
		expect(unchanged).toBe(initial);
	});

	it("restarts a green flash when size increases", () => {
		const initial = render("10");
		const increased = render("11");

		expect(increased).not.toBe(initial);
		expect(increased?.classList.contains("orderbook-color-change")).toBe(true);
		expect(increased?.dataset.direction).toBe("up");
	});

	it("preserves an active fade through same-value and display-format rerenders", () => {
		render("10");
		const increased = render("11");
		const unchanged = render("11");
		const reformatted = render("11", "ETH:5:default", "11,00");

		expect(unchanged).toBe(increased);
		expect(reformatted).toBe(increased);
		expect(reformatted?.dataset.direction).toBe("up");
		expect(reformatted?.classList.contains("orderbook-color-change")).toBe(true);
		expect(reformatted?.textContent).toBe("11,00");
	});

	it("restarts a red flash when size decreases", () => {
		render("10");
		const firstDecrease = render("9");
		const secondDecrease = render("8");

		expect(firstDecrease?.dataset.direction).toBe("down");
		expect(secondDecrease?.dataset.direction).toBe("down");
		expect(secondDecrease).not.toBe(firstDecrease);
	});

	it("restarts for every numeric change even when returning to an earlier value", () => {
		render("10");
		const increase = render("11");
		const decrease = render("10");
		const repeatedIncrease = render("11");

		expect(decrease?.dataset.direction).toBe("down");
		expect(repeatedIncrease?.dataset.direction).toBe("up");
		expect(repeatedIncrease).not.toBe(increase);
		finishAnimation(increase);
		expect(repeatedIncrease?.classList.contains("orderbook-color-change")).toBe(true);
	});

	it("clears the fade on completion without replaying an unchanged value", () => {
		render("10");
		const increased = render("11");
		finishAnimation(increased, "unrelated-animation");
		expect(increased?.dataset.direction).toBe("up");
		finishAnimation(increased);

		expect(increased?.classList.contains("orderbook-color-change")).toBe(false);
		expect(increased?.dataset.direction).toBeUndefined();
		expect(render("11")).toBe(increased);
		expect(increased?.classList.contains("orderbook-color-change")).toBe(false);
		expect(render("12")?.dataset.direction).toBe("up");
	});

	it("does not flash when the market or grouping identity changes", () => {
		render("10");
		expect(render("11")?.dataset.direction).toBe("up");
		const reset = render("20", "BTC:4:default");

		expect(reset?.classList.contains("orderbook-color-change")).toBe(false);
		expect(reset?.dataset.direction).toBeUndefined();
	});

	it("detects changes beyond JavaScript number precision", () => {
		const initial = render("9007199254740992");
		const increased = render("9007199254740993");

		expect(increased).not.toBe(initial);
		expect(increased?.dataset.direction).toBe("up");
	});

	it("does not flash when only the decimal representation changes", () => {
		const initial = render("1.0");
		const equivalent = render("1.00");

		expect(equivalent?.classList.contains("orderbook-color-change")).toBe(false);
		expect(equivalent?.dataset.direction).toBeUndefined();
		expect(equivalent).toBe(initial);
	});

	it("preserves a running fade when only the decimal representation changes", () => {
		render("1.0");
		const increased = render("2.0");
		const equivalent = render("2.00");

		expect(equivalent).toBe(increased);
		expect(equivalent?.dataset.direction).toBe("up");
		expect(equivalent?.textContent).toBe("2.00");
	});

	it("cancels active feedback when disabled and enables without replaying changes", () => {
		render("10");
		expect(render("11")?.dataset.direction).toBe("up");
		preferences.animateOrderbook = false;
		expect(render("11")?.dataset.direction).toBeUndefined();
		expect(render("15")?.dataset.direction).toBeUndefined();
		preferences.animateOrderbook = true;
		const enabled = render("20");
		expect(enabled?.dataset.direction).toBeUndefined();
		expect(render("20")).toBe(enabled);
		expect(render("21")?.dataset.direction).toBe("up");
	});

	it("cancels on reduced motion changes and resumes from a quiet baseline", () => {
		render("10");
		expect(render("11")?.dataset.direction).toBe("up");
		setReducedMotion(true);
		expect(container.querySelector('[data-direction="up"]')).toBeNull();
		expect(render("12")?.dataset.direction).toBeUndefined();
		setReducedMotion(false);
		expect(render("12")?.dataset.direction).toBeUndefined();
		expect(render("13")?.dataset.direction).toBe("up");
	});

	it("does not animate an initial reduced-motion session", () => {
		reducedMotion = true;
		render("10");
		expect(render("11")?.dataset.direction).toBeUndefined();
	});

	it("reads a changed motion preference before its delayed media notification", () => {
		render("10");
		expect(render("11")?.dataset.direction).toBe("up");
		reducedMotion = true;
		expect(render("12")?.dataset.direction).toBeUndefined();
		setReducedMotion(true);
		reducedMotion = false;
		expect(render("13")?.dataset.direction).toBeUndefined();
		setReducedMotion(false);
		expect(render("14")?.dataset.direction).toBe("up");
	});

	it("shares one motion listener across cells and removes it after the last unmount", () => {
		act(() =>
			root.render(
				<>
					<OrderbookSizeCell displayValue="10" resetKey="ETH:5:default" value="10" />
					<OrderbookSizeCell displayValue="20" resetKey="ETH:5:default" value="20" />
				</>,
			),
		);
		expect(motionQuery.addEventListener).toHaveBeenCalledTimes(1);
		act(() => root.render(null));
		expect(motionQuery.removeEventListener).toHaveBeenCalledTimes(1);
	});
});
