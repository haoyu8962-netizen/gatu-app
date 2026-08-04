import { Button } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon, WalletIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { getTradingToolbarBalanceSummary } from "@/domain/trade/balance-toolbar";
import { getPerpBalanceRows, getSpotBalanceRows } from "@/domain/trade/balances";
import { useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useSpotTokenUsdPrices } from "@/hooks/trade/use-spot-token-usd-prices";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { formatToken, formatUSD } from "@/lib/format";
import { useSpotTokens } from "@/lib/hyperliquid/markets/use-spot-tokens";
import { useDepositModalActions } from "@/stores/use-global-modal-store";
import { AssetDisplay } from "../components/asset-display";
import { MetricCell } from "./metric-cell";

export function MobileBalancesTab() {
	const { t } = useLingui();
	const { isConnected } = useWalletSession();
	const { getToken } = useSpotTokens();
	const { open: openDepositModal } = useDepositModalActions();
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

	if (!isConnected) return <MobileBalancesState label={t`Connect your wallet to view balances.`} />;
	if (hasError) return <MobileBalancesState variant="error" label={t`Failed to load balances.`} />;
	if (isLoading) return <MobileBalancesState loading label={t`Loading balances...`} />;
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
				<div className="flex min-h-0 flex-col gap-2.5 p-3.5">
					{balances.map((row) => {
						const decimals = row.type === "perp" ? 2 : (getToken(row.asset)?.szDecimals ?? 2);

						return (
							<article
								key={`${row.type}-${row.asset}`}
								className="overflow-hidden rounded-[14px] border border-market-close-stroke-card bg-modal"
							>
								<header className="flex min-h-11 items-center justify-between gap-3 border-b border-market-close-stroke-card bg-market-close-card px-3.5 py-2.5">
									<div className="flex min-w-0 items-center gap-2">
										<AssetDisplay
											coin={row.asset}
											iconClassName="size-[26px]"
											nameClassName="truncate text-[13px] font-bold text-market-close-fg"
										/>
										<span className="shrink-0 text-[10px] font-medium text-market-close-subtle">
											{row.type === "perp" ? t`Perps` : t`Spot`}
										</span>
									</div>
									<span className="shrink-0 text-[13px] font-semibold text-market-close-fg tabular-nums">
										{formatUSD(row.usdValue, { compact: true })}
									</span>
								</header>
								<div className="grid grid-cols-2 divide-x divide-market-close-stroke-card">
									<MetricCell
										label={<span className="text-[10px] leading-[14px] text-market-close-subtle">{t`Available`}</span>}
										value={formatToken(row.available, decimals)}
										valueClass="font-semibold text-market-close-fg"
									/>
									<MetricCell
										label={<span className="text-[10px] leading-[14px] text-market-close-subtle">{t`Total`}</span>}
										value={formatToken(row.total, decimals)}
										valueClass="font-semibold text-market-close-fg"
									/>
								</div>
								<div className="grid grid-cols-2 divide-x divide-market-close-stroke-card border-t border-market-close-stroke-card">
									<MetricCell
										label={<span className="text-[10px] leading-[14px] text-market-close-subtle">{t`In Orders`}</span>}
										value={formatToken(row.inOrder, decimals)}
										valueClass="font-semibold text-market-close-fg"
									/>
									<MetricCell
										label={<span className="text-[10px] leading-[14px] text-market-close-subtle">{t`USD Value`}</span>}
										value={formatUSD(row.usdValue, { compact: true })}
										valueClass="font-semibold text-market-close-fg"
									/>
								</div>
							</article>
						);
					})}
				</div>
			)}
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
