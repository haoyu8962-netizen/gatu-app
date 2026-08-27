/** @vitest-environment jsdom */

import { act } from "react";
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

const mocks = vi.hoisted(() => ({
	env: "Mainnet",
	market: {
		kind: "perp",
		markPx: "100",
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
		expect(container.querySelector('[role="alert"]')?.className).toContain("text-xs");
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

	it("keeps an inactive book warm for ten seconds and then releases the subscription", () => {
		render({ active: true });
		expect(latestL2SubscriptionCall().options.enabled).toBe(true);
		expect(mocks.midPriceCoins.at(-1)).toBe(mocks.market.name);

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
		expect(container.textContent).toContain("Failed to load order book");
		expect(container.querySelector('[role="alert"]')).not.toBeNull();
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
