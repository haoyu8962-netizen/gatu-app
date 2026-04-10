import { Button, Slider, Tabs, TabsList, TabsTrigger } from "@hypeterminal/ui";
import { CaretDownIcon, SpinnerGapIcon, TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { type ChangeEvent, useEffect, useState } from "react";
import { useConnection, useSwitchChain, useWalletClient } from "wagmi";
import { NumberInput } from "@/components/ui/number-input";
import { FALLBACK_VALUE_PLACEHOLDER, UI_TEXT } from "@/config/constants";
import { ARBITRUM_CHAIN_ID } from "@/config/contracts";
import { formatPriceForOrder, formatSizeForOrder, throwIfResponseError } from "@/domain/trade/orders";
import { useFeeRates } from "@/hooks/trade/use-fee-rates";
import { useOrderEntryData } from "@/hooks/trade/use-order-entry-data";
import { cn } from "@/lib/cn";
import { formatPrice, formatToken, formatUSD, szDecimalsToPriceDecimals } from "@/lib/format";
import { useAgentRegistration, useAgentStatus, useExchange, useSelectedMarketInfo } from "@/lib/hyperliquid";
import { getValueColorClass, toNumberOrZero } from "@/lib/trade/numbers";
import {
	getTabsOrderType,
	isTakerOrderType,
	type OrderType,
	usesLimitPrice as usesLimitPriceForOrder,
} from "@/lib/trade/order-types";
import type { Side, SizeMode } from "@/lib/trade/types";
import { perpInput, spotInput, useOrderValidation } from "@/lib/trade/use-order-validation";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useDepositModalActions } from "@/stores/use-global-modal-store";
import { useMarketOrderSlippageBps } from "@/stores/use-global-settings-store";
import { useMarketActions } from "@/stores/use-market-store";
import { useOrderQueueActions } from "@/stores/use-order-queue-store";
import { getOrderbookActionsStore, useSelectedPrice } from "@/stores/use-orderbook-actions-store";
import { TokenSelector } from "../chart/token-selector";
import { WalletDialog } from "../components/wallet-dialog";
import { AdvancedOrderDropdown } from "../tradebox/advanced-order-dropdown";
import { LeverageControl } from "../tradebox/leverage-control";
import { OrderToast } from "../tradebox/order-toast";
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

	const { addOrder, updateOrder } = useOrderQueueActions();
	const selectedPrice = useSelectedPrice();

	const [orderType, setOrderType] = useState<OrderType>("market");
	const [side, setSide] = useState<Side>("buy");
	const [sizeInput, setSizeInput] = useState("");
	const [sizeMode, setSizeMode] = useState<SizeMode>("quote");
	const [limitPriceInput, setLimitPriceInput] = useState("");
	const [approvalError, setApprovalError] = useState<string | null>(null);

	const [walletDialogOpen, setWalletDialogOpen] = useState(false);
	const { open: openDepositModal } = useDepositModalActions();

	const { mutateAsync: placeOrder, isPending: isSubmitting } = useExchange("order");

	const tabsOrderType = getTabsOrderType(orderType);
	const isAdvancedTab = tabsOrderType === "advanced";
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

	const applySizeFromPercent = (pct: number) => {
		setSizeInput(getSizeForPercent(pct));
	};

	const handleSliderChange = (value: number | readonly number[]) => {
		const v = Array.isArray(value) ? value[0] : value;
		applySizeFromPercent(v);
	};

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
						r: false,
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

	const sliderValue = !maxSize || maxSize <= 0 ? 0 : Math.min(100, (sizeValue / maxSize) * 100);

	const buttonContent = (() => {
		if (!isConnected)
			return {
				text: ORDER_TEXT.BUTTON_CONNECT,
				action: () => setWalletDialogOpen(true),
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

	return (
		<div className={cn("flex flex-col h-full min-h-0 bg-bg-base", className)}>
			<div className="shrink-0 px-4 py-2 border-b border-stroke-weak/60 bg-bg-raised">
				<div className="flex items-center justify-between">
					<TokenSelector selectedMarket={market} onValueChange={handleMarketChange} />
					<div className="text-right">
						<div className="text-lg font-semibold tabular-nums text-text-warning">
							{formatPrice(markPx || null, { szDecimals: market?.szDecimals })}
						</div>
					</div>
				</div>
			</div>
			<div className="flex-1 min-h-0 overflow-y-auto">
				<div className="p-2 space-y-3">
					<Tabs
						value={tabsOrderType}
						onValueChange={(v: string) => {
							if (v === "market") setOrderType("market");
							else if (v === "limit") setOrderType("limit");
						}}
						fullWidth
					>
						<TabsList className="w-full">
							<TabsTrigger value="market" className="flex-1 normal-case">
								Market
							</TabsTrigger>
							<TabsTrigger value="limit" className="flex-1 normal-case">
								Limit
							</TabsTrigger>
							<div className="relative inline-flex flex-1 items-center justify-center pb-2">
								<AdvancedOrderDropdown
									orderType={orderType}
									onOrderTypeChange={setOrderType}
									marketKind={market?.kind}
									className={cn(
										"text-xs normal-case",
										isAdvancedTab ? "font-semibold text-text-strong" : "text-text-weak",
									)}
								/>
								{isAdvancedTab && (
									<span aria-hidden className="absolute bottom-0 inset-x-0 h-0.5 bg-fill-brand-strong" />
								)}
							</div>
						</TabsList>
					</Tabs>
					<Tabs value={side} onValueChange={(v: string) => setSide(v as Side)} variant="pills" fullWidth>
						<TabsList className="w-full">
							<TabsTrigger
								value="buy"
								className="flex-1 text-sm data-active:text-text-success"
								aria-label={sideLabels.buyAria}
								icon={<TrendUpIcon className="size-4" />}
							>
								{sideLabels.buy}
							</TabsTrigger>
							<TabsTrigger
								value="sell"
								className="flex-1 text-sm data-active:text-text-error"
								aria-label={sideLabels.sellAria}
								icon={<TrendDownIcon className="size-4" />}
							>
								{sideLabels.sell}
							</TabsTrigger>
						</TabsList>
					</Tabs>
					<div className="flex items-center justify-between text-xs">
						{capabilities.isLeveraged ? (
							<div className="flex items-center gap-2">
								<span className="text-text-weak">Leverage</span>
								<LeverageControl key={market?.name} />
							</div>
						) : (
							<div />
						)}
						<div className="text-right">
							<span className="text-text-weak">{ORDER_TEXT.AVAILABLE_LABEL}: </span>
							<span className={cn("tabular-nums font-medium", getValueColorClass(availableBalance))}>
								{formatAvailableBalance()}
							</span>
							<span className="ml-1 font-medium tabular-nums text-text-weak">{availableBalanceToken}</span>
						</div>
					</div>
					<div className="space-y-1.5">
						<p className="text-3xs font-medium uppercase tracking-wide text-text-weak leading-none">
							{ORDER_TEXT.SIZE_LABEL}
						</p>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								intent="neutral"
								size="sm"
								onClick={handleSizeModeToggle}
								disabled={isFormDisabled}
								iconRight={<CaretDownIcon className="size-3" />}
							>
								{sizeMode === "base" ? baseToken || "\u2014" : quoteToken || "\u2014"}
							</Button>
							<NumberInput
								inputMode="decimal"
								placeholder={ORDER_TEXT.INPUT_PLACEHOLDER}
								value={sizeInput}
								onChange={(e: ChangeEvent<HTMLInputElement>) => setSizeInput(e.target.value)}
								className="flex-1 tabular-nums"
								disabled={isFormDisabled}
							/>
						</div>
						<Slider
							value={[sliderValue]}
							onValueChange={handleSliderChange}
							max={100}
							step={1}
							className="py-3"
							disabled={isFormDisabled || maxSize <= 0}
						/>
					</div>
					{usesLimitPrice && (
						<NumberInput
							label={ORDER_TEXT.LIMIT_PRICE_LABEL}
							labelValue={
								markPx > 0 ? (
									<span className="underline decoration-dashed underline-offset-2 decoration-text-weak/50">
										{formatPrice(markPx, { szDecimals: market?.szDecimals })}
									</span>
								) : undefined
							}
							onLabelValueClick={markPx > 0 ? handleMarkPriceClick : undefined}
							inputMode="decimal"
							placeholder={ORDER_TEXT.INPUT_PLACEHOLDER}
							value={limitPriceInput}
							onChange={(e: ChangeEvent<HTMLInputElement>) => setLimitPriceInput(e.target.value)}
							className="tabular-nums"
							disabled={isFormDisabled}
						/>
					)}
					{validation.errors.length > 0 && isConnected && availableBalance > 0 && !validation.needsApproval && (
						<div className="text-xs text-text-error">{validation.errors.join(" \u2022 ")}</div>
					)}
					{approvalError && <div className="text-xs text-text-error">{approvalError}</div>}
					<div className="border border-stroke-weak/40 rounded-8 divide-y divide-stroke-weak/40 text-xs">
						<SummaryRow
							label={ORDER_TEXT.SUMMARY_ORDER_VALUE}
							value={orderValue > 0 ? formatUSD(orderValue) : FALLBACK_VALUE_PLACEHOLDER}
						/>
						<SummaryRow
							label={ORDER_TEXT.SUMMARY_MARGIN_REQ}
							value={
								capabilities.isLeveraged && marginRequired > 0 ? formatUSD(marginRequired) : FALLBACK_VALUE_PLACEHOLDER
							}
						/>
						<SummaryRow
							label={ORDER_TEXT.SUMMARY_LIQ}
							value={liqPrice ? formatPrice(liqPrice, { szDecimals: market?.szDecimals }) : FALLBACK_VALUE_PLACEHOLDER}
							valueClass="text-text-error"
						/>
						<SummaryRow
							label={ORDER_TEXT.SUMMARY_FEE}
							value={orderValue > 0 ? `${feeRatePercent} (${formatUSD(estimatedFee)})` : feeRatePercent}
							valueClass="text-text-weak"
						/>
					</div>
				</div>
			</div>
			<div className="shrink-0 p-4 border-t border-stroke-weak/60 bg-bg-raised/95 backdrop-blur-sm">
				<Button
					variant="outline"
					size="lg"
					onClick={buttonContent.action}
					disabled={buttonContent.disabled}
					intent={buttonContent.variant === "cyan" ? "brand" : buttonContent.variant === "buy" ? "neutral" : "error"}
					className={cn(
						"w-full py-2",
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
			</div>

			<MobileBottomNavSpacer />

			<WalletDialog open={walletDialogOpen} onOpenChange={setWalletDialogOpen} />
			<OrderToast />
		</div>
	);
}

function SummaryRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
	return (
		<div className="flex items-center justify-between px-3 py-2">
			<span className="text-text-weak">{label}</span>
			<span className={cn("tabular-nums", valueClass)}>{value}</span>
		</div>
	);
}
