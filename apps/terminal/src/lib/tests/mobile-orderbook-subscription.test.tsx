/** @vitest-environment jsdom */

import { act, type ComponentProps } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrderbookActionsStore } from "@/stores/use-orderbook-actions-store";
import { createI18nRoot } from "./harness/react";

type BookEvent = {
	coin: string;
	fast?: true;
	levels: [Array<{ n: number; px: string; sz: string }>, Array<{ n: number; px: string; sz: string }>];
	time: number;
};

type SubscriptionState = {
	data?: BookEvent;
	error?: unknown;
	isStale: boolean;
	status: "idle" | "subscribing" | "active" | "error";
};

vi.mock("@/components/trade/orderbook/orderbook-hover-tooltip", () => ({
	OrderbookHoverTooltip: ({
		hover,
		baseAsset,
		quoteAsset,
	}: ComponentProps<typeof import("@/components/trade/orderbook/orderbook-hover-tooltip").OrderbookHoverTooltip>) => (
		<div
			role="tooltip"
			id={hover.tooltipId}
			data-price={hover.activeLevel?.price}
			data-total={hover.activeLevel?.total}
		>
			{baseAsset}/{quoteAsset}
		</div>
	),
}));

function createPointerEvent(type: string, pointerType = "mouse"): MouseEvent {
	const event = new MouseEvent(type, { bubbles: true, button: 0, buttons: 0, clientX: 12, clientY: 8 });
	Object.defineProperties(event, {
		isPrimary: { value: true },
		pointerId: { value: 1 },
		pointerType: { value: pointerType },
	});
	return event;
}

const mocks = vi.hoisted(() => ({
	env: "Mainnet",
	market: {
		kind: "perp",
		markPx: "100",
		midPx: "100.25" as string | null | undefined,
		markPriceStatus: "success" as "idle" | "loading" | "success" | "stale" | "error",
		midPriceReceivedAt: Date.now() as number | undefined,
		name: "MOBILE_A",
		pairName: "MOBILE_A-USDC",
		szDecimals: 2,
	},
	midPriceCoins: [] as Array<string | undefined>,
	l2SubscriptionCalls: [] as Array<{
		options: { enabled?: boolean };
		params: { coin: string; mantissa?: number; nSigFigs?: number | null };
	}>,
	l2SubscriptionListeners: new Set<() => void>(),
	l2SubscriptionState: {
		data: undefined,
		error: undefined,
		isStale: false,
		status: "subscribing",
	} as SubscriptionState,
	subscriptionCalls: [] as Array<{
		options: { enabled?: boolean };
		params: { coin: string; fast?: boolean; mantissa?: number; nSigFigs?: number | null };
	}>,
	subscriptionListeners: new Set<() => void>(),
	subscriptionState: {
		data: undefined,
		isStale: false,
		status: "subscribing",
	} as SubscriptionState,
}));

vi.mock("@/lib/hyperliquid", async () => {
	const { useSyncExternalStore } = await import("react");
	return {
		useHyperliquid: () => ({ env: mocks.env }),
		useSelectedMarketInfo: () => ({ data: mocks.market }),
		canUseL2Decompression: () => true,
		L2BookStreamError: class L2BookStreamError extends Error {
			code: string;

			constructor(code: string) {
				super(code);
				this.code = code;
			}
		},
		useL2BookSubscription: (
			params: { coin: string; mantissa?: number; nSigFigs?: number | null },
			options: { enabled?: boolean },
		) => {
			mocks.l2SubscriptionCalls.push({ options, params });
			const state = useSyncExternalStore(
				(listener) => {
					mocks.l2SubscriptionListeners.add(listener);
					return () => mocks.l2SubscriptionListeners.delete(listener);
				},
				() => mocks.l2SubscriptionState,
				() => mocks.l2SubscriptionState,
			);
			return { ...state, lastMessageAt: undefined, unsubscribe: undefined };
		},
		useSubscription: (
			_method: string,
			params: { coin: string; fast?: boolean; mantissa?: number; nSigFigs?: number | null },
			options: { enabled?: boolean },
		) => {
			mocks.subscriptionCalls.push({ options, params });
			const state = useSyncExternalStore(
				(listener) => {
					mocks.subscriptionListeners.add(listener);
					return () => mocks.subscriptionListeners.delete(listener);
				},
				() => mocks.subscriptionState,
				() => mocks.subscriptionState,
			);
			return { ...state, lastMessageAt: undefined, unsubscribe: undefined };
		},
	};
});

const errorReportingMocks = vi.hoisted(() => ({ reportClientError: vi.fn() }));

vi.mock("@/lib/error-reporting/client", () => errorReportingMocks);

vi.mock("@/hooks/trade/use-orderbook-mid-price", () => ({
	useOrderbookMidPrice: (coin: string | undefined) => {
		mocks.midPriceCoins.push(coin);
		return { isStale: false, midPx: "100", status: "active" };
	},
}));

import { MobileBookView } from "@/components/trade/mobile/mobile-book-view";

function createBook(coin: string, time = Date.now(), fast = true, levelCount = 1): BookEvent {
	return {
		coin,
		fast: fast ? true : undefined,
		levels: [
			Array.from({ length: levelCount }, (_, index) => ({ n: 1, px: String(99 - index), sz: "2" })),
			Array.from({ length: levelCount }, (_, index) => ({ n: 1, px: String(101 + index), sz: "3" })),
		],
		time,
	};
}

describe("mobile orderbook subscription lifecycle", () => {
	let container: HTMLDivElement;
	let marketSequence = 0;
	let root: Root;

	beforeEach(() => {
		marketSequence += 1;
		const marketName = `MOBILE_${marketSequence}`;
		mocks.market = {
			kind: "perp",
			markPx: "100",
			midPx: "100.25" as string | null | undefined,
			markPriceStatus: "success" as "idle" | "loading" | "success" | "stale" | "error",
			midPriceReceivedAt: Date.now() as number | undefined,
			name: marketName,
			pairName: `${marketName}-USDC`,
			szDecimals: 2,
		};
		mocks.midPriceCoins.length = 0;
		mocks.l2SubscriptionCalls.length = 0;
		mocks.subscriptionCalls.length = 0;
		mocks.env = "Mainnet";
		mocks.l2SubscriptionState = {
			data: undefined,
			error: undefined,
			isStale: false,
			status: "subscribing",
		};
		mocks.subscriptionState = {
			data: undefined,
			error: undefined,
			isStale: false,
			status: "subscribing",
		};
		errorReportingMocks.reportClientError.mockReset();
		getOrderbookActionsStore().actions.clearSelectedPrice();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		mocks.subscriptionListeners.clear();
		mocks.l2SubscriptionListeners.clear();
		container.remove();
		getOrderbookActionsStore().actions.clearSelectedPrice();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	function render(props: { active?: boolean; compact?: boolean } = {}) {
		act(() => {
			root.render(<MobileBookView active={props.active} compact={props.compact ?? true} inTabLayout view="book" />);
		});
	}

	function latestSubscriptionCall() {
		const call = mocks.subscriptionCalls.at(-1);
		if (!call) throw new Error("Missing l2Book subscription call");
		return call;
	}

	function latestL2SubscriptionCall() {
		const call = mocks.l2SubscriptionCalls.at(-1);
		if (!call) throw new Error("Missing l2 subscription call");
		return call;
	}

	function getAskPrice(price: string) {
		return container.querySelector<HTMLButtonElement>(`button[aria-label^="Ask, Price ${price},"]`);
	}

	async function selectPriceGrouping(label: string) {
		const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Price precision"]');
		if (!trigger) throw new Error("Missing price grouping control");
		await act(async () => trigger.click());
		const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
			(node) => node.textContent === label,
		);
		if (!item) throw new Error(`Missing price grouping ${label}`);
		await act(async () => item.click());
	}

	function setSubscriptionState(state: SubscriptionState) {
		act(() => {
			mocks.subscriptionState = state;
			mocks.l2SubscriptionState = {
				...state,
				data: state.data ? { ...state.data, fast: undefined } : undefined,
			};
			for (const listener of mocks.subscriptionListeners) listener();
			for (const listener of mocks.l2SubscriptionListeners) listener();
		});
	}

	it("uses the incremental feed only for compact books and isolates its cache identity", () => {
		setSubscriptionState({
			data: createBook(mocks.market.name),
			isStale: false,
			status: "active",
		});
		render({ compact: true });

		expect(latestL2SubscriptionCall().options.enabled).toBe(true);
		expect(latestL2SubscriptionCall().params).toEqual({ coin: mocks.market.name });
		expect(latestSubscriptionCall().options.enabled).toBe(false);
		expect(container.textContent).toContain("101.0");

		setSubscriptionState({
			data: createBook(mocks.market.name, Date.now(), false),
			isStale: false,
			status: "subscribing",
		});
		render({ compact: false });

		expect(latestL2SubscriptionCall().options.enabled).toBe(false);
		expect(latestSubscriptionCall().options.enabled).toBe(true);
		expect(latestSubscriptionCall().params.fast).toBeUndefined();
		expect(container.textContent).not.toContain("101.0");
	});

	it("shares one split summary across both sides without changing the feed or click behavior", () => {
		vi.useFakeTimers();
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
			bottom: 304,
			height: 304,
			left: 0,
			right: 400,
			top: 0,
			width: 400,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		});
		vi.stubGlobal(
			"ResizeObserver",
			class implements ResizeObserver {
				disconnect() {}
				observe() {}
				unobserve() {}
			},
		);
		setSubscriptionState({
			data: createBook(mocks.market.name, Date.now(), false, 3),
			isStale: false,
			status: "active",
		});
		render({ compact: false });
		const ask = container.querySelector<HTMLButtonElement>(
			'button[data-orderbook-side="ask"][data-orderbook-rank="1"]',
		);
		const bid = container.querySelector<HTMLButtonElement>(
			'button[data-orderbook-side="bid"][data-orderbook-rank="1"]',
		);
		if (!ask || !bid) throw new Error("Missing split rows");
		const subscription = latestSubscriptionCall();
		const listeners = mocks.subscriptionListeners.size;
		expect(ask.disabled).toBe(false);
		expect(bid.disabled).toBe(false);

		act(() => ask.dispatchEvent(createPointerEvent("pointermove")));
		expect(container.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
		expect(container.querySelector('[role="tooltip"]')?.getAttribute("data-price")).toBe("102");
		expect(container.querySelector('[role="tooltip"]')?.getAttribute("data-total")).toBe("6");
		expect(container.querySelector('[role="tooltip"]')?.textContent).toBe(`${mocks.market.name}/USDC`);
		expect(ask.dataset.orderbookHover).toBe("active");
		expect(ask.dataset.orderbookHoverEdge).toBe("bottom");
		expect(ask.hasAttribute("title")).toBe(false);
		expect(
			container
				.querySelector('button[data-orderbook-side="ask"][data-orderbook-rank="0"]')
				?.getAttribute("data-orderbook-hover"),
		).toBe("range");
		act(() => bid.dispatchEvent(createPointerEvent("pointermove")));
		expect(container.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
		expect(container.querySelector('[role="tooltip"]')?.getAttribute("data-price")).toBe("98");
		expect(ask.dataset.orderbookHover).toBeUndefined();
		expect(bid.dataset.orderbookHoverEdge).toBe("bottom");
		act(() => bid.click());
		expect(getOrderbookActionsStore().selectedPrice).toEqual({ marketName: mocks.market.name, price: "98" });
		getOrderbookActionsStore().actions.clearSelectedPrice();

		act(() => {
			ask.dispatchEvent(createPointerEvent("pointerdown", "touch"));
			vi.advanceTimersByTime(450);
		});
		expect(container.querySelector('[role="tooltip"]')?.getAttribute("data-price")).toBe("102");
		act(() => {
			ask.dispatchEvent(createPointerEvent("pointerup", "touch"));
			ask.click();
		});
		expect(getOrderbookActionsStore().selectedPrice).toBeNull();
		expect(latestSubscriptionCall()).toEqual(subscription);
		expect(mocks.subscriptionListeners.size).toBe(listeners);
		expect(latestL2SubscriptionCall().options.enabled).toBe(false);
		setSubscriptionState({
			data: createBook(mocks.market.name, Date.now(), false, 3),
			isStale: true,
			status: "active",
		});
		expect(container.querySelector('[role="tooltip"]')).toBeNull();
	});

	it("shows full split totals without abbreviating or truncating them", () => {
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
			bottom: 304,
			height: 304,
			left: 0,
			right: 400,
			top: 0,
			width: 400,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		});
		vi.stubGlobal(
			"ResizeObserver",
			class implements ResizeObserver {
				disconnect() {}
				observe() {}
				unobserve() {}
			},
		);
		setSubscriptionState({
			data: {
				coin: mocks.market.name,
				levels: [[{ n: 3, px: "0.004812", sz: "11780616" }], [{ n: 2, px: "0.004813", sz: "205000" }]],
				time: Date.now(),
			},
			isStale: false,
			status: "active",
		});
		render({ compact: false });

		const totals = [...container.querySelectorAll('[data-slot="orderbook-total-value"]')].map(
			(node) => node.textContent,
		);
		expect(totals).toEqual(["11,780,616.00", "205,000.00"]);
		expect(
			[...container.querySelectorAll('[data-slot="orderbook-total-value"]')].every(
				(node) => !node.parentElement?.className.includes("truncate"),
			),
		).toBe(true);
	});

	it("insets each split heading half to match the mobile data rows", () => {
		render({ compact: false });

		const headings = container.querySelector<HTMLElement>('[data-slot="split-orderbook-column-headings"]');
		const bidHeadings = container.querySelector<HTMLElement>('[data-slot="split-orderbook-bid-headings"]');
		const askHeadings = container.querySelector<HTMLElement>('[data-slot="split-orderbook-ask-headings"]');

		expect(headings?.className).toContain("gap-px");
		expect(headings?.className).not.toContain("px-2");
		expect(bidHeadings?.className).toContain("px-2");
		expect(askHeadings?.className).toContain("px-2");
		expect(container.querySelector('[data-slot="split-orderbook-bid-price-heading"]')?.textContent).toBe("Price");
		expect(container.querySelector('[data-slot="split-orderbook-ask-price-heading"]')?.textContent).toBe("Price");
	});

	it("asks the order form to switch the size unit from the split book menu, quote first like the official book", async () => {
		render({ compact: false });
		const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Size unit"]');
		expect(trigger?.textContent).toBe(mocks.market.name);

		await act(async () => trigger?.click());
		const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
		expect(items.map((item) => item.textContent)).toEqual(["USDC", mocks.market.name]);

		try {
			await act(async () => items[0]?.click());
			expect(getOrderbookActionsStore().sizeModeRequest).toEqual({ marketName: mocks.market.name, mode: "quote" });
		} finally {
			act(() => getOrderbookActionsStore().actions.clearSizeModeRequest());
		}
	});

	it("uses one shared compact observer to derive the two-sided slot budget", () => {
		let resizeObserverCount = 0;
		let observedElement: Element | undefined;
		vi.stubGlobal(
			"ResizeObserver",
			class implements ResizeObserver {
				constructor() {
					resizeObserverCount += 1;
				}

				disconnect() {}
				observe(element: Element) {
					observedElement = element;
				}
				unobserve() {}
			},
		);
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
			bottom: 304,
			height: 304,
			left: 0,
			right: 200,
			top: 0,
			width: 200,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		});
		setSubscriptionState({
			data: createBook(mocks.market.name, Date.now(), true, 20),
			isStale: false,
			status: "active",
		});

		render({ compact: true });

		for (const side of ["asks", "bids"]) {
			const ladder = container.querySelector<HTMLElement>(`[data-slot="compact-orderbook-${side}"]`);
			expect(ladder?.children.length).toBe(5);
			expect(
				[...(ladder?.children ?? [])].filter((child) => child.getAttribute("aria-hidden") === "true"),
			).toHaveLength(0);
		}
		expect(resizeObserverCount).toBe(1);
		expect(observedElement?.tagName).toBe("FIELDSET");
	});

	it("attaches the compact observer during an initial error and keeps it through recovery", () => {
		let resizeObserverCount = 0;
		let observedElement: Element | undefined;
		vi.stubGlobal(
			"ResizeObserver",
			class implements ResizeObserver {
				constructor() {
					resizeObserverCount += 1;
				}

				disconnect() {}
				observe(element: Element) {
					observedElement = element;
				}
				unobserve() {}
			},
		);
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
			bottom: 304,
			height: 304,
			left: 0,
			right: 200,
			top: 0,
			width: 200,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		});
		setSubscriptionState({
			data: undefined,
			error: new Error("order book unavailable"),
			isStale: false,
			status: "error",
		});
		render({ compact: true });
		const initialFieldset = container.querySelector("fieldset");

		expect(initialFieldset).toBe(observedElement);
		expect(resizeObserverCount).toBe(1);
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(container.querySelector('[aria-label="Price precision"]')).not.toBeNull();
		expect(container.querySelectorAll("button[data-mode]")).toHaveLength(3);

		setSubscriptionState({
			data: createBook(mocks.market.name, Date.now(), true, 20),
			isStale: false,
			status: "active",
		});
		render({ compact: true });

		expect(container.querySelector("fieldset")).toBe(initialFieldset);
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(container.querySelectorAll('button[aria-label^="Ask,"]')).toHaveLength(5);
		expect(container.querySelectorAll('button[aria-label^="Bid,"]')).toHaveLength(5);
		expect(resizeObserverCount).toBe(1);
	});

	it("fails over immediately to the public fast feed without reusing the incremental snapshot", () => {
		setSubscriptionState({
			data: createBook(mocks.market.name, Date.now(), false, 6),
			isStale: false,
			status: "active",
		});
		render({ compact: true });
		act(() => container.querySelector<HTMLButtonElement>('button[data-mode="asks"]')?.click());
		expect(getAskPrice("106.00")).not.toBeNull();

		act(() => {
			mocks.l2SubscriptionState = {
				data: createBook(mocks.market.name, Date.now(), false, 6),
				error: new Error("private stream failed"),
				isStale: false,
				status: "error",
			};
			mocks.subscriptionState = {
				data: createBook(mocks.market.name, Date.now(), true, 5),
				error: undefined,
				isStale: false,
				status: "active",
			};
			for (const listener of mocks.l2SubscriptionListeners) listener();
			for (const listener of mocks.subscriptionListeners) listener();
		});

		expect(latestSubscriptionCall().options.enabled).toBe(true);
		expect(latestSubscriptionCall().params.fast).toBe(true);
		expect(getAskPrice("106.00")).toBeNull();
		const asks = container.querySelector<HTMLElement>('[data-slot="compact-orderbook-asks"]');
		expect(asks?.children.length).toBe(11);
		expect(asks?.querySelectorAll("button")).toHaveLength(5);
		expect(asks?.querySelectorAll('[data-slot="compact-orderbook-row-position"] > [aria-hidden="true"]')).toHaveLength(
			6,
		);
		expect(errorReportingMocks.reportClientError).toHaveBeenCalledOnce();
		expect(errorReportingMocks.reportClientError).toHaveBeenCalledWith(expect.any(Error), {
			kind: "orderbook_l2_fallback",
			fallbackReason: "subscribe_failed",
		});
	});

	it("uses server mid independently of BBO and book prices without a compact BBO subscription", () => {
		render();
		const price = () => container.querySelector('[data-slot="compact-orderbook-mid-price"]')?.textContent;
		expect(price()).toBe("$100.25");
		expect(mocks.midPriceCoins.every((coin) => coin === undefined)).toBe(true);
		mocks.market.midPx = "105";
		render();
		expect(price()).toBe("$105.00");
		mocks.market.midPx = null;
		render();
		expect(price()).toBe("-");
		mocks.market.midPx = "98";
		render();
		expect(price()).toBe("$98.00");
		expect(container.querySelector('[data-slot="compact-orderbook-mid"]')?.getAttribute("data-direction")).toBe("flat");
	});

	it.each(["idle", "loading", "stale", "error"] as const)(
		"hides server mid during %s and restores it on recovery",
		(status) => {
			mocks.market.markPriceStatus = status;
			render();
			expect(container.querySelector('[data-slot="compact-orderbook-mid-price"]')?.textContent).toBe("-");
			mocks.market.markPriceStatus = "success";
			render();
			expect(container.querySelector('[data-slot="compact-orderbook-mid-price"]')?.textContent).toBe("$100.25");
		},
	);

	it.each([undefined, Date.now() - 60_000])("hides a server mid without a current receipt: %s", (receivedAt) => {
		mocks.market.midPriceReceivedAt = receivedAt;
		render();
		expect(container.querySelector('[data-slot="compact-orderbook-mid-price"]')?.textContent).toBe("-");
	});

	it("establishes a new direction baseline when the selected market changes", () => {
		render();
		mocks.market = { ...mocks.market, name: "NEXT", midPx: "200", kind: "spot" };
		render();
		expect(container.querySelector('[data-slot="compact-orderbook-mid-price"]')?.textContent).toBe("$200.00");
		expect(container.querySelector('[data-slot="compact-orderbook-mid"]')?.getAttribute("data-direction")).toBe("flat");
	});

	it("keeps BBO available for the ordinary split spread", () => {
		render({ compact: false });
		expect(mocks.midPriceCoins.at(-1)).toBe(mocks.market.name);
	});

	it("keeps an inactive book warm for ten seconds and then releases the subscription", () => {
		render({ active: true });
		expect(latestL2SubscriptionCall().options.enabled).toBe(true);
		expect(mocks.midPriceCoins.at(-1)).toBeUndefined();

		vi.useFakeTimers();
		render({ active: false });
		expect(latestL2SubscriptionCall().options.enabled).toBe(true);
		expect(mocks.midPriceCoins.at(-1)).toBeUndefined();

		act(() => vi.advanceTimersByTime(9_999));
		expect(latestL2SubscriptionCall().options.enabled).toBe(true);

		act(() => vi.advanceTimersByTime(1));
		expect(latestL2SubscriptionCall().options.enabled).toBe(false);
	});

	it("never presents an old market snapshot under the newly selected market", () => {
		const previousMarket = mocks.market.name;
		setSubscriptionState({
			data: createBook(previousMarket),
			isStale: false,
			status: "active",
		});
		render();
		expect(container.textContent).toContain("101.0");

		mocks.market = {
			...mocks.market,
			name: `${previousMarket}_NEXT`,
			pairName: `${previousMarket}_NEXT-USDC`,
		};
		setSubscriptionState({
			data: createBook(previousMarket),
			isStale: false,
			status: "subscribing",
		});
		render();

		expect(latestSubscriptionCall().params.coin).toBe(`${previousMarket}_NEXT`);
		expect(container.textContent).not.toContain("101.0");
		expect(container.querySelector('fieldset[aria-busy="true"]')).not.toBeNull();
	});

	it.each([
		{ isStale: false, status: "error" as const },
		{ isStale: true, status: "active" as const },
	])("removes clickable prices after a subscription failure: $status stale=$isStale", ({ isStale, status }) => {
		setSubscriptionState({
			data: createBook(mocks.market.name),
			isStale: false,
			status: "active",
		});
		render();
		expect(getAskPrice("101.00")).not.toBeNull();

		setSubscriptionState({
			data: createBook(mocks.market.name),
			isStale,
			status,
		});
		render();

		expect(getAskPrice("101.00")).toBeNull();
		expect(container.textContent).not.toContain("Failed to load order book");
		expect(container.querySelector('[role="alert"]')).toBeNull();
	});

	it("shows a same-key cache as busy and prevents cached price selection", async () => {
		setSubscriptionState({
			data: createBook(mocks.market.name),
			isStale: false,
			status: "active",
		});
		render();
		await act(async () => {});

		setSubscriptionState({ data: undefined, isStale: false, status: "subscribing" });
		render();

		const cachedPrice = getAskPrice("101.00");
		expect(cachedPrice).not.toBeNull();
		expect(container.querySelector('[data-slot="orderbook-busy-overlay"]')).not.toBeNull();
		const loadingStatus = container.querySelector('output[aria-live="polite"]');
		expect(loadingStatus?.textContent).toContain("Waiting for order book");
		expect(container.querySelector('fieldset[aria-busy="true"] output[aria-live="polite"]')).toBeNull();
		expect(cachedPrice?.matches(":disabled")).toBe(true);

		act(() => cachedPrice?.click());
		expect(getOrderbookActionsStore().selectedPrice).toBeNull();
	});

	it("uses local receipt time instead of rejecting a valid snapshot because the device clock differs", () => {
		setSubscriptionState({
			data: createBook(mocks.market.name, 1),
			isStale: false,
			status: "active",
		});
		render();

		expect(container.textContent).toContain("101.0");
	});

	it("does not reuse a cached snapshot after the network environment changes", async () => {
		setSubscriptionState({
			data: createBook(mocks.market.name),
			isStale: false,
			status: "active",
		});
		render();
		await act(async () => {});
		expect(container.textContent).toContain("101.0");

		mocks.env = "Testnet";
		setSubscriptionState({ data: undefined, isStale: false, status: "subscribing" });
		render();

		expect(container.textContent).not.toContain("101.0");
		expect(container.querySelector('fieldset[aria-busy="true"]')).not.toBeNull();
	});

	it.each([
		{ first: "0.01", second: "0.1", firstParams: {}, secondParams: { nSigFigs: 4 }, secondPrice: "111.0" },
		{
			first: "0.02",
			second: "0.05",
			firstParams: { nSigFigs: 5, mantissa: 2 },
			secondParams: { nSigFigs: 5, mantissa: 5 },
			secondPrice: "111.00",
		},
	])(
		"isolates cached snapshots when price grouping changes from $first to $second",
		async ({ first, second, firstParams, secondParams, secondPrice }) => {
			render();
			await selectPriceGrouping(first);
			expect(latestL2SubscriptionCall().params).toEqual({ coin: mocks.market.name, ...firstParams });
			setSubscriptionState({ data: createBook(mocks.market.name), isStale: false, status: "active" });
			await act(async () => {});
			expect(getAskPrice("101.00")).not.toBeNull();
			setSubscriptionState({ data: undefined, isStale: false, status: "subscribing" });

			await selectPriceGrouping(second);
			expect(latestL2SubscriptionCall().params).toEqual({ coin: mocks.market.name, ...secondParams });
			expect(getAskPrice("101.00")).toBeNull();
			expect(container.querySelector('fieldset[aria-busy="true"]')).not.toBeNull();

			const secondBook = createBook(mocks.market.name);
			secondBook.levels = [[{ n: 1, px: "109", sz: "4" }], [{ n: 1, px: "111", sz: "5" }]];
			setSubscriptionState({ data: secondBook, isStale: false, status: "active" });
			await act(async () => {});
			expect(getAskPrice(secondPrice)).not.toBeNull();
			setSubscriptionState({ data: undefined, isStale: false, status: "subscribing" });

			await selectPriceGrouping(first);
			const firstCachedPrice = getAskPrice("101.00");
			expect(firstCachedPrice).not.toBeNull();
			expect(firstCachedPrice?.matches(":disabled")).toBe(true);
			expect(getAskPrice(secondPrice)).toBeNull();
			act(() => firstCachedPrice?.click());
			expect(getOrderbookActionsStore().selectedPrice).toBeNull();
			expect(container.querySelector('[data-slot="orderbook-level-pulse"]')).toBeNull();
		},
	);

	it("removes a disabled cached snapshot when its local receipt TTL expires", async () => {
		vi.useFakeTimers();
		setSubscriptionState({
			data: createBook(mocks.market.name),
			isStale: false,
			status: "active",
		});
		render();
		await act(async () => {});
		setSubscriptionState({ data: undefined, isStale: false, status: "subscribing" });
		render();
		expect(getAskPrice("101.00")).not.toBeNull();

		act(() => vi.advanceTimersByTime(10_001));

		expect(getAskPrice("101.00")).toBeNull();
	});

	it("expires a disabled cache even when the system clock moves backwards", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000_000);
		setSubscriptionState({
			data: createBook(mocks.market.name),
			isStale: false,
			status: "active",
		});
		render();
		await act(async () => {});
		const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(0);
		try {
			setSubscriptionState({ data: undefined, isStale: false, status: "subscribing" });
			render();
			expect(getAskPrice("101.00")).not.toBeNull();

			act(() => vi.advanceTimersByTime(10_001));
			expect(getAskPrice("101.00")).toBeNull();
		} finally {
			dateNowSpy.mockRestore();
		}
	});
});
