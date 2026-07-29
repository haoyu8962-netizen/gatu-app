import type { UnifiedMarket } from "@gatu/hl-react";
import { describe, expect, it } from "vitest";
import {
	getSpotAssetSnapshotIdentity,
	getSpotAssetSocials,
	loadSpotAssetDescription,
} from "@/domain/market/spot-asset-info";

function createSpotMarket(name: string, base: string, quote = "USDC"): UnifiedMarket {
	return {
		kind: "spot",
		name,
		tokensInfo: [{ name: base }, { name: quote }],
	} as unknown as UnifiedMarket;
}

describe("spot asset info snapshot", () => {
	it("matches official descriptions by API pair and underlying token identities", async () => {
		const market = createSpotMarket("@2", "LICK");
		const identity = getSpotAssetSnapshotIdentity(market);

		expect(identity).toEqual({ pair: "@2", base: "LICK", quote: "USDC" });
		await expect(loadSpotAssetDescription(identity, "zh")).resolves.toContain("人工智能");
		await expect(loadSpotAssetDescription(identity, "en")).resolves.toBeNull();
	});

	it("falls back to the official English description for unsupported app locales", async () => {
		const identity = getSpotAssetSnapshotIdentity(createSpotMarket("PURR/USDC", "PURR"));

		await expect(loadSpotAssetDescription(identity, "ar")).resolves.toContain("first native spot asset");
	});

	it("rejects stale pair indexes when the underlying token identity differs", async () => {
		const staleIdentity = getSpotAssetSnapshotIdentity(createSpotMarket("@2", "NOT_LICK"));

		await expect(loadSpotAssetDescription(staleIdentity, "zh")).resolves.toBeNull();
		expect(getSpotAssetSocials(createSpotMarket("@2", "NOT_LICK"))).toBeNull();
	});

	it("exposes only HTTPS social links for spot markets", () => {
		expect(getSpotAssetSocials(createSpotMarket("@2", "LICK"))).toEqual({
			displayName: "Lick",
			x: "https://x.com/lick_fun",
			telegram: "https://t.me/lickfun",
			website: "https://www.lick.fun/",
		});
		expect(getSpotAssetSocials(createSpotMarket("@47", "MBAPPE"))).toEqual({
			displayName: "MBappe",
			x: "https://x.com/mbappe_HL",
			telegram: "https://t.me/mbappe_HL",
			website: undefined,
		});
	});

	it("uses the official Unit issuer links for Unit-enabled spot markets", () => {
		expect(getSpotAssetSocials(createSpotMarket("@272", "UZEC"))).toEqual({
			displayName: "ZEC",
			x: "https://x.com/unitxyz",
			telegram: undefined,
			website: "https://hyperunit.xyz/",
		});
		expect(getSpotAssetSocials(createSpotMarket("@142", "UBTC"))).toEqual({
			displayName: "BTC",
			x: "https://x.com/unitxyz",
			telegram: undefined,
			website: "https://hyperunit.xyz/",
		});
	});

	it("never exposes spot snapshot links on perpetual markets", () => {
		const perp = { kind: "perp", name: "LICK" } as UnifiedMarket;

		expect(getSpotAssetSnapshotIdentity(perp)).toBeNull();
		expect(getSpotAssetSocials(perp)).toBeNull();
	});
});
