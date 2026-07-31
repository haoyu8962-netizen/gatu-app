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
});
