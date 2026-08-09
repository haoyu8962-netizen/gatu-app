import type { PerpConciseAnnotationsResponse } from "@nktkas/hyperliquid";
import { isTokenInCategory } from "@/domain/market";
import { isCryptoMarketSector, isMainPerpMarketInCryptoSector } from "@/domain/market/crypto-taxonomy";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";

export type MarketScope =
	| "favorites"
	| "all"
	| "perp"
	| "spot"
	| "crypto"
	| "traditional"
	| "prelaunch"
	| "hip3"
	| "popular";

export type PerpMarketAnnotation = PerpConciseAnnotationsResponse[number][1];

export type MarketClassificationState = "ready" | "pending" | "error" | "empty";

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
	const normalized = category?.trim().toLowerCase();
	return normalized === "stock" ? "stocks" : normalized;
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

export function getDefaultMarketSubcategory(_scope: MarketScope): string {
	return "all";
}

export function marketScopeUsesAnnotations(scope: MarketScope): boolean {
	return scope === "traditional" || scope === "prelaunch";
}

export function getMarketClassificationState(
	scope: MarketScope,
	annotations: PerpConciseAnnotationsResponse | undefined,
	queryState: { isPending: boolean; isError: boolean },
): MarketClassificationState {
	if (!marketScopeUsesAnnotations(scope) || (annotations?.length ?? 0) > 0) return "ready";
	if (queryState.isPending) return "pending";
	if (queryState.isError) return "error";
	return "empty";
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
			return market.kind === "perp";
		case "traditional":
			return market.kind === "builderPerp" && category !== undefined && TRADITIONAL_MARKET_CATEGORIES.has(category);
		case "prelaunch":
			return market.kind === "builderPerp" && category === "preipo";
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

	if (scope === "crypto") {
		return (
			market.kind === "perp" &&
			isCryptoMarketSector(subcategory) &&
			isMainPerpMarketInCryptoSector(market.name, subcategory)
		);
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

export function filterMarketRowsByScope(
	markets: readonly MarketRow[],
	scope: MarketScope,
	subcategory: string,
	favoriteNames: ReadonlySet<string>,
	classificationState: MarketClassificationState,
): MarketRow[] {
	if (classificationState !== "ready") return [];

	return markets.filter((market) => {
		if (!isMarketInScope(market, scope, favoriteNames.has(market.name))) return false;
		return isMarketInSubcategory(market, scope, subcategory);
	});
}

export function getMarketSelectorPairName(market: MarketRow): string {
	const displayName = market.annotation?.displayName;
	if (!displayName || market.kind === "spot") return market.pairName;

	const quoteSeparatorIndex = market.pairName.indexOf("-");
	if (quoteSeparatorIndex < 0) return displayName;
	return `${displayName}${market.pairName.slice(quoteSeparatorIndex)}`;
}
