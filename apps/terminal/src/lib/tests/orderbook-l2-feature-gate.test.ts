import { describe, expect, it } from "vitest";
import { resolveOrderbookL2FeatureFlags } from "@/config/orderbook-l2";

describe("incremental orderbook L2 feature gate", () => {
	it("enables the incremental feed by default", () => {
		expect(resolveOrderbookL2FeatureFlags({})).toEqual({ incrementalFeedEnabled: true });
	});

	it("uses only the exact false value as the emergency rollback", () => {
		expect(resolveOrderbookL2FeatureFlags({ VITE_COMPACT_ORDERBOOK_L2_ENABLED: "false" })).toEqual({
			incrementalFeedEnabled: false,
		});

		for (const value of ["", "0", "FALSE", "true"]) {
			expect(resolveOrderbookL2FeatureFlags({ VITE_COMPACT_ORDERBOOK_L2_ENABLED: value })).toEqual({
				incrementalFeedEnabled: true,
			});
		}
	});
});
