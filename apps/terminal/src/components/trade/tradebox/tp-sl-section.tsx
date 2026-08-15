import { t } from "@lingui/core/macro";
import { CaretDownIcon, TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { useId } from "react";
import { NumberInput } from "@/components/ui/number-input";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { SL_QUICK_PERCENT_OPTIONS, TP_QUICK_PERCENT_OPTIONS } from "@/config/trade";
import { getRiskRewardRatio } from "@/domain/market";
import { cn } from "@/lib/cn";
import { formatQuoteAmount, formatUSD, szDecimalsToPriceDecimals } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
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
	compact?: boolean;
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
	compact,
	framed,
	quickPercentMode = "price",
	leverage,
	triggerValidationPrice,
	mobileTouchSafe = false,
	preserveFinancialPrecision = false,
	quoteSymbol = DEFAULT_QUOTE_TOKEN,
	linkedReturnInputs,
}: Props) {
	useNumberFormatRevision();
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
			<div className="min-w-0 space-y-2">
				<FramedTpSlRow
					priceAriaLabel={t`Take Profit`}
					pricePlaceholder={t`TP Price`}
					priceValue={tpPrice}
					onPriceChange={onTpPriceChange}
					onPriceBlur={onTpPriceBlur}
					returnInput={resolveLinkedReturnInput(linkedReturnInputs, "tp")}
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

	if (compact) {
		return (
			<div className="min-w-0 rounded-[12px] border border-trading-panel-stroke-card bg-trading-panel-card p-2.5">
				<div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-2">
					<div className="min-w-0">
						<NumberInput
							label={t`Take Profit`}
							placeholder={t`TP Price`}
							mobileSafe
							value={tpPrice}
							onChange={(e) => onTpPriceChange(e.target.value)}
							className={cn(
								"w-full box-border border-trading-panel-stroke-input bg-surface text-xs tabular-nums text-trading-panel-fg",
								!!tpError && "border-stroke-error-strong focus:border-stroke-error-strong",
							)}
							disabled={disabled}
						/>
						{tpError && <div className="mt-1 text-xs text-error">{tpError}</div>}
					</div>
					<div className="min-w-0">
						<NumberInput
							label={t`Stop Loss`}
							placeholder={t`SL Price`}
							mobileSafe
							value={slPrice}
							onChange={(e) => onSlPriceChange(e.target.value)}
							className={cn(
								"w-full box-border border-trading-panel-stroke-input bg-surface text-xs tabular-nums text-trading-panel-fg",
								!!slError && "border-stroke-error-strong focus:border-stroke-error-strong",
							)}
							disabled={disabled}
						/>
						{slError && <div className="mt-1 text-xs text-error">{slError}</div>}
					</div>
				</div>
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
	"flex h-8 w-full min-w-0 box-border items-center rounded-8 border border-trading-panel-stroke-input bg-surface px-1.5 focus-within:border-trading-panel-control [&_[data-slot=input]]:border-0 [&_[data-slot=input]]:rounded-none [&_[data-slot=input]]:ring-0";
const framedInputClass =
	"h-7 min-w-0 flex-1 bg-transparent px-0 text-xs font-semibold tabular-nums text-trading-panel-fg";

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
	error,
	pnl,
	pnlToneClass,
	formatPnlValue,
	disabled,
	mobileSafe,
}: FramedTpSlRowProps) {
	const inputId = useId();
	const errorId = `${inputId}-error`;
	const returnDisabled = disabled || returnInput?.disabled;
	const unitToggleDisabled = disabled || returnInput?.unitToggleDisabled;

	return (
		<div className="min-w-0 space-y-1.5">
			<div className={cn("grid min-w-0 gap-2", returnInput ? "grid-cols-2" : "grid-cols-1")}>
				<div
					className={cn(
						framedFrameClass,
						mobileSafe && "max-[1000px]:h-11",
						!!error && "border-trading-panel-error focus-within:border-trading-panel-error",
						disabled && "opacity-50",
					)}
				>
					<NumberInput
						id={inputId}
						aria-label={priceAriaLabel}
						aria-describedby={error ? errorId : undefined}
						aria-invalid={Boolean(error)}
						placeholder={pricePlaceholder}
						mobileSafe={mobileSafe}
						value={priceValue}
						onChange={(e) => onPriceChange(e.target.value)}
						onBlur={onPriceBlur}
						className={cn(framedInputClass, mobileSafe && "max-[1000px]:h-11")}
						disabled={disabled}
					/>
				</div>
				{returnInput && (
					<div className={cn(framedFrameClass, mobileSafe && "max-[1000px]:h-11", returnDisabled && "opacity-50")}>
						<NumberInput
							aria-label={returnInput.ariaLabel}
							aria-describedby={error ? errorId : undefined}
							aria-invalid={Boolean(error)}
							placeholder={returnInput.placeholder}
							mobileSafe={mobileSafe}
							value={returnInput.value}
							onChange={(e) => returnInput.onChange(e.target.value)}
							onBlur={returnInput.onBlur}
							className={cn(framedInputClass, mobileSafe && "max-[1000px]:h-11")}
							disabled={returnDisabled}
						/>
						{returnInput.onUnitToggle && (
							<button
								type="button"
								onClick={returnInput.onUnitToggle}
								disabled={unitToggleDisabled}
								aria-label={t`Toggle profit and loss unit`}
								aria-pressed={returnInput.unitLabel === "%"}
								className={cn(
									"relative ml-0.5 inline-flex shrink-0 cursor-pointer items-center justify-center gap-0.5 whitespace-nowrap text-xs font-semibold text-trading-panel-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus disabled:cursor-not-allowed",
									mobileSafe &&
										"max-[1000px]:before:absolute max-[1000px]:before:-inset-x-2.5 max-[1000px]:before:-inset-y-3 max-[1000px]:before:content-['']",
								)}
							>
								{returnInput.unitLabel}
								<CaretDownIcon className="size-2.5 text-trading-panel-subtle" />
							</button>
						)}
					</div>
				)}
			</div>
			{error && (
				<p id={errorId} role="alert" className="text-2xs text-trading-panel-error">
					{error}
				</p>
			)}
			{!error && pnl !== null && (
				<p className="text-2xs tabular-nums text-trading-panel-muted">
					{t`Estimated PnL after trigger`}{" "}
					<span className={cn("font-semibold", pnlToneClass)}>{formatPnlValue(pnl)}</span>
				</p>
			)}
		</div>
	);
}
