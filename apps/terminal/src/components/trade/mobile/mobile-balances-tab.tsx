import { Button } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon, WalletIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { getTradingToolbarBalanceSummary, isTradingToolbarBalancePositive } from "@/domain/trade/balance-toolbar";
import { getPerpBalanceRows, getSpotBalanceRows, isQuoteBalanceSharedWithPerps } from "@/domain/trade/balances";
import { isSupportedAccountAbstraction, useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useSpotTokenUsdPrices } from "@/hooks/trade/use-spot-token-usd-prices";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { formatToken, formatUSD } from "@/lib/format";
import { useSpotTokens } from "@/lib/hyperliquid/markets/use-spot-tokens";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { useDepositModalActions } from "@/stores/use-global-modal-store";
import { AssetDisplay } from "../components/asset-display";
import { TransferModal } from "../positions/transfer-modal";

type TransferDirection = "toSpot" | "toPerp";

export function MobileBalancesTab() {
	useNumberFormatRevision();
	const { t } = useLingui();
	const { isConnected } = useWalletSession();
	const { getToken } = useSpotTokens();
	const { open: openDepositModal } = useDepositModalActions();
	const [transferState, setTransferState] = useState<{
		open: boolean;
		direction: TransferDirection;
	}>({ open: false, direction: "toSpot" });
	const {
		marginSummary,
		perpSummary,
		spotBalances,
		spotAvailableAfterMaintenance,
		accountAbstraction,
		withdrawable,
		isSpotStateStale,
		isLoading,
		hasError,
	} = useDefaultDexBalances();
	const mids = useSpotTokenUsdPrices(isConnected);
	const accountModeReady = isSupportedAccountAbstraction(accountAbstraction);
	const balances = useMemo(
		() => [
			...getPerpBalanceRows(perpSummary, spotBalances, spotAvailableAfterMaintenance, accountAbstraction, withdrawable),
			...getSpotBalanceRows(spotBalances, spotAvailableAfterMaintenance, accountAbstraction, mids),
		],
		[accountAbstraction, mids, perpSummary, spotAvailableAfterMaintenance, spotBalances, withdrawable],
	);
	const summary = useMemo(
		() =>
			getTradingToolbarBalanceSummary({
				accountAbstraction,
				marginSummary,
				perpSummary,
				spotBalances,
				tokenUsdPrices: mids,
				withdrawable,
			}),
		[accountAbstraction, marginSummary, mids, perpSummary, spotBalances, withdrawable],
	);
	const internalTransfersEnabled = accountModeReady && !isQuoteBalanceSharedWithPerps(accountAbstraction);

	function handleTransfer(rowType: "perp" | "spot") {
		setTransferState({
			open: true,
			direction: rowType === "perp" ? "toSpot" : "toPerp",
		});
	}

	if (!isConnected) return <MobileBalancesState label={t`Connect your wallet to view balances.`} />;
	if (hasError) return <MobileBalancesState variant="error" label={t`Failed to load balances.`} />;
	if (isLoading) return <MobileBalancesState loading label={t`Loading balances...`} />;
	if (!accountModeReady) {
		return <MobileBalancesState variant="error" label={t`Select a supported account mode to view balances.`} />;
	}
	return (
		<div className="flex min-h-0 flex-col font-market-close">
			<dl
				data-testid="mobile-balances-summary-bar"
				className="flex shrink-0 items-center justify-between gap-5 border-b border-market-close-stroke-card bg-market-close-card px-3.5 py-3"
			>
				<div className="flex min-w-0 flex-col gap-px">
					<dt className="text-[10px] leading-[14px] text-market-close-subtle">{t`Total assets`}</dt>
					<dd className="m-0 inline-flex items-center gap-1 text-sm leading-[19px] font-bold text-market-close-fg tabular-nums">
						{isSpotStateStale ? (
							<SpinnerGapIcon className="size-3 animate-spin text-warning" aria-label={t`Loading...`} />
						) : null}
						{formatUSD(summary.totalAssets, { compact: false })}
					</dd>
				</div>
				<div className="flex min-w-0 flex-col items-end gap-px text-right">
					<dt className="text-[10px] leading-[14px] text-market-close-subtle">{t`Withdrawable`}</dt>
					<dd className="m-0 text-sm leading-[19px] font-semibold text-market-close-fg tabular-nums">
						{formatUSD(summary.withdrawable, { compact: false })}
					</dd>
				</div>
			</dl>

			{balances.length === 0 ? (
				<MobileBalancesState
					label={t`No balances found. Deposit funds to start trading.`}
					actionLabel={t`Deposit`}
					onAction={() => openDepositModal("deposit")}
				/>
			) : (
				<div className="flex min-h-0 flex-col">
					{balances.map((row) => {
						const decimals = row.type === "perp" ? 2 : (getToken(row.asset)?.szDecimals ?? 2);
						const canTransfer =
							internalTransfersEnabled &&
							row.asset === DEFAULT_QUOTE_TOKEN &&
							isTradingToolbarBalancePositive(row.available);

						return (
							<article
								key={`${row.type}-${row.asset}`}
								className="flex min-h-[57px] items-center justify-between gap-3 border-b border-market-close-stroke-card px-3.5 py-3 transition-colors duration-[120ms] active:bg-market-close-hover"
							>
								<div className="flex min-w-0 items-center gap-2">
									<AssetDisplay
										coin={row.asset}
										iconClassName="size-[26px]"
										nameClassName="truncate text-[13px] font-bold text-market-close-fg"
									/>
									{internalTransfersEnabled ? (
										<span className="shrink-0 text-[10px] font-medium text-market-close-subtle">
											{row.type === "perp" ? t`Trading` : t`Spot`}
										</span>
									) : null}
								</div>
								<div className="ml-auto flex min-w-0 items-center gap-2.5">
									<div className="min-w-0 text-right">
										<div className="truncate text-[13px] font-semibold text-market-close-fg tabular-nums">
											{formatUSD(row.usdValue, { compact: true })}
										</div>
										<div className="truncate text-[10px] text-market-close-subtle tabular-nums">
											{t`Available`} {formatToken(row.available, decimals)}
										</div>
									</div>
									{canTransfer ? (
										<Button
											variant="outline"
											intent="neutral"
											size="xs"
											onClick={() => handleTransfer(row.type)}
											className="min-h-11 shrink-0 rounded-[6px] border-market-close-stroke-input px-2.5 text-xs font-semibold text-market-close-fg shadow-none active:scale-100"
										>
											{t`Transfer`}
										</Button>
									) : null}
								</div>
							</article>
						);
					})}
				</div>
			)}
			<TransferModal
				open={transferState.open}
				onOpenChange={(open) => setTransferState((current) => ({ ...current, open }))}
				initialDirection={transferState.direction}
			/>
		</div>
	);
}

function MobileBalancesState({
	label,
	loading = false,
	variant = "muted",
	actionLabel,
	onAction,
}: {
	label: string;
	loading?: boolean;
	variant?: "muted" | "error";
	actionLabel?: string;
	onAction?: () => void;
}) {
	return (
		<div className="flex min-h-60 flex-col items-center justify-center gap-2.5 p-6 text-center font-market-close">
			<div className="flex size-10 items-center justify-center rounded-full bg-market-close-hover">
				{loading ? (
					<SpinnerGapIcon className="size-5 animate-spin text-market-close-subtle" />
				) : (
					<WalletIcon className="size-5 text-market-close-subtle" />
				)}
			</div>
			<p
				className={
					variant === "error" ? "max-w-xs text-xs text-market-close-danger" : "max-w-xs text-xs text-market-close-muted"
				}
			>
				{label}
			</p>
			{actionLabel && onAction ? (
				<Button
					variant="outline"
					intent="neutral"
					size="sm"
					onClick={onAction}
					className="min-h-11 rounded-[8px] border-market-close-stroke-control px-4 text-xs font-semibold text-market-close-fg"
				>
					{actionLabel}
				</Button>
			) : null}
		</div>
	);
}
