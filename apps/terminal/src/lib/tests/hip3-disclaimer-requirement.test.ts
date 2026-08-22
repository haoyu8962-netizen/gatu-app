import { describe, expect, it } from "vitest";
import { getHip3DeployerDocumentationUrl } from "@/config/hip3-deployers";
import { getHip3DisclaimerRequirement } from "@/hooks/trade/use-hip3-disclaimer";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";

function createMarket(kind: "perp" | "spot" | "builderPerp", dex?: string): UnifiedMarketInfo {
	return { kind, dex } as UnifiedMarketInfo;
}

describe("HIP-3 disclaimer requirement", () => {
	it("requires acknowledgement only for builder-deployed perpetual markets", () => {
		expect(getHip3DisclaimerRequirement(createMarket("builderPerp", "xyz"), false)).toEqual({
			isRequired: true,
			dex: "xyz",
			documentationUrl: "https://docs.trade.xyz/consolidated-resources/specification-index",
		});
		expect(getHip3DisclaimerRequirement(createMarket("perp"), false).isRequired).toBe(false);
		expect(getHip3DisclaimerRequirement(createMarket("spot"), false).isRequired).toBe(false);
		expect(getHip3DisclaimerRequirement(undefined, false).isRequired).toBe(false);
	});

	it("does not require the disclaimer after the current version is accepted", () => {
		expect(getHip3DisclaimerRequirement(createMarket("builderPerp", "xyz"), true).isRequired).toBe(false);
	});

	it("omits untrusted documentation URLs for unknown deployers", () => {
		expect(getHip3DeployerDocumentationUrl(" XYZ ")).toBe(
			"https://docs.trade.xyz/consolidated-resources/specification-index",
		);
		expect(getHip3DeployerDocumentationUrl("unknown-dex")).toBeUndefined();
		expect(getHip3DisclaimerRequirement(createMarket("builderPerp", "unknown-dex"), false)).toEqual({
			isRequired: true,
			dex: "unknown-dex",
			documentationUrl: undefined,
		});
	});

	it.each([
		["hyna", "https://docs.hyena.trade/"],
		["cash", "https://docs.dreamcash.xyz"],
		["mkts", "https://docs.markets.xyz"],
		["para", "https://docs.paragon.trade/"],
	])("uses the verified documentation URL for %s", (dex, expectedUrl) => {
		expect(getHip3DeployerDocumentationUrl(dex)).toBe(expectedUrl);
	});
});
