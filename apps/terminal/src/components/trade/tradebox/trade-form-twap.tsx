import { Checkbox } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { NumberInput } from "@/components/ui/number-input";
import { TWAP_MINUTES_MAX, TWAP_MINUTES_MIN } from "@/config/trade";
import { cn } from "@/lib/cn";
import { tradingInputFrameClass } from "@/lib/ui/trading-input";
import { useOrderEntryActions, useTwapMinutes, useTwapRandomize } from "@/stores/use-order-entry-store";

interface Props {
	disabled: boolean;
}

const labelClass = "text-2xs leading-none text-trading-panel-subtle";
const twapFrameClass = cn(tradingInputFrameClass, "flex-1");
const HOURS_MAX = Math.floor(TWAP_MINUTES_MAX / 60);
const MINUTES_PER_INPUT_MAX = 59;

function displayValue(n: number): string {
	return n > 0 ? String(n) : "";
}

function clamp(n: number, min: number, max: number): number {
	if (Number.isNaN(n)) return min;
	return Math.min(Math.max(n, min), max);
}

export function TradeFormTwap({ disabled }: Props) {
	const twapMinutesNum = useTwapMinutes();
	const twapRandomize = useTwapRandomize();
	const { setTwapMinutes, setTwapRandomize } = useOrderEntryActions();

	const hours = Math.floor(twapMinutesNum / 60);
	const minutes = twapMinutesNum - hours * 60;

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
							className="h-9 min-w-0 flex-1 bg-transparent px-0 text-right text-base font-semibold tabular-nums text-trading-panel-fg"
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
							className="h-9 min-w-0 flex-1 bg-transparent px-0 text-right text-base font-semibold tabular-nums text-trading-panel-fg"
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
		</>
	);
}
