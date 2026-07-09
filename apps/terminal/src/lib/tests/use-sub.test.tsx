// @vitest-environment jsdom

import { useSubscription } from "@gatu/hl-react/hooks/useSubscription";
import { useSub } from "@gatu/hl-react/hooks/utils/useSub";
import { HyperliquidContext, type HyperliquidContextValue, HyperliquidStoreContext } from "@gatu/hl-react/provider";
import { createHyperliquidStore, getStoreInternals, type HyperliquidStore } from "@gatu/hl-react/store";
import type { SubscriptionClient } from "@nktkas/hyperliquid";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

	function FullWrapper({ children, subscription }: { children: ReactNode; subscription: SubscriptionClient }) {
		const value: HyperliquidContextValue = {
			info: {} as HyperliquidContextValue["info"],
			subscription,
			env: "Testnet",
			isTestnet: true,
			builderConfig: { b: "0x0000000000000000000000000000000000000000", f: 0 },
			agentName: "test",
			clientKey: "0x0000000000000000000000000000000000000000",
			sessionMode: "wallet",
		};

		return createElement(
			HyperliquidStoreContext.Provider,
			{ value: store },
			createElement(HyperliquidContext.Provider, { value }, children),
		);
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

		const runtime = getStoreInternals(store).subscriptionRuntime;
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

		const runtime = getStoreInternals(store).subscriptionRuntime;
		expect(runtime.has(key)).toBe(false);
		expect(store.getState().subscriptions[key]).toBeUndefined();

		act(() => {
			root.render(createElement(Wrapper, null, null));
		});
		await act(() => vi.advanceTimersByTimeAsync(0));
	});

	it("uses refreshKey to resubscribe without changing SDK params", async () => {
		const unsubscribes: Array<ReturnType<typeof vi.fn>> = [];
		const l2Book = vi.fn(async () => {
			const unsubscribe = vi.fn(async () => {});
			unsubscribes.push(unsubscribe);
			return {
				unsubscribe,
				failureSignal: new AbortController().signal,
			};
		});
		const subscription = { l2Book } as unknown as SubscriptionClient;

		function Consumer({ refreshKey }: { refreshKey: string }) {
			useSubscription("l2Book", { coin: "ETH" }, { refreshKey });
			return null;
		}

		act(() => {
			root.render(createElement(FullWrapper, { subscription }, createElement(Consumer, { refreshKey: "ledger-a" })));
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		expect(l2Book).toHaveBeenCalledTimes(1);

		act(() => {
			root.render(createElement(FullWrapper, { subscription }, createElement(Consumer, { refreshKey: "ledger-b" })));
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
		expect(l2Book).toHaveBeenCalledTimes(2);
		expect(l2Book.mock.calls.map(([params]) => params)).toEqual([{ coin: "ETH" }, { coin: "ETH" }]);

		act(() => {
			root.render(createElement(FullWrapper, { subscription }, null));
		});
		await act(() => vi.advanceTimersByTimeAsync(0));
	});
});
