import { createSubscriptionEventAccumulator } from "@sairn/hl-react/registries/subscription";
import { describe, expect, it } from "vitest";

describe("fastAssetCtxs event accumulator", () => {
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

	it("replaces the previous generation when the transport disconnects", () => {
		const accumulator = createSubscriptionEventAccumulator("fastAssetCtxs");
		if (!accumulator) throw new Error("Missing fastAssetCtxs accumulator");

		accumulator.add({ ETH: { markPx: "3000", midPx: "3001" } });
		accumulator.add({ ETH: { markPx: "3002" }, HYPE: { markPx: "40" } });
		accumulator.reset();

		expect(accumulator.add({ BTC: { markPx: "100000", midPx: "100001" } })).toEqual({
			BTC: { markPx: "100000", midPx: "100001" },
		});
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
