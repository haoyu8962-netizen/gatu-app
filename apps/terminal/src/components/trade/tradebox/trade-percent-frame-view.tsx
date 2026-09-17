import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { tradingInputFrameClass } from "@/lib/ui/trading-input";

export const TRADE_PERCENT_INPUT_CLASS = "h-7 min-w-0 bg-transparent px-0 text-right font-semibold tabular-nums";

interface Props {
	frameClassName?: string;
	input: ReactNode;
}

export function TradePercentFrameView({ frameClassName, input }: Props) {
	return (
		<div className={cn(tradingInputFrameClass, frameClassName)}>
			{input}
			<span className="ms-1 shrink-0 text-2xs text-trading-panel-subtle">%</span>
		</div>
	);
}
