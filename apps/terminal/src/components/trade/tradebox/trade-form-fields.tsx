import { Button, Tooltip } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { CaretDownIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect, useId } from "react";
import { NumberInput } from "@/components/ui/number-input";
import { getFormattedMidPrice } from "@/components/ui/price-input";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { ORDER_MIN_NOTIONAL_USD } from "@/config/trade";
import { getSizeInputMaxDecimals, getSliderValue } from "@/domain/trade/order/size";
import type { useOrderEntryData } from "@/hooks/trade/use-order-entry-data";
import { getMidReferencePrice, useOrderbookMidPrice } from "@/hooks/trade/use-orderbook-mid-price";
import { useSizeSliderInteraction } from "@/hooks/trade/use-size-slider-interaction";
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
	useTpSlEnabled,
	useTriggerPrice,
} from "@/stores/use-order-entry-store";
import { SizePercentInput } from "../components/size-percent-input";
import { TradeSizeSlider } from "../components/trade-size-slider";
import { TradeFormScale } from "./trade-form-scale";
import { TradeFormTif } from "./trade-form-tif";
import { TradeFormTpSl } from "./trade-form-tp-sl";
import { TradeFormTwap } from "./trade-form-twap";
import { TradeOptionCheckboxes } from "./trade-option-checkboxes";

type TradeFormOrderEntryData = Pick<
	ReturnType<typeof useOrderEntryData>,
	| "isSpotMarket"
	| "isAvailabilityLoading"
	| "isAvailabilityBlocked"
	| "isAvailabilityStale"
	| "hasAvailabilityError"
	| "baseToken"
	| "quoteToken"
	| "capabilities"
	| "availableBalance"
	| "displayAvailableBalance"
	| "displayAvailableBalanceToken"
	| "leverage"
	| "leverageInteractionIdentity"
	| "maxSize"
	| "sizeValue"
	| "orderValue"
	| "sizeModeLabel"
	| "szDecimals"
>;

interface Props {
	onSizeInteractionChange?: (active: boolean) => void;
	orderEntryData: TradeFormOrderEntryData;
	price: number;
	positionSize: number;
	swapTargetToken: string | null;
	onSizeModeToggle: () => void;
	onSizePercentApply: (pct: number) => void;
	onSwapClick: () => void;
}

const inputFrameClass = cn(tradingInputFrameClass, "h-9 px-2.5");
const ERROR_LINGER_MS = 1500;

const inputFrameErrorClass =
	"border-trading-panel-error focus-within:border-trading-panel-error focus-within:ring-trading-panel-error/10";

export function TradeFormFields({
	orderEntryData,
	price,
	positionSize,
	swapTargetToken,
	onSizeModeToggle,
	onSizePercentApply,
	onSizeInteractionChange,
	onSwapClick,
}: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const sizeFieldId = useId();
	const sizeErrorId = useId();
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
		leverageInteractionIdentity,
		maxSize,
		sizeValue,
		orderValue,
		sizeModeLabel,
		szDecimals,
	} = orderEntryData;

	const { setSize, setLimitPriceFromPrefill, setLimitPriceFromUser, setTriggerPrice, setReduceOnly, setTpSlEnabled } =
		useOrderEntryActions();

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
	const sliderInteractionIdentity = `${leverageInteractionIdentity}:${side}:${orderType}:${reduceOnly}:${sizeMode}:${szDecimals}`;

	function getSizeErrorText(): string {
		if (!sizeHasError) return "";
		if (sizeValue > maxSize && maxSize > 0) return t`Exceeds max size`;
		return t`Min order $${ORDER_MIN_NOTIONAL_USD}`;
	}
	const displaySizeError = useLingeringText(getSizeErrorText(), ERROR_LINGER_MS);
	const hasDisplayedSizeError = displaySizeError !== "";
	const midReferencePrice = getMidReferencePrice(midPx, market?.markPx);
	const formattedMid = getFormattedMidPrice(midReferencePrice, szDecimals, marketType, market?.assetId);
	const limitPrefillIdentity = `${market?.name ?? ""}|${orderType}`;
	useEffect(() => {
		if (!usesLimitPrice || formattedMid === undefined) return;
		setLimitPriceFromPrefill(limitPrefillIdentity, formattedMid);
	}, [usesLimitPrice, limitPrefillIdentity, formattedMid, setLimitPriceFromPrefill]);

	function handleSizePercentApply(pct: number) {
		if (maxSize <= 0) return;
		onSizePercentApply(pct);
	}

	const sliderInteraction = useSizeSliderInteraction({
		applyPercent: handleSizePercentApply,
		onInteractionChange: onSizeInteractionChange,
		interactionIdentity: sliderInteractionIdentity,
		setSizeInput: setSize,
		sizeInput,
	});

	function formatAvailableBalance(): string {
		if (!isConnected || isAvailabilityLoading || hasAvailabilityError) return FALLBACK_VALUE_PLACEHOLDER;
		const isBaseToken = isSpotMarket && side === "sell";
		const decimals = isBaseToken ? szDecimals : 2;
		return formatToken(displayAvailableBalance, { decimals, symbol: displayAvailableBalanceToken ?? undefined });
	}

	return (
		<div className="flex min-w-0 flex-col gap-2">
			<div className="flex min-w-0 flex-col gap-2">
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
										className="ms-1 size-3 shrink-0 animate-spin text-warning"
										aria-label={t`Loading...`}
									/>
								</Tooltip>
							) : null}
							{hasAvailabilityError ? (
								<Tooltip content={t`Failed to load balances.`} side="top">
									<WarningCircleIcon
										className="ms-1 size-3 shrink-0 text-error"
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
							className="me-2 shrink-0 cursor-text whitespace-nowrap text-xs text-trading-panel-subtle"
						>
							{t`Trigger Price`} <span className="trade-card-label-full">({quoteToken})</span>
						</label>
						<NumberInput
							id={triggerFieldId}
							aria-label={`${t`Trigger Price`} (${quoteToken})`}
							placeholder="0.00"
							value={triggerPriceInput}
							onChange={(e) => setTriggerPrice(e.target.value)}
							className="h-8 min-w-0 flex-1 bg-transparent px-0 text-right text-base font-semibold tabular-nums text-trading-panel-fg"
							disabled={isFormDisabled}
						/>
					</div>
				)}

				{usesLimitPrice && (
					<div className="flex min-w-0 flex-col gap-2">
						<div className={cn(inputFrameClass, limitHasError && inputFrameErrorClass, isFormDisabled && "opacity-50")}>
							<label
								htmlFor={limitFieldId}
								className="me-2 shrink-0 cursor-text whitespace-nowrap text-xs text-trading-panel-subtle"
							>
								{t`Price`}
							</label>
							<NumberInput
								id={limitFieldId}
								placeholder="0.00"
								value={limitPriceInput}
								onChange={(e) => setLimitPriceFromUser(limitPrefillIdentity, e.target.value)}
								className="h-8 min-w-0 flex-1 bg-transparent px-0 text-right text-base font-semibold tabular-nums text-trading-panel-fg"
								disabled={isFormDisabled}
							/>
							<span className="ms-2 shrink-0 whitespace-nowrap text-2xs text-trading-panel-muted">{quoteToken}</span>
							<button
								type="button"
								onClick={() => formattedMid && setLimitPriceFromUser(limitPrefillIdentity, formattedMid)}
								disabled={isFormDisabled || !formattedMid}
								aria-pressed={!!formattedMid && limitPriceInput === formattedMid}
								className="ms-2 h-8 shrink-0 cursor-pointer whitespace-nowrap text-xs font-semibold text-trading-panel-success disabled:cursor-not-allowed"
							>
								{t`Mid`}
							</button>
						</div>
					</div>
				)}

				<div className="flex flex-col gap-2">
					<div className={cn(inputFrameClass, sizeHasError && inputFrameErrorClass, isFormDisabled && "opacity-50")}>
						<label
							htmlFor={sizeFieldId}
							className="me-2 shrink-0 cursor-text whitespace-nowrap text-xs text-trading-panel-subtle"
						>
							{t`Size`}
						</label>
						<NumberInput
							id={sizeFieldId}
							aria-describedby={hasDisplayedSizeError ? sizeErrorId : undefined}
							aria-invalid={hasDisplayedSizeError || undefined}
							placeholder="0.00"
							value={sizeInput}
							onChange={(e) => setSize(e.target.value)}
							maxAllowedDecimals={getSizeInputMaxDecimals(sizeMode, szDecimals)}
							className="h-8 min-w-0 flex-1 bg-transparent px-0 text-right text-base font-semibold tabular-nums text-trading-panel-fg"
							disabled={isFormDisabled}
						/>
						<button
							type="button"
							onClick={onSizeModeToggle}
							aria-label={t`Toggle size mode`}
							disabled={isFormDisabled}
							className="ms-2 inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap text-2sm font-semibold text-trading-panel-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus disabled:cursor-not-allowed"
						>
							{sizeModeLabel}
							<CaretDownIcon className="size-3 text-trading-panel-subtle" />
						</button>
					</div>
					{displaySizeError && (
						<p id={sizeErrorId} role="alert" className="text-2xs text-trading-panel-error">
							{displaySizeError}
						</p>
					)}

					<div className="flex items-start gap-2">
						<div className="relative min-w-0 flex-1">
							<TradeSizeSlider
								value={sliderValue}
								interactionIdentity={sliderInteractionIdentity}
								onPercentChange={handleSizePercentApply}
								onPercentCancel={sliderInteraction.onPercentCancel}
								onPercentCommit={sliderInteraction.onPercentCommit}
								onPercentInteractionStart={sliderInteraction.onPercentInteractionStart}
								onPercentInteractionEnd={sliderInteraction.onPercentInteractionEnd}
								disabled={isFormDisabled || maxSize <= 0}
								ariaLabel={`${t`Size`} (%)`}
								ariaDescribedBy={hasDisplayedSizeError ? sizeErrorId : undefined}
								ariaInvalid={hasDisplayedSizeError || undefined}
							/>
						</div>
						<SizePercentInput
							interactionIdentity={sliderInteractionIdentity}
							value={sliderValue}
							onPercentChange={handleSizePercentApply}
							disabled={isFormDisabled || maxSize <= 0}
							ariaLabel={`${t`Size`} (%)`}
							ariaDescribedBy={hasDisplayedSizeError ? sizeErrorId : undefined}
							ariaInvalid={hasDisplayedSizeError || undefined}
							frameClassName={cn(
								"h-8 w-16 shrink-0 rounded-[8px] px-2",
								(isFormDisabled || maxSize <= 0) && "opacity-50",
							)}
						/>
					</div>
				</div>
				{scaleOrder && (
					<TradeFormScale
						desktop
						midPrice={midReferencePrice}
						szDecimals={szDecimals}
						marketType={marketType}
						assetId={market?.assetId}
						disabled={isFormDisabled}
					/>
				)}

				{twapOrder && (
					<TradeFormTwap
						reduceOnly={
							capabilities.hasReduceOnly ? { checked: reduceOnly, onCheckedChange: setReduceOnly } : undefined
						}
						desktop
						disabled={isFormDisabled}
						side={side}
						quoteToken={quoteToken}
						markPx={markPx}
						assetId={market?.assetId}
						szDecimals={szDecimals}
					/>
				)}
			</div>

			{((!twapOrder && capabilities.hasReduceOnly) ||
				(capabilities.hasTpSl && canUseTpSl) ||
				orderType === "limit" ||
				scaleOrder) && (
				<div className="space-y-2 py-0.5">
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
					>
						{(orderType === "limit" || scaleOrder) && (
							<TradeFormTif orderType={orderType} disabled={isFormDisabled} tradingPanel />
						)}
					</TradeOptionCheckboxes>

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
