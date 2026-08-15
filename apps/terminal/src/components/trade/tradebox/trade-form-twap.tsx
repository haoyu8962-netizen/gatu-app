import { Checkbox } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { useId } from "react";
import { NumberInput } from "@/components/ui/number-input";
import { TWAP_MINUTES_MAX, TWAP_MINUTES_MIN } from "@/config/trade";
import { formatTwapPriceInput, getTwapTriggerDirection, type TwapTriggerDirection } from "@/domain/trade/twap-details";
import { cn } from "@/lib/cn";
import { getTwapStopPriceLabel } from "@/lib/trade/twap-labels";
import type { Side } from "@/lib/trade/types";
import { tradingInputFrameClass } from "@/lib/ui/trading-input";
import {
	useOrderEntryActions,
	useTwapMinutes,
	useTwapRandomize,
	useTwapStopPrice,
	useTwapTriggerPrice,
} from "@/stores/use-order-entry-store";

interface Props {
	disabled: boolean;
	side: Side;
	quoteToken: string;
	markPx: number;
	assetId: number | undefined;
	szDecimals: number;
}

const labelClass = "text-2xs leading-none text-trading-panel-subtle";
const twapFrameClass = cn(tradingInputFrameClass, "flex-1");
const priceFrameClass = cn(tradingInputFrameClass, "px-2.5");
const priceLabelClass = "mr-2 shrink-0 cursor-text whitespace-nowrap text-xs text-trading-panel-subtle";
const inputClass =
	"h-9 min-w-0 flex-1 bg-transparent px-0 text-right text-base font-semibold tabular-nums text-trading-panel-fg";
const HOURS_MAX = Math.floor(TWAP_MINUTES_MAX / 60);
const MINUTES_PER_INPUT_MAX = 59;

function displayValue(n: number): string {
	return n > 0 ? String(n) : "";
}

function clamp(n: number, min: number, max: number): number {
	if (Number.isNaN(n)) return min;
	return Math.min(Math.max(n, min), max);
}

function getTriggerHintText(direction: TwapTriggerDirection | null, triggerPrice: string): string {
	if (direction === "above") return t`Activates when mark ≥ ${triggerPrice}`;
	if (direction === "below") return t`Activates when mark ≤ ${triggerPrice}`;
	return "";
}

export function TradeFormTwap({ disabled, side, quoteToken, markPx, assetId, szDecimals }: Props) {
	const triggerFieldId = useId();
	const stopFieldId = useId();
	const twapMinutesNum = useTwapMinutes();
	const twapRandomize = useTwapRandomize();
	const twapTriggerPrice = useTwapTriggerPrice();
	const twapStopPrice = useTwapStopPrice();
	const { setTwapMinutes, setTwapRandomize, setTwapTriggerPrice, setTwapStopPrice } = useOrderEntryActions();

	const hours = Math.floor(twapMinutesNum / 60);
	const minutes = twapMinutesNum - hours * 60;
	const stopPriceLabel = getTwapStopPriceLabel(side);
	const triggerPx = formatTwapPriceInput(twapTriggerPrice, { assetId, szDecimals });
	const triggerHint = getTriggerHintText(getTwapTriggerDirection(triggerPx, markPx), triggerPx ?? "");

	function handleHoursChange(value: string) {
		const h = clamp(Math.floor(Number(value) || 0), 0, HOURS_MAX);
		const cappedMinutes = h >= HOURS_MAX ? 0 : minutes;
		setTwapMinutes(clamp(h * 60 + cappedMinutes, 0, TWAP_MINUTES_MAX));
	}

	function handleMinutesChange(value: string) {
		const m = clamp(Math.floor(Number(value) || 0), 0, MINUTES_PER_INPUT_MAX);
		const cappedHours = hours >= HOURS_MAX ? HOURS_MAX : hours;
		const total = cappedHours >= HOURS_MAX ? HOURS_MAX * 60 : cappedHours * 60 + m;
		setTwapMinutes(clamp(total, 0, TWAP_MINUTES_MAX));
	}

	return (
		<>
			<div className="flex flex-col gap-1.5">
				<span className={labelClass}>{t`Running Time (${TWAP_MINUTES_MIN}m - ${TWAP_MINUTES_MAX / 60}h)`}</span>
				<div className="flex gap-2">
					<div className={cn(twapFrameClass, disabled && "opacity-50")}>
						<span className="mr-2 shrink-0 whitespace-nowrap text-xs text-trading-panel-subtle">{t`Hour(s)`}</span>
						<NumberInput
							aria-label={t`Hour(s)`}
							placeholder="0"
							value={displayValue(hours)}
							onChange={(e) => handleHoursChange(e.target.value)}
							allowDecimals={false}
							min={0}
							max={HOURS_MAX}
							className={inputClass}
							disabled={disabled}
						/>
					</div>
					<div className={cn(twapFrameClass, (disabled || hours >= HOURS_MAX) && "opacity-50")}>
						<span className="mr-2 shrink-0 whitespace-nowrap text-xs text-trading-panel-subtle">{t`Minute(s)`}</span>
						<NumberInput
							aria-label={t`Minute(s)`}
							placeholder="30"
							value={displayValue(minutes)}
							onChange={(e) => handleMinutesChange(e.target.value)}
							allowDecimals={false}
							min={0}
							max={MINUTES_PER_INPUT_MAX}
							className={inputClass}
							disabled={disabled || hours >= HOURS_MAX}
							readOnly={hours >= HOURS_MAX}
						/>
					</div>
				</div>
			</div>
			<div className="flex items-center text-xs">
				<Checkbox
					checked={twapRandomize}
					onCheckedChange={(checked) => setTwapRandomize(checked === true)}
					disabled={disabled}
					label={t`Randomize timing`}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<div className={cn(priceFrameClass, disabled && "opacity-50")}>
					<label htmlFor={triggerFieldId} className={priceLabelClass}>
						{t`Trigger Price`} ({quoteToken})
					</label>
					<NumberInput
						id={triggerFieldId}
						placeholder="0.00"
						value={twapTriggerPrice}
						onChange={(e) => setTwapTriggerPrice(e.target.value)}
						className={inputClass}
						disabled={disabled}
					/>
				</div>
				{triggerHint && <p className="text-2xs text-trading-panel-muted">{triggerHint}</p>}
			</div>
			<div className={cn(priceFrameClass, disabled && "opacity-50")}>
				<label htmlFor={stopFieldId} className={priceLabelClass}>
					{stopPriceLabel} ({quoteToken})
				</label>
				<NumberInput
					id={stopFieldId}
					placeholder="0.00"
					value={twapStopPrice}
					onChange={(e) => setTwapStopPrice(e.target.value)}
					className={inputClass}
					disabled={disabled}
				/>
			</div>
		</>
	);
}
