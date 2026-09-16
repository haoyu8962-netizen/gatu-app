import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const optionsGrid = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 max-[1000px]:gap-y-3";

interface Props {
	className?: string;
	tradingPanel?: boolean;
	reduceOnly?: ReactNode;
	tpSl?: ReactNode;
	children?: ReactNode;
}

export function TradeOptionCheckboxesView({ className, tradingPanel, reduceOnly, tpSl, children }: Props) {
	return (
		<div data-slot="trade-order-options" className={cn(className, tradingPanel && optionsGrid)}>
			{reduceOnly}
			{children && <div className="col-start-2">{children}</div>}
			{tpSl}
		</div>
	);
}
