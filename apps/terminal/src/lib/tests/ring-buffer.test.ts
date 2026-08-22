import { RingBuffer } from "@gatu/hl-react/internal/circular-buffer/ring-buffer";
import { getAccumulateConfig } from "@gatu/hl-react/registries/subscription";
import type { TwapHistoryResponse } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";

type TwapHistoryItem = TwapHistoryResponse[number];

function createTwapHistoryItem(overrides: Partial<TwapHistoryItem> = {}): TwapHistoryItem {
	return {
		state: {
			coin: "BTC",
			executedNtl: "0",
			executedSz: "0",
			minutes: 10,
			randomize: false,
			reduceOnly: false,
			side: "B",
			stopPx: null,
			sz: "0.01",
			timestamp: 500,
			trigger: null,
			user: "0x1111111111111111111111111111111111111111",
		},
		status: { status: "activated" },
		time: 1000,
		twapId: 42,
		...overrides,
	};
}

function createTwapHistoryBuffer() {
	const config = getAccumulateConfig("userTwapHistory");
	if (!config) throw new Error("Missing userTwapHistory accumulator");
	expect(config.buffer.maxSize).toBe(2000);
	return new RingBuffer(config.buffer);
}

describe("ring buffer", () => {
	it("preserves distinct lifecycle events for the same TWAP id", () => {
		const buffer = createTwapHistoryBuffer();
		const activated = createTwapHistoryItem();
		const finished = createTwapHistoryItem({ status: { status: "finished" }, time: 2000 });

		expect(buffer.add([activated])).toBe(true);
		expect(buffer.add([finished])).toBe(true);
		expect(buffer.getItems()).toEqual([finished, activated]);
	});

	it("replaces an exact TWAP lifecycle event without duplicating it", () => {
		const buffer = createTwapHistoryBuffer();
		const activated = createTwapHistoryItem();
		const updatedActivated = createTwapHistoryItem({
			state: { ...activated.state, executedNtl: "100", executedSz: "0.001" },
		});

		expect(buffer.add([activated])).toBe(true);
		expect(buffer.add([updatedActivated])).toBe(true);
		expect(buffer.getItems()).toEqual([updatedActivated]);
	});

	it("uses the state identity when the SDK omits twapId", () => {
		const buffer = createTwapHistoryBuffer();
		const first = createTwapHistoryItem({ twapId: undefined });
		const other = createTwapHistoryItem({
			state: { ...first.state, timestamp: 600 },
			twapId: undefined,
		});

		expect(buffer.add([first, other])).toBe(true);
		expect(buffer.getItems()).toHaveLength(2);
	});

	it("retains the documented TWAP slice-fill response window", () => {
		expect(getAccumulateConfig("userTwapSliceFills")?.buffer.maxSize).toBe(2000);
	});
});
