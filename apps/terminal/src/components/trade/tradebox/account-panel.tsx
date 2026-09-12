import { Button, Tooltip } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { ArrowsLeftRightIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { type ReactNode, useId } from "react";
import { InfoRow, InfoRowGroup } from "@/components/ui/info-row";
import { Skeleton, SkeletonValue } from "@/components/ui/skeleton";
import { LIFI_BRIDGE_FEATURES, shouldShowLiFiBridgeTab } from "@/config/lifi-bridge";
import { useAccountOverview } from "@/hooks/trade/use-account-overview";
import { useAccountOverviewLabels } from "@/hooks/trade/use-account-overview-labels";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { useFundsActionAvailability } from "@/hooks/trade/use-funds-action-availability";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatNumber, formatPercent, formatUSD } from "@/lib/format";
import { useHasExistingBridgeExecution } from "@/lib/lifi/bridge-execution-state";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { useDepositModalActions, useTransferModalActions } from "@/stores/use-global-modal-store";

import { DisconnectedAccountOverview } from "./disconnected-account-overview";

type SummaryRow = {
	key: string;
	label: ReactNode;
	value: ReactNode;
	valueClassName?: string;
};

export function AccountPanel() {
	useNumberFormatRevision();
	const { t } = useLingui();
	const overviewTitleId = useId();
	const transferDescriptionId = useId();
	const transferUnavailableId = useId();
	const withdrawUnavailableId = useId();
	const { open: openDepositModal } = useDepositModalActions();
	const { open: openTransferModal } = useTransferModalActions();
	const { hasWalletAccess, isConnected, walletAddress } = useWalletSession();
	const depositAvailability = useDepositAvailability();
	const {
		accountAbstraction,
		accountEquityValue,
		accountMode,
		accountRisk,
		crossLeverage,
		fundsActionsReady,
		maintenanceMarginRatio,
		marginRatioReady,
		riskSummary,
		snapshotReady: balanceSnapshotReady,
		status: accountOverviewStatus,
		unrealizedPnlTone,
		usesSharedQuoteBalance,
		valuationUnavailable,
	} = useAccountOverview();
	const overviewLabels = useAccountOverviewLabels({ accountMode, usesSharedQuoteBalance });
	const fundsActionAvailability = useFundsActionAvailability({
		accountDataReady: fundsActionsReady,
		accountAbstraction,
		fundsActionsEnabled: true,
		hasWalletAccess,
		internalTransfersEnabled: !usesSharedQuoteBalance,
	});
	const metricLoading = accountOverviewStatus === "loading";
	const metricsHaveError = accountOverviewStatus === "error";
	const metricsAreStale = accountOverviewStatus === "stale";
	const marginRatioLabel = marginRatioReady
		? formatPercent(maintenanceMarginRatio, { maximumFractionDigits: 2, signDisplay: "never" })
		: "—";
	const crossLeverageLabel = crossLeverage === null ? "—" : `${formatNumber(crossLeverage, 2)}x`;

	const hasExistingBridgeExecution = useHasExistingBridgeExecution(walletAddress);
	const showBridgeEntry = shouldShowLiFiBridgeTab({
		isEmbeddedDeposit: false,
		hasExistingExecution: hasExistingBridgeExecution,
		createNewRoute: LIFI_BRIDGE_FEATURES.createNewRoute,
	});
	const withdrawDisabledReason = fundsActionAvailability.withdrawal.unavailableReason;
	const internalTransferDisabledReason = fundsActionAvailability.internalTransfer.unavailableReason;
	const transferDescriptionIds = internalTransferDisabledReason
		? `${transferDescriptionId} ${transferUnavailableId}`
		: transferDescriptionId;
	const depositGeoBlocked =
		depositAvailability.reason === "geo-restricted" || depositAvailability.reason === "geo-unresolved";
	const showsFundsActions = hasWalletAccess || depositAvailability.path === "sponsored";
	const showsSecondaryFundsActions = !depositGeoBlocked && showsFundsActions;

	function renderMetricValue(value: ReactNode) {
		return (
			<Skeleton
				name="desktop-account-overview-metric"
				loading={metricLoading}
				fallback={<SkeletonValue className="w-16" />}
			>
				<span>{value}</span>
			</Skeleton>
		);
	}

	const summaryRows: SummaryRow[] = [
		{
			key: "portfolio-value",
			label: overviewLabels.accountValue,
			value: renderMetricValue(
				balanceSnapshotReady && accountEquityValue !== null ? formatUSD(accountEquityValue, { compact: false }) : "—",
			),
		},
		{
			key: "unrealized-pnl",
			label: overviewLabels.unrealizedPnl,
			value: renderMetricValue(
				balanceSnapshotReady && riskSummary
					? formatUSD(riskSummary.unrealizedPnl, { compact: false, signDisplay: "exceptZero" })
					: "—",
			),
			valueClassName:
				unrealizedPnlTone === "positive" ? "text-success" : unrealizedPnlTone === "negative" ? "text-error" : undefined,
		},
		{
			key: "margin-ratio",
			label: overviewLabels.accountMarginRatio,
			value: renderMetricValue(
				<span
					role="progressbar"
					aria-label={overviewLabels.accountMarginRatio}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={accountRisk.progressPercent === null ? undefined : Number(accountRisk.progressPercent)}
					aria-valuetext={marginRatioLabel}
					className="inline-flex items-center gap-1.5"
				>
					<span className="account-panel-risk-bar h-1 w-14 shrink-0 overflow-hidden rounded-full bg-trading-panel-stroke-card">
						{marginRatioReady ? (
							<span
								className={cn(
									"block h-full rounded-full",
									accountRisk.tone === "danger"
										? "bg-trading-panel-error"
										: accountRisk.tone === "warning"
											? "bg-trading-panel-warning"
											: "bg-trading-panel-success",
								)}
								style={{ width: `${accountRisk.progressPercent ?? 0}%` }}
							/>
						) : null}
					</span>
					<span
						className={cn(
							"font-bold",
							!marginRatioReady
								? "text-trading-panel-muted"
								: accountRisk.tone === "danger"
									? "text-trading-panel-error"
									: accountRisk.tone === "warning"
										? "text-trading-panel-warning"
										: "text-trading-panel-success",
						)}
					>
						{marginRatioLabel}
					</span>
				</span>,
			),
		},
		{
			key: "cross-maintenance-margin",
			label: overviewLabels.crossMaintenanceMargin,
			value: renderMetricValue(
				balanceSnapshotReady && riskSummary
					? formatUSD(riskSummary.crossMaintenanceMarginUsed, { compact: false })
					: "—",
			),
		},
		{
			key: "cross-account-leverage",
			label: overviewLabels.crossAccountLeverage,
			value: renderMetricValue(crossLeverageLabel),
		},
	];

	const showsEmailDeposit = !isConnected && depositAvailability.path === "sponsored";

	return (
		<div className="flex h-full min-h-[459px] min-w-0 flex-col bg-surface">
			<h2 className="sr-only">{t`Account`}</h2>

			{!isConnected ? (
				<DisconnectedAccountOverview
					depositEnabled={showsEmailDeposit && depositAvailability.available}
					depositDisabledReason={showsEmailDeposit ? depositAvailability.unavailableReason : undefined}
					onDeposit={showsEmailDeposit && depositAvailability.available ? () => openDepositModal("deposit") : undefined}
				/>
			) : (
				<div className="flex flex-1 flex-col">
					<div data-grid-content-part className="shrink-0 px-2 pt-3 pb-3">
						{depositGeoBlocked ? (
							<p className="text-center text-xs text-fg-muted">{depositAvailability.unavailableReason}</p>
						) : !showsFundsActions ? (
							<p className="text-center text-xs text-fg-muted">{t`Deposits and withdrawals are not allowed.`}</p>
						) : (
							<div data-slot="account-panel-actions" className="space-y-2">
								{depositAvailability.unavailableReason ? (
									<output className="block text-center text-xs text-fg-muted">
										{depositAvailability.unavailableReason}
									</output>
								) : null}
								<div className="grid grid-cols-2 gap-2">
									<Tooltip content={depositAvailability.unavailableReason} side="top">
										<span className="inline-flex min-w-0 w-full">
											<Button
												variant="filled"
												intent="neutral"
												disabled={!depositAvailability.available}
												onClick={depositAvailability.available ? () => openDepositModal("deposit") : undefined}
												aria-label={depositAvailability.available ? t`Deposit` : depositAvailability.unavailableLabel}
												title={depositAvailability.unavailableReason ?? undefined}
												className="min-h-8 w-full min-w-0 rounded-8 bg-trading-panel-control font-bold text-trading-panel-on-control shadow-none hover:bg-trading-panel-control/90"
											>
												{depositAvailability.available ? t`Deposit` : depositAvailability.unavailableLabel}
											</Button>
										</span>
									</Tooltip>
									<Tooltip content={withdrawDisabledReason} side="top">
										<span className="inline-flex min-w-0 w-full">
											<Button
												variant="outline"
												intent="neutral"
												disabled={!fundsActionAvailability.withdrawal.available}
												focusableWhenDisabled
												onClick={
													fundsActionAvailability.withdrawal.available ? () => openDepositModal("withdraw") : undefined
												}
												aria-label={t`Withdraw`}
												aria-describedby={withdrawDisabledReason ? withdrawUnavailableId : undefined}
												className="min-h-8 w-full min-w-0 rounded-8 border-trading-panel-stroke-input font-semibold text-trading-panel-fg shadow-none hover:border-trading-panel-stroke-control"
											>
												{t`Withdraw`}
											</Button>
										</span>
									</Tooltip>
								</div>
								<Tooltip content={internalTransferDisabledReason} side="top">
									<span className="inline-flex min-w-0 w-full">
										<Button
											variant="outline"
											intent="neutral"
											onClick={
												fundsActionAvailability.internalTransfer.available
													? () => openTransferModal("toPerp")
													: undefined
											}
											aria-describedby={transferDescriptionIds}
											iconLeft={<ArrowsLeftRightIcon className="size-4" />}
											disabled={!fundsActionAvailability.internalTransfer.available}
											focusableWhenDisabled
											className="min-h-8 w-full min-w-0 rounded-8 border-trading-panel-stroke-row font-semibold text-trading-panel-subtle shadow-none hover:border-trading-panel-stroke-control"
										>
											{overviewLabels.perpsSpot}
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
										className="min-h-8 w-full min-w-0 rounded-8 border-trading-panel-stroke-input font-semibold text-trading-panel-fg shadow-none hover:border-trading-panel-stroke-control"
									>
										{t`Bridge`}
									</Button>
								) : null}
							</div>
						)}
					</div>
					<div
						data-grid-content-part
						className="shrink-0 flow-root border-t border-trading-panel-stroke-row px-2 pt-3 pb-3"
					>
						{metricsHaveError ? (
							<div
								role="alert"
								className="mb-2 flex items-center gap-2 rounded-8 border border-stroke-error-weak bg-error-soft px-2.5 py-2 text-xs text-error"
							>
								<WarningCircleIcon className="size-4 shrink-0" />
								<span>{t`Failed to load balances.`}</span>
							</div>
						) : null}
						{metricsAreStale && !metricsHaveError ? (
							<output className="mb-2 flex items-center gap-2 rounded-8 border border-stroke-warning-weak bg-warning-soft px-2.5 py-2 text-xs text-warning">
								<WarningCircleIcon className="size-4 shrink-0" />
								<span>
									{fundsActionsReady
										? t`Balance data is stale.`
										: t`Balance data is stale. Actions are temporarily unavailable.`}
								</span>
							</output>
						) : null}
						{valuationUnavailable && !metricsHaveError && !metricsAreStale ? (
							<output className="mb-2 flex items-center gap-2 rounded-8 border border-stroke-warning-weak bg-warning-soft px-2.5 py-2 text-xs text-warning">
								<WarningCircleIcon className="size-4 shrink-0" />
								<span>{t`Balance data is unavailable. Try again after the connection recovers.`}</span>
							</output>
						) : null}
						{metricLoading ? <output className="sr-only">{overviewLabels.loading}</output> : null}
						{showsSecondaryFundsActions ? (
							<span id={transferDescriptionId} className="sr-only">
								{overviewLabels.transferBetweenPerpsAndSpot}
							</span>
						) : null}
						{showsSecondaryFundsActions && internalTransferDisabledReason ? (
							<span id={transferUnavailableId} className="sr-only">
								{internalTransferDisabledReason}
							</span>
						) : null}
						{showsSecondaryFundsActions && withdrawDisabledReason ? (
							<span id={withdrawUnavailableId} className="sr-only">
								{withdrawDisabledReason}
							</span>
						) : null}

						<section aria-labelledby={overviewTitleId}>
							<h3
								id={overviewTitleId}
								className="mb-1 truncate text-2sm font-bold text-trading-panel-fg"
								title={overviewLabels.accountMode}
							>
								{overviewLabels.accountMode} · {overviewLabels.overview}
							</h3>
							<InfoRowGroup className="divide-y-0 tracking-normal">
								{summaryRows.map((row) => (
									<InfoRow
										key={row.key}
										label={row.label}
										value={row.value}
										labelClassName="min-w-0 truncate text-trading-panel-muted"
										valueClassName={cn(
											"shrink-0 whitespace-nowrap font-semibold text-trading-panel-fg tabular-nums",
											row.valueClassName,
										)}
									/>
								))}
							</InfoRowGroup>
						</section>
					</div>
				</div>
			)}
		</div>
	);
}
