import { CaretDownIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

interface Props extends ComponentPropsWithRef<"button"> {
	labelFull: string;
	labelCompact?: string;
	value: string;
	valueCompact?: string;
	valueClassName?: string;
	loading?: boolean;
	spinnerClassName?: string;
	spanAll?: boolean;
	compact?: boolean;
}

export function TradeControlButtonView({
	labelFull,
	labelCompact,
	value,
	valueCompact,
	valueClassName,
	loading,
	spinnerClassName,
	spanAll,
	compact = true,
	className,
	...props
}: Props) {
	const labelClass = "w-full min-w-0 truncate text-3xs leading-snug text-trading-panel-subtle";
	return (
		<button
			type="button"
			{...props}
			className={cn(
				"trade-control-button group flex min-w-0 cursor-pointer flex-col items-start gap-px rounded-[10px] border border-trading-panel-stroke-card bg-surface py-1.5 text-start transition-colors",
				"hover:border-trading-panel-stroke-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
				"disabled:cursor-not-allowed disabled:text-fg-disabled",
				compact && "py-1",
				spanAll && "col-span-3",
				className,
			)}
		>
			<span className={cn(labelClass, labelCompact !== undefined && "trade-card-label-full")}>{labelFull}</span>
			{labelCompact !== undefined && <span className={cn(labelClass, "trade-card-label-compact")}>{labelCompact}</span>}
			<span className="flex w-full min-w-0 items-center gap-0.5 text-2sm font-semibold text-trading-panel-fg">
				{loading && <SpinnerGapIcon className={cn("size-3 shrink-0", spinnerClassName)} />}
				<span
					className={cn(valueCompact !== undefined && "trade-account-value-full", "min-w-0 truncate", valueClassName)}
				>
					{value}
				</span>
				{valueCompact !== undefined && (
					<span className="trade-account-value-compact min-w-0 truncate">{valueCompact}</span>
				)}
				<CaretDownIcon className="size-2.5 shrink-0 text-trading-panel-subtle" />
			</span>
		</button>
	);
}
