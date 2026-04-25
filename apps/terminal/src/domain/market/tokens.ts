import { TOKEN_ICON_BASE_URL } from "@/config/app";
import { ASSET_REPLACEMENTS, categoryMapping, type MarketCategory, NO_SPOT_PREFIX_ASSETS } from "@/config/tokens";
import { PERP_MARKET_NAME_SEPARATOR, SPOT_MARKET_NAME_SEPARATOR } from "./display";
import type { MarketKind } from "./types";

interface RawToken {
	name: string;
	fullName?: string | null;
}

export function getUnderlyingAsset(token: RawToken): string | undefined {
	if (ASSET_REPLACEMENTS[token.name]) {
		return ASSET_REPLACEMENTS[token.name];
	}
	if (token.fullName?.startsWith("Unit") && token.name.startsWith("U")) {
		return token.name.slice(1);
	}
	return token.name;
}

export function getTokenDisplayName(token: RawToken): string {
	return getUnderlyingAsset(token) ?? token.name;
}

export function getIconUrlFromPair(tokenName: string, kind?: MarketKind) {
	if (kind === "spot") {
		const [base] = tokenName.split(SPOT_MARKET_NAME_SEPARATOR);
		return `${TOKEN_ICON_BASE_URL}/${base}_spot.svg`;
	}

	if (kind === "perp" || kind === "builderPerp") {
		const [base] = tokenName.split(PERP_MARKET_NAME_SEPARATOR);
		return `${TOKEN_ICON_BASE_URL}/${base}.svg`;
	}

	return `${TOKEN_ICON_BASE_URL}/${tokenName}.svg`;
}

export function getIconUrlFromMarketName(tokenName: string, kind?: MarketKind) {
	if (kind === "spot") {
		if (NO_SPOT_PREFIX_ASSETS[tokenName]) {
			return `${TOKEN_ICON_BASE_URL}/${NO_SPOT_PREFIX_ASSETS[tokenName]}.svg`;
		}
		return `${TOKEN_ICON_BASE_URL}/${tokenName}_spot.svg`;
	}
	return `${TOKEN_ICON_BASE_URL}/${tokenName}.svg`;
}

export function isTokenInCategory(token: string, category: MarketCategory) {
	if (category === "all") return true;
	return categoryMapping[token]?.includes(category) ?? false;
}

export type { MarketCategory };
