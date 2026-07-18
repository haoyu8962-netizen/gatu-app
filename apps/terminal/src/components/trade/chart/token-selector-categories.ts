import type { PerpConciseAnnotationsResponse } from "@nktkas/hyperliquid";
import { isTokenInCategory } from "@/domain/market";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";

export type MarketScope = "favorites" | "all" | "perp" | "spot" | "crypto" | "traditional" | "hip3" | "popular";

export type TraditionalMarketSubcategory = "all" | "stocks" | "indices" | "commodities" | "fx" | "preipo";

export type PerpMarketAnnotation = PerpConciseAnnotationsResponse[number][1];

export type MarketRow = UnifiedMarketInfo & {
	annotation?: PerpMarketAnnotation;
};

export interface MarketSubcategory {
	value: string;
	label: string;
}

const TRADITIONAL_MARKET_CATEGORIES: ReadonlySet<string> = new Set([
	"stocks",
	"indices",
	"commodities",
	"fx",
	"preipo",
]);

const PREFERRED_SPOT_QUOTES = ["USDC", "USDH", "USDT"];

export function normalizePerpCategory(category: string | undefined): string | undefined {
	return category?.trim().toLowerCase();
}

export function createMarketRows(
	markets: UnifiedMarketInfo[],
	annotations: PerpConciseAnnotationsResponse | undefined,
): MarketRow[] {
	if (!annotations || annotations.length === 0) return markets;

	const annotationByCoin = new Map(annotations);
	return markets.map((market) => {
		const annotation = annotationByCoin.get(market.name);
		return annotation ? { ...market, annotation } : market;
	});
}

export function getDefaultMarketSubcategory(scope: MarketScope): string {
	return scope === "traditional" ? "indices" : "all";
}

export function marketScopeUsesAnnotations(scope: MarketScope): boolean {
	return scope === "crypto" || scope === "traditional";
}

export function getSpotQuoteSubcategories(markets: readonly UnifiedMarketInfo[]): MarketSubcategory[] {
	const quotes = new Set<string>();

	for (const market of markets) {
		if (market.kind !== "spot") continue;
		const quoteToken = market.tokensInfo[1];
		const quote = quoteToken?.displayName ?? quoteToken?.name;
		if (quote) quotes.add(quote);
	}

	const orderedQuotes = [...quotes].sort((left, right) => {
		const leftIndex = PREFERRED_SPOT_QUOTES.indexOf(left);
		const rightIndex = PREFERRED_SPOT_QUOTES.indexOf(right);
		if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
		if (leftIndex >= 0) return -1;
		if (rightIndex >= 0) return 1;
		return left.localeCompare(right);
	});

	return [{ value: "all", label: "All" }, ...orderedQuotes.map((quote) => ({ value: quote, label: quote }))];
}

export function isMarketInScope(market: MarketRow, scope: MarketScope, isFavorite: boolean): boolean {
	const category = normalizePerpCategory(market.annotation?.category);

	switch (scope) {
		case "favorites":
			return isFavorite;
		case "all":
			return true;
		case "perp":
			return market.kind === "perp";
		case "spot":
			return market.kind === "spot";
		case "crypto":
			// Builder crypto markets may omit an annotation; traditional assets are explicitly categorized.
			return market.kind !== "builderPerp" || category === undefined || category === "crypto";
		case "traditional":
			return market.kind === "builderPerp" && category !== undefined && TRADITIONAL_MARKET_CATEGORIES.has(category);
		case "hip3":
			return market.kind === "builderPerp";
		case "popular":
			return isTokenInCategory(market.shortName, "trending");
	}
}

export function isMarketInSubcategory(market: MarketRow, scope: MarketScope, subcategory: string): boolean {
	if (subcategory === "all") return true;

	if (scope === "traditional") {
		return normalizePerpCategory(market.annotation?.category) === subcategory;
	}

	if (scope === "spot" && market.kind === "spot") {
		const quoteToken = market.tokensInfo[1];
		return (quoteToken?.displayName ?? quoteToken?.name) === subcategory;
	}

	if (scope === "hip3" && market.kind === "builderPerp") {
		return market.dex === subcategory;
	}

	return true;
}

export function getMarketSelectorPairName(market: MarketRow): string {
	const displayName = market.annotation?.displayName;
	if (!displayName || market.kind === "spot") return market.pairName;

	const quoteSeparatorIndex = market.pairName.indexOf("-");
	if (quoteSeparatorIndex < 0) return displayName;
	return `${displayName}${market.pairName.slice(quoteSeparatorIndex)}`;
}
