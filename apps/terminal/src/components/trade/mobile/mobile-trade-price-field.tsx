import { useLingui } from "@lingui/react/macro";
import type { ComponentProps } from "react";
import { getFormattedMidPrice, PriceInput } from "@/components/ui/price-input";
import { cn } from "@/lib/cn";
import { useNumberFormat } from "@/lib/format";
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
	const { formatDecimalString } = useNumberFormat();
	const formattedMid = getFormattedMidPrice(midPrice, szDecimals, marketType, assetId);
	const hasMidAction = onMidClick != null;
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
			<span className="me-1.5 min-w-0 shrink truncate whitespace-nowrap text-2xs text-trading-panel-subtle">
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
					className="h-7 bg-transparent ps-0 text-right text-base font-semibold tabular-nums text-trading-panel-fg"
					disabled={disabled}
					szDecimals={szDecimals}
				/>
			</div>
			{hasMidAction ? (
				<button
					type="button"
					onClick={() => {
						if (formattedMid != null) onMidClick(formattedMid);
					}}
					disabled={disabled || formattedMid == null}
					aria-label={
						formattedMid == null ? t`Use mid price` : `${t`Use mid price`} ${formatDecimalString(formattedMid)}`
					}
					className="relative ms-1 inline-flex h-8 min-w-11 shrink-0 items-center justify-center whitespace-nowrap text-xs font-semibold text-trading-panel-success transition-colors after:absolute after:inset-0 after:content-[''] hover:text-trading-panel-success/80 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{t`Mid`}
				</button>
			) : null}
		</div>
	);
}
