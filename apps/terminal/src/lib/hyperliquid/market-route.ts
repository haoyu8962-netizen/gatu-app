import type { ExchangeScope } from "@/domain/market";
import { BUILDER_DEX_SEPARATOR, SPOT_MARKET_NAME_SEPARATOR } from "@/domain/market";
import type { UnifiedMarketInfo } from "./hooks/useMarketsInfo";

export interface TradeRouteMarket {
	name: string;
	scope: ExchangeScope;
	dex: string | undefined;
}

function decodeSegment(segment: string | undefined): string {
	if (!segment) return "";
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

function encodeSegment(segment: string): string {
	return encodeURIComponent(segment).replace(/%3A/gi, BUILDER_DEX_SEPARATOR).replace(/%40/gi, "@");
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
		return {
			name: `${symbol}${SPOT_MARKET_NAME_SEPARATOR}${quote}`,
			scope: "spot",
			dex: undefined,
		};
	}

	if (symbol.includes(BUILDER_DEX_SEPARATOR)) {
		return {
			name: symbol,
			scope: "builders-perp",
			dex: symbol.split(BUILDER_DEX_SEPARATOR)[0],
		};
	}

	if (symbol.startsWith("@")) {
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

export function getTradePathForMarket(market: UnifiedMarketInfo): string {
	if (market.kind === "spot") {
		const routeName = market.routeName ?? market.pairName;
		const [baseToken, quoteToken] = routeName.split(SPOT_MARKET_NAME_SEPARATOR);
		if (baseToken && quoteToken) {
			return `/trade/${encodeSegment(baseToken)}/${encodeSegment(quoteToken)}`;
		}
	}

	return `/trade/${encodeSegment(market.name)}`;
}

export function getTradePathForMarketName(marketName: string): string {
	const [baseToken, quoteToken] = marketName.split(SPOT_MARKET_NAME_SEPARATOR);
	if (baseToken && quoteToken) {
		return `/trade/${encodeSegment(baseToken)}/${encodeSegment(quoteToken)}`;
	}

	return `/trade/${encodeSegment(marketName)}`;
}

export function findCanonicalMarketForRoute(
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
