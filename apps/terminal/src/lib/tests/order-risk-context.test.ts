import { describe, expect, it } from "vitest";
import { doesOrderBatchMatchRiskContext } from "@/domain/trade/order-risk-context";
import { getMarketCapabilities, type UnifiedMarket } from "@/lib/hyperliquid";

const PERP_CONTEXT = { marketKind: "perp", marginMode: "isolated" } as const;
const SPOT_CONTEXT = { marketKind: "spot" } as const;

describe("order risk context", () => {
	it("treats the full HIP-3 asset range as perpetual markets", () => {
		expect(doesOrderBatchMatchRiskContext([{ a: 100_000 }], PERP_CONTEXT)).toBe(true);
		expect(doesOrderBatchMatchRiskContext([{ a: 120_031 }], PERP_CONTEXT)).toBe(true);
		expect(doesOrderBatchMatchRiskContext([{ a: 100_000 }], SPOT_CONTEXT)).toBe(false);
	});

	it.each(["noCross", "strictIsolated"] as const)(
		"keeps non-reduce-only orders valid for %s HIP-3 market metadata",
		(marginMode) => {
			const market = {
				kind: "builderPerp",
				assetId: 120_031,
				marginMode,
				maxLeverage: 10,
				onlyIsolated: true,
			} as unknown as UnifiedMarket;
			const capabilities = getMarketCapabilities(market);

			expect(capabilities).toMatchObject({ allowsCrossMargin: false, isOnlyIsolated: true });
			expect(doesOrderBatchMatchRiskContext([{ a: market.assetId, r: false }], PERP_CONTEXT)).toBe(true);
		},
	);

	it("keeps spot and standard perpetual asset-id boundaries distinct", () => {
		expect(doesOrderBatchMatchRiskContext([{ a: 9_999 }], PERP_CONTEXT)).toBe(true);
		expect(doesOrderBatchMatchRiskContext([{ a: 10_000 }], SPOT_CONTEXT)).toBe(true);
		expect(doesOrderBatchMatchRiskContext([{ a: 99_999 }], SPOT_CONTEXT)).toBe(true);
		expect(doesOrderBatchMatchRiskContext([{ a: 99_999 }], PERP_CONTEXT)).toBe(false);
	});

	it("treats outcome assets as spot-like and rejects malformed reserved IDs", () => {
		expect(doesOrderBatchMatchRiskContext([{ a: 100_000_010 }], SPOT_CONTEXT)).toBe(true);
		expect(doesOrderBatchMatchRiskContext([{ a: 100_000_010 }], PERP_CONTEXT)).toBe(false);
		expect(doesOrderBatchMatchRiskContext([{ a: 100_000_002 }], SPOT_CONTEXT)).toBe(false);
		expect(doesOrderBatchMatchRiskContext([{ a: 100_000_002 }], PERP_CONTEXT)).toBe(false);
	});

	it("fails closed for invalid or mixed market asset batches", () => {
		expect(doesOrderBatchMatchRiskContext([{ a: -1 }], PERP_CONTEXT)).toBe(false);
		expect(doesOrderBatchMatchRiskContext([{ a: "not-an-asset" }], PERP_CONTEXT)).toBe(false);
		expect(doesOrderBatchMatchRiskContext([{ a: 1.5 }], PERP_CONTEXT)).toBe(false);
		expect(doesOrderBatchMatchRiskContext([{ a: 1 }, { a: 10_000 }], PERP_CONTEXT)).toBe(false);
	});
});
