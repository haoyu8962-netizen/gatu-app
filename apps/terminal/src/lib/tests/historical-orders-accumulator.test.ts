import { RingBuffer } from "@gatu/hl-react/internal/circular-buffer/ring-buffer";
import { getAccumulateConfig } from "@gatu/hl-react/registries/subscription";
import { describe, expect, it } from "vitest";

describe("historical orders accumulator", () => {
	it("replaces an order with a newer status update for the same oid", () => {
		const config = getAccumulateConfig("userHistoricalOrders");
		if (!config) throw new Error("Missing userHistoricalOrders accumulator");

		const buffer = new RingBuffer(config.buffer);
		const open = {
			order: { oid: 42 },
			status: "open",
			statusTimestamp: 1000,
		};
		const triggered = {
			order: { oid: 42 },
			status: "triggered",
			statusTimestamp: 2000,
		};

		expect(buffer.add([open])).toBe(true);
		expect(buffer.add([triggered])).toBe(true);
		expect(buffer.getItems()).toEqual([triggered]);
	});

	it("does not replace an order with an older status update", () => {
		const config = getAccumulateConfig("userHistoricalOrders");
		if (!config) throw new Error("Missing userHistoricalOrders accumulator");

		const buffer = new RingBuffer(config.buffer);
		const filled = {
			order: { oid: 42 },
			status: "filled",
			statusTimestamp: 2000,
		};
		const olderOpen = {
			order: { oid: 42 },
			status: "open",
			statusTimestamp: 1000,
		};

		expect(buffer.add([filled])).toBe(true);
		expect(buffer.add([olderOpen])).toBe(false);
		expect(buffer.getItems()).toEqual([filled]);
	});

	it("does not regress a terminal snapshot to an equal-timestamp open status", () => {
		const config = getAccumulateConfig("userHistoricalOrders");
		if (!config) throw new Error("Missing userHistoricalOrders accumulator");

		const buffer = new RingBuffer(config.buffer);
		const filled = {
			order: { oid: 42 },
			status: "filled",
			statusTimestamp: 2000,
		};
		const open = {
			order: { oid: 42 },
			status: "open",
			statusTimestamp: 2000,
		};

		expect(buffer.add([filled, open])).toBe(true);
		expect(buffer.getItems()).toEqual([filled]);

		const reverseBuffer = new RingBuffer(config.buffer);
		expect(reverseBuffer.add([open, filled])).toBe(true);
		expect(reverseBuffer.getItems()).toEqual([filled]);
	});

	it("promotes a terminal snapshot received after an equal-timestamp trigger status", () => {
		const config = getAccumulateConfig("userHistoricalOrders");
		if (!config) throw new Error("Missing userHistoricalOrders accumulator");

		const buffer = new RingBuffer(config.buffer);
		const triggered = {
			order: { oid: 42 },
			status: "triggered",
			statusTimestamp: 2000,
		};
		const filled = {
			order: { oid: 42 },
			status: "filled",
			statusTimestamp: 2000,
		};

		expect(buffer.add([triggered, filled])).toBe(true);
		expect(buffer.getItems()).toEqual([filled]);
	});
});
