import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderbookPulseSnapshot, OrderbookVisibleLevel } from "@/lib/trade/orderbook-new-levels";
import {
	createOrderbookLevelPulseController,
	getOrderbookLevelPulseDelay,
	type OrderbookLevelPulseInput,
} from "@/lib/ui/orderbook-level-pulses";

function book(bids: string[], asks = ["101"]): OrderbookPulseSnapshot {
	return { levels: [bids.map((px) => ({ px })), asks.map((px) => ({ px }))] };
}

function visible(snapshot: OrderbookPulseSnapshot | undefined): OrderbookVisibleLevel[] {
	return [
		...(snapshot?.levels[0].map(({ px }) => ({ side: "bid" as const, price: px })) ?? []),
		...(snapshot?.levels[1].map(({ px }) => ({ side: "ask" as const, price: px })) ?? []),
	];
}

describe("orderbook pulse controller", () => {
	let controller: ReturnType<typeof createOrderbookLevelPulseController>;
	let currentTime: number;

	beforeEach(() => {
		vi.useFakeTimers();
		currentTime = 0;
		controller = createOrderbookLevelPulseController({ now: () => currentTime });
	});

	afterEach(() => {
		controller.reset();
		vi.useRealTimers();
	});

	function commit(snapshot: OrderbookPulseSnapshot | undefined, overrides: Partial<OrderbookLevelPulseInput> = {}) {
		controller.commit({
			active: true,
			identity: "mainnet:HYPE:native:l2",
			snapshot,
			viewKey: "both:12:12",
			visibleLevels: visible(snapshot),
			...overrides,
		});
	}

	function advance(milliseconds: number) {
		currentTime += milliseconds;
		vi.advanceTimersByTime(milliseconds);
	}

	it("keeps construction and snapshot reads pure with stable empty SSR output", () => {
		const now = vi.fn(() => 0);
		const schedule = vi.fn(() => vi.fn());
		const pure = createOrderbookLevelPulseController({ now, schedule });
		expect(pure.getSnapshot()).toBe(pure.getSnapshot());
		expect(pure.getServerSnapshot()).toBe(pure.getSnapshot());
		expect(now).not.toHaveBeenCalled();
		expect(schedule).not.toHaveBeenCalled();
	});

	it("notifies only for changed events while quote updates preserve the active event and expiry", () => {
		const notify = vi.fn();
		const unsubscribe = controller.subscribe(notify);
		const initialState = controller.getSnapshot();
		commit(book(["99", "98"]));
		commit(book(["99.00", "98"]));
		expect(controller.getSnapshot()).toBe(initialState);
		expect(notify).not.toHaveBeenCalled();
		commit(book(["100", "99", "98"]));
		const runningState = controller.getSnapshot();
		const event = runningState.events.get("bid:100");
		expect(event).toMatchObject({ createdAt: 0, delayMs: 0, expiresAt: 800 });
		expect(notify).toHaveBeenCalledTimes(1);
		for (let index = 0; index < 7; index += 1) {
			advance(100);
			commit(book(["100.0", "99", "98"]));
			expect(controller.getSnapshot()).toBe(runningState);
			expect(controller.getSnapshot().events.get("bid:100")).toBe(event);
			expect(vi.getTimerCount()).toBe(1);
		}
		advance(100);
		expect(controller.getSnapshot().events.size).toBe(0);
		expect(notify).toHaveBeenCalledTimes(2);
		expect(vi.getTimerCount()).toBe(0);
		unsubscribe();
	});

	it("uses side-local display indexes and one nearest-expiry timer", () => {
		commit(book(["99"], ["101"]));
		commit(book(["100", "99", "98"], ["103", "102", "101"]));
		const events = controller.getSnapshot().events;
		expect(events.get("bid:100")?.delayMs).toBe(0);
		expect(events.get("bid:98")?.delayMs).toBe(200);
		expect(events.get("ask:103")?.delayMs).toBe(0);
		expect(events.get("ask:102")?.delayMs).toBe(400);
		expect(vi.getTimerCount()).toBe(1);
		advance(800);
		expect([...controller.getSnapshot().events.keys()]).toEqual(["bid:98", "ask:102"]);
		expect(vi.getTimerCount()).toBe(1);
		advance(200);
		expect([...controller.getSnapshot().events.keys()]).toEqual(["ask:102"]);
		advance(200);
		expect(controller.getSnapshot().events.size).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
		for (let index = 0; index < 100; index += 1) {
			expect(getOrderbookLevelPulseDelay(index)).toBeGreaterThanOrEqual(0);
			expect(getOrderbookLevelPulseDelay(index)).toBeLessThanOrEqual(450);
		}
	});

	it("uses the full feed baseline and never queues effects for levels outside the visible ladder", () => {
		commit(book(["99", "98", "97"]), { visibleLevels: [{ side: "bid", price: "99" }] });
		commit(book(["99", "98", "97", "96"]), { visibleLevels: [{ side: "bid", price: "97" }] });
		expect(controller.getSnapshot().events.size).toBe(0);
		commit(book(["99", "98", "97", "96"]), { visibleLevels: [{ side: "bid", price: "96" }] });
		expect(controller.getSnapshot().events.size).toBe(0);
		commit(book(["100", "99", "98", "97", "96"]), { visibleLevels: [{ side: "bid", price: "100" }] });
		expect(controller.getSnapshot().events.has("bid:100")).toBe(true);
		commit(book(["100", "99", "98", "97", "96"]), { visibleLevels: [{ side: "bid", price: "99" }] });
		expect(controller.getSnapshot().events.size).toBe(0);
		commit(book(["100", "99", "98", "97", "96"]), { visibleLevels: [{ side: "bid", price: "100" }] });
		expect(controller.getSnapshot().events.size).toBe(0);
	});

	it("deduplicates the same committed frame and does not change delays when visible ranks move", () => {
		commit(book(["99"]));
		const update = book(["100", "99", "98"]);
		commit(update);
		const event = controller.getSnapshot().events.get("bid:100");
		commit(update, {
			visibleLevels: [
				{ side: "bid", price: "98" },
				{ side: "bid", price: "100" },
			],
		});
		expect(controller.getSnapshot().events.get("bid:100")).toBe(event);
		expect(controller.getSnapshot().events.get("bid:100")?.delayMs).toBe(0);
	});

	it.each([
		{ identity: "testnet:HYPE:native:l2" },
		{ identity: "mainnet:BTC:native:l2" },
		{ identity: "mainnet:HYPE:5:l2" },
		{ identity: "mainnet:HYPE:native:l2Book-fast" },
		{ viewKey: "asks:24:0" },
		{ viewKey: "both:13:13" },
	])("resets the baseline and active events when the context changes: %j", (context) => {
		commit(book(["99"]));
		commit(book(["100", "99"]));
		expect(controller.getSnapshot().events.size).toBe(1);
		commit(book(["200", "199"]), context);
		expect(controller.getSnapshot().events.size).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
		commit(book(["201", "200", "199"]), context);
		expect(controller.getSnapshot().events.has("bid:201")).toBe(true);
	});

	it("clears missing and inactive data and makes the first recovery frame silent", () => {
		commit(book(["99"]));
		commit(book(["100", "99"]));
		commit(undefined);
		expect(controller.getSnapshot().events.size).toBe(0);
		commit(book(["110", "109"]));
		expect(controller.getSnapshot().events.size).toBe(0);
		commit(book(["111", "110", "109"]));
		expect(controller.getSnapshot().events.size).toBe(1);
		commit(book(["111", "110", "109"]), { active: false });
		expect(controller.getSnapshot().events.size).toBe(0);
		commit(book(["120", "119"]));
		expect(controller.getSnapshot().events.size).toBe(0);
	});

	it("cancels effects while the environment is suppressed and establishes a fresh baseline after resuming", () => {
		commit(book(["99"]));
		commit(book(["100", "99"]));
		controller.setEnvironmentActive(false);
		expect(controller.getSnapshot().events.size).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
		commit(book(["101", "100", "99"]));
		controller.setEnvironmentActive(true);
		commit(book(["110", "109"]));
		expect(controller.getSnapshot().events.size).toBe(0);
		commit(book(["111", "110", "109"]));
		expect(controller.getSnapshot().events.has("bid:111")).toBe(true);
	});

	it("does not flash an empty side's first returning snapshot or reset the other side", () => {
		commit(book(["99"], ["101"]));
		commit(book([], ["102", "101"]));
		expect([...controller.getSnapshot().events.keys()]).toEqual(["ask:102"]);
		commit(book(["100", "99"], ["103", "102", "101"]));
		expect(controller.getSnapshot().events.has("bid:100")).toBe(false);
		expect(controller.getSnapshot().events.has("ask:103")).toBe(true);
	});

	it("discards deleted levels and ignores old animation-end callbacks after reentry", () => {
		commit(book(["99"]));
		commit(book(["100", "99"]));
		const first = controller.getSnapshot().events.get("bid:100");
		expect(first).toBeDefined();
		commit(book(["99"]));
		expect(controller.getSnapshot().events.size).toBe(0);
		commit(book(["100", "99"]));
		const second = controller.getSnapshot().events.get("bid:100");
		expect(second?.id).not.toBe(first?.id);
		controller.onAnimationEnd(first?.id ?? -1);
		expect(controller.getSnapshot().events.get("bid:100")).toBe(second);
		controller.onAnimationEnd(second?.id ?? -1);
		expect(controller.getSnapshot().events.size).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("allows cleanup and setup to repeat without replay or leaking timers", () => {
		const frame = book(["99"]);
		commit(frame);
		controller.reset();
		commit(frame);
		expect(controller.getSnapshot().events.size).toBe(0);
		commit(book(["100", "99"]));
		expect(controller.getSnapshot().events.size).toBe(1);
		controller.reset();
		advance(2000);
		expect(controller.getSnapshot().events.size).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
		commit(book(["200", "199"]));
		expect(controller.getSnapshot().events.size).toBe(0);
		commit(book(["201", "200", "199"]));
		expect(controller.getSnapshot().events.size).toBe(1);
	});
});
