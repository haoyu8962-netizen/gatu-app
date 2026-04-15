import { Divider } from "@hypeterminal/ui";
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
		"px-1.5 py-0.5 text-xs rounded-6 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus";

	return (
		<div className={cn("inline-flex items-center gap-2 shrink-0", className)}>
			<button
				type="button"
				onClick={handleDefaultClick}
				className={cn(
					textButtonClass,
					value === "default" ? "font-semibold text-fg" : "font-normal text-fg-muted hover:text-fg",
				)}
			>
				{t`Default`}
			</button>
			<Divider orientation="vertical" className="my-1.5 opacity-50" />
			<button
				type="button"
				onClick={handleTradingViewClick}
				{...tradingViewIntentHandlers}
				className={cn(
					textButtonClass,
					value === "tradingview" ? "font-semibold text-fg" : "font-normal text-fg-muted hover:text-fg",
				)}
			>
				{t`TradingView`}
			</button>
		</div>
	);
}
