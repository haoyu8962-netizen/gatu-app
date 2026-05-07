import { Button } from "@hypeterminal/ui";
import { Trans } from "@lingui/react/macro";
import {
	ArrowLeftIcon,
	CaretDownIcon,
	CaretUpIcon,
	ClockIcon,
	SpinnerGapIcon,
	WalletIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import Big from "big.js";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InfoRow, InfoRowGroup } from "@/components/ui/info-row";
import { formatSendAmount, formatTokenAmount } from "@/lib/bridge/format";
import { formatDuration, formatUSD, shortenAddress } from "@/lib/format";
import type { BridgeToken } from "@/lib/lifi/use-balances";
import { type BridgeQuote, useBridgeQuote } from "@/lib/lifi/use-quote";
import { HyperCoreUsdcIcon, QuoteCountdown, TokenIcon } from "./shared-ui";

interface Props {
	token: BridgeToken;
	tokenAmount: string;
	address: string;
	onBack: () => void;
	onConfirm: (quote: BridgeQuote) => void;
}

export function ConfirmationScreen({ token, tokenAmount, address, onBack, onConfirm }: Props) {
	const quoteParams = {
		fromChainId: token.chainId,
		fromTokenAddress: token.address,
		fromTokenDecimals: token.decimals,
		fromAddress: address,
		amount: tokenAmount,
	};

	const { data: quote, isLoading: quoteLoading, isError: quoteError, dataUpdatedAt } = useBridgeQuote(quoteParams);

	const usdDisplay = (() => {
		try {
			return formatUSD(Big(tokenAmount).times(token.priceUSD).toNumber(), 2);
		} catch {
			return "$0.00";
		}
	})();

	const receiveAmount = quote ? formatTokenAmount(quote.toAmount, 6) : "---";
	const receiveAmountUSD = quote ? formatUSD(quote.toAmountUSD, 2) : "";

	return (
		<div className="flex flex-1 flex-col gap-3">
			<div>
				<div className="flex items-center justify-between">
					<button
						type="button"
						onClick={onBack}
						className="flex items-center gap-1 text-xs text-brand hover:opacity-80"
					>
						<ArrowLeftIcon className="size-3" />
						<Trans>Back</Trans>
					</button>
					{quote ? <QuoteCountdown dataUpdatedAt={dataUpdatedAt} /> : null}
				</div>

				<p className="text-4xl font-semibold text-fg tabular-nums text-center py-2">{usdDisplay}</p>

				<InfoRowGroup className="text-xs">
					<InfoRow
						label={<Trans>Source</Trans>}
						value={
							<span className="flex items-center gap-1.5">
								<WalletIcon className="size-3" />
								<Trans>Wallet ({shortenAddress(address)})</Trans>
							</span>
						}
					/>
					<InfoRow label={<Trans>Destination</Trans>} value="Hyperliquid" />
					<InfoRow
						label={
							<span className="flex items-center gap-1">
								<ClockIcon className="size-3" />
								<Trans>Estimated time</Trans>
							</span>
						}
						value={quote ? `~${formatDuration(Math.ceil(quote.executionDuration / 60))}` : "---"}
					/>
				</InfoRowGroup>

				<InfoRowGroup className="text-xs mt-3">
					<InfoRow
						label={<Trans>You send</Trans>}
						value={
							<span className="flex items-center gap-1.5">
								<TokenIcon token={token} size="sm" />
								{formatSendAmount(tokenAmount)} {token.symbol}
							</span>
						}
					/>
					<InfoRow
						label={<Trans>You receive</Trans>}
						value={
							<span className="flex items-center gap-1.5">
								<HyperCoreUsdcIcon size="sm" />
								{receiveAmount} USDC
								{receiveAmountUSD ? <span className="text-fg-muted ml-1">{receiveAmountUSD}</span> : null}
							</span>
						}
					/>
				</InfoRowGroup>
			</div>

			{quote ? (
				<Collapsible>
					<CollapsibleTrigger className="flex w-full items-center justify-between rounded-8 px-2 py-1.5 text-xs text-fg-muted hover:bg-fill-hover transition-colors group">
						<span>
							<Trans>Transaction breakdown</Trans> ({formatUSD(quote.totalFeesUSD, 2)})
						</span>
						<CaretDownIcon className="size-3 group-data-[state=open]:hidden" />
						<CaretUpIcon className="size-3 hidden group-data-[state=open]:block" />
					</CollapsibleTrigger>
					<CollapsibleContent>
						<InfoRowGroup className="text-xs">
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
			) : null}

			{quoteError ? (
				<div className="flex items-center gap-2 rounded-8 border border-stroke-error-strong/30 bg-error-soft p-2.5">
					<WarningCircleIcon className="size-4 text-error shrink-0" />
					<span className="text-xs text-error">
						<Trans>No route available. Try a different amount or asset.</Trans>
					</span>
				</div>
			) : null}

			<Button
				variant="filled"
				intent="brand"
				size="lg"
				className="w-full mt-auto"
				disabled={!quote || quoteLoading}
				onClick={() => quote && onConfirm(quote)}
			>
				{quoteLoading ? (
					<>
						<SpinnerGapIcon className="size-4 animate-spin" />
						<Trans>Preparing your quote...</Trans>
					</>
				) : (
					<Trans>Confirm</Trans>
				)}
			</Button>
		</div>
	);
}
