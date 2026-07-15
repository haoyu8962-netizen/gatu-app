import { Button, buttonVariants, Slider } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { CaretDownIcon, PencilIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { type ChangeEvent, Suspense, useEffect, useState } from "react";
import { useSwitchChain, useWalletClient } from "wagmi";
import { NumberInput } from "@/components/ui/number-input";
import { PriceInput } from "@/components/ui/price-input";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { ARBITRUM_CHAIN_ID } from "@/config/contracts";
import { SIZE_PERCENT_OPTIONS } from "@/config/trade";
import { UI_TEXT } from "@/config/ui-text";
import { get24hChange } from "@/domain/market";
import { getLiquidationInfo } from "@/domain/trade/order/metrics";
import { getSliderValue } from "@/domain/trade/order/size";
import { buildOrderPlan } from "@/domain/trade/order-intent";
import { formatPriceForOrder, formatSizeForOrder, throwIfResponseError } from "@/domain/trade/orders";
import { useAccountAbstractionControl } from "@/hooks/trade/use-account-abstraction-control";
import { useFeeRates } from "@/hooks/trade/use-fee-rates";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useOrderEntryData } from "@/hooks/trade/use-order-entry-data";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatPrice, formatToken, formatUSD } from "@/lib/format";
import {
	type UnifiedMarketInfo,
	useAgentRegistration,
	useAgentStatus,
	useExchange,
	useSelectedMarketInfo,
} from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import { deriveOrderOutcome } from "@/lib/trade/extract-order-status";
import type { MarginMode } from "@/lib/trade/margin-mode";
import { toNumber, toNumberOrZero } from "@/lib/trade/numbers";
import {
	canUseTpSl as canUseTpSlForOrder,
	isStopOrderType,
	isTakeProfitOrderType,
	isTakerOrderType,
	usesLimitPrice as usesLimitPriceForOrder,
	usesTriggerPrice as usesTriggerPriceForOrder,
} from "@/lib/trade/order-types";
import type { ButtonContent, Side, SizeMode } from "@/lib/trade/types";
import { perpInput, spotInput, useOrderValidation } from "@/lib/trade/use-order-validation";
import { getValueColorClass } from "@/lib/ui/value-color";
import { useDepositModalActions, useSettingsDialogActions } from "@/stores/use-global-modal-store";
import { useMarketOrderSlippageBps, useMarketOrderSlippagePercent } from "@/stores/use-global-settings-store";
import {
	useOrderEntryActions,
	useOrderSide,
	useOrderType,
	useSlPrice,
	useTif,
	useTpPrice,
	useTpSlEnabled,
	useTriggerPrice,
} from "@/stores/use-order-entry-store";
import { useOrderQueueActions } from "@/stores/use-order-queue-store";
import { getOrderbookActionsStore, useSelectedPrice } from "@/stores/use-orderbook-actions-store";
import { TokenSelector } from "../chart/token-selector";
import { MarginModeModal } from "../tradebox/margin-mode-modal";
import { OrderToast } from "../tradebox/order-toast";
import { TpSlSection } from "../tradebox/tp-sl-section";
import { TradeFormTif } from "../tradebox/trade-form-tif";
import { TradeHeader } from "../tradebox/trade-header";
import { TradeOptionCheckboxes } from "../tradebox/trade-option-checkboxes";
import { MobileBottomNavSpacer } from "./mobile-bottom-nav";

const ORDER_TEXT = UI_TEXT.ORDER_ENTRY;
const WalletModal = createLazyComponent(() => import("../components/wallet-modal"), "WalletModal");

interface Props {
	className?: string;
	embedded?: boolean;
}

export function MobileTradeView({ className, embedded }: Props) {
	const { t } = useLingui();
	const { address, isConnected, sessionMode } = useWalletSession();
	const { data: walletClient, isLoading: isWalletLoading, error: walletClientError } = useWalletClient();
	const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

	const needsChainSwitch = !!walletClientError && walletClientError.message.includes("does not match");

	const { data: market } = useSelectedMarketInfo();
	const navigateToMarket = useMarketNavigation();

	function handleMarketChange(marketName: string, nextMarket?: UnifiedMarketInfo) {
		navigateToMarket(marketName, nextMarket);
	}

	const { isReady: isAgentApproved } = useAgentStatus();
	const { register: registerAgent, status: registerStatus } = useAgentRegistration();
	const accountModeControl = useAccountAbstractionControl();

	const canApprove = !!walletClient && !!address;
	const isRegistering =
		registerStatus === "approving_fee" || registerStatus === "approving_agent" || registerStatus === "verifying";

	const slippageBps = useMarketOrderSlippageBps();
	const slippagePercent = useMarketOrderSlippagePercent();

	const { addOrder, updateOrder } = useOrderQueueActions();
	const selectedPrice = useSelectedPrice();

	const orderType = useOrderType();
	const side = useOrderSide();
	const { setOrderType, setSide, setTpSlEnabled, setTpPrice, setSlPrice, setTriggerPrice } = useOrderEntryActions();
	const tpSlEnabled = useTpSlEnabled();
	const tpPrice = useTpPrice();
	const slPrice = useSlPrice();
	const tif = useTif();
	const triggerPrice = useTriggerPrice();
	const [sizeInput, setSizeInput] = useState("");
	const [sizeMode, setSizeMode] = useState<SizeMode>("quote");
	const [limitPriceInput, setLimitPriceInput] = useState("");
	const [reduceOnly, setReduceOnly] = useState(false);
	const [isDraggingSlider, setIsDraggingSlider] = useState(false);
	const [dragSliderValue, setDragSliderValue] = useState(0);
	const [approvalError, setApprovalError] = useState<string | null>(null);

	const canUseTpSl = canUseTpSlForOrder(orderType);

	const [walletModalOpen, setWalletModalOpen] = useState(false);
	const [showMarginDialog, setShowMarginDialog] = useState(false);
	const { open: openDepositModal } = useDepositModalActions();
	const { open: openSettingsDialog } = useSettingsDialogActions();
	const { tradeRestricted } = useGeoRestriction();

	const { mutateAsync: placeOrder, isPending: isSubmitting } = useExchange("order");

	const usesLimitPrice = usesLimitPriceForOrder(orderType);
	const usesTriggerPrice = usesTriggerPriceForOrder(orderType);
	const isMarketExecution = orderType === "market" || isTakerOrderType(orderType);
	const markPx = toNumberOrZero(market?.markPx);

	const {
		isSpotMarket,
		baseToken,
		quoteToken,
		capabilities,
		szDecimals,
		availableBalance,
		isAvailabilityLoading,
		availableBalanceToken,
		spotBalance,
		maxSize,
		sizeValue,
		orderValue,
		sideLabels,
		getSizeForPercent,
		convertSizeForModeToggle,
		leverage,
		marginMode,
		hasPosition,
		currentLeverage,
		pendingLeverage,
		maxLeverage,
		setPendingLeverage,
		resetPendingLeverage,
		applyMarginAndLeverage,
		isSwitchingMode,
		switchModeError,
	} = useOrderEntryData({ market, side, markPx, sizeMode, sizeInput });

	useEffect(() => {
		if (selectedPrice !== null) {
			setOrderType("limit");
			setLimitPriceInput(String(selectedPrice));
			getOrderbookActionsStore().actions.clearSelectedPrice();
		}
	}, [selectedPrice, setOrderType]);
	const price = isMarketExecution ? markPx : toNumberOrZero(limitPriceInput);
	const { takerRate, makerRate } = useFeeRates(market?.kind);
	const feeRate = isMarketExecution ? takerRate : makerRate;
	const feeRatePercent = `${(feeRate * 100).toFixed(4)}%`;
	const estimatedFee = orderValue * feeRate;
	const marginRequired = capabilities.isLeveraged && leverage > 0 ? orderValue / leverage : 0;

	const liquidationInfo = capabilities.isLeveraged ? getLiquidationInfo({ price, sizeValue, leverage, side }) : null;
	const liqPrice = liquidationInfo?.liqPrice ?? null;
	const liqWarning = liquidationInfo?.liqWarning ?? false;
	const liqValueClass = getLiquidationValueClass(liqPrice, liqWarning);

	const baseInput = {
		isConnected,
		isWalletLoading,
		availableBalance,
		hasMarket: !!market,
		hasAssetIndex: typeof market?.assetId === "number",
		needsAgentApproval: !isAgentApproved,
		isReadyToTrade: isAgentApproved,
		price,
		sizeValue,
		orderValue,
		side,
		usesLimitPrice,
	};

	const validation = useOrderValidation(
		isSpotMarket
			? spotInput(baseInput, {
					baseAvailable: spotBalance.baseAvailable,
					quoteAvailable: spotBalance.quoteAvailable,
					baseToken,
					quoteToken,
				})
			: perpInput(baseInput, {
					orderType,
					markPx,
					maxSize,
					usesTriggerPrice,
					triggerPriceNum: toNumber(triggerPrice),
					stopOrder: isStopOrderType(orderType),
					takeProfitOrder: isTakeProfitOrderType(orderType),
					scaleOrder: false,
					twapOrder: false,
					scaleStartPriceNum: null,
					scaleEndPriceNum: null,
					scaleLevelsNum: null,
					twapMinutesNum: null,
					tpSlEnabled,
					canUseTpSl,
					tpPriceNum: toNumber(tpPrice),
					slPriceNum: toNumber(slPrice),
				}),
	);

	function applySizeFromPercent(pct: number) {
		if (maxSize <= 0) return;
		setSizeInput(getSizeForPercent(pct));
	}

	function handleSizeModeToggle() {
		const newMode = sizeMode === "base" ? "quote" : "base";
		const convertedSize = convertSizeForModeToggle();
		setSizeMode(newMode);
		if (convertedSize) setSizeInput(convertedSize);
	}

	function handleSwitchChain() {
		switchChain({ chainId: ARBITRUM_CHAIN_ID });
	}

	async function handleApprove() {
		if (tradeRestricted) return;
		if (isRegistering) return;
		if (!isConnected || !address) {
			setWalletModalOpen(true);
			return;
		}
		setApprovalError(null);
		try {
			await registerAgent();
		} catch (error) {
			setApprovalError(error instanceof Error ? error.message : ORDER_TEXT.APPROVAL_ERROR_FALLBACK);
		}
	}

	async function handleSubmit() {
		if (tradeRestricted) return;
		if (!isConnected || !address) return;
		if (!validation.canSubmit || isSubmitting) return;
		if (!market || !baseToken || typeof market.assetId !== "number") return;

		const orderSzDecimals = market.szDecimals ?? 0;
		const plan = buildOrderPlan({
			kind: "entry",
			assetId: market.assetId,
			side,
			orderType,
			sizeValue,
			szDecimals: orderSzDecimals,
			markPx,
			price,
			slippageBps,
			reduceOnly,
			tif,
			limitPriceInput,
			triggerPriceInput: triggerPrice,
			scaleStartPriceInput: "",
			scaleEndPriceInput: "",
			scaleLevelsNum: null,
			tpSlEnabled,
			canUseTpSl,
			tpPriceNum: toNumber(tpPrice),
			slPriceNum: toNumber(slPrice),
		});

		if (plan.orders.length === 0) return;

		const orderId = addOrder({
			market: baseToken,
			side,
			size: formatSizeForOrder(sizeValue, orderSzDecimals),
			price: formatPriceForOrder(price),
			orderType: isMarketExecution ? "market" : "limit",
			status: "pending",
		});

		try {
			const result = await placeOrder({ orders: plan.orders, grouping: plan.grouping });

			const statuses = result.response?.data?.statuses ?? [];
			throwIfResponseError(statuses[0]);

			updateOrder(orderId, { status: "success", outcome: deriveOrderOutcome(statuses) });
			setSizeInput("");
			setLimitPriceInput("");
			setTpPrice("");
			setSlPrice("");
			setTriggerPrice("");
		} catch (error) {
			updateOrder(orderId, {
				status: "failed",
				error: error instanceof Error ? error.message : ORDER_TEXT.ORDER_ERROR_FALLBACK,
			});
		}
	}

	const sliderValue = isDraggingSlider ? dragSliderValue : getSliderValue(sizeValue, maxSize);

	const buttonContent = getMobileOrderButtonContent({
		isConnected,
		needsChainSwitch,
		isSwitchingChain,
		availableBalance,
		isBalanceLoading: isAvailabilityLoading,
		canDeposit: sessionMode === "wallet",
		needsApproval: validation.needsApproval,
		canSubmit: validation.canSubmit,
		isRegistering,
		canApprove,
		isSubmitting,
		side,
		sideLabel: sideLabels[side],
		onConnect: () => setWalletModalOpen(true),
		onSwitchChain: handleSwitchChain,
		onDeposit: () => openDepositModal("deposit"),
		onApprove: handleApprove,
		onSubmit: handleSubmit,
	});

	const isFormDisabled = !isConnected || availableBalance <= 0;
	const sizeModeLabel = sizeMode === "base" ? baseToken || "—" : quoteToken || "—";
	const sizePercentDisabled = isFormDisabled || maxSize <= 0;
	const entryInputSize = embedded ? "lg" : "xl";
	const inlineButtonSize = embedded ? "xs" : "sm";
	const sliderThumbSize = embedded ? "md" : "lg";

	function formatAvailableBalance(): string {
		if (!isConnected) return FALLBACK_VALUE_PLACEHOLDER;
		const decimals = isSpotMarket && side === "sell" ? szDecimals : 2;
		return formatToken(availableBalance, decimals);
	}

	const change24h = get24hChange(market?.prevDayPx, market?.markPx);
	const priceColorClass = change24h !== null ? getValueColorClass(change24h) : "text-fg";

	return (
		<div className={cn("flex flex-col min-h-0 self-stretch", !embedded && "h-full bg-background", className)}>
			<MarginModeModal
				open={showMarginDialog}
				onOpenChange={(open) => {
					if (!open) resetPendingLeverage();
					setShowMarginDialog(open);
				}}
				currentMode={marginMode}
				currentLeverage={currentLeverage}
				pendingLeverage={pendingLeverage}
				maxLeverage={maxLeverage}
				onPendingLeverageChange={setPendingLeverage}
				hasPosition={hasPosition}
				isOnlyIsolated={capabilities.isOnlyIsolated}
				isUpdating={isSwitchingMode}
				updateError={switchModeError}
				showLeverage={capabilities.isLeveraged}
				onApply={async (mode: MarginMode, lev: number) => applyMarginAndLeverage(mode, lev)}
			/>
			<div className={cn("shrink-0 border-b border-stroke-weak/60 bg-surface px-4 py-2", embedded && "hidden")}>
				<div className="flex min-w-0 items-center justify-between gap-2">
					<TokenSelector selectedMarket={market} onValueChange={handleMarketChange} />
					<div className="shrink-0 text-right">
						<div className={cn("whitespace-nowrap text-sm font-semibold tabular-nums", priceColorClass)}>
							{formatPrice(markPx || null, { szDecimals: market?.szDecimals })}
						</div>
						{typeof change24h === "number" && (
							<div className={cn("whitespace-nowrap text-xs tabular-nums", getValueColorClass(change24h))}>
								{change24h >= 0 ? "+" : ""}
								{change24h.toFixed(2)}%
							</div>
						)}
					</div>
				</div>
			</div>
			<div
				className={cn(
					"flex-1 min-h-0 flex flex-col [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
					embedded ? "overflow-y-auto overscroll-y-contain" : "overflow-y-auto overscroll-contain",
				)}
			>
				<div
					className={cn(
						embedded ? "flex-1 min-h-min flex flex-col justify-between px-2 py-1.5 space-y-1.5" : "px-3 py-4 space-y-4",
					)}
				>
					<TradeHeader
						orderType={orderType}
						side={side}
						sideLabels={sideLabels}
						marketKind={market?.kind}
						onOrderTypeChange={setOrderType}
						onSideChange={setSide}
						marginMode={marginMode}
						leverage={leverage}
						onMarginLeverageClick={() => setShowMarginDialog(true)}
						isLeveraged={capabilities.isLeveraged}
						accountMode={accountModeControl.accountAbstraction}
						isAccountModeUpdating={accountModeControl.isUpdating}
						hideAlgoOrders
						compact={embedded}
						layout="mobile"
					/>

					<div className={cn("flex items-center justify-end", embedded ? "text-2xs" : "text-xs")}>
						<span className="text-fg-muted uppercase text-2xs font-medium">{ORDER_TEXT.AVAILABLE_LABEL} </span>
						<span className={cn("tabular-nums font-semibold text-xs ml-1", getValueColorClass(availableBalance))}>
							{formatAvailableBalance()}
						</span>
						<span className="ml-1 text-2xs tabular-nums text-fg-muted">{availableBalanceToken}</span>
					</div>

					<div className={cn(embedded ? "space-y-1.5" : "space-y-3")}>
						<p className="text-2xs font-medium uppercase text-fg-muted">{ORDER_TEXT.SIZE_LABEL}</p>
						<div className={cn("flex items-stretch", embedded ? "gap-1.5" : "gap-2")}>
							<NumberInput
								inputMode="decimal"
								inputSize={entryInputSize}
								placeholder="0.00"
								value={sizeInput}
								onChange={(e: ChangeEvent<HTMLInputElement>) => setSizeInput(e.target.value)}
								className="flex-1 tabular-nums font-semibold"
								disabled={isFormDisabled}
							/>
							{isFormDisabled ? (
								<span
									data-disabled
									className={cn(
										buttonVariants({ variant: "outline", intent: "neutral", size: inlineButtonSize }),
										"shrink-0 self-stretch pointer-events-none",
									)}
								>
									{sizeModeLabel}
									<CaretDownIcon className="size-3.5" />
								</span>
							) : (
								<Button
									variant="outline"
									intent="neutral"
									size={inlineButtonSize}
									onClick={handleSizeModeToggle}
									iconRight={<CaretDownIcon className="size-3.5" />}
									className="shrink-0 self-stretch"
								>
									{sizeModeLabel}
								</Button>
							)}
						</div>
						<div className={cn(embedded ? "space-y-1.5" : "space-y-2")}>
							<Slider
								thumbSize={sliderThumbSize}
								value={sliderValue}
								onValueChange={(val) => {
									if (typeof val !== "number") return;
									setIsDraggingSlider(true);
									setDragSliderValue(val);
								}}
								onValueCommitted={(val) => {
									if (typeof val !== "number") return;
									setIsDraggingSlider(false);
									applySizeFromPercent(val);
								}}
								max={100}
								step={0.1}
								disabled={isFormDisabled || maxSize <= 0}
							/>
							<div className="flex items-center justify-between text-2xs text-fg-muted tabular-nums leading-none">
								{SIZE_PERCENT_OPTIONS.map((pct) =>
									sizePercentDisabled ? (
										<span key={pct}>{pct}%</span>
									) : (
										<button
											key={pct}
											type="button"
											onClick={() => applySizeFromPercent(pct)}
											className="hover:text-fg transition-colors disabled:cursor-not-allowed"
										>
											{pct}%
										</button>
									),
								)}
							</div>
						</div>
					</div>

					{usesTriggerPrice && (
						<PriceInput
							label={t`Trigger Price`}
							inputMode="decimal"
							inputSize={entryInputSize}
							placeholder="0.00"
							value={triggerPrice}
							onChange={(e: ChangeEvent<HTMLInputElement>) => setTriggerPrice(e.target.value)}
							onMidClick={setTriggerPrice}
							midPrice={markPx}
							szDecimals={market?.szDecimals}
							className="tabular-nums font-semibold"
							disabled={isFormDisabled}
						/>
					)}

					{usesLimitPrice && (
						<div className={cn(embedded ? "space-y-1.5" : "space-y-2")}>
							<PriceInput
								label={ORDER_TEXT.LIMIT_PRICE_LABEL}
								inputMode="decimal"
								inputSize={entryInputSize}
								placeholder="0.00"
								value={limitPriceInput}
								onChange={(e: ChangeEvent<HTMLInputElement>) => setLimitPriceInput(e.target.value)}
								onMidClick={setLimitPriceInput}
								midPrice={markPx}
								szDecimals={market?.szDecimals}
								className="tabular-nums font-semibold"
								disabled={isFormDisabled}
							/>
							<div className="flex">
								<TradeFormTif orderType={orderType} disabled={isFormDisabled} />
							</div>
						</div>
					)}

					{(capabilities.hasReduceOnly || (capabilities.hasTpSl && canUseTpSl)) && (
						<TradeOptionCheckboxes
							className={cn("flex items-center", embedded ? "gap-2 text-2xs" : "gap-4")}
							reduceOnly={
								capabilities.hasReduceOnly
									? { checked: reduceOnly, disabled: isFormDisabled, onCheckedChange: setReduceOnly }
									: undefined
							}
							tpSl={
								capabilities.hasTpSl && canUseTpSl
									? { checked: tpSlEnabled, disabled: isFormDisabled, onCheckedChange: setTpSlEnabled }
									: undefined
							}
						/>
					)}

					{tpSlEnabled && canUseTpSl && (
						<TpSlSection
							compact
							side={side}
							referencePrice={markPx}
							size={sizeValue}
							szDecimals={szDecimals}
							tpPrice={tpPrice}
							slPrice={slPrice}
							onTpPriceChange={setTpPrice}
							onSlPriceChange={setSlPrice}
							disabled={isFormDisabled}
						/>
					)}

					<div className={cn("divide-y divide-stroke-weak/40", embedded ? "text-2xs" : "text-xs")}>
						{capabilities.isLeveraged && (
							<SummaryRow
								label={ORDER_TEXT.SUMMARY_LIQ}
								value={
									liqPrice ? formatPrice(liqPrice, { szDecimals: market?.szDecimals }) : FALLBACK_VALUE_PLACEHOLDER
								}
								valueClass={liqValueClass}
								compact={embedded}
							/>
						)}
						<SummaryRow
							label={ORDER_TEXT.SUMMARY_ORDER_VALUE}
							value={orderValue > 0 ? formatUSD(orderValue) : FALLBACK_VALUE_PLACEHOLDER}
							compact={embedded}
						/>
						{capabilities.isLeveraged && (
							<SummaryRow
								label={ORDER_TEXT.SUMMARY_MARGIN_REQ}
								value={marginRequired > 0 ? formatUSD(marginRequired) : FALLBACK_VALUE_PLACEHOLDER}
								compact={embedded}
							/>
						)}
						<div className={cn("flex min-w-0 items-center justify-between", embedded ? "gap-1 py-1" : "gap-2 py-2.5")}>
							<span className="min-w-0 truncate text-fg-muted">{ORDER_TEXT.SUMMARY_SLIPPAGE}</span>
							{embedded && !isConnected ? (
								<span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
									<span className="tabular-nums text-error">{slippagePercent}%</span>
									<PencilIcon className="size-2.5 text-fg-muted" />
								</span>
							) : (
								<button
									type="button"
									onClick={openSettingsDialog}
									className="inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap hover:opacity-80"
								>
									<span className="tabular-nums text-error">{slippagePercent}%</span>
									<PencilIcon className="size-2.5 text-fg-muted" />
								</button>
							)}
						</div>
						<SummaryRow
							label={ORDER_TEXT.SUMMARY_FEE}
							value={orderValue > 0 ? `${feeRatePercent} (${formatUSD(estimatedFee)})` : feeRatePercent}
							valueClass="text-fg-muted"
							compact={embedded}
						/>
					</div>
				</div>
			</div>

			<div
				className={cn("shrink-0 border-t border-stroke-weak/40 bg-background", embedded ? "px-2 py-2" : "px-3 py-3")}
			>
				{validation.errors.length > 0 && isConnected && availableBalance > 0 && !validation.needsApproval && (
					<p className="text-xs text-error mb-2">{validation.errors.join(" \u2022 ")}</p>
				)}
				{approvalError && <p className="text-xs text-error mb-2">{approvalError}</p>}
				{tradeRestricted ? (
					<Button variant="outline" size={embedded ? "md" : "lg"} intent="neutral" disabled className="w-full">
						{t`Trading is not available in your region`}
					</Button>
				) : (
					<Button
						variant="outline"
						size={embedded ? "md" : "lg"}
						onClick={buttonContent.action}
						disabled={buttonContent.disabled}
						intent={buttonContent.variant === "cyan" ? "brand" : buttonContent.variant === "buy" ? "neutral" : "error"}
						className={cn(
							"w-full",
							buttonContent.variant === "cyan"
								? "bg-brand-soft border-stroke-brand-strong text-brand hover:bg-brand-soft/30"
								: buttonContent.variant === "buy"
									? "bg-success-soft border-stroke-success-strong text-success hover:bg-success-soft/30"
									: "bg-error-soft border-stroke-error-strong text-error hover:bg-error-soft/30",
						)}
						iconLeft={isSubmitting || isRegistering ? <SpinnerGapIcon className="size-5 animate-spin" /> : undefined}
					>
						{buttonContent.text}
					</Button>
				)}
				{!embedded && <MobileBottomNavSpacer />}
			</div>

			{walletModalOpen && (
				<Suspense fallback={null}>
					<WalletModal open onOpenChange={setWalletModalOpen} />
				</Suspense>
			)}
			<OrderToast />
		</div>
	);
}

function SummaryRow({
	label,
	value,
	valueClass,
	compact,
}: {
	label: string;
	value: string;
	valueClass?: string;
	compact?: boolean;
}) {
	return (
		<div className={cn("flex min-w-0 items-center justify-between", compact ? "gap-1 py-1" : "gap-2 py-1.5")}>
			<span className="min-w-0 truncate text-fg-muted">{label}</span>
			<span className={cn("shrink-0 whitespace-nowrap text-right tabular-nums", valueClass ?? "text-fg")}>{value}</span>
		</div>
	);
}

function getLiquidationValueClass(liqPrice: number | null, liqWarning: boolean) {
	if (!liqPrice) return "text-fg-muted";
	if (liqWarning) return "text-error";
	return "text-fg";
}

interface MobileButtonContentInput {
	isConnected: boolean;
	needsChainSwitch: boolean;
	isSwitchingChain: boolean;
	availableBalance: number;
	isBalanceLoading: boolean;
	canDeposit: boolean;
	needsApproval: boolean;
	canSubmit: boolean;
	isRegistering: boolean;
	canApprove: boolean;
	isSubmitting: boolean;
	side: Side;
	sideLabel: string;
	onConnect: () => void;
	onSwitchChain: () => void;
	onDeposit: () => void;
	onApprove: () => void;
	onSubmit: () => void;
}

function getMobileOrderButtonContent(input: MobileButtonContentInput): ButtonContent {
	if (!input.isConnected) {
		return {
			text: ORDER_TEXT.BUTTON_CONNECT,
			action: input.onConnect,
			disabled: false,
			variant: "cyan",
		};
	}
	if (input.needsChainSwitch) {
		return {
			text: input.isSwitchingChain ? ORDER_TEXT.BUTTON_SWITCHING : ORDER_TEXT.BUTTON_SWITCH_CHAIN,
			action: input.onSwitchChain,
			disabled: input.isSwitchingChain,
			variant: "cyan",
		};
	}
	if (input.isBalanceLoading) {
		return {
			text: ORDER_TEXT.BUTTON_LOADING,
			action: () => {},
			disabled: true,
			variant: "cyan",
		};
	}
	if (input.availableBalance <= 0) {
		return {
			text: ORDER_TEXT.BUTTON_DEPOSIT,
			action: input.canDeposit ? input.onDeposit : () => {},
			disabled: !input.canDeposit,
			variant: "cyan",
		};
	}
	if (input.needsApproval) {
		return {
			text: getApprovalButtonText(input.isRegistering, input.canApprove),
			action: input.onApprove,
			disabled: input.isRegistering || !input.canApprove,
			variant: "cyan",
		};
	}
	return {
		text: input.sideLabel,
		action: input.onSubmit,
		disabled: !input.canSubmit || input.isSubmitting,
		variant: input.side,
	};
}

function getApprovalButtonText(isRegistering: boolean, canApprove: boolean): string {
	if (isRegistering) return ORDER_TEXT.BUTTON_SIGNING;
	if (!canApprove) return ORDER_TEXT.BUTTON_LOADING;
	return ORDER_TEXT.BUTTON_ENABLE_TRADING;
}
