import { useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { Button } from "@sairn/ui";
import { type ChangeEvent, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useSwitchChain, useWalletClient } from "wagmi";
import { LazyDialogHost } from "@/components/ui/lazy-dialog-host";
import { getFormattedMidPrice } from "@/components/ui/price-input";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { ARBITRUM_CHAIN_ID } from "@/config/contracts";
import { TRADE_PANEL_LABELS } from "@/config/trade-panel-labels";
import { get24hChange, getPositionDex } from "@/domain/market";
import { getFundsAvailabilityNotice } from "@/domain/trade/data-presentation";
import { getOrderEntryReferencePrice, isLiveMarkPriceReady } from "@/domain/trade/market-price";
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
import { getSizeInputMaxDecimals, getSliderValue } from "@/domain/trade/order/size";
import { getOrderActionStage } from "@/domain/trade/order-action-stage";
import type { OrderConfirmationDraft } from "@/domain/trade/order-confirmation";
import { buildOrderFeeQuote, resolveEstimatedProtocolRate } from "@/domain/trade/order-fee-quote";
import { hasOrderSizeValidationError } from "@/domain/trade/order-size-validation";
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
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useMarketSlippageEstimate } from "@/hooks/trade/use-market-slippage-estimate";
import { useOrderConfirmation } from "@/hooks/trade/use-order-confirmation";
import { useOrderEntryData } from "@/hooks/trade/use-order-entry-data";
import { type OrderSubmitDraftInput, useOrderSubmit } from "@/hooks/trade/use-order-submit";
import { useProspectiveCrossMarginAccount } from "@/hooks/trade/use-prospective-cross-margin-account";
import { useSizeSliderInteraction } from "@/hooks/trade/use-size-slider-interaction";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatTransferError } from "@/lib/errors/format";
import { formatPrice, formatSlippageBps, formatToken, formatUSD } from "@/lib/format";
import {
	getMarketCapabilities,
	type UnifiedMarketInfo,
	useSelectedMarketInfo,
	useTradingAuthorization,
	useTradingStatus,
	useUserPositions,
} from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import type { MarginMode } from "@/lib/trade/margin-mode";
import { isPositive, toNumber, toNumberOrZero } from "@/lib/trade/numbers";
import {
	canUseTpSl as canUseTpSlForOrder,
	isScaleOrderType,
	isStopOrderType,
	isTakeProfitOrderType,
	isTriggerOrderType,
	isTwapOrderType,
	usesLimitPrice as usesLimitPriceForOrder,
	usesTriggerPrice as usesTriggerPriceForOrder,
} from "@/lib/trade/order-types";
import { getOrderValidationPresentation, isInlineTpSlValidationError } from "@/lib/trade/order-validation-presentation";
import { getTpSlCollateralSymbol } from "@/lib/trade/tpsl";
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
	useLimitPrice,
	useOrderEntryActions,
	useOrderSide,
	useOrderSize,
	useOrderSizeSource,
	useOrderType,
	useReduceOnly,
	useScaleEnd,
	useScaleLevels,
	useScaleSkew,
	useScaleStart,
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
import { TokenSelector } from "../chart/token-selector";
import { OrderFeeSummaryValue } from "../components/order-fee-summary-value";
import { MarginModeModal, warmTradeSettingsModals } from "../tradebox/lazy-trade-settings-modals";
import type { MobileTradeSettingsTab } from "../tradebox/margin-mode-modal";
import { OrderConfirmationModal } from "../tradebox/order-confirmation-modal";
import { ScaleOrderSummary } from "../tradebox/scale-order-summary";
import { TradeCtaView } from "../tradebox/trade-cta-view";
import { TradeFormScale } from "../tradebox/trade-form-scale";
import { TradeFormTif } from "../tradebox/trade-form-tif";
import { TradeFormTpSl } from "../tradebox/trade-form-tp-sl";
import { TradeFormTwap } from "../tradebox/trade-form-twap";
import { TradeHeader } from "../tradebox/trade-header";
import { TradeOptionCheckboxes } from "../tradebox/trade-option-checkboxes";
import { TwapOrderSummary } from "../tradebox/twap-order-summary";
import { MobileBottomNavSpacer } from "./mobile-bottom-nav";
import { MobileTradeAvailableView } from "./mobile-trade-available-view";
import { MobileTradeCtaFrameView } from "./mobile-trade-cta-frame-view";
import { MobileTradeFrameView } from "./mobile-trade-frame-view";
import { MobileTradePriceField } from "./mobile-trade-price-field";
import { MobileTradeScrollArea } from "./mobile-trade-scroll-area";
import { MobileTradeSizeControl } from "./mobile-trade-size-control";
import { MobileSlippageRowView, MobileSummaryRowView, MobileTradeSummaryView } from "./mobile-trade-summary-view";

const WalletModal = createLazyComponent(() => import("../components/wallet-modal"), "WalletModal");

interface Props {
	active?: boolean;
	className?: string;
	embedded?: boolean;
	sizeMode: SizeMode;
	onSizeModeChange: (sizeMode: SizeMode) => void;
}

function warmMobileTradeSettingsModals() {
	warmTradeSettingsModals("mobile");
}

export function MobileTradeView({ active = true, className, embedded, sizeMode, onSizeModeChange }: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const validationErrorId = useId();
	const { address, isConnected } = useWalletSession();
	const depositAvailability = useDepositAvailability();
	const { data: walletClient, isLoading: isWalletLoading, error: walletClientError } = useWalletClient();
	const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

	const needsChainSwitch = !!walletClientError && walletClientError.message.includes("does not match");

	const { data: market } = useSelectedMarketInfo();
	const crossMarginSnapshot = useProspectiveCrossMarginAccount(market);
	const userPositions = useUserPositions();
	const navigateToMarket = useMarketNavigation();

	function handleMarketChange(marketName: string, nextMarket?: UnifiedMarketInfo) {
		navigateToMarket(marketName, nextMarket);
	}

	const slippageBps = useMarketOrderSlippageBps();
	const slippagePercent = useMarketOrderSlippagePercent();

	const selectedPrice = useSelectedPrice();

	const orderType = useOrderType();
	const twapOrder = isTwapOrderType(orderType);
	const requiresBuilderFee = !twapOrder;
	const { isReady, isSignerReady, isSignerLoading, isBuilderFeeLoading, signerMode } = useTradingStatus();
	const isTradingAuthorized = requiresBuilderFee ? isReady : isSignerReady;
	const { authorize, status: registerStatus } = useTradingAuthorization({ requiresBuilderFee });
	const canApprove = !!walletClient && !!address;
	const isRegistering =
		registerStatus === "approving_fee" || registerStatus === "approving_agent" || registerStatus === "verifying";
	const isApprovalLoading = isSignerReady ? requiresBuilderFee && isBuilderFeeLoading : isSignerLoading;
	const scaleOrder = isScaleOrderType(orderType);
	const side = useOrderSide();
	const {
		setOrderType,
		setSide,
		setTpSlEnabled,
		setLimitPriceFromPrefill,
		setLimitPriceFromUser,
		setSize: setSizeInput,
		setReduceOnly: setReduceOnlyChecked,
		setTriggerPrice,
	} = useOrderEntryActions();
	const tpSlEnabled = useTpSlEnabled();
	const tpSlReturnInvalid = useTpSlReturnInvalid();
	const tpPrice = useTpPrice();
	const slPrice = useSlPrice();
	const tif = useTif();
	const triggerPrice = useTriggerPrice();
	const scaleStartPriceInput = useScaleStart();
	const scaleEndPriceInput = useScaleEnd();
	const scaleLevelsNum = useScaleLevels();
	const scaleSkewInput = useScaleSkew();
	const twapMinutesNum = useTwapMinutes();
	const twapRandomize = useTwapRandomize();
	const twapAdvancedEnabled = useTwapAdvancedEnabled();
	const twapTriggerPriceInput = useTwapTriggerPrice();
	const twapStopPriceInput = useTwapStopPrice();
	const sizeInput = useOrderSize();
	const sizeSource = useOrderSizeSource();
	const { setSizeSelection } = useOrderEntryActions();
	const sizeInteractionRef = useRef(false);
	function handleSizeInteractionChange(active: boolean) {
		sizeInteractionRef.current = active;
	}
	const limitPriceInput = useLimitPrice();
	const reduceOnlyChecked = useReduceOnly();
	const capabilities = getMarketCapabilities(market);
	const reduceOnly = capabilities.hasReduceOnly && reduceOnlyChecked;
	const [approvalError, setApprovalError] = useState<{ cause: unknown } | null>(null);

	const canUseTpSl = canUseTpSlForOrder(orderType);

	const [walletModalOpen, setWalletModalOpen] = useState(false);
	const [showMarginDialog, setShowMarginDialog] = useState(false);
	const [settingsTab, setSettingsTab] = useState<MobileTradeSettingsTab>("margin");
	const [marginDialogView, setMarginDialogView] = useState<"margin" | "leverage">("margin");
	const { open: openDepositModal } = useDepositModalActions();
	const { open: openEstablishConnectionModal } = useEstablishConnectionModalActions();
	const { open: openSettingsDialog } = useSettingsDialogActions();
	const geoRestriction = useGeoRestriction();
	const tradeActionsBlocked = geoRestriction.actionsBlocked;
	const tradeRestricted = geoRestriction.tradeRestricted;

	const usesLimitPrice = usesLimitPriceForOrder(orderType);
	const usesTriggerPrice = usesTriggerPriceForOrder(orderType);
	const isTriggerOrder = isTriggerOrderType(orderType);
	const markPx = toNumberOrZero(market?.markPx);
	const executionReferencePx = toNumber(market?.midPx) ?? markPx;
	const markPriceStatus = market?.markPriceStatus ?? "loading";
	const marketType = market?.kind === "spot" ? "spot" : "perp";
	const twapPriceFormat = { assetId: market?.assetId, szDecimals: market?.szDecimals ?? 0 };
	const { triggerPx: twapTriggerPx, stopPx: twapStopPx } = resolveTwapPriceInputs(
		twapAdvancedEnabled,
		twapTriggerPriceInput,
		twapStopPriceInput,
		twapPriceFormat,
	);
	const twapTriggerPriceNum = toNumber(twapTriggerPx);
	const twapStopPriceNum = toNumber(twapStopPx);
	const scaleStartPriceNum = toNumber(scaleStartPriceInput);
	const scaleEndPriceNum = toNumber(scaleEndPriceInput);
	const scaleSkewNum = resolveScaleSkewNumber(scaleSkewInput);
	const requiresLiveMarkPrice = orderType === "market" || isTriggerOrder || twapOrder;
	const midReferencePrice = getOrderEntryReferencePrice(market);
	const formattedMidForPrefill = getFormattedMidPrice(
		midReferencePrice,
		market?.szDecimals,
		marketType,
		market?.assetId,
	);
	const limitPrefillIdentity = `${market?.name ?? ""}|${orderType}`;
	useEffect(() => {
		if (!active || !usesLimitPrice || formattedMidForPrefill === undefined) return;
		setLimitPriceFromPrefill(limitPrefillIdentity, formattedMidForPrefill);
	}, [active, usesLimitPrice, limitPrefillIdentity, formattedMidForPrefill, setLimitPriceFromPrefill]);

	const position = market?.name ? userPositions.getPosition(market.name, getPositionDex(market)) : null;
	const positionSnapshotReady = !userPositions.isLoading && !userPositions.hasError && !userPositions.isStale;
	const validatedPositionSize = positionSnapshotReady ? (position?.szi ?? "0") : null;
	const {
		accountAbstraction,
		availabilityStatus,
		availabilityReceivedAt,
		availabilityMaxAgeMs,
		executionAvailability,
		isSpotMarket,
		baseToken,
		quoteToken,
		szDecimals,
		availableBalance,
		isAvailabilityLoading,
		isAvailabilityBlocked,
		isBalanceAvailabilityBlocked,
		conversionPrice,
		isAvailabilityStale,
		hasAvailabilityError,
		isOpenInterestCapped,
		availableBalanceToken,
		spotBalance,
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
	} = useOrderEntryData({
		market,
		side,
		markPx,
		sizeMode,
		sizeInput,
		limitPx: usesLimitPrice ? toNumberOrZero(limitPriceInput) : undefined,
		reduceOnly,
		positionSnapshot: {
			ready: positionSnapshotReady,
			receivedAt: userPositions.receivedAt,
			signedSize: validatedPositionSize ?? undefined,
		},
		marketOrderSizing: orderType === "market" ? { referencePx: executionReferencePx, slippageBps } : null,
	});
	const slippageEstimate = useMarketSlippageEstimate(market?.name, side, sizeValue, active && orderType === "market");
	const estimatedSlippageText = formatSlippageBps(slippageEstimate?.slippageBps, {
		lowerBound: slippageEstimate?.exceedsVisibleDepth,
	});

	const orderExecutionStateRef = useRef<EntryOrderExecutionState>({
		active,
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
		active,
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
	} = useOrderSubmit({
		executionGuard,
		twapExecutionGuard,
		getPositionSize: getLivePositionSize,
	});
	const accountModeControl = useAccountAbstractionControl(accountAbstraction);

	useEffect(() => {
		orderExecutionStateRef.current.active = active;
		return () => {
			orderExecutionStateRef.current.active = false;
		};
	}, [active]);

	useEffect(() => {
		if (active && isSpotMarket && isTriggerOrder) setOrderType("market");
	}, [active, isSpotMarket, isTriggerOrder, setOrderType]);

	useEffect(() => {
		if (selectedPrice === null) return;

		const price = getSelectedPriceForMarket(selectedPrice, market?.name);
		getOrderbookActionsStore().actions.clearSelectedPrice();
		if (price === null) return;

		setOrderType("limit");
		setLimitPriceFromUser(`${market?.name ?? ""}|limit`, price);
	}, [market?.name, selectedPrice, setOrderType, setLimitPriceFromUser]);
	const price = getOrderPrice(
		orderType,
		executionReferencePx,
		limitPriceInput,
		triggerPrice,
		scaleStartPriceInput,
		scaleEndPriceInput,
	);
	const { takerRate, makerRate } = useMarketFeeRates(market);
	const builderFeeTenthsBps = useBuilderFeeTenthsBps();
	const feeRate = resolveEstimatedProtocolRate({ orderType, tif, takerRate, makerRate });
	const feeQuote = buildOrderFeeQuote({
		orderValue,
		protocolRate: feeRate,
		builderFeeTenthsBps,
		marketKind: isSpotMarket ? "spot" : "perp",
		side,
		execution: twapOrder ? "twap" : "order",
	});
	const { marginRequired } = getOrderMetrics({
		sizeValue,
		price: conversionPrice,
		leverage: capabilities.isLeveraged ? leverage : null,
		reduceOnly,
	});
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
		needsAgentApproval: !isTradingAuthorized,
		isReadyToTrade: isTradingAuthorized,
		price,
		sizeValue,
		orderValue,
		side,
		usesLimitPrice,
		usesTriggerPrice,
		triggerPriceNum: toNumber(triggerPrice),
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
					stopOrder: isStopOrderType(orderType),
					takeProfitOrder: isTakeProfitOrderType(orderType),
					positionSize: validatedPositionSize,
					sizeForOrder,
					reduceOnly,
					openInterestCapped: isOpenInterestCapped,
					tpSlEnabled,
					canUseTpSl,
					tpSlReturnInvalid,
					tpPriceNum: toNumber(tpPrice),
					slPriceNum: toNumber(slPrice),
				}),
	);

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
			triggerPrice,
			tpPrice,
			slPrice,
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
		szDecimals,
		referencePrice: price,
		tpPrice,
		slPrice,
		side,
	});
	const validationSnapshot = {
		text: visibleValidationErrors
			.filter((error) => !isInlineTpSlValidationError(error, inlineTpSlPriceErrors))
			.map((error) => error.message)
			.join(" \u2022 "),
		hasSizeError: hasOrderSizeValidationError(visibleValidationErrors),
	};

	function applySizeFromPercent(pct: number) {
		if (maxSize <= 0) return;
		applySizePercent(pct);
	}

	const sliderInteractionIdentity = `${leverageInteractionIdentity}:${side}:${orderType}:${reduceOnly}:${sizeMode}:${szDecimals}`;
	const sliderInteraction = useSizeSliderInteraction({
		sizeSource,
		restoreSizeSelection: setSizeSelection,
		onInteractionChange: handleSizeInteractionChange,
		applyPercent: applySizeFromPercent,
		interactionIdentity: sliderInteractionIdentity,
		setSizeInput,
		sizeInput,
	});

	function handleSizeModeToggle() {
		toggleSizeDenomination();
		onSizeModeChange(sizeMode === "base" ? "quote" : "base");
	}

	function handleSizeInputChange(event: ChangeEvent<HTMLInputElement>) {
		setSizeInput(event.target.value);
	}

	function handleSwitchChain() {
		switchChain({ chainId: ARBITRUM_CHAIN_ID });
	}

	function handleMarginSettingsOpen() {
		setMarginDialogView("margin");
		setSettingsTab("margin");
		setShowMarginDialog(true);
	}

	function handleLeverageSettingsOpen() {
		setMarginDialogView("leverage");
		setShowMarginDialog(true);
	}

	const handleAccountModeChange = useCallback(
		async (nextAccountMode: SelectableAccountAbstraction) => {
			await accountModeControl.setAccountAbstraction(nextAccountMode);
		},
		[accountModeControl.setAccountAbstraction],
	);

	const handleMarginDialogOpenChange = useCallback(
		(open: boolean) => {
			if (!open) resetPendingLeverage();
			setShowMarginDialog(open);
		},
		[resetPendingLeverage],
	);

	const handleLeverageApply = useCallback(
		(mode: MarginMode, leverageValue: number) => applyMarginAndLeverage(mode, leverageValue),
		[applyMarginAndLeverage],
	);

	const handleWalletOpen = useCallback(() => setWalletModalOpen(true), []);

	const accountModeForm = useMemo(
		() => ({
			currentMode: accountModeControl.accountAbstraction,
			isLoading: accountModeControl.isLoading,
			isUpdating: accountModeControl.isUpdating,
			canChange: accountModeControl.canSet,
			portfolioMarginActivationEnabled: accountModeControl.portfolioMarginActivationEnabled,
			onConnect: handleWalletOpen,
			onApply: handleAccountModeChange,
		}),
		[
			accountModeControl.accountAbstraction,
			accountModeControl.canSet,
			accountModeControl.isLoading,
			accountModeControl.isUpdating,
			accountModeControl.portfolioMarginActivationEnabled,
			handleAccountModeChange,
			handleWalletOpen,
		],
	);

	async function handleApprove() {
		if (tradeActionsBlocked) return;
		if (isRegistering) return;
		if (!isConnected || !address) {
			setWalletModalOpen(true);
			return;
		}
		setApprovalError(null);
		if (!isSignerReady) {
			if (signerMode === "agent") openEstablishConnectionModal();
			return;
		}
		try {
			await authorize();
		} catch (error) {
			setApprovalError({ cause: error });
		}
	}

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

	async function handleSubmit() {
		if (isSubmitting || !canExecuteOrder()) return;
		if (!market || !baseToken || typeof market.assetId !== "number") return;

		const draftResetToken = captureDraftResetToken();
		if (!draftResetToken) return;

		const draft: OrderConfirmationDraft = {
			assetId: market.assetId,
			marketLabel: market.pairName ?? market.name,
			marketKind: isSpotMarket ? "spot" : "perp",
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
			triggerPrice: toNumber(triggerPrice),
			scaleStartPrice: scaleStartPriceNum,
			scaleEndPrice: scaleEndPriceNum,
			scaleLevels: scaleLevelsNum,
			scaleSkew: scaleSkewNum,
			twapMinutes: twapMinutesNum,
			twapRandomize,
			twapTriggerPrice: twapTriggerPriceNum,
			twapStopPrice: twapStopPriceNum,
			tpSlEnabled: tpSlEnabled && canUseTpSl,
			tpPrice: toNumber(tpPrice),
			slPrice: toNumber(slPrice),
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
					kind: isSpotMarket ? "spot" : "perp",
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
				triggerPriceInput: triggerPrice,
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
				tpPriceNum: toNumber(tpPrice),
				slPriceNum: toNumber(slPrice),
				twapOrder,
				scaleOrder,
				triggerOrder: isTriggerOrder,
			},
			draft,
		);
	}

	async function executeSubmit(input: OrderSubmitDraftInput) {
		await submitOrder({ ...input, price, executionReferencePx, markPx });
	}

	const confirmation = useOrderConfirmation({ execute: executeSubmit, canExecute: canExecuteOrder });

	const sliderValue = getSliderValue(sizeValue, maxSize);

	const buttonContent = getMobileOrderButtonContent({
		isConnected,
		needsChainSwitch,
		isSwitchingChain,
		availableBalance,
		reduceOnly,
		isBalanceLoading: isAvailabilityLoading || isAvailabilityStale || isAvailabilityBlocked,
		hasBalanceError: hasAvailabilityError,
		canDeposit: depositAvailability.available,
		depositUnavailableReason: getFundsAvailabilityNotice(depositAvailability),
		tradingBlocked: tradeActionsBlocked,
		needsApproval: validation.needsApproval,
		isSignerReady,
		isApprovalLoading,
		canSubmit: validation.canSubmit && !isAvailabilityBlocked,
		isRegistering,
		canApprove,
		isSubmitting,
		side,
		sideLabel: sideLabels[side],
		labels: {
			connect: t`Connect Wallet`,
			switching: t`Switching...`,
			switchChain: t`Switch to Arbitrum`,
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

	function handleCtaClick() {
		if (sizeInteractionRef.current) return;
		buttonContent.action();
	}

	const isFormDisabled = !isConnected || isAvailabilityBlocked || (!reduceOnly && availableBalance <= 0);
	const maxSizeLabel = reduceOnly ? t`Use max reducible size` : t`Use max available balance`;
	const sizeModeLabel = sizeMode === "base" ? baseToken || "—" : quoteToken || "—";
	const priceUnitLabel = quoteToken || "USDC";

	function formatAvailableBalance(): string {
		const decimals = isSpotMarket && side === "sell" ? szDecimals : 2;
		return formatToken(!isConnected || isBalanceAvailabilityBlocked ? "0" : availableBalance, decimals);
	}

	const change24h = get24hChange(market?.prevDayPx, market?.markPx);
	const priceColorClass = change24h !== null ? getValueColorClass(change24h) : "text-fg";
	const isMarginDialogUpdating = marginDialogView === "leverage" ? isLeverageUpdating : isSwitchingMode;

	return (
		<MobileTradeFrameView embedded={embedded} className={className} onIntent={warmMobileTradeSettingsModals}>
			<LazyDialogHost open={showMarginDialog} onOpenChange={handleMarginDialogOpenChange} presentation="drawer">
				<MarginModeModal
					open={showMarginDialog}
					onOpenChange={handleMarginDialogOpenChange}
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
					isUpdating={isMarginDialogUpdating}
					showLeverage={capabilities.isLeveraged}
					onApply={handleLeverageApply}
					presentation="drawer"
					mobileView={marginDialogView}
					marketIdentity={leverageInteractionIdentity}
					marketLabel={market?.pairName ?? market?.name}
					settingsTab={settingsTab}
					onSettingsTabChange={setSettingsTab}
					accountModeForm={accountModeForm}
					marginTiers={marginTiers}
					quoteSymbol={getTpSlCollateralSymbol(market)}
				/>
			</LazyDialogHost>
			<div className={cn("shrink-0 border-b border-stroke-weak/60 bg-surface px-4 py-2", embedded && "hidden")}>
				<div className="flex min-w-0 items-center justify-between gap-2">
					<TokenSelector selectedMarket={market} onValueChange={handleMarketChange} />
					<div className="min-w-0 text-right">
						<div className={cn("truncate whitespace-nowrap text-sm font-semibold tabular-nums", priceColorClass)}>
							{formatPrice(markPx || null, { szDecimals: market?.szDecimals, marketType })}
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
			<MobileTradeScrollArea embedded={embedded}>
				<TradeHeader
					orderType={orderType}
					side={side}
					sideLabels={sideLabels}
					marketKind={market?.kind}
					onOrderTypeChange={setOrderType}
					onSideChange={setSide}
					marginMode={marginMode}
					leverage={leverage}
					onMarginLeverageClick={handleMarginSettingsOpen}
					onMarginModeClick={handleMarginSettingsOpen}
					onLeverageClick={handleLeverageSettingsOpen}
					isLeveraged={capabilities.isLeveraged}
					compact={embedded}
					layout="mobile"
				/>

				<MobileTradeAvailableView
					label={t`Available`}
					aria-label={maxSizeLabel}
					title={maxSizeLabel}
					value={formatAvailableBalance()}
					token={availableBalanceToken}
					disabled={isFormDisabled || maxSize <= 0}
					onClick={() => applySizeFromPercent(100)}
				/>

				{usesTriggerPrice && (
					<MobileTradePriceField
						label={t`Trigger Price`}
						unitLabel={priceUnitLabel}
						inputMode="decimal"
						placeholder="0.00"
						value={triggerPrice}
						onChange={(e: ChangeEvent<HTMLInputElement>) => setTriggerPrice(e.target.value)}
						midPrice={midReferencePrice}
						szDecimals={market?.szDecimals}
						marketType={marketType}
						assetId={market?.assetId}
						disabled={isFormDisabled}
					/>
				)}

				{usesLimitPrice && (
					<div className={cn(embedded ? "space-y-1.5" : "space-y-2")}>
						<MobileTradePriceField
							label={t`Price`}
							unitLabel={priceUnitLabel}
							inputMode="decimal"
							placeholder="0.00"
							value={limitPriceInput}
							onChange={(e: ChangeEvent<HTMLInputElement>) =>
								setLimitPriceFromUser(limitPrefillIdentity, e.target.value)
							}
							onMidClick={(value) => setLimitPriceFromUser(limitPrefillIdentity, value)}
							midPrice={midReferencePrice}
							szDecimals={market?.szDecimals}
							marketType={marketType}
							assetId={market?.assetId}
							disabled={isFormDisabled}
						/>
					</div>
				)}

				<MobileTradeSizeControl
					canUsePercent={!isFormDisabled && maxSize > 0}
					disabled={isFormDisabled}
					sliderPaused={isConnected && isAvailabilityBlocked}
					errorId={validationSnapshot.hasSizeError ? validationErrorId : undefined}
					hasError={validationSnapshot.hasSizeError}
					interactionIdentity={sliderInteractionIdentity}
					maxAllowedDecimals={getSizeInputMaxDecimals(sizeMode, szDecimals)}
					onPercentChange={applySizeFromPercent}
					onPercentCancel={sliderInteraction.onPercentCancel}
					onPercentCommit={sliderInteraction.onPercentCommit}
					onPercentInteractionStart={sliderInteraction.onPercentInteractionStart}
					onPercentInteractionEnd={sliderInteraction.onPercentInteractionEnd}
					onSizeChange={handleSizeInputChange}
					onSizeModeToggle={handleSizeModeToggle}
					percentAriaLabel={`${t`Size`} (%)`}
					side={side}
					sizeAriaLabel={t`Size`}
					sizeInput={sizeInput}
					sizeLabel={t`Size`}
					sizeModeLabel={sizeModeLabel}
					sliderValue={sliderValue}
				/>

				{scaleOrder && (
					<TradeFormScale
						midPrice={midReferencePrice}
						szDecimals={szDecimals}
						marketType={marketType}
						assetId={market?.assetId}
						disabled={isFormDisabled}
						compact
						mobileSafe
					/>
				)}

				{twapOrder && (
					<TradeFormTwap
						reduceOnly={
							capabilities.hasReduceOnly
								? { checked: reduceOnlyChecked, disabled: !isConnected, onCheckedChange: setReduceOnlyChecked }
								: undefined
						}
						disabled={isFormDisabled}
						side={side}
						quoteToken={priceUnitLabel}
						markPx={markPx}
						assetId={market?.assetId}
						szDecimals={szDecimals}
						compact
						mobileSafe
					/>
				)}

				{((!twapOrder && capabilities.hasReduceOnly) ||
					(capabilities.hasTpSl && canUseTpSl) ||
					usesLimitPrice ||
					scaleOrder) && (
					<TradeOptionCheckboxes
						mobile
						embedded={embedded}
						tradingPanel
						reduceOnly={
							capabilities.hasReduceOnly
								? {
										checked: reduceOnlyChecked,
										disabled: !isConnected,
										onCheckedChange: setReduceOnlyChecked,
									}
								: undefined
						}
						tpSl={
							capabilities.hasTpSl && canUseTpSl
								? { checked: tpSlEnabled, disabled: isFormDisabled, onCheckedChange: setTpSlEnabled }
								: undefined
						}
					>
						{orderType === "limit" || scaleOrder ? (
							<TradeFormTif orderType={orderType} disabled={isFormDisabled} tradingPanel />
						) : null}
					</TradeOptionCheckboxes>
				)}

				{tpSlEnabled && canUseTpSl && (
					<TradeFormTpSl
						showValidation={validationPresentationState.accountReady && validationPresentationState.marketReady}
						assetId={market?.assetId ?? null}
						marketId={market?.name ?? null}
						referencePrice={price}
						size={sizeValue}
						szDecimals={szDecimals}
						quoteSymbol={getTpSlCollateralSymbol(market)}
						leverage={leverage}
						disabled={isFormDisabled}
						mobileTouchSafe
					/>
				)}

				<MobileTradeSummaryView embedded={embedded}>
					{twapOrder ? (
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
					) : scaleOrder ? (
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
					) : (
						<>
							{capabilities.isLeveraged && (
								<MobileSummaryRowView
									label={t`Liq. Price`}
									value={formatSummaryPrice(liqPrice, market?.szDecimals, marketType)}
									valueClass={getLiquidationPriceClassName(liqPrice, liqWarning)}
									compact={embedded}
								/>
							)}
							<MobileSummaryRowView
								label={t`Order Value`}
								value={orderValue > 0 ? formatUSD(orderValue, { compact: false }) : FALLBACK_VALUE_PLACEHOLDER}
								compact={embedded}
							/>
							{capabilities.isLeveraged && (
								<MobileSummaryRowView
									label={t`Margin Req.`}
									value={
										marginRequired !== null && marginRequired > 0
											? formatUSD(marginRequired, { compact: false })
											: FALLBACK_VALUE_PLACEHOLDER
									}
									compact={embedded}
								/>
							)}
							{orderType === "market" && (
								<MobileSlippageRowView
									labels={{
										slippage: t`Slippage`,
										estimatedSlippage: t`Est. Slippage`,
										max: t(TRADE_PANEL_LABELS.max),
									}}
									value={estimatedSlippageText ?? FALLBACK_VALUE_PLACEHOLDER}
									slippagePercent={slippagePercent}
									onClick={openSettingsDialog}
									embedded={embedded}
								/>
							)}
							<MobileSummaryRowView
								label={t(TRADE_PANEL_LABELS.estimatedFee)}
								value={<OrderFeeSummaryValue quote={feeQuote} />}
								valueClass="min-w-0 flex-1 shrink whitespace-normal text-trading-panel-muted"
								compact={embedded}
							/>
						</>
					)}
				</MobileTradeSummaryView>
			</MobileTradeScrollArea>

			<MobileTradeCtaFrameView embedded={embedded}>
				{validationSnapshot.text && (
					<p id={validationErrorId} role="alert" className="text-xs text-error mb-2">
						{validationSnapshot.text}
					</p>
				)}
				{approvalError && (
					<p className="text-xs text-error mb-2">
						<MobileTradingApprovalErrorMessage cause={approvalError.cause} />
					</p>
				)}
				{tradeRestricted && !buttonContent.disabledReason ? (
					<Button variant="outline" size={embedded ? "md" : "lg"} intent="neutral" disabled className="w-full">
						{t`Trading is not available in your region`}
					</Button>
				) : (
					<TradeCtaView
						mobile
						embedded={embedded}
						label={buttonContent.text}
						variant={buttonContent.variant}
						onClick={handleCtaClick}
						disabled={buttonContent.disabled}
						iconLeft={isSubmitting || isRegistering ? <SpinnerGapIcon className="size-5 animate-spin" /> : undefined}
					/>
				)}
				{geoRestriction.isResolved && buttonContent.disabledReason ? (
					<output className="mt-2 text-center text-xs text-trading-panel-muted">{buttonContent.disabledReason}</output>
				) : null}
				{!embedded && <MobileBottomNavSpacer />}
			</MobileTradeCtaFrameView>

			{confirmation.pending && (
				<OrderConfirmationModal
					open
					draft={confirmation.pending.draft}
					dontShowAgain={confirmation.dontShowAgain}
					onDontShowAgainChange={confirmation.setDontShowAgain}
					onConfirm={confirmation.confirm}
					onOpenChange={confirmation.cancel}
				/>
			)}

			{walletModalOpen && (
				<Suspense fallback={null}>
					<WalletModal open onOpenChange={setWalletModalOpen} />
				</Suspense>
			)}
		</MobileTradeFrameView>
	);
}

export function MobileTradingApprovalErrorMessage({ cause }: { cause: unknown }) {
	const { t } = useLingui();
	return cause instanceof Error
		? formatTransferError(cause, (descriptor) => t(descriptor))
		: t`Failed to enable trading`;
}

function getLiquidationPriceClassName(liqPrice: number | null, liqWarning: boolean): string | undefined {
	if (!liqPrice) return "text-trading-panel-muted";
	if (liqWarning) return "text-trading-panel-error";
	return undefined;
}

function formatSummaryPrice(value: number | null, szDecimals: number | undefined, marketType: "perp" | "spot"): string {
	return isPositive(value) ? formatPrice(value, { szDecimals, marketType }) : FALLBACK_VALUE_PLACEHOLDER;
}

interface MobileButtonContentInput {
	isConnected: boolean;
	needsChainSwitch: boolean;
	isSwitchingChain: boolean;
	availableBalance: number;
	reduceOnly?: boolean;
	isBalanceLoading: boolean;
	hasBalanceError: boolean;
	canDeposit: boolean;
	depositUnavailableReason?: string | null;
	tradingBlocked?: boolean;
	needsApproval: boolean;
	isSignerReady: boolean;
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
	deposit: string;
	signing: string;
	enableTrading: string;
}

export function getMobileOrderButtonContent(input: MobileButtonContentInput): ButtonContent {
	const stage = getOrderActionStage({
		isConnected: input.isConnected,
		needsChainSwitch: input.needsChainSwitch,
		needsApproval: input.needsApproval,
		isSignerReady: input.isSignerReady,
		hasBalanceError: input.hasBalanceError,
		isBalanceLoading: input.isBalanceLoading,
		availableBalance: input.availableBalance,
		reduceOnly: input.reduceOnly,
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
			text: input.isRegistering ? input.labels.signing : input.labels.enableTrading,
			action: input.onApprove,
			disabled: input.isRegistering || input.isApprovalLoading || !input.canApprove || input.tradingBlocked === true,
			variant: "cyan",
		};
	}
	if (stage === "balanceError" || stage === "balanceLoading") {
		return {
			text: input.sideLabel,
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
			disabledReason: input.canDeposit ? undefined : (input.depositUnavailableReason ?? undefined),
			variant: "cyan",
		};
	}
	return {
		text: input.sideLabel,
		action: input.onSubmit,
		disabled: !input.canSubmit || input.isSubmitting || input.tradingBlocked === true,
		variant: input.side,
	};
}
