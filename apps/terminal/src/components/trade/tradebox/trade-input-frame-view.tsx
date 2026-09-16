import type { ComponentPropsWithRef, ReactNode } from "react";
import { getInputClassName } from "@/components/ui/input-styles";
import { cn } from "@/lib/cn";
import { tradingInputFrameClass } from "@/lib/ui/trading-input";

export { tradingInputFrameClass } from "@/lib/ui/trading-input";
export const TRADE_INPUT_CLASS =
	"h-8 min-w-0 flex-1 bg-transparent px-0 text-right text-base font-semibold tabular-nums text-trading-panel-fg";
export const TRADE_INPUT_FRAME_CLASS = cn(tradingInputFrameClass, "h-9 px-2.5");

interface Props extends Omit<ComponentPropsWithRef<"input">, "children"> {
	label: ReactNode;
	trailing?: ReactNode;
	input?: ReactNode;
	frameClassName?: string;
}

export function TradeInputFrameView({ label, trailing, input, frameClassName, className, id, ...props }: Props) {
	return (
		<div className={cn(TRADE_INPUT_FRAME_CLASS, frameClassName)}>
			<label htmlFor={id} className="me-2 shrink-0 cursor-text whitespace-nowrap text-xs text-trading-panel-subtle">
				{label}
			</label>
			{input ?? (
				<input
					type="text"
					dir="ltr"
					inputMode="decimal"
					data-slot="input"
					data-size="default"
					id={id}
					{...props}
					className={getInputClassName("default", cn("w-full", TRADE_INPUT_CLASS, className))}
				/>
			)}
			{trailing}
		</div>
	);
}
