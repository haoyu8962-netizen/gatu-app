import {
	calculateOutcomeAssetId,
	getAssetIdKind,
	getOutcomeAssetIdFromCoin,
	isBuilderPerpAssetId,
	isOutcomeAssetId,
	OUTCOME_ASSET_ID_OFFSET,
	parseAssetId,
	parseOutcomeCoin,
} from "@sairn/hl-react";
import { describe, expect, it } from "vitest";

describe("Hyperliquid outcome asset IDs", () => {
	it("derives the official outcome encoding and action asset ID", () => {
		expect(calculateOutcomeAssetId(1, 0)).toBe(100_000_010);
		expect(calculateOutcomeAssetId(1, 1)).toBe(100_000_011);
		expect(parseOutcomeCoin("#10")).toEqual({
			assetId: 100_000_010,
			encoding: 10,
			outcome: 1,
			side: 0,
		});
		expect(getOutcomeAssetIdFromCoin("#11")).toBe(100_000_011);
	});

	it("keeps builder perps and outcomes disjoint at the protocol boundary", () => {
		expect(isBuilderPerpAssetId(OUTCOME_ASSET_ID_OFFSET - 1)).toBe(true);
		expect(isBuilderPerpAssetId(OUTCOME_ASSET_ID_OFFSET)).toBe(false);
		expect(isOutcomeAssetId(OUTCOME_ASSET_ID_OFFSET)).toBe(true);
		expect(getAssetIdKind(OUTCOME_ASSET_ID_OFFSET)).toBe("outcome");
		expect(parseAssetId(100_000_010)).toEqual({
			kind: "outcome",
			assetId: 100_000_010,
			encoding: 10,
			outcome: 1,
			side: 0,
		});
	});

	it.each(["#", "#01", "#+10", "#-10", "#1.0", "#12", "#9007199254740991", " #10", "#10 "])(
		"rejects the invalid outcome coin %s",
		(coin) => {
			expect(parseOutcomeCoin(coin)).toBeNull();
			expect(getOutcomeAssetIdFromCoin(coin)).toBeUndefined();
		},
	);

	it("classifies invalid outcome-side asset IDs and invalid numbers as unknown", () => {
		expect(parseAssetId(100_000_002)).toEqual({ kind: "unknown", assetId: 100_000_002 });
		expect(isOutcomeAssetId(100_000_002)).toBe(false);
		expect(getAssetIdKind(-1)).toBe("unknown");
		expect(getAssetIdKind(Number.NaN)).toBe("unknown");
	});

	it("rejects invalid construction inputs and safe-integer overflow", () => {
		expect(() => calculateOutcomeAssetId(-1, 0)).toThrow(RangeError);
		expect(() => calculateOutcomeAssetId(1, 2 as never)).toThrow(RangeError);
		expect(() => calculateOutcomeAssetId(Number.MAX_SAFE_INTEGER, 0)).toThrow(RangeError);
	});
});
