import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type StatLayout = "stacked" | "inline";

interface Props {
	label: string;
	value: string;
	valueClass?: string;
	icon?: ReactNode;
	layout?: StatLayout;
}

export function StatBlock({ label, value, valueClass, icon, layout = "stacked" }: Props) {
	if (layout === "inline") {
		return (
			<div className="flex items-center gap-1.5 min-w-0 py-px px-1.5 whitespace-nowrap">
				<span className="text-2xs text-fg-muted/80 uppercase tracking-wide shrink-0">{label}</span>
				<span
					className={cn(
						"flex min-w-0 items-center gap-0.5 font-sans text-xs font-medium tabular-nums leading-none text-fg",
						valueClass,
					)}
				>
					{icon}
					{value}
				</span>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-px items-start min-w-0 px-1.5">
			<span className="text-2xs leading-none text-fg-muted/85 uppercase tracking-wider">{label}</span>
			<span
				className={cn(
					"flex items-center gap-0.5 font-sans text-xs font-medium tabular-nums text-fg leading-tight",
					valueClass,
				)}
			>
				{icon}
				{value}
			</span>
		</div>
	);
}
