import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
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
import { tradingInputFrameClass } from "@/lib/ui/trading-input";
import {
	useOrderEntryActions,
	useScaleEnd,
	useScaleLevels,
	useScaleSkew,
	useScaleStart,
} from "@/stores/use-order-entry-store";

interface Props {
	midPrice: Numeric;
	szDecimals: number;
	marketType: "perp" | "spot";
	assetId?: number;
	disabled: boolean;
	compact?: boolean;
	mobileSafe?: boolean;
}

const defaultInputClass = "w-full text-xs tabular-nums";
const compactInputClass =
	"h-7 bg-transparent px-0 text-right text-base font-semibold tabular-nums text-trading-panel-fg";

export function TradeFormScale({ midPrice, szDecimals, marketType, assetId, disabled, compact, mobileSafe }: Props) {
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
	const inputClass = compact ? compactInputClass : defaultInputClass;
	const hoistedMid = compact ? formattedMid : undefined;

	return (
		<>
			<ScaleField
				compact={compact}
				disabled={disabled}
				label={startPriceLabel}
				action={hoistedMid ? <MidButton disabled={disabled} value={hoistedMid} onSelect={setScaleStart} /> : null}
			>
				<PriceInput
					label={compact ? undefined : startPriceLabel}
					aria-label={startPriceLabel}
					placeholder="0.00"
					value={scaleStartPriceInput}
					onChange={(e) => setScaleStart(e.target.value)}
					onMidClick={compact ? undefined : setScaleStart}
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
				disabled={disabled}
				label={endPriceLabel}
				action={hoistedMid ? <MidButton disabled={disabled} value={hoistedMid} onSelect={setScaleEnd} /> : null}
			>
				<PriceInput
					label={compact ? undefined : endPriceLabel}
					aria-label={endPriceLabel}
					placeholder="0.00"
					value={scaleEndPriceInput}
					onChange={(e) => setScaleEnd(e.target.value)}
					onMidClick={compact ? undefined : setScaleEnd}
					midPrice={midPrice}
					szDecimals={szDecimals}
					marketType={marketType}
					assetId={assetId}
					className={inputClass}
					disabled={disabled}
					mobileSafe={mobileSafe}
				/>
			</ScaleField>
			<ScaleField compact={compact} disabled={disabled} label={levelsLabel}>
				<NumberInput
					label={compact ? undefined : levelsLabel}
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
			<ScaleField compact={compact} disabled={disabled} label={skewLabel}>
				<NumberInput
					label={compact ? undefined : skewLabel}
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
		</>
	);
}

interface ScaleFieldProps {
	compact: boolean | undefined;
	disabled: boolean;
	label: string;
	action?: ReactNode;
	children: ReactNode;
}

function ScaleField({ compact, disabled, label, action, children }: ScaleFieldProps) {
	if (!compact) return <>{children}</>;

	return (
		<div className={cn(tradingInputFrameClass, "h-8 px-2.5", disabled && "opacity-50")}>
			<span className="me-1.5 min-w-0 shrink truncate whitespace-nowrap text-2xs text-trading-panel-subtle">
				{label}
			</span>
			<div className="min-w-0 flex-1">{children}</div>
			{action}
		</div>
	);
}

interface MidButtonProps {
	disabled: boolean;
	value: string;
	onSelect: (formattedPrice: string) => void;
}

function MidButton({ disabled, value, onSelect }: MidButtonProps) {
	const { t } = useLingui();
	return (
		<button
			type="button"
			onClick={() => onSelect(value)}
			disabled={disabled}
			aria-label={`${t`Use mid price`} ${value}`}
			className="relative ms-1 inline-flex h-8 min-w-11 shrink-0 items-center justify-center whitespace-nowrap text-xs font-semibold text-trading-panel-success transition-colors after:absolute after:inset-0 after:content-[''] hover:text-trading-panel-success/80 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{t`Mid`}
		</button>
	);
}
