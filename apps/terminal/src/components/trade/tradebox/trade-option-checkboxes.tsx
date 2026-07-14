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
}

export function TradeOptionCheckboxes({ className, reduceOnly, tpSl, children }: Props) {
	const { t } = useLingui();

	return (
		<div className={className}>
			{reduceOnly && (
				<Checkbox
					aria-label={t`Reduce Only`}
					checked={reduceOnly.checked}
					onCheckedChange={(checked: boolean | "indeterminate") => reduceOnly.onCheckedChange(checked === true)}
					disabled={reduceOnly.disabled}
					label={t`Reduce Only`}
				/>
			)}
			{tpSl && (
				<Checkbox
					aria-label={t`Take Profit / Stop Loss`}
					checked={tpSl.checked}
					onCheckedChange={(checked: boolean | "indeterminate") => tpSl.onCheckedChange(checked === true)}
					disabled={tpSl.disabled}
					label={t`TP/SL`}
				/>
			)}
			{children}
		</div>
	);
}
