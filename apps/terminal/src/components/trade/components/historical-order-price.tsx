import { useLingui } from "@lingui/react/macro";
import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import { cn } from "@/lib/cn";
import { useNumberFormat } from "@/lib/format";
import { getHistoricalOrderPriceDisplay } from "@/lib/trade/historical-orders";
import { getMarketPriceFormatOptions } from "@/lib/trade/market-price-format";

interface Props {
	align?: "start" | "end";
	market?: { kind?: string; szDecimals?: number } | null;
	order: HistoricalOrdersResponse[number]["order"];
}

export function HistoricalOrderPrice({ align = "end", market, order }: Props) {
	const { formatPrice } = useNumberFormat();
	const { t } = useLingui();
	const display = getHistoricalOrderPriceDisplay(order);
	const priceFormat = getMarketPriceFormatOptions(market);

	if (display.kind === "limit") {
		return <bdi dir="ltr">{formatPrice(display.price, priceFormat)}</bdi>;
	}

	if (display.kind === "market") {
		return (
			<span className={cn("flex flex-col gap-0.5 leading-tight", align === "end" ? "items-end" : "items-start")}>
				<span className="whitespace-nowrap text-fg">
					<span className="me-1 text-3xs font-normal text-fg-muted">{t`Execution`}</span>
					{t({ message: "Market", context: "Order type" })}
				</span>
				<span className="whitespace-nowrap text-3xs font-normal text-fg-muted">
					{t`Protection price`} <bdi dir="ltr">{formatPrice(display.protectionPrice, priceFormat)}</bdi>
				</span>
			</span>
		);
	}

	const execution =
		display.execution.kind === "market"
			? t({ message: "Market", context: "Order type" })
			: formatPrice(display.execution.price, priceFormat);

	if (display.triggerPrice === null) {
		return (
			<span className={cn("flex flex-col gap-0.5 leading-tight", align === "end" ? "items-end" : "items-start")}>
				<span className="whitespace-nowrap text-fg">
					<span className="me-1 text-3xs font-normal text-fg-muted">{t`Execution`}</span>
					{display.execution.kind === "market" ? execution : <bdi dir="ltr">{execution}</bdi>}
				</span>
				{display.execution.kind === "market" ? (
					<span className="whitespace-nowrap text-3xs font-normal text-fg-muted">
						{t`Protection price`} <bdi dir="ltr">{formatPrice(display.execution.protectionPrice, priceFormat)}</bdi>
					</span>
				) : null}
			</span>
		);
	}

	return (
		<span className={cn("flex flex-col gap-0.5 leading-tight", align === "end" ? "items-end" : "items-start")}>
			<span className="whitespace-nowrap text-fg">
				<span className="me-1 text-3xs font-normal text-fg-muted">{t`Trigger`}</span>
				<bdi dir="ltr">{formatPrice(display.triggerPrice, priceFormat)}</bdi>
			</span>
			<span className="whitespace-nowrap text-3xs font-normal text-fg-muted">
				{t`Execution`} {display.execution.kind === "market" ? execution : <bdi dir="ltr">{execution}</bdi>}
			</span>
		</span>
	);
}
