/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrderbookActionsStore } from "@/stores/use-orderbook-actions-store";
import { createI18nRoot } from "./harness/react";

type BookEvent = {
	coin: string;
	fast?: true;
	levels: [[{ n: number; px: string; sz: string }], [{ n: number; px: string; sz: string }]];
	time: number;
};

type SubscriptionState = {
	data?: BookEvent;
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
			return { ...state, error: undefined, unsubscribe: undefined };
		},
	};
});

vi.mock("@/hooks/trade/use-orderbook-mid-price", () => ({
	useOrderbookMidPrice: (coin: string | undefined) => {
		mocks.midPriceCoins.push(coin);
		return { isStale: false, midPx: "100", status: "active" };
	},
}));

import { MobileBookView } from "@/components/trade/mobile/mobile-book-view";

function createBook(coin: string, time = Date.now(), fast = true): BookEvent {
	return {
		coin,
		fast: fast ? true : undefined,
		levels: [[{ n: 1, px: "99", sz: "2" }], [{ n: 1, px: "101", sz: "3" }]],
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
		mocks.subscriptionCalls.length = 0;
		mocks.env = "Mainnet";
		mocks.subscriptionState = { data: undefined, isStale: false, status: "subscribing" };
		getOrderbookActionsStore().actions.clearSelectedPrice();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		mocks.subscriptionListeners.clear();
		container.remove();
		getOrderbookActionsStore().actions.clearSelectedPrice();
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

	function setSubscriptionState(state: SubscriptionState) {
		act(() => {
			mocks.subscriptionState = state;
			for (const listener of mocks.subscriptionListeners) listener();
		});
	}

	it("uses the fast five-level feed only for compact books and isolates its cache identity", () => {
		setSubscriptionState({
			data: createBook(mocks.market.name),
			isStale: false,
			status: "active",
		});
		render({ compact: true });

		expect(latestSubscriptionCall().params.fast).toBe(true);
		expect(container.textContent).toContain("101.0");

		setSubscriptionState({
			data: createBook(mocks.market.name, Date.now(), false),
			isStale: false,
			status: "subscribing",
		});
		render({ compact: false });

		expect(latestSubscriptionCall().params.fast).toBeUndefined();
		expect(container.textContent).not.toContain("101.0");
	});

	it("keeps an inactive book warm for ten seconds and then releases the subscription", () => {
		render({ active: true });
		expect(latestSubscriptionCall().options.enabled).toBe(true);
		expect(mocks.midPriceCoins.at(-1)).toBe(mocks.market.name);

		vi.useFakeTimers();
		render({ active: false });
		expect(latestSubscriptionCall().options.enabled).toBe(true);
		expect(mocks.midPriceCoins.at(-1)).toBeUndefined();

		act(() => vi.advanceTimersByTime(9_999));
		expect(latestSubscriptionCall().options.enabled).toBe(true);

		act(() => vi.advanceTimersByTime(1));
		expect(latestSubscriptionCall().options.enabled).toBe(false);
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
		expect(container.querySelector('button[title="101.00"]')).not.toBeNull();

		setSubscriptionState({
			data: createBook(mocks.market.name),
			isStale,
			status,
		});
		render();

		expect(container.querySelector('button[title="101.00"]')).toBeNull();
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

		const cachedPrice = container.querySelector<HTMLButtonElement>('button[title="101.00"]');
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
		expect(container.querySelector('button[title="101.00"]')).not.toBeNull();

		act(() => vi.advanceTimersByTime(10_001));

		expect(container.querySelector('button[title="101.00"]')).toBeNull();
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
			expect(container.querySelector('button[title="101.00"]')).not.toBeNull();

			act(() => vi.advanceTimersByTime(10_001));
			expect(container.querySelector('button[title="101.00"]')).toBeNull();
		} finally {
			dateNowSpy.mockRestore();
		}
	});
});
