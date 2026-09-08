/** @vitest-environment jsdom */

import { act, StrictMode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrderbookLevelPulses } from "@/hooks/trade/use-orderbook-level-pulses";
import type { OrderbookPulseSnapshot, OrderbookVisibleLevel } from "@/lib/trade/orderbook-new-levels";
import type { OrderbookLevelPulseInput } from "@/lib/ui/orderbook-level-pulses";

function book(bids: string[]): OrderbookPulseSnapshot {
	return { levels: [bids.map((px) => ({ px })), [{ px: "101" }]] };
}

function visible(snapshot: OrderbookPulseSnapshot | undefined): OrderbookVisibleLevel[] {
	return [
		...(snapshot?.levels[0].map(({ px }) => ({ side: "bid" as const, price: px })) ?? []),
		...(snapshot?.levels[1].map(({ px }) => ({ side: "ask" as const, price: px })) ?? []),
	];
}

function Harness(input: OrderbookLevelPulseInput & { panelKey?: string }) {
	const { panelRef, getPulse, onAnimationEnd } = useOrderbookLevelPulses(input);
	return (
		<div key={input.panelKey} ref={panelRef}>
			{input.visibleLevels.map(({ side, price }) => {
				const pulse = getPulse(side, price);
				return (
					<button
						type="button"
						key={`${side}:${price}`}
						data-price={`${side}:${price}`}
						data-pulse={pulse?.id}
						onClick={() => {
							if (pulse) onAnimationEnd(pulse.id);
						}}
					>
						{price}
					</button>
				);
			})}
		</div>
	);
}

describe("orderbook level pulse hook", () => {
	let container: HTMLDivElement;
	let root: Root;
	let pageVisibility: DocumentVisibilityState;
	let reducedMotion: boolean;
	let mediaListeners: Set<() => void>;
	let observers: TestIntersectionObserver[];

	class TestIntersectionObserver {
		private target: Element | undefined;
		private readonly callback: IntersectionObserverCallback;
		disconnected = false;

		constructor(callback: IntersectionObserverCallback) {
			this.callback = callback;
			observers.push(this);
		}

		observe(target: Element) {
			this.target = target;
			this.setVisible(true);
		}

		disconnect() {
			this.disconnected = true;
		}

		setVisible(isVisible: boolean) {
			if (!this.target) return;
			this.callback(
				[
					{
						target: this.target,
						isIntersecting: isVisible,
						intersectionRatio: isVisible ? 1 : 0,
					} as IntersectionObserverEntry,
				],
				this as unknown as IntersectionObserver,
			);
		}
	}

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
		pageVisibility = "visible";
		reducedMotion = false;
		mediaListeners = new Set();
		observers = [];
		vi.spyOn(document, "visibilityState", "get").mockImplementation(() => pageVisibility);
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 10, 300, 500));
		vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
		vi.stubGlobal(
			"matchMedia",
			vi.fn(() => ({
				get matches() {
					return reducedMotion;
				},
				addEventListener(_type: string, listener: () => void) {
					mediaListeners.add(listener);
				},
				removeEventListener(_type: string, listener: () => void) {
					mediaListeners.delete(listener);
				},
			})),
		);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	function inputFor(
		snapshot: OrderbookPulseSnapshot | undefined,
		overrides: Partial<OrderbookLevelPulseInput> & { panelKey?: string } = {},
	) {
		return {
			active: true,
			identity: "mainnet:HYPE:native:l2Book-full",
			snapshot,
			viewKey: "both:12:12",
			visibleLevels: visible(snapshot),
			...overrides,
		};
	}

	function render(
		snapshot: OrderbookPulseSnapshot | undefined,
		overrides: Partial<OrderbookLevelPulseInput> & { panelKey?: string } = {},
	) {
		act(() => root.render(<Harness {...inputFor(snapshot, overrides)} />));
	}

	function pulse(price = "100") {
		return container.querySelector<HTMLButtonElement>(`[data-price="bid:${price}"]`)?.dataset.pulse;
	}

	it("survives continuous quote renders and cleans the event at its fixed expiry", () => {
		render(book(["99"]));
		expect(container.querySelectorAll("[data-pulse]")).toHaveLength(0);
		render(book(["100", "99"]));
		const id = pulse();
		expect(id).toBeDefined();
		for (let index = 0; index < 7; index += 1) {
			act(() => vi.advanceTimersByTime(100));
			render(book(["100", "99"]));
			expect(pulse()).toBe(id);
		}
		expect(observers.filter((observer) => !observer.disconnected)).toHaveLength(1);
		act(() => vi.advanceTimersByTime(100));
		expect(pulse()).toBeUndefined();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("resets identity, view, missing and inactive inputs without replaying prior prices", () => {
		render(book(["99"]));
		render(book(["100", "99"]));
		expect(pulse()).toBeDefined();
		render(book(["100", "99"]), { identity: "mainnet:HYPE:5:l2Book-fast" });
		expect(pulse()).toBeUndefined();
		render(book(["110", "109"]), { viewKey: "both:15:15" });
		expect(pulse("110")).toBeUndefined();
		render(book(["111", "110", "109"]), { viewKey: "both:15:15" });
		expect(pulse("111")).toBeDefined();
		render(book(["111", "110", "109"]), { viewKey: "both:15:15", active: false });
		expect(pulse("111")).toBeUndefined();
		render(undefined);
		render(book(["120", "119"]));
		expect(pulse("120")).toBeUndefined();
	});

	it("uses full snapshots without creating effects for unmeasured or newly revealed levels", () => {
		render(book(["99", "98", "97"]), { visibleLevels: [], viewKey: "unmeasured" });
		render(book(["99", "98", "97"]), { visibleLevels: [{ side: "bid", price: "99" }] });
		render(book(["99", "98", "97", "96"]), { visibleLevels: [{ side: "bid", price: "97" }] });
		expect(pulse("97")).toBeUndefined();
		render(book(["99", "98", "97", "96"]), { visibleLevels: [{ side: "bid", price: "96" }] });
		expect(pulse("96")).toBeUndefined();
	});

	it("stops on page hiding and makes the first resumed live frame silent", () => {
		render(book(["99"]));
		render(book(["100", "99"]));
		expect(pulse()).toBeDefined();
		act(() => {
			pageVisibility = "hidden";
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(pulse()).toBeUndefined();
		expect(vi.getTimerCount()).toBe(0);
		render(book(["110", "109"]));
		act(() => {
			pageVisibility = "visible";
			document.dispatchEvent(new Event("visibilitychange"));
		});
		render(book(["111", "110", "109"]));
		expect(pulse("111")).toBeUndefined();
		render(book(["112", "111", "110", "109"]));
		expect(pulse("112")).toBeDefined();
	});

	it("cancels offscreen effects and does not replay them after the panel reenters the viewport", () => {
		render(book(["99"]));
		render(book(["100", "99"]));
		const observer = observers.find((candidate) => !candidate.disconnected);
		expect(observer).toBeDefined();
		act(() => observer?.setVisible(false));
		expect(pulse()).toBeUndefined();
		act(() => observer?.setVisible(true));
		render(book(["110", "109"]));
		expect(pulse("110")).toBeUndefined();
		render(book(["111", "110", "109"]));
		expect(pulse("111")).toBeDefined();
	});

	it("honors reduced motion at startup and when the preference changes", () => {
		reducedMotion = true;
		render(book(["99"]));
		render(book(["100", "99"]));
		expect(pulse()).toBeUndefined();
		act(() => {
			reducedMotion = false;
			for (const listener of mediaListeners) listener();
		});
		render(book(["110", "109"]));
		expect(pulse("110")).toBeUndefined();
		render(book(["111", "110", "109"]));
		expect(pulse("111")).toBeDefined();
		act(() => {
			reducedMotion = true;
			for (const listener of mediaListeners) listener();
		});
		expect(pulse("111")).toBeUndefined();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("ignores queued visibility callbacks from a replaced panel observer", () => {
		render(book(["99"]));
		const previousObserver = observers.find((observer) => !observer.disconnected);
		render(book(["99"]), { panelKey: "replacement" });
		const currentObserver = observers.find((observer) => !observer.disconnected);
		expect(currentObserver).not.toBe(previousObserver);
		act(() => {
			currentObserver?.setVisible(false);
			previousObserver?.setVisible(true);
		});
		render(book(["100", "99"]), { panelKey: "replacement" });
		render(book(["110", "100", "99"]), { panelKey: "replacement" });
		expect(container.querySelectorAll("[data-pulse]")).toHaveLength(0);
	});

	it("reads changed media preferences before committing frames when the change event is delayed", () => {
		render(book(["99"]));
		render(book(["100", "99"]));
		expect(pulse()).toBeDefined();
		reducedMotion = true;
		render(book(["110", "109"]));
		expect(pulse("110")).toBeUndefined();
		expect(vi.getTimerCount()).toBe(0);
		reducedMotion = false;
		render(book(["120", "119"]));
		expect(pulse("120")).toBeUndefined();
		act(() => {
			for (const listener of mediaListeners) listener();
		});
		render(book(["121", "120", "119"]));
		expect(pulse("121")).toBeDefined();
		const id = pulse("121");
		act(() => {
			for (const listener of mediaListeners) listener();
		});
		expect(pulse("121")).toBe(id);
	});

	it("keeps controller setup usable under Strict Mode and releases observers, listeners and timers", () => {
		act(() =>
			root.render(
				<StrictMode>
					<Harness {...inputFor(book(["99"]))} />
				</StrictMode>,
			),
		);
		act(() =>
			root.render(
				<StrictMode>
					<Harness {...inputFor(book(["100", "99"]))} />
				</StrictMode>,
			),
		);
		expect(pulse()).toBeDefined();
		expect(vi.getTimerCount()).toBe(1);
		act(() => root.render(null));
		expect(observers.every((observer) => observer.disconnected)).toBe(true);
		expect(mediaListeners.size).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("hydrates from stable empty SSR output and only pulses later live updates", () => {
		act(() => root.unmount());
		const initial = inputFor(book(["99"]));
		container.innerHTML = renderToString(<Harness {...initial} />);
		expect(container.querySelectorAll("[data-pulse]")).toHaveLength(0);
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		act(() => {
			root = hydrateRoot(container, <Harness {...initial} />);
		});
		expect(container.querySelectorAll("[data-pulse]")).toHaveLength(0);
		render(book(["100", "99"]));
		expect(pulse()).toBeDefined();
		expect(errors).not.toHaveBeenCalled();
	});
});
