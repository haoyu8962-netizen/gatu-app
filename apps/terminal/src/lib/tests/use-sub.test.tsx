// @vitest-environment jsdom

import { OversizedWebSocketPayloadError } from "@gatu/hl-react";
import { useSubscription } from "@gatu/hl-react/hooks/useSubscription";
import { useSub } from "@gatu/hl-react/hooks/utils/useSub";
import { HyperliquidContext, type HyperliquidContextValue, HyperliquidStoreContext } from "@gatu/hl-react/provider";
import { createHyperliquidStore, getStoreInternals, type HyperliquidStore } from "@gatu/hl-react/store";
import type { L2BookWsEvent, SubscriptionClient, TradesWsEvent } from "@nktkas/hyperliquid";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createFakeSubscription() {
	return {
		subscribe: async () => ({
			unsubscribe: async () => {},
		}),
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
			exchangeLifecycle: { id: Symbol("use-sub-test-provider"), active: true },
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

	it.each([
		{ method: "bbo", throttleMs: 16 },
		{ method: "allMids", throttleMs: undefined },
	])("ignores a delayed old $method listener after same-key reacquisition", async ({ method, throttleMs }) => {
		const params = method === "allMids" ? { dex: "" } : { coin: "ETH" };
		const key = JSON.stringify(["hl", "subscription", method, params]);
		const listeners: Array<(data: { sequence: number }) => void> = [];
		let captured: { data: { sequence: number } | undefined; status: string } = {
			data: undefined,
			status: "idle",
		};
		const subscribe = vi.fn(async (listener: (data: { sequence: number }) => void) => {
			listeners.push(listener);
			return { unsubscribe: vi.fn(async () => {}) };
		});

		function Consumer() {
			const result = useSub(key, subscribe, { throttleMs });
			captured = { data: result.data, status: result.status };
			return null;
		}

		act(() => {
			root.render(<Wrapper>{createElement(Consumer, { key: "old" })}</Wrapper>);
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		act(() => {
			root.render(<Wrapper>{createElement(Consumer, { key: "current" })}</Wrapper>);
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		expect(listeners).toHaveLength(2);
		expect(captured).toEqual({ data: undefined, status: "active" });

		act(() => listeners[0]?.({ sequence: 1 }));
		await act(() => vi.advanceTimersByTimeAsync(16));
		expect(captured).toEqual({ data: undefined, status: "active" });

		act(() => listeners[1]?.({ sequence: 2 }));
		await act(() => vi.advanceTimersByTimeAsync(16));
		expect(captured).toEqual({ data: { sequence: 2 }, status: "active" });
	});

	it("keeps a shared throttled runtime live when its acquiring consumer unmounts", async () => {
		vi.setSystemTime(1_000);
		const key = JSON.stringify(["hl", "subscription", "bbo", { coin: "ETH" }]);
		const listeners: Array<(data: { sequence: number }) => void> = [];
		const unsubscribe = vi.fn(async () => {});
		const setSubscriptionData = vi.spyOn(store.getState(), "setSubscriptionData");
		const captured: Record<string, { sequence: number } | undefined> = {};
		const subscribe = vi.fn(async (listener: (data: { sequence: number }) => void) => {
			listeners.push(listener);
			return { unsubscribe };
		});

		function Consumer({ consumer }: { consumer: string }) {
			captured[consumer] = useSub<{ sequence: number }>(key, subscribe, { throttleMs: 16 }).data;
			return null;
		}

		act(() => {
			root.render(
				<Wrapper>
					<Consumer key="owner" consumer="owner" />
					<Consumer key="shared" consumer="shared" />
				</Wrapper>,
			);
		});
		await act(() => vi.advanceTimersByTimeAsync(0));
		expect(listeners).toHaveLength(1);

		act(() => listeners[0]?.({ sequence: 1 }));
		expect(captured.shared).toEqual({ sequence: 1 });

		act(() => listeners[0]?.({ sequence: 2 }));
		expect(captured.shared).toEqual({ sequence: 1 });

		act(() => {
			root.render(
				<Wrapper>
					<Consumer key="shared" consumer="shared" />
				</Wrapper>,
			);
		});
		expect(unsubscribe).not.toHaveBeenCalled();
		expect(getStoreInternals(store).subscriptionRuntime.get(key)?.refCount).toBe(1);

		await act(() => vi.advanceTimersByTimeAsync(16));
		expect(captured.shared).toEqual({ sequence: 2 });
		expect(setSubscriptionData).toHaveBeenCalledTimes(2);

		act(() => listeners[0]?.({ sequence: 3 }));
		act(() => {
			root.render(<Wrapper>{null}</Wrapper>);
		});
		await act(() => vi.advanceTimersByTimeAsync(16));
		expect(setSubscriptionData).toHaveBeenCalledTimes(2);
	});

	it("drops queued throttled data instead of flushing it during cleanup", async () => {
		vi.setSystemTime(1_000);
		const key = JSON.stringify(["hl", "subscription", "bbo", { coin: "ETH" }]);
		const listeners: Array<(data: { sequence: number }) => void> = [];
		const setSubscriptionData = vi.spyOn(store.getState(), "setSubscriptionData");

		function Consumer() {
			useSub<{ sequence: number }>(
				key,
				async (listener) => {
					listeners.push(listener);
					return { unsubscribe: vi.fn(async () => {}) };
				},
				{ throttleMs: 16 },
			);
			return null;
		}

		act(() => {
			root.render(<Wrapper>{createElement(Consumer)}</Wrapper>);
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		act(() => listeners[0]?.({ sequence: 1 }));
		expect(setSubscriptionData).toHaveBeenCalledTimes(1);
		setSubscriptionData.mockClear();

		act(() => listeners[0]?.({ sequence: 2 }));
		expect(setSubscriptionData).not.toHaveBeenCalled();

		act(() => {
			root.render(<Wrapper>{null}</Wrapper>);
		});
		expect(setSubscriptionData).not.toHaveBeenCalled();

		await act(() => vi.advanceTimersByTimeAsync(16));
		expect(setSubscriptionData).not.toHaveBeenCalled();
	});

	it("exposes isStale that flips with store state", async () => {
		const key = JSON.stringify(["hl", "subscription", "allMids", { dex: "" }]);
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
			store.getState().setSubscriptionData(key, { mids: {} });
		});
		expect(captured.isStale).toBe(false);

		await act(() => vi.advanceTimersByTimeAsync(25_000));

		expect(captured.isStale).toBe(true);

		act(() => {
			store.getState().setSubscriptionData(key, { mids: { BTC: "1" } });
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

	it("keeps oversized account payloads instead of silently dropping balances", async () => {
		const key = JSON.stringify(["hl", "subscription", "openOrders", { user: "0xabc" }]);
		let emit: ((data: { orders: string[] }) => void) | undefined;
		let captured: { data: { orders: string[] } | undefined; status: string } = {
			data: undefined,
			status: "idle",
		};

		function Consumer() {
			const result = useSub<{ orders: string[] }>(
				key,
				async (listener) => {
					emit = listener;
					return { unsubscribe: async () => {} };
				},
				{ maxPayloadBytes: 1 },
			);
			captured = { data: result.data, status: result.status };
			return null;
		}

		act(() => {
			root.render(createElement(Wrapper, null, createElement(Consumer)));
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		act(() => emit?.({ orders: ["large-account-payload"] }));

		expect(captured.status).toBe("active");
		expect(captured.data).toEqual({ orders: ["large-account-payload"] });
	});

	it("surfaces oversized market payloads as observable subscription errors", async () => {
		const key = JSON.stringify(["hl", "subscription", "l2Book", { coin: "ETH" }]);
		let emit: ((data: { levels: string[] }) => void) | undefined;
		let captured: { error: unknown; status: string } = { error: undefined, status: "idle" };

		function Consumer() {
			const result = useSub<{ levels: string[] }>(
				key,
				async (listener) => {
					emit = listener;
					return { unsubscribe: async () => {} };
				},
				{ maxPayloadBytes: 1 },
			);
			captured = { error: result.error, status: result.status };
			return null;
		}

		act(() => {
			root.render(createElement(Wrapper, null, createElement(Consumer)));
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		act(() => emit?.({ levels: ["large-market-payload"] }));

		expect(captured.status).toBe("error");
		expect(captured.error).toBeInstanceOf(OversizedWebSocketPayloadError);
	});

	it.each(["l2Book", "bbo"])("does not apply queued %s data after the SDK reports an error", async (method) => {
		const key = JSON.stringify(["hl", "subscription", method, { coin: "ETH" }]);
		let emit: ((data: { sequence: number }) => void) | undefined;
		let reportError: ((error: unknown) => void) | undefined;
		let captured: { data: { sequence: number } | undefined; status: string } = {
			data: undefined,
			status: "idle",
		};

		function Consumer() {
			const result = useSub<{ sequence: number }>(
				key,
				async (listener, failureOptions) => {
					emit = listener;
					reportError = failureOptions?.onError;
					return { unsubscribe: async () => {} };
				},
				{ throttleMs: 16 },
			);
			captured = { data: result.data, status: result.status };
			return null;
		}

		act(() => {
			root.render(createElement(Wrapper, null, createElement(Consumer)));
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		act(() => emit?.({ sequence: 1 }));
		expect(captured.data).toEqual({ sequence: 1 });
		act(() => emit?.({ sequence: 2 }));
		act(() => reportError?.(new Error("socket failed")));

		expect(captured).toEqual({ data: undefined, status: "error" });
		await act(() => vi.advanceTimersByTimeAsync(16));
		expect(captured).toEqual({ data: undefined, status: "error" });
	});

	it.each(["l2Book", "bbo"])("does not apply queued %s data after the subscribe promise rejects", async (method) => {
		const key = JSON.stringify(["hl", "subscription", method, { coin: "ETH" }]);
		let emit: ((data: { sequence: number }) => void) | undefined;
		let rejectSubscription: ((error: unknown) => void) | undefined;
		let captured: { data: { sequence: number } | undefined; status: string } = {
			data: undefined,
			status: "idle",
		};

		function Consumer() {
			const result = useSub<{ sequence: number }>(
				key,
				(listener) => {
					emit = listener;
					return new Promise((_, reject) => {
						rejectSubscription = reject;
					});
				},
				{ throttleMs: 16 },
			);
			captured = { data: result.data, status: result.status };
			return null;
		}

		act(() => {
			root.render(createElement(Wrapper, null, createElement(Consumer)));
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		act(() => emit?.({ sequence: 1 }));
		expect(captured.data).toEqual({ sequence: 1 });
		act(() => emit?.({ sequence: 2 }));
		await act(async () => rejectSubscription?.(new Error("subscribe failed")));

		expect(captured).toEqual({ data: undefined, status: "error" });
		await act(() => vi.advanceTimersByTimeAsync(16));
		expect(captured).toEqual({ data: undefined, status: "error" });
	});

	it("uses refreshKey to resubscribe without changing SDK params", async () => {
		const unsubscribes: Array<ReturnType<typeof vi.fn>> = [];
		const l2Book = vi.fn(async (..._args: unknown[]) => {
			const unsubscribe = vi.fn(async () => {});
			unsubscribes.push(unsubscribe);
			return {
				unsubscribe,
			};
		});
		const subscription = { l2Book } as unknown as SubscriptionClient;

		function Consumer({ refreshKey }: { refreshKey: string }) {
			useSubscription("l2Book", { coin: "ETH" }, { refreshKey });
			return null;
		}

		act(() => {
			root.render(
				<FullWrapper subscription={subscription}>
					<Consumer refreshKey="ledger-a" />
				</FullWrapper>,
			);
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		expect(l2Book).toHaveBeenCalledTimes(1);

		act(() => {
			root.render(
				<FullWrapper subscription={subscription}>
					<Consumer refreshKey="ledger-b" />
				</FullWrapper>,
			);
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
		expect(l2Book).toHaveBeenCalledTimes(2);
		expect(l2Book.mock.calls.map(([params]) => params)).toEqual([{ coin: "ETH" }, { coin: "ETH" }]);

		act(() => {
			root.render(<FullWrapper subscription={subscription}>{null}</FullWrapper>);
		});
		await act(() => vi.advanceTimersByTimeAsync(0));
	});

	it("filters SDK l2Book channel cross-talk before it reaches the shared store", async () => {
		let emit: ((event: L2BookWsEvent) => void) | undefined;
		let captured: L2BookWsEvent | undefined;
		const l2Book = vi.fn(async (_params: unknown, listener: (event: L2BookWsEvent) => void) => {
			emit = listener;
			return { unsubscribe: vi.fn(async () => {}) };
		});
		const subscription = { l2Book } as unknown as SubscriptionClient;

		function Consumer() {
			captured = useSubscription("l2Book", { coin: "ETH", fast: true }).data;
			return null;
		}

		act(() => {
			root.render(
				<FullWrapper subscription={subscription}>
					<Consumer />
				</FullWrapper>,
			);
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		act(() => emit?.({ coin: "ETH", levels: [[], []], time: 1 }));
		await act(() => vi.advanceTimersByTimeAsync(16));
		expect(captured).toBeUndefined();

		act(() => emit?.({ coin: "ETH", fast: true, levels: [[], []], time: 2 }));
		await act(() => vi.advanceTimersByTimeAsync(16));
		expect(captured).toMatchObject({ coin: "ETH", fast: true, time: 2 });
	});

	it("resets accumulating data when subscription params change", async () => {
		const listeners = new Map<string, (event: TradesWsEvent) => void>();
		const trades = vi.fn(async (params: { coin: string }, listener: (event: TradesWsEvent) => void) => {
			listeners.set(params.coin, listener);
			return { unsubscribe: vi.fn(async () => {}) };
		});
		const subscription = { trades } as unknown as SubscriptionClient;
		let captured: TradesWsEvent | undefined;

		function Consumer({ coin }: { coin: string }) {
			captured = useSubscription("trades", { coin }).data;
			return null;
		}

		act(() => {
			root.render(
				<FullWrapper subscription={subscription}>
					<Consumer coin="ETH" />
				</FullWrapper>,
			);
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		act(() => {
			listeners.get("ETH")?.([
				{
					coin: "ETH",
					side: "B",
					px: "3000",
					sz: "1",
					hash: "0xeth",
					time: 1,
					tid: 1,
					users: ["0xbuyer", "0xseller"],
				},
			]);
		});
		expect(captured?.map((trade) => trade.coin)).toEqual(["ETH"]);

		act(() => {
			root.render(
				<FullWrapper subscription={subscription}>
					<Consumer coin="BTC" />
				</FullWrapper>,
			);
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		act(() => {
			listeners.get("BTC")?.([
				{
					coin: "BTC",
					side: "A",
					px: "64000",
					sz: "0.1",
					hash: "0xbtc",
					time: 2,
					tid: 2,
					users: ["0xbuyer", "0xseller"],
				},
			]);
		});
		expect(captured?.map((trade) => trade.coin)).toEqual(["BTC"]);
	});
});
