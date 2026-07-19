import { useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon, WalletIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { getPerpBalanceRows, getSpotBalanceRows, getTotalUsdValue } from "@/domain/trade/balances";
import { useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useSpotTokenUsdPrices } from "@/hooks/trade/use-spot-token-usd-prices";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { formatToken, formatUSD } from "@/lib/format";
import { useSpotTokens } from "@/lib/hyperliquid/markets/use-spot-tokens";
import { AssetDisplay } from "../trade/components/asset-display";
import { MetricCell } from "../trade/mobile/metric-cell";

export function PortfolioMobileBalances() {
	const { t } = useLingui();
	const { isConnected } = useWalletSession();
	const { getToken } = useSpotTokens();
	const {
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
	const totalValue = useMemo(() => getTotalUsdValue(balances), [balances]);

	if (hasError) return <PortfolioBalancesState variant="error" label={t`Failed to load balances.`} />;
	if (isLoading) return <PortfolioBalancesState loading label={t`Loading balances...`} />;
	if (balances.length === 0)
		return <PortfolioBalancesState label={t`No balances found. Deposit funds to start trading.`} />;

	return (
		<div className="flex min-h-0 flex-col gap-2 p-2">
			<div className="flex items-center justify-between gap-3 px-1 text-xs">
				<span className="text-fg-muted">{t`Total balance`}</span>
				<span className="inline-flex items-center gap-1 font-medium tabular-nums text-fg">
					{isSpotStateStale ? (
						<SpinnerGapIcon className="size-3 animate-spin text-warning" aria-label={t`Loading...`} />
					) : null}
					{formatUSD(totalValue, { compact: true })}
				</span>
			</div>

			{balances.map((row) => {
				const decimals = row.type === "perp" ? 2 : (getToken(row.asset)?.szDecimals ?? 2);

				return (
					<article
						key={`${row.type}-${row.asset}`}
						className="overflow-hidden rounded-xs border border-stroke-weak bg-surface"
					>
						<header className="flex items-center justify-between gap-3 border-b border-stroke-weak px-3 py-2">
							<div className="flex min-w-0 items-center gap-2">
								<AssetDisplay coin={row.asset} nameClassName="truncate text-sm font-medium text-fg" />
								<span className="shrink-0 text-2xs font-medium uppercase text-fg-muted">
									{row.type === "perp" ? t`Perps` : t`Spot`}
								</span>
							</div>
							<span className="shrink-0 text-sm font-medium tabular-nums text-fg">
								{formatUSD(row.usdValue, { compact: true })}
							</span>
						</header>
						<div className="grid grid-cols-2 divide-x divide-stroke-weak">
							<MetricCell label={t`Available`} value={formatToken(row.available, decimals)} />
							<MetricCell label={t`Total`} value={formatToken(row.total, decimals)} />
						</div>
						<div className="grid grid-cols-2 divide-x divide-stroke-weak border-t border-stroke-weak">
							<MetricCell label={t`In Orders`} value={formatToken(row.inOrder, decimals)} />
							<MetricCell label={t`USD Value`} value={formatUSD(row.usdValue, { compact: true })} />
						</div>
					</article>
				);
			})}
		</div>
	);
}

function PortfolioBalancesState({
	label,
	loading = false,
	variant = "muted",
}: {
	label: string;
	loading?: boolean;
	variant?: "muted" | "error";
}) {
	return (
		<div className="flex min-h-60 flex-col items-center justify-center gap-2.5 p-6 text-center">
			<div className="flex size-10 items-center justify-center rounded-full bg-fill-weaker">
				{loading ? (
					<SpinnerGapIcon className="size-5 animate-spin text-fg-muted" />
				) : (
					<WalletIcon className="size-5 text-fg-muted" />
				)}
			</div>
			<p className={variant === "error" ? "max-w-xs text-xs text-error" : "max-w-xs text-xs text-fg-muted"}>{label}</p>
		</div>
	);
}
