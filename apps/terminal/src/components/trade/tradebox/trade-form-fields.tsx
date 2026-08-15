import { Button, Tooltip } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { CaretDownIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef } from "react";
import { DefinitionTooltip } from "@/components/ui/definition-tooltip";
import { NumberInput } from "@/components/ui/number-input";
import { getFormattedMidPrice } from "@/components/ui/price-input";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { ORDER_MIN_NOTIONAL_USD, type OrderType, SIZE_PERCENT_OPTIONS } from "@/config/trade";
import { getSizeInputMaxDecimals, getSliderValue } from "@/domain/trade/order/size";
import { useOrderEntryData } from "@/hooks/trade/use-order-entry-data";
import { getMidReferencePrice, useOrderbookMidPrice } from "@/hooks/trade/use-orderbook-mid-price";
import { useLingeringText } from "@/hooks/ui/use-lingering-text";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatToken } from "@/lib/format";
import { useSelectedMarketInfo } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { formatDecimalFloor, isPositive, toNumber, toNumberOrZero } from "@/lib/trade/numbers";
import {
	canUseTpSl as canUseTpSlForOrder,
	isScaleOrderType,
	isTwapOrderType,
	usesLimitPrice as usesLimitPriceForOrder,
	usesTriggerPrice as usesTriggerPriceForOrder,
} from "@/lib/trade/order-types";
import { getAvailableTifOptions, getTifOptionLabel } from "@/lib/trade/tif";
import { getTpSlCollateralSymbol } from "@/lib/trade/tpsl";
import { tradingInputFrameClass } from "@/lib/ui/trading-input";
import { getValueColorClass } from "@/lib/ui/value-color";
import {
	useLimitPrice,
	useOrderEntryActions,
	useOrderSide,
	useOrderSize,
	useOrderType,
	useReduceOnly,
	useSizeMode,
	useTif,
	useTpSlEnabled,
	useTriggerPrice,
} from "@/stores/use-order-entry-store";
import { SizePercentInput } from "../components/size-percent-input";
import { SliderTickMarks } from "../components/slider-tick-marks";
import { TradeSizeSlider } from "../components/trade-size-slider";
import { TradeFormScale } from "./trade-form-scale";
import { TradeFormTpSl } from "./trade-form-tp-sl";
import { TradeFormTwap } from "./trade-form-twap";
import { TradeOptionCheckboxes } from "./trade-option-checkboxes";

interface Props {
	price: number;
	positionSize: number;
	swapTargetToken: string | null;
	onSizeModeToggle: () => void;
	onSizePercentApply: (pct: number) => void;
	onSwapClick: () => void;
}

const inputFrameClass = cn(tradingInputFrameClass, "px-2.5");
const ERROR_LINGER_MS = 1500;

const inputFrameErrorClass =
	"border-trading-panel-error focus-within:border-trading-panel-error focus-within:ring-trading-panel-error/10";

function chipClass(active: boolean): string {
	return cn(
		"cursor-pointer whitespace-nowrap rounded-[7px] border px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
		active
			? "border-trading-panel-control bg-surface text-trading-panel-fg"
			: "border-trading-panel-stroke-card text-trading-panel-muted hover:text-trading-panel-fg",
	);
}

function TradeTifChips({ orderType, disabled }: { orderType: OrderType; disabled: boolean }) {
	const { t } = useLingui();
	const tif = useTif();
	const { setTif } = useOrderEntryActions();
	const options = getAvailableTifOptions(orderType);

	return (
		<div className="flex min-w-0 flex-wrap items-center gap-1.5">
			<DefinitionTooltip topic="tif" only={options}>
				<span className="cursor-default whitespace-nowrap text-3xs text-trading-panel-subtle">{t`TIF`}</span>
			</DefinitionTooltip>
			{options.map((option) => (
				<button
					key={option}
					type="button"
					onClick={() => setTif(option)}
					disabled={disabled}
					aria-pressed={tif === option}
					className={chipClass(tif === option)}
				>
					{getTifOptionLabel(option)}
				</button>
			))}
		</div>
	);
}

export function TradeFormFields({
	price,
	positionSize,
	swapTargetToken,
	onSizeModeToggle,
	onSizePercentApply,
	onSwapClick,
}: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const sizeFieldId = useId();
	const limitFieldId = useId();
	const triggerFieldId = useId();

	const { isConnected } = useWalletSession();
	const { data: market } = useSelectedMarketInfo();

	const side = useOrderSide();
	const sizeMode = useSizeMode();
	const sizeInput = useOrderSize();
	const orderType = useOrderType();
	const limitPriceInput = useLimitPrice();
	const triggerPriceInput = useTriggerPrice();
	const reduceOnly = useReduceOnly();
	const tpSlEnabled = useTpSlEnabled();

	const markPx = toNumberOrZero(market?.markPx);

	const {
		isSpotMarket,
		isAvailabilityLoading,
		isAvailabilityBlocked,
		isAvailabilityStale,
		hasAvailabilityError,
		baseToken,
		quoteToken,
		capabilities,
		availableBalance,
		displayAvailableBalance,
		displayAvailableBalanceToken,
		leverage,
		maxSize,
		sizeValue,
		orderValue,
		sizeModeLabel,
		szDecimals,
	} = useOrderEntryData({
		market,
		side,
		markPx,
		sizeMode,
		sizeInput,
		limitPx: usesLimitPriceForOrder(orderType) ? toNumberOrZero(limitPriceInput) : undefined,
	});

	const { setSize, setLimitPrice, setTriggerPrice, setReduceOnly, setTpSlEnabled } = useOrderEntryActions();

	const isFormDisabled = !isConnected || isAvailabilityBlocked || availableBalance <= 0;

	const twapOrder = isTwapOrderType(orderType);
	const scaleOrder = isScaleOrderType(orderType);
	const usesLimitPrice = usesLimitPriceForOrder(orderType);
	const usesTriggerPrice = usesTriggerPriceForOrder(orderType);
	const canUseTpSl = canUseTpSlForOrder(orderType);
	const marketType = isSpotMarket ? "spot" : "perp";
	const { midPx } = useOrderbookMidPrice(usesLimitPrice || usesTriggerPrice || scaleOrder ? market?.name : undefined);

	const triggerPriceNum = toNumber(triggerPriceInput);
	const sizeHasError = (sizeValue > maxSize && maxSize > 0) || (orderValue > 0 && orderValue < ORDER_MIN_NOTIONAL_USD);
	const triggerHasError = usesTriggerPrice && !isPositive(triggerPriceNum) && sizeValue > 0;
	const limitHasError = usesLimitPrice && !price && sizeValue > 0;

	const sliderValue = getSliderValue(sizeValue, maxSize);

	function getSizeErrorText(): string {
		if (!sizeHasError) return "";
		if (sizeValue > maxSize && maxSize > 0) return t`Exceeds max size`;
		return t`Min order $${ORDER_MIN_NOTIONAL_USD}`;
	}
	const displaySizeError = useLingeringText(getSizeErrorText(), ERROR_LINGER_MS);
	const midReferencePrice = getMidReferencePrice(midPx, market?.markPx);
	const formattedMid = getFormattedMidPrice(midReferencePrice, szDecimals, marketType, market?.assetId);
	const limitPrefillKey = usesLimitPrice ? `${market?.name ?? ""}|${orderType}` : null;
	const prefilledLimitKeyRef = useRef<string | null>(null);
	useEffect(() => {
		if (limitPrefillKey === null) {
			prefilledLimitKeyRef.current = null;
			return;
		}
		if (prefilledLimitKeyRef.current === limitPrefillKey) return;
		if (limitPriceInput !== "" || formattedMid === undefined) return;
		prefilledLimitKeyRef.current = limitPrefillKey;
		setLimitPrice(formattedMid);
	}, [limitPrefillKey, limitPriceInput, formattedMid, setLimitPrice]);

	function handleSizePercentApply(pct: number) {
		if (maxSize <= 0) return;
		onSizePercentApply(pct);
	}

	function formatAvailableBalance(): string {
		if (!isConnected || isAvailabilityLoading || hasAvailabilityError) return FALLBACK_VALUE_PLACEHOLDER;
		const isBaseToken = isSpotMarket && side === "sell";
		const decimals = isBaseToken ? szDecimals : 2;
		return formatToken(displayAvailableBalance, { decimals, symbol: displayAvailableBalanceToken ?? undefined });
	}

	const isBuy = side === "buy";
	const accentTextClass = isBuy ? "text-trading-panel-success" : "text-trading-panel-error";
	const accentBgClass = isBuy ? "bg-trading-panel-success" : "bg-trading-panel-error";
	const accentBorderClass = isBuy ? "border-trading-panel-success" : "border-trading-panel-error";

	return (
		<div className="flex min-w-0 flex-col gap-5">
			<div className="flex min-w-0 flex-col gap-3">
				<div className="flex min-w-0 items-baseline justify-between gap-2 text-xs leading-snug">
					<div className="inline-flex min-w-0 flex-1 items-baseline gap-x-1.5">
						<Tooltip content={t`Balance available to trade`} side="top">
							<span className="cursor-default whitespace-nowrap text-trading-panel-muted">{t`Available`}</span>
						</Tooltip>
						<span className="inline-flex min-w-0 items-center">
							{isConnected ? (
								<button
									type="button"
									onClick={() => handleSizePercentApply(100)}
									disabled={isFormDisabled || maxSize <= 0}
									aria-label={t`Use max available balance`}
									className="min-w-0 cursor-pointer truncate border-b border-dashed border-trading-panel-stroke-control font-semibold whitespace-nowrap tabular-nums text-trading-panel-fg transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus disabled:cursor-default disabled:border-transparent disabled:hover:opacity-100"
								>
									{formatAvailableBalance()}
								</button>
							) : null}
							{isAvailabilityStale ? (
								<Tooltip content={t`Loading...`} side="top">
									<SpinnerGapIcon
										className="ml-1 size-3 shrink-0 animate-spin text-warning"
										aria-label={t`Loading...`}
									/>
								</Tooltip>
							) : null}
							{hasAvailabilityError ? (
								<Tooltip content={t`Failed to load balances.`} side="top">
									<WarningCircleIcon
										className="ml-1 size-3 shrink-0 text-error"
										aria-label={t`Failed to load balances.`}
									/>
								</Tooltip>
							) : null}
						</span>
						{isConnected && !isAvailabilityBlocked && swapTargetToken ? (
							<Button
								variant="link"
								intent="brand"
								size="xxs"
								onClick={onSwapClick}
								aria-label={`${t`Swap`} ${swapTargetToken}`}
								className="min-h-6 shrink-0 px-0 shadow-none"
							>
								{t`Swap`}
							</Button>
						) : null}
					</div>
					{!isSpotMarket && positionSize !== 0 ? (
						<div className="inline-flex min-w-0 shrink-0 items-baseline gap-x-1.5">
							<Tooltip content={t`Your current open position on this market`} side="top">
								<span className="cursor-default whitespace-nowrap text-trading-panel-muted">{t`Position`}</span>
							</Tooltip>
							<span className={cn("whitespace-nowrap font-semibold tabular-nums", getValueColorClass(positionSize))}>
								{positionSize > 0 ? "+" : ""}
								{formatDecimalFloor(positionSize, szDecimals)} {baseToken}
							</span>
						</div>
					) : null}
				</div>

				{usesTriggerPrice && (
					<div className={cn(inputFrameClass, triggerHasError && inputFrameErrorClass, isFormDisabled && "opacity-50")}>
						<label
							htmlFor={triggerFieldId}
							className="mr-2 shrink-0 cursor-text whitespace-nowrap text-xs text-trading-panel-subtle"
						>
							{t`Trigger Price`} ({quoteToken})
						</label>
						<NumberInput
							id={triggerFieldId}
							placeholder="0.00"
							value={triggerPriceInput}
							onChange={(e) => setTriggerPrice(e.target.value)}
							className="h-9 min-w-0 flex-1 bg-transparent px-0 text-right text-base font-semibold tabular-nums text-trading-panel-fg"
							disabled={isFormDisabled}
						/>
					</div>
				)}

				{twapOrder && (
					<TradeFormTwap
						disabled={isFormDisabled}
						side={side}
						quoteToken={quoteToken}
						markPx={markPx}
						assetId={market?.assetId}
						szDecimals={szDecimals}
					/>
				)}

				{usesLimitPrice && (
					<div className="flex min-w-0 flex-col gap-2">
						<div className="flex min-w-0 items-baseline justify-between gap-2">
							<label htmlFor={limitFieldId} className="whitespace-nowrap text-2sm font-semibold text-trading-panel-fg">
								{t`Price`}
							</label>
							<button
								type="button"
								onClick={() => formattedMid && setLimitPrice(formattedMid)}
								disabled={isFormDisabled || !formattedMid}
								aria-pressed={!!formattedMid && limitPriceInput === formattedMid}
								className={chipClass(!!formattedMid && limitPriceInput === formattedMid)}
							>
								{t`Mid`}
							</button>
						</div>
						<div className={cn(inputFrameClass, limitHasError && inputFrameErrorClass, isFormDisabled && "opacity-50")}>
							<NumberInput
								id={limitFieldId}
								placeholder="0.00"
								value={limitPriceInput}
								onChange={(e) => setLimitPrice(e.target.value)}
								className="h-9 min-w-0 flex-1 bg-transparent px-0 text-base font-semibold tabular-nums text-trading-panel-fg"
								disabled={isFormDisabled}
							/>
							<span className="ml-2 shrink-0 whitespace-nowrap text-2sm text-trading-panel-muted">{quoteToken}</span>
						</div>
						{orderType === "limit" && <TradeTifChips orderType={orderType} disabled={isFormDisabled} />}
					</div>
				)}

				{scaleOrder && (
					<>
						<TradeFormScale
							midPrice={midReferencePrice}
							szDecimals={szDecimals}
							marketType={marketType}
							assetId={market?.assetId}
							disabled={isFormDisabled}
						/>
						<TradeTifChips orderType={orderType} disabled={isFormDisabled} />
					</>
				)}

				<div className="flex flex-col gap-2.5">
					<div className={cn(inputFrameClass, sizeHasError && inputFrameErrorClass, isFormDisabled && "opacity-50")}>
						<label
							htmlFor={sizeFieldId}
							className="mr-2 shrink-0 cursor-text whitespace-nowrap text-xs text-trading-panel-subtle"
						>
							{t`Size`}
						</label>
						<NumberInput
							id={sizeFieldId}
							placeholder="0.00"
							value={sizeInput}
							onChange={(e) => setSize(e.target.value)}
							maxAllowedDecimals={getSizeInputMaxDecimals(sizeMode, szDecimals)}
							className="h-9 min-w-0 flex-1 bg-transparent px-0 text-right text-base font-semibold tabular-nums text-trading-panel-fg"
							disabled={isFormDisabled}
						/>
						<button
							type="button"
							onClick={onSizeModeToggle}
							aria-label={t`Toggle size mode`}
							disabled={isFormDisabled}
							className="ml-2 inline-flex h-9 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap text-2sm font-semibold text-trading-panel-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus disabled:cursor-not-allowed"
						>
							{sizeModeLabel}
							<CaretDownIcon className="size-3 text-trading-panel-subtle" />
						</button>
					</div>
					{displaySizeError && <p className="text-2xs text-trading-panel-error">{displaySizeError}</p>}

					<div className="flex items-start gap-2">
						<div className="flex min-w-0 flex-1 flex-col gap-0.5">
							<div className="relative min-w-0">
								<TradeSizeSlider
									value={sliderValue}
									onPercentChange={handleSizePercentApply}
									disabled={isFormDisabled || maxSize <= 0}
									ariaLabel={`${t`Size`} (%)`}
									thumbSize="md"
									thumbAlignment="edge"
									controlClassName="h-8"
									trackClassName="mx-[9px] h-1 rounded-xs bg-trading-panel-stroke-card ring-0 shadow-none inset-shadow-none"
									indicatorClassName={cn("min-w-0 rounded-xs shadow-none inset-shadow-none", accentBgClass)}
									thumbClassName={cn(
										"size-[18px] border-[3px] bg-trading-panel-slider-thumb shadow-trading-panel-slider",
										accentBorderClass,
									)}
								/>
								<SliderTickMarks
									insetClassName="inset-x-[9px]"
									activeClassName={cn(accentBorderClass, accentBgClass)}
									positions={SIZE_PERCENT_OPTIONS.map((pct) => ({
										key: pct,
										leftPercent: pct,
										active: sliderValue >= pct,
									}))}
								/>
							</div>
							<div className="flex items-center justify-between text-3xs tabular-nums leading-none">
								{SIZE_PERCENT_OPTIONS.map((pct) => (
									<button
										key={pct}
										type="button"
										onClick={() => handleSizePercentApply(pct)}
										disabled={isFormDisabled || maxSize <= 0}
										className={cn(
											"-mx-1 cursor-pointer px-1 py-1 transition-colors disabled:cursor-not-allowed",
											Math.abs(sliderValue - pct) < 0.05
												? cn("font-bold", accentTextClass)
												: "text-trading-panel-subtle hover:text-trading-panel-fg",
										)}
									>
										{pct}%
									</button>
								))}
							</div>
						</div>
						<SizePercentInput
							value={sliderValue}
							onPercentChange={handleSizePercentApply}
							disabled={isFormDisabled || maxSize <= 0}
							ariaLabel={`${t`Size`} (%)`}
							frameClassName={cn(
								"h-8 w-16 shrink-0 rounded-[8px] px-2",
								(isFormDisabled || maxSize <= 0) && "opacity-50",
							)}
						/>
					</div>
				</div>
			</div>

			{(capabilities.hasReduceOnly || (capabilities.hasTpSl && canUseTpSl)) && (
				<div className="space-y-3.5 py-0.5">
					<TradeOptionCheckboxes
						className="flex flex-wrap items-center gap-x-4 gap-y-2.5 text-xs"
						tradingPanel
						reduceOnly={
							capabilities.hasReduceOnly
								? {
										checked: reduceOnly,
										disabled: isFormDisabled,
										onCheckedChange: setReduceOnly,
									}
								: undefined
						}
						tpSl={
							capabilities.hasTpSl && canUseTpSl
								? {
										checked: tpSlEnabled,
										disabled: isFormDisabled,
										onCheckedChange: setTpSlEnabled,
									}
								: undefined
						}
					/>

					{capabilities.hasTpSl && canUseTpSl && tpSlEnabled && (
						<TradeFormTpSl
							assetId={market?.assetId ?? null}
							marketId={market?.name ?? null}
							referencePrice={price}
							size={sizeValue}
							szDecimals={szDecimals}
							quoteSymbol={getTpSlCollateralSymbol(market)}
							leverage={leverage}
							disabled={isFormDisabled}
						/>
					)}
				</div>
			)}
		</div>
	);
}
