import { createStalenessWatchdog, type StalenessWatchdog } from "@hypeterminal/hl-react/internal/websocket/staleness";
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
