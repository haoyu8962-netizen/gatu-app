import type { OrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { formatOrderFeeRatePercent } from "@/domain/trade/order-fee-quote";
import { formatUSD } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { isPositive } from "@/lib/trade/numbers";

interface OrderFeeSummaryValueProps {
	quote: OrderFeeQuote;
}

interface OrderFeeRatePairValueProps {
	takerQuote: OrderFeeQuote;
	makerQuote: OrderFeeQuote;
}

export function OrderFeeSummaryValue({ quote }: OrderFeeSummaryValueProps) {
	useNumberFormatRevision();
	const hasOrderValue = isPositive(quote.orderValue);
	const totalRate = formatOrderFeeRatePercent(quote.totalRate);
	const total = hasOrderValue ? `${totalRate} (${formatUSD(quote.totalAmount)})` : totalRate;

	return <span className="whitespace-nowrap">{total}</span>;
}

export function OrderFeeRatePairValue({ takerQuote, makerQuote }: OrderFeeRatePairValueProps) {
	const total = formatRatePair(takerQuote.totalRate, makerQuote.totalRate);

	return <span className="whitespace-nowrap">{total}</span>;
}

function formatRatePair(takerRate: string, makerRate: string): string {
	return `${formatOrderFeeRatePercent(takerRate)} / ${formatOrderFeeRatePercent(makerRate)}`;
}
