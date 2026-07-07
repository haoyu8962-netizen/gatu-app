import { Button, Tooltip } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { ArrowsLeftRightIcon, DownloadSimpleIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { InfoRow, InfoRowGroup } from "@/components/ui/info-row";
import { HL_ALL_DEXS } from "@/config/app";
import { getAccountBalanceSummary, isQuoteBalanceSharedWithPerps } from "@/domain/trade/balances";
import { useDefaultDexBalances, useSelectedDexBalances } from "@/hooks/trade/use-account-balances";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatPercent, formatUSD } from "@/lib/format";
import { useSubscription } from "@/lib/hyperliquid";
import { toNumberOrZero } from "@/lib/trade/numbers";
import { getValueColorClass } from "@/lib/ui/value-color";
import { useDepositModalActions, useTransferModalActions } from "@/stores/use-global-modal-store";

type SummaryRow = {
	label: string;
	value: string;
	valueClassName?: string;
};

export function AccountPanel() {
	const { open: openDepositModal } = useDepositModalActions();
	const { open: openTransferModal } = useTransferModalActions();
	const { isConnected, sessionMode } = useWalletSession();
	const { tradeRestricted } = useGeoRestriction();
	const selectedBalances = useSelectedDexBalances();
	const defaultBalances = useDefaultDexBalances();
	const accountAbstraction = selectedBalances.accountAbstraction;
	const summaryBalances = isQuoteBalanceSharedWithPerps(accountAbstraction) ? defaultBalances : selectedBalances;
	const { data: allMidsEvent } = useSubscription("allMids", { dex: HL_ALL_DEXS }, { enabled: isConnected });
	const accountSummary = getAccountBalanceSummary({
		accountAbstraction,
		marginSummary: summaryBalances.marginSummary,
		perpSummary: summaryBalances.perpSummary,
		withdrawable: summaryBalances.withdrawable,
		spotBalances: summaryBalances.spotBalances,
		spotAvailableAfterMaintenance: summaryBalances.spotAvailableAfterMaintenance,
		tokenUsdPrices: allMidsEvent?.mids,
	});

	let perpMetrics = null;
	if (summaryBalances.marginSummary || accountSummary.accountEquity > 0) {
		const accountValue = accountSummary.accountEquity;
		const totalNtlPos = toNumberOrZero(summaryBalances.marginSummary?.totalNtlPos);
		const maintenanceMargin = toNumberOrZero(summaryBalances.crossMaintenanceMarginUsed);

		let unrealizedPnl = 0;
		for (const pos of summaryBalances.perpPositions) {
			unrealizedPnl += toNumberOrZero(pos.position.unrealizedPnl);
		}

		const marginRatio = accountValue > 0 ? maintenanceMargin / accountValue : 0;
		const crossLeverage = accountValue > 0 ? Math.abs(totalNtlPos) / accountValue : 0;

		perpMetrics = {
			accountValue,
			unrealizedPnl,
			marginRatio,
			crossLeverage,
			maintenanceMargin,
		};
	}

	const hasPerpData = isConnected && perpMetrics !== null;
	const hasWalletAccess = sessionMode === "wallet";
	const internalTransferDisabledReason = isQuoteBalanceSharedWithPerps(accountAbstraction)
		? t`Transfers between Spot and Perps are unavailable in unified account mode.`
		: null;

	const perpRows: SummaryRow[] = perpMetrics
		? [
				{
					label: t`Portfolio Value`,
					value: formatUSD(perpMetrics.accountValue),
					valueClassName: "tabular-nums",
				},
				{
					label: t`Unrealized PNL`,
					value: formatUSD(perpMetrics.unrealizedPnl, { signDisplay: "exceptZero" }),
					valueClassName: cn("tabular-nums", getValueColorClass(perpMetrics.unrealizedPnl)),
				},
				{
					label: t`Cross Margin Ratio`,
					value: formatPercent(perpMetrics.marginRatio, { maximumFractionDigits: 2 }),
					valueClassName: "tabular-nums",
				},
				{
					label: t`Maintenance Margin`,
					value: formatUSD(perpMetrics.maintenanceMargin),
					valueClassName: "tabular-nums",
				},
				{
					label: t`Cross Account Leverage`,
					value: `${perpMetrics.crossLeverage.toFixed(2)}x`,
					valueClassName: "tabular-nums",
				},
			]
		: [];

	return (
		<div className="shrink-0 flex flex-col bg-surface border-t border-stroke-weak pb-6 overflow-hidden">
			<div className="px-2 py-2 border-b border-stroke-weak">
				<span className="text-xs font-medium text-fg-muted uppercase tracking-wide">{t`Account`}</span>
			</div>

			{!isConnected ? (
				<div className="text-xs text-fg-muted text-center py-4">{t`Connect wallet to view account`}</div>
			) : (
				<div className="p-2 overflow-y-auto">
					{hasPerpData && (
						<>
							<p className="text-xs font-medium text-fg mb-1">{t`Perps Overview`}</p>
							<InfoRowGroup className="divide-y-0">
								{perpRows.map((row) => (
									<InfoRow key={row.label} label={row.label} value={row.value} valueClassName={row.valueClassName} />
								))}
							</InfoRowGroup>
						</>
					)}

					{tradeRestricted || !hasWalletAccess ? (
						<p className="mt-4 text-center text-xs text-fg-muted">{t`Deposits and withdrawals are not allowed.`}</p>
					) : (
						<div className="grid grid-cols-2 gap-1 mt-4">
							<Button
								variant="outline"
								intent="neutral"
								onClick={() => openDepositModal("withdraw")}
								aria-label={t`Withdraw`}
								iconLeft={<UploadSimpleIcon className="size-4" />}
							>
								{t`Withdraw`}
							</Button>
							<Button
								variant="outline"
								intent="neutral"
								onClick={() => openDepositModal("deposit")}
								aria-label={t`Deposit`}
								iconLeft={<DownloadSimpleIcon className="size-4" />}
							>
								{t`Deposit`}
							</Button>
							<Tooltip content={internalTransferDisabledReason} side="top">
								<span className="inline-flex w-full">
									<Button
										variant="outline"
										intent="neutral"
										onClick={() => openTransferModal("toPerp")}
										aria-label={t`Transfer between Perps and Spot`}
										iconLeft={<ArrowsLeftRightIcon className="size-4" />}
										disabled={!!internalTransferDisabledReason}
										className="w-full"
									>
										{t`Perps / Spot`}
									</Button>
								</span>
							</Tooltip>
							<Button
								variant="outline"
								intent="neutral"
								onClick={() => openDepositModal("bridge")}
								aria-label={t`Bridge`}
								iconLeft={<ArrowsLeftRightIcon className="size-4" />}
							>
								{t`Bridge`}
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
