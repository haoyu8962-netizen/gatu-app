import type { OrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { formatOrderFeeRatePercent } from "@/domain/trade/order-fee-quote";
import { type NumberFormatters, useNumberFormat } from "@/lib/format";
import { isPositive } from "@/lib/trade/numbers";

interface OrderFeeSummaryValueProps {
	quote: OrderFeeQuote;
}

interface OrderFeeRatePairValueProps {
	takerQuote: OrderFeeQuote;
	makerQuote: OrderFeeQuote;
}

export function OrderFeeSummaryValue({ quote }: OrderFeeSummaryValueProps) {
	const numberFormat = useNumberFormat();
	const hasOrderValue = isPositive(quote.orderValue);
	const totalRate = formatOrderFeeRatePercent(quote.totalRate, numberFormat);
	const total = hasOrderValue ? `${totalRate} (${numberFormat.formatUSD(quote.totalAmount)})` : totalRate;

	return <span className="whitespace-nowrap">{total}</span>;
}

export function OrderFeeRatePairValue({ takerQuote, makerQuote }: OrderFeeRatePairValueProps) {
	const numberFormat = useNumberFormat();
	const total = formatRatePair(takerQuote.totalRate, makerQuote.totalRate, numberFormat);

	return <span className="whitespace-nowrap">{total}</span>;
}

function formatRatePair(takerRate: string, makerRate: string, numberFormat: NumberFormatters): string {
	return `${formatOrderFeeRatePercent(takerRate, numberFormat)} / ${formatOrderFeeRatePercent(makerRate, numberFormat)}`;
}
