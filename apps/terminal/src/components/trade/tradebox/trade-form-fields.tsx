import { Button, Tooltip } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useId, useRef, useState } from "react";
import { NumberInput } from "@/components/ui/number-input";
import { getFormattedMidPrice } from "@/components/ui/price-input";
import { TRADE_PANEL_LABELS } from "@/config/trade-panel-labels";
import { getOrderEntryReferencePrice } from "@/domain/trade/market-price";
import { getSizeInputMaxDecimals, getSliderValue } from "@/domain/trade/order/size";
import { isOrderSizeValidationError } from "@/domain/trade/order-size-validation";
import type { useOrderEntryData } from "@/hooks/trade/use-order-entry-data";
import { useSizeSliderInteraction } from "@/hooks/trade/use-size-slider-interaction";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import type { ValidationError } from "@/lib/errors/types";
import { formatToken } from "@/lib/format";
import { useSelectedMarketInfo } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { formatDecimalFloor, toNumberOrZero } from "@/lib/trade/numbers";
import {
	canUseTpSl as canUseTpSlForOrder,
	isScaleOrderType,
	isTwapOrderType,
	usesLimitPrice as usesLimitPriceForOrder,
	usesTriggerPrice as usesTriggerPriceForOrder,
} from "@/lib/trade/order-types";
import { getTpSlCollateralSymbol } from "@/lib/trade/tpsl";
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
import { TradeAvailableRowView } from "./trade-available-row-view";
import { TradeFormFieldsView } from "./trade-form-fields-view";
import { TradeFormScale } from "./trade-form-scale";
import { TradeFormTif } from "./trade-form-tif";
import { TradeFormTpSl } from "./trade-form-tp-sl";
import { TradeFormTwap } from "./trade-form-twap";
import { TRADE_INPUT_CLASS, TradeInputFrameView } from "./trade-input-frame-view";
import { TradeOptionCheckboxes } from "./trade-option-checkboxes";
import { TradeSizeSliderRowView } from "./trade-size-slider-row-view";
import { TradeSizeUnitView } from "./trade-size-unit-view";

type TradeFormOrderEntryData = Pick<
	ReturnType<typeof useOrderEntryData>,
	| "isSpotMarket"
	| "isAvailabilityBlocked"
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
	| "sizeModeLabel"
	| "szDecimals"
>;

interface Props {
	onSizeInteractionChange?: (active: boolean) => void;
	orderEntryData: TradeFormOrderEntryData;
	visibleValidationErrors: readonly ValidationError[];
	showTpSlValidation?: boolean;
	price: number;
	positionSize: number;
	swapTargetToken: string | null;
	onSizeModeToggle: () => void;
	onSizePercentApply: (pct: number) => void;
	onSwapClick: () => void;
}

const inputFrameErrorClass =
	"border-trading-panel-error focus-within:border-trading-panel-error focus-within:ring-trading-panel-error/10";

export function TradeFormFields({
	orderEntryData,
	visibleValidationErrors,
	showTpSlValidation = true,
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
		isAvailabilityBlocked,
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
		sizeModeLabel,
		szDecimals,
	} = orderEntryData;

	const { setSize, setLimitPriceFromPrefill, setLimitPriceFromUser, setTriggerPrice, setReduceOnly, setTpSlEnabled } =
		useOrderEntryActions();

	const isFormDisabled = !isConnected || isAvailabilityBlocked || availableBalance <= 0;
	const isSizeSliderPaused = isConnected && isAvailabilityBlocked;
	const isSizeSliderDisabled = !isSizeSliderPaused && (isFormDisabled || maxSize <= 0);

	const twapOrder = isTwapOrderType(orderType);
	const scaleOrder = isScaleOrderType(orderType);
	const usesLimitPrice = usesLimitPriceForOrder(orderType);
	const usesTriggerPrice = usesTriggerPriceForOrder(orderType);
	const canUseTpSl = canUseTpSlForOrder(orderType);
	const marketType = isSpotMarket ? "spot" : "perp";

	const triggerHasError = sizeValue > 0 && visibleValidationErrors.some((error) => error.id === "enter-trigger-price");
	const limitHasError =
		sizeValue > 0 &&
		visibleValidationErrors.some((error) => error.id === "enter-limit-price" || error.id === "spot-enter-limit-price");

	const sliderValue = getSliderValue(sizeValue, maxSize);
	const sliderInteractionIdentity = `${leverageInteractionIdentity}:${side}:${orderType}:${reduceOnly}:${sizeMode}:${szDecimals}`;

	const sizeErrorRowRef = useRef<HTMLParagraphElement>(null);
	const [sizeErrorRowHeld, setSizeErrorRowHeld] = useState<boolean | null>(null);
	const [sizeErrorRowHeight, setSizeErrorRowHeight] = useState<number | null>(null);
	const sizeErrorMessage = visibleValidationErrors
		.filter(isOrderSizeValidationError)
		.map((error) => error.message)
		.join(" \u2022 ");
	const showSizeErrorRow = sizeErrorRowHeld ?? sizeErrorMessage !== "";
	const displaySizeError = showSizeErrorRow ? sizeErrorMessage : "";
	const hasDisplayedSizeError = displaySizeError !== "";
	const midReferencePrice = getOrderEntryReferencePrice(market);
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

	function handleSizeInteractionChange(active: boolean) {
		setSizeErrorRowHeld(active ? sizeErrorMessage !== "" : null);
		setSizeErrorRowHeight(active ? (sizeErrorRowRef.current?.offsetHeight ?? null) : null);
		onSizeInteractionChange?.(active);
	}

	const sliderInteraction = useSizeSliderInteraction({
		applyPercent: handleSizePercentApply,
		onInteractionChange: handleSizeInteractionChange,
		interactionIdentity: sliderInteractionIdentity,
		setSizeInput: setSize,
		sizeInput,
	});

	function formatAvailableBalance(): string {
		const isBaseToken = isSpotMarket && side === "sell";
		const decimals = isBaseToken ? szDecimals : 2;
		return formatToken(!isConnected || isAvailabilityBlocked ? "0" : displayAvailableBalance, {
			decimals,
			symbol: displayAvailableBalanceToken ?? undefined,
		});
	}

	return (
		<TradeFormFieldsView
			available={
				<TradeAvailableRowView
					label={
						<Tooltip content={t`Balance available to trade`} side="top">
							<span className="cursor-default whitespace-nowrap text-trading-panel-muted">
								{t(TRADE_PANEL_LABELS.available)}
							</span>
						</Tooltip>
					}
					value={
						isConnected ? (
							<button
								type="button"
								onClick={() => handleSizePercentApply(100)}
								disabled={isFormDisabled || maxSize <= 0}
								aria-label={t`Use max available balance`}
								className="min-w-0 cursor-pointer truncate border-b border-dashed border-trading-panel-stroke-control font-semibold whitespace-nowrap tabular-nums text-trading-panel-fg transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus disabled:cursor-default disabled:border-transparent disabled:hover:opacity-100"
							>
								{formatAvailableBalance()}
							</button>
						) : null
					}
					action={
						isConnected && !isAvailabilityBlocked && swapTargetToken ? (
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
						) : null
					}
					positionLabel={
						!isSpotMarket && positionSize !== 0 ? (
							<Tooltip content={t`Your current open position on this market`} side="top">
								<span className="cursor-default whitespace-nowrap text-trading-panel-muted">
									{t(TRADE_PANEL_LABELS.position)}
								</span>
							</Tooltip>
						) : null
					}
					positionValue={
						<span className={cn("whitespace-nowrap font-semibold tabular-nums", getValueColorClass(positionSize))}>
							{positionSize > 0 ? "+" : ""}
							{formatDecimalFloor(positionSize, szDecimals)} {baseToken}
						</span>
					}
				/>
			}
			prices={
				<>
					{usesTriggerPrice && (
						<TradeInputFrameView
							id={triggerFieldId}
							frameClassName={cn(triggerHasError && inputFrameErrorClass, isFormDisabled && "opacity-50")}
							label={
								<>
									{t`Trigger Price`} <span className="trade-card-label-full">({quoteToken})</span>
								</>
							}
							input={
								<NumberInput
									id={triggerFieldId}
									aria-label={`${t`Trigger Price`} (${quoteToken})`}
									aria-invalid={triggerHasError || undefined}
									placeholder="0.00"
									value={triggerPriceInput}
									onChange={(e) => setTriggerPrice(e.target.value)}
									className={TRADE_INPUT_CLASS}
									disabled={isFormDisabled}
								/>
							}
						/>
					)}

					{usesLimitPrice && (
						<div className="flex min-w-0 flex-col gap-2">
							<TradeInputFrameView
								id={limitFieldId}
								label={t`Price`}
								frameClassName={cn(limitHasError && inputFrameErrorClass, isFormDisabled && "opacity-50")}
								input={
									<NumberInput
										id={limitFieldId}
										aria-invalid={limitHasError || undefined}
										placeholder="0.00"
										value={limitPriceInput}
										onChange={(e) => setLimitPriceFromUser(limitPrefillIdentity, e.target.value)}
										className={TRADE_INPUT_CLASS}
										disabled={isFormDisabled}
									/>
								}
								trailing={
									<>
										<span className="ms-2 shrink-0 whitespace-nowrap text-2xs text-trading-panel-muted">
											{quoteToken}
										</span>
										<button
											type="button"
											onClick={() => formattedMid && setLimitPriceFromUser(limitPrefillIdentity, formattedMid)}
											disabled={isFormDisabled || !formattedMid}
											aria-pressed={!!formattedMid && limitPriceInput === formattedMid}
											className="ms-2 h-8 shrink-0 cursor-pointer whitespace-nowrap text-xs font-semibold text-trading-panel-success disabled:cursor-not-allowed"
										>
											{t`Mid`}
										</button>
									</>
								}
							/>
						</div>
					)}
				</>
			}
			size={
				<TradeInputFrameView
					id={sizeFieldId}
					label={t(TRADE_PANEL_LABELS.size)}
					frameClassName={cn(hasDisplayedSizeError && inputFrameErrorClass, isFormDisabled && "opacity-50")}
					input={
						<NumberInput
							id={sizeFieldId}
							aria-describedby={hasDisplayedSizeError ? sizeErrorId : undefined}
							aria-invalid={hasDisplayedSizeError || undefined}
							placeholder="0.00"
							value={sizeInput}
							onChange={(e) => setSize(e.target.value)}
							maxAllowedDecimals={getSizeInputMaxDecimals(sizeMode, szDecimals)}
							className={TRADE_INPUT_CLASS}
							disabled={isFormDisabled}
						/>
					}
					trailing={
						<TradeSizeUnitView
							unit={sizeModeLabel}
							onClick={onSizeModeToggle}
							aria-label={t`Toggle size mode`}
							disabled={isFormDisabled}
						/>
					}
				/>
			}
			sizeError={
				showSizeErrorRow && (
					<p
						ref={sizeErrorRowRef}
						id={sizeErrorId}
						role="alert"
						style={sizeErrorRowHeight ? { height: sizeErrorRowHeight } : undefined}
						className={cn("min-h-4 text-2xs text-trading-panel-error", sizeErrorRowHeld && "overflow-hidden")}
					>
						{displaySizeError}
					</p>
				)
			}
			slider={
				<TradeSizeSliderRowView
					slider={
						<TradeSizeSlider
							value={sliderValue}
							interactionIdentity={sliderInteractionIdentity}
							onPercentChange={handleSizePercentApply}
							onPercentCancel={sliderInteraction.onPercentCancel}
							onPercentCommit={sliderInteraction.onPercentCommit}
							onPercentInteractionStart={sliderInteraction.onPercentInteractionStart}
							onPercentInteractionEnd={sliderInteraction.onPercentInteractionEnd}
							disabled={isSizeSliderDisabled}
							paused={isSizeSliderPaused}
							ariaLabel={`${t(TRADE_PANEL_LABELS.size)} (%)`}
							ariaDescribedBy={hasDisplayedSizeError ? sizeErrorId : undefined}
							ariaInvalid={hasDisplayedSizeError || undefined}
						/>
					}
					percent={
						<SizePercentInput
							interactionIdentity={sliderInteractionIdentity}
							value={sliderValue}
							onPercentChange={handleSizePercentApply}
							disabled={isFormDisabled || maxSize <= 0}
							ariaLabel={`${t(TRADE_PANEL_LABELS.size)} (%)`}
							ariaDescribedBy={hasDisplayedSizeError ? sizeErrorId : undefined}
							ariaInvalid={hasDisplayedSizeError || undefined}
							frameClassName={cn(
								"h-8 w-16 shrink-0 rounded-[8px] px-2",
								(isFormDisabled || maxSize <= 0) && "opacity-50",
							)}
						/>
					}
				/>
			}
			additional={
				<>
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
				</>
			}
			options={
				((!twapOrder && capabilities.hasReduceOnly) ||
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
								showValidation={showTpSlValidation}
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
				)
			}
		/>
	);
}
