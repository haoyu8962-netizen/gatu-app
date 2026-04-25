import { Button } from "@hypeterminal/ui";
import { Trans } from "@lingui/react/macro";
import { SpinnerGapIcon, WalletIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { formatTokenBalance } from "@/lib/bridge/format";
import { cn } from "@/lib/cn";
import { formatUSD } from "@/lib/format";
import { type BridgeToken, useBridgeBalances } from "@/lib/lifi/use-balances";
import { PoweredByLiFi, TokenIcon } from "./shared-ui";

const BRIDGE_ASSET_LIST_MAX_HEIGHT = "max-h-72";

interface TokenRowProps {
	token: BridgeToken;
	isSelected: boolean;
	onSelect: (token: BridgeToken) => void;
}

function tokenRowStyle(isDust: boolean, isSelected: boolean): string {
	if (isDust) return "opacity-50 cursor-not-allowed border-transparent";
	if (isSelected) return "border-stroke-brand-strong bg-brand/5 cursor-pointer";
	return "border-transparent hover:bg-fill-hover active:bg-fill-weak cursor-pointer";
}

function TokenRow({ token, isSelected, onSelect }: TokenRowProps) {
	return (
		<button
			type="button"
			disabled={token.isDust}
			onClick={() => onSelect(token)}
			className={cn(
				"flex items-center gap-3 px-3 py-2.5 text-left transition-colors rounded-8 w-full border",
				tokenRowStyle(token.isDust, isSelected),
			)}
		>
			<TokenIcon token={token} />
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-1.5">
					<span className="text-xs font-medium text-fg truncate">{token.symbol}</span>
					<span className="text-xs text-fg-muted truncate">{token.chainName}</span>
				</div>
				{token.isDust ? (
					<span className="text-2xs text-fg-disabled truncate block">
						<Trans>Low balance</Trans>
					</span>
				) : (
					<span className="text-xs text-fg-muted truncate block">{token.name}</span>
				)}
			</div>
			<div className="text-right shrink-0">
				<div className="text-xs tabular-nums text-fg">{formatTokenBalance(token.amount, token.decimals)}</div>
				<div className="text-xs tabular-nums text-fg-muted">{formatUSD(token.amountUSD, 2)}</div>
			</div>
		</button>
	);
}

function AssetSelectionLoading() {
	return (
		<div className="flex flex-col items-center gap-4 py-8">
			<SpinnerGapIcon className="size-6 animate-spin text-fg-muted" />
			<p className="text-xs text-fg-muted">
				<Trans>Loading balances across all chains...</Trans>
			</p>
		</div>
	);
}

function AssetSelectionError({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex flex-col items-center gap-4 py-8">
			<div className="flex size-12 items-center justify-center rounded-full bg-error-soft border border-stroke-error-strong/30">
				<WarningCircleIcon className="size-6 text-error" />
			</div>
			<div className="text-center space-y-1">
				<p className="text-sm font-medium">
					<Trans>Failed to load balances</Trans>
				</p>
				<p className="text-xs text-fg-muted">
					<Trans>Could not fetch your token balances</Trans>
				</p>
			</div>
			<Button variant="outline" intent="neutral" size="sm" onClick={onRetry}>
				<Trans>Try Again</Trans>
			</Button>
		</div>
	);
}

function AssetSelectionEmpty() {
	return (
		<div className="flex flex-col items-center gap-4 py-8">
			<div className="flex size-12 items-center justify-center rounded-full bg-surface border border-stroke-weak/40">
				<WalletIcon className="size-6 text-fg-muted" />
			</div>
			<div className="text-center space-y-1">
				<p className="text-sm font-medium">
					<Trans>No balances found</Trans>
				</p>
				<p className="text-xs text-fg-muted">
					<Trans>No tokens with value found across supported chains</Trans>
				</p>
			</div>
		</div>
	);
}

interface Props {
	address: string;
	onSelect: (token: BridgeToken) => void;
}

export function AssetSelectionScreen({ address, onSelect }: Props) {
	const { data: tokens, isLoading, isError, refetch } = useBridgeBalances(address);

	if (isLoading) return <AssetSelectionLoading />;
	if (isError) return <AssetSelectionError onRetry={() => refetch()} />;
	if (!tokens || tokens.length === 0) return <AssetSelectionEmpty />;

	return (
		<div className="flex flex-1 flex-col">
			<div
				className={cn(
					BRIDGE_ASSET_LIST_MAX_HEIGHT,
					"overflow-y-auto -mx-1 [mask-image:linear-gradient(to_bottom,black_88%,transparent_100%)]",
				)}
			>
				{tokens.map((token) => (
					<TokenRow key={`${token.chainId}-${token.address}`} token={token} isSelected={false} onSelect={onSelect} />
				))}
			</div>
			<PoweredByLiFi />
		</div>
	);
}
