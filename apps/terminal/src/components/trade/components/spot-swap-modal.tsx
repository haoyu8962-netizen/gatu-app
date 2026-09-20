import { Button, Modal, ModalContent, ModalDescription, ModalHeader, ModalPopup, ModalTitle } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowsDownUpIcon, WarningIcon } from "@phosphor-icons/react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { labelTypographyClass } from "@/components/ui/field-label";
import { NumberInput } from "@/components/ui/number-input";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { ORDER_MIN_NOTIONAL_USD } from "@/config/trade";
import { getSpotAvailable, getSpotAvailableValue, getSpotBalance } from "@/domain/trade/balances";
import { formatPriceForOrder, formatSizeForOrder, throwIfAnyResponseError } from "@/domain/trade/orders";
import {
	assertSpotSwapExecutionAllowed,
	type SpotSwapExecutionState,
	SWAP_ORDERBOOK_MAX_AGE_MS,
} from "@/domain/trade/spot-swap-execution-guard";
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
import { cn } from "@/lib/cn";
import { formatToken } from "@/lib/format";
import { type ExchangeParams, useHyperliquid, useSubscription } from "@/lib/hyperliquid";
import { useMarketsInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { toBig } from "@/lib/trade/numbers";
import {
	formatOrderSubmissionFeedback,
	getOrderSubmissionFeedback,
	type OrderSubmissionFeedback,
} from "@/lib/trade/order-submission-feedback";
import {
	type SwapMode,
	useGlobalModalType,
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

type SpotSwapError =
	| OrderSubmissionFeedback
	| { kind: "blocked" }
	| { kind: "no-liquidity" }
	| { kind: "raw"; message: string }
	| { kind: "reconciling" }
	| { kind: "swap-failed" };

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
	const { t } = useLingui();
	useNumberFormatRevision();
	const { spotMarkets } = useMarketsInfo();
	const {
		accountAbstraction,
		spotBalances,
		spotAvailableAfterMaintenance,
		spotStateStatus,
		spotStateReceivedAt,
		isDataStale,
		hasError: hasBalanceError,
	} = useDefaultDexBalances();
	const accountModeReady = isSupportedAccountAbstraction(accountAbstraction);
	const accountDataReady = accountModeReady && spotStateStatus === "success" && !isDataStale && !hasBalanceError;
	const { builderConfig, clientKey, env, sessionMode } = useHyperliquid();
	const executionSessionIdentity = `${env}:${clientKey.toLowerCase()}:${sessionMode}:${accountAbstraction ?? "unavailable"}`;
	const { takerRate } = useFeeRates("spot");
	const isStablecoinSwap = mode === "stablecoin";

	const [fromToken, setFromToken] = useState(initialFromToken);
	const [selectedToToken, setSelectedToToken] = useState(initialToToken ?? "");
	const [amount, setAmount] = useState("");
	const submittedRef = useRef(false);
	const [isSubmitted, setIsSubmitted] = useState(false);
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
			if (!accountDataReady) return 0;
			const balance = getSpotBalance(spotBalances, token);
			return getSpotAvailable(balance, spotAvailableAfterMaintenance);
		},
		[accountDataReady, spotAvailableAfterMaintenance, spotBalances],
	);
	const getTokenBalanceExact = useCallback(
		(token: string) => {
			if (!accountDataReady) return "0";
			const balance = getSpotBalance(spotBalances, token);
			return getSpotAvailableValue(balance, spotAvailableAfterMaintenance);
		},
		[accountDataReady, spotAvailableAfterMaintenance, spotBalances],
	);

	const fromBalance = getTokenBalance(fromToken);
	const toBalance = getTokenBalance(toToken);
	const fromBalanceExact = getTokenBalanceExact(fromToken);

	const spotMarket = useMemo(() => {
		if (!fromToken || !toToken) return null;
		return findSpotPair(fromToken, toToken, spotMarkets);
	}, [fromToken, toToken, spotMarkets]);

	const szDecimals = spotMarket?.szDecimals ?? 2;
	const isBuying = spotMarket ? getSwapSide(fromToken, spotMarket) : false;
	const {
		data: orderbook,
		status: orderbookStatus,
		isStale: orderbookIsStale,
		lastMessageAt: orderbookReceivedAt,
	} = useSubscription("l2Book", { coin: spotMarket?.name ?? "" }, { enabled: Boolean(spotMarket?.name) });
	const orderbookAge = orderbookReceivedAt === undefined ? Number.POSITIVE_INFINITY : Date.now() - orderbookReceivedAt;
	const hasLiveOrderbook =
		orderbookStatus === "active" &&
		!orderbookIsStale &&
		orderbook?.coin === spotMarket?.name &&
		orderbookAge >= 0 &&
		orderbookAge <= SWAP_ORDERBOOK_MAX_AGE_MS;
	const liveOrderbook = hasLiveOrderbook ? orderbook : undefined;
	const quote = useMemo(
		() =>
			buildSwapQuote({
				amount,
				isBuying,
				bids: liveOrderbook?.levels[0],
				asks: liveOrderbook?.levels[1],
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
			liveOrderbook?.levels,
			spotMarket?.markPx,
			spotMarket?.isStablePair,
			szDecimals,
			takerRate,
		],
	);
	const expectedOrder = useMemo(() => {
		if (!spotMarket || !quote) return undefined;
		return {
			a: spotMarket.assetId,
			b: isBuying,
			p: formatPriceForOrder(quote.limitPrice, { assetId: spotMarket.assetId, szDecimals }),
			s: formatSizeForOrder(quote.orderSize, szDecimals),
			r: false,
			t: { limit: { tif: "FrontendMarket" as const } },
		};
	}, [isBuying, quote, spotMarket, szDecimals]);
	const requiredInput = quote?.maxInput ?? amount;
	const executionStateRef = useRef<SpotSwapExecutionState>({
		active: true,
		accountDataReady,
		assetId: spotMarket?.assetId,
		marketName: spotMarket?.name,
		bookCoin: orderbook?.coin,
		bookStatus: orderbookStatus,
		bookIsStale: orderbookIsStale,
		bookReceivedAt: orderbookReceivedAt,
		balanceReceivedAt: spotStateReceivedAt,
		currentBalance: fromBalanceExact,
		requiredInput,
		expectedOrder,
	});
	const submissionSequenceRef = useRef(0);
	const executionSessionIdentityRef = useRef<string | null>(null);
	executionStateRef.current = {
		active: true,
		accountDataReady,
		assetId: spotMarket?.assetId,
		marketName: spotMarket?.name,
		bookCoin: orderbook?.coin,
		bookStatus: orderbookStatus,
		bookIsStale: orderbookIsStale,
		bookReceivedAt: orderbookReceivedAt,
		balanceReceivedAt: spotStateReceivedAt,
		currentBalance: fromBalanceExact,
		requiredInput,
		expectedOrder,
	};
	useLayoutEffect(() => {
		executionSessionIdentityRef.current = executionSessionIdentity;
		executionStateRef.current.active = true;
		submissionSequenceRef.current += 1;
		return () => {
			if (executionSessionIdentityRef.current === executionSessionIdentity) {
				executionSessionIdentityRef.current = null;
			}
			executionStateRef.current.active = false;
			submissionSequenceRef.current += 1;
		};
	}, [executionSessionIdentity]);
	const executionGuard = useCallback(
		(params: ExchangeParams<"order">) => assertSpotSwapExecutionAllowed(params, executionStateRef.current),
		[],
	);
	const { submitOrder, isPending: isSubmitting } = useTrackedOrder({ executionGuard });
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
	}

	function handleFromTokenChange(token: string) {
		setFromToken(token);
		setAmount("");

		const pairs = getToTokens(token);
		if (!pairs.some((p) => p.name === toToken)) {
			setSelectedToToken(pairs[0]?.name ?? "");
		}
	}

	function handleToTokenChange(token: string) {
		setSelectedToToken(token);
	}

	function handleMaxClick() {
		setAmount(getMaxSwapInput(fromBalance, isBuying, DEFAULT_SWAP_SLIPPAGE_BPS, fromTokenInfo?.szDecimals ?? 6));
	}

	function handleAmountChange(value: string) {
		setAmount(value);
	}

	function handleOpenChange(open: boolean) {
		if (!open && !submittedRef.current) onClose();
	}

	function getSwapErrorMessage(error: SpotSwapError): string {
		if (error.kind === "order-submission") {
			return formatOrderSubmissionFeedback(error, (descriptor) => t(descriptor));
		}
		if (error.kind === "blocked") return t`Another order for this market is still being confirmed.`;
		if (error.kind === "reconciling") return t`Order submitted. Confirming exchange status; do not retry.`;
		if (error.kind === "no-liquidity") {
			return t`No liquidity was available within the ${DEFAULT_SWAP_SLIPPAGE_PERCENT}% slippage limit.`;
		}
		if (error.kind === "swap-failed") return t`Swap failed`;
		return error.message;
	}

	async function handleSubmit() {
		if (!isOpen || !accountDataReady || !spotMarket || !quote || !expectedOrder) return;
		if (isSubmitting || submittedRef.current) return;
		const submissionSequence = ++submissionSequenceRef.current;
		const submissionIdentity = executionSessionIdentityRef.current;
		if (submissionIdentity !== executionSessionIdentity) return;
		const isCurrentSubmission = () =>
			executionStateRef.current.active &&
			submissionSequenceRef.current === submissionSequence &&
			executionSessionIdentityRef.current === submissionIdentity;
		const swapSummary = `${amount} ${fromToken} → ~${formatToken(estimatedReceive, 6)} ${toToken}`;

		submittedRef.current = true;
		setIsSubmitted(true);

		try {
			const submission = await submitOrder(
				{ orders: [expectedOrder], grouping: "na" },
				{ riskContext: { marketKind: "spot" } },
			);
			if (!isCurrentSubmission()) return;
			if (submission.state === "blocked") {
				toast.warning(getSwapErrorMessage({ kind: "blocked" }));
			} else if (submission.state === "reconciling") {
				toast.info(getSwapErrorMessage({ kind: "reconciling" }));
			} else {
				throwIfAnyResponseError(submission.result.response?.data?.statuses);
				toast.success(t`Swap submitted`, { description: swapSummary });
			}
		} catch (err) {
			if (!isCurrentSubmission()) return;
			toast.error(getSwapErrorMessage(toSpotSwapError(err)));
		} finally {
			onClose();
		}
	}

	const insufficientBalance = accountDataReady && (toBig(requiredInput)?.gt(fromBalance) ?? false);
	const noPairAvailable = fromToken && toToken && !spotMarket;
	const quoteUnavailable = hasPositiveAmount && Boolean(spotMarket) && Boolean(liveOrderbook) && !quote;
	const belowMinimumNotional = Boolean(quote?.isBelowMinimumNotional);
	const partialFill = Boolean(quote?.isPartial);
	const canSubmit =
		accountDataReady &&
		hasPositiveAmount &&
		!insufficientBalance &&
		!belowMinimumNotional &&
		Boolean(spotMarket) &&
		Boolean(quote);
	const isDisabled = !accountDataReady || isSubmitting || isSubmitted;
	const isOpen = useGlobalModalType() === "swap";

	return (
		<Modal open={isOpen && !isSubmitted} onOpenChange={handleOpenChange}>
			<ModalPopup size={isStablecoinSwap ? "md" : "sm"} closeLabel={t`Close`}>
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
										className="size-8 rounded-full bg-background border-stroke-weak hover:border-stroke-action hover:bg-fill-hover transition-colors"
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
							<div className="py-2.5 space-y-2">
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
						<div className="py-2.5 space-y-2">
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

					{insufficientBalance && (
						<div className="flex items-start gap-2 p-2.5 bg-warning-soft border border-stroke-warning-strong/20 rounded-8">
							<WarningIcon className="size-3.5 text-warning shrink-0 mt-0.5" />
							<p className="text-xs text-warning">
								<Trans>
									Insufficient <AssetDisplay coin={fromToken} hideIcon /> balance
								</Trans>
							</p>
						</div>
					)}

					{belowMinimumNotional && !insufficientBalance && (
						<div className="flex items-start gap-2 rounded-8 border border-stroke-warning-strong/20 bg-warning-soft p-2.5">
							<WarningIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
							<p className="text-xs text-warning">
								<Trans>Minimum order value is {ORDER_MIN_NOTIONAL_USD} USDC after size rounding.</Trans>
							</p>
						</div>
					)}

					{partialFill && !insufficientBalance && (
						<div className="flex items-start gap-2 rounded-8 border border-stroke-warning-strong/20 bg-warning-soft p-2.5">
							<WarningIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
							<p className="text-xs text-warning">
								<Trans>Available order book liquidity can only fill part of this swap.</Trans>
							</p>
						</div>
					)}

					{noPairAvailable && (
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

					{quoteUnavailable && (
						<div className="flex items-start gap-2 rounded-8 border border-stroke-warning-strong/20 bg-warning-soft p-2.5">
							<WarningIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
							<p className="text-xs text-warning">
								<Trans>No liquidity was available within the {DEFAULT_SWAP_SLIPPAGE_PERCENT}% slippage limit.</Trans>
							</p>
						</div>
					)}

					<TradingActionButton
						onClick={handleSubmit}
						disabled={!isOpen || !canSubmit || isSubmitting || isSubmitted}
						className="w-full"
					>
						<Trans>Swap</Trans>
					</TradingActionButton>
				</ModalContent>
			</ModalPopup>
		</Modal>
	);
}

function toSpotSwapError(cause: unknown): SpotSwapError {
	if (!(cause instanceof Error)) return { kind: "swap-failed" };
	const trackedOrderFeedback = getOrderSubmissionFeedback(cause);
	if (trackedOrderFeedback) return trackedOrderFeedback;
	if (cause.message.includes("could not immediately match")) return { kind: "no-liquidity" };
	return { kind: "raw", message: cause.message };
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
	useNumberFormatRevision();
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
