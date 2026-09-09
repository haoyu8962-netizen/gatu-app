import { useLingui } from "@lingui/react/macro";
import { NumberInput } from "@/components/ui/number-input";
import { getFormattedMidPrice, PriceInput } from "@/components/ui/price-input";
import {
	SCALE_LEVELS_MAX,
	SCALE_LEVELS_MIN,
	SCALE_SKEW_MAX,
	SCALE_SKEW_MAX_DECIMALS,
	SCALE_SKEW_MIN,
} from "@/config/trade";
import { cn } from "@/lib/cn";
import type { Numeric } from "@/lib/trade/numbers";
import {
	useOrderEntryActions,
	useScaleEnd,
	useScaleLevels,
	useScaleSkew,
	useScaleStart,
} from "@/stores/use-order-entry-store";

import { ScaleField } from "./scale-field";
import { ScaleMidButton } from "./scale-mid-button";

interface Props {
	midPrice: Numeric;
	szDecimals: number;
	marketType: "perp" | "spot";
	assetId?: number;
	disabled: boolean;
	compact?: boolean;
	desktop?: boolean;
	mobileSafe?: boolean;
}

const defaultInputClass = "w-full text-xs tabular-nums";
const compactInputClass =
	"h-7 bg-transparent px-0 text-right text-base font-semibold tabular-nums text-trading-panel-fg";

export function TradeFormScale({
	midPrice,
	szDecimals,
	marketType,
	assetId,
	disabled,
	compact,
	desktop,
	mobileSafe,
}: Props) {
	const { t } = useLingui();
	const scaleStartPriceInput = useScaleStart();
	const scaleEndPriceInput = useScaleEnd();
	const scaleLevelsNum = useScaleLevels();
	const scaleSkewInput = useScaleSkew();
	const { setScaleStart, setScaleEnd, setScaleLevels, setScaleSkew } = useOrderEntryActions();

	const startPriceLabel = t`Start Price`;
	const endPriceLabel = t`End Price`;
	const levelsLabel = t`Number of Orders`;
	const skewLabel = t`Size Skew`;
	const formattedMid = getFormattedMidPrice(midPrice, szDecimals, marketType, assetId);
	const inline = compact || desktop;
	const inputClass = inline ? cn(compactInputClass, desktop && "h-8") : defaultInputClass;
	const hoistedMid = inline ? formattedMid : undefined;

	return (
		<>
			<ScaleField
				compact={compact}
				desktop={desktop}
				disabled={disabled}
				label={startPriceLabel}
				action={hoistedMid ? <ScaleMidButton disabled={disabled} value={hoistedMid} onSelect={setScaleStart} /> : null}
			>
				<PriceInput
					label={inline ? undefined : startPriceLabel}
					aria-label={startPriceLabel}
					placeholder="0.00"
					value={scaleStartPriceInput}
					onChange={(e) => setScaleStart(e.target.value)}
					onMidClick={inline ? undefined : setScaleStart}
					midPrice={midPrice}
					szDecimals={szDecimals}
					marketType={marketType}
					assetId={assetId}
					className={inputClass}
					disabled={disabled}
					mobileSafe={mobileSafe}
				/>
			</ScaleField>
			<ScaleField
				compact={compact}
				desktop={desktop}
				disabled={disabled}
				label={endPriceLabel}
				action={hoistedMid ? <ScaleMidButton disabled={disabled} value={hoistedMid} onSelect={setScaleEnd} /> : null}
			>
				<PriceInput
					label={inline ? undefined : endPriceLabel}
					aria-label={endPriceLabel}
					placeholder="0.00"
					value={scaleEndPriceInput}
					onChange={(e) => setScaleEnd(e.target.value)}
					onMidClick={inline ? undefined : setScaleEnd}
					midPrice={midPrice}
					szDecimals={szDecimals}
					marketType={marketType}
					assetId={assetId}
					className={inputClass}
					disabled={disabled}
					mobileSafe={mobileSafe}
				/>
			</ScaleField>
			<div className={desktop ? "grid min-w-0 grid-cols-2 gap-2" : "contents"}>
				<ScaleField
					compact={compact}
					desktop={desktop}
					disabled={disabled}
					label={levelsLabel}
					range={desktop ? `${SCALE_LEVELS_MIN}–${SCALE_LEVELS_MAX}` : undefined}
				>
					<NumberInput
						label={inline ? undefined : levelsLabel}
						aria-label={levelsLabel}
						labelValue={`${SCALE_LEVELS_MIN}–${SCALE_LEVELS_MAX}`}
						placeholder="4"
						value={String(scaleLevelsNum)}
						onChange={(e) => setScaleLevels(Number(e.target.value) || 4)}
						allowDecimals={false}
						min={SCALE_LEVELS_MIN}
						max={SCALE_LEVELS_MAX}
						className={inputClass}
						disabled={disabled}
						mobileSafe={mobileSafe}
					/>
				</ScaleField>
				<ScaleField
					compact={compact}
					desktop={desktop}
					disabled={disabled}
					label={skewLabel}
					range={desktop ? `${SCALE_SKEW_MIN}–${SCALE_SKEW_MAX}` : undefined}
				>
					<NumberInput
						label={inline ? undefined : skewLabel}
						aria-label={skewLabel}
						labelValue={`${SCALE_SKEW_MIN}–${SCALE_SKEW_MAX}`}
						placeholder="1"
						value={scaleSkewInput}
						onChange={(e) => setScaleSkew(e.target.value)}
						allowDecimals
						maxAllowedDecimals={SCALE_SKEW_MAX_DECIMALS}
						min={SCALE_SKEW_MIN}
						max={SCALE_SKEW_MAX}
						className={inputClass}
						disabled={disabled}
						mobileSafe={mobileSafe}
					/>
				</ScaleField>
			</div>
		</>
	);
}
