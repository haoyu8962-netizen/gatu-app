import { useLingui } from "@lingui/react/macro";
import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import { cn } from "@/lib/cn";
import { formatUSD } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { getHistoricalOrderPriceDisplay } from "@/lib/trade/historical-orders";

interface Props {
	align?: "start" | "end";
	order: HistoricalOrdersResponse[number]["order"];
}

export function HistoricalOrderPrice({ align = "end", order }: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const display = getHistoricalOrderPriceDisplay(order);

	if (display.kind === "limit") {
		return <bdi dir="ltr">{formatUSD(display.price, { compact: false })}</bdi>;
	}

	if (display.kind === "market") {
		return (
			<span className={cn("flex flex-col gap-0.5 leading-tight", align === "end" ? "items-end" : "items-start")}>
				<span className="whitespace-nowrap text-fg">
					<span className="me-1 text-3xs font-normal text-fg-muted">{t`Execution`}</span>
					{t({ message: "Market", context: "Order type" })}
				</span>
				<span className="whitespace-nowrap text-3xs font-normal text-fg-muted">
					{t`Protection price`} <bdi dir="ltr">{formatUSD(display.protectionPrice, { compact: false })}</bdi>
				</span>
			</span>
		);
	}

	const execution =
		display.execution.kind === "market"
			? t({ message: "Market", context: "Order type" })
			: formatUSD(display.execution.price, { compact: false });

	if (display.triggerPrice === null) {
		return (
			<span className={cn("flex flex-col gap-0.5 leading-tight", align === "end" ? "items-end" : "items-start")}>
				<span className="whitespace-nowrap text-fg">
					<span className="me-1 text-3xs font-normal text-fg-muted">{t`Execution`}</span>
					{display.execution.kind === "market" ? execution : <bdi dir="ltr">{execution}</bdi>}
				</span>
				{display.execution.kind === "market" ? (
					<span className="whitespace-nowrap text-3xs font-normal text-fg-muted">
						{t`Protection price`}{" "}
						<bdi dir="ltr">{formatUSD(display.execution.protectionPrice, { compact: false })}</bdi>
					</span>
				) : null}
			</span>
		);
	}

	return (
		<span className={cn("flex flex-col gap-0.5 leading-tight", align === "end" ? "items-end" : "items-start")}>
			<span className="whitespace-nowrap text-fg">
				<span className="me-1 text-3xs font-normal text-fg-muted">{t`Trigger`}</span>
				<bdi dir="ltr">{formatUSD(display.triggerPrice, { compact: false })}</bdi>
			</span>
			<span className="whitespace-nowrap text-3xs font-normal text-fg-muted">
				{t`Execution`} {display.execution.kind === "market" ? execution : <bdi dir="ltr">{execution}</bdi>}
			</span>
		</span>
	);
}
