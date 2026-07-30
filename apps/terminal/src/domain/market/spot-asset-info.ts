import type { UnifiedMarket } from "@gatu/hl-react";
import { SPOT_ASSET_SOCIALS } from "./spot-asset-socials.generated";

export type SpotAssetDescriptionLocale = "en" | "es" | "fr" | "zh-CN";
export type SpotAssetDescriptionKind = "asset" | "provider";
type TokenId = `0x${string}`;

export interface SpotAssetDescriptionEntry {
	base: string;
	quote: string;
	baseTokenId: TokenId;
	quoteTokenId: TokenId;
	descriptionKind: SpotAssetDescriptionKind;
	descriptions: Partial<Record<SpotAssetDescriptionLocale, string>>;
}

export interface SpotAssetSocialEntry {
	base: string;
	quote: string;
	baseTokenId: TokenId;
	quoteTokenId: TokenId;
	displayName: string;
	x?: string;
	telegram?: string;
	website?: string;
}

export interface SpotAssetSocials {
	displayName: string;
	x?: string;
	telegram?: string;
	website?: string;
}

export function hasSpotSocialLinks(socials: SpotAssetSocials | null | undefined): socials is SpotAssetSocials {
	return Boolean(socials?.x || socials?.telegram || socials?.website);
}

export interface SpotAssetSnapshotIdentity {
	pair: string;
	base: string;
	quote: string;
	baseTokenId: TokenId;
	quoteTokenId: TokenId;
}

export interface SpotAssetDescription {
	kind: SpotAssetDescriptionKind;
	text: string;
}

const TOKEN_ID_PATTERN = /^0x[0-9a-f]{32}$/i;

function normalizeTokenId(value: unknown): TokenId | null {
	if (typeof value !== "string" || !TOKEN_ID_PATTERN.test(value)) return null;
	return value.toLowerCase() as TokenId;
}

function getDescriptionLocale(locale: string): SpotAssetDescriptionLocale | null {
	const normalizedLocale = locale.toLowerCase();
	if (normalizedLocale === "zh" || normalizedLocale.startsWith("zh-")) return "zh-CN";
	if (normalizedLocale === "es" || normalizedLocale.startsWith("es-")) return "es";
	if (normalizedLocale === "fr" || normalizedLocale.startsWith("fr-")) return "fr";
	if (normalizedLocale === "en" || normalizedLocale.startsWith("en-")) return "en";
	return null;
}

function matchesIdentity(
	entry:
		| Pick<SpotAssetDescriptionEntry, "base" | "quote" | "baseTokenId" | "quoteTokenId">
		| SpotAssetSocialEntry
		| undefined,
	identity: SpotAssetSnapshotIdentity,
): boolean {
	return (
		entry?.base === identity.base &&
		entry.quote === identity.quote &&
		entry.baseTokenId === identity.baseTokenId &&
		entry.quoteTokenId === identity.quoteTokenId
	);
}

export function getSpotAssetSnapshotIdentity(market: UnifiedMarket | undefined): SpotAssetSnapshotIdentity | null {
	if (!market || market.kind !== "spot") return null;
	const baseToken = market.tokensInfo[0];
	const quoteToken = market.tokensInfo[1];
	if (!baseToken?.name || !quoteToken?.name) return null;
	const baseTokenId = normalizeTokenId(baseToken.tokenId);
	const quoteTokenId = normalizeTokenId(quoteToken.tokenId);
	if (!baseTokenId || !quoteTokenId) return null;
	return {
		pair: market.name,
		base: baseToken.name,
		quote: quoteToken.name,
		baseTokenId,
		quoteTokenId,
	};
}

export function getSpotAssetSocials(market: UnifiedMarket | undefined): SpotAssetSocials | null {
	const identity = getSpotAssetSnapshotIdentity(market);
	if (!identity) return null;
	const entry = SPOT_ASSET_SOCIALS[identity.pair];
	if (!matchesIdentity(entry, identity)) return null;
	const { displayName, x, telegram, website } = entry;
	return { displayName, x, telegram, website };
}

export async function loadSpotAssetDescription(
	identity: SpotAssetSnapshotIdentity | null,
	locale: string,
): Promise<SpotAssetDescription | null> {
	if (!identity) return null;
	const { SPOT_ASSET_DESCRIPTIONS } = await import("./spot-asset-descriptions.generated");
	const entry = SPOT_ASSET_DESCRIPTIONS[identity.pair];
	if (!matchesIdentity(entry, identity)) return null;
	const descriptionLocale = getDescriptionLocale(locale);
	if (!descriptionLocale) return null;
	const text = entry.descriptions[descriptionLocale];
	return text ? { kind: entry.descriptionKind, text } : null;
}
