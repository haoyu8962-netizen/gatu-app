import { Button } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSwitchChain, useWalletClient } from "wagmi";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { APPROVAL_ERROR_DISMISS_MS } from "@/config/time";
import { getPositionDex } from "@/domain/market";
import { getBuilderPerpSwapTargetToken } from "@/domain/trade/collateral-acquisition";
import { isLiveMarkPriceReady } from "@/domain/trade/market-price";
import {
	assertEntryOrderExecutionAllowed,
	assertEntryTwapExecutionAllowed,
	type EntryOrderExecutionState,
} from "@/domain/trade/order/entry-execution-guard";
import { getLiquidationInfo, getOrderMetrics } from "@/domain/trade/order/metrics";
import { getOrderPrice } from "@/domain/trade/order/price";
import {
	type SelectableAccountAbstraction,
	useAccountAbstractionControl,
} from "@/hooks/trade/use-account-abstraction-control";
import { useMarketFeeRates } from "@/hooks/trade/use-fee-rates";
import { useOrderEntryData } from "@/hooks/trade/use-order-entry-data";
import { useOrderSubmit } from "@/hooks/trade/use-order-submit";
import { useLingeringText } from "@/hooks/ui/use-lingering-text";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import {
	useAgentStatus,
	useMarketsInfo,
	useSelectedMarketInfo,
	useTradingAuthorization,
	useUserPositions,
} from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import type { MarginMode } from "@/lib/trade/margin-mode";
import { toNumber, toNumberOrZero } from "@/lib/trade/numbers";
import {
	canUseTpSl as canUseTpSlForOrder,
	isScaleOrderType,
	isStopOrderType,
	isTakeProfitOrderType,
	isTakerOrderType,
	isTriggerOrderType,
	isTwapOrderType,
	usesLimitPrice as usesLimitPriceForOrder,
} from "@/lib/trade/order-types";
import type { ActiveModal } from "@/lib/trade/types";
import { useButtonContent } from "@/lib/trade/use-button-content";
import { perpInput, spotInput, useOrderValidation } from "@/lib/trade/use-order-validation";
import { getTradingCtaClass, getTradingCtaIntent } from "@/lib/ui/trading-cta";
import {
	useDepositModalActions,
	useEstablishConnectionModalActions,
	useSettingsDialogActions,
	useSwapModalActions,
} from "@/stores/use-global-modal-store";
import { useMarketOrderSlippageBps, useMarketOrderSlippagePercent } from "@/stores/use-global-settings-store";
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
import {
	getOrderbookActionsStore,
	getSelectedPriceForMarket,
	useSelectedPrice,
} from "@/stores/use-orderbook-actions-store";
import { AccountModeModal } from "./account-mode-modal";
import { LeverageModal } from "./leverage-modal";
import { MarginModeModal } from "./margin-mode-modal";
import { OrderSummary } from "./order-summary";
import { ScaleOrderSummary } from "./scale-order-summary";
import { TradeFormFields } from "./trade-form-fields";
import { TradeHeader } from "./trade-header";
import { TwapOrderSummary } from "./twap-order-summary";

const WalletModal = createLazyComponent(() => import("../components/wallet-modal"), "WalletModal");

const ERROR_LINGER_MS = 1500;

export function TradePanel() {
	const { t } = useLingui();
	const { address, isConnected, sessionMode } = useWalletSession();
	const { data: walletClient, isLoading: isWalletLoading, error: walletClientError } = useWalletClient();
	const switchChain = useSwitchChain();
	const needsChainSwitch = !!walletClientError && walletClientError.message.includes("does not match");

	const { data: market } = useSelectedMarketInfo();
	const { spotMarkets, isLoading: isMarketCatalogLoading, error: marketCatalogError } = useMarketsInfo();

	const userPositions = useUserPositions();

	const { isReady: isTradingAuthorized, isAgentReady, isAgentLoading, isBuilderFeeLoading } = useAgentStatus();
	const { authorize, status: registerStatus } = useTradingAuthorization();
	const { tradeRestricted } = useGeoRestriction();

	const slippageBps = useMarketOrderSlippageBps();
	const slippagePercent = useMarketOrderSlippagePercent();
	const side = useOrderSide();
	const markPx = toNumberOrZero(market?.markPx);
	const executionReferencePx = toNumber(market?.midPx) ?? markPx;
	const markPriceStatus = market?.markPriceStatus ?? "loading";
	const sizeMode = useSizeMode();
	const sizeInput = useOrderSize();

	const {
		accountAbstraction,
		availabilityStatus,
		availabilityReceivedAt,
		availabilityMaxAgeMs,
		executionAvailability,
		isSpotMarket,
		baseToken,
		quoteToken,
		spotBalance,
		capabilities,
		availableBalance,
		isAvailabilityBlocked,
		isAvailabilityLoading,
		hasAvailabilityError,
		maxSize,
		sizeValue,
		orderValue,
		sideLabels,
		getSizeForPercent,
		convertSizeForModeToggle,
		leverage,
		marginMode,
		hasPosition,
		positionStateReady,
		currentLeverage,
		pendingLeverage,
		maxLeverage,
		setPendingLeverage,
		resetPendingLeverage,
		applyMarginAndLeverage,
		isSwitchingMode,
		switchModeError,
		allowsIsolatedMarginRemoval,
	} = useOrderEntryData({ market, side, markPx, sizeMode, sizeInput });
	const orderExecutionStateRef = useRef<EntryOrderExecutionState>({
		active: true,
		assetId: market?.assetId,
		szDecimals: market?.szDecimals,
		availabilityStatus,
		availabilityReceivedAt,
		availabilityMaxAgeMs,
		availability: executionAvailability,
		markPriceStatus,
		markPx: market?.markPx,
		markPriceReceivedAt: market?.markPriceReceivedAt,
		executionReferencePx: market?.midPx ?? market?.markPx,
		executionPriceReceivedAt: market?.midPx !== undefined ? market.midPriceReceivedAt : market?.markPriceReceivedAt,
		slippageBps,
	});
	orderExecutionStateRef.current = {
		active: true,
		assetId: market?.assetId,
		szDecimals: market?.szDecimals,
		availabilityStatus,
		availabilityReceivedAt,
		availabilityMaxAgeMs,
		availability: executionAvailability,
		markPriceStatus,
		markPx: market?.markPx,
		markPriceReceivedAt: market?.markPriceReceivedAt,
		executionReferencePx: market?.midPx ?? market?.markPx,
		executionPriceReceivedAt: market?.midPx !== undefined ? market.midPriceReceivedAt : market?.markPriceReceivedAt,
		slippageBps,
	};
	const executionGuard = useCallback(
		(params: Parameters<typeof assertEntryOrderExecutionAllowed>[0]) =>
			assertEntryOrderExecutionAllowed(params, orderExecutionStateRef.current),
		[],
	);
	const twapExecutionGuard = useCallback(
		(params: Parameters<typeof assertEntryTwapExecutionAllowed>[0]) =>
			assertEntryTwapExecutionAllowed(params, orderExecutionStateRef.current),
		[],
	);
	const { handleSubmit: submitOrder, isSubmitting } = useOrderSubmit({ executionGuard, twapExecutionGuard });
	const accountModeControl = useAccountAbstractionControl(accountAbstraction);

	useEffect(() => {
		orderExecutionStateRef.current.active = true;
		return () => {
			orderExecutionStateRef.current.active = false;
		};
	}, []);

	const { takerRate, makerRate } = useMarketFeeRates(market);
	const selectedPrice = useSelectedPrice();
	const orderType = useOrderType();
	const reduceOnly = useReduceOnly();
	const limitPriceInput = useLimitPrice();
	const triggerPriceInput = useTriggerPrice();
	const scaleStartPriceInput = useScaleStart();
	const scaleEndPriceInput = useScaleEnd();
	const scaleLevelsNum = useScaleLevels();
	const twapMinutesNum = useTwapMinutes();
	const twapRandomize = useTwapRandomize();
	const tpSlEnabled = useTpSlEnabled();
	const tpPriceInput = useTpPrice();
	const slPriceInput = useSlPrice();
	const tif = useTif();

	const stopOrder = isStopOrderType(orderType);
	const takeProfitOrder = isTakeProfitOrderType(orderType);
	const triggerOrder = isTriggerOrderType(orderType);
	const requiresLiveMarkPrice = orderType === "market" || triggerOrder;
	const twapOrder = isTwapOrderType(orderType);
	const scaleOrder = isScaleOrderType(orderType);
	const usesLimitPrice = usesLimitPriceForOrder(orderType);
	const canUseTpSl = canUseTpSlForOrder(orderType);

	const { setSide, setOrderType, setSizeMode, setSize, setLimitPrice } = useOrderEntryActions();

	const [approvalError, setApprovalError] = useState<string | null>(null);
	const [activeModal, setActiveModal] = useState<ActiveModal>(null);

	const { open: openDepositModal } = useDepositModalActions();
	const { open: openEstablishConnectionModal } = useEstablishConnectionModalActions();
	const { open: openSettingsDialog } = useSettingsDialogActions();
	const { open: openSwapModal } = useSwapModalActions();

	const swapTargetToken =
		isMarketCatalogLoading || marketCatalogError ? null : getBuilderPerpSwapTargetToken(market, spotMarkets);

	useEffect(() => {
		if (selectedPrice === null) return;

		const price = getSelectedPriceForMarket(selectedPrice, market?.name);
		getOrderbookActionsStore().actions.clearSelectedPrice();
		if (price === null) return;

		setOrderType("limit");
		setLimitPrice(price);
	}, [market?.name, selectedPrice, setOrderType, setLimitPrice]);

	useEffect(() => {
		if (isSpotMarket && triggerOrder) {
			setOrderType("market");
		}
	}, [isSpotMarket, triggerOrder, setOrderType]);

	const tpPriceNum = toNumber(tpPriceInput);
	const slPriceNum = toNumber(slPriceInput);
	const triggerPriceNum = toNumber(triggerPriceInput);
	const scaleStartPriceNum = toNumber(scaleStartPriceInput);
	const scaleEndPriceNum = toNumber(scaleEndPriceInput);

	const position = market?.name ? userPositions.getPosition(market.name, getPositionDex(market)) : null;
	const positionSize = toNumberOrZero(position?.szi);
	const validatedPositionSize = userPositions.isLoading || userPositions.hasError ? null : positionSize;

	const price = getOrderPrice(
		orderType,
		executionReferencePx,
		limitPriceInput,
		triggerPriceInput,
		scaleStartPriceInput,
		scaleEndPriceInput,
	);

	const feeRate = isTakerOrderType(orderType) ? takerRate : makerRate;
	const feeRatePercent = `${(feeRate * 100).toFixed(4)}%`;
	const takerFeePercent = `${(takerRate * 100).toFixed(4)}%`;
	const makerFeePercent = `${(makerRate * 100).toFixed(4)}%`;

	const { marginRequired, estimatedFee } = getOrderMetrics({ sizeValue, price, leverage, feeRate });
	const { liqPrice, liqWarning } = getLiquidationInfo({ price, sizeValue, leverage, side });

	const needsAgentApproval = !isTradingAuthorized;
	const isReadyToTrade = isTradingAuthorized;
	const canApprove = !!walletClient && !!address;
	const isApprovalLoading = isAgentReady ? isBuilderFeeLoading : isAgentLoading;

	const baseInput = {
		assetId: typeof market?.assetId === "number" ? market.assetId : null,
		szDecimals: market?.szDecimals ?? 0,
		isConnected,
		isWalletLoading,
		availableBalance,
		hasMarket: !!market,
		hasAssetIndex: typeof market?.assetId === "number",
		markPriceStatus,
		requiresLiveMarkPrice,
		needsAgentApproval,
		isReadyToTrade,
		price,
		sizeValue,
		orderValue,
		side,
		usesLimitPrice,
		usesTriggerPrice: triggerOrder,
		triggerPriceNum,
		scaleOrder,
		twapOrder,
		scaleStartPriceNum,
		scaleEndPriceNum,
		scaleLevelsNum,
		twapMinutesNum,
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
					stopOrder,
					takeProfitOrder,
					positionSize: validatedPositionSize,
					tpSlEnabled,
					canUseTpSl,
					tpPriceNum,
					slPriceNum,
				}),
	);
	function handleSizeModeToggle() {
		const newMode = sizeMode === "base" ? "quote" : "base";
		const convertedSize = convertSizeForModeToggle();
		if (convertedSize) {
			setSize(convertedSize);
		}
		setSizeMode(newMode);
	}

	function handleSizePercentApply(pct: number) {
		if (maxSize <= 0) return;
		const newSize = getSizeForPercent(pct);
		if (newSize) setSize(newSize);
	}

	const isRegistering =
		registerStatus === "approving_fee" || registerStatus === "approving_agent" || registerStatus === "verifying";

	const handleMarginApply = useCallback(
		async (mode: MarginMode, leverageValue: number) => {
			await applyMarginAndLeverage(mode, leverageValue);
		},
		[applyMarginAndLeverage],
	);

	const handleAccountModeChange = useCallback(
		async (nextAccountMode: SelectableAccountAbstraction) => {
			const didUpdate = await accountModeControl.setAccountAbstraction(nextAccountMode);
			if (didUpdate) toast.success(t`Account mode updated`);
		},
		[accountModeControl.setAccountAbstraction, t],
	);

	const handleMarginModalOpenChange = useCallback(
		(open: boolean) => {
			if (!open) resetPendingLeverage();
			setActiveModal(open ? "marginMode" : null);
		},
		[resetPendingLeverage],
	);

	const handleLeverageModalOpenChange = useCallback(
		(open: boolean) => {
			if (!open) resetPendingLeverage();
			setActiveModal(open ? "leverage" : null);
		},
		[resetPendingLeverage],
	);

	const handleLeverageApply = useCallback(
		(leverageValue: number) => applyMarginAndLeverage(marginMode, leverageValue),
		[applyMarginAndLeverage, marginMode],
	);

	function handleRegister() {
		if (tradeRestricted) return;
		if (isRegistering) return;
		if (!isConnected || !address) {
			setActiveModal("wallet");
			return;
		}
		setApprovalError(null);
		if (!isAgentReady) {
			openEstablishConnectionModal();
			return;
		}

		authorize().catch((error: unknown) => {
			const message = error instanceof Error ? error.message : t`Failed to enable trading`;
			setApprovalError(message);
			setTimeout(() => setApprovalError(null), APPROVAL_ERROR_DISMISS_MS);
		});
	}

	async function handleSubmit() {
		if (tradeRestricted) return;
		if (!isConnected || !address) return;
		if (isAvailabilityBlocked) return;
		if (!validation.canSubmit || isSubmitting) return;
		if (!market || !baseToken || typeof market.assetId !== "number") return;
		if (
			requiresLiveMarkPrice &&
			!isLiveMarkPriceReady(market.markPriceStatus, market.markPx, market.markPriceReceivedAt)
		) {
			return;
		}

		await submitOrder({
			market: {
				assetId: market.assetId,
				kind: market.kind === "spot" ? "spot" : "perp",
				name: market.name,
				szDecimals: market.szDecimals,
			},
			baseToken,
			side,
			orderType,
			sizeValue,
			price,
			executionReferencePx,
			marginMode,
			slippageBps,
			reduceOnly,
			tif,
			limitPriceInput,
			triggerPriceInput,
			scaleStartPriceInput,
			scaleEndPriceInput,
			scaleLevelsNum,
			twapMinutesNum,
			twapRandomize,
			tpSlEnabled,
			canUseTpSl,
			tpPriceNum,
			slPriceNum,
			twapOrder,
			scaleOrder,
			triggerOrder,
		});
	}

	const validationErrorText =
		validation.errors.length > 0 && isConnected && availableBalance > 0 ? validation.errors.join(" \u2022 ") : "";
	const displayValidationError = useLingeringText(validationErrorText, ERROR_LINGER_MS);

	const buttonContent = useButtonContent({
		isConnected,
		needsChainSwitch,
		isSwitchingChain: switchChain.isPending,
		switchChain: (chainId) => switchChain.mutate({ chainId }),
		availableBalance,
		isBalanceLoading: isAvailabilityLoading,
		hasBalanceError: hasAvailabilityError,
		canDeposit: sessionMode === "wallet",
		validation,
		isAgentReady,
		isApprovalLoading,
		registerStatus,
		canApprove,
		side,
		sideLabel: sideLabels[side],
		isSubmitting,
		onConnectWallet: () => setActiveModal("wallet"),
		onDeposit: () => openDepositModal("deposit"),
		onRegister: handleRegister,
		onSubmit: handleSubmit,
	});

	function renderSummary() {
		if (twapOrder) {
			return (
				<TwapOrderSummary
					twapMinutesNum={twapMinutesNum}
					sizeValue={sizeValue}
					orderValue={orderValue}
					estimatedFee={estimatedFee}
					feeRatePercent={feeRatePercent}
					baseToken={baseToken}
					szDecimals={market?.szDecimals}
				/>
			);
		}
		if (scaleOrder) {
			return (
				<ScaleOrderSummary
					scaleStart={scaleStartPriceNum}
					scaleEnd={scaleEndPriceNum}
					scaleLevels={scaleLevelsNum}
					orderValue={orderValue}
					marginRequired={marginRequired}
					estimatedFee={estimatedFee}
					feeRatePercent={feeRatePercent}
					szDecimals={market?.szDecimals}
					marketKind={market?.kind}
				/>
			);
		}
		return (
			<OrderSummary
				liqPrice={liqPrice}
				liqWarning={liqWarning}
				orderValue={orderValue}
				marginRequired={marginRequired}
				takerFeePercent={takerFeePercent}
				makerFeePercent={makerFeePercent}
				slippagePercent={slippagePercent}
				szDecimals={market?.szDecimals}
				onSlippageClick={openSettingsDialog}
				orderType={orderType}
				marketKind={market?.kind}
			/>
		);
	}

	return (
		<div className="trade-panel-container flex flex-col bg-surface font-market-close">
			<MarginModeModal
				open={activeModal === "marginMode"}
				onOpenChange={handleMarginModalOpenChange}
				currentMode={marginMode}
				currentLeverage={currentLeverage}
				pendingLeverage={pendingLeverage}
				maxLeverage={maxLeverage}
				onPendingLeverageChange={setPendingLeverage}
				hasPosition={hasPosition}
				positionStateReady={positionStateReady}
				allowsCrossMargin={capabilities.allowsCrossMargin}
				allowsIsolatedMarginRemoval={allowsIsolatedMarginRemoval}
				isUpdating={isSwitchingMode}
				updateError={switchModeError}
				showLeverage={false}
				onApply={handleMarginApply}
				marketIdentity={market?.name}
			/>
			<LeverageModal
				open={activeModal === "leverage"}
				onOpenChange={handleLeverageModalOpenChange}
				currentLeverage={currentLeverage}
				pendingLeverage={pendingLeverage}
				maxLeverage={maxLeverage}
				onPendingLeverageChange={setPendingLeverage}
				isUpdating={isSwitchingMode}
				updateError={switchModeError}
				onApply={handleLeverageApply}
				marketIdentity={market?.name}
			/>
			<AccountModeModal
				open={activeModal === "accountMode"}
				onOpenChange={(open) => setActiveModal(open ? "accountMode" : null)}
				currentMode={accountModeControl.accountAbstraction}
				isLoading={accountModeControl.isLoading}
				isUpdating={accountModeControl.isUpdating}
				canChange={accountModeControl.canSet}
				portfolioMarginActivationEnabled={accountModeControl.portfolioMarginActivationEnabled}
				onConnect={() => setActiveModal("wallet")}
				onApply={handleAccountModeChange}
			/>

			<div className="flex flex-col gap-5 px-3 py-3">
				<TradeHeader
					orderType={orderType}
					side={side}
					sideLabels={sideLabels}
					marketKind={market?.kind}
					onOrderTypeChange={setOrderType}
					onSideChange={setSide}
					marginMode={marginMode}
					leverage={leverage}
					onMarginModeClick={() => setActiveModal("marginMode")}
					onLeverageClick={() => setActiveModal("leverage")}
					isLeveraged={capabilities.isLeveraged}
					accountMode={accountModeControl.accountAbstraction}
					isAccountModeLoading={accountModeControl.isLoading}
					isAccountModeUpdating={accountModeControl.isUpdating}
					onAccountModeClick={() => setActiveModal("accountMode")}
				/>

				<TradeFormFields
					price={price}
					positionSize={positionSize}
					swapTargetToken={swapTargetToken}
					onSizeModeToggle={handleSizeModeToggle}
					onSizePercentApply={handleSizePercentApply}
					onSwapClick={() => {
						if (swapTargetToken) openSwapModal(DEFAULT_QUOTE_TOKEN, swapTargetToken);
					}}
				/>

				<div className="flex flex-col gap-4 pt-5 pb-1">
					<div className="flex flex-col gap-3">
						{displayValidationError && <div className="text-xs text-error">{displayValidationError}</div>}

						{approvalError && <div className="text-xs text-error">{approvalError}</div>}

						{tradeRestricted ? (
							<Button
								variant="filled"
								size="xs"
								intent="neutral"
								disabled
								className="w-full rounded-[12px] px-3 py-3.5 text-sm font-bold whitespace-nowrap shadow-none data-disabled:bg-trading-panel-neutral-disabled-fill data-disabled:text-trading-panel-on-disabled"
								aria-label={t`Trading is not available in your region`}
							>
								{t`Trading is not available in your region`}
							</Button>
						) : (
							<Button
								variant="filled"
								size="xs"
								intent={getTradingCtaIntent(buttonContent.variant)}
								onClick={buttonContent.action}
								disabled={buttonContent.disabled}
								className={cn(
									"w-full rounded-[12px] px-3 py-3.5 text-sm font-bold whitespace-nowrap shadow-none focus-visible:outline-offset-1",
									getTradingCtaClass(buttonContent.variant),
								)}
								aria-label={buttonContent.text}
								iconLeft={
									isSubmitting || isRegistering ? <SpinnerGapIcon className="size-3 animate-spin" /> : undefined
								}
							>
								{buttonContent.text}
							</Button>
						)}
					</div>
					<div className="border-t border-trading-panel-stroke-row pt-1">{renderSummary()}</div>
				</div>
			</div>

			{activeModal === "wallet" && (
				<Suspense fallback={null}>
					<WalletModal open onOpenChange={(open) => setActiveModal(open ? "wallet" : null)} />
				</Suspense>
			)}
		</div>
	);
}
