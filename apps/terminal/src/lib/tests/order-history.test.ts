import type { HistoricalOrdersResponse, TwapHistoryResponse } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import {
	buildOrderHistoryEntries,
	getOrderHistoryStatusCategory,
	getOrderHistoryTriggerPrice,
	getTwapAverageFillPrice,
	getTwapHistoryTimeMs,
	isValidTwapHistoryItem,
	mergeTwapHistorySources,
} from "@/lib/trade/order-history";

function createOrderEntry(): HistoricalOrdersResponse[number] {
	return {
		order: {
			children: [],
			cloid: null,
			coin: "BTC",
			isPositionTpsl: false,
			isTrigger: false,
			limitPx: "63000",
			oid: 42,
			orderType: "Limit",
			origSz: "0.01",
			reduceOnly: false,
			side: "B",
			sz: "0",
			tif: "Gtc",
			timestamp: 1_700_000_000_000,
			triggerCondition: "N/A",
			triggerPx: "0",
		},
		status: "filled",
		statusTimestamp: 1_700_000_002_000,
	};
}

function createTwapEntry(overrides: Partial<TwapHistoryResponse[number]> = {}): TwapHistoryResponse[number] {
	return {
		state: {
			coin: "ETH",
			executedNtl: "700",
			executedSz: "0.2",
			minutes: 10,
			randomize: false,
			reduceOnly: true,
			side: "A",
			stopPx: null,
			sz: "0.5",
			timestamp: 1_700_000_001_000,
			trigger: { above: false, px: "3400" },
			user: "0x1111111111111111111111111111111111111111",
		},
		status: { status: "activated" },
		time: 1_700_000_003,
		twapId: 7,
		...overrides,
	};
}

describe("order history normalization", () => {
	it("combines ordinary and TWAP histories in update order", () => {
		const twap = createTwapEntry();
		const entries = buildOrderHistoryEntries([createOrderEntry()], [twap]);

		expect(entries.map((entry) => entry.kind)).toEqual(["twap", "order"]);
		expect(entries[0]).toMatchObject({
			coin: "ETH",
			key: "twap:7",
			reduceOnly: true,
			type: "twap",
			updatedAt: 1_700_000_003_000,
		});
		expect(getTwapHistoryTimeMs(twap)).toBe(1_700_000_003_000);
		expect(getOrderHistoryStatusCategory(entries[0] as (typeof entries)[number])).toBe("open");
		expect(getOrderHistoryTriggerPrice(entries[0] as (typeof entries)[number])).toBe("3400");
	});

	it("replaces a REST TWAP status with its newer realtime lifecycle event", () => {
		const active = createTwapEntry();
		const finished = createTwapEntry({ status: { status: "finished" }, time: 1_700_000_004 });

		expect(mergeTwapHistorySources([active], [finished])).toEqual([finished]);
		const [entry] = buildOrderHistoryEntries([], [finished]);
		expect(entry && getOrderHistoryStatusCategory(entry)).toBe("filled");
	});

	it("computes TWAP average execution price with decimal arithmetic", () => {
		expect(getTwapAverageFillPrice(createTwapEntry())).toBe("3500");
		expect(
			getTwapAverageFillPrice(createTwapEntry({ state: { ...createTwapEntry().state, executedSz: "0" } })),
		).toBeNull();
	});

	it("rejects unsupported TWAP lifecycle statuses", () => {
		expect(isValidTwapHistoryItem(createTwapEntry())).toBe(true);
		expect(isValidTwapHistoryItem(createTwapEntry({ status: { status: "paused" } as never }))).toBe(false);
		expect(isValidTwapHistoryItem(createTwapEntry({ time: Number.MAX_SAFE_INTEGER }))).toBe(false);
	});
});
