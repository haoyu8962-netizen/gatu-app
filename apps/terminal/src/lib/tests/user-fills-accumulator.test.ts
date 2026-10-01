import { RingBuffer } from "@sairn/hl-react/internal/circular-buffer/ring-buffer";
import { getAccumulateConfig } from "@sairn/hl-react/registries/subscription";
import { describe, expect, it } from "vitest";

describe("user fills accumulator", () => {
	it("keeps fills that reuse a trade id across different times or markets", () => {
		const config = getAccumulateConfig("userFills");
		if (!config) throw new Error("Missing userFills accumulator");

		const buffer = new RingBuffer(config.buffer);
		const first = { coin: "BTC", tid: 42, time: 1000 };
		const later = { coin: "BTC", tid: 42, time: 2000 };
		const otherMarket = { coin: "ETH", tid: 42, time: 1000 };

		expect(buffer.add([first, later, otherMarket])).toBe(true);
		expect(buffer.getItems()).toEqual([later, first, otherMarket]);
	});
});
