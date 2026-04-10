import { Button, Checkbox, Select, Slider, Tooltip } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { CaretDownIcon, CrosshairIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { useConnection } from "wagmi";
import { NumberInput } from "@/components/ui/number-input";
import {
	FALLBACK_VALUE_PLACEHOLDER,
	ORDER_MIN_NOTIONAL_USD,
	SCALE_LEVELS_MAX,
	SCALE_LEVELS_MIN,
	TWAP_MINUTES_MAX,
	TWAP_MINUTES_MIN,
} from "@/config/constants";
import { getSliderValue } from "@/domain/trade/order/size";
import { useOrderEntryData } from "@/hooks/trade/use-order-entry-data";
import { cn } from "@/lib/cn";
import { formatToken, szDecimalsToPriceDecimals } from "@/lib/format";
import { useSelectedMarketInfo } from "@/lib/hyperliquid";
import {
	formatDecimalFloor,
	getValueColorClass,
	isPositive,
	toFixed,
	toNumber,
	toNumberOrZero,
} from "@/lib/trade/numbers";
import {
	canUseTpSl as canUseTpSlForOrder,
	isScaleOrderType,
	isTriggerOrderType,
	isTwapOrderType,
	type LimitTif,
	TIF_OPTIONS,
	usesLimitPrice as usesLimitPriceForOrder,
	usesTriggerPrice as usesTriggerPriceForOrder,
} from "@/lib/trade/order-types";
import {
	useLimitPrice,
	useOrderEntryActions,
	useOrderSide,
	useOrderSize,
	useOrderType,
	useReduceOnly,
	useScaleEnd,
	useScaleLevels,
	useScaleStart,
	useSizeMode,
	useSlPrice,
	useTif,
	useTpPrice,
	useTpSlEnabled,
	useTriggerPrice,
	useTwapMinutes,
	useTwapRandomize,
} from "@/stores/use-order-entry-store";
import { TpSlSection } from "./tp-sl-section";

interface Props {
	price: number;
	positionSize: number;
	swapTargetToken: string | null;
	reduceOnlyId: string;
	tpSlId: string;
	onSizeModeToggle: () => void;
	onSizePercentApply: (pct: number) => void;
	onDepositClick: () => void;
	onSwapClick: () => void;
}

export function TradeFormFields({
	price,
	positionSize,
	swapTargetToken,
	reduceOnlyId: _reduceOnlyId,
	tpSlId: _tpSlId,
	onSizeModeToggle,
	onSizePercentApply,
	onDepositClick,
	onSwapClick,
}: Props) {
	const sizeFieldId = useId();
	const [isDraggingSlider, setIsDraggingSlider] = useState(false);
	const [dragSliderValue, setDragSliderValue] = useState(25);
	const [hasUserSized, setHasUserSized] = useState(false);

	const { isConnected } = useConnection();
	const { data: market } = useSelectedMarketInfo();

	const side = useOrderSide();
	const sizeMode = useSizeMode();
	const sizeInput = useOrderSize();
	const orderType = useOrderType();
	const limitPriceInput = useLimitPrice();
	const triggerPriceInput = useTriggerPrice();
	const scaleStartPriceInput = useScaleStart();
	const scaleEndPriceInput = useScaleEnd();
	const scaleLevelsNum = useScaleLevels();
	const twapMinutesNum = useTwapMinutes();
	const twapRandomize = useTwapRandomize();
	const tif = useTif();
	const reduceOnly = useReduceOnly();
	const tpSlEnabled = useTpSlEnabled();
	const tpPriceInput = useTpPrice();
	const slPriceInput = useSlPrice();

	const markPx = toNumberOrZero(market?.markPx);

	const {
		isSpotMarket,
		baseToken,
		capabilities,
		availableBalance,
		availableBalanceToken,
		maxSize,
		sizeValue,
		orderValue,
		sizeModeLabel,
		szDecimals,
	} = useOrderEntryData({ market, side, markPx, sizeMode, sizeInput });

	const {
		setSize,
		setLimitPrice,
		setTriggerPrice,
		setScaleStart,
		setScaleEnd,
		setScaleLevels,
		setTwapMinutes,
		setTwapRandomize,
		setTif,
		setReduceOnly,
		setTpSlEnabled,
		setTpPrice,
		setSlPrice,
	} = useOrderEntryActions();

	const isFormDisabled = !isConnected || availableBalance <= 0;

	const triggerOrder = isTriggerOrderType(orderType);
	const twapOrder = isTwapOrderType(orderType);
	const scaleOrder = isScaleOrderType(orderType);
	const usesLimitPrice = usesLimitPriceForOrder(orderType);
	const usesTriggerPrice = usesTriggerPriceForOrder(orderType);
	const canUseTpSl = canUseTpSlForOrder(orderType);
	const showTif = orderType === "limit" || orderType === "scale";
	const availableTifOptions = orderType === "limit" ? (["Gtc", "Ioc", "Alo"] as const) : (["Gtc", "Alo"] as const);

	const triggerPriceNum = toNumber(triggerPriceInput);
	const sizeHasError = (sizeValue > maxSize && maxSize > 0) || (orderValue > 0 && orderValue < ORDER_MIN_NOTIONAL_USD);

	const sliderValue = (() => {
		if (isDraggingSlider) return dragSliderValue;
		if (!hasUserSized || sizeValue <= 0) return 25;
		return getSliderValue(sizeValue, maxSize);
	})();

	function handleSizeChange(value: string) {
		setHasUserSized(true);
		setSize(value);
	}

	function handleSizePercentApply(pct: number) {
		if (maxSize <= 0) return;
		setHasUserSized(true);
		onSizePercentApply(pct);
	}

	function handleSizeModeToggle() {
		setHasUserSized(true);
		onSizeModeToggle();
	}

	function formatAvailableBalance(): string {
		if (!isConnected) return FALLBACK_VALUE_PLACEHOLDER;
		const isBaseToken = isSpotMarket && side === "sell";
		const decimals = isBaseToken ? szDecimals : 2;
		return formatToken(availableBalance, { decimals, symbol: availableBalanceToken ?? undefined });
	}

	return (
		<div className="flex min-w-0 flex-col gap-5">
			<div className="flex min-w-0 flex-col gap-3">
				<div className="flex min-w-0 flex-col gap-2">
					<div className="flex min-w-0 items-baseline justify-between gap-2">
						<p className="inline-flex justify-between w-full min-w-0 items-baseline gap-x-1.5 text-3xs leading-snug">
							<Tooltip content={t`Balance available to trade`} side="top">
								<span className="font-medium uppercase tracking-wider text-text-weak cursor-default">{t`Available`}</span>
							</Tooltip>
							<div>
								{isConnected ? (
									<span className={cn("tabular-nums", getValueColorClass(availableBalance))}>
										{formatAvailableBalance()}
									</span>
								) : null}
							</div>
						</p>
						<div className="flex shrink-0 items-center">
							{isConnected && swapTargetToken ? (
								<Button variant="link" intent="brand" size="xxs" onClick={onSwapClick}>
									{t`Swap`}
								</Button>
							) : null}
							{isConnected && availableBalance <= 0 ? (
								<Button variant="link" intent="brand" size="xxs" onClick={onDepositClick}>
									{t`Deposit`}
								</Button>
							) : null}
						</div>
					</div>
					{!isSpotMarket && positionSize !== 0 ? (
						<div className="flex min-w-0 items-baseline justify-between gap-2 text-3xs leading-snug">
							<Tooltip content={t`Your current open position on this market`} side="top">
								<span className="font-medium uppercase tracking-wider text-text-weak cursor-default">{t`Position`}</span>
							</Tooltip>
							<span className={cn("tabular-nums", getValueColorClass(positionSize))}>
								{positionSize > 0 ? "+" : ""}
								{formatDecimalFloor(positionSize, szDecimals)} {baseToken}
							</span>
						</div>
					) : null}
				</div>

				{usesTriggerPrice && (
					<div className="border-t border-stroke-weak/25 pt-3">
						<NumberInput
							label={t`Trigger Price`}
							labelValue={toFixed(markPx, szDecimalsToPriceDecimals(szDecimals))}
							placeholder="0.00"
							value={triggerPriceInput}
							onChange={(e) => setTriggerPrice(e.target.value)}
							maxLabel={
								<span className="flex items-center gap-1">
									<CrosshairIcon className="size-3" />
									{t`Mid`}
								</span>
							}
							onMaxClick={() => setTriggerPrice(toFixed(markPx, szDecimalsToPriceDecimals(szDecimals)))}
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
					<div className="border-t border-stroke-weak/25 pt-3">
						<NumberInput
							label={t`Limit Price`}
							labelValue={toFixed(markPx, szDecimalsToPriceDecimals(szDecimals))}
							placeholder="0.00"
							value={limitPriceInput}
							onChange={(e) => setLimitPrice(e.target.value)}
							maxLabel={
								<span className="flex items-center gap-1">
									<CrosshairIcon className="size-3" />
									{t`Mid`}
								</span>
							}
							onMaxClick={() => setLimitPrice(toFixed(markPx, szDecimalsToPriceDecimals(szDecimals)))}
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

				<div className="flex flex-col gap-0.5 border-t border-stroke-weak/25 pt-3">
					<div className="mb-1 flex items-center justify-between gap-2">
						<label
							htmlFor={sizeFieldId}
							className="text-3xs font-medium uppercase tracking-wide text-text-weak leading-none"
						>
							{t`Size`}
						</label>
						{sizeValue > 0 ? (
							<span className="text-3xs text-text-weak tabular-nums leading-none">
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
							onChange={(e) => handleSizeChange(e.target.value)}
							maxAllowedDecimals={szDecimals}
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
							onClick={handleSizeModeToggle}
							aria-label={t`Toggle size mode`}
							disabled={isFormDisabled}
							iconRight={<CaretDownIcon className="size-2.5" />}
						>
							{sizeModeLabel}
						</Button>
					</div>
					<Slider
						value={[sliderValue]}
						onValueChange={(v) => {
							const val = Array.isArray(v) ? v[0] : v;
							setIsDraggingSlider(true);
							setDragSliderValue(val);
						}}
						onValueCommitted={(v) => {
							const val = Array.isArray(v) ? v[0] : v;
							setIsDraggingSlider(false);
							handleSizePercentApply(val);
						}}
						max={100}
						step={0.1}
						disabled={isFormDisabled || maxSize <= 0}
					/>
					<div className="flex items-center justify-between pt-1 text-3xs text-text-weak tabular-nums leading-none">
						{[0, 25, 50, 75, 100].map((pct) => (
							<button
								key={pct}
								type="button"
								onClick={() => handleSizePercentApply(pct)}
								disabled={isFormDisabled || maxSize <= 0}
								className="hover:text-text-strong transition-colors disabled:cursor-not-allowed"
							>
								{pct}%
							</button>
						))}
					</div>
				</div>
			</div>

			{scaleOrder && (
				<>
					<NumberInput
						label={t`Start Price`}
						labelValue={toFixed(markPx, szDecimalsToPriceDecimals(szDecimals))}
						placeholder="0.00"
						value={scaleStartPriceInput}
						onChange={(e) => setScaleStart(e.target.value)}
						className="w-full text-xs tabular-nums"
						disabled={isFormDisabled}
						maxLabel={
							<span className="flex items-center gap-1">
								<CrosshairIcon className="size-3" />
								{t`Mid`}
							</span>
						}
						onMaxClick={() => setScaleStart(toFixed(markPx, szDecimalsToPriceDecimals(szDecimals)))}
					/>
					<NumberInput
						label={t`End Price`}
						labelValue={toFixed(markPx, szDecimalsToPriceDecimals(szDecimals))}
						placeholder="0.00"
						value={scaleEndPriceInput}
						onChange={(e) => setScaleEnd(e.target.value)}
						className="w-full text-xs tabular-nums"
						disabled={isFormDisabled}
						maxLabel={
							<span className="flex items-center gap-1">
								<CrosshairIcon className="size-3" />
								{t`Mid`}
							</span>
						}
						onMaxClick={() => setScaleEnd(toFixed(markPx, szDecimalsToPriceDecimals(szDecimals)))}
					/>
					<NumberInput
						label={t`Number of Orders`}
						labelValue={`${SCALE_LEVELS_MIN}–${SCALE_LEVELS_MAX}`}
						placeholder="4"
						value={String(scaleLevelsNum)}
						onChange={(e) => setScaleLevels(Number(e.target.value) || 4)}
						allowDecimals={false}
						className="w-full text-xs tabular-nums"
						disabled={isFormDisabled}
					/>
				</>
			)}

			{twapOrder && (
				<>
					<NumberInput
						label={t`Duration (Minutes)`}
						labelValue={`${TWAP_MINUTES_MIN}–${TWAP_MINUTES_MAX}`}
						placeholder="30"
						value={String(twapMinutesNum)}
						onChange={(e) => setTwapMinutes(Number(e.target.value) || 30)}
						allowDecimals={false}
						className="w-full text-xs tabular-nums"
						disabled={isFormDisabled}
					/>
					<div className="flex items-center text-xs">
						<Checkbox
							checked={twapRandomize}
							onCheckedChange={(checked) => setTwapRandomize(checked === true)}
							disabled={isFormDisabled}
							label={t`Randomize timing`}
						/>
					</div>
				</>
			)}

			{(capabilities.hasReduceOnly || (capabilities.hasTpSl && canUseTpSl) || showTif) && (
				<div className="space-y-3.5 py-0.5">
					<div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 text-xs">
						{capabilities.hasReduceOnly && (
							<Checkbox
								aria-label={t`Reduce Only`}
								checked={triggerOrder || reduceOnly}
								onCheckedChange={(checked) => setReduceOnly(checked === true)}
								disabled={isFormDisabled || triggerOrder}
								label={t`Reduce Only`}
							/>
						)}
						{capabilities.hasTpSl && canUseTpSl && (
							<Checkbox
								aria-label={t`Take Profit / Stop Loss`}
								checked={tpSlEnabled}
								onCheckedChange={(checked) => setTpSlEnabled(checked === true)}
								disabled={isFormDisabled}
								label={t`TP/SL`}
							/>
						)}
						{showTif && (
							<div className="ml-auto flex items-center gap-1.5">
								<span className="text-3xs font-medium text-text-weak/60 uppercase tracking-wide select-none">{t`TIF`}</span>
								<Select
									size="xs"
									value={tif}
									onValueChange={(value) => value && setTif(value as LimitTif)}
									disabled={isFormDisabled}
									triggerClassName="border-transparent bg-transparent hover:bg-fill-hover/40 px-1.5 gap-1"
									options={availableTifOptions.map((opt) => ({
										value: opt,
										label: TIF_OPTIONS[opt].label,
									}))}
								/>
							</div>
						)}
					</div>

					{capabilities.hasTpSl && tpSlEnabled && canUseTpSl && (
						<TpSlSection
							side={side}
							referencePrice={price}
							size={sizeValue}
							szDecimals={szDecimals}
							tpPrice={tpPriceInput}
							slPrice={slPriceInput}
							onTpPriceChange={setTpPrice}
							onSlPriceChange={setSlPrice}
							disabled={isFormDisabled}
						/>
					)}
				</div>
			)}
		</div>
	);
}
