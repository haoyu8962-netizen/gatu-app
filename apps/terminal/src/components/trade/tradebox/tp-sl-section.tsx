import { useLingui } from "@lingui/react/macro";
import { TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { Select } from "@sairn/ui";
import { useId } from "react";
import { NumberInput } from "@/components/ui/number-input";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { SL_QUICK_PERCENT_OPTIONS, TP_QUICK_PERCENT_OPTIONS } from "@/config/trade";
import { getRiskRewardRatio } from "@/domain/market";
import { cn } from "@/lib/cn";
import { szDecimalsToPriceDecimals, useNumberFormat } from "@/lib/format";
import { isPositive, toBig, toNumber } from "@/lib/trade/numbers";
import {
	calculateEstimatedPnl,
	calculateEstimatedPnlExact,
	calculateRiskRewardRatioExact,
	calculateSlPrice,
	calculateSlPriceFromRoe,
	calculateTpPrice,
	calculateTpPriceFromRoe,
	formatRiskRewardRatio,
	validateSlPrice,
	validateTpPrice,
} from "@/lib/trade/tpsl";
import { PriceInputWithPercent } from "./price-input-with-percent";

interface Props {
	side: "buy" | "sell";
	referencePrice: string | number;
	size: string | number;
	szDecimals?: number;
	tpPrice: string;
	slPrice: string;
	onTpPriceChange: (value: string) => void;
	onSlPriceChange: (value: string) => void;
	onTpPriceBlur?: () => void;
	onSlPriceBlur?: () => void;
	tpError?: string | null;
	slError?: string | null;
	disabled?: boolean;
	framed?: boolean;
	quickPercentMode?: "price" | "roe";
	leverage?: number;
	triggerValidationPrice?: string | number | null;
	mobileTouchSafe?: boolean;
	preserveFinancialPrecision?: boolean;
	quoteSymbol?: string | null;
	linkedReturnInputs?: {
		unitLabel: string;
		onUnitToggle: () => void;
		tp: LinkedReturnInput;
		sl: LinkedReturnInput;
	};
}

interface LinkedReturnInput {
	ariaLabel: string;
	placeholder: string;
	value: string;
	error?: string | null;
	unitLabel?: string;
	onUnitToggle?: () => void;
	unitToggleDisabled?: boolean;
	disabled?: boolean;
	onBlur?: () => void;
	onChange: (value: string) => void;
}

export function TpSlSection({
	side,
	referencePrice,
	size,
	szDecimals,
	tpPrice,
	slPrice,
	onTpPriceChange,
	onSlPriceChange,
	onTpPriceBlur,
	onSlPriceBlur,
	tpError,
	slError,
	disabled,
	framed,
	quickPercentMode = "price",
	leverage,
	triggerValidationPrice,
	mobileTouchSafe = false,
	preserveFinancialPrecision = false,
	quoteSymbol = DEFAULT_QUOTE_TOKEN,
	linkedReturnInputs,
}: Props) {
	const { t } = useLingui();
	const { formatQuoteAmount, formatUSD } = useNumberFormat();
	const normalizedQuoteSymbol = quoteSymbol?.trim() || null;
	function formatPnlValue(value: string | number): string {
		if (!normalizedQuoteSymbol) return "";
		return normalizedQuoteSymbol === DEFAULT_QUOTE_TOKEN
			? formatUSD(value, { signDisplay: "exceptZero" })
			: formatQuoteAmount(value, normalizedQuoteSymbol, { decimals: 2, signDisplay: "exceptZero" });
	}

	const tpPriceNum = toNumber(tpPrice);
	const slPriceNum = toNumber(slPrice);
	const exactReferenceReady = toBig(referencePrice)?.gt(0) ?? false;
	const exactSizeReady = toBig(size)?.gt(0) ?? false;
	const exactTpReady = toBig(tpPrice)?.gt(0) ?? false;
	const exactSlReady = toBig(slPrice)?.gt(0) ?? false;

	const tpPnl = normalizedQuoteSymbol
		? preserveFinancialPrecision
			? exactTpReady && exactReferenceReady && exactSizeReady
				? calculateEstimatedPnlExact({ referencePrice, side, size }, tpPrice)
				: null
			: isPositive(tpPriceNum) && isPositive(referencePrice) && isPositive(size)
				? calculateEstimatedPnl({ referencePrice, side, size }, tpPriceNum)
				: null
		: null;
	const slPnl = normalizedQuoteSymbol
		? preserveFinancialPrecision
			? exactSlReady && exactReferenceReady && exactSizeReady
				? calculateEstimatedPnlExact({ referencePrice, side, size }, slPrice)
				: null
			: isPositive(slPriceNum) && isPositive(referencePrice) && isPositive(size)
				? calculateEstimatedPnl({ referencePrice, side, size }, slPriceNum)
				: null
		: null;
	const riskRewardRatio = preserveFinancialPrecision
		? calculateRiskRewardRatioExact(tpPnl, slPnl)
		: getRiskRewardRatio(typeof tpPnl === "number" ? tpPnl : null, typeof slPnl === "number" ? slPnl : null);
	let riskRewardDisplay: {
		rrDisplay: NonNullable<ReturnType<typeof formatRiskRewardRatio>>;
		tpPnl: string | number;
		slPnl: string | number;
	} | null = null;
	if (riskRewardRatio !== null && tpPnl !== null && slPnl !== null) {
		const rrDisplay = formatRiskRewardRatio(riskRewardRatio);
		if (rrDisplay) riskRewardDisplay = { rrDisplay, tpPnl, slPnl };
	}

	const priceDecimals = szDecimalsToPriceDecimals(szDecimals ?? 4);
	const quickPercentDisabled = quickPercentMode === "roe" && !isPositive(leverage);

	function getTpQuickPrice(percent: number): string | null {
		if (quickPercentMode === "roe") {
			return calculateTpPriceFromRoe(referencePrice, side, percent, leverage, priceDecimals);
		}
		return calculateTpPrice(referencePrice, side, percent, priceDecimals);
	}

	function getSlQuickPrice(percent: number): string | null {
		if (quickPercentMode === "roe") {
			return calculateSlPriceFromRoe(referencePrice, side, percent, leverage, priceDecimals);
		}
		return calculateSlPrice(referencePrice, side, percent, priceDecimals);
	}

	function isTpPercentDisabled(percent: number): boolean {
		if (triggerValidationPrice === undefined) return false;
		const price = getTpQuickPrice(percent);
		return !isPositive(triggerValidationPrice) || !price || !validateTpPrice(triggerValidationPrice, price, side);
	}

	function isSlPercentDisabled(percent: number): boolean {
		if (triggerValidationPrice === undefined) return false;
		const price = getSlQuickPrice(percent);
		return !isPositive(triggerValidationPrice) || !price || !validateSlPrice(triggerValidationPrice, price, side);
	}

	function handleTpPercentClick(percent: number) {
		const price = getTpQuickPrice(percent);
		if (price && !isTpPercentDisabled(percent)) onTpPriceChange(price);
	}

	function handleSlPercentClick(percent: number) {
		const price = getSlQuickPrice(percent);
		if (price && !isSlPercentDisabled(percent)) onSlPriceChange(price);
	}

	if (framed) {
		return (
			<div className="min-w-0 space-y-1.5">
				<FramedTpSlRow
					priceAriaLabel={t`Take Profit`}
					pricePlaceholder={t`TP Price`}
					priceValue={tpPrice}
					onPriceChange={onTpPriceChange}
					onPriceBlur={onTpPriceBlur}
					returnInput={resolveLinkedReturnInput(linkedReturnInputs, "tp")}
					returnUnitLabel={t`Take profit return unit`}
					collateralUnitLabel={normalizedQuoteSymbol === DEFAULT_QUOTE_TOKEN ? "$" : normalizedQuoteSymbol}
					error={tpError}
					pnl={tpPnl}
					pnlToneClass="text-trading-panel-success"
					formatPnlValue={formatPnlValue}
					disabled={disabled}
					mobileSafe={mobileTouchSafe}
				/>
				<FramedTpSlRow
					priceAriaLabel={t`Stop Loss`}
					pricePlaceholder={t`SL Price`}
					priceValue={slPrice}
					onPriceChange={onSlPriceChange}
					onPriceBlur={onSlPriceBlur}
					returnInput={resolveLinkedReturnInput(linkedReturnInputs, "sl")}
					returnUnitLabel={t`Stop loss return unit`}
					collateralUnitLabel={normalizedQuoteSymbol === DEFAULT_QUOTE_TOKEN ? "$" : normalizedQuoteSymbol}
					error={slError}
					pnl={slPnl}
					pnlToneClass="text-trading-panel-error"
					formatPnlValue={formatPnlValue}
					disabled={disabled}
					mobileSafe={mobileTouchSafe}
				/>
			</div>
		);
	}

	return (
		<div className="min-w-0 space-y-4 py-1">
			<PriceInputWithPercent
				label={t`Take Profit`}
				icon={TrendUpIcon}
				value={tpPrice}
				onChange={onTpPriceChange}
				percentOptions={TP_QUICK_PERCENT_OPTIONS}
				onPercentClick={handleTpPercentClick}
				pnlValue={tpPnl}
				error={tpError}
				disabled={disabled}
				quickPercentDisabled={quickPercentDisabled}
				isPercentDisabled={isTpPercentDisabled}
				referencePrice={referencePrice}
				mobileTouchSafe={mobileTouchSafe}
				formatPnlValue={formatPnlValue}
				linkedReturnInput={
					linkedReturnInputs
						? {
								...linkedReturnInputs.tp,
								unitLabel: linkedReturnInputs.unitLabel,
								onUnitToggle: linkedReturnInputs.onUnitToggle,
							}
						: undefined
				}
			/>

			<PriceInputWithPercent
				label={t`Stop Loss`}
				icon={TrendDownIcon}
				value={slPrice}
				onChange={onSlPriceChange}
				percentOptions={SL_QUICK_PERCENT_OPTIONS}
				onPercentClick={handleSlPercentClick}
				pnlValue={slPnl}
				error={slError}
				disabled={disabled}
				quickPercentDisabled={quickPercentDisabled}
				isPercentDisabled={isSlPercentDisabled}
				referencePrice={referencePrice}
				mobileTouchSafe={mobileTouchSafe}
				formatPnlValue={formatPnlValue}
				linkedReturnInput={
					linkedReturnInputs
						? {
								...linkedReturnInputs.sl,
								unitLabel: linkedReturnInputs.unitLabel,
								onUnitToggle: linkedReturnInputs.onUnitToggle,
							}
						: undefined
				}
			/>

			{riskRewardDisplay && (
				<div className="rounded-8 space-y-2 border border-stroke-weak/40 bg-surface p-2.5">
					<div className="flex min-w-0 items-center justify-between gap-2">
						<span className="min-w-0 truncate text-xs text-fg">{t`Risk/Reward`}</span>
						<span
							className={cn(
								"shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums",
								riskRewardDisplay.rrDisplay.isFavorable ? "text-success" : "text-warning",
							)}
						>
							{riskRewardDisplay.rrDisplay.label}
						</span>
					</div>
					<div className="flex h-1.5 rounded-full overflow-hidden bg-surface">
						<div
							className="bg-error"
							style={{
								width: `${(riskRewardDisplay.rrDisplay.risk / (riskRewardDisplay.rrDisplay.risk + riskRewardDisplay.rrDisplay.reward)) * 100}%`,
							}}
						/>
						<div
							className="bg-success-soft"
							style={{
								width: `${(riskRewardDisplay.rrDisplay.reward / (riskRewardDisplay.rrDisplay.risk + riskRewardDisplay.rrDisplay.reward)) * 100}%`,
							}}
						/>
					</div>
					<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
						<span className="whitespace-nowrap tabular-nums text-error">{formatPnlValue(riskRewardDisplay.slPnl)}</span>
						<span className="whitespace-nowrap tabular-nums text-success">
							{formatPnlValue(riskRewardDisplay.tpPnl)}
						</span>
					</div>
				</div>
			)}
		</div>
	);
}

const framedFrameClass =
	"flex h-8.25 w-full min-w-0 box-border items-center gap-1 rounded-[10px] border border-trading-panel-stroke-input bg-transparent px-1.5 text-xs [&_[data-slot=input]]:border-0 [&_[data-slot=input]]:rounded-none [&_[data-slot=input]]:ring-0";
const framedInputClass =
	"h-7 w-auto min-w-0 flex-auto bg-transparent p-0 text-right text-xs font-semibold tabular-nums text-trading-panel-fg";

function resolveLinkedReturnInput(
	linkedReturnInputs: Props["linkedReturnInputs"],
	kind: "tp" | "sl",
): LinkedReturnInput | undefined {
	if (!linkedReturnInputs) return undefined;
	const input = linkedReturnInputs[kind];
	return {
		...input,
		unitLabel: input.unitLabel ?? linkedReturnInputs.unitLabel,
		onUnitToggle: input.onUnitToggle ?? linkedReturnInputs.onUnitToggle,
	};
}

interface FramedTpSlRowProps {
	priceAriaLabel: string;
	pricePlaceholder: string;
	priceValue: string;
	onPriceChange: (value: string) => void;
	onPriceBlur?: () => void;
	returnInput?: LinkedReturnInput;
	returnUnitLabel: string;
	collateralUnitLabel: string | null;
	error?: string | null;
	pnl: string | number | null;
	pnlToneClass: string;
	formatPnlValue: (value: string | number) => string;
	disabled?: boolean;
	mobileSafe?: boolean;
}

function FramedTpSlRow({
	priceAriaLabel,
	pricePlaceholder,
	priceValue,
	onPriceChange,
	onPriceBlur,
	returnInput,
	returnUnitLabel,
	collateralUnitLabel,
	error,
	pnl,
	pnlToneClass,
	formatPnlValue,
	disabled,
	mobileSafe,
}: FramedTpSlRowProps) {
	const { t } = useLingui();
	const inputId = useId();
	const returnInputId = useId();
	const errorId = `${inputId}-error`;
	const returnDisabled = disabled || returnInput?.disabled;
	const unitToggleDisabled = disabled || returnInput?.unitToggleDisabled;
	const returnError = returnInput?.error;
	const displayError = error ?? returnError;
	const estimatedPnl =
		!displayError && pnl !== null ? (
			<span
				data-slot="trade-tpsl-pnl"
				className={cn("min-w-0 max-w-full text-2xs font-semibold tabular-nums [overflow-wrap:anywhere]", pnlToneClass)}
				title={t`Estimated PnL after trigger`}
			>
				<span className="sr-only">{t`Estimated PnL after trigger`}: </span>≈ {formatPnlValue(pnl)}
			</span>
		) : null;

	return (
		<div className="min-w-0 space-y-1">
			<div
				className={cn(
					"grid w-full min-w-0 gap-x-1.5 gap-y-1",
					returnInput ? "grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" : "grid-cols-1",
				)}
			>
				<label htmlFor={inputId} className="min-w-0 text-2xs leading-tight text-trading-panel-subtle">
					{pricePlaceholder}
				</label>
				{returnInput && (
					<div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-1">
						<label htmlFor={returnInputId} className="min-w-0 text-2xs leading-tight text-trading-panel-subtle">
							{returnInput.placeholder}
						</label>
						{estimatedPnl}
					</div>
				)}
				<div
					data-slot="trade-tpsl-input-frame"
					className={cn(
						framedFrameClass,
						!disabled &&
							"hover:not-data-disabled:border-trading-panel-stroke-control hover:not-data-disabled:bg-transparent focus-within:border-trading-panel-focus focus-within:bg-transparent",
						!!error &&
							"border-trading-panel-error hover:not-data-disabled:border-trading-panel-error focus-within:border-trading-panel-error",
						disabled && "opacity-50",
					)}
				>
					<NumberInput
						id={inputId}
						aria-label={priceAriaLabel}
						aria-describedby={error ? errorId : undefined}
						aria-invalid={Boolean(error)}
						placeholder="0.00"
						mobileSafe={mobileSafe}
						value={priceValue}
						onChange={(e) => onPriceChange(e.target.value)}
						onBlur={onPriceBlur}
						className={framedInputClass}
						disabled={disabled}
					/>
				</div>
				{returnInput && (
					<div
						data-slot="trade-tpsl-input-frame"
						className={cn(
							framedFrameClass,
							!returnDisabled &&
								"hover:not-data-disabled:border-trading-panel-stroke-control hover:not-data-disabled:bg-transparent focus-within:border-trading-panel-focus focus-within:bg-transparent",
							!!returnError &&
								"border-trading-panel-error hover:not-data-disabled:border-trading-panel-error focus-within:border-trading-panel-error",
							returnDisabled && "opacity-50",
						)}
					>
						<NumberInput
							id={returnInputId}
							aria-label={returnInput.ariaLabel}
							aria-describedby={returnError ? errorId : undefined}
							aria-invalid={Boolean(returnError)}
							placeholder="0.00"
							mobileSafe={mobileSafe}
							value={returnInput.value}
							onChange={(e) => returnInput.onChange(e.target.value)}
							onBlur={returnInput.onBlur}
							className={cn(framedInputClass, "min-w-8")}
							disabled={returnDisabled}
						/>
						{returnInput.onUnitToggle && (
							<Select
								size="xxs"
								value={returnInput.unitLabel === "%" ? "roe" : "collateral"}
								onValueChange={(value) => {
									if (value && (value === "roe") !== (returnInput.unitLabel === "%")) returnInput.onUnitToggle?.();
								}}
								disabled={unitToggleDisabled}
								triggerAriaLabel={returnUnitLabel}
								className="h-full min-w-0 max-w-[calc(100%_-_2.25rem)] shrink-0"
								triggerClassName="h-full w-full min-w-0 gap-0.5 rounded-none border-0 bg-transparent px-0 py-0 font-semibold text-trading-panel-fg hover:bg-trading-panel-hover focus-visible:outline-offset-0"
								options={[
									{ value: "roe", label: "%" },
									...(collateralUnitLabel ? [{ value: "collateral", label: collateralUnitLabel }] : []),
								]}
							/>
						)}
					</div>
				)}
			</div>
			{displayError && (
				<p id={errorId} role="alert" className="text-2xs text-trading-panel-error">
					{displayError}
				</p>
			)}
			{!returnInput && estimatedPnl}
		</div>
	);
}
