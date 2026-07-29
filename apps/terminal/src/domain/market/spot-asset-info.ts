import type { UnifiedMarket } from "@gatu/hl-react";
import { SPOT_ASSET_SOCIALS } from "./spot-asset-socials.generated";

export type SpotAssetDescriptionLocale = "en" | "es" | "fr" | "zh-CN";

export interface SpotAssetDescriptionEntry {
	base: string;
	quote: string;
	descriptions: Partial<Record<SpotAssetDescriptionLocale, string>>;
}

export interface SpotAssetSocialEntry {
	base: string;
	quote: string;
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

export interface SpotAssetSnapshotIdentity {
	pair: string;
	base: string;
	quote: string;
}

function getDescriptionLocale(locale: string): SpotAssetDescriptionLocale {
	const normalizedLocale = locale.toLowerCase();
	if (normalizedLocale === "zh" || normalizedLocale.startsWith("zh-")) return "zh-CN";
	if (normalizedLocale === "es" || normalizedLocale.startsWith("es-")) return "es";
	if (normalizedLocale === "fr" || normalizedLocale.startsWith("fr-")) return "fr";
	return "en";
}

function matchesIdentity(
	entry: Pick<SpotAssetDescriptionEntry, "base" | "quote"> | SpotAssetSocialEntry | undefined,
	identity: SpotAssetSnapshotIdentity,
): boolean {
	return entry?.base === identity.base && entry.quote === identity.quote;
}

export function getSpotAssetSnapshotIdentity(market: UnifiedMarket | undefined): SpotAssetSnapshotIdentity | null {
	if (!market || market.kind !== "spot") return null;
	const baseToken = market.tokensInfo[0];
	const quoteToken = market.tokensInfo[1];
	if (!baseToken?.name || !quoteToken?.name) return null;
	return {
		pair: market.name,
		base: baseToken.name,
		quote: quoteToken.name,
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
): Promise<string | null> {
	if (!identity) return null;
	const { SPOT_ASSET_DESCRIPTIONS } = await import("./spot-asset-descriptions.generated");
	const entry = SPOT_ASSET_DESCRIPTIONS[identity.pair];
	if (!matchesIdentity(entry, identity)) return null;
	const descriptionLocale = getDescriptionLocale(locale);
	return entry.descriptions[descriptionLocale] ?? entry.descriptions.en ?? null;
}
