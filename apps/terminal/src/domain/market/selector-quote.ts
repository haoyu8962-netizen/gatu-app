import { isLiveMarkPriceReady, type MarkPriceStatus, selectMarketHeadlinePrice } from "@/domain/trade/market-price";
import { type Big, toBig } from "@/lib/trade/numbers";
import { getTradePriceDecimals } from "@/lib/trade/trades";

/**
 * A market selector row: live mark and mid from the fast price stream, the 24h reference price from
 * the all-market context stream, and whether that context came from a live frame.
 */
export interface MarketSelectorQuoteSource {
	midPx?: string | null;
	markPx?: string;
	markPriceStatus?: MarkPriceStatus;
	markPriceReceivedAt?: number;
	prevDayPx?: string;
	assetContextLive?: boolean;
}

export interface MarketSelectorChange {
	price: Big;
	prevDayPx: Big;
	amount: Big;
	ratio: Big;
}

export interface MarketSelectorQuoteChange {
	amount: string;
	ratio: string;
	direction: -1 | 0 | 1;
	decimals: number;
}

export interface MarketSelectorQuote {
	price: string | undefined;
	priceDecimals: number;
	change: MarketSelectorQuoteChange | undefined;
}

interface MarketSelectorQuoteOptions {
	szDecimals: number;
	marketType: "perp" | "spot";
	now?: number;
}

/**
 * The selector prices a market like the trade header: the live context's mid, or its mark only when
 * the mid is missing or null. A stale, failed or receipt-less price context has no price.
 */
export function getMarketSelectorPrice(market: MarketSelectorQuoteSource, now = Date.now()): string | undefined {
	if (!isLiveMarkPriceReady(market.markPriceStatus ?? "idle", market.markPx, market.markPriceReceivedAt, now)) {
		return undefined;
	}
	const { value } = selectMarketHeadlinePrice({ assetCtxMidPx: market.midPx, assetCtxMarkPx: market.markPx });
	return typeof value === "string" ? value : undefined;
}

/** The 24h change of the selector price, only against a previous day price from a live context. */
export function getMarketSelectorChange(
	market: MarketSelectorQuoteSource,
	now = Date.now(),
): MarketSelectorChange | undefined {
	if (market.assetContextLive !== true) return undefined;
	const price = toBig(getMarketSelectorPrice(market, now));
	const prevDayPx = toBig(market.prevDayPx);
	if (!price || !prevDayPx?.gt(0)) return undefined;
	const amount = price.minus(prevDayPx);
	return { price, prevDayPx, amount, ratio: amount.div(prevDayPx) };
}

/**
 * Display values for a selector row. Prices keep five significant figures within the market's
 * `6 - szDecimals` (perp) or `8 - szDecimals` (spot) cap; the change amount uses the finer of the
 * two prices' precisions, as the official selector does.
 */
export function getMarketSelectorQuote(
	market: MarketSelectorQuoteSource,
	{ szDecimals, marketType, now = Date.now() }: MarketSelectorQuoteOptions,
): MarketSelectorQuote {
	const price = getMarketSelectorPrice(market, now);
	const priceDecimals = getTradePriceDecimals(price, szDecimals, marketType);
	const change = getMarketSelectorChange(market, now);
	if (!change) return { price, priceDecimals, change: undefined };
	const previousDecimals = getTradePriceDecimals(market.prevDayPx, szDecimals, marketType);
	return {
		price,
		priceDecimals,
		change: {
			amount: change.amount.toString(),
			ratio: change.ratio.toString(),
			direction: change.amount.cmp(0),
			decimals: Math.max(priceDecimals, previousDecimals),
		},
	};
}
