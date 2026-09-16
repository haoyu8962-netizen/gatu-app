import { Checkbox } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import * as mobileChrome from "@/components/trade/mobile/mobile-chrome-classes";
import { TRADE_PANEL_LABELS } from "@/config/trade-panel-labels";
import { cn } from "@/lib/cn";
import { TradeOptionCheckboxesView } from "./trade-option-checkboxes-view";

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
		<TradeOptionCheckboxesView
			className={className}
			tradingPanel={tradingPanel}
			reduceOnly={
				reduceOnly && (
					<Checkbox
						aria-label={t(TRADE_PANEL_LABELS.reduceOnly)}
						checked={reduceOnly.checked}
						onCheckedChange={(checked: boolean | "indeterminate") => reduceOnly.onCheckedChange(checked === true)}
						disabled={reduceOnly.disabled}
						className={optionClassName}
						label={t(TRADE_PANEL_LABELS.reduceOnly)}
						controlClassName={controlClassName}
						indicatorClassName={indicatorClassName}
						labelClassName={labelClassName}
					/>
				)
			}
			tpSl={
				tpSl && (
					<Checkbox
						aria-label={t(TRADE_PANEL_LABELS.tpSlAria)}
						checked={tpSl.checked}
						onCheckedChange={(checked: boolean | "indeterminate") => tpSl.onCheckedChange(checked === true)}
						disabled={tpSl.disabled}
						className={cn(optionClassName, tradingPanel && "col-span-2")}
						label={t(TRADE_PANEL_LABELS.tpSl)}
						controlClassName={controlClassName}
						indicatorClassName={indicatorClassName}
						labelClassName={labelClassName}
					/>
				)
			}
		>
			{children}
		</TradeOptionCheckboxesView>
	);
}
