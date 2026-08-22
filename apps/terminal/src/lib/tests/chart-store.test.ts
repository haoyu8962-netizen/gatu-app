import type { CandleWsEvent, ISubscription } from "@nktkas/hyperliquid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createCandleStore as createCandleStoreType } from "@/lib/chart/store";
import type { Bar } from "@/types/charting_library";

type CandleListener = (event: CandleWsEvent) => void;

const testState = vi.hoisted(() => ({
	candle: vi.fn(),
	listener: undefined as CandleListener | undefined,
	onError: undefined as ((error: unknown) => void) | undefined,
	unsubscribe: vi.fn(),
}));

type CandleSubscribeOptions = { onError?: (error: unknown) => void };

vi.mock("@/lib/hyperliquid", () => ({
	getSubscriptionClient: () => ({
		candle: testState.candle,
	}),
}));

let createCandleStore: typeof createCandleStoreType;

function flushAsyncWork() {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
}

async function flushMicrotasks() {
	await Promise.resolve();
	await Promise.resolve();
}

function nextCandle(overrides: Partial<CandleWsEvent> = {}): CandleWsEvent {
	return {
		t: 60_000,
		o: "100",
		h: "105",
		l: "95",
		c: "102",
		v: "12.5",
		...overrides,
	} as CandleWsEvent;
}

function expectedBar(overrides: Partial<Bar> = {}): Bar {
	return {
		time: 60_000,
		open: 100,
		high: 105,
		low: 95,
		close: 102,
		volume: 12.5,
		...overrides,
	};
}

describe("chart candle store subscriptions", () => {
	beforeEach(async () => {
		vi.resetModules();
		testState.candle.mockReset();
		testState.unsubscribe.mockReset();
		testState.unsubscribe.mockResolvedValue(undefined);
		testState.listener = undefined;
		testState.onError = undefined;
		testState.candle.mockImplementation(
			async (
				_params: { coin: string; interval: string },
				listener: CandleListener,
				options?: CandleSubscribeOptions,
			): Promise<ISubscription> => {
				testState.listener = listener;
				testState.onError = options?.onError;
				return { unsubscribe: testState.unsubscribe };
			},
		);

		({ createCandleStore } = await import("@/lib/chart/store"));
	});

	it("shares one underlying candle subscription across multiple chart listeners", async () => {
		vi.useFakeTimers();
		const store = createCandleStore();
		const ticksA: Bar[] = [];
		const ticksB: Bar[] = [];
		const resetA = vi.fn();
		const resetB = vi.fn();

		store.getState().subscribe("ETH:1m", "ETH", "1m", "listener-a", (bar) => ticksA.push(bar), resetA);
		await flushMicrotasks();
		store.getState().subscribe("ETH:1m", "ETH", "1m", "listener-b", (bar) => ticksB.push(bar), resetB);
		await flushMicrotasks();

		expect(testState.candle).toHaveBeenCalledTimes(1);
		expect(testState.candle).toHaveBeenCalledWith(
			{ coin: "ETH", interval: "1m" },
			expect.any(Function),
			expect.objectContaining({ onError: expect.any(Function) }),
		);

		testState.listener?.(nextCandle());
		await flushMicrotasks();

		expect(ticksA).toEqual([expectedBar()]);
		expect(ticksB).toEqual([expectedBar()]);
		expect(store.getState().streams["ETH:1m"]?.status).toBe("active");

		store.getState().unsubscribe("ETH:1m", "listener-a");
		expect(testState.unsubscribe).not.toHaveBeenCalled();

		store.getState().unsubscribe("ETH:1m", "listener-b");
		expect(testState.unsubscribe).not.toHaveBeenCalled();
		expect(store.getState().streams["ETH:1m"]?.listeners.size).toBe(0);

		await vi.advanceTimersByTimeAsync(5_000);

		expect(testState.unsubscribe).toHaveBeenCalledTimes(1);
		expect(store.getState().streams["ETH:1m"]).toBeUndefined();

		vi.useRealTimers();
	});

	it("keeps a candle subscription alive when the same stream is resubscribed quickly", async () => {
		vi.useFakeTimers();
		const store = createCandleStore();
		const ticksA: Bar[] = [];
		const ticksB: Bar[] = [];

		store.getState().subscribe("ETH:1m", "ETH", "1m", "listener-a", (bar) => ticksA.push(bar), vi.fn());
		await flushMicrotasks();
		store.getState().unsubscribe("ETH:1m", "listener-a");
		expect(testState.unsubscribe).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1_000);

		store.getState().subscribe("ETH:1m", "ETH", "1m", "listener-b", (bar) => ticksB.push(bar), vi.fn());
		await flushMicrotasks();
		await vi.advanceTimersByTimeAsync(5_000);

		expect(testState.candle).toHaveBeenCalledTimes(1);
		expect(testState.unsubscribe).not.toHaveBeenCalled();

		testState.listener?.(nextCandle({ t: 120_000 }));
		await flushMicrotasks();

		expect(ticksA).toEqual([]);
		expect(ticksB).toEqual([expectedBar({ time: 120_000 })]);

		store.getState().unsubscribe("ETH:1m", "listener-b");
		await vi.advanceTimersByTimeAsync(5_000);

		expect(testState.unsubscribe).toHaveBeenCalledTimes(1);

		vi.useRealTimers();
	});

	it("releases a pending candle subscription after the grace period when no listener returns", async () => {
		vi.useFakeTimers();
		let resolveSubscription: ((subscription: ISubscription) => void) | undefined;
		testState.candle.mockImplementation(
			(_params: { coin: string; interval: string }, listener: CandleListener): Promise<ISubscription> => {
				testState.listener = listener;
				return new Promise((resolve) => {
					resolveSubscription = resolve;
				});
			},
		);

		const store = createCandleStore();
		store.getState().subscribe("SOL:1m", "SOL", "1m", "listener", vi.fn(), vi.fn());
		store.getState().unsubscribe("SOL:1m", "listener");

		expect(store.getState().streams["SOL:1m"]?.listeners.size).toBe(0);
		expect(testState.unsubscribe).not.toHaveBeenCalled();

		resolveSubscription?.({ unsubscribe: testState.unsubscribe });
		await flushMicrotasks();

		expect(testState.unsubscribe).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(5_000);

		expect(testState.unsubscribe).toHaveBeenCalledTimes(1);
		expect(store.getState().streams["SOL:1m"]).toBeUndefined();

		vi.useRealTimers();
	});

	it("isolates a stale pending subscription from a new stream with the same key", async () => {
		vi.useFakeTimers();
		const pending: Array<{
			listener: CandleListener;
			resolve: (subscription: ISubscription) => void;
		}> = [];
		testState.candle.mockImplementation(
			(_params: { coin: string; interval: string }, listener: CandleListener): Promise<ISubscription> =>
				new Promise((resolve) => pending.push({ listener, resolve })),
		);

		const store = createCandleStore();
		const ticks: Bar[] = [];
		store.getState().subscribe("ETH:1m", "ETH", "1m", "listener-a", vi.fn(), vi.fn());
		store.getState().unsubscribe("ETH:1m", "listener-a");

		await vi.advanceTimersByTimeAsync(5_000);
		expect(store.getState().streams["ETH:1m"]).toBeUndefined();

		store.getState().subscribe("ETH:1m", "ETH", "1m", "listener-b", (bar) => ticks.push(bar), vi.fn());
		expect(testState.candle).toHaveBeenCalledTimes(2);

		const staleUnsubscribe = vi.fn().mockResolvedValue(undefined);
		pending[0]?.resolve({ unsubscribe: staleUnsubscribe });
		await flushMicrotasks();

		expect(staleUnsubscribe).toHaveBeenCalledTimes(1);
		pending[0]?.listener(nextCandle({ t: 120_000 }));
		expect(ticks).toEqual([]);

		const currentUnsubscribe = vi.fn().mockResolvedValue(undefined);
		pending[1]?.resolve({ unsubscribe: currentUnsubscribe });
		await flushMicrotasks();
		pending[1]?.listener(nextCandle({ t: 180_000 }));

		expect(ticks).toEqual([expectedBar({ time: 180_000 })]);
		expect(store.getState().streams["ETH:1m"]?.status).toBe("active");

		store.getState().unsubscribe("ETH:1m", "listener-b");
		await vi.advanceTimersByTimeAsync(5_000);
		expect(currentUnsubscribe).toHaveBeenCalledTimes(1);

		vi.useRealTimers();
	});

	it("reuses a pending subscription that resolves during the release grace period", async () => {
		vi.useFakeTimers();
		let resolveSubscription: ((subscription: ISubscription) => void) | undefined;
		let candleListener: CandleListener | undefined;
		testState.candle.mockImplementation(
			(_params: { coin: string; interval: string }, listener: CandleListener): Promise<ISubscription> => {
				candleListener = listener;
				return new Promise((resolve) => {
					resolveSubscription = resolve;
				});
			},
		);

		const store = createCandleStore();
		const ticks: Bar[] = [];
		const unsubscribe = vi.fn().mockResolvedValue(undefined);

		store.getState().subscribe("SOL:1m", "SOL", "1m", "listener-a", vi.fn(), vi.fn());
		store.getState().unsubscribe("SOL:1m", "listener-a");
		resolveSubscription?.({ unsubscribe });
		await flushMicrotasks();

		expect(unsubscribe).not.toHaveBeenCalled();
		expect(store.getState().streams["SOL:1m"]?.listeners.size).toBe(0);

		await vi.advanceTimersByTimeAsync(1_000);
		store.getState().subscribe("SOL:1m", "SOL", "1m", "listener-b", (bar) => ticks.push(bar), vi.fn());
		await flushMicrotasks();
		await vi.advanceTimersByTimeAsync(5_000);

		expect(testState.candle).toHaveBeenCalledTimes(1);
		expect(unsubscribe).not.toHaveBeenCalled();
		candleListener?.(nextCandle({ t: 240_000 }));
		expect(ticks).toEqual([expectedBar({ time: 240_000 })]);

		store.getState().unsubscribe("SOL:1m", "listener-b");
		await vi.advanceTimersByTimeAsync(5_000);
		expect(unsubscribe).toHaveBeenCalledTimes(1);

		vi.useRealTimers();
	});

	it("defers listener recovery until the resubscription is confirmed", async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0);
		const store = createCandleStore();
		const ticks: Bar[] = [];
		const reset = vi.fn();

		store.getState().subscribe("BTC:5m", "BTC", "5m", "listener", (bar) => ticks.push(bar), reset);
		await flushMicrotasks();

		testState.listener?.(nextCandle({ t: 300_000 }));
		testState.onError?.(new Error("socket dropped"));
		await flushMicrotasks();

		expect(ticks).toEqual([expectedBar({ time: 300_000 })]);
		expect(reset).not.toHaveBeenCalled();
		expect(testState.unsubscribe).not.toHaveBeenCalled();
		expect(store.getState().streams["BTC:5m"]?.status).toBe("error");

		await vi.advanceTimersByTimeAsync(250);
		await flushMicrotasks();

		expect(testState.candle).toHaveBeenCalledTimes(2);
		expect(reset).toHaveBeenCalledTimes(1);
		expect(store.getState().streams["BTC:5m"]?.status).toBe("active");

		testState.onError?.(new Error("socket dropped again"));
		await flushMicrotasks();
		await vi.advanceTimersByTimeAsync(500);
		await flushMicrotasks();

		expect(testState.candle).toHaveBeenCalledTimes(3);
		expect(reset).toHaveBeenCalledTimes(2);

		store.getState().unsubscribe("BTC:5m", "listener");
		await vi.advanceTimersByTimeAsync(5_000);
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("keeps the subscription alive when a recovery reset callback throws", async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0);
		const store = createCandleStore();
		const ticks: Bar[] = [];
		const throwingReset = vi.fn(() => {
			throw new Error("tradingview teardown");
		});
		const healthyReset = vi.fn();

		store.getState().subscribe("BTC:5m", "BTC", "5m", "listener-a", (bar) => ticks.push(bar), throwingReset);
		store.getState().subscribe("BTC:5m", "BTC", "5m", "listener-b", vi.fn(), healthyReset);
		await flushMicrotasks();

		testState.onError?.(new Error("socket dropped"));
		await flushMicrotasks();
		await vi.advanceTimersByTimeAsync(250);
		await flushMicrotasks();

		expect(testState.candle).toHaveBeenCalledTimes(2);
		expect(throwingReset).toHaveBeenCalledTimes(1);
		expect(healthyReset).toHaveBeenCalledTimes(1);
		expect(store.getState().streams["BTC:5m"]?.status).toBe("active");

		testState.listener?.(nextCandle({ t: 300_000 }));
		await vi.advanceTimersByTimeAsync(5_000);
		await flushMicrotasks();

		expect(ticks).toEqual([expectedBar({ time: 300_000 })]);
		expect(testState.candle).toHaveBeenCalledTimes(2);
		expect(testState.unsubscribe).not.toHaveBeenCalled();

		store.getState().unsubscribe("BTC:5m", "listener-a");
		store.getState().unsubscribe("BTC:5m", "listener-b");
		await vi.advanceTimersByTimeAsync(5_000);
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("keeps escalating reconnect delays until a candle confirms recovery", async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0);
		const store = createCandleStore();

		store.getState().subscribe("SOL:1m", "SOL", "1m", "listener", vi.fn(), vi.fn());
		await flushMicrotasks();

		testState.onError?.(new Error("drop 1"));
		await flushMicrotasks();
		await vi.advanceTimersByTimeAsync(250);
		await flushMicrotasks();
		expect(testState.candle).toHaveBeenCalledTimes(2);

		testState.onError?.(new Error("drop 2"));
		await flushMicrotasks();
		await vi.advanceTimersByTimeAsync(499);
		await flushMicrotasks();
		expect(testState.candle).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(1);
		await flushMicrotasks();
		expect(testState.candle).toHaveBeenCalledTimes(3);

		testState.listener?.(nextCandle());
		testState.onError?.(new Error("drop 3"));
		await flushMicrotasks();
		await vi.advanceTimersByTimeAsync(250);
		await flushMicrotasks();
		expect(testState.candle).toHaveBeenCalledTimes(4);

		store.getState().unsubscribe("SOL:1m", "listener");
		await vi.advanceTimersByTimeAsync(5_000);
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("replays the cached last bar to a new listener on a separate macrotask", async () => {
		vi.useFakeTimers();
		const store = createCandleStore();
		const ticksA: Bar[] = [];

		store.getState().subscribe("ETH:1m", "ETH", "1m", "listener-a", (bar) => ticksA.push(bar), vi.fn());
		await flushMicrotasks();
		testState.listener?.(nextCandle());

		const ticksB: Bar[] = [];
		store.getState().subscribe("ETH:1m", "ETH", "1m", "listener-b", (bar) => ticksB.push(bar), vi.fn());
		expect(ticksB).toEqual([]);
		await vi.advanceTimersByTimeAsync(0);
		expect(ticksB).toEqual([expectedBar()]);

		const ticksC: Bar[] = [];
		store.getState().subscribe("ETH:1m", "ETH", "1m", "listener-c", (bar) => ticksC.push(bar), vi.fn());
		store.getState().unsubscribe("ETH:1m", "listener-c");
		await vi.advanceTimersByTimeAsync(0);
		expect(ticksC).toEqual([]);

		store.getState().unsubscribe("ETH:1m", "listener-a");
		store.getState().unsubscribe("ETH:1m", "listener-b");
		await vi.advanceTimersByTimeAsync(5_000);
		vi.useRealTimers();
	});

	it("retries after the SDK reports a subscription failure", async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0);
		const firstUnsubscribe = vi.fn().mockResolvedValue(undefined);
		const secondUnsubscribe = vi.fn().mockResolvedValue(undefined);
		const onErrors: Array<((error: unknown) => void) | undefined> = [];
		let attempt = 0;

		testState.candle.mockImplementation(
			async (
				_params: { coin: string; interval: string },
				listener: CandleListener,
				options?: CandleSubscribeOptions,
			): Promise<ISubscription> => {
				testState.listener = listener;
				onErrors.push(options?.onError);
				attempt += 1;
				return attempt === 1 ? { unsubscribe: firstUnsubscribe } : { unsubscribe: secondUnsubscribe };
			},
		);

		const store = createCandleStore();
		store.getState().subscribe("HYPE:1m", "HYPE", "1m", "listener", vi.fn(), vi.fn());
		await flushMicrotasks();

		onErrors[0]?.(new Error("resubscribe failed"));
		await flushMicrotasks();

		expect(firstUnsubscribe).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(250);
		await flushMicrotasks();

		expect(testState.candle).toHaveBeenCalledTimes(2);
		expect(store.getState().streams["HYPE:1m"]?.status).toBe("active");

		store.getState().unsubscribe("HYPE:1m", "listener");
		await vi.advanceTimersByTimeAsync(5_000);
		expect(secondUnsubscribe).toHaveBeenCalledTimes(1);

		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("drops stale stream and history bars before a REST backfill", async () => {
		const store = createCandleStore();
		store.getState().subscribe("HYPE:1h", "HYPE", "1h", "listener", vi.fn(), vi.fn());
		await flushAsyncWork();

		testState.listener?.(nextCandle({ t: 3_600_000, c: "65" }));
		store.getState().setLastBar("HYPE:60", expectedBar({ time: 3_600_000, close: 65 }));

		store.getState().invalidateStream("HYPE:1h");
		store.getState().clearLastBar("HYPE:60");

		expect(store.getState().streams["HYPE:1h"]?.lastBar).toBeUndefined();
		expect(store.getState().getLastBar("HYPE:60")).toBeUndefined();

		store.getState().unsubscribe("HYPE:1h", "listener");
	});
});
