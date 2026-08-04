import { Button, Tooltip } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { CaretDownIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useId } from "react";
import { labelTypographyClass } from "@/components/ui/field-label";
import { NumberInput } from "@/components/ui/number-input";
import { PriceInput } from "@/components/ui/price-input";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { ORDER_MIN_NOTIONAL_USD, SIZE_PERCENT_OPTIONS } from "@/config/trade";
import { getSizeInputMaxDecimals, getSliderValue } from "@/domain/trade/order/size";
import { useOrderEntryData } from "@/hooks/trade/use-order-entry-data";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatToken } from "@/lib/format";
import { useSelectedMarketInfo } from "@/lib/hyperliquid";
import { formatDecimalFloor, isPositive, toNumber, toNumberOrZero } from "@/lib/trade/numbers";
import {
	canUseTpSl as canUseTpSlForOrder,
	isScaleOrderType,
	isTriggerOrderType,
	isTwapOrderType,
	usesLimitPrice as usesLimitPriceForOrder,
	usesTriggerPrice as usesTriggerPriceForOrder,
} from "@/lib/trade/order-types";
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
import { TradeSizeSlider } from "../components/trade-size-slider";
import { TradeFormScale } from "./trade-form-scale";
import { TradeFormTif } from "./trade-form-tif";
import { TradeFormTpSl } from "./trade-form-tp-sl";
import { TradeFormTwap } from "./trade-form-twap";
import { TradeOptionCheckboxes } from "./trade-option-checkboxes";

interface Props {
	price: number;
	positionSize: number;
	swapTargetToken: string | null;
	onSizeModeToggle: () => void;
	onSizePercentApply: (pct: number) => void;
	onDepositClick: () => void;
	onSwapClick: () => void;
}

export function TradeFormFields({
	price,
	positionSize,
	swapTargetToken,
	onSizeModeToggle,
	onSizePercentApply,
	onDepositClick,
	onSwapClick,
}: Props) {
	const { t } = useLingui();
	const sizeFieldId = useId();

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
		capabilities,
		availableBalance,
		displayAvailableBalance,
		displayAvailableBalanceToken,
		maxSize,
		sizeValue,
		orderValue,
		sizeModeLabel,
		szDecimals,
	} = useOrderEntryData({ market, side, markPx, sizeMode, sizeInput });

	const { setSize, setLimitPrice, setTriggerPrice, setReduceOnly, setTpSlEnabled } = useOrderEntryActions();

	const isFormDisabled = !isConnected || isAvailabilityBlocked || availableBalance <= 0;

	const triggerOrder = isTriggerOrderType(orderType);
	const twapOrder = isTwapOrderType(orderType);
	const scaleOrder = isScaleOrderType(orderType);
	const usesLimitPrice = usesLimitPriceForOrder(orderType);
	const usesTriggerPrice = usesTriggerPriceForOrder(orderType);
	const canUseTpSl = canUseTpSlForOrder(orderType);
	const showTif = orderType === "limit" || orderType === "scale";

	const triggerPriceNum = toNumber(triggerPriceInput);
	const sizeHasError = (sizeValue > maxSize && maxSize > 0) || (orderValue > 0 && orderValue < ORDER_MIN_NOTIONAL_USD);

	const sliderValue = getSliderValue(sizeValue, maxSize);

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

	return (
		<div className="flex min-w-0 flex-col gap-5">
			<div className="flex min-w-0 flex-col gap-3">
				<div className="flex min-w-0 flex-col gap-2">
					<div className="flex min-w-0 items-baseline justify-between gap-2">
						<div className="inline-flex justify-between w-full min-w-0 items-baseline gap-x-1.5 text-3xs leading-snug">
							<Tooltip content={t`Balance available to trade`} side="top">
								<span className="font-medium uppercase tracking-wider text-fg-muted cursor-default">{t`Available`}</span>
							</Tooltip>
							<span className="inline-flex min-w-0 items-center">
								{isConnected ? (
									<span className={cn("tabular-nums", getValueColorClass(displayAvailableBalance))}>
										{formatAvailableBalance()}
									</span>
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
						</div>
						<div className="flex shrink-0 items-center">
							{isConnected && swapTargetToken ? (
								<Button variant="link" intent="brand" size="xxs" onClick={onSwapClick}>
									{t`Swap`}
								</Button>
							) : null}
							{isConnected && !isAvailabilityBlocked && displayAvailableBalance <= 0 ? (
								<Button variant="link" intent="brand" size="xxs" onClick={onDepositClick}>
									{t`Deposit`}
								</Button>
							) : null}
						</div>
					</div>
					{!isSpotMarket && positionSize !== 0 ? (
						<div className="flex min-w-0 items-baseline justify-between gap-2 text-3xs leading-snug">
							<Tooltip content={t`Your current open position on this market`} side="top">
								<span className="font-medium uppercase tracking-wider text-fg-muted cursor-default">{t`Position`}</span>
							</Tooltip>
							<span className={cn("tabular-nums", getValueColorClass(positionSize))}>
								{positionSize > 0 ? "+" : ""}
								{formatDecimalFloor(positionSize, szDecimals)} {baseToken}
							</span>
						</div>
					) : null}
				</div>

				{usesTriggerPrice && (
					<div className="border-t border-stroke-weak pt-3">
						<PriceInput
							label={t`Trigger Price`}
							placeholder="0.00"
							value={triggerPriceInput}
							onChange={(e) => setTriggerPrice(e.target.value)}
							onMidClick={setTriggerPrice}
							midPrice={markPx}
							szDecimals={szDecimals}
							marketType={isSpotMarket ? "spot" : "perp"}
							className={cn(
								"w-full text-xs tabular-nums",
								usesTriggerPrice &&
									!isPositive(triggerPriceNum) &&
									sizeValue > 0 &&
									"border-stroke-error-strong focus:border-stroke-error-strong",
							)}
							disabled={isFormDisabled}
						/>
					</div>
				)}

				{usesLimitPrice && (
					<div className="border-t border-stroke-weak pt-3">
						<PriceInput
							label={t`Limit Price`}
							placeholder="0.00"
							value={limitPriceInput}
							onChange={(e) => setLimitPrice(e.target.value)}
							onMidClick={setLimitPrice}
							midPrice={markPx}
							szDecimals={szDecimals}
							marketType={isSpotMarket ? "spot" : "perp"}
							className={cn(
								"w-full text-xs tabular-nums",
								usesLimitPrice &&
									!price &&
									sizeValue > 0 &&
									"border-stroke-error-strong focus:border-stroke-error-strong",
							)}
							disabled={isFormDisabled}
						/>
					</div>
				)}

				<div className="flex flex-col gap-0.5 border-t border-stroke-weak pt-3">
					<div className="mb-1 flex items-center justify-between gap-2">
						<label htmlFor={sizeFieldId} className={labelTypographyClass}>
							{t`Size`}
						</label>
						{sizeValue > 0 ? (
							<span className="text-3xs text-fg-muted tabular-nums leading-none">
								≈{" "}
								{sizeMode === "base"
									? `${formatToken(orderValue, 2)} USD`
									: `${formatDecimalFloor(sizeValue, szDecimals)} ${baseToken}`}
							</span>
						) : null}
					</div>
					<div className="mb-2.5 flex items-center gap-1">
						<NumberInput
							id={sizeFieldId}
							placeholder="0.00"
							value={sizeInput}
							onChange={(e) => setSize(e.target.value)}
							maxAllowedDecimals={getSizeInputMaxDecimals(sizeMode, szDecimals)}
							className={cn(
								"flex-1 text-xs tabular-nums",
								sizeHasError && "border-stroke-error-strong focus:border-stroke-error-strong",
							)}
							disabled={isFormDisabled}
						/>
						<Button
							variant="outline"
							intent="neutral"
							size="sm"
							onClick={onSizeModeToggle}
							aria-label={t`Toggle size mode`}
							disabled={isFormDisabled}
							iconRight={<CaretDownIcon className="size-2.5" />}
						>
							{sizeModeLabel}
						</Button>
					</div>
					<TradeSizeSlider
						value={sliderValue}
						onPercentChange={handleSizePercentApply}
						disabled={isFormDisabled || maxSize <= 0}
						ariaLabel={`${t`Size`} (%)`}
					/>
					<div className="flex items-center justify-between pt-1 text-3xs text-fg-muted tabular-nums leading-none">
						{SIZE_PERCENT_OPTIONS.map((pct) => (
							<button
								key={pct}
								type="button"
								onClick={() => handleSizePercentApply(pct)}
								disabled={isFormDisabled || maxSize <= 0}
								className="hover:text-fg transition-colors disabled:cursor-not-allowed"
							>
								{pct}%
							</button>
						))}
					</div>
				</div>
			</div>

			{scaleOrder && (
				<TradeFormScale
					markPx={markPx}
					szDecimals={szDecimals}
					marketType={isSpotMarket ? "spot" : "perp"}
					disabled={isFormDisabled}
				/>
			)}

			{twapOrder && <TradeFormTwap disabled={isFormDisabled} />}

			{(capabilities.hasReduceOnly || (capabilities.hasTpSl && canUseTpSl) || showTif) && (
				<div className="space-y-3.5 py-0.5">
					<TradeOptionCheckboxes
						className="flex flex-wrap items-center gap-x-4 gap-y-2.5 text-xs"
						reduceOnly={
							capabilities.hasReduceOnly
								? {
										checked: triggerOrder || reduceOnly,
										disabled: isFormDisabled || triggerOrder,
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
						{showTif && <TradeFormTif orderType={orderType} disabled={isFormDisabled} />}
					</TradeOptionCheckboxes>

					{capabilities.hasTpSl && canUseTpSl && tpSlEnabled && (
						<TradeFormTpSl referencePrice={price} size={sizeValue} szDecimals={szDecimals} disabled={isFormDisabled} />
					)}
				</div>
			)}
		</div>
	);
}
