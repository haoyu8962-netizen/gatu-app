import type { TradesWsEvent } from "@nktkas/hyperliquid";
import { szDecimalsToPriceDecimals } from "@/lib/format";
import { toBig, toNumber } from "@/lib/trade/numbers";
import { getPriceGroupingOptions } from "@/lib/trade/orderbook";

export type RawTrade = TradesWsEvent[number];

export type ProcessedTrade = {
	id: string;
	hash: string;
	time: string;
	price: string;
	size: string;
	side: "buy" | "sell";
};

export function getTradeKey(time: number, coin: string, tid: number | string): string {
	return `${time}:${coin}:${tid}`;
}

export function getTradePriceDecimals(
	markPx: string | number | null | undefined,
	szDecimals: number,
	marketType: "perp" | "spot",
): number {
	const markPrice = toNumber(markPx);
	const maxPriceDecimals = szDecimalsToPriceDecimals(szDecimals, marketType);
	return getPriceGroupingOptions(markPrice ?? undefined, maxPriceDecimals)[0]?.decimals ?? maxPriceDecimals;
}

export function getTradeQuoteSize(price: string, size: string): string | null {
	const priceValue = toBig(price);
	const sizeValue = toBig(size);
	return priceValue && sizeValue ? priceValue.times(sizeValue).toString() : null;
}

export function processTrades(trades: RawTrade[]): ProcessedTrade[] {
	return trades.map((trade) => ({
		id: getTradeKey(trade.time, trade.coin, trade.tid),
		hash: trade.hash,
		time: new Date(trade.time).toLocaleTimeString([], {
			hour: "2-digit",
			hourCycle: "h23",
			minute: "2-digit",
			second: "2-digit",
		}),
		price: trade.px,
		size: trade.sz,
		side: trade.side === "B" ? "buy" : "sell",
	}));
}
