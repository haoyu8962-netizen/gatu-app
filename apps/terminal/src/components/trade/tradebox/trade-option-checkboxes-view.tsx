import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const optionsGrid = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 max-[1000px]:gap-y-3";

interface Props {
	className?: string;
	tradingPanel?: boolean;
	mobile?: boolean;
	embedded?: boolean;
	reduceOnly?: ReactNode;
	tpSl?: ReactNode;
	children?: ReactNode;
}

export function TradeOptionCheckboxesView({
	className,
	tradingPanel,
	mobile,
	embedded,
	reduceOnly,
	tpSl,
	children,
}: Props) {
	return (
		<div
			data-slot="trade-order-options"
			className={cn(
				mobile && "flex flex-wrap items-center gap-y-1",
				mobile && (embedded ? "gap-x-2 text-2xs max-[379px]:gap-x-1" : "gap-x-4"),
				className,
				tradingPanel && optionsGrid,
			)}
		>
			{reduceOnly}
			{children && <div className="col-start-2">{children}</div>}
			{tpSl}
		</div>
	);
}

export const option = "min-w-0 min-h-5 items-center gap-1.5 max-[1000px]:min-h-8";
export const optionLabel = "text-xs text-trading-panel-muted";
export const optionControl =
	"size-[17px] rounded-[5px] border-trading-panel-stroke-control data-checked:border-trading-panel-control data-checked:bg-trading-panel-control";
