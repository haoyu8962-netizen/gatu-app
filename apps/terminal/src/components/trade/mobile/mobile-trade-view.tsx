import { Button, Tooltip } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { PencilIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { type ChangeEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useSwitchChain, useWalletClient } from "wagmi";
import { getFormattedMidPrice } from "@/components/ui/price-input";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { ARBITRUM_CHAIN_ID } from "@/config/contracts";
import { DEFAULT_BUILDER_CONFIG } from "@/config/hyperliquid";
import { get24hChange, getPositionDex } from "@/domain/market";
import { isLiveMarkPriceReady } from "@/domain/trade/market-price";
import {
	assertEntryOrderExecutionAllowed,
	assertEntryTwapExecutionAllowed,
	type EntryOrderExecutionState,
} from "@/domain/trade/order/entry-execution-guard";
import { getLiquidationInfo } from "@/domain/trade/order/metrics";
import { getOrderPrice } from "@/domain/trade/order/price";
import { getSizeInputMaxDecimals, getSliderValue } from "@/domain/trade/order/size";
import { getOrderActionStage } from "@/domain/trade/order-action-stage";
import type { OrderConfirmationDraft } from "@/domain/trade/order-confirmation";
import { resolveScaleSkewNumber } from "@/domain/trade/orders";
import { formatTwapPriceInput, getTwapSuborderCount } from "@/domain/trade/twap-details";
import {
	type SelectableAccountAbstraction,
	useAccountAbstractionControl,
} from "@/hooks/trade/use-account-abstraction-control";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { useMarketFeeRates } from "@/hooks/trade/use-fee-rates";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useMarketSlippageEstimate } from "@/hooks/trade/use-market-slippage-estimate";
import { useOrderConfirmation } from "@/hooks/trade/use-order-confirmation";
import { useOrderEntryData } from "@/hooks/trade/use-order-entry-data";
import { type OrderSubmitDraftInput, useOrderSubmit } from "@/hooks/trade/use-order-submit";
import { getMidReferencePrice, useOrderbookMidPrice } from "@/hooks/trade/use-orderbook-mid-price";
import { useLingeringText } from "@/hooks/ui/use-lingering-text";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import {
	bpsToPercentage,
	formatDuration,
	formatNumber,
	formatPrice,
	formatSlippageBps,
	formatToken,
	formatUSD,
} from "@/lib/format";
import {
	type UnifiedMarketInfo,
	useAgentStatus,
	useSelectedMarketInfo,
	useTradingAuthorization,
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
	isTakerOrderType,
	isTriggerOrderType,
	isTwapOrderType,
	usesLimitPrice as usesLimitPriceForOrder,
	usesTriggerPrice as usesTriggerPriceForOrder,
} from "@/lib/trade/order-types";
import { getTpSlCollateralSymbol } from "@/lib/trade/tpsl";
import { getTwapStopPriceLabel } from "@/lib/trade/twap-labels";
import type { ButtonContent, Side, SizeMode } from "@/lib/trade/types";
import { perpInput, spotInput, useOrderValidation } from "@/lib/trade/use-order-validation";
import { getTradingCtaClass, getTradingCtaIntent } from "@/lib/ui/trading-cta";
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
	useScaleEnd,
	useScaleLevels,
	useScaleSkew,
	useScaleStart,
	useSlPrice,
	useTif,
	useTpPrice,
	useTpSlEnabled,
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
import { TokenSelector } from "../chart/token-selector";
import { MarginModeModal, type MobileTradeSettingsTab } from "../tradebox/margin-mode-modal";
import { OrderConfirmationModal } from "../tradebox/order-confirmation-modal";
import { TradeFormScale } from "../tradebox/trade-form-scale";
import { TradeFormTif } from "../tradebox/trade-form-tif";
import { TradeFormTpSl } from "../tradebox/trade-form-tp-sl";
import { TradeFormTwap } from "../tradebox/trade-form-twap";
import { TradeHeader } from "../tradebox/trade-header";
import { TradeOptionCheckboxes } from "../tradebox/trade-option-checkboxes";
import { MobileBottomNavSpacer } from "./mobile-bottom-nav";
import { MobileTradePriceField } from "./mobile-trade-price-field";
import { MobileTradeSizeControl } from "./mobile-trade-size-control";

const WalletModal = createLazyComponent(() => import("../components/wallet-modal"), "WalletModal");

const ERROR_LINGER_MS = 1500;

interface Props {
	active?: boolean;
	className?: string;
	embedded?: boolean;
	sizeMode: SizeMode;
	onSizeModeChange: (sizeMode: SizeMode) => void;
}

export function MobileTradeView({ active = true, className, embedded, sizeMode, onSizeModeChange }: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const { address, isConnected } = useWalletSession();
	const depositAvailability = useDepositAvailability();
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
	const canApprove = !!walletClient && !!address;
	const isRegistering =
		registerStatus === "approving_fee" || registerStatus === "approving_agent" || registerStatus === "verifying";
	const isApprovalLoading = isAgentReady ? isBuilderFeeLoading : isAgentLoading;

	const slippageBps = useMarketOrderSlippageBps();
	const slippagePercent = useMarketOrderSlippagePercent();

	const selectedPrice = useSelectedPrice();

	const orderType = useOrderType();
	const twapOrder = isTwapOrderType(orderType);
	const scaleOrder = isScaleOrderType(orderType);
	const side = useOrderSide();
	const { setOrderType, setSide, setTpSlEnabled, setTpPrice, setSlPrice, setTriggerPrice } = useOrderEntryActions();
	const tpSlEnabled = useTpSlEnabled();
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
	const twapTriggerPriceInput = useTwapTriggerPrice();
	const twapStopPriceInput = useTwapStopPrice();
	const [sizeInput, setSizeInput] = useState("");
	const [limitPriceInput, setLimitPriceInput] = useState("");
	const [reduceOnlyChecked, setReduceOnlyChecked] = useState(false);
	const [approvalError, setApprovalError] = useState<string | null>(null);

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
	const tradingUnavailableReason = !geoRestriction.isResolved
		? geoRestriction.isError
			? t`Unable to verify regional availability. Trading is temporarily unavailable.`
			: t`Checking regional availability. Trading is temporarily unavailable.`
		: null;

	const usesLimitPrice = usesLimitPriceForOrder(orderType);
	const usesTriggerPrice = usesTriggerPriceForOrder(orderType);
	const isTriggerOrder = isTriggerOrderType(orderType);
	const isMarketExecution = orderType === "market" || isTakerOrderType(orderType);
	const markPx = toNumberOrZero(market?.markPx);
	const executionReferencePx = toNumber(market?.midPx) ?? markPx;
	const markPriceStatus = market?.markPriceStatus ?? "loading";
	const marketType = market?.kind === "spot" ? "spot" : "perp";
	const twapPriceFormat = { assetId: market?.assetId, szDecimals: market?.szDecimals ?? 0 };
	const twapTriggerPx = formatTwapPriceInput(twapTriggerPriceInput, twapPriceFormat);
	const twapStopPx = formatTwapPriceInput(twapStopPriceInput, twapPriceFormat);
	const twapTriggerPriceNum = toNumber(twapTriggerPx);
	const twapStopPriceNum = toNumber(twapStopPx);
	const scaleStartPriceNum = toNumber(scaleStartPriceInput);
	const scaleEndPriceNum = toNumber(scaleEndPriceInput);
	const scaleSkewNum = resolveScaleSkewNumber(scaleSkewInput);
	const spotBuyTwapOrder = twapOrder && market?.kind === "spot" && side === "buy";
	const requiresLiveMarkPrice =
		orderType === "market" ||
		isTriggerOrder ||
		spotBuyTwapOrder ||
		(twapOrder && (isPositive(twapTriggerPriceNum) || isPositive(twapStopPriceNum)));
	const { midPx } = useOrderbookMidPrice(
		active && (usesLimitPrice || usesTriggerPrice || scaleOrder) ? market?.name : undefined,
	);
	const midReferencePrice = getMidReferencePrice(midPx, market?.markPx);
	const formattedMidForPrefill = getFormattedMidPrice(
		midReferencePrice,
		market?.szDecimals,
		marketType,
		market?.assetId,
	);
	const limitPrefillKey = active && usesLimitPrice ? `${market?.name ?? ""}|${orderType}` : null;
	const prefilledLimitKeyRef = useRef<string | null>(null);
	useEffect(() => {
		if (limitPrefillKey === null) {
			prefilledLimitKeyRef.current = null;
			return;
		}
		if (prefilledLimitKeyRef.current === limitPrefillKey) return;
		if (limitPriceInput !== "" || formattedMidForPrefill === undefined) return;
		prefilledLimitKeyRef.current = limitPrefillKey;
		setLimitPriceInput(formattedMidForPrefill);
	}, [limitPrefillKey, limitPriceInput, formattedMidForPrefill]);

	const {
		accountAbstraction,
		availabilityStatus,
		availabilityReceivedAt,
		availabilityMaxAgeMs,
		executionAvailability,
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
	} = useOrderEntryData({
		market,
		side,
		markPx,
		sizeMode,
		sizeInput,
		limitPx: usesLimitPrice ? toNumberOrZero(limitPriceInput) : undefined,
		marketOrderSizing: orderType === "market" ? { referencePx: executionReferencePx, slippageBps } : null,
	});
	const reduceOnly = capabilities.hasReduceOnly && reduceOnlyChecked;
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
		markPriceStatus,
		markPx: market?.markPx,
		markPriceReceivedAt: market?.markPriceReceivedAt,
		executionReferencePx: market?.midPx ?? market?.markPx,
		executionPriceReceivedAt: market?.midPx !== undefined ? market.midPriceReceivedAt : market?.markPriceReceivedAt,
		slippageBps,
	});
	orderExecutionStateRef.current = {
		active,
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
	const { handleSubmit: submitOrder, isSubmitting } = useOrderSubmit({
		executionGuard,
		twapExecutionGuard,
		onReset: resetSubmittedForm,
	});
	const accountModeControl = useAccountAbstractionControl(accountAbstraction);

	useEffect(() => {
		orderExecutionStateRef.current.active = active;
		return () => {
			orderExecutionStateRef.current.active = false;
		};
	}, [active]);

	useEffect(() => {
		if (active && isSpotMarket && (isTriggerOrder || twapOrder)) setOrderType("market");
	}, [active, isSpotMarket, isTriggerOrder, twapOrder, setOrderType]);

	useEffect(() => {
		if (selectedPrice === null) return;

		const price = getSelectedPriceForMarket(selectedPrice, market?.name);
		getOrderbookActionsStore().actions.clearSelectedPrice();
		if (price === null) return;

		setOrderType("limit");
		setLimitPriceInput(price);
	}, [market?.name, selectedPrice, setOrderType]);
	const price = getOrderPrice(
		orderType,
		executionReferencePx,
		limitPriceInput,
		triggerPrice,
		scaleStartPriceInput,
		scaleEndPriceInput,
	);
	const position = market?.name ? userPositions.getPosition(market.name, getPositionDex(market)) : null;
	const positionSize = toNumberOrZero(position?.szi);
	const validatedPositionSize =
		userPositions.isLoading || userPositions.hasError || userPositions.isStale ? null : positionSize;
	const { takerRate, makerRate } = useMarketFeeRates(market);
	const feeRate = isMarketExecution ? takerRate : makerRate;
	const feeRatePercent = `${(feeRate * 100).toFixed(4)}%`;
	const estimatedFee = orderValue * feeRate;
	const marginRequired = capabilities.isLeveraged && leverage > 0 ? orderValue / leverage : 0;

	const liquidationInfo = capabilities.isLeveraged ? getLiquidationInfo({ price, sizeValue, leverage, side }) : null;
	const liqPrice = liquidationInfo?.liqPrice ?? null;
	const liqWarning = liquidationInfo?.liqWarning ?? false;
	const liqValueClass = getLiquidationValueClass(liqPrice, liqWarning);
	const twapSuborderCount = getTwapSuborderCount(twapMinutesNum);
	const twapSizePerSuborder = twapSuborderCount > 0 ? sizeValue / twapSuborderCount : 0;

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
					reduceOnly,
					tpSlEnabled,
					canUseTpSl,
					tpPriceNum: toNumber(tpPrice),
					slPriceNum: toNumber(slPrice),
				}),
	);

	const validationErrorText =
		validation.errors.length > 0 && isConnected && availableBalance > 0 && !validation.needsApproval
			? validation.errors.join(" \u2022 ")
			: "";
	const displayValidationError = useLingeringText(validationErrorText, ERROR_LINGER_MS);

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

	function handleMarginSettingsOpen() {
		setMarginDialogView("margin");
		setSettingsTab("margin");
		setShowMarginDialog(true);
	}

	function handleLeverageSettingsOpen() {
		setMarginDialogView("leverage");
		setShowMarginDialog(true);
	}

	function handleAccountModeSettingsOpen() {
		setMarginDialogView("margin");
		setSettingsTab("account");
		setShowMarginDialog(true);
	}

	const handleAccountModeChange = useCallback(
		async (nextAccountMode: SelectableAccountAbstraction) => {
			const didUpdate = await accountModeControl.setAccountAbstraction(nextAccountMode);
			if (didUpdate) toast.success(t`Account mode updated`);
		},
		[accountModeControl.setAccountAbstraction, t],
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

	function resetSubmittedForm() {
		setSizeInput("");
		setLimitPriceInput("");
		setReduceOnlyChecked(false);
		setTpPrice("");
		setSlPrice("");
		setTriggerPrice("");
	}

	function canExecuteOrder() {
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

		const draft: OrderConfirmationDraft = {
			assetId: market.assetId,
			marketLabel: market.pairName ?? market.name,
			marketKind: isSpotMarket ? "spot" : "perp",
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
			estimatedFee,
			feeRatePercent,
			liqPrice,
			liqWarning,
			slippagePercent,
		};

		await confirmation.requestSubmit(
			{
				market: {
					assetId: market.assetId,
					kind: isSpotMarket ? "spot" : "perp",
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
				triggerPriceInput: triggerPrice,
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
		isBalanceLoading: isAvailabilityLoading,
		hasBalanceError: hasAvailabilityError,
		canDeposit: depositAvailability.available,
		depositUnavailableReason: depositAvailability.unavailableReason,
		tradingUnavailableReason,
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
			depositUnavailable: t`Deposit unavailable`,
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
	const priceUnitLabel = quoteToken || "USDC";

	function formatAvailableBalance(): string {
		if (!isConnected || isAvailabilityLoading || hasAvailabilityError) return FALLBACK_VALUE_PLACEHOLDER;
		const decimals = isSpotMarket && side === "sell" ? szDecimals : 2;
		return formatToken(availableBalance, decimals);
	}

	const change24h = get24hChange(market?.prevDayPx, market?.markPx);
	const priceColorClass = change24h !== null ? getValueColorClass(change24h) : "text-fg";

	return (
		<div className={cn("flex flex-col self-stretch", !embedded && "h-full min-h-0 bg-background", className)}>
			<MarginModeModal
				open={showMarginDialog}
				onOpenChange={handleMarginDialogOpenChange}
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
				showLeverage={capabilities.isLeveraged}
				onApply={handleLeverageApply}
				presentation="drawer"
				mobileView={marginDialogView}
				marketIdentity={market?.name}
				marketLabel={market?.pairName ?? market?.name}
				settingsTab={settingsTab}
				onSettingsTabChange={setSettingsTab}
				accountModeForm={accountModeForm}
			/>
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
			<div
				className={cn(
					"flex-1 flex flex-col overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
					!embedded && "min-h-0 overflow-y-auto overscroll-contain",
				)}
			>
				<div
					className={cn(
						embedded
							? "trade-panel-container flex-1 min-h-min flex flex-col justify-between px-2.5 py-1.5 space-y-2 font-market-close"
							: "trade-panel-container px-3 py-4 space-y-4",
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
						onMarginLeverageClick={handleMarginSettingsOpen}
						onMarginModeClick={handleMarginSettingsOpen}
						onLeverageClick={handleLeverageSettingsOpen}
						isLeveraged={capabilities.isLeveraged}
						accountMode={accountModeControl.accountAbstraction}
						isAccountModeLoading={accountModeControl.isLoading}
						isAccountModeUpdating={accountModeControl.isUpdating}
						onAccountModeClick={handleAccountModeSettingsOpen}
						hideSpotTwap
						compact={embedded}
						layout="mobile"
					/>

					<button
						type="button"
						onClick={() => applySizeFromPercent(100)}
						disabled={isFormDisabled || maxSize <= 0}
						className="relative flex min-h-7 w-full min-w-0 items-center justify-between gap-2 text-2xs text-trading-panel-muted after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] disabled:cursor-default"
					>
						<span className="shrink-0 whitespace-nowrap">{t`Available`}</span>
						<span
							className={cn(
								"inline-flex min-w-0 items-center justify-end gap-1 truncate whitespace-nowrap border-b border-dashed border-trading-panel-stroke-control text-right font-semibold tabular-nums text-trading-panel-fg",
								(isFormDisabled || maxSize <= 0) && "border-transparent",
							)}
						>
							<span className="tabular-nums text-trading-panel-fg">{formatAvailableBalance()}</span>
							<span className="tabular-nums text-trading-panel-muted">{availableBalanceToken}</span>
							{isAvailabilityStale ? (
								<Tooltip content={t`Loading...`} side="top">
									<SpinnerGapIcon className="size-3 shrink-0 animate-spin text-warning" aria-label={t`Loading...`} />
								</Tooltip>
							) : null}
							{hasAvailabilityError ? (
								<Tooltip content={t`Failed to load balances.`} side="top">
									<WarningCircleIcon
										className="size-3 shrink-0 text-trading-panel-error"
										aria-label={t`Failed to load balances.`}
									/>
								</Tooltip>
							) : null}
						</span>
					</button>

					{usesTriggerPrice && (
						<MobileTradePriceField
							label={t`Trigger Price`}
							unitLabel={priceUnitLabel}
							inputMode="decimal"
							placeholder="0.00"
							value={triggerPrice}
							onChange={(e: ChangeEvent<HTMLInputElement>) => setTriggerPrice(e.target.value)}
							onMidClick={setTriggerPrice}
							midPrice={midReferencePrice}
							szDecimals={market?.szDecimals}
							marketType={marketType}
							assetId={market?.assetId}
							disabled={isFormDisabled}
						/>
					)}

					{twapOrder && (
						<TradeFormTwap
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

					{usesLimitPrice && (
						<div className={cn(embedded ? "space-y-1.5" : "space-y-2")}>
							<MobileTradePriceField
								label={t`Price`}
								unitLabel={priceUnitLabel}
								inputMode="decimal"
								placeholder="0.00"
								value={limitPriceInput}
								onChange={(e: ChangeEvent<HTMLInputElement>) => setLimitPriceInput(e.target.value)}
								onMidClick={setLimitPriceInput}
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
						maxAllowedDecimals={getSizeInputMaxDecimals(sizeMode, szDecimals)}
						onPercentChange={applySizeFromPercent}
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

					{(capabilities.hasReduceOnly || (capabilities.hasTpSl && canUseTpSl) || usesLimitPrice || scaleOrder) && (
						<TradeOptionCheckboxes
							className={cn(
								"flex flex-wrap items-center gap-y-1",
								embedded ? "gap-x-2 text-2xs max-[379px]:gap-x-1" : "gap-x-4",
							)}
							tradingPanel
							reduceOnly={
								capabilities.hasReduceOnly
									? {
											checked: reduceOnlyChecked,
											disabled: isFormDisabled,
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

					<div className={cn("border-t border-trading-panel-stroke-row pt-2", embedded ? "text-2xs" : "text-xs")}>
						{twapOrder && (
							<>
								<SummaryRow
									label={t`Runtime`}
									value={twapMinutesNum > 0 ? formatDuration(twapMinutesNum) : FALLBACK_VALUE_PLACEHOLDER}
									compact={embedded}
								/>
								<SummaryRow
									label={t`Number of Orders`}
									value={formatSummaryCount(twapSuborderCount)}
									compact={embedded}
								/>
								<SummaryRow
									label={t`Size per Suborder`}
									value={
										twapSizePerSuborder > 0
											? formatToken(twapSizePerSuborder, { decimals: szDecimals, symbol: baseToken })
											: FALLBACK_VALUE_PLACEHOLDER
									}
									compact={embedded}
								/>
								{isPositive(twapTriggerPriceNum) && (
									<SummaryRow
										label={t`Trigger Price`}
										value={formatSummaryPrice(twapTriggerPriceNum, market?.szDecimals, marketType)}
										compact={embedded}
									/>
								)}
								{isPositive(twapStopPriceNum) && (
									<SummaryRow
										label={getTwapStopPriceLabel(side)}
										value={formatSummaryPrice(twapStopPriceNum, market?.szDecimals, marketType)}
										compact={embedded}
									/>
								)}
							</>
						)}
						{scaleOrder && (
							<>
								<SummaryRow
									label={t`Start Price`}
									value={formatSummaryPrice(scaleStartPriceNum, market?.szDecimals, marketType)}
									compact={embedded}
								/>
								<SummaryRow
									label={t`End Price`}
									value={formatSummaryPrice(scaleEndPriceNum, market?.szDecimals, marketType)}
									compact={embedded}
								/>
								<SummaryRow label={t`Number of Orders`} value={formatSummaryCount(scaleLevelsNum)} compact={embedded} />
								<SummaryRow label={t`Size Skew`} value={formatSummaryCount(scaleSkewNum)} compact={embedded} />
							</>
						)}
						{capabilities.isLeveraged && (
							<SummaryRow
								label={t`Liq. Price`}
								value={
									liqPrice ? formatPrice(liqPrice, { szDecimals: market?.szDecimals }) : FALLBACK_VALUE_PLACEHOLDER
								}
								valueClass={liqValueClass}
								labelClass="border-b border-dashed border-trading-panel-stroke-control"
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
						{orderType === "market" && (
							<>
								<SummaryRow
									label={t`Est. Slippage`}
									value={estimatedSlippageText ?? FALLBACK_VALUE_PLACEHOLDER}
									valueClass={estimatedSlippageText ? undefined : "text-trading-panel-muted"}
									compact={embedded}
								/>
								<div
									className={cn("flex min-w-0 items-center justify-between", embedded ? "gap-1 py-1" : "gap-2 py-1.5")}
								>
									<span className="min-w-0 truncate text-trading-panel-muted">{t`Slippage`}</span>
									<button
										type="button"
										onClick={openSettingsDialog}
										aria-label={t`Slippage`}
										className="relative inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-8 transition-opacity after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
									>
										<span className="tabular-nums text-trading-panel-error">{slippagePercent}%</span>
										<PencilIcon className="size-2.5 text-trading-panel-subtle" />
									</button>
								</div>
							</>
						)}
						<SummaryRow
							label={t`Est. Fee`}
							value={orderValue > 0 ? `${feeRatePercent} (${formatUSD(estimatedFee)})` : feeRatePercent}
							valueClass="text-trading-panel-muted"
							compact={embedded}
						/>
						{DEFAULT_BUILDER_CONFIG?.f ? (
							<SummaryRow
								label={t`Builder Fee`}
								value={`${bpsToPercentage(DEFAULT_BUILDER_CONFIG.f)}%`}
								valueClass="text-trading-panel-muted"
								compact={embedded}
							/>
						) : null}
					</div>
				</div>
			</div>

			<div
				className={cn(
					"shrink-0 border-t border-trading-panel-stroke-card bg-surface",
					embedded ? "px-2.5 py-2" : "px-3 py-3",
				)}
			>
				{displayValidationError && <p className="text-xs text-error mb-2">{displayValidationError}</p>}
				{approvalError && <p className="text-xs text-error mb-2">{approvalError}</p>}
				{tradeRestricted && !buttonContent.disabledReason ? (
					<Button variant="outline" size={embedded ? "md" : "lg"} intent="neutral" disabled className="w-full">
						{t`Trading is not available in your region`}
					</Button>
				) : (
					<Button
						variant="filled"
						size={embedded ? "md" : "lg"}
						onClick={buttonContent.action}
						disabled={buttonContent.disabled}
						intent={getTradingCtaIntent(buttonContent.variant)}
						className={cn(
							"w-full rounded-[10px] text-sm font-bold whitespace-nowrap shadow-none",
							embedded && "h-[38px]",
							getTradingCtaClass(buttonContent.variant),
						)}
						iconLeft={isSubmitting || isRegistering ? <SpinnerGapIcon className="size-5 animate-spin" /> : undefined}
					>
						{buttonContent.text}
					</Button>
				)}
				{buttonContent.disabledReason ? (
					<output className="mt-2 text-center text-xs text-trading-panel-muted">{buttonContent.disabledReason}</output>
				) : null}
				{!embedded && <MobileBottomNavSpacer />}
			</div>

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
	labelClass,
	compact,
}: {
	label: string;
	value: string;
	valueClass?: string;
	labelClass?: string;
	compact?: boolean;
}) {
	return (
		<div className={cn("flex min-w-0 items-center justify-between", compact ? "gap-1 py-1" : "gap-2 py-1.5")}>
			<span className={cn("min-w-0 truncate text-trading-panel-muted", labelClass)}>{label}</span>
			<span
				className={cn(
					"shrink-0 whitespace-nowrap text-right font-semibold tabular-nums",
					valueClass ?? "text-trading-panel-fg",
				)}
			>
				{value}
			</span>
		</div>
	);
}

function formatSummaryPrice(value: number | null, szDecimals: number | undefined, marketType: "perp" | "spot"): string {
	return isPositive(value) ? formatPrice(value, { szDecimals, marketType }) : FALLBACK_VALUE_PLACEHOLDER;
}

function formatSummaryCount(value: number | null): string {
	return isPositive(value) ? formatNumber(String(value)) : FALLBACK_VALUE_PLACEHOLDER;
}

function getLiquidationValueClass(liqPrice: number | null, liqWarning: boolean) {
	if (!liqPrice) return "text-trading-panel-muted";
	if (liqWarning) return "text-trading-panel-error";
	return "text-trading-panel-fg";
}

interface MobileButtonContentInput {
	isConnected: boolean;
	needsChainSwitch: boolean;
	isSwitchingChain: boolean;
	availableBalance: number;
	isBalanceLoading: boolean;
	hasBalanceError: boolean;
	canDeposit: boolean;
	depositUnavailableReason?: string | null;
	tradingUnavailableReason?: string | null;
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
	depositUnavailable: string;
	signing: string;
	enableTrading: string;
}

export function getMobileOrderButtonContent(input: MobileButtonContentInput): ButtonContent {
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
			disabled: input.isRegistering || input.isApprovalLoading || !input.canApprove || !!input.tradingUnavailableReason,
			disabledReason: input.tradingUnavailableReason ?? undefined,
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
			text: input.canDeposit ? input.labels.deposit : input.labels.depositUnavailable,
			action: input.canDeposit ? input.onDeposit : () => {},
			disabled: !input.canDeposit,
			disabledReason: input.canDeposit ? undefined : (input.depositUnavailableReason ?? undefined),
			variant: "cyan",
		};
	}
	return {
		text: input.sideLabel,
		action: input.onSubmit,
		disabled: !input.canSubmit || input.isSubmitting || !!input.tradingUnavailableReason,
		disabledReason: input.tradingUnavailableReason ?? undefined,
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
