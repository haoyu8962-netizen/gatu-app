import { t } from "@lingui/core/macro";
import { cn } from "@/lib/cn";

export type ChartSource = "default" | "tradingview";

export type ChartSourceToggleIntentHandlers = {
	onMouseEnter?: () => void;
	onFocus?: () => void;
	onPointerDown?: () => void;
	onTouchStart?: () => void;
};

interface ChartSourceToggleProps {
	value: ChartSource;
	onValueChange: (value: ChartSource) => void;
	tradingViewIntentHandlers: ChartSourceToggleIntentHandlers;
	className?: string;
}

export function ChartSourceToggle({
	value,
	onValueChange,
	tradingViewIntentHandlers,
	className,
}: ChartSourceToggleProps) {
	function handleDefaultClick() {
		onValueChange("default");
	}

	function handleTradingViewClick() {
		onValueChange("tradingview");
	}

	const textButtonClass =
		"px-1.5 py-0.5 text-xs rounded-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stroke-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg-raised";

	return (
		<div className={cn("inline-flex items-center gap-2 shrink-0", className)}>
			<button
				type="button"
				onClick={handleDefaultClick}
				className={cn(
					textButtonClass,
					value === "default" ? "font-semibold text-text-strong" : "font-normal text-text-weak hover:text-text-strong",
				)}
			>
				{t`Default`}
			</button>
			<div className="h-3 w-px shrink-0 self-center bg-stroke-weak/50" aria-hidden />
			<button
				type="button"
				onClick={handleTradingViewClick}
				{...tradingViewIntentHandlers}
				className={cn(
					textButtonClass,
					value === "tradingview"
						? "font-semibold text-text-strong"
						: "font-normal text-text-weak hover:text-text-strong",
				)}
			>
				{t`TradingView`}
			</button>
		</div>
	);
}
