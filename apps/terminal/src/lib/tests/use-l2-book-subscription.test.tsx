// @vitest-environment jsdom

import { type L2BookSnapshot, L2BookStreamError } from "@gatu/hl-react";
import { useL2BookSubscription } from "@gatu/hl-react/hooks/useL2BookSubscription";
import { HyperliquidStoreContext } from "@gatu/hl-react/provider";
import { createHyperliquidStore, type HyperliquidStore } from "@gatu/hl-react/store";
import type { ISubscription, ISubscriptionTransport } from "@nktkas/hyperliquid";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface TransportCall {
	payload: unknown;
	listener: (event: CustomEvent<unknown>) => void;
	unsubscribe: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

function createSnapshot(coin: string, time: number): { s: L2BookSnapshot } {
	return {
		s: {
			coin,
			time,
			levels: [
				Array.from({ length: 6 }, (_, index) => ({ px: String(100 - index), sz: "1", n: 1 })),
				Array.from({ length: 6 }, (_, index) => ({ px: String(101 + index), sz: "2", n: 1 })),
			],
		},
	};
}

function createTransport(unsubscribeFactory: () => Promise<void> = async () => {}): {
	transport: ISubscriptionTransport;
	calls: TransportCall[];
} {
	const calls: TransportCall[] = [];
	const transport: ISubscriptionTransport = {
		subscribe: vi.fn(async (_channel, payload, listener) => {
			const unsubscribe = vi.fn(unsubscribeFactory);
			calls.push({ payload, listener: listener as (event: CustomEvent<unknown>) => void, unsubscribe });
			return { unsubscribe };
		}),
	};
	return { transport, calls };
}

describe("useL2BookSubscription", () => {
	let container: HTMLDivElement;
	let root: Root;
	let store: HyperliquidStore;

	beforeEach(() => {
		vi.useFakeTimers();
		container = document.createElement("div");
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		vi.useRealTimers();
	});

	function Wrapper({ children }: { children: ReactNode }) {
		return createElement(HyperliquidStoreContext.Provider, { value: store }, children);
	}

	it("sends the abbreviated payload and publishes snapshots without a throttle delay", async () => {
		const { transport, calls } = createTransport();
		store = createHyperliquidStore({ wsTransport: transport, ssr: false });
		let captured: L2BookSnapshot | undefined;

		function Consumer() {
			captured = useL2BookSubscription({ coin: "BTC", nSigFigs: 5, mantissa: 2 }).data;
			return null;
		}

		act(() => root.render(<Wrapper>{createElement(Consumer)}</Wrapper>));
		await act(() => vi.advanceTimersByTimeAsync(0));

		expect(calls[0]?.payload).toEqual({ type: "l2", c: "BTC", s: 5, m: 2 });
		act(() => calls[0]?.listener(new CustomEvent("l2", { detail: createSnapshot("BTC", 1) })));
		expect(captured?.time).toBe(1);
	});

	it("fails closed after five seconds without a first snapshot", async () => {
		const order: string[] = [];
		const { transport, calls } = createTransport(async () => {
			order.push("unsubscribe");
		});
		store = createHyperliquidStore({ wsTransport: transport, ssr: false });
		let status = "idle";
		let error: unknown;

		function Consumer() {
			const result = useL2BookSubscription({ coin: "ETH" });
			status = result.status;
			error = result.error;
			return null;
		}

		act(() => root.render(<Wrapper>{createElement(Consumer)}</Wrapper>));
		await act(() => vi.advanceTimersByTimeAsync(0));
		await act(() => vi.advanceTimersByTimeAsync(5_000));

		expect(calls[0]?.unsubscribe).toHaveBeenCalledOnce();
		expect(order).toEqual(["unsubscribe"]);
		expect(status).toBe("error");
		expect(error).toBeInstanceOf(L2BookStreamError);
		expect((error as L2BookStreamError).code).toBe("snapshot_timeout");
	});

	it("includes transport confirmation in the five-second first-snapshot deadline", async () => {
		let confirmationSignal: AbortSignal | undefined;
		const transport: ISubscriptionTransport = {
			subscribe: vi.fn((_channel, _payload, _listener, options) => {
				confirmationSignal = options?.signal;
				return new Promise<ISubscription>((_resolve, reject) => {
					options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
				});
			}),
		};
		store = createHyperliquidStore({ wsTransport: transport, ssr: false });
		let captured: ReturnType<typeof useL2BookSubscription> | undefined;

		function Consumer() {
			captured = useL2BookSubscription({ coin: "ETH" });
			return null;
		}

		act(() => root.render(<Wrapper>{createElement(Consumer)}</Wrapper>));
		await act(() => vi.advanceTimersByTimeAsync(4_999));
		expect(captured?.status).toBe("subscribing");
		expect(confirmationSignal?.aborted).toBe(false);

		await act(() => vi.advanceTimersByTimeAsync(1));
		expect(confirmationSignal?.aborted).toBe(true);
		expect(captured?.status).toBe("error");
		expect(captured?.error).toMatchObject({ code: "snapshot_timeout" });
	});

	it("aborts a pending confirmation when an early frame is malformed", async () => {
		let confirmationSignal: AbortSignal | undefined;
		const transport: ISubscriptionTransport = {
			subscribe: vi.fn((_channel, _payload, listener, options) => {
				confirmationSignal = options?.signal;
				listener(new CustomEvent("l2", { detail: { s: { coin: "BTC", levels: "invalid", time: 1 } } }));
				return new Promise<ISubscription>((_resolve, reject) => {
					if (options?.signal?.aborted) {
						reject(options.signal.reason);
						return;
					}
					options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
				});
			}),
		};
		store = createHyperliquidStore({ wsTransport: transport, ssr: false });
		let captured: ReturnType<typeof useL2BookSubscription> | undefined;

		function Consumer() {
			captured = useL2BookSubscription({ coin: "BTC" });
			return null;
		}

		act(() => root.render(<Wrapper>{createElement(Consumer)}</Wrapper>));
		await act(() => vi.advanceTimersByTimeAsync(0));

		expect(confirmationSignal?.aborted).toBe(true);
		expect(captured?.status).toBe("error");
		expect(captured?.error).toMatchObject({ code: "invalid_frame" });
	});

	it("waits for the previous grouping to unsubscribe before subscribing the next one", async () => {
		let resolveFirstUnsubscribe: (() => void) | undefined;
		let unsubscribeCount = 0;
		const { transport, calls } = createTransport(() => {
			unsubscribeCount += 1;
			if (unsubscribeCount > 1) return Promise.resolve();
			return new Promise<void>((resolve) => {
				resolveFirstUnsubscribe = resolve;
			});
		});
		store = createHyperliquidStore({ wsTransport: transport, ssr: false });

		function Consumer({ mantissa }: { mantissa: 1 | 2 }) {
			useL2BookSubscription({ coin: "BTC", nSigFigs: 5, mantissa });
			return null;
		}

		act(() => root.render(<Wrapper>{createElement(Consumer, { mantissa: 1 })}</Wrapper>));
		await act(() => vi.advanceTimersByTimeAsync(0));
		act(() => root.render(<Wrapper>{createElement(Consumer, { mantissa: 2 })}</Wrapper>));
		await act(() => vi.advanceTimersByTimeAsync(0));

		expect(calls).toHaveLength(1);
		resolveFirstUnsubscribe?.();
		await act(() => vi.advanceTimersByTimeAsync(0));

		expect(calls).toHaveLength(2);
		expect(calls[1]?.payload).toEqual({ type: "l2", c: "BTC", s: 5, m: 2 });
	});

	it("skips a superseded grouping while the previous unsubscribe is pending", async () => {
		let resolveFirstUnsubscribe: (() => void) | undefined;
		let unsubscribeCount = 0;
		const { transport, calls } = createTransport(() => {
			unsubscribeCount += 1;
			if (unsubscribeCount > 1) return Promise.resolve();
			return new Promise<void>((resolve) => {
				resolveFirstUnsubscribe = resolve;
			});
		});
		store = createHyperliquidStore({ wsTransport: transport, ssr: false });

		function Consumer({ mantissa }: { mantissa: 1 | 2 | 5 }) {
			useL2BookSubscription({ coin: "BTC", nSigFigs: 5, mantissa });
			return null;
		}

		act(() => root.render(<Wrapper>{createElement(Consumer, { mantissa: 1 })}</Wrapper>));
		await act(() => vi.advanceTimersByTimeAsync(0));
		act(() => root.render(<Wrapper>{createElement(Consumer, { mantissa: 2 })}</Wrapper>));
		await act(() => vi.advanceTimersByTimeAsync(0));
		act(() => root.render(<Wrapper>{createElement(Consumer, { mantissa: 5 })}</Wrapper>));
		await act(() => vi.advanceTimersByTimeAsync(0));

		expect(calls).toHaveLength(1);
		resolveFirstUnsubscribe?.();
		await act(() => vi.advanceTimersByTimeAsync(0));

		expect(calls).toHaveLength(2);
		expect(calls[1]?.payload).toEqual({ type: "l2", c: "BTC", s: 5, m: 5 });
	});

	it("keeps a failed-unsubscribe gate closed until transport disconnect", async () => {
		const disconnectListeners = new Set<() => void>();
		const triggerReconnect = vi.fn();
		let unsubscribeCount = 0;
		const { transport, calls } = createTransport(() => {
			unsubscribeCount += 1;
			return unsubscribeCount === 1 ? Promise.reject(new Error("close failed")) : Promise.resolve();
		});
		store = createHyperliquidStore({
			wsTransport: transport,
			ssr: false,
			triggerReconnect,
			subscribeDisconnect: (listener) => {
				disconnectListeners.add(listener);
				return () => disconnectListeners.delete(listener);
			},
		});

		function Consumer({ mantissa }: { mantissa: 1 | 2 }) {
			useL2BookSubscription({ coin: "BTC", nSigFigs: 5, mantissa });
			return null;
		}

		act(() => root.render(<Wrapper>{createElement(Consumer, { mantissa: 1 })}</Wrapper>));
		await act(() => vi.advanceTimersByTimeAsync(0));
		act(() => root.render(<Wrapper>{createElement(Consumer, { mantissa: 2 })}</Wrapper>));
		await act(() => vi.advanceTimersByTimeAsync(0));

		expect(calls).toHaveLength(1);
		expect(triggerReconnect).toHaveBeenCalledOnce();
		act(() => {
			for (const listener of disconnectListeners) listener();
		});
		await act(() => vi.advanceTimersByTimeAsync(600));

		expect(calls).toHaveLength(2);
		expect(calls[1]?.payload).toEqual({ type: "l2", c: "BTC", s: 5, m: 2 });
	});

	it("releases a hanging-unsubscribe gate after transport disconnect", async () => {
		const disconnectListeners = new Set<() => void>();
		const { transport, calls } = createTransport(() => new Promise<void>(() => {}));
		store = createHyperliquidStore({
			wsTransport: transport,
			ssr: false,
			subscribeDisconnect: (listener) => {
				disconnectListeners.add(listener);
				return () => disconnectListeners.delete(listener);
			},
		});

		function Consumer({ mantissa }: { mantissa: 1 | 2 }) {
			useL2BookSubscription({ coin: "BTC", nSigFigs: 5, mantissa });
			return null;
		}

		act(() => root.render(<Wrapper>{createElement(Consumer, { mantissa: 1 })}</Wrapper>));
		await act(() => vi.advanceTimersByTimeAsync(0));
		act(() => root.render(<Wrapper>{createElement(Consumer, { mantissa: 2 })}</Wrapper>));
		await act(() => vi.advanceTimersByTimeAsync(0));
		expect(calls).toHaveLength(1);

		act(() => {
			for (const listener of disconnectListeners) listener();
		});
		await act(() => vi.advanceTimersByTimeAsync(0));

		expect(calls).toHaveLength(2);
		expect(calls[1]?.payload).toEqual({ type: "l2", c: "BTC", s: 5, m: 2 });
	});

	it("marks the old snapshot stale on disconnect and accepts only the reconnect snapshot", async () => {
		const disconnectListeners = new Set<() => void>();
		const { transport, calls } = createTransport();
		store = createHyperliquidStore({
			wsTransport: transport,
			ssr: false,
			subscribeDisconnect: (listener) => {
				disconnectListeners.add(listener);
				return () => disconnectListeners.delete(listener);
			},
		});
		let captured: ReturnType<typeof useL2BookSubscription> | undefined;

		function Consumer() {
			captured = useL2BookSubscription({ coin: "BTC" });
			return null;
		}

		act(() => root.render(<Wrapper>{createElement(Consumer)}</Wrapper>));
		await act(() => vi.advanceTimersByTimeAsync(0));
		act(() => calls[0]?.listener(new CustomEvent("l2", { detail: createSnapshot("BTC", 1) })));
		expect(captured).toMatchObject({ data: { time: 1 }, isStale: false, status: "active" });

		act(() => {
			for (const listener of disconnectListeners) listener();
		});
		expect(captured).toMatchObject({ data: { time: 1 }, isStale: true, status: "active" });

		act(() => calls[0]?.listener(new CustomEvent("l2", { detail: createSnapshot("BTC", 10) })));
		expect(captured).toMatchObject({ data: { time: 10 }, isStale: false, status: "active" });
	});

	it("fails closed when reconnect does not deliver a fresh snapshot within five seconds", async () => {
		const disconnectListeners = new Set<() => void>();
		const { transport, calls } = createTransport();
		store = createHyperliquidStore({
			wsTransport: transport,
			ssr: false,
			subscribeDisconnect: (listener) => {
				disconnectListeners.add(listener);
				return () => disconnectListeners.delete(listener);
			},
		});
		let captured: ReturnType<typeof useL2BookSubscription> | undefined;

		function Consumer() {
			captured = useL2BookSubscription({ coin: "BTC" });
			return null;
		}

		act(() => root.render(<Wrapper>{createElement(Consumer)}</Wrapper>));
		await act(() => vi.advanceTimersByTimeAsync(0));
		act(() => calls[0]?.listener(new CustomEvent("l2", { detail: createSnapshot("BTC", 1) })));
		act(() => {
			for (const listener of disconnectListeners) listener();
		});
		await act(() => vi.advanceTimersByTimeAsync(4_999));
		expect(captured).toMatchObject({ data: { time: 1 }, isStale: true, status: "active" });

		await act(() => vi.advanceTimersByTimeAsync(1));
		expect(calls[0]?.unsubscribe).toHaveBeenCalledOnce();
		expect(captured?.data).toBeUndefined();
		expect(captured?.status).toBe("error");
		expect(captured?.error).toMatchObject({ code: "snapshot_timeout" });
	});

	it("does not latch fallback while the browser is explicitly offline", async () => {
		const onlineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
		const disconnectListeners = new Set<() => void>();
		const { transport, calls } = createTransport();
		store = createHyperliquidStore({
			wsTransport: transport,
			ssr: false,
			subscribeDisconnect: (listener) => {
				disconnectListeners.add(listener);
				return () => disconnectListeners.delete(listener);
			},
		});
		let captured: ReturnType<typeof useL2BookSubscription> | undefined;

		function Consumer() {
			captured = useL2BookSubscription({ coin: "BTC" });
			return null;
		}

		act(() => root.render(<Wrapper>{createElement(Consumer)}</Wrapper>));
		await act(() => vi.advanceTimersByTimeAsync(0));
		act(() => calls[0]?.listener(new CustomEvent("l2", { detail: createSnapshot("BTC", 1) })));
		onlineSpy.mockReturnValue(false);
		act(() => {
			window.dispatchEvent(new Event("offline"));
			for (const listener of disconnectListeners) listener();
		});
		await act(() => vi.advanceTimersByTimeAsync(10_000));

		expect(calls[0]?.unsubscribe).not.toHaveBeenCalled();
		expect(captured).toMatchObject({ data: { time: 1 }, isStale: true, status: "active" });

		onlineSpy.mockReturnValue(true);
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		await act(() => vi.advanceTimersByTimeAsync(4_999));
		expect(calls[0]?.unsubscribe).not.toHaveBeenCalled();
		expect(captured).toMatchObject({ data: { time: 1 }, isStale: true, status: "active" });

		act(() => calls[0]?.listener(new CustomEvent("l2", { detail: createSnapshot("BTC", 10) })));
		expect(captured).toMatchObject({ data: { time: 10 }, isStale: false, status: "active" });
	});

	it("unsubscribes and clears retained data after a fatal protocol frame", async () => {
		const { transport, calls } = createTransport();
		store = createHyperliquidStore({ wsTransport: transport, ssr: false });
		let captured: ReturnType<typeof useL2BookSubscription> | undefined;

		function Consumer() {
			captured = useL2BookSubscription({ coin: "BTC" });
			return null;
		}

		act(() => root.render(<Wrapper>{createElement(Consumer)}</Wrapper>));
		await act(() => vi.advanceTimersByTimeAsync(0));
		act(() => calls[0]?.listener(new CustomEvent("l2", { detail: createSnapshot("BTC", 1) })));
		expect(captured?.data?.time).toBe(1);

		act(() =>
			calls[0]?.listener(
				new CustomEvent("l2", {
					detail: { s: { coin: "BTC", levels: "invalid", time: 2 } },
				}),
			),
		);

		expect(calls[0]?.unsubscribe).toHaveBeenCalledOnce();
		expect(captured?.data).toBeUndefined();
		expect(captured?.status).toBe("error");
		expect(captured?.error).toMatchObject({ code: "invalid_frame" });
	});
});
