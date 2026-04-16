// @vitest-environment jsdom

import { useSub } from "@hypeterminal/hl-react/hooks/utils/useSub";
import { HyperliquidStoreContext } from "@hypeterminal/hl-react/provider";
import { createHyperliquidStore, type HyperliquidStore, type StoreInternals } from "@hypeterminal/hl-react/store";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function getInternals(store: HyperliquidStore): StoreInternals {
	return (store as unknown as { __internals: StoreInternals }).__internals;
}

function createFakeSubscription() {
	const failureController = new AbortController();
	return {
		subscribe: async () => ({
			unsubscribe: async () => {},
			failureSignal: failureController.signal,
		}),
		failureController,
	};
}

describe("useSub hook surface", () => {
	let store: HyperliquidStore;
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(async () => {
		vi.useFakeTimers();
		vi.resetModules();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		store = createHyperliquidStore({ ssr: false, triggerReconnect: vi.fn() });
		container = document.createElement("div");
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		vi.useRealTimers();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
	});

	function Wrapper({ children }: { children: ReactNode }) {
		return createElement(HyperliquidStoreContext.Provider, { value: store }, children);
	}

	it("acquires on mount and releases on unmount", async () => {
		const key = JSON.stringify(["hl", "subscription", "l2Book", { coin: "ETH" }]);
		const { subscribe } = createFakeSubscription();

		function Consumer() {
			useSub(key, () => subscribe(), {});
			return null;
		}

		act(() => {
			root.render(createElement(Wrapper, null, createElement(Consumer)));
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		const runtime = getInternals(store).subscriptionRuntime;
		expect(runtime.has(key)).toBe(true);
		expect(runtime.get(key)?.refCount).toBe(1);

		act(() => {
			root.render(createElement(Wrapper, null, null));
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		expect(runtime.has(key)).toBe(false);
	});

	it("exposes isStale that flips with store state", async () => {
		const key = JSON.stringify(["hl", "subscription", "l2Book", { coin: "BTC" }]);
		const { subscribe } = createFakeSubscription();
		let captured: { isStale: boolean; status: string } = { isStale: false, status: "idle" };

		function Consumer() {
			const result = useSub(key, () => subscribe(), {});
			captured = { isStale: result.isStale, status: result.status };
			return null;
		}

		act(() => {
			root.render(createElement(Wrapper, null, createElement(Consumer)));
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		act(() => {
			store.getState().setSubscriptionData(key, { levels: [] });
		});
		expect(captured.isStale).toBe(false);

		await act(() => vi.advanceTimersByTimeAsync(25_000));

		expect(captured.isStale).toBe(true);

		act(() => {
			store.getState().setSubscriptionData(key, { levels: [1] });
		});
		expect(captured.isStale).toBe(false);

		act(() => {
			root.render(createElement(Wrapper, null, null));
		});
		await act(() => vi.advanceTimersByTimeAsync(0));
	});

	it("plumbs maxStaleMs override to the store", async () => {
		const key = JSON.stringify(["hl", "subscription", "l2Book", { coin: "SOL" }]);
		const { subscribe } = createFakeSubscription();
		let captured = { isStale: false };

		function Consumer() {
			const result = useSub(key, () => subscribe(), { maxStaleMs: 5_000 });
			captured = { isStale: result.isStale };
			return null;
		}

		act(() => {
			root.render(createElement(Wrapper, null, createElement(Consumer)));
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		act(() => {
			store.getState().setSubscriptionData(key, {});
		});

		await act(() => vi.advanceTimersByTimeAsync(5_000));
		expect(captured.isStale).toBe(false);

		await act(() => vi.advanceTimersByTimeAsync(5_000));
		expect(captured.isStale).toBe(true);

		act(() => {
			root.render(createElement(Wrapper, null, null));
		});
		await act(() => vi.advanceTimersByTimeAsync(0));
	});

	it("does not subscribe when enabled is false", async () => {
		const key = JSON.stringify(["hl", "subscription", "trades", { coin: "ETH" }]);
		const { subscribe } = createFakeSubscription();

		function Consumer() {
			useSub(key, () => subscribe(), { enabled: false });
			return null;
		}

		act(() => {
			root.render(createElement(Wrapper, null, createElement(Consumer)));
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		const runtime = getInternals(store).subscriptionRuntime;
		expect(runtime.has(key)).toBe(false);
		expect(store.getState().subscriptions[key]).toBeUndefined();

		act(() => {
			root.render(createElement(Wrapper, null, null));
		});
		await act(() => vi.advanceTimersByTimeAsync(0));
	});
});
