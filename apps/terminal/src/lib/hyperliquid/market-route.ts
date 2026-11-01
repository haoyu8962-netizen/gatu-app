import type { MarketSpotToken } from "@sairn/hl-react";
import { DEFAULT_MARKET_NAME, DEFAULT_QUOTE_TOKEN } from "@/config/app";
import type { ExchangeScope } from "@/domain/market";
import { BUILDER_DEX_SEPARATOR, SPOT_MARKET_NAME_SEPARATOR } from "@/domain/market";
import type { UnifiedMarketInfo } from "./hooks/useMarketsInfo";

export interface TradeRouteMarket {
	name: string;
	scope: ExchangeScope;
	dex: string | undefined;
}

export type TradeRouteToken = Pick<MarketSpotToken, "displayName" | "tokenId">;

const MAX_TRADE_ROUTE_MARKET_NAME_LENGTH = 128;
const TOKEN_ID_ROUTE_PREFIX = "0x";

function hasUnsafeRouteCharacter(segment: string): boolean {
	for (const character of segment) {
		const codePoint = character.codePointAt(0);
		if (
			character === "\\" ||
			codePoint === undefined ||
			codePoint <= 0x1f ||
			(codePoint >= 0x7f && codePoint <= 0x9f)
		) {
			return true;
		}
	}
	return false;
}

function decodeSegment(segment: string | undefined): string | undefined {
	if (!segment) return undefined;
	try {
		return decodeURIComponent(segment);
	} catch {
		return undefined;
	}
}

function encodeSegment(segment: string): string {
	return encodeURIComponent(segment).replace(/%3A/gi, BUILDER_DEX_SEPARATOR).replace(/%40/gi, "@");
}

function isSafeTradeRouteSegment(segment: string): boolean {
	if (!segment || segment === "." || segment === ".." || segment.trim() !== segment) return false;
	if (segment.includes(SPOT_MARKET_NAME_SEPARATOR) || hasUnsafeRouteCharacter(segment)) return false;

	try {
		return decodeURIComponent(encodeURIComponent(segment)) === segment;
	} catch {
		return false;
	}
}

export function isSafeTradeRouteMarketName(marketName: unknown): marketName is string {
	if (typeof marketName !== "string" || marketName.length > MAX_TRADE_ROUTE_MARKET_NAME_LENGTH) return false;

	const segments = marketName.split(SPOT_MARKET_NAME_SEPARATOR);
	if (segments.length === 2) {
		return segments.every(
			(segment) =>
				isSafeTradeRouteSegment(segment) && !segment.startsWith("@") && !segment.includes(BUILDER_DEX_SEPARATOR),
		);
	}
	if (segments.length !== 1 || !isSafeTradeRouteSegment(segments[0])) return false;

	const builderSegments = segments[0].split(BUILDER_DEX_SEPARATOR);
	return (
		builderSegments.length === 1 || (builderSegments.length === 2 && builderSegments.every(isSafeTradeRouteSegment))
	);
}

export function getTradeRouteMarketFromPath(pathname: string): TradeRouteMarket | undefined {
	const normalizedPath = pathname.replace(/\/+$/, "");
	const segments = (normalizedPath.startsWith("/") ? normalizedPath.slice(1) : normalizedPath).split("/");
	if (segments[0] !== "trade") return undefined;
	if (segments.some((segment) => segment === "")) return undefined;
	if (segments.length > 3) return undefined;

	const symbol = decodeSegment(segments[1]);
	const quote = decodeSegment(segments[2]);
	if (!symbol) return undefined;

	if (quote) {
		if (
			symbol.startsWith("@") ||
			symbol.includes(BUILDER_DEX_SEPARATOR) ||
			quote.startsWith("@") ||
			quote.includes(BUILDER_DEX_SEPARATOR)
		) {
			return undefined;
		}
		const name = `${symbol}${SPOT_MARKET_NAME_SEPARATOR}${quote}`;
		if (!isSafeTradeRouteMarketName(name)) return undefined;
		return {
			name,
			scope: "spot",
			dex: undefined,
		};
	}

	if (!isSafeTradeRouteMarketName(symbol)) return undefined;

	if (symbol.includes(BUILDER_DEX_SEPARATOR)) {
		return {
			name: symbol,
			scope: "builders-perp",
			dex: symbol.split(BUILDER_DEX_SEPARATOR)[0],
		};
	}

	if (symbol.startsWith("@") || symbol.startsWith(TOKEN_ID_ROUTE_PREFIX)) {
		return {
			name: symbol,
			scope: "spot",
			dex: undefined,
		};
	}

	return {
		name: symbol,
		scope: "perp",
		dex: undefined,
	};
}

export function isMalformedTradeMarketPath(pathname: string): boolean {
	const normalizedPath = pathname.replace(/\/+$/, "");
	if (normalizedPath === "/trade" || normalizedPath === "trade") return false;
	if (!(normalizedPath.startsWith("/trade/") || normalizedPath.startsWith("trade/"))) return false;
	return getTradeRouteMarketFromPath(pathname) === undefined;
}

export function getTradeRouteName(market: UnifiedMarketInfo): string {
	return market.kind === "spot" ? (market.routeName ?? market.pairName) : market.name;
}

export function getTradePathForMarket(market: UnifiedMarketInfo): string {
	if (market.kind === "spot") {
		const [baseToken, quoteToken] = getTradeRouteName(market).split(SPOT_MARKET_NAME_SEPARATOR);
		if (baseToken && quoteToken) {
			return `/trade/${encodeSegment(baseToken)}/${encodeSegment(quoteToken)}`;
		}
	}

	return `/trade/${encodeSegment(market.name)}`;
}

/**
 * The path a trade route is replaced with: a resolved spot address (`@N`, a token ID, another case or
 * an unknown quote) goes to its display path, and an address that names no market to the default one.
 */
export function getTradeRouteRedirectPath(
	routeMarketName: string | undefined,
	redirectMarket: UnifiedMarketInfo | undefined,
	isUnresolved: boolean,
): string | undefined {
	if (redirectMarket) {
		return routeMarketName === getTradeRouteName(redirectMarket) ? undefined : getTradePathForMarket(redirectMarket);
	}
	return isUnresolved && routeMarketName !== DEFAULT_MARKET_NAME
		? getTradePathForMarketName(DEFAULT_MARKET_NAME)
		: undefined;
}

export function getTradePathForMarketName(marketName: string): string {
	const safeMarketName = isSafeTradeRouteMarketName(marketName) ? marketName : DEFAULT_MARKET_NAME;
	const [baseToken, quoteToken] = safeMarketName.split(SPOT_MARKET_NAME_SEPARATOR);
	if (baseToken && quoteToken) {
		return `/trade/${encodeSegment(baseToken)}/${encodeSegment(quoteToken)}`;
	}

	return `/trade/${encodeSegment(safeMarketName)}`;
}

function findSpotMarketByTokenIds(
	markets: readonly UnifiedMarketInfo[],
	requestedName: string,
	tokens: readonly TradeRouteToken[],
): UnifiedMarketInfo | undefined {
	const [baseTokenId, quoteTokenId, extra] = requestedName.split(SPOT_MARKET_NAME_SEPARATOR);
	if (extra !== undefined) return undefined;
	const quoteName = tokens.find((token) => token.tokenId === quoteTokenId)?.displayName ?? DEFAULT_QUOTE_TOKEN;
	const matches = markets.filter(
		(market) =>
			market.kind === "spot" &&
			market.tokensInfo[0]?.tokenId === baseTokenId &&
			market.tokensInfo[1]?.displayName === quoteName,
	);
	return matches.length === 1 ? matches[0] : undefined;
}

function getSpotRouteWithDefaultQuote(requestedName: string, tokens: readonly TradeRouteToken[]): string | undefined {
	const [baseName, quoteName, extra] = requestedName.split(SPOT_MARKET_NAME_SEPARATOR);
	if (!baseName || quoteName === undefined || extra !== undefined) return undefined;
	const normalizedQuoteName = quoteName.toLocaleLowerCase("en-US");
	if (tokens.some((token) => token.displayName.toLocaleLowerCase("en-US") === normalizedQuoteName)) return undefined;
	return `${baseName}${SPOT_MARKET_NAME_SEPARATOR}${DEFAULT_QUOTE_TOKEN}`;
}

/**
 * Resolves what the official terminal resolves: a token-ID address (`0x<base>` or `0x<base>/0x<quote>`),
 * a display pair in any case, and a display pair whose quote names no token, which opens the base
 * against USDC. Raw protocol token names (`UBTC/USDC`) resolve to nothing.
 */
export function findCanonicalMarketForRoute(
	markets: readonly UnifiedMarketInfo[],
	requestedName: string,
	tokens: readonly TradeRouteToken[],
): UnifiedMarketInfo | undefined {
	if (requestedName.startsWith(TOKEN_ID_ROUTE_PREFIX)) return findSpotMarketByTokenIds(markets, requestedName, tokens);
	const market = findMarketByRouteName(markets, requestedName);
	if (market) return market;
	const defaultQuoteRoute = getSpotRouteWithDefaultQuote(requestedName, tokens);
	return defaultQuoteRoute ? findMarketByRouteName(markets, defaultQuoteRoute) : undefined;
}

function findMarketByRouteName(
	markets: readonly UnifiedMarketInfo[],
	requestedName: string,
): UnifiedMarketInfo | undefined {
	const exactName = markets.find((market) => market.name === requestedName);
	if (exactName) return exactName;

	const exactPairMatches = markets.filter((market) => market.pairName === requestedName);
	if (exactPairMatches.length === 1) return exactPairMatches[0];

	const normalizedRequestedName = requestedName.toLocaleLowerCase("en-US");
	const normalizedMatches = markets.filter(
		(market) =>
			market.name.toLocaleLowerCase("en-US") === normalizedRequestedName ||
			market.pairName.toLocaleLowerCase("en-US") === normalizedRequestedName,
	);
	return normalizedMatches.length === 1 ? normalizedMatches[0] : undefined;
}
