import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props {
	label: string;
	value: ReactNode;
	valueClass?: string;
	icon?: ReactNode;
}

export function StatBlock({ label, value, valueClass, icon }: Props) {
	return (
		<div className="grid h-[34px] min-w-0 shrink-0 grid-rows-[15px_15px] gap-1 whitespace-nowrap">
			<span className="text-xs leading-[15px] text-fg-muted">{label}</span>
			<span
				className={cn(
					"flex min-w-0 items-center gap-0.5 font-sans text-xs leading-[15px] font-medium tabular-nums text-fg",
					valueClass,
				)}
			>
				{icon}
				{value}
			</span>
		</div>
	);
}
