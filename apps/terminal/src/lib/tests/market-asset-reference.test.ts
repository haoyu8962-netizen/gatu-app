import type { PerpConciseAnnotationsResponse } from "@nktkas/hyperliquid";
import type { UnifiedMarket } from "@sairn/hl-react";
import { describe, expect, it } from "vitest";
import { canOpenMarketAssetInfo, getMarketAssetReference, hasPerpAnnotation } from "@/domain/market/asset-info";

const HYPE_TOKEN_ID = "0x0d01dc56dcaaca66ad901c959b4011ec";
const SOLANA_TOKEN_ID = "0x49b67c39f5566535de22b29b0e51e685";
const SPCXD_TOKEN_ID = "0x4f49b5f025c969501c6a350f984e1725";
const USDC_TOKEN_ID = "0x6d1e7cde53ba9467b783cb7c530ce054";

function createSpotMarket(
	quoteTokenId: `0x${string}` = USDC_TOKEN_ID,
	baseToken: { displayName: string; fullName: string; tokenId: `0x${string}` } = {
		displayName: "HYPE",
		fullName: "Hyperliquid",
		tokenId: HYPE_TOKEN_ID,
	},
): UnifiedMarket {
	return {
		kind: "spot",
		name: "@107",
		tokens: [150, 0],
		index: 107,
		isCanonical: false,
		shortName: "HYPE",
		pairName: "HYPE-USDC",
		routeName: "HYPE-USDC",
		assetId: 10_107,
		ctxIndex: 107,
		iconUrl: undefined,
		szDecimals: 2,
		isStablePair: false,
		tokensInfo: [
			{
				name: baseToken.displayName,
				displayName: baseToken.displayName,
				fullName: baseToken.fullName,
				tokenId: baseToken.tokenId,
				index: 150,
				szDecimals: 2,
				weiDecimals: 8,
				isCanonical: false,
				evmContract: null,
				deployerTradingFeeShare: "0.0",
				iconUrl: undefined,
				transferDecimals: 8,
				isWrapped: false,
			},
			{
				name: "USDC",
				displayName: "USDC",
				fullName: null,
				tokenId: quoteTokenId,
				index: 0,
				szDecimals: 8,
				weiDecimals: 8,
				isCanonical: true,
				evmContract: null,
				deployerTradingFeeShare: "0.0",
				iconUrl: undefined,
				transferDecimals: 6,
				isWrapped: false,
			},
		],
	};
}

describe("market asset references", () => {
	it("uses stable native-perp and spot token identities for local descriptions", () => {
		const perpReference = getMarketAssetReference({
			kind: "perp",
			name: "HYPE",
		} as UnifiedMarket);
		const spotReference = getMarketAssetReference(createSpotMarket());

		expect(perpReference).toMatchObject({
			kind: "perp",
			coin: "HYPE",
			localDescriptionId: "hype",
		});
		expect(spotReference).toMatchObject({
			kind: "spot",
			tokenId: HYPE_TOKEN_ID,
			localDescriptionId: "hype",
		});
	});

	it("falls back from a pair identity to the base token identity", () => {
		const reference = getMarketAssetReference(createSpotMarket("0x11111111111111111111111111111111"));

		expect(reference).toMatchObject({
			kind: "spot",
			localDescriptionId: "hype",
		});
	});

	it("identifies project-owned descriptions and providers by stable spot token id", () => {
		const reference = getMarketAssetReference(
			createSpotMarket(USDC_TOKEN_ID, {
				displayName: "SOL",
				fullName: "Unit Solana",
				tokenId: SOLANA_TOKEN_ID,
			}),
		);

		expect(reference).toMatchObject({
			kind: "spot",
			localDescriptionId: "solana",
			localProviderId: "unit",
		});
	});

	it("uses the exact SPCXD/USDC token pair for its local description", () => {
		const reference = getMarketAssetReference(
			createSpotMarket(USDC_TOKEN_ID, {
				displayName: "SPCXD",
				fullName: "Space Exploration Technologies Corp.",
				tokenId: SPCXD_TOKEN_ID,
			}),
		);

		expect(reference).toMatchObject({
			kind: "spot",
			tokenId: SPCXD_TOKEN_ID,
			localDescriptionId: "spcxd",
		});
	});

	it("matches annotation availability by the exact canonical coin", () => {
		const annotations: PerpConciseAnnotationsResponse = [
			["xyz:BOT", { category: "stocks" }],
			["xyz:GOLD", { category: "commodities" }],
		];

		expect(hasPerpAnnotation(annotations, "xyz:BOT")).toBe(true);
		expect(hasPerpAnnotation(annotations, "BOT")).toBe(false);
		expect(hasPerpAnnotation(annotations, "XYZ:BOT")).toBe(false);
	});

	it("keeps native and spot information available while gating unannotated HIP-3 markets", () => {
		const nativeReference = getMarketAssetReference({
			kind: "perp",
			name: "BTC",
		} as UnifiedMarket);
		const builderReference = getMarketAssetReference({
			kind: "builderPerp",
			name: "xyz:BOT",
			dex: "xyz",
		} as UnifiedMarket);

		expect(canOpenMarketAssetInfo(nativeReference, false)).toBe(true);
		expect(canOpenMarketAssetInfo(getMarketAssetReference(createSpotMarket()), false)).toBe(true);
		expect(canOpenMarketAssetInfo(builderReference, false)).toBe(false);
		expect(canOpenMarketAssetInfo(builderReference, true)).toBe(true);
	});
});
