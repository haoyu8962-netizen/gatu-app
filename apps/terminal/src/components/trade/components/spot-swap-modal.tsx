import { Button, Modal, ModalContent, ModalDescription, ModalHeader, ModalPopup, ModalTitle } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { ArrowsDownUpIcon, CheckIcon, SpinnerGapIcon, WarningIcon } from "@phosphor-icons/react";
import { useCallback, useMemo, useState } from "react";
import { labelTypographyClass } from "@/components/ui/field-label";
import { NumberInput } from "@/components/ui/number-input";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { SWAP_SUCCESS_DURATION_MS } from "@/config/time";
import { ORDER_MIN_NOTIONAL_USD } from "@/config/trade";
import { getAvailableFromTotals, getSpotBalance } from "@/domain/trade/balances";
import { formatPriceForOrder, formatSizeForOrder, throwIfAnyResponseError } from "@/domain/trade/orders";
import {
	buildSwapQuote,
	DEFAULT_SWAP_SLIPPAGE_BPS,
	findSpotPair,
	getAvailablePairTokens,
	getMaxSwapInput,
	getStablecoinSwapFromTokens,
	getStablecoinSwapToTokens,
	getSwapSide,
} from "@/domain/trade/swap";
import { isSupportedAccountAbstraction, useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useFeeRates } from "@/hooks/trade/use-fee-rates";
import { useTrackedOrder } from "@/hooks/trade/use-tracked-order";
import { useAutoCloseSuccess } from "@/hooks/ui/use-auto-close-success";
import { cn } from "@/lib/cn";
import { formatToken } from "@/lib/format";
import { useHyperliquid, useSubscription } from "@/lib/hyperliquid";
import { useMarketsInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import { toBig } from "@/lib/trade/numbers";
import {
	type SwapMode,
	useSwapModalActions,
	useSwapModalFromToken,
	useSwapModalMode,
	useSwapModalOpen,
	useSwapModalToToken,
} from "@/stores/use-global-modal-store";
import { AssetDisplay } from "./asset-display";
import { TokenSelectorDropdown } from "./token-selector-dropdown";
import { TradingActionButton } from "./trading-action-button";

const DEFAULT_SWAP_SLIPPAGE_PERCENT = DEFAULT_SWAP_SLIPPAGE_BPS / 100;

export function SpotSwapModal() {
	const isOpen = useSwapModalOpen();
	const initialFromToken = useSwapModalFromToken() ?? DEFAULT_QUOTE_TOKEN;
	const initialToToken = useSwapModalToToken();
	const mode = useSwapModalMode();
	const { close } = useSwapModalActions();

	if (!isOpen) return null;

	return (
		<SpotSwapModalContent
			initialFromToken={initialFromToken}
			initialToToken={initialToToken}
			mode={mode}
			onClose={close}
		/>
	);
}

interface Props {
	initialFromToken: string;
	initialToToken?: string;
	mode: SwapMode;
	onClose: () => void;
}

function SpotSwapModalContent({ initialFromToken, initialToToken, mode, onClose }: Props) {
	const { spotMarkets } = useMarketsInfo();
	const { accountAbstraction, spotBalances } = useDefaultDexBalances();
	const accountModeReady = isSupportedAccountAbstraction(accountAbstraction);
	const { builderConfig } = useHyperliquid();
	const { submitOrder, isPending: isSubmitting } = useTrackedOrder();
	const { takerRate } = useFeeRates("spot");
	const isStablecoinSwap = mode === "stablecoin";

	const [fromToken, setFromToken] = useState(initialFromToken);
	const [selectedToToken, setSelectedToToken] = useState(initialToToken ?? "");
	const [amount, setAmount] = useState("");
	const [error, setError] = useState<string | null>(null);
	const { showSuccess, trigger: triggerAutoClose } = useAutoCloseSuccess(onClose, SWAP_SUCCESS_DURATION_MS);
	const getToTokens = useCallback(
		(token: string) =>
			isStablecoinSwap ? getStablecoinSwapToTokens(token, spotMarkets) : getAvailablePairTokens(token, spotMarkets),
		[isStablecoinSwap, spotMarkets],
	);
	const availableToTokens = useMemo(() => (fromToken ? getToTokens(fromToken) : []), [fromToken, getToTokens]);
	const toToken = availableToTokens.some((token) => token.name === selectedToToken)
		? selectedToToken
		: (availableToTokens[0]?.name ?? "");
	const availableFromTokens = useMemo(() => {
		if (isStablecoinSwap) return getStablecoinSwapFromTokens(spotMarkets);
		return toToken ? getAvailablePairTokens(toToken, spotMarkets) : [];
	}, [isStablecoinSwap, spotMarkets, toToken]);

	const getTokenBalance = useCallback(
		(token: string) => {
			if (!accountModeReady) return 0;
			const balance = getSpotBalance(spotBalances, token);
			return getAvailableFromTotals(balance?.total, balance?.hold);
		},
		[accountModeReady, spotBalances],
	);

	const fromBalance = getTokenBalance(fromToken);
	const toBalance = getTokenBalance(toToken);

	const spotMarket = useMemo(() => {
		if (!fromToken || !toToken) return null;
		return findSpotPair(fromToken, toToken, spotMarkets);
	}, [fromToken, toToken, spotMarkets]);

	const szDecimals = spotMarket?.szDecimals ?? 2;
	const isBuying = spotMarket ? getSwapSide(fromToken, spotMarket) : false;
	const { data: orderbook, status: orderbookStatus } = useSubscription(
		"l2Book",
		{ coin: spotMarket?.name ?? "" },
		{ enabled: Boolean(spotMarket?.name) },
	);
	const quote = useMemo(
		() =>
			buildSwapQuote({
				amount,
				isBuying,
				bids: orderbook?.levels[0],
				asks: orderbook?.levels[1],
				referencePrice: spotMarket?.markPx,
				szDecimals,
				slippageBps: DEFAULT_SWAP_SLIPPAGE_BPS,
				takerFeeRate: takerRate,
				builderFeeTenthsBps: builderConfig?.f ?? 0,
				isStablePair: spotMarket?.isStablePair ?? false,
			}),
		[
			amount,
			builderConfig?.f,
			isBuying,
			orderbook?.levels,
			spotMarket?.markPx,
			spotMarket?.isStablePair,
			szDecimals,
			takerRate,
		],
	);
	const hasPositiveAmount = toBig(amount)?.gt(0) ?? false;
	const estimatedReceive = quote?.estimatedReceive ?? "0";
	const fromTokenInfo =
		availableFromTokens.find((token) => token.name === fromToken) ??
		spotMarket?.tokensInfo.find((token) => token.name === fromToken);
	const toTokenInfo =
		availableToTokens.find((token) => token.name === toToken) ??
		spotMarket?.tokensInfo.find((token) => token.name === toToken);

	function handleFlip() {
		const newFrom = toToken;
		const newTo = fromToken;
		setFromToken(newFrom);
		setSelectedToToken(newTo);
		setAmount("");
		setError(null);
	}

	function handleFromTokenChange(token: string) {
		setFromToken(token);
		setAmount("");
		setError(null);

		const pairs = getToTokens(token);
		if (!pairs.some((p) => p.name === toToken)) {
			setSelectedToToken(pairs[0]?.name ?? "");
		}
	}

	function handleToTokenChange(token: string) {
		setSelectedToToken(token);
		setError(null);
	}

	function handleMaxClick() {
		setAmount(getMaxSwapInput(fromBalance, isBuying, DEFAULT_SWAP_SLIPPAGE_BPS, fromTokenInfo?.szDecimals ?? 6));
		setError(null);
	}

	function handleAmountChange(value: string) {
		setAmount(value);
		setError(null);
	}

	const handleOpenChange = useCallback(
		(open: boolean) => {
			if (!open) onClose();
		},
		[onClose],
	);

	const handleSubmit = useCallback(async () => {
		if (!accountModeReady || !spotMarket || !quote || isSubmitting) return;

		setError(null);

		const order = {
			a: spotMarket.assetId,
			b: isBuying,
			p: formatPriceForOrder(quote.limitPrice, { assetId: spotMarket.assetId, szDecimals }),
			s: formatSizeForOrder(quote.orderSize, szDecimals),
			r: false,
			t: { limit: { tif: "FrontendMarket" as const } },
		};

		try {
			const submission = await submitOrder(
				{ orders: [order], grouping: "na" },
				{ riskContext: { marketKind: "spot" } },
			);
			if (submission.state === "blocked") {
				setError(t`Another order for this market is still being confirmed.`);
				return;
			}
			if (submission.state === "reconciling") {
				setError(t`Order submitted. Confirming exchange status; do not retry.`);
				return;
			}
			throwIfAnyResponseError(submission.result.response?.data?.statuses);

			triggerAutoClose();
		} catch (err) {
			const rawMessage = err instanceof Error ? err.message : t`Swap failed`;
			const message = rawMessage.includes("could not immediately match")
				? t`No liquidity was available within the ${DEFAULT_SWAP_SLIPPAGE_PERCENT}% slippage limit.`
				: rawMessage;
			setError(message);
		}
	}, [accountModeReady, spotMarket, quote, isSubmitting, isBuying, szDecimals, submitOrder, triggerAutoClose]);

	const requiredInput = quote?.maxInput ?? amount;
	const insufficientBalance = toBig(requiredInput)?.gt(fromBalance) ?? false;
	const noPairAvailable = fromToken && toToken && !spotMarket;
	const orderbookLoading =
		hasPositiveAmount && Boolean(spotMarket) && orderbookStatus !== "error" && !orderbook && !showSuccess;
	const orderbookFailed = hasPositiveAmount && Boolean(spotMarket) && orderbookStatus === "error" && !showSuccess;
	const quoteUnavailable = hasPositiveAmount && Boolean(spotMarket) && Boolean(orderbook) && !quote;
	const belowMinimumNotional = Boolean(quote?.isBelowMinimumNotional);
	const partialFill = Boolean(quote?.isPartial);
	const canSubmit =
		accountModeReady &&
		hasPositiveAmount &&
		!insufficientBalance &&
		!belowMinimumNotional &&
		!showSuccess &&
		Boolean(spotMarket) &&
		Boolean(quote);
	const isDisabled = !accountModeReady || isSubmitting || showSuccess;

	return (
		<Modal open onOpenChange={handleOpenChange}>
			<ModalPopup size={isStablecoinSwap ? "md" : "sm"}>
				<ModalHeader
					divider={!isStablecoinSwap}
					className={isStablecoinSwap ? "items-center px-14 py-5 text-center" : undefined}
				>
					<ModalTitle className={isStablecoinSwap ? "text-lg" : undefined}>
						{isStablecoinSwap ? <Trans>Swap Stablecoins</Trans> : <Trans>Swap</Trans>}
					</ModalTitle>
					<ModalDescription className={isStablecoinSwap ? "sr-only" : undefined}>
						{spotMarket ? (
							<Trans>Trade via {spotMarket.pairName} spot market</Trans>
						) : (
							<Trans>Select tokens to swap</Trans>
						)}
					</ModalDescription>
				</ModalHeader>

				<ModalContent className="space-y-3">
					{!accountModeReady ? (
						<div className="flex items-start gap-2 rounded-8 border border-stroke-warning-strong/20 bg-warning-soft p-2.5">
							<WarningIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
							<p className="text-xs text-warning">
								<Trans>Select a supported account mode before using balances or moving funds.</Trans>
							</p>
						</div>
					) : null}
					<div className="relative">
						<div className="space-y-1">
							<TokenPanel
								label={isStablecoinSwap ? t`Sell` : t`From`}
								balance={fromBalance}
								balanceToken={fromTokenInfo?.displayName ?? fromToken}
								balanceLabel={isStablecoinSwap ? t`Max` : t`Available`}
								amount={amount}
								onAmountChange={handleAmountChange}
								onMaxClick={handleMaxClick}
								disabled={isDisabled}
								hasError={insufficientBalance}
								editable
								tokenSelector={
									<TokenSelectorDropdown
										tokens={availableFromTokens}
										selectedToken={fromToken}
										onSelect={handleFromTokenChange}
										getBalance={getTokenBalance}
										disabled={isDisabled}
									/>
								}
							/>

							{!isStablecoinSwap && (
								<div className="relative h-0 flex items-center justify-center z-10">
									<Button
										variant="outline"
										intent="neutral"
										size="sm"
										onClick={handleFlip}
										disabled={isDisabled}
										className="size-8 rounded-full bg-background border-stroke-weak hover:border-stroke-brand-strong hover:bg-fill-hover transition-colors"
										aria-label={t`Swap direction`}
									>
										<ArrowsDownUpIcon className="size-3.5" />
									</Button>
								</div>
							)}

							<TokenPanel
								label={isStablecoinSwap ? t`Buy` : t`To`}
								balance={toBalance}
								balanceToken={toTokenInfo?.displayName ?? toToken}
								balanceLabel={t`Available`}
								showBalance={!isStablecoinSwap}
								amount={quote ? `~${formatToken(estimatedReceive, 6)}` : ""}
								disabled
								editable={false}
								tokenSelector={
									<TokenSelectorDropdown
										tokens={availableToTokens}
										selectedToken={toToken}
										onSelect={handleToTokenChange}
										getBalance={getTokenBalance}
										disabled={isDisabled}
									/>
								}
							/>
						</div>
					</div>

					{isStablecoinSwap ? (
						<>
							<div className="rounded-8 border border-stroke-weak/35 bg-fill-weak/40 px-3 py-2.5 space-y-2">
								<div className="flex items-center justify-between gap-3 text-xs text-fg-muted">
									<span>
										<Trans>You will approximately receive</Trans>
									</span>
									<span className="shrink-0 tabular-nums text-fg">
										{formatToken(estimatedReceive, 6)} <AssetDisplay coin={toToken} hideIcon />
									</span>
								</div>
								<div className="h-px bg-stroke-weak/30" />
								<div className="flex items-center justify-between gap-3 text-xs text-fg-muted">
									<span>
										<Trans>Estimated fee</Trans>
									</span>
									<span className="shrink-0 tabular-nums text-fg">
										{formatToken(quote?.feeAmount ?? "0", 6)} <AssetDisplay coin={toToken} hideIcon />
									</span>
								</div>
							</div>
							<p className="border-t border-stroke-weak/35 pt-3 text-3xs leading-relaxed text-fg-muted">
								<Trans>
									Execution is not guaranteed due to order book slippage. If slippage exceeds{" "}
									{DEFAULT_SWAP_SLIPPAGE_PERCENT}
									%, the swap may be partially filled.
								</Trans>
							</p>
						</>
					) : (
						<div className="rounded-8 border border-stroke-weak/35 bg-fill-weak/40 px-3 py-2.5 space-y-2">
							<div className="flex items-center justify-between text-xs text-fg-muted">
								<span>
									<Trans>Rate</Trans>
								</span>
								<span className="tabular-nums text-fg">
									{quote ? (
										<>
											1 <AssetDisplay coin={fromToken} hideIcon /> ≈ {formatToken(quote.rate, 6)}{" "}
											<AssetDisplay coin={toToken} hideIcon />
										</>
									) : (
										"-"
									)}
								</span>
							</div>
							<div className="h-px bg-stroke-weak/30" />
							<div className="flex items-center justify-between text-xs text-fg-muted">
								<span>
									<Trans>Slippage tolerance</Trans>
								</span>
								<span className="tabular-nums text-fg">{DEFAULT_SWAP_SLIPPAGE_PERCENT}%</span>
							</div>
						</div>
					)}

					{insufficientBalance && !showSuccess && (
						<div className="flex items-start gap-2 p-2.5 bg-warning-soft border border-stroke-warning-strong/20 rounded-8">
							<WarningIcon className="size-3.5 text-warning shrink-0 mt-0.5" />
							<p className="text-xs text-warning">
								<Trans>
									Insufficient <AssetDisplay coin={fromToken} hideIcon /> balance
								</Trans>
							</p>
						</div>
					)}

					{belowMinimumNotional && !insufficientBalance && !showSuccess && (
						<div className="flex items-start gap-2 rounded-8 border border-stroke-warning-strong/20 bg-warning-soft p-2.5">
							<WarningIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
							<p className="text-xs text-warning">
								<Trans>Minimum order value is {ORDER_MIN_NOTIONAL_USD} USDC after size rounding.</Trans>
							</p>
						</div>
					)}

					{partialFill && !insufficientBalance && !showSuccess && (
						<div className="flex items-start gap-2 rounded-8 border border-stroke-warning-strong/20 bg-warning-soft p-2.5">
							<WarningIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
							<p className="text-xs text-warning">
								<Trans>Available order book liquidity can only fill part of this swap.</Trans>
							</p>
						</div>
					)}

					{noPairAvailable && !showSuccess && (
						<div className="flex items-start gap-2 p-2.5 bg-warning-soft border border-stroke-warning-strong/20 rounded-8">
							<WarningIcon className="size-3.5 text-warning shrink-0 mt-0.5" />
							<p className="text-xs text-warning">
								<Trans>
									No trading pair available for <AssetDisplay coin={fromToken} hideIcon />/
									<AssetDisplay coin={toToken} hideIcon />
								</Trans>
							</p>
						</div>
					)}

					{orderbookLoading && (
						<div className="flex items-center gap-2 rounded-8 border border-stroke-weak/35 bg-fill-weak/40 p-2.5 text-xs text-fg-muted">
							<SpinnerGapIcon className="size-3.5 shrink-0 animate-spin" />
							<Trans>Waiting for order book...</Trans>
						</div>
					)}

					{orderbookFailed && (
						<div className="flex items-start gap-2 rounded-8 border border-stroke-error-strong/20 bg-error-soft p-2.5">
							<WarningIcon className="mt-0.5 size-3.5 shrink-0 text-error" />
							<p className="text-xs text-error">
								<Trans>Failed to load order book.</Trans>
							</p>
						</div>
					)}

					{quoteUnavailable && !showSuccess && (
						<div className="flex items-start gap-2 rounded-8 border border-stroke-warning-strong/20 bg-warning-soft p-2.5">
							<WarningIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
							<p className="text-xs text-warning">
								<Trans>No liquidity was available within the {DEFAULT_SWAP_SLIPPAGE_PERCENT}% slippage limit.</Trans>
							</p>
						</div>
					)}

					{error && !showSuccess && (
						<div className="flex items-center gap-2 p-2.5 bg-error-soft border border-stroke-error-strong/20 rounded-8 text-xs text-error">
							<WarningIcon className="size-3.5 shrink-0" />
							<span className="flex-1">{error}</span>
						</div>
					)}

					{showSuccess && (
						<div className="flex flex-col items-center gap-1.5 p-3 bg-success-soft border border-stroke-success-strong/20 rounded-8 text-success">
							<div className="flex items-center gap-2 text-xs">
								<CheckIcon className="size-3.5" />
								<Trans>Swap submitted</Trans>
							</div>
							<div className="text-sm font-medium tabular-nums">
								{amount} <AssetDisplay coin={fromToken} hideIcon /> → ~{formatToken(estimatedReceive, 6)}{" "}
								<AssetDisplay coin={toToken} hideIcon />
							</div>
						</div>
					)}

					<TradingActionButton onClick={handleSubmit} disabled={!canSubmit || isSubmitting} className="w-full">
						{isSubmitting ? (
							<>
								<SpinnerGapIcon className="size-3.5 animate-spin" />
								<Trans>Swapping...</Trans>
							</>
						) : (
							<Trans>Swap</Trans>
						)}
					</TradingActionButton>
				</ModalContent>
			</ModalPopup>
		</Modal>
	);
}

interface TokenPanelProps {
	label: string;
	balance: number;
	balanceToken: string;
	balanceLabel: string;
	amount: string;
	onAmountChange?: (value: string) => void;
	onMaxClick?: () => void;
	disabled?: boolean;
	hasError?: boolean;
	showBalance?: boolean;
	editable: boolean;
	tokenSelector: React.ReactNode;
}

function TokenPanel({
	label,
	balance,
	balanceToken,
	balanceLabel,
	amount,
	onAmountChange,
	onMaxClick,
	disabled,
	hasError,
	showBalance = true,
	editable,
	tokenSelector,
}: TokenPanelProps) {
	return (
		<div
			className={cn(
				"rounded-10 border p-3 space-y-2 transition-colors",
				hasError ? "border-stroke-warning-strong/40 bg-warning-soft/50" : "border-stroke-weak/40 bg-fill-weak",
			)}
		>
			<div className="flex items-center justify-between">
				<span className={labelTypographyClass}>{label}</span>
				<TokenBalance
					show={showBalance}
					editable={editable}
					label={balanceLabel}
					balance={balance}
					balanceToken={balanceToken}
					onMaxClick={onMaxClick}
					disabled={disabled}
				/>
			</div>

			<div className="flex items-center gap-2">
				<div className="shrink-0">{tokenSelector}</div>
				<div className="flex-1 min-w-0">
					{editable ? (
						<NumberInput
							placeholder="0.00"
							mobileSafe
							value={amount}
							onChange={(e) => onAmountChange?.(e.target.value)}
							className={cn(
								"w-full tabular-nums",
								hasError && "border-stroke-warning-strong/40 text-warning focus:border-stroke-warning-strong",
							)}
							disabled={disabled}
						/>
					) : (
						<div className="flex h-7 items-center justify-end text-xs tabular-nums text-fg-muted">
							{amount || "0.00"}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function TokenBalance({
	show,
	editable,
	label,
	balance,
	balanceToken,
	onMaxClick,
	disabled,
}: {
	show: boolean;
	editable: boolean;
	label: string;
	balance: number;
	balanceToken: string;
	onMaxClick?: () => void;
	disabled?: boolean;
}) {
	if (!show) return null;

	const formattedBalance = formatToken(balance, { decimals: 4, symbol: balanceToken });
	if (!editable) {
		return <span className="text-3xs text-fg-muted tabular-nums leading-none">{`${label}: ${formattedBalance}`}</span>;
	}

	return (
		<button
			type="button"
			onClick={onMaxClick}
			disabled={disabled}
			className="text-3xs text-fg-muted tabular-nums leading-none hover:text-fg transition-colors disabled:pointer-events-none"
		>
			{label}:{" "}
			<span className="underline decoration-dashed underline-offset-2 decoration-fg-muted/50">{formattedBalance}</span>
		</button>
	);
}
