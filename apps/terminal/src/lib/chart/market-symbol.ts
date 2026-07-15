import { CHART_EXCHANGE, CHART_QUOTE_ASSET } from "@/config/chart";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { normalizeChartSymbolKey, priceScaleFromMid } from "./symbol";

export type ChartSymbolInfo = {
	name: string;
	ticker: string;
	description: string;
	pricescale?: number;
};

function priceScaleFromSzDecimals(szDecimals: number): number {
	const decimals = Math.min(Math.max(6 - szDecimals, 2), 8);
	return 10 ** decimals;
}

export function getChartApiSymbol(market: UnifiedMarketInfo): string {
	return market.name;
}

export function getChartDisplayName(market: UnifiedMarketInfo): string {
	return market.pairName ?? market.name;
}

export function getLegacyChartDisplaySymbol(market: UnifiedMarketInfo): string {
	if (market.kind === "builderPerp") {
		const quoteToken = market.quoteToken?.displayName ?? market.quoteToken?.name ?? CHART_QUOTE_ASSET;
		return `${market.name}/${quoteToken}`;
	}
	return getChartDisplayName(market);
}

export function getChartMarketKeys(market: UnifiedMarketInfo): string[] {
	const keys = new Set<string>();
	for (const key of [market.name, market.pairName, getLegacyChartDisplaySymbol(market)]) {
		if (!key) continue;
		keys.add(key);
		keys.add(`${CHART_EXCHANGE}:${key}`);
	}
	return Array.from(keys);
}

export function getChartMarketLookupKey(symbolName: string): string {
	return normalizeChartSymbolKey(symbolName);
}

export function isChartMarketSymbol(market: UnifiedMarketInfo, symbolName: string): boolean {
	const lookupKey = getChartMarketLookupKey(symbolName);
	return getChartMarketKeys(market).some((key) => getChartMarketLookupKey(key) === lookupKey);
}

export function getChartPriceScale(market: UnifiedMarketInfo): number {
	if (market.markPx) return priceScaleFromMid(market.markPx);
	return priceScaleFromSzDecimals(market.szDecimals);
}

export function getChartSymbolInfo(market: UnifiedMarketInfo): ChartSymbolInfo {
	const displayName = getChartDisplayName(market);
	return {
		name: displayName,
		ticker: getChartApiSymbol(market),
		description: displayName,
		pricescale: getChartPriceScale(market),
	};
}
