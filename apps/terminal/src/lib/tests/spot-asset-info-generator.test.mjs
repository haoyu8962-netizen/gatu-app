import { describe, expect, it } from "vitest";
import {
	classifySocialUrl,
	createDescriptionEntries,
	createSocialEntries,
	createSpotIdentityEntries,
	isUsableDescription,
	validateAssetInfoSnapshot,
} from "../../../../../scripts/spot-asset-info-generator.mjs";

const BASE_TOKEN_ID = "0x11111111111111111111111111111111";
const QUOTE_TOKEN_ID = "0x22222222222222222222222222222222";

function createSpotMeta() {
	return {
		tokens: [
			{ index: 1, name: "TOKEN", tokenId: BASE_TOKEN_ID },
			{ index: 2, name: "USDC", tokenId: QUOTE_TOKEN_ID },
		],
		universe: [{ name: "@7", tokens: [1, 2] }],
	};
}

function createSnapshotEntry(overrides = {}) {
	return {
		pair: "@7",
		base: "TOKEN",
		quote: "USDC",
		trustTier: 1,
		origin: "hyperliquid-official-i18n",
		desc: { en: "Token description", "zh-CN": "代币说明" },
		unit: null,
		socials: null,
		...overrides,
	};
}

describe("spot asset information generator", () => {
	it("validates the snapshot schema and binds entries to immutable token IDs", () => {
		const snapshot = validateAssetInfoSnapshot({
			schema: "hyperliquid-asset-info-snapshot/v1",
			generatedAt: "2026-07-29T00:00:00.000Z",
			spot: [createSnapshotEntry()],
		});
		const identities = createSpotIdentityEntries(createSpotMeta());
		const descriptions = createDescriptionEntries(snapshot.spot, identities);

		expect(descriptions["@7"]).toEqual({
			base: "TOKEN",
			quote: "USDC",
			baseTokenId: BASE_TOKEN_ID,
			quoteTokenId: QUOTE_TOKEN_ID,
			descriptionKind: "asset",
			descriptions: { en: "Token description", "zh-CN": "代币说明" },
		});
	});

	it("fails closed when a pair name is reused for different tokens", () => {
		const identities = createSpotIdentityEntries(createSpotMeta());

		expect(() => createDescriptionEntries([createSnapshotEntry({ base: "DIFFERENT" })], identities)).toThrow(
			"Spot identity mismatch",
		);
	});

	it("separates Unit provider copy from asset descriptions and rejects broken text", () => {
		const identities = createSpotIdentityEntries(createSpotMeta());
		const descriptions = createDescriptionEntries(
			[
				createSnapshotEntry({
					desc: { en: "Enabled by Unit on HyperLiquid", es: "broken \\", fr: "\uFFFD" },
					unit: { docTrustTier: 2 },
				}),
			],
			identities,
		);

		expect(descriptions["@7"].descriptionKind).toBe("provider");
		expect(descriptions["@7"].descriptions).toEqual({ en: "Enabled by Unit on Hyperliquid" });
		expect(isUsableDescription("broken \\")).toBe(false);
		expect(isUsableDescription("\uFFFD")).toBe(false);
	});

	it("classifies social links by destination and drops unauditable shorteners", () => {
		const identities = createSpotIdentityEntries(createSpotMeta());
		const socials = createSocialEntries(
			[
				createSnapshotEntry({
					socials: {
						displayName: "Token",
						x: "https://x.com/token",
						telegram: "https://token.example/",
						website: "https://t.me/token",
						trustTier: 3,
						origin: "hyperliquid-frontend-curated-whitelist",
					},
				}),
			],
			identities,
		);

		expect(socials["@7"]).toMatchObject({
			x: "https://x.com/token",
			telegram: "https://t.me/token",
			website: "https://token.example/",
		});
		expect(classifySocialUrl("https://t.co/opaque")).toBeNull();
		expect(classifySocialUrl("http://t.me/insecure")).toBeNull();
	});
});
