import { Checkbox } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { NumberInput } from "@/components/ui/number-input";
import { TWAP_MINUTES_MAX, TWAP_MINUTES_MIN } from "@/config/trade";
import { useOrderEntryActions, useTwapMinutes, useTwapRandomize } from "@/stores/use-order-entry-store";

interface Props {
	disabled: boolean;
}

export function TradeFormTwap({ disabled }: Props) {
	const twapMinutesNum = useTwapMinutes();
	const twapRandomize = useTwapRandomize();
	const { setTwapMinutes, setTwapRandomize } = useOrderEntryActions();

	return (
		<>
			<NumberInput
				label={t`Duration (Minutes)`}
				labelValue={`${TWAP_MINUTES_MIN}–${TWAP_MINUTES_MAX}`}
				placeholder="30"
				value={String(twapMinutesNum)}
				onChange={(e) => setTwapMinutes(Number(e.target.value) || 30)}
				allowDecimals={false}
				className="w-full text-xs tabular-nums"
				disabled={disabled}
			/>
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
