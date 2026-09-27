import { describe, expect, it, vi } from "vitest";
import { createInfoWeightPacer, getItemWeightedInfoRequestWeight } from "@/lib/trade/info-weight-pacer";

function createFakeClock() {
	let time = 0;
	const waits: number[] = [];
	return {
		now: () => time,
		advance: (delayMs: number) => {
			time += delayMs;
		},
		wait: vi.fn(async (delayMs: number, _signal: AbortSignal) => {
			waits.push(delayMs);
			time += delayMs;
		}),
		waits,
	};
}

describe("getItemWeightedInfoRequestWeight", () => {
	it("adds one weight per started group of 20 items to the base weight of 20", () => {
		expect(getItemWeightedInfoRequestWeight(0)).toBe(20);
		expect(getItemWeightedInfoRequestWeight(1)).toBe(21);
		expect(getItemWeightedInfoRequestWeight(20)).toBe(21);
		expect(getItemWeightedInfoRequestWeight(21)).toBe(22);
		expect(getItemWeightedInfoRequestWeight(2_000)).toBe(120);
	});
});

describe("createInfoWeightPacer", () => {
	const signal = new AbortController().signal;

	it("lets requests through without waiting while the window has room for the reserve", async () => {
		const clock = createFakeClock();
		const pacer = createInfoWeightPacer({ ...clock, reserveWeight: 120, weightPerWindow: 360 });

		for (let request = 0; request < 3; request++) {
			await pacer.acquire(signal);
			pacer.record(120);
		}

		expect(clock.wait).not.toHaveBeenCalled();
	});

	it("waits until the oldest recorded weight leaves the window", async () => {
		const clock = createFakeClock();
		const pacer = createInfoWeightPacer({ ...clock, reserveWeight: 120, weightPerWindow: 360 });
		for (const weight of [120, 120, 120]) {
			await pacer.acquire(signal);
			pacer.record(weight);
			clock.advance(1_000);
		}
		expect(clock.waits).toEqual([]);

		await pacer.acquire(signal);

		expect(clock.waits).toEqual([57_000]);
		expect(clock.now()).toBe(60_000);
	});

	it("waits for as many old records as the reserve needs", async () => {
		const clock = createFakeClock();
		const pacer = createInfoWeightPacer({ ...clock, reserveWeight: 120, weightPerWindow: 300 });
		for (const weight of [30, 150, 100]) {
			await pacer.acquire(signal);
			pacer.record(weight);
			clock.advance(1_000);
		}
		expect(clock.waits).toEqual([]);

		await pacer.acquire(signal);

		expect(clock.waits).toEqual([58_000]);
	});

	it("counts a response heavier than the reserve against later requests", async () => {
		const clock = createFakeClock();
		const pacer = createInfoWeightPacer({ ...clock, reserveWeight: 120, weightPerWindow: 360 });
		await pacer.acquire(signal);
		pacer.record(300);

		await pacer.acquire(signal);

		expect(clock.waits).toEqual([60_000]);
	});

	it("stops waiting when the request is aborted", async () => {
		const controller = new AbortController();
		const pacer = createInfoWeightPacer({ reserveWeight: 120, weightPerWindow: 120 });
		pacer.record(120);

		const pending = pacer.acquire(controller.signal);
		controller.abort();

		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
	});
});
