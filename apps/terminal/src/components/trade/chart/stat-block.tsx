import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props {
	label: ReactNode;
	value: ReactNode | null;
	valueSample?: string;
	labelClass?: string;
	valueClass?: string;
	icon?: ReactNode;
}

export function StatBlock({ label, value, valueSample, labelClass, valueClass, icon }: Props) {
	return (
		<div className="grid h-[34px] min-w-0 shrink-0 grid-rows-[14px_18px] gap-0.5 whitespace-nowrap font-market-close">
			<span className={cn("w-fit text-[10px] leading-[14px] text-trading-panel-subtle", labelClass)}>{label}</span>
			<span
				className={cn(
					"flex min-w-0 items-center gap-1 text-[13px] leading-[18px] font-semibold tabular-nums text-trading-panel-fg",
					valueClass,
					value === null && "invisible",
				)}
			>
				{icon}
				{value === null ? valueSample : value}
			</span>
		</div>
	);
}
