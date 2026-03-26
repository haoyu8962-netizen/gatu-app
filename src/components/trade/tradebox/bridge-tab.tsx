import { Trans } from "@lingui/react/macro";
import { ArrowsLeftRightIcon, CoinIcon, SpinnerGapIcon, WalletIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Big from "big.js";
import { useEffect, useRef, useState } from "react";
import { useConnection } from "wagmi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatUSD } from "@/lib/format";
import { initLiFi } from "@/lib/lifi/config";
import { type BridgeToken, useBridgeBalances } from "@/lib/lifi/use-balances";

type BridgeScreen = "select" | "confirm";

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

interface ConfirmationPlaceholderProps {
	token: BridgeToken;
	onBack: () => void;
}

function ConfirmationPlaceholder({ token, onBack }: ConfirmationPlaceholderProps) {
	return (
		<div className="flex flex-col gap-4">
			<button
				type="button"
				onClick={onBack}
				className="text-3xs text-primary-default hover:text-primary-hover self-start"
			>
				← <Trans>Back to asset selection</Trans>
			</button>
			<div className="flex flex-col items-center gap-4 py-4">
				<div className="flex size-12 items-center justify-center rounded-full bg-surface-analysis border border-border-200/40">
					<ArrowsLeftRightIcon className="size-6 text-text-950" />
				</div>
				<div className="text-center space-y-1">
					<p className="text-sm font-medium">
						{token.symbol} <Trans>on</Trans> {token.chainName}
					</p>
					<p className="text-3xs text-text-500">
						<Trans>Confirmation screen coming in next slice</Trans>
					</p>
				</div>
			</div>
		</div>
	);
}

export function BridgeTab() {
	const { address } = useConnection();
	const lifiInitialized = useRef(false);
	const [screen, setScreen] = useState<BridgeScreen>("select");
	const [selectedToken, setSelectedToken] = useState<BridgeToken | null>(null);

	useEffect(() => {
		if (!lifiInitialized.current) {
			initLiFi();
			lifiInitialized.current = true;
		}
	}, []);

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
	}

	if (screen === "confirm" && selectedToken) {
		return <ConfirmationPlaceholder token={selectedToken} onBack={handleBack} />;
	}

	return <AssetSelectionScreen address={address} onSelect={handleTokenSelect} />;
}
