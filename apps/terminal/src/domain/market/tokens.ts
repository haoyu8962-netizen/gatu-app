import type { HyperliquidEnv, MarketSpotToken as SpotToken } from "@sairn/hl-react";
import { DEFAULT_QUOTE_TOKEN, TOKEN_ICON_BASE_URL, USDC_TRANSFER_DECIMALS } from "@/config/app";
import { SPOT_TOKEN_DISPLAY_NAMES } from "@/config/spot-token-display-names";
import { categoryMapping, type MarketCategory, NO_SPOT_PREFIX_ASSETS } from "@/config/tokens";
import { PERP_MARKET_NAME_SEPARATOR, SPOT_MARKET_NAME_SEPARATOR } from "./display";
import type { MarketKind } from "./types";

interface ProtocolToken {
	index: number;
	name: string;
}

/**
 * Display names by token index: the official table's name when the token at that index carries the
 * recorded name, otherwise the protocol name, suffixed with the index when a table entry shows it.
 */
export function getSpotTokenDisplayNames(
	tokens: readonly ProtocolToken[],
	env: HyperliquidEnv,
): ReadonlyMap<number, string> {
	const entries = new Map(
		SPOT_TOKEN_DISPLAY_NAMES[env].map(([index, tokenName, displayName]) => [index, [tokenName, displayName]]),
	);
	const names = new Map<number, string>();
	const tableNames = new Set<string>();
	for (const token of tokens) {
		const [tokenName, displayName] = entries.get(token.index) ?? [];
		if (tokenName !== token.name || !displayName) continue;
		names.set(token.index, displayName);
		tableNames.add(displayName);
	}
	for (const token of tokens) {
		if (names.has(token.index)) continue;
		names.set(token.index, tableNames.has(token.name) ? `${token.name}-${token.index}` : token.name);
	}
	return names;
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

export function getTokenTransferDecimals(token: SpotToken | undefined): number {
	if (token?.name === DEFAULT_QUOTE_TOKEN) return USDC_TRANSFER_DECIMALS;
	return token?.transferDecimals ?? USDC_TRANSFER_DECIMALS;
}

export function isTokenInCategory(token: string, category: MarketCategory) {
	if (category === "all") return true;
	return categoryMapping[token]?.includes(category) ?? false;
}

export type { MarketCategory };
