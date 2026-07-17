import type { PerpConciseAnnotationsResponse } from "@nktkas/hyperliquid";
import { isTokenInCategory, type MarketCategory } from "@/domain/market";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";

export type MarketScope =
	| "favorites"
	| "all"
	| "perp"
	| "spot"
	| "crypto"
	| "traditional"
	| "hip3"
	| "popular"
	| "prelaunch";

export type TraditionalMarketSubcategory = "all" | "stocks" | "indices" | "commodities" | "fx" | "preipo";

export type PerpMarketAnnotation = PerpConciseAnnotationsResponse[number][1];

export type MarketRow = UnifiedMarketInfo & {
	annotation?: PerpMarketAnnotation;
};

const TRADITIONAL_MARKET_CATEGORIES = new Set<TraditionalMarketSubcategory>([
	"stocks",
	"indices",
	"commodities",
	"fx",
	"preipo",
]);

const PRELAUNCH_CATEGORIES = new Set(["prelaunch", "pre-launch", "pre_launch"]);

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
			return (
				market.kind === "builderPerp" &&
				category !== undefined &&
				TRADITIONAL_MARKET_CATEGORIES.has(category as TraditionalMarketSubcategory)
			);
		case "hip3":
			return market.kind === "builderPerp";
		case "popular":
			return isTokenInCategory(market.shortName, "trending");
		case "prelaunch":
			return category !== undefined && PRELAUNCH_CATEGORIES.has(category);
	}
}

export function isMarketInSubcategory(market: MarketRow, scope: MarketScope, subcategory: string): boolean {
	if (subcategory === "all") return true;

	if (scope === "traditional") {
		return normalizePerpCategory(market.annotation?.category) === subcategory;
	}

	if (scope === "perp") {
		return isTokenInCategory(market.shortName, subcategory as MarketCategory);
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
