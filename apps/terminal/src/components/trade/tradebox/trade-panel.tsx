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
import {
	canEstimateProspectiveLiquidationDraft,
	estimateProspectiveLiquidation,
} from "@/domain/trade/order/liquidation";
import { getOrderMetrics } from "@/domain/trade/order/metrics";
import { getOrderPrice } from "@/domain/trade/order/price";
import type { OrderConfirmationDraft } from "@/domain/trade/order-confirmation";
import { buildOrderFeeQuote, resolveEstimatedProtocolRate } from "@/domain/trade/order-fee-quote";
import { resolveScaleSkewNumber } from "@/domain/trade/orders";
import { formatTwapPriceInput } from "@/domain/trade/twap-details";
import {
	type SelectableAccountAbstraction,
	useAccountAbstractionControl,
} from "@/hooks/trade/use-account-abstraction-control";
import { useBuilderFeeTenthsBps } from "@/hooks/trade/use-builder-fee-config";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { useMarketFeeRates } from "@/hooks/trade/use-fee-rates";
import { useMarketSlippageEstimate } from "@/hooks/trade/use-market-slippage-estimate";
import { useOrderConfirmation } from "@/hooks/trade/use-order-confirmation";
import { useOrderEntryData } from "@/hooks/trade/use-order-entry-data";
import { type OrderSubmitDraftInput, useOrderSubmit } from "@/hooks/trade/use-order-submit";
import { useProspectiveCrossMarginAccount } from "@/hooks/trade/use-prospective-cross-margin-account";
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
	useScaleSkew,
	useScaleStart,
	useSizeMode,
	useSlPrice,
	useTif,
	useTpPrice,
	useTpSlEnabled,
	useTpSlReturnInvalid,
	useTriggerPrice,
	useTwapMinutes,
	useTwapRandomize,
	useTwapStopPrice,
	useTwapTriggerPrice,
} from "@/stores/use-order-entry-store";
import {
	getOrderbookActionsStore,
	getSelectedPriceForMarket,
	useSelectedPrice,
} from "@/stores/use-orderbook-actions-store";
import { AccountModeModal } from "./account-mode-modal";
import { LeverageModal } from "./leverage-modal";
import { MarginModeModal } from "./margin-mode-modal";
import { OrderConfirmationModal } from "./order-confirmation-modal";
import { OrderSummary } from "./order-summary";
import { ScaleOrderSummary } from "./scale-order-summary";
import { TradeFormFields } from "./trade-form-fields";
import { TradeHeader } from "./trade-header";
import { TradePanelBody } from "./trade-panel-body";
import { TwapOrderSummary } from "./twap-order-summary";

const WalletModal = createLazyComponent(() => import("../components/wallet-modal"), "WalletModal");

const ERROR_LINGER_MS = 1500;

export function TradePanel() {
	const { t } = useLingui();
	const { address, isConnected } = useWalletSession();
	const depositAvailability = useDepositAvailability();
	const { data: walletClient, isLoading: isWalletLoading, error: walletClientError } = useWalletClient();
	const switchChain = useSwitchChain();
	const needsChainSwitch = !!walletClientError && walletClientError.message.includes("does not match");

	const { data: market } = useSelectedMarketInfo();
	const { spotMarkets, isLoading: isMarketCatalogLoading, error: marketCatalogError } = useMarketsInfo();
	const crossMarginSnapshot = useProspectiveCrossMarginAccount(market);

	const userPositions = useUserPositions();

	const geoRestriction = useGeoRestriction();
	const tradeActionsBlocked = geoRestriction.actionsBlocked;
	const tradeRestricted = geoRestriction.tradeRestricted;
	const tradingUnavailableReason = !geoRestriction.isResolved
		? geoRestriction.isError
			? t`Unable to verify regional availability. Trading is temporarily unavailable.`
			: t`Checking regional availability. Trading is temporarily unavailable.`
		: null;

	const slippageBps = useMarketOrderSlippageBps();
	const slippagePercent = useMarketOrderSlippagePercent();
	const side = useOrderSide();
	const markPx = toNumberOrZero(market?.markPx);
	const executionReferencePx = toNumber(market?.midPx) ?? markPx;
	const markPriceStatus = market?.markPriceStatus ?? "loading";
	const sizeMode = useSizeMode();
	const sizeInput = useOrderSize();

	const orderType = useOrderType();
	const limitPriceInput = useLimitPrice();
	const orderEntryData = useOrderEntryData({
		market,
		side,
		markPx,
		sizeMode,
		sizeInput,
		limitPx: usesLimitPriceForOrder(orderType) ? toNumberOrZero(limitPriceInput) : undefined,
		marketOrderSizing: orderType === "market" ? { referencePx: executionReferencePx, slippageBps } : null,
	});
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
		leverageInteractionIdentity,
		marginMode,
		hasPosition,
		positionStateReady,
		currentLeverage,
		pendingLeverage,
		committedLeverage,
		maxLeverage,
		setPendingLeverage,
		resetPendingLeverage,
		applyMarginAndLeverage,
		isLeverageUpdating,
		leverageUpdateError,
		isSwitchingMode,
		switchModeError,
		allowsIsolatedMarginRemoval,
	} = orderEntryData;
	const slippageEstimate = useMarketSlippageEstimate(market?.name, side, sizeValue, orderType === "market");
	const position = market?.name ? userPositions.getPosition(market.name, getPositionDex(market)) : null;
	const positionSize = toNumberOrZero(position?.szi);
	const positionSnapshotReady = !userPositions.isLoading && !userPositions.hasError && !userPositions.isStale;
	const validatedPositionSize = positionSnapshotReady ? positionSize : null;
	const orderExecutionStateRef = useRef<EntryOrderExecutionState>({
		active: true,
		assetId: market?.assetId,
		szDecimals: market?.szDecimals,
		availabilityStatus,
		availabilityReceivedAt,
		availabilityMaxAgeMs,
		availability: executionAvailability,
		positionStateReady: positionSnapshotReady,
		positionReceivedAt: userPositions.receivedAt,
		positionSignedSize: position?.szi,
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
		positionStateReady: positionSnapshotReady,
		positionReceivedAt: userPositions.receivedAt,
		positionSignedSize: position?.szi,
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
	const builderFeeTenthsBps = useBuilderFeeTenthsBps();
	const selectedPrice = useSelectedPrice();
	const reduceOnlyChecked = useReduceOnly();
	const reduceOnly = capabilities.hasReduceOnly && reduceOnlyChecked;
	const triggerPriceInput = useTriggerPrice();
	const scaleStartPriceInput = useScaleStart();
	const scaleEndPriceInput = useScaleEnd();
	const scaleLevelsNum = useScaleLevels();
	const scaleSkewInput = useScaleSkew();
	const twapMinutesNum = useTwapMinutes();
	const twapRandomize = useTwapRandomize();
	const twapTriggerPriceInput = useTwapTriggerPrice();
	const twapStopPriceInput = useTwapStopPrice();
	const tpSlEnabled = useTpSlEnabled();
	const tpSlReturnInvalid = useTpSlReturnInvalid();
	const tpPriceInput = useTpPrice();
	const slPriceInput = useSlPrice();
	const tif = useTif();

	const stopOrder = isStopOrderType(orderType);
	const takeProfitOrder = isTakeProfitOrderType(orderType);
	const triggerOrder = isTriggerOrderType(orderType);
	const twapOrder = isTwapOrderType(orderType);
	const requiresBuilderFee = !twapOrder;
	const { isReady, isAgentReady, isAgentLoading, isBuilderFeeLoading } = useAgentStatus();
	const isTradingAuthorized = requiresBuilderFee ? isReady : isAgentReady;
	const { authorize, status: registerStatus } = useTradingAuthorization({ requiresBuilderFee });
	const twapPriceFormat = { assetId: market?.assetId, szDecimals: market?.szDecimals ?? 0 };
	const twapTriggerPx = formatTwapPriceInput(twapTriggerPriceInput, twapPriceFormat);
	const twapStopPx = formatTwapPriceInput(twapStopPriceInput, twapPriceFormat);
	const twapTriggerPriceNum = toNumber(twapTriggerPx);
	const twapStopPriceNum = toNumber(twapStopPx);
	const requiresLiveMarkPrice = orderType === "market" || triggerOrder || twapOrder;
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
	const scaleSkewNum = resolveScaleSkewNumber(scaleSkewInput);

	const price = getOrderPrice(
		orderType,
		executionReferencePx,
		limitPriceInput,
		triggerPriceInput,
		scaleStartPriceInput,
		scaleEndPriceInput,
	);

	const feeRate = resolveEstimatedProtocolRate({ orderType, tif, takerRate, makerRate });
	const feeMarketKind = market?.kind === "spot" ? "spot" : "perp";
	const feeExecution = twapOrder ? "twap" : "order";
	const feeQuoteInput = {
		orderValue,
		builderFeeTenthsBps,
		marketKind: feeMarketKind,
		side,
		execution: feeExecution,
	} as const;
	const feeQuote = buildOrderFeeQuote({ ...feeQuoteInput, protocolRate: feeRate });
	const takerFeeQuote = buildOrderFeeQuote({ ...feeQuoteInput, protocolRate: takerRate });
	const makerFeeQuote = buildOrderFeeQuote({ ...feeQuoteInput, protocolRate: makerRate });
	const isolatedExistingPosition = position
		? {
				signedSize: position.szi,
				positionValue: position.positionValue,
				marginUsed: position.marginUsed,
				marginMode: position.leverage.type,
				leverage: position.leverage.value,
			}
		: null;
	const prospectiveExistingPosition =
		marginMode === "cross" ? crossMarginSnapshot.existingPosition : isolatedExistingPosition;

	const { marginRequired } = getOrderMetrics({ sizeValue, price, leverage });
	const { liqPrice, liqWarning } = estimateProspectiveLiquidation({
		price,
		orderSize: sizeValue,
		leverage,
		side,
		marginMode,
		accountMode: accountAbstraction,
		marginTiers: market?.kind === "perp" || market?.kind === "builderPerp" ? market.marginTiers : null,
		dataReady:
			(orderType === "market" || orderType === "limit") &&
			positionStateReady &&
			market?.marginMetadataReady === true &&
			isLiveMarkPriceReady(markPriceStatus, market?.markPx, market?.markPriceReceivedAt) &&
			canEstimateProspectiveLiquidationDraft({ marginMode, orderSize: sizeValue, maxOrderSize: maxSize }),
		reduceOnly,
		existingPosition: prospectiveExistingPosition,
		crossMarginAccount: crossMarginSnapshot.account,
		executionFee: feeQuote.totalAmount,
	});

	const needsAgentApproval = !isTradingAuthorized;
	const isReadyToTrade = isTradingAuthorized;
	const canApprove = !!walletClient && !!address;
	const isApprovalLoading = isAgentReady ? requiresBuilderFee && isBuilderFeeLoading : isAgentLoading;

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
		scaleSkewNum,
		twapMinutesNum,
		twapTriggerPriceNum,
		twapStopPriceNum,
	};

	const validation = useOrderValidation(
		isSpotMarket
			? spotInput(baseInput, {
					markPx,
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
					reduceOnly,
					tpSlEnabled,
					canUseTpSl,
					tpSlReturnInvalid,
					tpPriceNum,
					slPriceNum,
				}),
	);

	function canExecuteOrder() {
		if (tradeActionsBlocked) return false;
		if (!isConnected || !address) return false;
		if (isAvailabilityBlocked) return false;
		if (!validation.canSubmit) return false;
		if (!market || !baseToken || typeof market.assetId !== "number") return false;
		if (!requiresLiveMarkPrice) return true;
		return isLiveMarkPriceReady(market.markPriceStatus, market.markPx, market.markPriceReceivedAt);
	}

	async function submitWithLivePrices(input: OrderSubmitDraftInput) {
		await submitOrder({ ...input, price, executionReferencePx, markPx });
	}

	const confirmation = useOrderConfirmation({ execute: submitWithLivePrices, canExecute: canExecuteOrder });

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
		if (tradeActionsBlocked) return;
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
		if (isSubmitting || !canExecuteOrder()) return;
		if (!market || !baseToken || typeof market.assetId !== "number") return;

		const draft: OrderConfirmationDraft = {
			assetId: market.assetId,
			marketLabel: market.pairName ?? market.name,
			marketKind: market.kind === "spot" ? "spot" : "perp",
			isLeveraged: capabilities.isLeveraged,
			side,
			sideLabel: sideLabels[side],
			orderType,
			tif,
			baseToken,
			szDecimals: market.szDecimals,
			sizeValue,
			orderValue,
			limitPrice: toNumber(limitPriceInput),
			triggerPrice: triggerPriceNum,
			scaleStartPrice: scaleStartPriceNum,
			scaleEndPrice: scaleEndPriceNum,
			scaleLevels: scaleLevelsNum,
			scaleSkew: scaleSkewNum,
			twapMinutes: twapMinutesNum,
			twapRandomize,
			twapTriggerPrice: twapTriggerPriceNum,
			twapStopPrice: twapStopPriceNum,
			tpSlEnabled: tpSlEnabled && canUseTpSl,
			tpPrice: tpPriceNum,
			slPrice: slPriceNum,
			reduceOnly,
			leverage,
			marginMode,
			marginRequired,
			feeQuote,
			liqPrice,
			liqWarning,
			slippagePercent,
		};

		await confirmation.requestSubmit(
			{
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
				marginMode,
				slippageBps,
				reduceOnly,
				tif,
				limitPriceInput,
				triggerPriceInput,
				scaleStartPriceInput,
				scaleEndPriceInput,
				scaleLevelsNum,
				scaleSkewInput,
				twapMinutesNum,
				twapRandomize,
				twapTriggerPx,
				twapStopPx,
				tpSlEnabled,
				canUseTpSl,
				tpPriceNum,
				slPriceNum,
				twapOrder,
				scaleOrder,
				triggerOrder,
			},
			draft,
		);
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
		canDeposit: depositAvailability.available,
		depositUnavailableReason: depositAvailability.unavailableReason,
		tradingUnavailableReason,
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
					twapTriggerPriceNum={twapTriggerPriceNum}
					twapStopPriceNum={twapStopPriceNum}
					side={side}
					feeQuote={feeQuote}
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
					scaleSkew={scaleSkewNum}
					orderValue={orderValue}
					marginRequired={marginRequired}
					feeQuote={feeQuote}
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
				takerFeeQuote={takerFeeQuote}
				makerFeeQuote={makerFeeQuote}
				slippagePercent={slippagePercent}
				estimatedSlippage={slippageEstimate}
				szDecimals={market?.szDecimals}
				onSlippageClick={openSettingsDialog}
				orderType={orderType}
				marketKind={market?.kind}
			/>
		);
	}

	return (
		<div className="trade-panel-container flex h-full flex-col bg-surface font-market-close">
			<MarginModeModal
				open={activeModal === "marginMode"}
				onOpenChange={handleMarginModalOpenChange}
				currentMode={marginMode}
				currentLeverage={currentLeverage}
				pendingLeverage={pendingLeverage}
				committedLeverage={committedLeverage}
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
				marketIdentity={leverageInteractionIdentity}
			/>
			<LeverageModal
				open={activeModal === "leverage"}
				onOpenChange={handleLeverageModalOpenChange}
				currentLeverage={currentLeverage}
				pendingLeverage={pendingLeverage}
				committedLeverage={committedLeverage}
				maxLeverage={maxLeverage}
				onPendingLeverageChange={setPendingLeverage}
				isUpdating={isLeverageUpdating}
				updateError={leverageUpdateError}
				onApply={handleLeverageApply}
				marketIdentity={leverageInteractionIdentity}
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
			{confirmation.pending && (
				<OrderConfirmationModal
					open
					draft={confirmation.pending.draft}
					isSubmitting={confirmation.isConfirming}
					dontShowAgain={confirmation.dontShowAgain}
					onDontShowAgainChange={confirmation.setDontShowAgain}
					onConfirm={confirmation.confirm}
					onOpenChange={confirmation.cancel}
				/>
			)}

			<TradePanelBody
				footer={
					<>
						<div className="flex flex-col gap-3">
							{displayValidationError && <div className="text-xs text-error">{displayValidationError}</div>}

							{approvalError && <div className="text-xs text-error">{approvalError}</div>}

							{tradeRestricted && !buttonContent.disabledReason ? (
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
							{buttonContent.disabledReason ? (
								<output className="text-center text-xs text-trading-panel-muted">{buttonContent.disabledReason}</output>
							) : null}
						</div>
						<div className="border-t border-trading-panel-stroke-row pt-1">{renderSummary()}</div>
					</>
				}
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
					onMarginModeClick={() => setActiveModal("marginMode")}
					onLeverageClick={() => setActiveModal("leverage")}
					isLeveraged={capabilities.isLeveraged}
					accountMode={accountModeControl.accountAbstraction}
					isAccountModeLoading={accountModeControl.isLoading}
					isAccountModeUpdating={accountModeControl.isUpdating}
					onAccountModeClick={() => setActiveModal("accountMode")}
				/>

				<TradeFormFields
					orderEntryData={orderEntryData}
					price={price}
					positionSize={positionSize}
					swapTargetToken={swapTargetToken}
					onSizeModeToggle={handleSizeModeToggle}
					onSizePercentApply={handleSizePercentApply}
					onSwapClick={() => {
						if (swapTargetToken) openSwapModal(DEFAULT_QUOTE_TOKEN, swapTargetToken);
					}}
				/>
			</TradePanelBody>

			{activeModal === "wallet" && (
				<Suspense fallback={null}>
					<WalletModal open onOpenChange={(open) => setActiveModal(open ? "wallet" : null)} />
				</Suspense>
			)}
		</div>
	);
}
