import { useLingui } from "@lingui/react/macro";
import type { ComponentProps } from "react";
import { getFormattedMidPrice, PriceInput } from "@/components/ui/price-input";
import { cn } from "@/lib/cn";
import { tradingInputFrameClass } from "@/lib/ui/trading-input";

interface Props extends Omit<ComponentProps<typeof PriceInput>, "className" | "label"> {
	label: string;
	unitLabel?: string;
}

export function MobileTradePriceField({
	label,
	disabled,
	midPrice,
	marketType,
	assetId,
	onMidClick,
	szDecimals,
	unitLabel,
	...props
}: Props) {
	const { t } = useLingui();
	const formattedMid = getFormattedMidPrice(midPrice, szDecimals, marketType, assetId);
	const hasMidAction = formattedMid != null && onMidClick != null;
	const accessibleLabel = unitLabel ? `${label} (${unitLabel})` : label;

	return (
		<div
			className={cn(
				tradingInputFrameClass,
				"h-8 px-2.5",
				"[&_button]:text-trading-panel-success [&_button:hover]:text-trading-panel-success/80",
				disabled && "opacity-50",
			)}
		>
			<span className="mr-1.5 min-w-0 shrink truncate whitespace-nowrap text-2xs text-trading-panel-subtle">
				{label}
				{unitLabel ? <span className="trade-card-label-full"> ({unitLabel})</span> : null}
			</span>
			<div className="min-w-0 flex-1">
				<PriceInput
					{...props}
					aria-label={props["aria-label"] ?? accessibleLabel}
					inputSize="lg"
					marketType={marketType}
					midPrice={midPrice}
					mobileSafe
					onMidClick={undefined}
					className="h-7 bg-transparent pl-0 text-right text-base font-semibold tabular-nums text-trading-panel-fg"
					disabled={disabled}
					szDecimals={szDecimals}
				/>
			</div>
			{hasMidAction ? (
				<button
					type="button"
					onClick={() => onMidClick(formattedMid)}
					disabled={disabled}
					aria-label={`${t`Use mid price`} ${formattedMid}`}
					className="relative ml-1 h-8 shrink-0 whitespace-nowrap text-xs font-semibold text-trading-panel-success transition-colors after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:text-trading-panel-success/80 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{t`Mid`}
				</button>
			) : null}
		</div>
	);
}
