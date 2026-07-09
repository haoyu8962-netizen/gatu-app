import type { CandleWsEvent, ISubscription } from "@nktkas/hyperliquid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createCandleStore as createCandleStoreType } from "@/lib/chart/store";
import type { Bar } from "@/types/charting_library";

type CandleListener = (event: CandleWsEvent) => void;

const testState = vi.hoisted(() => ({
	candle: vi.fn(),
	controller: undefined as AbortController | undefined,
	listener: undefined as CandleListener | undefined,
	unsubscribe: vi.fn(),
}));

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
		testState.controller = new AbortController();
		testState.listener = undefined;
		testState.candle.mockImplementation(
			async (_params: { coin: string; interval: string }, listener: CandleListener): Promise<ISubscription> => {
				testState.listener = listener;
				if (!testState.controller) throw new Error("missing controller");
				return {
					unsubscribe: testState.unsubscribe,
					failureSignal: testState.controller.signal,
				};
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
		expect(testState.candle).toHaveBeenCalledWith({ coin: "ETH", interval: "1m" }, expect.any(Function));

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

	it("unsubscribes a pending candle subscription when the last listener leaves before it resolves", async () => {
		vi.useFakeTimers();
		let resolveSubscription: ((subscription: ISubscription) => void) | undefined;
		testState.candle.mockImplementation(
			(_params: { coin: string; interval: string }, listener: CandleListener): Promise<ISubscription> => {
				testState.listener = listener;
				if (!testState.controller) throw new Error("missing controller");
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

		resolveSubscription?.({
			unsubscribe: testState.unsubscribe,
			failureSignal: testState.controller.signal,
		});
		await flushMicrotasks();

		expect(testState.unsubscribe).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(5_000);

		expect(store.getState().streams["SOL:1m"]).toBeUndefined();

		vi.useRealTimers();
	});

	it("resets chart listeners when the subscription reports a failure", async () => {
		const store = createCandleStore();
		const ticks: Bar[] = [];
		const reset = vi.fn();

		store.getState().subscribe("BTC:5m", "BTC", "5m", "listener", (bar) => ticks.push(bar), reset);
		await flushAsyncWork();

		testState.listener?.(nextCandle({ t: 300_000 }));
		await flushAsyncWork();

		testState.controller?.abort(new Error("socket dropped"));
		await flushAsyncWork();

		expect(ticks).toEqual([expectedBar({ time: 300_000 })]);
		expect(reset).toHaveBeenCalledTimes(1);
		expect(store.getState().streams["BTC:5m"]?.status).toBe("error");

		store.getState().unsubscribe("BTC:5m", "listener");
	});
});
