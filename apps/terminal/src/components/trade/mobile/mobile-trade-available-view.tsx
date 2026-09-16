import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

export const available =
	"relative flex min-h-[15px] w-full min-w-0 items-center justify-between gap-2 text-xs leading-[15px] text-trading-panel-muted after:absolute after:top-1/2 after:left-0 after:h-6 after:w-full after:-translate-y-1/2 after:content-[''] disabled:cursor-default";

interface Props extends ComponentPropsWithRef<"button"> {
	label: string;
	value: string;
	token: string;
}
export function MobileTradeAvailableView({ label, value, token, disabled, ...props }: Props) {
	return (
		<button type="button" {...props} disabled={disabled} className={available}>
			<span className="shrink-0 whitespace-nowrap">{label}</span>
			<span
				className={cn(
					"inline-flex min-w-0 items-center justify-end gap-1 truncate whitespace-nowrap border-b border-dashed border-trading-panel-stroke-control text-right font-semibold leading-[14px] tabular-nums text-trading-panel-fg",
					disabled && "border-transparent",
				)}
			>
				<span className="tabular-nums text-trading-panel-fg">{value}</span>
				<span className="tabular-nums text-trading-panel-muted">{token}</span>
			</span>
		</button>
	);
}
