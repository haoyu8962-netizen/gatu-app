import { Button, Tooltip } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { ArrowsLeftRightIcon, DownloadSimpleIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { InfoRow, InfoRowGroup } from "@/components/ui/info-row";
import { LIFI_BRIDGE_FEATURES, shouldShowLiFiBridgeTab } from "@/config/lifi-bridge";
import { getAccountBalanceSummary, getPerpRiskSummary, isQuoteBalanceSharedWithPerps } from "@/domain/trade/balances";
import {
	isSupportedAccountAbstraction,
	useDefaultDexBalances,
	useSelectedDexBalances,
} from "@/hooks/trade/use-account-balances";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { useSpotTokenUsdPriceState } from "@/hooks/trade/use-spot-token-usd-prices";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatPercent, formatUSD } from "@/lib/format";
import { useHasExistingBridgeExecution } from "@/lib/lifi/bridge-execution-state";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { getValueColorClass } from "@/lib/ui/value-color";
import { useDepositModalActions, useTransferModalActions } from "@/stores/use-global-modal-store";

type SummaryRow = {
	label: string;
	value: ReactNode;
	valueClassName?: string;
};

function getMarginRatioTone(ratio: number): { text: string; bar: string } {
	if (ratio >= 0.75) return { text: "text-trading-panel-error", bar: "bg-trading-panel-error" };
	if (ratio >= 0.5) return { text: "text-trading-panel-warning", bar: "bg-trading-panel-warning" };
	return { text: "text-trading-panel-success", bar: "bg-trading-panel-success" };
}

export function AccountPanel() {
	useNumberFormatRevision();
	const { t } = useLingui();
	const { open: openDepositModal } = useDepositModalActions();
	const { open: openTransferModal } = useTransferModalActions();
	const { hasWalletAccess, isConnected, walletAddress } = useWalletSession();
	const depositAvailability = useDepositAvailability();
	const { actionsBlocked: tradeRestricted } = useGeoRestriction();
	const selectedBalances = useSelectedDexBalances();
	const defaultBalances = useDefaultDexBalances();
	const accountAbstraction = selectedBalances.accountAbstraction;
	const accountModeReady = isSupportedAccountAbstraction(accountAbstraction);
	const usesSharedQuoteBalance = isQuoteBalanceSharedWithPerps(accountAbstraction);
	const summaryBalances = usesSharedQuoteBalance ? defaultBalances : selectedBalances;
	const tokenUsdPriceState = useSpotTokenUsdPriceState(isConnected);
	const tokenUsdPrices = tokenUsdPriceState.prices;
	const accountSummary = getAccountBalanceSummary({
		accountAbstraction,
		marginSummary: summaryBalances.marginSummary,
		perpSummary: summaryBalances.perpSummary,
		withdrawable: summaryBalances.withdrawable,
		spotBalances: summaryBalances.spotBalances,
		spotAvailableAfterMaintenance: summaryBalances.spotAvailableAfterMaintenance,
		tokenUsdPrices,
	});

	let perpMetrics = null;
	if (summaryBalances.marginSummary || accountSummary.accountEquity > 0) {
		const accountValue = accountSummary.accountEquity;
		const riskSummary = usesSharedQuoteBalance
			? getPerpRiskSummary(selectedBalances.allDexClearinghouseStates.map(([, state]) => state))
			: getPerpRiskSummary([summaryBalances]);
		const totalNtlPos = riskSummary.totalNtlPos;
		const maintenanceMargin = riskSummary.crossMaintenanceMarginUsed;

		const marginRatio = accountValue > 0 ? maintenanceMargin / accountValue : 0;
		const crossLeverage = accountValue > 0 ? Math.abs(totalNtlPos) / accountValue : 0;

		perpMetrics = {
			accountValue,
			unrealizedPnl: riskSummary.unrealizedPnl,
			marginRatio,
			crossLeverage,
			maintenanceMargin,
		};
	}

	const hasPerpData =
		isConnected &&
		accountModeReady &&
		perpMetrics !== null &&
		!summaryBalances.isDataStale &&
		summaryBalances.perpStateStatus === "success" &&
		(!usesSharedQuoteBalance || tokenUsdPriceState.status === "success");
	const fundsActionsReady =
		accountModeReady &&
		!selectedBalances.hasError &&
		!selectedBalances.isDataStale &&
		selectedBalances.perpStateStatus === "success" &&
		selectedBalances.spotStateStatus === "success";
	const hasExistingBridgeExecution = useHasExistingBridgeExecution(walletAddress);
	const showBridgeEntry = shouldShowLiFiBridgeTab({
		isEmbeddedDeposit: false,
		hasExistingExecution: hasExistingBridgeExecution,
		createNewRoute: LIFI_BRIDGE_FEATURES.createNewRoute,
	});
	const internalTransferDisabledReason = !hasWalletAccess
		? t`Connect the owner wallet before moving funds.`
		: !accountModeReady
			? t`Select a supported account mode before moving funds.`
			: !fundsActionsReady
				? t`Balance data is unavailable. Try again after the connection recovers.`
				: isQuoteBalanceSharedWithPerps(accountAbstraction)
					? t`Transfers between Spot and Perps are unavailable in unified account mode.`
					: null;
	const depositGeoBlocked =
		depositAvailability.reason === "geo-restricted" || depositAvailability.reason === "geo-unresolved";
	const showsFundsActions = hasWalletAccess || depositAvailability.path === "sponsored";

	const marginRatioTone = perpMetrics ? getMarginRatioTone(perpMetrics.marginRatio) : null;
	const perpRows: SummaryRow[] = perpMetrics
		? [
				{
					label: t`Portfolio Value`,
					value: formatUSD(perpMetrics.accountValue, { compact: false }),
					valueClassName: "tabular-nums",
				},
				{
					label: t`Unrealized PNL`,
					value: formatUSD(perpMetrics.unrealizedPnl, { compact: false, signDisplay: "exceptZero" }),
					valueClassName: cn("tabular-nums", getValueColorClass(perpMetrics.unrealizedPnl)),
				},
				{
					label: t`Cross Margin Ratio`,
					value: (
						<span className="inline-flex items-center gap-1.5">
							<span className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-trading-panel-stroke-card">
								<span
									className={cn("block h-full rounded-full", marginRatioTone?.bar)}
									style={{ width: `${Math.min(100, Math.max(0, perpMetrics.marginRatio * 100))}%` }}
								/>
							</span>
							<span className={cn("font-bold", marginRatioTone?.text)}>
								{formatPercent(perpMetrics.marginRatio, { maximumFractionDigits: 2 })}
							</span>
						</span>
					),
					valueClassName: "tabular-nums",
				},
				{
					label: t`Maintenance Margin`,
					value: formatUSD(perpMetrics.maintenanceMargin, { compact: false }),
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
		<div className="flex flex-col bg-surface border-t border-stroke-weak pb-6">
			<div className="px-2 py-2 border-b border-trading-panel-stroke-card">
				<span className="text-2sm font-bold text-trading-panel-fg">{t`Account`}</span>
			</div>

			{!isConnected ? (
				<div className="flex-1 text-xs text-fg-muted text-center py-4">{t`Connect wallet to view account`}</div>
			) : (
				<div className="p-2">
					{hasPerpData && (
						<>
							<p className="text-2sm font-bold text-trading-panel-fg mb-1">{t`Perps Overview`}</p>
							<InfoRowGroup className="divide-y-0 tracking-normal">
								{perpRows.map((row) => (
									<InfoRow
										key={row.label}
										label={row.label}
										value={row.value}
										labelClassName="min-w-0 truncate text-trading-panel-muted"
										valueClassName={cn(
											"shrink-0 whitespace-nowrap font-semibold text-trading-panel-fg",
											row.valueClassName,
										)}
									/>
								))}
							</InfoRowGroup>
						</>
					)}

					{depositGeoBlocked ? (
						<p className="mt-4 text-center text-xs text-fg-muted">{depositAvailability.unavailableReason}</p>
					) : tradeRestricted || !showsFundsActions ? (
						<p className="mt-4 text-center text-xs text-fg-muted">{t`Deposits and withdrawals are not allowed.`}</p>
					) : (
						<div className="grid grid-cols-2 gap-2 mt-4">
							{depositAvailability.unavailableReason ? (
								<output className="col-span-2 text-center text-xs text-fg-muted">
									{depositAvailability.unavailableReason}
								</output>
							) : null}
							<Button
								variant="outline"
								intent="neutral"
								disabled={!hasWalletAccess || !fundsActionsReady}
								onClick={() => openDepositModal("withdraw")}
								aria-label={t`Withdraw`}
								iconLeft={<UploadSimpleIcon className="size-4" />}
								className="rounded-[8px] border-trading-panel-stroke-input font-semibold text-trading-panel-fg shadow-none hover:border-trading-panel-stroke-control"
							>
								{t`Withdraw`}
							</Button>
							<Tooltip content={depositAvailability.unavailableReason} side="top">
								<span className="inline-flex w-full">
									<Button
										variant="filled"
										intent="neutral"
										disabled={!depositAvailability.available}
										onClick={depositAvailability.available ? () => openDepositModal("deposit") : undefined}
										aria-label={depositAvailability.available ? t`Deposit` : depositAvailability.unavailableLabel}
										title={depositAvailability.unavailableReason ?? undefined}
										iconLeft={<DownloadSimpleIcon className="size-4" />}
										className="w-full rounded-[8px] bg-trading-panel-control font-bold text-trading-panel-on-control shadow-none hover:bg-trading-panel-control/90"
									>
										{depositAvailability.available ? t`Deposit` : depositAvailability.unavailableLabel}
									</Button>
								</span>
							</Tooltip>
							<Tooltip content={internalTransferDisabledReason} side="top">
								<span className="inline-flex w-full">
									<Button
										variant="outline"
										intent="neutral"
										onClick={() => openTransferModal("toPerp")}
										aria-label={t`Transfer between Perps and Spot`}
										iconLeft={<ArrowsLeftRightIcon className="size-4" />}
										disabled={!!internalTransferDisabledReason}
										className="w-full rounded-[8px] border-trading-panel-stroke-row font-semibold text-trading-panel-subtle shadow-none hover:border-trading-panel-stroke-control"
									>
										{t`Perps / Spot`}
									</Button>
								</span>
							</Tooltip>
							{hasWalletAccess && showBridgeEntry ? (
								<Button
									variant="outline"
									intent="neutral"
									onClick={() => openDepositModal("bridge")}
									aria-label={t`Bridge`}
									iconLeft={<ArrowsLeftRightIcon className="size-4" />}
									className="rounded-[8px] border-trading-panel-stroke-input font-semibold text-trading-panel-fg shadow-none hover:border-trading-panel-stroke-control"
								>
									{t`Bridge`}
								</Button>
							) : null}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
