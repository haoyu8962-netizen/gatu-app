import { createThrottledUpdater } from "@hypeterminal/hl-react/internal/websocket/batch-updater";
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
