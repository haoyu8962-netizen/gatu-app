import { createThrottledUpdater } from "@gatu/hl-react/internal/websocket/batch-updater";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("createThrottledUpdater", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("throttles 100 events over 100ms to ≤ 3 emissions with throttleMs=50", () => {
		const emissions: number[] = [];
		const updater = createThrottledUpdater<number>((item) => {
			emissions.push(item);
		}, 50);

		for (let i = 0; i < 100; i++) {
			updater.add(i);
			vi.advanceTimersByTime(1);
		}

		vi.advanceTimersByTime(100);
		updater.flush();

		expect(emissions.length).toBeLessThanOrEqual(3);
		expect(emissions[emissions.length - 1]).toBe(99);
	});

	it("emits immediately on first add when interval has elapsed", () => {
		const emissions: number[] = [];
		const updater = createThrottledUpdater<number>((item) => {
			emissions.push(item);
		}, 50);

		updater.add(42);
		expect(emissions).toEqual([42]);

		updater.destroy();
	});

	it("keeps only the latest value between intervals", () => {
		const emissions: number[] = [];
		const updater = createThrottledUpdater<number>((item) => {
			emissions.push(item);
		}, 50);

		updater.add(1);
		expect(emissions).toEqual([1]);

		updater.add(2);
		updater.add(3);
		updater.add(4);

		vi.advanceTimersByTime(50);
		expect(emissions).toEqual([1, 4]);

		updater.destroy();
	});

	it("keeps its interval in every round after the system clock is set back", () => {
		const emissions: number[] = [];
		const updater = createThrottledUpdater<number>((item) => {
			emissions.push(item);
		}, 5_000);

		updater.add(1);
		vi.setSystemTime(Date.now() - 60 * 60_000);
		vi.advanceTimersByTime(1_000);
		updater.add(2);

		vi.advanceTimersByTime(3_999);
		expect(emissions).toEqual([1]);
		vi.advanceTimersByTime(1);
		expect(emissions).toEqual([1, 2]);

		vi.advanceTimersByTime(1_000);
		updater.add(3);
		vi.advanceTimersByTime(3_999);
		expect(emissions).toEqual([1, 2]);
		vi.advanceTimersByTime(1);
		expect(emissions).toEqual([1, 2, 3]);

		vi.advanceTimersByTime(5_000);
		updater.add(4);
		expect(emissions).toEqual([1, 2, 3, 4]);

		updater.destroy();
	});

	it("keeps its interval in the rounds after the system clock jumps forward", () => {
		const emissions: number[] = [];
		const updater = createThrottledUpdater<number>((item) => {
			emissions.push(item);
		}, 5_000);

		updater.add(1);
		vi.advanceTimersByTime(1_000);
		updater.add(2);
		vi.setSystemTime(Date.now() + 60 * 60_000);
		vi.advanceTimersByTime(4_000);
		expect(emissions).toEqual([1, 2]);

		vi.advanceTimersByTime(1_000);
		updater.add(3);
		vi.advanceTimersByTime(3_999);
		expect(emissions).toEqual([1, 2]);
		vi.advanceTimersByTime(1);
		expect(emissions).toEqual([1, 2, 3]);

		updater.destroy();
	});

	it("delivers at once when the wall clock has passed the interval but the monotonic clock has not", () => {
		const emissions: number[] = [];
		const updater = createThrottledUpdater<number>((item) => {
			emissions.push(item);
		}, 5_000);

		updater.add(1);
		vi.advanceTimersByTime(1_000);
		vi.setSystemTime(Date.now() + 60_000);
		updater.add(2);

		expect(emissions).toEqual([1, 2]);

		updater.destroy();
	});

	it("flush delivers pending item immediately", () => {
		const emissions: number[] = [];
		const updater = createThrottledUpdater<number>((item) => {
			emissions.push(item);
		}, 50);

		updater.add(1);
		updater.add(2);

		updater.flush();
		expect(emissions).toEqual([1, 2]);

		updater.destroy();
	});
});
