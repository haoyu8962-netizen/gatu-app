import { useLingui } from "@lingui/react/macro";
import { useConnectionWalletClient } from "@sairn/hl-react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ButtonLoading } from "@/components/brand/button-loading";
import { LazyDialogHost } from "@/components/ui/lazy-dialog-host";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { APPROVAL_ERROR_DISMISS_MS } from "@/config/time";
import { TRADE_PANEL_LABELS } from "@/config/trade-panel-labels";
import { getPositionDex } from "@/domain/market";
import { getBuilderPerpSwapTargetToken } from "@/domain/trade/collateral-acquisition";
import { getFundsAvailabilityNotice } from "@/domain/trade/data-presentation";
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
import { isOrderSizeValidationError } from "@/domain/trade/order-size-validation";
import { resolveScaleSkewNumber } from "@/domain/trade/orders";
import { getTpSlPriceErrors } from "@/domain/trade/tpsl-price-validation";
import { resolveTwapPriceInputs } from "@/domain/trade/twap-details";
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
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useLingeringValue } from "@/hooks/use-lingering-value";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { formatTransferError } from "@/lib/errors/format";
import {
	getMarketCapabilities,
	useMarketsInfo,
	useSelectedMarketInfo,
	useTradingAuthorization,
	useTradingStatus,
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
import { getOrderValidationPresentation, isInlineTpSlValidationError } from "@/lib/trade/order-validation-presentation";
import { getTpSlCollateralSymbol } from "@/lib/trade/tpsl";
import type { ActiveModal } from "@/lib/trade/types";
import { useButtonContent } from "@/lib/trade/use-button-content";
import { perpInput, spotInput, useOrderValidation } from "@/lib/trade/use-order-validation";
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
	useTwapAdvancedEnabled,
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
import {
	AccountModeModal,
	LeverageModal,
	MarginModeModal,
	warmTradeSettingsModals,
} from "./lazy-trade-settings-modals";
import { OrderConfirmationModal } from "./order-confirmation-modal";
import { OrderSummary } from "./order-summary";
import { ScaleOrderSummary } from "./scale-order-summary";
import { TradeCtaView } from "./trade-cta-view";
import { TradeFormFields } from "./trade-form-fields";
import { TradeHeader } from "./trade-header";
import { TradePanelBodyView } from "./trade-panel-body-view";
import { TradePanelFooterView } from "./trade-panel-footer-view";
import { TwapOrderSummary } from "./twap-order-summary";

const ORDER_CONFIRMATION_EXIT_MS = 250;

const WalletModal = createLazyComponent(() => import("../components/wallet-modal"), "WalletModal");

function warmDesktopTradeSettingsModals() {
	warmTradeSettingsModals("desktop");
}

export function TradePanel() {
	const { t } = useLingui();
	const { address, isConnected, hasWalletAccess } = useWalletSession();
	const { data: connectionWalletClient } = useConnectionWalletClient();
	const depositAvailability = useDepositAvailability();

	const { data: market } = useSelectedMarketInfo();
	const { spotMarkets, isLoading: isMarketCatalogLoading, error: marketCatalogError } = useMarketsInfo();
	const crossMarginSnapshot = useProspectiveCrossMarginAccount(market);

	const userPositions = useUserPositions();

	const geoRestriction = useGeoRestriction();
	const tradeActionsBlocked = geoRestriction.actionsBlocked;
	const tradeRestricted = geoRestriction.tradeRestricted;

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
	const position = market?.name ? userPositions.getPosition(market.name, getPositionDex(market)) : null;
	const positionSize = toNumberOrZero(position?.szi);
	const positionSnapshotReady = !userPositions.isLoading && !userPositions.hasError && !userPositions.isStale;
	const validatedPositionSize = positionSnapshotReady ? (position?.szi ?? "0") : null;
	const reduceOnlyChecked = useReduceOnly();
	const capabilities = getMarketCapabilities(market);
	const reduceOnly = capabilities.hasReduceOnly && reduceOnlyChecked;
	const orderEntryData = useOrderEntryData({
		market,
		side,
		markPx,
		sizeMode,
		sizeInput,
		limitPx: usesLimitPriceForOrder(orderType) ? toNumberOrZero(limitPriceInput) : undefined,
		reduceOnly,
		positionSnapshot: {
			ready: positionSnapshotReady,
			receivedAt: userPositions.receivedAt,
			signedSize: validatedPositionSize ?? undefined,
		},
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
		availableBalance,
		isAvailabilityBlocked,
		isAvailabilityLoading,
		isAvailabilityStale,
		hasAvailabilityError,
		isOpenInterestCapped,
		maxSize,
		sizeValue,
		sizeForOrder,
		orderValue,
		sideLabels,
		applySizePercent,
		toggleSizeDenomination,
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
		isSwitchingMode,
		allowsIsolatedMarginRemoval,
	} = orderEntryData;
	const slippageEstimate = useMarketSlippageEstimate(market?.name, side, sizeValue, orderType === "market");

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
		positionSignedSize: validatedPositionSize ?? undefined,
		markPriceStatus,
		markPx: market?.markPx,
		markPriceReceivedAt: market?.markPriceReceivedAt,
		executionReferencePx: market?.midPx ?? market?.markPx,
		executionPriceReceivedAt: market?.midPx !== undefined ? market.midPriceReceivedAt : market?.markPriceReceivedAt,
		slippageBps,
		openInterestCapped: isOpenInterestCapped,
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
		positionSignedSize: validatedPositionSize ?? undefined,
		markPriceStatus,
		markPx: market?.markPx,
		markPriceReceivedAt: market?.markPriceReceivedAt,
		executionReferencePx: market?.midPx ?? market?.markPx,
		executionPriceReceivedAt: market?.midPx !== undefined ? market.midPriceReceivedAt : market?.markPriceReceivedAt,
		slippageBps,
		openInterestCapped: isOpenInterestCapped,
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
	function getLivePositionSize(assetId: number) {
		const state = orderExecutionStateRef.current;
		return state.assetId === assetId && state.positionStateReady ? state.positionSignedSize : undefined;
	}
	const {
		captureDraftResetToken,
		isDraftResetTokenCurrent,
		handleSubmit: submitOrder,
		isSubmitting,
	} = useOrderSubmit({ executionGuard, twapExecutionGuard, getPositionSize: getLivePositionSize });
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
	const triggerPriceInput = useTriggerPrice();
	const scaleStartPriceInput = useScaleStart();
	const scaleEndPriceInput = useScaleEnd();
	const scaleLevelsNum = useScaleLevels();
	const scaleSkewInput = useScaleSkew();
	const twapMinutesNum = useTwapMinutes();
	const twapRandomize = useTwapRandomize();
	const twapAdvancedEnabled = useTwapAdvancedEnabled();
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
	const { isReady, isSignerReady, isSignerLoading, isBuilderFeeLoading, signerMode } = useTradingStatus();
	const isTradingAuthorized = requiresBuilderFee ? isReady : isSignerReady;
	const isWalletLoading = isConnected && signerMode === "owner" && isSignerLoading;
	const { authorize, status: registerStatus } = useTradingAuthorization({ requiresBuilderFee });
	const twapPriceFormat = { assetId: market?.assetId, szDecimals: market?.szDecimals ?? 0 };
	const { triggerPx: twapTriggerPx, stopPx: twapStopPx } = resolveTwapPriceInputs(
		twapAdvancedEnabled,
		twapTriggerPriceInput,
		twapStopPriceInput,
		twapPriceFormat,
	);
	const twapTriggerPriceNum = toNumber(twapTriggerPx);
	const twapStopPriceNum = toNumber(twapStopPx);
	const requiresLiveMarkPrice = orderType === "market" || triggerOrder || twapOrder;
	const scaleOrder = isScaleOrderType(orderType);
	const usesLimitPrice = usesLimitPriceForOrder(orderType);
	const canUseTpSl = canUseTpSlForOrder(orderType);

	const { setSide, setOrderType, setLimitPriceFromUser } = useOrderEntryActions();

	const [approvalError, setApprovalError] = useState<{ cause: unknown } | null>(null);
	const [activeModal, setActiveModal] = useState<ActiveModal>(null);
	function handleAccountModeModalOpenChange(open: boolean) {
		setActiveModal(open ? "accountMode" : null);
	}
	const sizeInteractionRef = useRef(false);
	function handleSizeInteractionChange(active: boolean) {
		sizeInteractionRef.current = active;
	}

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
		setLimitPriceFromUser(`${market?.name ?? ""}|limit`, price);
	}, [market?.name, selectedPrice, setOrderType, setLimitPriceFromUser]);

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

	const { marginRequired } = getOrderMetrics({ sizeValue, price, leverage, reduceOnly });
	const marginTiers = market?.kind === "perp" || market?.kind === "builderPerp" ? market.marginTiers : null;
	const { liqPrice, liqWarning } = estimateProspectiveLiquidation({
		price,
		orderSize: sizeValue,
		leverage,
		side,
		marginMode,
		accountMode: accountAbstraction,
		marginTiers,
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
	const canApprove = hasWalletAccess && !!address && (signerMode === "owner" || !!connectionWalletClient);
	const isApprovalLoading = isSignerReady ? requiresBuilderFee && isBuilderFeeLoading : isSignerLoading;

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
					sizeForOrder,
					reduceOnly,
					openInterestCapped: isOpenInterestCapped,
					tpSlEnabled,
					canUseTpSl,
					tpSlReturnInvalid,
					tpPriceNum,
					slPriceNum,
				}),
	);

	function canExecuteOrder(input?: OrderSubmitDraftInput) {
		if (input && !isDraftResetTokenCurrent(input.draftResetToken)) return false;
		if (sizeInteractionRef.current) return false;
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
	const displayedConfirmation = useLingeringValue(confirmation.pending, ORDER_CONFIRMATION_EXIT_MS);

	function handleSizeModeToggle() {
		toggleSizeDenomination();
	}

	function handleSizePercentApply(pct: number) {
		if (maxSize <= 0) return;
		applySizePercent(pct);
	}

	const isRegistering =
		registerStatus === "approving_fee" || registerStatus === "approving_agent" || registerStatus === "verifying";

	const handleMarginApply = useCallback(
		(mode: MarginMode, leverageValue: number) => applyMarginAndLeverage(mode, leverageValue),
		[applyMarginAndLeverage],
	);

	const handleAccountModeChange = useCallback(
		async (nextAccountMode: SelectableAccountAbstraction) => {
			await accountModeControl.setAccountAbstraction(nextAccountMode);
		},
		[accountModeControl.setAccountAbstraction],
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
		if (!isSignerReady) {
			if (signerMode === "agent") openEstablishConnectionModal();
			return;
		}

		authorize().catch((error: unknown) => {
			setApprovalError({ cause: error });
			setTimeout(() => setApprovalError(null), APPROVAL_ERROR_DISMISS_MS);
		});
	}

	function getApprovalErrorMessage(cause: unknown): string {
		return cause instanceof Error
			? formatTransferError(cause, (descriptor) => t(descriptor))
			: t`Failed to enable trading`;
	}

	async function handleSubmit() {
		if (isSubmitting || !canExecuteOrder()) return;
		if (!market || !baseToken || typeof market.assetId !== "number") return;

		const draftResetToken = captureDraftResetToken();
		if (!draftResetToken) return;

		const draft: OrderConfirmationDraft = {
			assetId: market.assetId,
			marketLabel: market.pairName ?? market.name,
			marketKind: market.kind === "spot" ? "spot" : "perp",
			isLeveraged: capabilities.isLeveraged,
			side,
			orderType,
			tif,
			baseToken,
			szDecimals: market.szDecimals,
			sizeValue,
			sizeForOrder,
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
				draftResetToken,
				market: {
					assetId: market.assetId,
					kind: market.kind === "spot" ? "spot" : "perp",
					name: market.name,
					szDecimals: market.szDecimals,
				},
				baseToken,
				quoteToken,
				side,
				orderType,
				sizeValue,
				sizeForOrder,
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
				twapAdvancedEnabled,
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

	const validationPresentationState = {
		accountReady:
			isConnected &&
			!isWalletLoading &&
			(reduceOnly || availableBalance > 0) &&
			!validation.needsApproval &&
			!isAvailabilityBlocked &&
			!tradeActionsBlocked,
		marketReady: !!market && typeof market.assetId === "number" && markPriceStatus === "success",
		positionReady: positionSnapshotReady,
		draft: {
			size: sizeInput,
			limitPrice: limitPriceInput,
			triggerPrice: triggerPriceInput,
			tpPrice: tpPriceInput,
			slPrice: slPriceInput,
			scaleStartPrice: scaleStartPriceInput,
			scaleEndPrice: scaleEndPriceInput,
		},
	};
	const visibleValidationErrors = getOrderValidationPresentation(
		validation.validationErrors,
		validationPresentationState,
	);
	const inlineTpSlPriceErrors = getTpSlPriceErrors({
		assetId: market?.assetId ?? null,
		szDecimals: orderEntryData.szDecimals,
		referencePrice: price,
		tpPrice: tpPriceInput,
		slPrice: slPriceInput,
		side,
	});
	const displayValidationError = visibleValidationErrors
		.filter((error) => !isOrderSizeValidationError(error) && !isInlineTpSlValidationError(error, inlineTpSlPriceErrors))
		.map((error) => error.message)
		.join(" \u2022 ");

	const buttonContent = useButtonContent({
		isConnected,
		availableBalance,
		reduceOnly,
		isBalanceLoading: isAvailabilityLoading || isAvailabilityStale || isAvailabilityBlocked,
		hasBalanceError: hasAvailabilityError,
		canDeposit: depositAvailability.available,
		depositUnavailableReason: getFundsAvailabilityNotice(depositAvailability),
		tradingBlocked: tradeActionsBlocked,
		validation: { ...validation, canSubmit: validation.canSubmit && !isAvailabilityBlocked },
		isSignerReady,
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

	function handleCtaClick() {
		if (sizeInteractionRef.current) return;
		buttonContent.action();
	}

	function renderSummary() {
		if (twapOrder) {
			return (
				<TwapOrderSummary
					compact
					twapMinutesNum={twapMinutesNum}
					twapTriggerPriceNum={twapTriggerPriceNum}
					twapStopPriceNum={twapStopPriceNum}
					side={side}
					feeQuote={feeQuote}
					szDecimals={market?.szDecimals}
					marketKind={market?.kind}
				/>
			);
		}
		if (scaleOrder) {
			return (
				<ScaleOrderSummary
					compact
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
				compact
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
		<TradePanelBodyView
			onIntent={warmDesktopTradeSettingsModals}
			overlays={
				<>
					<LazyDialogHost
						open={activeModal === "marginMode"}
						onOpenChange={handleMarginModalOpenChange}
						presentation="modal"
					>
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
							showLeverage={false}
							onApply={handleMarginApply}
							marketIdentity={leverageInteractionIdentity}
						/>
					</LazyDialogHost>
					<LazyDialogHost
						open={activeModal === "leverage"}
						onOpenChange={handleLeverageModalOpenChange}
						presentation="modal"
					>
						<LeverageModal
							open={activeModal === "leverage"}
							onOpenChange={handleLeverageModalOpenChange}
							currentLeverage={currentLeverage}
							pendingLeverage={pendingLeverage}
							committedLeverage={committedLeverage}
							maxLeverage={maxLeverage}
							onPendingLeverageChange={setPendingLeverage}
							isUpdating={isLeverageUpdating}
							onApply={handleLeverageApply}
							marketIdentity={leverageInteractionIdentity}
							marginTiers={marginTiers}
							quoteSymbol={getTpSlCollateralSymbol(market)}
						/>
					</LazyDialogHost>
					<LazyDialogHost
						open={activeModal === "accountMode"}
						onOpenChange={handleAccountModeModalOpenChange}
						presentation="modal"
					>
						<AccountModeModal
							open={activeModal === "accountMode"}
							onOpenChange={handleAccountModeModalOpenChange}
							currentMode={accountModeControl.accountAbstraction}
							isLoading={accountModeControl.isLoading}
							isUpdating={accountModeControl.isUpdating}
							canChange={accountModeControl.canSet}
							portfolioMarginActivationEnabled={accountModeControl.portfolioMarginActivationEnabled}
							onConnect={() => setActiveModal("wallet")}
							onApply={handleAccountModeChange}
						/>
					</LazyDialogHost>
					{displayedConfirmation && (
						<OrderConfirmationModal
							open={confirmation.pending !== null}
							draft={displayedConfirmation.draft}
							dontShowAgain={confirmation.dontShowAgain}
							onDontShowAgainChange={confirmation.setDontShowAgain}
							onConfirm={confirmation.confirm}
							onOpenChange={confirmation.cancel}
						/>
					)}
					{activeModal === "wallet" && (
						<Suspense fallback={null}>
							<WalletModal open onOpenChange={(open) => setActiveModal(open ? "wallet" : null)} />
						</Suspense>
					)}
				</>
			}
			header={
				<TradeHeader
					compact
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
			}
			footer={
				<TradePanelFooterView
					actions={
						<>
							{displayValidationError && <div className="text-xs text-error">{displayValidationError}</div>}

							{approvalError && (
								<div className="text-xs text-error">{getApprovalErrorMessage(approvalError.cause)}</div>
							)}

							{tradeRestricted && !buttonContent.disabledReason ? (
								<TradeCtaView
									variant="restricted"
									label={t(TRADE_PANEL_LABELS.regionRestricted)}
									disabled
									aria-label={t(TRADE_PANEL_LABELS.regionRestricted)}
								/>
							) : (
								<TradeCtaView
									variant={buttonContent.variant}
									label={buttonContent.text}
									onClick={handleCtaClick}
									disabled={buttonContent.disabled}
									aria-label={buttonContent.text}
									iconLeft={isRegistering ? <ButtonLoading /> : undefined}
								/>
							)}
							{buttonContent.disabledReason ? (
								<output className="text-center text-xs text-trading-panel-muted">{buttonContent.disabledReason}</output>
							) : null}
						</>
					}
					summary={renderSummary()}
				/>
			}
			fields={
				<TradeFormFields
					orderEntryData={orderEntryData}
					visibleValidationErrors={visibleValidationErrors}
					showTpSlValidation={validationPresentationState.accountReady && validationPresentationState.marketReady}
					price={price}
					positionSize={positionSize}
					swapTargetToken={swapTargetToken}
					onSizeModeToggle={handleSizeModeToggle}
					onSizePercentApply={handleSizePercentApply}
					onSizeInteractionChange={handleSizeInteractionChange}
					onSwapClick={() => {
						if (swapTargetToken) openSwapModal(DEFAULT_QUOTE_TOKEN, swapTargetToken);
					}}
				/>
			}
		/>
	);
}
