import { Checkbox } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

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
	const optionClassName = tradingPanel ? "gap-1.5 max-[379px]:gap-1" : undefined;
	const labelClassName = tradingPanel
		? "whitespace-nowrap text-xs text-trading-panel-muted max-[379px]:text-3xs"
		: undefined;

	return (
		<div className={className}>
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
			{tpSl && (
				<Checkbox
					aria-label={t`Take Profit / Stop Loss`}
					checked={tpSl.checked}
					onCheckedChange={(checked: boolean | "indeterminate") => tpSl.onCheckedChange(checked === true)}
					disabled={tpSl.disabled}
					className={optionClassName}
					label={t`TP/SL`}
					controlClassName={controlClassName}
					indicatorClassName={indicatorClassName}
					labelClassName={labelClassName}
				/>
			)}
			{children}
		</div>
	);
}
