import type { UnifiedMarket } from "@sairn/hl-react";
import { describe, expect, it } from "vitest";
import {
	getSpotAssetSnapshotIdentity,
	getSpotAssetSocials,
	hasSpotSocialLinks,
	loadSpotAssetDescription,
} from "@/domain/market/spot-asset-info";

const TOKEN_IDS: Readonly<Record<string, `0x${string}`>> = {
	LICK: "0xba3aaf468f793d9b42fd3328e24f1de9",
	MBAPPE: "0x03e1ad7d4d6d82b3da89ac8d35cc917b",
	NOT_LICK: "0x11111111111111111111111111111111",
	PURR: "0xc1fb593aeffbeb02f85e0308e9956a90",
	RUG: "0x4978f3f49f30776d9d7397b873223c2d",
	TIME: "0xae3f9675b5825ab20850ce6229c4bdbd",
	UBTC: "0x8f254b963e8468305d409b33aa137c67",
	USDC: "0x6d1e7cde53ba9467b783cb7c530ce054",
	UZEC: "0x1c994ad3381d31c86c8c2d74ed89a365",
};

function createSpotMarket(
	name: string,
	base: keyof typeof TOKEN_IDS,
	quote: keyof typeof TOKEN_IDS = "USDC",
): UnifiedMarket {
	return {
		kind: "spot",
		name,
		tokensInfo: [
			{ name: base, tokenId: TOKEN_IDS[base] },
			{ name: quote, tokenId: TOKEN_IDS[quote] },
		],
	} as unknown as UnifiedMarket;
}

describe("spot asset info snapshot", () => {
	it("matches official descriptions by API pair and underlying token identities", async () => {
		const market = createSpotMarket("@2", "LICK");
		const identity = getSpotAssetSnapshotIdentity(market);

		expect(identity).toEqual({
			pair: "@2",
			base: "LICK",
			quote: "USDC",
			baseTokenId: TOKEN_IDS.LICK,
			quoteTokenId: TOKEN_IDS.USDC,
		});
		await expect(loadSpotAssetDescription(identity, "zh")).resolves.toEqual({
			kind: "asset",
			text: expect.stringContaining("人工智能"),
		});
		await expect(loadSpotAssetDescription(identity, "en")).resolves.toBeNull();
	});

	it("does not replace unsupported app locales with English snapshot copy", async () => {
		const identity = getSpotAssetSnapshotIdentity(createSpotMarket("PURR/USDC", "PURR"));

		await expect(loadSpotAssetDescription(identity, "ar")).resolves.toBeNull();
		await expect(loadSpotAssetDescription(identity, "hi")).resolves.toBeNull();
		await expect(loadSpotAssetDescription(identity, "ja")).resolves.toBeNull();
		await expect(loadSpotAssetDescription(identity, "ja-JP")).resolves.toBeNull();
		await expect(loadSpotAssetDescription(identity, "en-US")).resolves.toEqual({
			kind: "asset",
			text: expect.stringContaining("first native spot asset"),
		});
	});

	it("classifies Unit-only snapshot copy as provider information", async () => {
		const identity = getSpotAssetSnapshotIdentity(createSpotMarket("@142", "UBTC"));

		await expect(loadSpotAssetDescription(identity, "en")).resolves.toEqual({
			kind: "provider",
			text: expect.stringContaining("enabled by Unit"),
		});
		await expect(loadSpotAssetDescription(identity, "es")).resolves.toBeNull();
	});

	it("rejects stale pair indexes when names or token IDs differ", async () => {
		const staleIdentity = getSpotAssetSnapshotIdentity(createSpotMarket("@2", "NOT_LICK"));
		const currentIdentity = getSpotAssetSnapshotIdentity(createSpotMarket("@2", "LICK"));
		if (!currentIdentity) throw new Error("Expected a spot identity");
		const staleTokenIdentity = {
			...currentIdentity,
			baseTokenId: TOKEN_IDS.NOT_LICK,
		};

		await expect(loadSpotAssetDescription(staleIdentity, "zh")).resolves.toBeNull();
		await expect(loadSpotAssetDescription(staleTokenIdentity, "zh")).resolves.toBeNull();
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

	it("uses one predicate for every supported social destination", () => {
		expect(hasSpotSocialLinks(null)).toBe(false);
		expect(hasSpotSocialLinks({ displayName: "No links" })).toBe(false);
		expect(hasSpotSocialLinks({ displayName: "X", x: "https://x.com/example" })).toBe(true);
		expect(hasSpotSocialLinks({ displayName: "Telegram", telegram: "https://t.me/example" })).toBe(true);
		expect(hasSpotSocialLinks({ displayName: "Website", website: "https://example.com/" })).toBe(true);
	});

	it("labels social destinations by their verified hostnames", () => {
		expect(getSpotAssetSocials(createSpotMarket("@13", "RUG"))).toEqual({
			displayName: "Rugman",
			x: "https://x.com/RUG_on_HL",
			telegram: undefined,
			website: undefined,
		});
		expect(getSpotAssetSocials(createSpotMarket("@138", "TIME"))).toEqual({
			displayName: "Timeswap",
			x: "https://x.com/timeswaplabs",
			telegram: "https://t.me/timeswap",
			website: "https://timeswap.io/",
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
