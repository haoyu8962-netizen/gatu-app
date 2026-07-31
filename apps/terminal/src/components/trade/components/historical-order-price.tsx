import { useLingui } from "@lingui/react/macro";
import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import { cn } from "@/lib/cn";
import { formatUSD } from "@/lib/format";
import { getHistoricalOrderPriceDisplay } from "@/lib/trade/historical-orders";

interface Props {
	align?: "start" | "end";
	order: HistoricalOrdersResponse[number]["order"];
}

export function HistoricalOrderPrice({ align = "end", order }: Props) {
	const { t } = useLingui();
	const display = getHistoricalOrderPriceDisplay(order);

	if (display.kind === "price") {
		return <span>{formatUSD(display.price, { compact: false })}</span>;
	}

	const execution =
		display.execution.kind === "market"
			? t({ message: "Market", context: "Order type" })
			: formatUSD(display.execution.price, { compact: false });

	if (display.triggerPrice === null) {
		return (
			<span className={cn("flex flex-col gap-0.5 leading-tight", align === "end" ? "items-end" : "items-start")}>
				<span className="whitespace-nowrap text-fg">
					<span className="mr-1 text-3xs font-normal text-fg-muted">{t`Execution`}</span>
					{execution}
				</span>
				{display.execution.kind === "market" ? (
					<span className="whitespace-nowrap text-3xs font-normal text-fg-muted">
						{t`Limit Price`} {formatUSD(display.execution.protectionPrice, { compact: false })}
					</span>
				) : null}
			</span>
		);
	}

	return (
		<span className={cn("flex flex-col gap-0.5 leading-tight", align === "end" ? "items-end" : "items-start")}>
			<span className="whitespace-nowrap text-fg">
				<span className="mr-1 text-3xs font-normal text-fg-muted">{t`Trigger`}</span>
				{formatUSD(display.triggerPrice, { compact: false })}
			</span>
			<span className="whitespace-nowrap text-3xs font-normal text-fg-muted">
				{t`Execution`} {execution}
			</span>
		</span>
	);
}
