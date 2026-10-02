import { CHART_EXCHANGE, CHART_QUOTE_ASSET } from "@/config/chart";

const QUOTE_SUFFIXES = ["USDC", "USDH", "USDT"];

function stripExchangePrefix(symbolName: string): string {
	const colonIdx = symbolName.indexOf(":");
	if (colonIdx === -1) return symbolName;

	const beforeColon = symbolName.slice(0, colonIdx);
	if (beforeColon.toLowerCase() !== CHART_EXCHANGE.toLowerCase()) return symbolName;

	return symbolName.slice(colonIdx + 1).trim();
}

function stripQuoteSuffix(symbolName: string): string {
	const slashIdx = symbolName.indexOf("/");
	if (slashIdx > 0) return symbolName.slice(0, slashIdx).trim();

	const upperSymbol = symbolName.toUpperCase();
	for (const quote of QUOTE_SUFFIXES) {
		const suffix = `-${quote}`;
		if (upperSymbol.endsWith(suffix)) return symbolName.slice(0, -suffix.length).trim();
	}

	return symbolName;
}

export function coinFromSymbolName(symbolName: string): string {
	const trimmed = symbolName.trim();
	return stripQuoteSuffix(stripExchangePrefix(trimmed));
}

export function normalizeChartSymbolKey(symbolName: string): string {
	return symbolName.trim().toUpperCase();
}

export function isChartDisplaySymbolName(symbolName: string): boolean {
	const withoutExchange = stripExchangePrefix(symbolName.trim());
	if (withoutExchange.includes("/")) return true;

	const upperSymbol = withoutExchange.toUpperCase();
	return QUOTE_SUFFIXES.some((quote) => upperSymbol.endsWith(`-${quote}`));
}

export function symbolFromCoin(coin: string): string {
	return `${coin}/${CHART_QUOTE_ASSET}`;
}
