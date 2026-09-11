import { Checkbox } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface CheckboxOption {
	checked: boolean;
	disabled: boolean;
	onCheckedChange: (checked: boolean) => void;
}

interface Props {
	className?: string;
	reduceOnly?: CheckboxOption;
	tpSl?: CheckboxOption;
	children?: ReactNode;
	tradingPanel?: boolean;
}

export function TradeOptionCheckboxes({ className, reduceOnly, tpSl, children, tradingPanel }: Props) {
	const { t } = useLingui();
	const controlClassName = tradingPanel
		? "size-[17px] rounded-[5px] border-trading-panel-stroke-control data-checked:border-trading-panel-control data-checked:bg-trading-panel-control"
		: undefined;
	const indicatorClassName = tradingPanel ? "text-trading-panel-on-control" : undefined;
	const optionClassName = tradingPanel ? "min-w-0 min-h-5 items-center gap-1.5 max-[1000px]:min-h-8" : undefined;
	const labelClassName = tradingPanel ? "text-xs text-trading-panel-muted" : undefined;

	return (
		<div
			data-slot="trade-order-options"
			className={cn(
				className,
				tradingPanel && "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 max-[1000px]:gap-y-3",
			)}
		>
			{reduceOnly && (
				<Checkbox
					aria-label={t`Reduce Only`}
					checked={reduceOnly.checked}
					onCheckedChange={(checked: boolean | "indeterminate") => reduceOnly.onCheckedChange(checked === true)}
					disabled={reduceOnly.disabled}
					className={optionClassName}
					label={t`Reduce Only`}
					controlClassName={controlClassName}
					indicatorClassName={indicatorClassName}
					labelClassName={labelClassName}
				/>
			)}
			{children && <div className="col-start-2">{children}</div>}
			{tpSl && (
				<Checkbox
					aria-label={t`Take Profit / Stop Loss`}
					checked={tpSl.checked}
					onCheckedChange={(checked: boolean | "indeterminate") => tpSl.onCheckedChange(checked === true)}
					disabled={tpSl.disabled}
					className={cn(optionClassName, tradingPanel && "col-span-2")}
					label={t`TP/SL`}
					controlClassName={controlClassName}
					indicatorClassName={indicatorClassName}
					labelClassName={labelClassName}
				/>
			)}
		</div>
	);
}
