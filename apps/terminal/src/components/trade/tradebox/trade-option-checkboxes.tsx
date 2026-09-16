import { Checkbox } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import * as mobileChrome from "@/components/trade/mobile/mobile-chrome-classes";
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
	const controlClassName = tradingPanel ? mobileChrome.optionControl : undefined;
	const indicatorClassName = tradingPanel ? "text-trading-panel-on-control" : undefined;
	const optionClassName = tradingPanel ? mobileChrome.option : undefined;
	const labelClassName = tradingPanel ? mobileChrome.optionLabel : undefined;

	return (
		<div data-slot="trade-order-options" className={cn(className, tradingPanel && mobileChrome.optionsGrid)}>
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
