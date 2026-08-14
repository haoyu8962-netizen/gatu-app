import {
	createSubscriptionEventAccumulator,
	getFastAssetCtxFieldReceivedAt,
} from "@gatu/hl-react/registries/subscription";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("fastAssetCtxs event accumulator", () => {
	afterEach(() => vi.useRealTimers());

	it("deep-merges changed coins and fields without mutating prior snapshots", () => {
		const accumulator = createSubscriptionEventAccumulator("fastAssetCtxs");
		if (!accumulator) throw new Error("Missing fastAssetCtxs accumulator");

		const first = accumulator.add({
			BTC: { markPx: "100000", midPx: "100001" },
			HYPE: { markPx: "40", midPx: "40.01" },
		});
		const second = accumulator.add({ HYPE: { markPx: "41" } });
		const third = accumulator.add({ HYPE: { midPx: null } });

		expect(first).toEqual({
			BTC: { markPx: "100000", midPx: "100001" },
			HYPE: { markPx: "40", midPx: "40.01" },
		});
		expect(second).toEqual({
			BTC: { markPx: "100000", midPx: "100001" },
			HYPE: { markPx: "41", midPx: "40.01" },
		});
		expect(third).toEqual({
			BTC: { markPx: "100000", midPx: "100001" },
			HYPE: { markPx: "41", midPx: null },
		});
	});

	it("tracks mark and mid receipt times independently for each coin", () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		const accumulator = createSubscriptionEventAccumulator("fastAssetCtxs");
		if (!accumulator) throw new Error("Missing fastAssetCtxs accumulator");

		const first = accumulator.add({ BTC: { markPx: "100000", midPx: "100001" } });
		vi.setSystemTime(2_000);
		const midOnly = accumulator.add({ BTC: { midPx: "100002" }, HYPE: { markPx: "40" } });
		vi.setSystemTime(3_000);
		const otherCoin = accumulator.add({ HYPE: { midPx: "40.01" } });

		expect(getFastAssetCtxFieldReceivedAt(first, "BTC", "markPx")).toBe(1_000);
		expect(getFastAssetCtxFieldReceivedAt(midOnly, "BTC", "markPx")).toBe(1_000);
		expect(getFastAssetCtxFieldReceivedAt(midOnly, "BTC", "midPx")).toBe(2_000);
		expect(getFastAssetCtxFieldReceivedAt(otherCoin, "BTC", "markPx")).toBe(1_000);
		expect(getFastAssetCtxFieldReceivedAt(otherCoin, "HYPE", "markPx")).toBe(2_000);
		expect(getFastAssetCtxFieldReceivedAt(otherCoin, "HYPE", "midPx")).toBe(3_000);
	});

	it("creates an independent snapshot baseline for every subscription generation", () => {
		const oldGeneration = createSubscriptionEventAccumulator("fastAssetCtxs");
		const newGeneration = createSubscriptionEventAccumulator("fastAssetCtxs");
		if (!oldGeneration || !newGeneration) throw new Error("Missing fastAssetCtxs accumulator");

		oldGeneration.add({ ETH: { markPx: "3000", midPx: "3001" } });
		const freshSnapshot = newGeneration.add({ BTC: { markPx: "100000", midPx: "100001" } });

		expect(freshSnapshot).toEqual({ BTC: { markPx: "100000", midPx: "100001" } });
	});

	it("does not add an event accumulator to ordinary snapshot streams", () => {
		expect(createSubscriptionEventAccumulator("allDexsAssetCtxs")).toBeNull();
	});
});
