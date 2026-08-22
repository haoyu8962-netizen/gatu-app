/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	MOBILE_PROGRESSIVE_LIST_BATCH_SIZE,
	MobileProgressiveList,
} from "@/components/trade/mobile/mobile-progressive-list";

interface ObserverRecord {
	callback: IntersectionObserverCallback;
	disconnect: ReturnType<typeof vi.fn>;
	root: Element | Document | null | undefined;
}

describe("MobileProgressiveList", () => {
	let container: HTMLDivElement;
	let root: Root;
	let observers: ObserverRecord[];

	beforeEach(() => {
		observers = [];
		container = document.createElement("div");
		container.style.overflowY = "auto";
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	});

	function render(items: readonly number[], key = "default") {
		act(() => {
			root.render(
				<MobileProgressiveList key={key} items={items}>
					{(visibleItems): ReactNode =>
						visibleItems.map((item) => <span key={item} data-testid="progressive-item" data-value={item} />)
					}
				</MobileProgressiveList>,
			);
		});
	}

	function installIntersectionObserver() {
		class MockIntersectionObserver {
			readonly root = null;
			readonly rootMargin = "0px";
			readonly thresholds = [0];
			readonly disconnect = vi.fn();
			readonly observe = vi.fn();
			readonly takeRecords = vi.fn(() => []);
			readonly unobserve = vi.fn();

			constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
				observers.push({ callback, disconnect: this.disconnect, root: options?.root });
			}
		}

		vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
	}

	function triggerIntersection(observer: ObserverRecord) {
		act(() => {
			observer.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
		});
	}

	it("renders 24 rows first and adds one batch for each intersection", () => {
		installIntersectionObserver();
		render(Array.from({ length: 60 }, (_, index) => index));

		expect(container.querySelectorAll('[data-testid="progressive-item"]')).toHaveLength(
			MOBILE_PROGRESSIVE_LIST_BATCH_SIZE,
		);
		expect(observers).toHaveLength(1);
		expect(observers[0]?.root).toBe(container);

		triggerIntersection(observers[0]);
		expect(container.querySelectorAll('[data-testid="progressive-item"]')).toHaveLength(48);
		expect(observers[0]?.disconnect).toHaveBeenCalled();
		expect(observers).toHaveLength(2);

		triggerIntersection(observers[1]);
		const renderedItems = Array.from(
			container.querySelectorAll<HTMLElement>('[data-testid="progressive-item"]'),
			(item) => Number(item.dataset.value),
		);
		expect(renderedItems).toEqual(Array.from({ length: 60 }, (_, index) => index));
		expect(observers[1]?.disconnect).toHaveBeenCalled();
		expect(container.querySelector('[data-testid="mobile-progressive-list-sentinel"]')).toBeNull();
	});

	it("renders every row when IntersectionObserver is unavailable", () => {
		vi.stubGlobal("IntersectionObserver", undefined);
		render(Array.from({ length: 60 }, (_, index) => index));

		expect(container.querySelectorAll('[data-testid="progressive-item"]')).toHaveLength(60);
	});

	it("resets to the first batch when a filter key changes", () => {
		installIntersectionObserver();
		const items = Array.from({ length: 60 }, (_, index) => index);
		render(items, "all");
		triggerIntersection(observers[0]);
		expect(container.querySelectorAll('[data-testid="progressive-item"]')).toHaveLength(48);

		render(items, "filtered");
		expect(container.querySelectorAll('[data-testid="progressive-item"]')).toHaveLength(
			MOBILE_PROGRESSIVE_LIST_BATCH_SIZE,
		);
	});
});
