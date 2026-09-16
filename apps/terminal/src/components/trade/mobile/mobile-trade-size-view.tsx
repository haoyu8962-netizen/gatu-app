import { CaretDownIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TradeInputFrameView } from "../tradebox/trade-input-frame-view";
import { TradeSizeSliderRowView } from "../tradebox/trade-size-slider-row-view";

export const sizeFrame = "h-8 px-2.5";
export const sizeLabel = "me-2 shrink-0 whitespace-nowrap text-2xs text-trading-panel-subtle";
export const sizeValue =
	"h-7 min-w-0 flex-1 bg-transparent px-0 text-right text-base font-semibold tabular-nums text-trading-panel-fg";
export const sizeUnit =
	"relative ms-2 inline-flex h-8 min-w-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap text-xs font-semibold text-trading-panel-fg after:absolute after:inset-0 after:content-[''] disabled:cursor-not-allowed";
export const sizePercent = "h-[31px] w-20 shrink-0 rounded-[8px] px-2";

interface Props {
	label: string;
	unit: string | null;
	disabled: boolean;
	input?: ReactNode;
	slider: ReactNode;
	percent: ReactNode;
	onUnitClick?: () => void;
}
export function MobileTradeSizeView({ label, unit, disabled, input, slider, percent, onUnitClick }: Props) {
	return (
		<div className="space-y-2">
			<TradeInputFrameView
				mobile
				label={label}
				labelClassName={sizeLabel}
				frameClassName={cn(sizeFrame, disabled && "opacity-50")}
				className={sizeValue}
				input={input}
				disabled={disabled}
				placeholder="0.00"
				defaultValue=""
				aria-label={label}
				trailing={
					<button type="button" onClick={onUnitClick} disabled={disabled} className={sizeUnit}>
						<span className={cn(unit === null && "invisible")}>{unit ?? "BTC"}</span>
						<CaretDownIcon className="size-3 text-trading-panel-subtle" />
					</button>
				}
			/>
			<TradeSizeSliderRowView mobile slider={slider} percent={percent} />
		</div>
	);
}
