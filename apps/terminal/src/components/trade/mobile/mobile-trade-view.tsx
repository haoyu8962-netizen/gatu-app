import { Button, Checkbox, Slider } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { CaretDownIcon, PencilIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { type ChangeEvent, useEffect, useState } from "react";
import { useConnection, useSwitchChain, useWalletClient } from "wagmi";
import { NumberInput } from "@/components/ui/number-input";
import { FALLBACK_VALUE_PLACEHOLDER, UI_TEXT } from "@/config/constants";
import { ARBITRUM_CHAIN_ID } from "@/config/contracts";
import { get24hChange } from "@/domain/market";
import { getSliderValue } from "@/domain/trade/order/size";
import { formatPriceForOrder, formatSizeForOrder, throwIfResponseError } from "@/domain/trade/orders";
import { useFeeRates } from "@/hooks/trade/use-fee-rates";
import { useOrderEntryData } from "@/hooks/trade/use-order-entry-data";
import { cn } from "@/lib/cn";
import { formatPrice, formatToken, formatUSD, szDecimalsToPriceDecimals } from "@/lib/format";
import { useAgentRegistration, useAgentStatus, useExchange, useSelectedMarketInfo } from "@/lib/hyperliquid";
import type { MarginMode } from "@/lib/trade/margin-mode";
import { getValueColorClass, toNumberOrZero } from "@/lib/trade/numbers";
import {
	canUseTpSl as canUseTpSlForOrder,
	isTakerOrderType,
	type OrderType,
	usesLimitPrice as usesLimitPriceForOrder,
} from "@/lib/trade/order-types";
import type { Side, SizeMode } from "@/lib/trade/types";
import { perpInput, spotInput, useOrderValidation } from "@/lib/trade/use-order-validation";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useDepositModalActions, useSettingsDialogActions } from "@/stores/use-global-modal-store";
import { useMarketOrderSlippageBps, useMarketOrderSlippagePercent } from "@/stores/use-global-settings-store";
import { useMarketActions } from "@/stores/use-market-store";
import { useOrderQueueActions } from "@/stores/use-order-queue-store";
import { getOrderbookActionsStore, useSelectedPrice } from "@/stores/use-orderbook-actions-store";
import { TokenSelector } from "../chart/token-selector";
import { WalletModal } from "../components/wallet-modal";
import { MarginModeModal } from "../tradebox/margin-mode-modal";
import { OrderToast } from "../tradebox/order-toast";
import { TradeHeader } from "../tradebox/trade-header";
import { MobileBottomNavSpacer } from "./mobile-bottom-nav";

const ORDER_TEXT = UI_TEXT.ORDER_ENTRY;

interface MobileTradeViewProps {
	className?: string;
}

export function MobileTradeView({ className }: MobileTradeViewProps) {
	const { address, isConnected } = useConnection();
	const { data: walletClient, isLoading: isWalletLoading, error: walletClientError } = useWalletClient();
	const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

	const needsChainSwitch = !!walletClientError && walletClientError.message.includes("does not match");

	const { data: market } = useSelectedMarketInfo();
	const { scope } = useExchangeScope();
	const { setSelectedMarket } = useMarketActions();

	function handleMarketChange(marketName: string) {
		setSelectedMarket(scope, marketName);
	}

	const { isReady: isAgentApproved } = useAgentStatus();
	const { register: registerAgent, status: registerStatus } = useAgentRegistration();

	const canApprove = !!walletClient && !!address;
	const isRegistering =
		registerStatus === "approving_fee" || registerStatus === "approving_agent" || registerStatus === "verifying";

	const slippageBps = useMarketOrderSlippageBps();
	const slippagePercent = useMarketOrderSlippagePercent();

	const { addOrder, updateOrder } = useOrderQueueActions();
	const selectedPrice = useSelectedPrice();

	const [orderType, setOrderType] = useState<OrderType>("market");
	const [side, setSide] = useState<Side>("buy");
	const [sizeInput, setSizeInput] = useState("");
	const [sizeMode, setSizeMode] = useState<SizeMode>("quote");
	const [limitPriceInput, setLimitPriceInput] = useState("");
	const [reduceOnly, setReduceOnly] = useState(false);
	const [tpSlEnabled, setTpSlEnabled] = useState(false);
	const [hasUserSized, setHasUserSized] = useState(false);
	const [isDraggingSlider, setIsDraggingSlider] = useState(false);
	const [dragSliderValue, setDragSliderValue] = useState(25);
	const [approvalError, setApprovalError] = useState<string | null>(null);

	const canUseTpSl = canUseTpSlForOrder(orderType);

	const [walletModalOpen, setWalletModalOpen] = useState(false);
	const [showMarginDialog, setShowMarginDialog] = useState(false);
	const { open: openDepositModal } = useDepositModalActions();
	const { open: openSettingsDialog } = useSettingsDialogActions();

	const { mutateAsync: placeOrder, isPending: isSubmitting } = useExchange("order");

	const usesLimitPrice = usesLimitPriceForOrder(orderType);
	const isMarketExecution = orderType === "market" || isTakerOrderType(orderType);
	const markPx = toNumberOrZero(market?.markPx);

	const {
		isSpotMarket,
		baseToken,
		quoteToken,
		capabilities,
		szDecimals,
		availableBalance,
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
	}, [selectedPrice]);
	const price = isMarketExecution ? markPx : toNumberOrZero(limitPriceInput);
	const { takerRate, makerRate } = useFeeRates(market?.kind);
	const feeRate = isMarketExecution ? takerRate : makerRate;
	const feeRatePercent = `${(feeRate * 100).toFixed(4)}%`;
	const estimatedFee = orderValue * feeRate;
	const marginRequired = capabilities.isLeveraged && leverage > 0 ? orderValue / leverage : 0;

	const liqPrice = (() => {
		if (!capabilities.isLeveraged || !price || !sizeValue || !leverage) return null;
		const buffer = price * (1 / leverage) * 0.9;
		return side === "buy" ? price - buffer : price + buffer;
	})();

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
					usesTriggerPrice: false,
					triggerPriceNum: null,
					stopOrder: false,
					takeProfitOrder: false,
					scaleOrder: false,
					twapOrder: false,
					scaleStartPriceNum: null,
					scaleEndPriceNum: null,
					scaleLevelsNum: null,
					twapMinutesNum: null,
					tpSlEnabled: false,
					canUseTpSl: false,
					tpPriceNum: null,
					slPriceNum: null,
				}),
	);

	function applySizeFromPercent(pct: number) {
		if (maxSize <= 0) return;
		setHasUserSized(true);
		setSizeInput(getSizeForPercent(pct));
	}

	const handleSizeModeToggle = () => {
		const newMode = sizeMode === "base" ? "quote" : "base";
		const convertedSize = convertSizeForModeToggle();
		setSizeMode(newMode);
		if (convertedSize) setSizeInput(convertedSize);
	};

	const handleMarkPriceClick = () => {
		if (markPx > 0) setLimitPriceInput(markPx.toFixed(szDecimalsToPriceDecimals(market?.szDecimals ?? 4)));
	};

	const handleSwitchChain = () => switchChain({ chainId: ARBITRUM_CHAIN_ID });

	const handleApprove = async () => {
		if (isRegistering) return;
		setApprovalError(null);
		try {
			await registerAgent();
		} catch (error) {
			setApprovalError(error instanceof Error ? error.message : ORDER_TEXT.APPROVAL_ERROR_FALLBACK);
		}
	};

	const handleSubmit = async () => {
		if (!validation.canSubmit || isSubmitting) return;
		if (!market || !baseToken || typeof market.assetId !== "number") return;

		let orderPrice = price;
		if (isMarketExecution) {
			orderPrice = side === "buy" ? markPx * (1 + slippageBps / 10000) : markPx * (1 - slippageBps / 10000);
		}

		const szDecimals = market.szDecimals ?? 0;
		const formattedPrice = formatPriceForOrder(orderPrice);
		const formattedSize = formatSizeForOrder(sizeValue, szDecimals);

		const orderId = addOrder({
			market: baseToken,
			side,
			size: formattedSize,
			price: formattedPrice,
			orderType: isMarketExecution ? "market" : "limit",
			status: "pending",
		});

		try {
			const result = await placeOrder({
				orders: [
					{
						a: market.assetId,
						b: side === "buy",
						p: formattedPrice,
						s: formattedSize,
						r: reduceOnly,
						t: isMarketExecution ? { limit: { tif: "FrontendMarket" as const } } : { limit: { tif: "Gtc" as const } },
					},
				],
				grouping: "na",
			});

			throwIfResponseError(result.response?.data?.statuses?.[0]);

			updateOrder(orderId, { status: "success", fillPercent: 100 });
			setSizeInput("");
			setLimitPriceInput("");
		} catch (error) {
			updateOrder(orderId, {
				status: "failed",
				error: error instanceof Error ? error.message : ORDER_TEXT.ORDER_ERROR_FALLBACK,
			});
		}
	};

	const sliderValue = (() => {
		if (isDraggingSlider) return dragSliderValue;
		if (!hasUserSized || sizeValue <= 0) return 25;
		return getSliderValue(sizeValue, maxSize);
	})();

	const buttonContent = (() => {
		if (!isConnected)
			return {
				text: ORDER_TEXT.BUTTON_CONNECT,
				action: () => setWalletModalOpen(true),
				disabled: false,
				variant: "cyan" as const,
			};
		if (needsChainSwitch)
			return {
				text: isSwitchingChain ? ORDER_TEXT.BUTTON_SWITCHING : ORDER_TEXT.BUTTON_SWITCH_CHAIN,
				action: handleSwitchChain,
				disabled: isSwitchingChain,
				variant: "cyan" as const,
			};
		if (availableBalance <= 0)
			return {
				text: ORDER_TEXT.BUTTON_DEPOSIT,
				action: () => openDepositModal("deposit"),
				disabled: false,
				variant: "cyan" as const,
			};
		if (validation.needsApproval)
			return {
				text: isRegistering
					? ORDER_TEXT.BUTTON_SIGNING
					: !canApprove
						? ORDER_TEXT.BUTTON_LOADING
						: ORDER_TEXT.BUTTON_ENABLE_TRADING,
				action: handleApprove,
				disabled: isRegistering || !canApprove,
				variant: "cyan" as const,
			};
		return {
			text: sideLabels[side],
			action: handleSubmit,
			disabled: !validation.canSubmit || isSubmitting,
			variant: side as "buy" | "sell",
		};
	})();

	const isFormDisabled = !isConnected || availableBalance <= 0;

	function formatAvailableBalance(): string {
		if (!isConnected) return FALLBACK_VALUE_PLACEHOLDER;
		const decimals = isSpotMarket && side === "sell" ? szDecimals : 2;
		return formatToken(availableBalance, decimals);
	}

	const change24h = get24hChange(market?.prevDayPx, market?.markPx);
	const priceColorClass = change24h !== null ? getValueColorClass(change24h) : "text-text-strong";

	return (
		<div className={cn("flex flex-col h-full min-h-0 bg-bg-base", className)}>
			<MarginModeModal
				open={showMarginDialog}
				onOpenChange={setShowMarginDialog}
				currentMode={marginMode}
				currentLeverage={currentLeverage}
				pendingLeverage={pendingLeverage}
				maxLeverage={maxLeverage}
				onPendingLeverageChange={setPendingLeverage}
				resetPendingLeverage={resetPendingLeverage}
				hasPosition={hasPosition}
				isOnlyIsolated={capabilities.isOnlyIsolated}
				isUpdating={isSwitchingMode}
				updateError={switchModeError}
				showLeverage={capabilities.isLeveraged}
				onApply={async (mode: MarginMode, lev: number) => applyMarginAndLeverage(mode, lev)}
			/>
			<div className="shrink-0 px-4 py-2 border-b border-stroke-weak/60 bg-bg-raised">
				<div className="flex items-center justify-between">
					<TokenSelector selectedMarket={market} onValueChange={handleMarketChange} />
					<div className="text-right">
						<div className={cn("text-sm font-semibold tabular-nums", priceColorClass)}>
							${formatPrice(markPx || null, { szDecimals: market?.szDecimals })}
						</div>
						{typeof change24h === "number" && (
							<div className={cn("text-xs tabular-nums", getValueColorClass(change24h))}>
								{change24h >= 0 ? "+" : ""}
								{change24h.toFixed(2)}%
							</div>
						)}
					</div>
				</div>
			</div>
			<div className="flex-1 min-h-0 overflow-y-auto">
				<div className="px-3 py-4 space-y-4">
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
					/>

					<div className="flex items-center justify-end text-xs">
						<span className="text-text-weak uppercase text-2xs font-medium">{ORDER_TEXT.AVAILABLE_LABEL} </span>
						<span className={cn("tabular-nums font-semibold text-xs ml-1", getValueColorClass(availableBalance))}>
							{formatAvailableBalance()}
						</span>
						<span className="ml-1 text-2xs tabular-nums text-text-weak">{availableBalanceToken}</span>
					</div>

					<div className="space-y-3">
						<p className="text-2xs font-medium uppercase text-text-weak">{ORDER_TEXT.SIZE_LABEL}</p>
						<div className="flex items-stretch gap-2">
							<NumberInput
								inputMode="decimal"
								inputSize="xl"
								placeholder="0.00"
								value={sizeInput}
								onChange={(e: ChangeEvent<HTMLInputElement>) => {
									setHasUserSized(true);
									setSizeInput(e.target.value);
								}}
								className="flex-1 tabular-nums font-semibold"
								disabled={isFormDisabled}
							/>
							<Button
								variant="outline"
								intent="neutral"
								size="sm"
								onClick={handleSizeModeToggle}
								disabled={isFormDisabled}
								iconRight={<CaretDownIcon className="size-3.5" />}
								className="shrink-0 self-stretch"
							>
								{sizeMode === "base" ? baseToken || "\u2014" : quoteToken || "\u2014"}
							</Button>
						</div>
						<div className="space-y-2">
							<Slider
								thumbSize="lg"
								value={[sliderValue]}
								onValueChange={(v) => {
									const val = Array.isArray(v) ? v[0] : v;
									setIsDraggingSlider(true);
									setDragSliderValue(val);
								}}
								onValueCommitted={(v) => {
									const val = Array.isArray(v) ? v[0] : v;
									setIsDraggingSlider(false);
									applySizeFromPercent(val);
								}}
								max={100}
								step={0.1}
								disabled={isFormDisabled || maxSize <= 0}
							/>
							<div className="flex items-center justify-between text-2xs text-text-weak tabular-nums leading-none">
								{[0, 25, 50, 75, 100].map((pct) => (
									<button
										key={pct}
										type="button"
										onClick={() => applySizeFromPercent(pct)}
										disabled={isFormDisabled || maxSize <= 0}
										className="hover:text-text-strong transition-colors disabled:cursor-not-allowed"
									>
										{pct}%
									</button>
								))}
							</div>
						</div>
					</div>

					{usesLimitPrice && (
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<p className="text-2xs font-medium uppercase text-text-weak">{ORDER_TEXT.LIMIT_PRICE_LABEL}</p>
								{markPx > 0 && (
									<button
										type="button"
										onClick={handleMarkPriceClick}
										disabled={isFormDisabled}
										aria-label={t`Fill limit price with mark price ${formatPrice(markPx, { szDecimals: market?.szDecimals })}`}
										className="text-2xs text-text-weak tabular-nums hover:text-text-strong transition-colors underline decoration-dashed underline-offset-2 decoration-text-weak/50 disabled:pointer-events-none"
									>
										{formatPrice(markPx, { szDecimals: market?.szDecimals })}
									</button>
								)}
							</div>
							<NumberInput
								inputMode="decimal"
								inputSize="xl"
								placeholder="0.00"
								value={limitPriceInput}
								onChange={(e: ChangeEvent<HTMLInputElement>) => setLimitPriceInput(e.target.value)}
								className="tabular-nums font-semibold"
								disabled={isFormDisabled}
							/>
						</div>
					)}

					{(capabilities.hasReduceOnly || (capabilities.hasTpSl && canUseTpSl)) && (
						<div className="flex items-center gap-4">
							{capabilities.hasReduceOnly && (
								<Checkbox
									checked={reduceOnly}
									onCheckedChange={(checked: boolean | "indeterminate") => setReduceOnly(checked === true)}
									disabled={isFormDisabled}
									label={ORDER_TEXT.REDUCE_ONLY_LABEL}
								/>
							)}
							{capabilities.hasTpSl && canUseTpSl && (
								<Checkbox
									checked={tpSlEnabled}
									onCheckedChange={(checked: boolean | "indeterminate") => setTpSlEnabled(checked === true)}
									disabled={isFormDisabled}
									label={ORDER_TEXT.TPSL_LABEL}
								/>
							)}
						</div>
					)}

					<div className="divide-y divide-stroke-weak/40 text-xs">
						{capabilities.isLeveraged && (
							<SummaryRow
								label={ORDER_TEXT.SUMMARY_LIQ}
								value={
									liqPrice ? formatPrice(liqPrice, { szDecimals: market?.szDecimals }) : FALLBACK_VALUE_PLACEHOLDER
								}
								valueClass="text-text-error"
							/>
						)}
						<SummaryRow
							label={ORDER_TEXT.SUMMARY_ORDER_VALUE}
							value={orderValue > 0 ? formatUSD(orderValue) : FALLBACK_VALUE_PLACEHOLDER}
						/>
						{capabilities.isLeveraged && (
							<SummaryRow
								label={ORDER_TEXT.SUMMARY_MARGIN_REQ}
								value={marginRequired > 0 ? formatUSD(marginRequired) : FALLBACK_VALUE_PLACEHOLDER}
							/>
						)}
						<div className="flex items-center justify-between py-2.5">
							<span className="text-text-weak">{ORDER_TEXT.SUMMARY_SLIPPAGE}</span>
							<button
								type="button"
								onClick={openSettingsDialog}
								className="inline-flex cursor-pointer items-center gap-1 hover:opacity-80"
							>
								<span className="tabular-nums text-text-error">{slippagePercent}%</span>
								<PencilIcon className="size-2.5 text-text-weak" />
							</button>
						</div>
						<SummaryRow
							label={ORDER_TEXT.SUMMARY_FEE}
							value={orderValue > 0 ? `${feeRatePercent} (${formatUSD(estimatedFee)})` : feeRatePercent}
							valueClass="text-text-weak"
						/>
					</div>
				</div>
			</div>

			<div className="shrink-0 px-3 py-3 border-t border-stroke-weak/40 bg-bg-base">
				{validation.errors.length > 0 && isConnected && availableBalance > 0 && !validation.needsApproval && (
					<p className="text-xs text-text-error mb-2">{validation.errors.join(" \u2022 ")}</p>
				)}
				{approvalError && <p className="text-xs text-text-error mb-2">{approvalError}</p>}
				<Button
					variant="outline"
					size="lg"
					onClick={buttonContent.action}
					disabled={buttonContent.disabled}
					intent={buttonContent.variant === "cyan" ? "brand" : buttonContent.variant === "buy" ? "neutral" : "error"}
					className={cn(
						"w-full",
						buttonContent.variant === "cyan"
							? "bg-fill-brand-weak border-stroke-brand-strong text-text-brand hover:bg-fill-brand-weak/30"
							: buttonContent.variant === "buy"
								? "bg-fill-success-weak border-stroke-success-strong text-text-success hover:bg-fill-success-weak/30"
								: "bg-fill-error-weak border-stroke-error-strong text-text-error hover:bg-fill-error-weak/30",
					)}
					iconLeft={isSubmitting || isRegistering ? <SpinnerGapIcon className="size-5 animate-spin" /> : undefined}
				>
					{buttonContent.text}
				</Button>
				<MobileBottomNavSpacer />
			</div>

			<WalletModal open={walletModalOpen} onOpenChange={setWalletModalOpen} />
			<OrderToast />
		</div>
	);
}

function SummaryRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
	return (
		<div className="flex items-center justify-between py-2.5">
			<span className="text-text-weak">{label}</span>
			<span className={cn("tabular-nums", valueClass ?? "text-text-strong")}>{value}</span>
		</div>
	);
}
