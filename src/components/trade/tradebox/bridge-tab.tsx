import { Trans } from "@lingui/react/macro";
import {
	ArrowDownIcon,
	ArrowLeftIcon,
	CaretDownIcon,
	CaretUpIcon,
	CheckCircleIcon,
	ClockIcon,
	CoinIcon,
	SpinnerGapIcon,
	WalletIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import Big from "big.js";
import { useEffect, useRef, useState } from "react";
import { useConnection } from "wagmi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InfoRow, InfoRowGroup } from "@/components/ui/info-row";
import { NumberInput } from "@/components/ui/number-input";
import { cn } from "@/lib/cn";
import { formatDuration, formatUSD, shortenAddress } from "@/lib/format";
import { initLiFi } from "@/lib/lifi/config";
import { type BridgeToken, useBridgeBalances } from "@/lib/lifi/use-balances";
import { useBridgeExecutor } from "@/lib/lifi/use-bridge";
import { type BridgeQuote, useBridgeQuote } from "@/lib/lifi/use-quote";

type BridgeScreen = "select" | "confirm" | "executing" | "success";

const BRIDGE_TIMEOUT_MS = 10 * 60 * 1000;

function BridgeWalletNotConnected() {
	return (
		<div className="flex flex-col items-center gap-4 py-8">
			<div className="flex size-12 items-center justify-center rounded-full bg-surface-analysis border border-border-200/40">
				<WalletIcon className="size-6 text-text-950" />
			</div>
			<div className="text-center space-y-1">
				<p className="text-sm font-medium">
					<Trans>Wallet not connected</Trans>
				</p>
				<p className="text-3xs text-text-950">
					<Trans>Connect your wallet to bridge funds</Trans>
				</p>
			</div>
		</div>
	);
}

function TokenIcon({ token }: { token: BridgeToken }) {
	return (
		<div className="relative shrink-0">
			{token.logoURI ? (
				<img
					src={token.logoURI}
					alt={token.symbol}
					className="size-8 rounded-full"
					onError={(e) => {
						e.currentTarget.style.display = "none";
						e.currentTarget.nextElementSibling?.classList.remove("hidden");
					}}
				/>
			) : null}
			<div
				className={cn(
					"size-8 rounded-full bg-surface-analysis flex items-center justify-center",
					token.logoURI && "hidden",
				)}
			>
				<CoinIcon className="size-4 text-text-600" />
			</div>
			{token.chainLogoURI ? (
				<img
					src={token.chainLogoURI}
					alt={token.chainName}
					className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border border-surface-execution"
				/>
			) : null}
		</div>
	);
}

function formatTokenBalance(amount: string, decimals: number): string {
	const value = Big(amount).div(Big(10).pow(decimals));
	if (value.lt(0.001)) return "<0.001";
	if (value.lt(1)) return value.toFixed(4);
	if (value.lt(1000)) return value.toFixed(3);
	return value.toFixed(2);
}

interface TokenRowProps {
	token: BridgeToken;
	onSelect: (token: BridgeToken) => void;
}

function TokenRow({ token, onSelect }: TokenRowProps) {
	return (
		<button
			type="button"
			disabled={token.isDust}
			onClick={() => onSelect(token)}
			className={cn(
				"flex items-center gap-3 px-3 py-2.5 text-left transition-colors rounded-xs w-full",
				token.isDust
					? "opacity-50 cursor-not-allowed"
					: "hover:bg-surface-base/50 active:bg-surface-base cursor-pointer",
			)}
		>
			<TokenIcon token={token} />
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-1.5">
					<span className="text-xs font-medium text-text-950 truncate">{token.symbol}</span>
					<span className="text-3xs text-text-500 truncate">{token.chainName}</span>
				</div>
				<span className="text-3xs text-text-500 truncate block">{token.name}</span>
			</div>
			<div className="text-right shrink-0">
				<div className="text-xs tabular-nums text-text-950">{formatTokenBalance(token.amount, token.decimals)}</div>
				<div className="text-3xs tabular-nums text-text-500">{formatUSD(token.amountUSD, 2)}</div>
			</div>
			{token.isDust ? (
				<Badge variant="neutral" size="xs" className="shrink-0">
					<Trans>Low Balance</Trans>
				</Badge>
			) : null}
		</button>
	);
}

function AssetSelectionLoading() {
	return (
		<div className="flex flex-col items-center gap-4 py-8">
			<SpinnerGapIcon className="size-6 animate-spin text-text-500" />
			<p className="text-3xs text-text-500">
				<Trans>Loading balances across all chains...</Trans>
			</p>
		</div>
	);
}

function AssetSelectionError({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex flex-col items-center gap-4 py-8">
			<div className="flex size-12 items-center justify-center rounded-full bg-market-down-100 border border-market-down-600/30">
				<WarningCircleIcon className="size-6 text-market-down-600" />
			</div>
			<div className="text-center space-y-1">
				<p className="text-sm font-medium">
					<Trans>Failed to load balances</Trans>
				</p>
				<p className="text-3xs text-text-500">
					<Trans>Could not fetch your token balances</Trans>
				</p>
			</div>
			<Button variant="outlined" size="sm" onClick={onRetry}>
				<Trans>Try Again</Trans>
			</Button>
		</div>
	);
}

function AssetSelectionEmpty() {
	return (
		<div className="flex flex-col items-center gap-4 py-8">
			<div className="flex size-12 items-center justify-center rounded-full bg-surface-analysis border border-border-200/40">
				<WalletIcon className="size-6 text-text-500" />
			</div>
			<div className="text-center space-y-1">
				<p className="text-sm font-medium">
					<Trans>No balances found</Trans>
				</p>
				<p className="text-3xs text-text-500">
					<Trans>No tokens with value found across supported chains</Trans>
				</p>
			</div>
		</div>
	);
}

interface AssetSelectionScreenProps {
	address: string;
	onSelect: (token: BridgeToken) => void;
}

function AssetSelectionScreen({ address, onSelect }: AssetSelectionScreenProps) {
	const { data: tokens, isLoading, isError, refetch } = useBridgeBalances(address);

	if (isLoading) return <AssetSelectionLoading />;
	if (isError) return <AssetSelectionError onRetry={() => refetch()} />;
	if (!tokens || tokens.length === 0) return <AssetSelectionEmpty />;

	return (
		<div className="flex flex-col gap-1">
			<p className="text-4xs uppercase tracking-wider text-text-950 px-3 pb-1">
				<Trans>Select asset to bridge</Trans>
			</p>
			<div className="max-h-[320px] overflow-y-auto -mx-1">
				{tokens.map((token) => (
					<TokenRow key={`${token.chainId}-${token.address}`} token={token} onSelect={onSelect} />
				))}
			</div>
		</div>
	);
}

function useDebouncedValue<T>(value: T, delay: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delay);
		return () => clearTimeout(timer);
	}, [value, delay]);
	return debounced;
}

function formatTokenAmount(amount: string, decimals: number): string {
	const value = Big(amount).div(Big(10).pow(decimals));
	if (value.lt(0.0001)) return "<0.0001";
	if (value.lt(1)) return value.toFixed(6);
	if (value.lt(1000)) return value.toFixed(4);
	return value.toFixed(2);
}

interface ConfirmationScreenProps {
	token: BridgeToken;
	address: string;
	onBack: () => void;
	onConfirm: (quote: BridgeQuote) => void;
}

function ConfirmationScreen({ token, address, onBack, onConfirm }: ConfirmationScreenProps) {
	const fullBalance = Big(token.amount).div(Big(10).pow(token.decimals)).toString();
	const [amount, setAmount] = useState(fullBalance);
	const debouncedAmount = useDebouncedValue(amount, 500);

	const quoteParams = debouncedAmount
		? {
				fromChainId: token.chainId,
				fromTokenAddress: token.address,
				fromTokenDecimals: token.decimals,
				fromAddress: address,
				amount: debouncedAmount,
			}
		: null;

	const { data: quote, isLoading: quoteLoading, isError: quoteError } = useBridgeQuote(quoteParams);

	const receiveAmount = quote ? formatTokenAmount(quote.toAmount, 6) : "—";
	const receiveAmountUSD = quote ? formatUSD(quote.toAmountUSD, 2) : "";

	return (
		<div className="flex flex-col gap-3">
			<button
				type="button"
				onClick={onBack}
				className="flex items-center gap-1 text-3xs text-primary-default hover:text-primary-hover self-start"
			>
				<ArrowLeftIcon className="size-3" />
				<Trans>Back</Trans>
			</button>

			<div className="flex flex-col gap-2 rounded-xs border border-border-200 p-3">
				<p className="text-4xs uppercase tracking-wider text-text-500">
					<Trans>From</Trans>
				</p>
				<div className="flex items-center gap-2.5">
					<TokenIcon token={token} />
					<div className="flex-1 min-w-0">
						<span className="text-xs font-medium text-text-950">{token.symbol}</span>
						<span className="text-3xs text-text-500 ml-1.5">{token.chainName}</span>
					</div>
					<span className="text-3xs text-text-500 tabular-nums">{shortenAddress(address)}</span>
				</div>
			</div>

			<div className="flex justify-center -my-1">
				<div className="flex size-6 items-center justify-center rounded-full border border-border-200 bg-surface-analysis">
					<ArrowDownIcon className="size-3 text-text-500" />
				</div>
			</div>

			<div className="flex flex-col gap-2 rounded-xs border border-border-200 p-3">
				<p className="text-4xs uppercase tracking-wider text-text-500">
					<Trans>To</Trans>
				</p>
				<div className="flex items-center gap-2.5">
					<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-analysis">
						<span className="text-3xs font-bold text-text-950">HL</span>
					</div>
					<div className="flex-1 min-w-0">
						<span className="text-xs font-medium text-text-950">USDC</span>
						<span className="text-3xs text-text-500 ml-1.5">Hyperliquid</span>
					</div>
					<span className="text-3xs text-text-500 tabular-nums">{shortenAddress(address)}</span>
				</div>
			</div>

			<div className="flex flex-col gap-1.5 pt-1">
				<span className="text-4xs uppercase tracking-wider text-text-500">
					<Trans>Amount</Trans>
				</span>
				<NumberInput
					value={amount}
					onChange={(e) => setAmount(e.target.value)}
					maxLabel={`MAX ${formatTokenBalance(token.amount, token.decimals)}`}
					onMaxClick={() => setAmount(fullBalance)}
					inputSize="default"
					allowDecimals
					maxAllowedDecimals={token.decimals}
				/>
			</div>

			{quoteLoading ? (
				<div className="flex items-center justify-center gap-2 py-3">
					<SpinnerGapIcon className="size-4 animate-spin text-text-500" />
					<span className="text-3xs text-text-500">
						<Trans>Fetching quote...</Trans>
					</span>
				</div>
			) : quoteError ? (
				<div className="flex items-center gap-2 rounded-xs border border-market-down-600/30 bg-market-down-100 p-2.5">
					<WarningCircleIcon className="size-4 text-market-down-600 shrink-0" />
					<span className="text-3xs text-market-down-600">
						<Trans>No route available. Try a different amount or asset.</Trans>
					</span>
				</div>
			) : quote ? (
				<>
					<InfoRowGroup className="text-3xs">
						<InfoRow
							label={<Trans>You send</Trans>}
							value={
								<span>
									{amount} {token.symbol}
									<span className="text-text-500 ml-1">{formatUSD(quote.fromAmountUSD, 2)}</span>
								</span>
							}
						/>
						<InfoRow
							label={<Trans>You receive</Trans>}
							value={
								<span>
									{receiveAmount} USDC
									<span className="text-text-500 ml-1">{receiveAmountUSD}</span>
								</span>
							}
						/>
						<InfoRow
							label={
								<span className="flex items-center gap-1">
									<ClockIcon className="size-3" />
									<Trans>Est. time</Trans>
								</span>
							}
							value={`~${formatDuration(Math.ceil(quote.executionDuration / 60))}`}
						/>
					</InfoRowGroup>

					<Collapsible>
						<CollapsibleTrigger className="flex w-full items-center justify-between rounded-xs px-2 py-1.5 text-3xs text-text-500 hover:bg-surface-base/50 transition-colors group">
							<span>
								<Trans>Fees</Trans> ({formatUSD(quote.totalFeesUSD, 2)})
							</span>
							<CaretDownIcon className="size-3 group-data-[state=open]:hidden" />
							<CaretUpIcon className="size-3 hidden group-data-[state=open]:block" />
						</CollapsibleTrigger>
						<CollapsibleContent>
							<InfoRowGroup className="text-3xs">
								{quote.gasCosts.map((gas) => (
									<InfoRow
										key={`gas-${gas.token.symbol}-${gas.amount}`}
										label={<Trans>Gas ({gas.token.symbol})</Trans>}
										value={formatUSD(gas.amountUSD, 2)}
									/>
								))}
								{quote.feeCosts.map((fee) => (
									<InfoRow key={`fee-${fee.name}-${fee.amount}`} label={fee.name} value={formatUSD(fee.amountUSD, 2)} />
								))}
							</InfoRowGroup>
						</CollapsibleContent>
					</Collapsible>
				</>
			) : null}

			<Button
				variant="contained"
				tone="accent"
				size="lg"
				className="w-full"
				disabled={!quote || quoteLoading}
				onClick={() => quote && onConfirm(quote)}
			>
				<Trans>Confirm Bridge</Trans>
			</Button>
		</div>
	);
}

interface ExecutingScreenProps {
	statusText: string;
	txHash: string | null;
	onDone: () => void;
}

function ExecutingScreen({ statusText, txHash, onDone }: ExecutingScreenProps) {
	const [isTimedOut, setIsTimedOut] = useState(false);
	const startTimeRef = useRef(Date.now());

	useEffect(() => {
		const timer = setInterval(() => {
			if (Date.now() - startTimeRef.current >= BRIDGE_TIMEOUT_MS) {
				setIsTimedOut(true);
				clearInterval(timer);
			}
		}, 30_000);
		return () => clearInterval(timer);
	}, []);

	if (isTimedOut) {
		return (
			<div className="flex flex-col items-center gap-4 py-8">
				<div className="flex size-12 items-center justify-center rounded-full bg-warning-100 border border-warning-700/30">
					<ClockIcon className="size-6 text-warning-700" />
				</div>
				<div className="text-center space-y-1">
					<p className="text-sm font-medium text-text-950">
						<Trans>Taking longer than expected</Trans>
					</p>
					<p className="text-3xs text-text-500 max-w-[280px]">
						<Trans>Your bridge is still processing. Funds are safe — LI.FI routes are always recoverable.</Trans>
					</p>
				</div>
				{txHash ? (
					<a
						href={`https://explorer.li.fi/tx/${txHash}`}
						target="_blank"
						rel="noopener noreferrer"
						className="text-3xs text-primary-default hover:text-primary-hover underline"
					>
						<Trans>Track on LI.FI Explorer</Trans>
					</a>
				) : null}
				<Button variant="outlined" size="lg" className="w-full" onClick={onDone}>
					<Trans>Done</Trans>
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center gap-4 py-8">
			<div className="flex size-12 items-center justify-center rounded-full bg-primary-default/10 border border-primary-default/30">
				<SpinnerGapIcon className="size-6 animate-spin text-primary-default" />
			</div>
			<div className="text-center space-y-1">
				<p className="text-sm font-medium text-text-950">
					<Trans>Bridging in progress</Trans>
				</p>
				<p className="text-3xs text-text-500">{statusText}</p>
			</div>
		</div>
	);
}

interface SuccessScreenProps {
	receivedAmount: string;
	onDone: () => void;
}

function SuccessScreen({ receivedAmount, onDone }: SuccessScreenProps) {
	const formatted = formatTokenAmount(receivedAmount, 6);

	return (
		<div className="flex flex-col items-center gap-4 py-8">
			<div className="flex size-12 items-center justify-center rounded-full bg-market-up-100 border border-market-up-600/30">
				<CheckCircleIcon className="size-6 text-market-up-600" weight="fill" />
			</div>
			<div className="text-center space-y-1">
				<p className="text-sm font-medium text-text-950">
					<Trans>Bridge complete</Trans>
				</p>
				<p className="text-3xs text-text-500">
					<Trans>{formatted} USDC deposited to Hyperliquid</Trans>
				</p>
			</div>
			<Button variant="contained" tone="accent" size="lg" className="w-full" onClick={onDone}>
				<Trans>Done</Trans>
			</Button>
		</div>
	);
}

interface ErrorScreenProps {
	error: string;
	onRetry: () => void;
	onBack: () => void;
}

function BridgeErrorScreen({ error, onRetry, onBack }: ErrorScreenProps) {
	return (
		<div className="flex flex-col items-center gap-4 py-8">
			<div className="flex size-12 items-center justify-center rounded-full bg-market-down-100 border border-market-down-600/30">
				<WarningCircleIcon className="size-6 text-market-down-600" />
			</div>
			<div className="text-center space-y-1">
				<p className="text-sm font-medium text-text-950">
					<Trans>Bridge failed</Trans>
				</p>
				<p className="text-3xs text-text-500 max-w-[280px]">{error}</p>
			</div>
			<div className="flex gap-2 w-full">
				<Button variant="outlined" size="lg" className="flex-1" onClick={onBack}>
					<Trans>Back</Trans>
				</Button>
				<Button variant="contained" tone="accent" size="lg" className="flex-1" onClick={onRetry}>
					<Trans>Try Again</Trans>
				</Button>
			</div>
		</div>
	);
}

export function BridgeTab() {
	const { address } = useConnection();
	const lifiInitialized = useRef(false);
	const [screen, setScreen] = useState<BridgeScreen>("select");
	const [selectedToken, setSelectedToken] = useState<BridgeToken | null>(null);
	const lastQuoteRef = useRef<BridgeQuote | null>(null);
	const bridge = useBridgeExecutor();

	useEffect(() => {
		if (!lifiInitialized.current) {
			initLiFi();
			lifiInitialized.current = true;
		}
	}, []);

	useEffect(() => {
		if (bridge.status === "idle" && screen === "executing") {
			setScreen("confirm");
		}
	}, [bridge.status, screen]);

	if (!address) {
		return <BridgeWalletNotConnected />;
	}

	function handleTokenSelect(token: BridgeToken) {
		setSelectedToken(token);
		setScreen("confirm");
	}

	function handleBack() {
		setScreen("select");
		setSelectedToken(null);
		bridge.reset();
		lastQuoteRef.current = null;
	}

	function handleConfirm(quote: BridgeQuote) {
		lastQuoteRef.current = quote;
		setScreen("executing");
		bridge.execute(quote);
	}

	function handleRetry() {
		if (lastQuoteRef.current) {
			setScreen("executing");
			bridge.execute(lastQuoteRef.current);
		}
	}

	function handleDone() {
		setScreen("select");
		setSelectedToken(null);
		bridge.reset();
		lastQuoteRef.current = null;
	}

	if (bridge.status === "error") {
		return <BridgeErrorScreen error={bridge.error ?? "Unknown error"} onRetry={handleRetry} onBack={handleBack} />;
	}

	if (bridge.status === "success" && bridge.receivedAmount) {
		return <SuccessScreen receivedAmount={bridge.receivedAmount} onDone={handleDone} />;
	}

	if (screen === "executing") {
		return <ExecutingScreen statusText={bridge.statusText} txHash={bridge.txHash} onDone={handleDone} />;
	}

	if (screen === "confirm" && selectedToken) {
		return <ConfirmationScreen token={selectedToken} address={address} onBack={handleBack} onConfirm={handleConfirm} />;
	}

	return <AssetSelectionScreen address={address} onSelect={handleTokenSelect} />;
}
