import { cn } from "@/lib/cn";

export const tradingInputFrameClass = cn(
	"flex h-10 min-w-0 items-center rounded-[10px] border border-trading-panel-stroke-input bg-surface px-3",
	"focus-within:border-trading-panel-focus focus-within:ring-2 focus-within:ring-trading-panel-focus/10",
	"[&_[data-slot=input]]:border-0 [&_[data-slot=input]]:rounded-none [&_[data-slot=input]]:ring-0",
);
