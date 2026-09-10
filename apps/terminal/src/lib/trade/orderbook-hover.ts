import { HL_PRICE_MAX_SIG_FIGS } from "@/config/trade";
import { toBig } from "@/lib/trade/numbers";
import type { BookLevel } from "@/lib/trade/orderbook";

export function getOrderbookHoverPriceDecimals(price: string | undefined, maximumDecimals: number): number {
	const value = toBig(price);
	if (!value?.gt(0)) return maximumDecimals;
	return Math.min(maximumDecimals, Math.max(0, HL_PRICE_MAX_SIG_FIGS - 1 - value.e));
}

export interface OrderbookHoverSummary {
	averagePrice: string | undefined;
	distancePercent: string | undefined;
	total: string;
	quoteTotal: string;
}

export function getOrderbookHoverSummary(
	level: BookLevel,
	referencePrice: string | undefined,
): OrderbookHoverSummary | undefined {
	const price = toBig(level.price);
	const size = toBig(level.size);
	const total = toBig(level.total);
	const quoteTotal = toBig(level.quoteTotal);
	if (!price?.gt(0) || !size?.gt(0) || !total?.gt(0) || !quoteTotal?.gt(0)) return undefined;
	const reference = toBig(referencePrice);

	return {
		averagePrice: quoteTotal.div(total).toString(),
		distancePercent: reference?.gt(0) ? price.minus(reference).abs().times(100).div(reference).toString() : undefined,
		total: level.total,
		quoteTotal: level.quoteTotal,
	};
}
