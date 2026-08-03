import { Button, buttonVariants, Tooltip } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { CaretDownIcon, PencilIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { type ChangeEvent, Suspense, useEffect, useState } from "react";
import { useSwitchChain, useWalletClient } from "wagmi";
import { NumberInput } from "@/components/ui/number-input";
import { PriceInput } from "@/components/ui/price-input";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { ARBITRUM_CHAIN_ID } from "@/config/contracts";
import { DEFAULT_BUILDER_CONFIG } from "@/config/hyperliquid";
import { SIZE_PERCENT_OPTIONS } from "@/config/trade";
import { get24hChange, getPositionDex } from "@/domain/market";
import { getLiquidationInfo } from "@/domain/trade/order/metrics";
import { getSizeInputMaxDecimals, getSliderValue } from "@/domain/trade/order/size";
import { getOrderActionStage } from "@/domain/trade/order-action-stage";
import { buildOrderPlan } from "@/domain/trade/order-intent";
import { isOrderBatchResolutionError } from "@/domain/trade/order-tracking";
import { formatPriceForOrder, formatSizeForOrder } from "@/domain/trade/orders";
import { useAccountAbstractionControl } from "@/hooks/trade/use-account-abstraction-control";
import { useMarketFeeRates } from "@/hooks/trade/use-fee-rates";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useOrderEntryData } from "@/hooks/trade/use-order-entry-data";
import { useTrackedOrder } from "@/hooks/trade/use-tracked-order";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { bpsToPercentage, formatPrice, formatToken, formatUSD } from "@/lib/format";
import {
	type UnifiedMarketInfo,
	useAgentStatus,
	useSelectedMarketInfo,
	useTradingAuthorization,
	useUserPositions,
} from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import { deriveOrderOutcome, extractStatusErrors } from "@/lib/trade/extract-order-status";
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
import {
	useDepositModalActions,
	useEstablishConnectionModalActions,
	useSettingsDialogActions,
} from "@/stores/use-global-modal-store";
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
import { TradeSizeSlider } from "../components/trade-size-slider";
import { MarginModeModal } from "../tradebox/margin-mode-modal";
import { TpSlSection } from "../tradebox/tp-sl-section";
import { TradeFormTif } from "../tradebox/trade-form-tif";
import { TradeHeader } from "../tradebox/trade-header";
import { TradeOptionCheckboxes } from "../tradebox/trade-option-checkboxes";
import { MobileBottomNavSpacer } from "./mobile-bottom-nav";

const WalletModal = createLazyComponent(() => import("../components/wallet-modal"), "WalletModal");

interface Props {
	className?: string;
	embedded?: boolean;
	sizeMode: SizeMode;
	onSizeModeChange: (sizeMode: SizeMode) => void;
}

export function MobileTradeView({ className, embedded, sizeMode, onSizeModeChange }: Props) {
	const { t } = useLingui();
	const { address, isConnected, sessionMode } = useWalletSession();
	const { data: walletClient, isLoading: isWalletLoading, error: walletClientError } = useWalletClient();
	const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

	const needsChainSwitch = !!walletClientError && walletClientError.message.includes("does not match");

	const { data: market } = useSelectedMarketInfo();
	const userPositions = useUserPositions();
	const navigateToMarket = useMarketNavigation();

	function handleMarketChange(marketName: string, nextMarket?: UnifiedMarketInfo) {
		navigateToMarket(marketName, nextMarket);
	}

	const { isReady: isTradingAuthorized, isAgentReady, isAgentLoading, isBuilderFeeLoading } = useAgentStatus();
	const { authorize, status: registerStatus } = useTradingAuthorization();
	const accountModeControl = useAccountAbstractionControl();

	const canApprove = !!walletClient && !!address;
	const isRegistering =
		registerStatus === "approving_fee" || registerStatus === "approving_agent" || registerStatus === "verifying";
	const isApprovalLoading = isAgentReady ? isBuilderFeeLoading : isAgentLoading;

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
	const [limitPriceInput, setLimitPriceInput] = useState("");
	const [reduceOnly, setReduceOnly] = useState(false);
	const [approvalError, setApprovalError] = useState<string | null>(null);

	const canUseTpSl = canUseTpSlForOrder(orderType);

	const [walletModalOpen, setWalletModalOpen] = useState(false);
	const [showMarginDialog, setShowMarginDialog] = useState(false);
	const { open: openDepositModal } = useDepositModalActions();
	const { open: openEstablishConnectionModal } = useEstablishConnectionModalActions();
	const { open: openSettingsDialog } = useSettingsDialogActions();
	const { tradeRestricted } = useGeoRestriction();

	const { submitOrder, isPending: isSubmitting } = useTrackedOrder();

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
		isAvailabilityBlocked,
		isAvailabilityStale,
		hasAvailabilityError,
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
	const position = market?.name ? userPositions.getPosition(market.name, getPositionDex(market)) : null;
	const positionSize = toNumberOrZero(position?.szi);
	const validatedPositionSize = userPositions.isLoading || userPositions.hasError ? null : positionSize;
	const { takerRate, makerRate } = useMarketFeeRates(market);
	const feeRate = isMarketExecution ? takerRate : makerRate;
	const feeRatePercent = `${(feeRate * 100).toFixed(4)}%`;
	const estimatedFee = orderValue * feeRate;
	const marginRequired = capabilities.isLeveraged && leverage > 0 ? orderValue / leverage : 0;

	const liquidationInfo = capabilities.isLeveraged ? getLiquidationInfo({ price, sizeValue, leverage, side }) : null;
	const liqPrice = liquidationInfo?.liqPrice ?? null;
	const liqWarning = liquidationInfo?.liqWarning ?? false;
	const liqValueClass = getLiquidationValueClass(liqPrice, liqWarning);

	const baseInput = {
		assetId: typeof market?.assetId === "number" ? market.assetId : null,
		szDecimals: market?.szDecimals ?? 0,
		isConnected,
		isWalletLoading,
		availableBalance,
		hasMarket: !!market,
		hasAssetIndex: typeof market?.assetId === "number",
		needsAgentApproval: !isTradingAuthorized,
		isReadyToTrade: isTradingAuthorized,
		price,
		sizeValue,
		orderValue,
		side,
		usesLimitPrice,
		usesTriggerPrice,
		triggerPriceNum: toNumber(triggerPrice),
		scaleOrder: false,
		twapOrder: false,
		scaleStartPriceNum: null,
		scaleEndPriceNum: null,
		scaleLevelsNum: null,
		twapMinutesNum: null,
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
					stopOrder: isStopOrderType(orderType),
					takeProfitOrder: isTakeProfitOrderType(orderType),
					positionSize: validatedPositionSize,
					tpSlEnabled,
					canUseTpSl,
					tpPriceNum: toNumber(tpPrice),
					slPriceNum: toNumber(slPrice),
				}),
	);
	const riskContext = isSpotMarket ? ({ marketKind: "spot" } as const) : ({ marketKind: "perp", marginMode } as const);

	function applySizeFromPercent(pct: number) {
		if (maxSize <= 0) return;
		setSizeInput(getSizeForPercent(pct));
	}

	function handleSizeModeToggle() {
		const newMode = sizeMode === "base" ? "quote" : "base";
		const convertedSize = convertSizeForModeToggle();
		onSizeModeChange(newMode);
		if (convertedSize) setSizeInput(convertedSize);
	}

	function handleSizeInputChange(event: ChangeEvent<HTMLInputElement>) {
		setSizeInput(event.target.value);
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
		if (!isAgentReady) {
			openEstablishConnectionModal();
			return;
		}
		try {
			await authorize();
		} catch (error) {
			setApprovalError(error instanceof Error ? error.message : t`Failed to enable trading`);
		}
	}

	async function handleSubmit() {
		if (tradeRestricted) return;
		if (!isConnected || !address) return;
		if (isAvailabilityBlocked) return;
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

		const entryOrder = plan.orders[0];
		if (!entryOrder) return;

		const orderId = addOrder({
			market: baseToken,
			side,
			size: String(entryOrder.s),
			price: formatPriceForOrder(price, { assetId: market.assetId, szDecimals: orderSzDecimals }),
			orderType: isMarketExecution ? "market" : "limit",
			status: "pending",
		});

		try {
			const submission = await submitOrder(
				{ orders: plan.orders, grouping: plan.grouping },
				{ queueId: orderId, riskContext },
			);
			if (submission.state === "blocked") {
				updateOrder(orderId, {
					status: "failed",
					error: t`Another order for this market is still being confirmed.`,
				});
				return;
			}
			if (submission.state === "reconciling") {
				setSizeInput("");
				setLimitPriceInput("");
				setTpPrice("");
				setSlPrice("");
				setTriggerPrice("");
				return;
			}

			const statuses = submission.result.response?.data?.statuses ?? [];
			const errors = extractStatusErrors(statuses);
			if (errors.length > 0) {
				updateOrder(orderId, { status: "failed", error: errors.join("; ") });
				return;
			}

			updateOrder(orderId, { status: "success", outcome: deriveOrderOutcome(statuses) });
			setSizeInput("");
			setLimitPriceInput("");
			setTpPrice("");
			setSlPrice("");
			setTriggerPrice("");
		} catch (error) {
			if (isOrderBatchResolutionError(error)) {
				const { resolution } = error;
				if (resolution.status === "partial") {
					updateOrder(orderId, {
						status: "partial",
						acceptedCount: resolution.acceptedCount,
						totalCount: resolution.totalCount,
						error: resolution.errors.join("; ") || undefined,
					});
					setSizeInput("");
					setLimitPriceInput("");
					setTpPrice("");
					setSlPrice("");
					setTriggerPrice("");
					return;
				}
			}
			updateOrder(orderId, {
				status: "failed",
				error: error instanceof Error ? error.message : t`Order failed`,
			});
		}
	}

	const sliderValue = getSliderValue(sizeValue, maxSize);

	const buttonContent = getMobileOrderButtonContent({
		isConnected,
		needsChainSwitch,
		isSwitchingChain,
		availableBalance,
		isBalanceLoading: isAvailabilityLoading,
		hasBalanceError: hasAvailabilityError,
		canDeposit: sessionMode === "wallet",
		needsApproval: validation.needsApproval,
		isAgentReady,
		isApprovalLoading,
		canSubmit: validation.canSubmit,
		isRegistering,
		canApprove,
		isSubmitting,
		side,
		sideLabel: sideLabels[side],
		labels: {
			connect: t`Connect Wallet`,
			switching: t`Switching...`,
			switchChain: t`Switch to Arbitrum`,
			loading: t`Loading...`,
			balanceError: t`Failed to load balances.`,
			deposit: t`Deposit`,
			signing: t`Signing...`,
			enableTrading: t`Enable Trading`,
		},
		onConnect: () => setWalletModalOpen(true),
		onSwitchChain: handleSwitchChain,
		onDeposit: () => openDepositModal("deposit"),
		onApprove: handleApprove,
		onSubmit: handleSubmit,
	});

	const isFormDisabled = !isConnected || isAvailabilityBlocked || availableBalance <= 0;
	const sizeModeLabel = sizeMode === "base" ? baseToken || "—" : quoteToken || "—";
	const sizePercentDisabled = isFormDisabled || maxSize <= 0;
	const entryInputSize = embedded ? "lg" : "xl";
	const inlineButtonSize = embedded ? "xs" : "sm";
	const sliderThumbSize = embedded ? "md" : "lg";

	function formatAvailableBalance(): string {
		if (!isConnected || isAvailabilityLoading || hasAvailabilityError) return FALLBACK_VALUE_PLACEHOLDER;
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
					<div className="min-w-0 text-right">
						<div className={cn("truncate whitespace-nowrap text-sm font-semibold tabular-nums", priceColorClass)}>
							{formatPrice(markPx || null, {
								szDecimals: market?.szDecimals,
								marketType: market?.kind === "spot" ? "spot" : "perp",
							})}
						</div>
						{typeof change24h === "number" && (
							<div className={cn("truncate whitespace-nowrap text-xs tabular-nums", getValueColorClass(change24h))}>
								{change24h >= 0 ? "+" : ""}
								{change24h.toFixed(2)}%
							</div>
						)}
					</div>
				</div>
			</div>
			<div
				className={cn(
					"flex-1 min-h-0 flex flex-col overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
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
						<span className="text-fg-muted uppercase text-2xs font-medium">{t`Available`} </span>
						<span className={cn("tabular-nums font-semibold text-xs ml-1", getValueColorClass(availableBalance))}>
							{formatAvailableBalance()}
						</span>
						<span className="ml-1 text-2xs tabular-nums text-fg-muted">{availableBalanceToken}</span>
						{isAvailabilityStale ? (
							<Tooltip content={t`Loading...`} side="top">
								<SpinnerGapIcon className="ml-1 size-3 shrink-0 animate-spin text-warning" aria-label={t`Loading...`} />
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
					</div>

					<div className={cn(embedded ? "space-y-1.5" : "space-y-3")}>
						<div className="flex min-w-0 items-baseline justify-between gap-2">
							<p className="text-2xs font-medium uppercase text-fg-muted">{t`Size`}</p>
							{sizeValue > 0 && baseToken ? (
								<span className="shrink-0 whitespace-nowrap text-2xs tabular-nums text-fg">
									{formatSizeForOrder(sizeValue, szDecimals)} {baseToken}
								</span>
							) : null}
						</div>
						<div className={cn("flex items-stretch", embedded ? "gap-1.5" : "gap-2")}>
							<NumberInput
								inputMode="decimal"
								inputSize={entryInputSize}
								mobileSafe
								placeholder="0.00"
								value={sizeInput}
								onChange={handleSizeInputChange}
								maxAllowedDecimals={getSizeInputMaxDecimals(sizeMode, szDecimals)}
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
							<TradeSizeSlider
								thumbSize={sliderThumbSize}
								value={sliderValue}
								onPercentChange={applySizeFromPercent}
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
							mobileSafe
							placeholder="0.00"
							value={triggerPrice}
							onChange={(e: ChangeEvent<HTMLInputElement>) => setTriggerPrice(e.target.value)}
							onMidClick={setTriggerPrice}
							midPrice={markPx}
							szDecimals={market?.szDecimals}
							marketType={market?.kind === "spot" ? "spot" : "perp"}
							className="tabular-nums font-semibold"
							disabled={isFormDisabled}
						/>
					)}

					{usesLimitPrice && (
						<div className={cn(embedded ? "space-y-1.5" : "space-y-2")}>
							<PriceInput
								label={t`Limit Price`}
								inputMode="decimal"
								inputSize={entryInputSize}
								mobileSafe
								placeholder="0.00"
								value={limitPriceInput}
								onChange={(e: ChangeEvent<HTMLInputElement>) => setLimitPriceInput(e.target.value)}
								onMidClick={setLimitPriceInput}
								midPrice={markPx}
								szDecimals={market?.szDecimals}
								marketType={market?.kind === "spot" ? "spot" : "perp"}
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
								label={t`Liq. Price`}
								value={
									liqPrice ? formatPrice(liqPrice, { szDecimals: market?.szDecimals }) : FALLBACK_VALUE_PLACEHOLDER
								}
								valueClass={liqValueClass}
								compact={embedded}
							/>
						)}
						<SummaryRow
							label={t`Order Value`}
							value={orderValue > 0 ? formatUSD(orderValue, { compact: false }) : FALLBACK_VALUE_PLACEHOLDER}
							compact={embedded}
						/>
						{capabilities.isLeveraged && (
							<SummaryRow
								label={t`Margin Req.`}
								value={marginRequired > 0 ? formatUSD(marginRequired, { compact: false }) : FALLBACK_VALUE_PLACEHOLDER}
								compact={embedded}
							/>
						)}
						<div className={cn("flex min-w-0 items-center justify-between", embedded ? "gap-1 py-1" : "gap-2 py-2.5")}>
							<span className="min-w-0 truncate text-fg-muted">{t`Slippage`}</span>
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
							label={t`Est. Fee`}
							value={orderValue > 0 ? `${feeRatePercent} (${formatUSD(estimatedFee)})` : feeRatePercent}
							valueClass="text-fg-muted"
							compact={embedded}
						/>
						{DEFAULT_BUILDER_CONFIG?.f ? (
							<SummaryRow
								label={t`Builder Fee`}
								value={`${bpsToPercentage(DEFAULT_BUILDER_CONFIG.f)}%`}
								valueClass="text-fg-muted"
								compact={embedded}
							/>
						) : null}
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
	hasBalanceError: boolean;
	canDeposit: boolean;
	needsApproval: boolean;
	isAgentReady: boolean;
	isApprovalLoading: boolean;
	canSubmit: boolean;
	isRegistering: boolean;
	canApprove: boolean;
	isSubmitting: boolean;
	side: Side;
	sideLabel: string;
	labels: MobileOrderButtonLabels;
	onConnect: () => void;
	onSwitchChain: () => void;
	onDeposit: () => void;
	onApprove: () => void;
	onSubmit: () => void;
}

interface MobileOrderButtonLabels {
	connect: string;
	switching: string;
	switchChain: string;
	loading: string;
	balanceError: string;
	deposit: string;
	signing: string;
	enableTrading: string;
}

function getMobileOrderButtonContent(input: MobileButtonContentInput): ButtonContent {
	const stage = getOrderActionStage({
		isConnected: input.isConnected,
		needsChainSwitch: input.needsChainSwitch,
		needsApproval: input.needsApproval,
		isAgentReady: input.isAgentReady,
		hasBalanceError: input.hasBalanceError,
		isBalanceLoading: input.isBalanceLoading,
		availableBalance: input.availableBalance,
	});

	if (stage === "connect") {
		return {
			text: input.labels.connect,
			action: input.onConnect,
			disabled: false,
			variant: "cyan",
		};
	}
	if (stage === "switchChain") {
		return {
			text: input.isSwitchingChain ? input.labels.switching : input.labels.switchChain,
			action: input.onSwitchChain,
			disabled: input.isSwitchingChain,
			variant: "cyan",
		};
	}
	if (stage === "agent" || stage === "builder") {
		return {
			text: getApprovalButtonText(input.isRegistering, input.canApprove, input.isApprovalLoading, input.labels),
			action: input.onApprove,
			disabled: input.isRegistering || input.isApprovalLoading || !input.canApprove,
			variant: "cyan",
		};
	}
	if (stage === "balanceError") {
		return {
			text: input.labels.balanceError,
			action: () => {},
			disabled: true,
			variant: "cyan",
		};
	}
	if (stage === "balanceLoading") {
		return {
			text: input.labels.loading,
			action: () => {},
			disabled: true,
			variant: "cyan",
		};
	}
	if (stage === "deposit") {
		return {
			text: input.labels.deposit,
			action: input.canDeposit ? input.onDeposit : () => {},
			disabled: !input.canDeposit,
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

function getApprovalButtonText(
	isRegistering: boolean,
	canApprove: boolean,
	isApprovalLoading: boolean,
	labels: MobileOrderButtonLabels,
): string {
	if (isRegistering) return labels.signing;
	if (isApprovalLoading || !canApprove) return labels.loading;
	return labels.enableTrading;
}
