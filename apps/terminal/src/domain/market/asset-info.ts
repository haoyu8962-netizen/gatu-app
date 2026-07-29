import type { UnifiedMarket } from "@gatu/hl-react";
import type { PerpConciseAnnotationsResponse } from "@nktkas/hyperliquid";

export type LocalAssetDescriptionId = "bitcoin" | "ethereum" | "hype" | "solana";
export type LocalAssetProviderId = "unit";

type TokenId = `0x${string}`;

export interface PerpAssetReference {
	kind: "perp";
	coin: string;
	isBuilder: boolean;
	localDescriptionId: LocalAssetDescriptionId | null;
}

export interface SpotAssetReference {
	kind: "spot";
	baseName: string;
	quoteName: string;
	fullName: string | null;
	tokenId: TokenId | null;
	localDescriptionId: LocalAssetDescriptionId | null;
	localProviderId: LocalAssetProviderId | null;
}

export type MarketAssetReference = PerpAssetReference | SpotAssetReference;

const BITCOIN_TOKEN_ID = "0x8f254b963e8468305d409b33aa137c67";
const ETHEREUM_TOKEN_ID = "0xe1edd30daaf5caac3fe63569e24748da";
const HYPE_TOKEN_ID = "0x0d01dc56dcaaca66ad901c959b4011ec";
const SOLANA_TOKEN_ID = "0x49b67c39f5566535de22b29b0e51e685";
const USDC_TOKEN_ID = "0x6d1e7cde53ba9467b783cb7c530ce054";
const TOKEN_ID_PATTERN = /^0x[0-9a-f]{32}$/i;

const LOCAL_PERP_DESCRIPTIONS: Readonly<Record<string, LocalAssetDescriptionId>> = {
	BTC: "bitcoin",
	ETH: "ethereum",
	HYPE: "hype",
	SOL: "solana",
};

const LOCAL_SPOT_PAIR_DESCRIPTIONS: Readonly<Record<string, LocalAssetDescriptionId>> = {
	[`${HYPE_TOKEN_ID}:${USDC_TOKEN_ID}`]: "hype",
};

const LOCAL_SPOT_TOKEN_DESCRIPTIONS: Readonly<Record<string, LocalAssetDescriptionId>> = {
	[BITCOIN_TOKEN_ID]: "bitcoin",
	[ETHEREUM_TOKEN_ID]: "ethereum",
	[HYPE_TOKEN_ID]: "hype",
	[SOLANA_TOKEN_ID]: "solana",
};

const LOCAL_SPOT_TOKEN_PROVIDERS: Readonly<Record<string, LocalAssetProviderId>> = {
	[BITCOIN_TOKEN_ID]: "unit",
	[ETHEREUM_TOKEN_ID]: "unit",
	[SOLANA_TOKEN_ID]: "unit",
};

function normalizeTokenId(value: unknown): TokenId | null {
	if (typeof value !== "string" || !TOKEN_ID_PATTERN.test(value)) return null;
	return value.toLowerCase() as TokenId;
}

function getLocalSpotDescriptionId(
	baseTokenId: TokenId | null,
	quoteTokenId: TokenId | null,
): LocalAssetDescriptionId | null {
	if (!baseTokenId) return null;
	const pairKey = quoteTokenId ? `${baseTokenId}:${quoteTokenId}` : null;
	return (
		(pairKey ? LOCAL_SPOT_PAIR_DESCRIPTIONS[pairKey] : undefined) ?? LOCAL_SPOT_TOKEN_DESCRIPTIONS[baseTokenId] ?? null
	);
}

export function getMarketAssetReference(market: UnifiedMarket | undefined): MarketAssetReference | null {
	if (!market) return null;

	if (market.kind !== "spot") {
		return {
			kind: "perp",
			coin: market.name,
			isBuilder: market.kind === "builderPerp",
			localDescriptionId: LOCAL_PERP_DESCRIPTIONS[market.name] ?? null,
		};
	}

	const baseToken = market.tokensInfo[0];
	const quoteToken = market.tokensInfo[1];
	if (!baseToken || !quoteToken) return null;

	const baseTokenId = normalizeTokenId(baseToken.tokenId);
	const quoteTokenId = normalizeTokenId(quoteToken.tokenId);

	return {
		kind: "spot",
		baseName: baseToken.displayName,
		quoteName: quoteToken.displayName,
		fullName: baseToken.fullName?.trim() || null,
		tokenId: baseTokenId,
		localDescriptionId: getLocalSpotDescriptionId(baseTokenId, quoteTokenId),
		localProviderId: baseTokenId ? (LOCAL_SPOT_TOKEN_PROVIDERS[baseTokenId] ?? null) : null,
	};
}

export function hasPerpAnnotation(
	annotations: PerpConciseAnnotationsResponse | undefined,
	coin: string | null,
): boolean {
	if (!annotations || !coin) return false;
	return annotations.some(([annotationCoin]) => annotationCoin === coin);
}

export function canOpenMarketAssetInfo(reference: MarketAssetReference | null, annotationAvailable: boolean): boolean {
	if (!reference) return false;
	if (reference.kind === "spot") {
		return reference.tokenId !== null || reference.fullName !== null || reference.localDescriptionId !== null;
	}
	if (!reference.isBuilder) return true;
	return reference.localDescriptionId !== null || annotationAvailable;
}
