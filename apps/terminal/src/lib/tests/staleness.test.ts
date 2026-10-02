import { createStalenessWatchdog, type StalenessWatchdog } from "@sairn/hl-react/internal/websocket/staleness";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("staleness watchdog", () => {
	let watchdog: StalenessWatchdog;

	beforeEach(() => {
		vi.useFakeTimers();
		watchdog = createStalenessWatchdog(1_000);
	});

	afterEach(() => {
		watchdog.destroy();
		vi.useRealTimers();
	});

	it("starts fresh after registration", () => {
		watchdog.register("key:a", 5_000);
		expect(watchdog.isStale("key:a")).toBe(false);
	});

	it("transitions to stale after threshold elapses", () => {
		watchdog.register("key:a", 5_000);
		watchdog.markFresh("key:a");

		vi.advanceTimersByTime(6_000);

		expect(watchdog.isStale("key:a")).toBe(true);
	});

	it("transitions back to fresh on markFresh", () => {
		watchdog.register("key:a", 5_000);
		watchdog.markFresh("key:a");

		vi.advanceTimersByTime(6_000);
		expect(watchdog.isStale("key:a")).toBe(true);

		watchdog.markFresh("key:a");
		expect(watchdog.isStale("key:a")).toBe(false);
	});

	it("does not false-positive at exact threshold boundary", () => {
		watchdog.register("key:a", 5_000);
		watchdog.markFresh("key:a");

		vi.advanceTimersByTime(5_000);

		expect(watchdog.isStale("key:a")).toBe(false);
	});

	it("respects per-key threshold override", () => {
		watchdog.register("key:fast", 2_000);
		watchdog.register("key:slow", 10_000);
		watchdog.markFresh("key:fast");
		watchdog.markFresh("key:slow");

		vi.advanceTimersByTime(3_000);

		expect(watchdog.isStale("key:fast")).toBe(true);
		expect(watchdog.isStale("key:slow")).toBe(false);
	});

	it("notifies subscribers on stale transition", () => {
		watchdog.register("key:a", 5_000);
		const listener = vi.fn();
		watchdog.subscribe("key:a", listener);
		watchdog.markFresh("key:a");

		vi.advanceTimersByTime(6_000);

		expect(listener).toHaveBeenCalledWith(true);
	});

	it("notifies subscribers on fresh transition", () => {
		watchdog.register("key:a", 5_000);
		const listener = vi.fn();
		watchdog.subscribe("key:a", listener);
		watchdog.markFresh("key:a");

		vi.advanceTimersByTime(6_000);
		listener.mockClear();

		watchdog.markFresh("key:a");
		expect(listener).toHaveBeenCalledWith(false);
	});

	it("re-arms a first-frame deadline without publishing a false fresh signal", () => {
		watchdog.register("key:a", 5_000);
		const listener = vi.fn();
		watchdog.subscribe("key:a", listener);
		watchdog.markFresh("key:a");
		vi.advanceTimersByTime(6_000);
		expect(listener).toHaveBeenLastCalledWith(true);
		listener.mockClear();

		watchdog.arm("key:a");
		expect(listener).not.toHaveBeenCalled();
		vi.advanceTimersByTime(6_000);

		expect(listener).toHaveBeenCalledWith(true);
	});

	it("stops notifying after unsubscribe", () => {
		watchdog.register("key:a", 5_000);
		const listener = vi.fn();
		const unsub = watchdog.subscribe("key:a", listener);
		watchdog.markFresh("key:a");

		unsub();
		vi.advanceTimersByTime(6_000);

		expect(listener).not.toHaveBeenCalled();
	});

	it("starts interval on first markFresh, stops on last unregister", () => {
		watchdog.register("key:a", 5_000);
		watchdog.register("key:b", 5_000);

		expect(vi.getTimerCount()).toBe(0);

		watchdog.markFresh("key:a");
		expect(vi.getTimerCount()).toBe(1);

		watchdog.unregister("key:a");
		expect(vi.getTimerCount()).toBe(1);

		watchdog.unregister("key:b");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("tracks lastMessageAt per key", () => {
		watchdog.register("key:a", 5_000);

		expect(watchdog.getLastMessageAt("key:a")).toBeUndefined();

		watchdog.markFresh("key:a");
		const ts = watchdog.getLastMessageAt("key:a");
		expect(ts).toBe(Date.now());

		vi.advanceTimersByTime(1_000);
		watchdog.markFresh("key:a");
		expect(watchdog.getLastMessageAt("key:a")).toBe(Date.now());
	});

	it("keeps aging a silent stream on the monotonic clock after the system clock is set back", () => {
		watchdog.register("key:a", 20_000);
		const listener = vi.fn();
		watchdog.subscribe("key:a", listener);
		watchdog.markFresh("key:a");
		const receivedAt = Date.now();

		vi.setSystemTime(receivedAt - 60 * 60_000);
		vi.advanceTimersByTime(20_000);
		expect(watchdog.isStale("key:a")).toBe(false);

		vi.advanceTimersByTime(10 * 60_000 - 20_000);

		expect(Date.now() - receivedAt).toBe(-50 * 60_000);
		expect(watchdog.isStale("key:a")).toBe(true);
		expect(listener).toHaveBeenCalledOnce();
		expect(listener).toHaveBeenCalledWith(true);
		expect(watchdog.getLastMessageAt("key:a")).toBe(receivedAt);
	});

	it("keeps a live stream fresh across a system clock rollback", () => {
		watchdog.register("key:a", 20_000);
		const listener = vi.fn();
		watchdog.subscribe("key:a", listener);
		watchdog.markFresh("key:a");

		vi.setSystemTime(Date.now() - 60 * 60_000);
		for (let second = 0; second < 60; second += 5) {
			vi.advanceTimersByTime(5_000);
			watchdog.markFresh("key:a");
		}

		expect(watchdog.isStale("key:a")).toBe(false);
		expect(watchdog.getLastMessageAt("key:a")).toBe(Date.now());
		expect(listener).not.toHaveBeenCalled();
	});

	it("still stales a stream when the system clock jumps forward", () => {
		watchdog.register("key:a", 20_000);
		watchdog.markFresh("key:a");

		vi.setSystemTime(Date.now() + 60 * 60_000);
		vi.advanceTimersByTime(1_000);

		expect(watchdog.isStale("key:a")).toBe(true);
	});

	it("judges a late-delivered receipt by its monotonic receipt time", () => {
		watchdog.register("key:a", 20_000);

		watchdog.markFresh("key:a", Date.now(), performance.now() - 15_000);
		expect(watchdog.isStale("key:a")).toBe(false);

		vi.advanceTimersByTime(6_000);
		expect(watchdog.isStale("key:a")).toBe(true);

		watchdog.arm("key:a", Date.now(), performance.now() - 25_000);
		expect(watchdog.isStale("key:a")).toBe(true);
	});

	it("returns false for unregistered keys", () => {
		expect(watchdog.isStale("nonexistent")).toBe(false);
		expect(watchdog.getLastMessageAt("nonexistent")).toBeUndefined();
	});

	it("does not check keys that never received data", () => {
		watchdog.register("key:a", 1_000);
		const listener = vi.fn();
		watchdog.subscribe("key:a", listener);

		watchdog.register("key:b", 1_000);
		watchdog.markFresh("key:b");

		vi.advanceTimersByTime(2_000);

		expect(watchdog.isStale("key:a")).toBe(false);
		expect(listener).not.toHaveBeenCalled();
		expect(watchdog.isStale("key:b")).toBe(true);
	});
});
