import { useLingui } from "@lingui/react/macro";
import { ArrowsLeftRightIcon } from "@phosphor-icons/react";
import { Button, Tooltip } from "@sairn/ui";
import { useId } from "react";
import { depositModalIntentProps } from "@/components/trade/components/lazy-global-modals";
import { LIFI_BRIDGE_FEATURES, shouldShowLiFiBridgeTab } from "@/config/lifi-bridge";
import { getFundsAvailabilityNotice } from "@/domain/trade/data-presentation";
import { useAccountOverview } from "@/hooks/trade/use-account-overview";
import { useAccountOverviewLabels } from "@/hooks/trade/use-account-overview-labels";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { useFundsActionAvailability } from "@/hooks/trade/use-funds-action-availability";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { useNumberFormat } from "@/lib/format";
import { useHasExistingBridgeExecution } from "@/lib/lifi/bridge-execution-state";
import { useDepositModalActions, useTransferModalActions } from "@/stores/use-global-modal-store";

interface MobileAccountViewProps {
	className?: string;
}

export function MobileAccountView({ className }: MobileAccountViewProps) {
	const { formatNumber, formatPercent, formatUSD } = useNumberFormat();
	const { t } = useLingui();
	const overviewTitleId = useId();
	const depositUnavailableId = useId();
	const transferDescriptionId = useId();
	const transferUnavailableId = useId();
	const withdrawUnavailableId = useId();
	const { hasWalletAccess, isConnected, walletAddress } = useWalletSession();
	const depositAvailability = useDepositAvailability();
	const depositNotice = getFundsAvailabilityNotice(depositAvailability);
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
		snapshotReady: accountSummaryReady,
		status: accountOverviewStatus,
		unrealizedPnlTone,
		usesSharedQuoteBalance,
	} = useAccountOverview();
	const overviewLabels = useAccountOverviewLabels({ accountMode, usesSharedQuoteBalance });
	const metricLoading = accountOverviewStatus === "loading";

	const { open: openDepositModal } = useDepositModalActions();
	const { open: openTransferModal } = useTransferModalActions();
	const fundsActionAvailability = useFundsActionAvailability({
		accountDataReady: fundsActionsReady,
		accountAbstraction,
		fundsActionsEnabled: true,
		hasWalletAccess,
		internalTransfersEnabled: !usesSharedQuoteBalance,
	});
	const hasExistingBridgeExecution = useHasExistingBridgeExecution(walletAddress);
	const showBridgeEntry = shouldShowLiFiBridgeTab({
		isEmbeddedDeposit: false,
		hasExistingExecution: hasExistingBridgeExecution,
		createNewRoute: LIFI_BRIDGE_FEATURES.createNewRoute,
	});
	const internalTransferDisabledReason = getFundsAvailabilityNotice(fundsActionAvailability.internalTransfer);
	const withdrawDisabledReason = getFundsAvailabilityNotice(fundsActionAvailability.withdrawal);
	const transferDescriptionIds = internalTransferDisabledReason
		? `${transferDescriptionId} ${transferUnavailableId}`
		: transferDescriptionId;
	const depositGeoBlocked =
		depositAvailability.reason === "geo-restricted" || depositAvailability.reason === "geo-unresolved";
	const showsSecondaryFundsActions = isConnected && !depositGeoBlocked;

	const showsEmailDeposit = !isConnected && depositAvailability.path === "sponsored";
	const disconnectedDepositNotice = showsEmailDeposit
		? (depositNotice ?? (depositAvailability.available ? t`Open Deposit to prepare your email wallet.` : null))
		: null;

	const marginRatioLabel = formatPercent(marginRatioReady ? maintenanceMarginRatio : "0", {
		maximumFractionDigits: 2,
		signDisplay: "never",
	});
	const crossLeverageLabel = `${formatNumber(crossLeverage ?? "0", 2)}x`;

	return (
		<div className={cn("h-full min-h-0 overflow-y-auto overscroll-y-contain bg-grid-container", className)}>
			<div className="flex min-h-full flex-col gap-3 p-3">
				{showsSecondaryFundsActions ? (
					<span id={transferDescriptionId} className="sr-only">
						{overviewLabels.transferBetweenPerpsAndSpot}
					</span>
				) : null}
				{showsSecondaryFundsActions && !usesSharedQuoteBalance && internalTransferDisabledReason ? (
					<span id={transferUnavailableId} className="sr-only">
						{internalTransferDisabledReason}
					</span>
				) : null}
				{showsSecondaryFundsActions && withdrawDisabledReason ? (
					<span id={withdrawUnavailableId} className="sr-only">
						{withdrawDisabledReason}
					</span>
				) : null}
				{showsSecondaryFundsActions && depositNotice ? (
					<span id={depositUnavailableId} className="sr-only">
						{depositNotice}
					</span>
				) : null}

				<section className="rounded-12 bg-surface p-4" aria-labelledby={overviewTitleId} aria-busy={metricLoading}>
					<div className="mb-4 min-w-0">
						<h2 id={overviewTitleId} className="text-base font-semibold text-fg">
							{overviewLabels.summary}
						</h2>
						<p className="mt-1 text-xs text-fg-muted">{overviewLabels.summaryDescription}</p>
					</div>

					<div className="space-y-2 pb-4">
						<MetricRow label={overviewLabels.accountMarginRatio} value={marginRatioLabel} emphasized />
						<div
							role="progressbar"
							aria-label={overviewLabels.accountMarginRatio}
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={accountRisk.progressPercent === null ? undefined : Number(accountRisk.progressPercent)}
							aria-valuetext={marginRatioLabel}
							className="h-1.5 overflow-hidden rounded-full bg-fill-weak"
						>
							{marginRatioReady ? (
								<div
									className={cn(
										"h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none",
										accountRisk.tone === "danger"
											? "bg-error"
											: accountRisk.tone === "warning"
												? "bg-warning"
												: "bg-success",
									)}
									style={{ width: `${accountRisk.progressPercent ?? 0}%` }}
								/>
							) : null}
						</div>
					</div>

					<div className="divide-y divide-stroke-weak/60 border-t border-stroke-weak/60">
						<MetricRow
							label={overviewLabels.accountValue}
							value={
								accountSummaryReady && accountEquityValue !== null
									? formatUSD(accountEquityValue, { compact: false })
									: formatUSD("0", { compact: false })
							}
						/>
						<MetricRow
							label={overviewLabels.unrealizedPnl}
							value={
								accountSummaryReady && riskSummary
									? formatUSD(riskSummary.unrealizedPnl, { compact: false, signDisplay: "exceptZero" })
									: formatUSD("0", { compact: false })
							}
							valueClassName={
								unrealizedPnlTone === "positive"
									? "text-success"
									: unrealizedPnlTone === "negative"
										? "text-error"
										: undefined
							}
						/>
						<MetricRow
							label={overviewLabels.maintenanceMargin}
							value={
								accountSummaryReady && riskSummary
									? formatUSD(riskSummary.crossMaintenanceMarginUsed, { compact: false })
									: formatUSD("0", { compact: false })
							}
						/>
						<MetricRow label={overviewLabels.accountLeverage} value={crossLeverageLabel} />
					</div>
				</section>

				<div data-slot="mobile-account-actions" className="mt-auto pt-3">
					{!isConnected ? (
						<div className="space-y-2">
							{disconnectedDepositNotice ? (
								<output className="block text-center text-xs text-fg-muted">{disconnectedDepositNotice}</output>
							) : null}
							<div className="grid grid-cols-2 gap-2">
								<Button
									variant="filled"
									intent="brand"
									size="md"
									disabled={!showsEmailDeposit || !depositAvailability.available}
									onClick={
										showsEmailDeposit && depositAvailability.available ? () => openDepositModal("deposit") : undefined
									}
									{...(showsEmailDeposit && depositAvailability.available ? depositModalIntentProps : undefined)}
									aria-label={t`Deposit`}
									title={disconnectedDepositNotice ?? undefined}
									className="min-h-11 w-full"
								>
									{t`Deposit`}
								</Button>
								<Button
									variant="outline"
									intent="neutral"
									size="md"
									disabled
									aria-label={t`Withdraw`}
									className="min-h-11 w-full"
								>
									{t`Withdraw`}
								</Button>
							</div>
						</div>
					) : null}
					{isConnected && depositGeoBlocked && depositNotice ? (
						<p className="text-center text-sm text-fg-muted">{depositNotice}</p>
					) : null}
					{showsSecondaryFundsActions ? (
						<div className="space-y-2">
							{depositNotice ? <output className="text-center text-xs text-fg-muted">{depositNotice}</output> : null}
							<div className="grid grid-cols-2 gap-2">
								<Tooltip content={depositNotice} side="top">
									<span className="inline-flex w-full">
										<Button
											variant="filled"
											intent="brand"
											size="md"
											disabled={!depositAvailability.available}
											focusableWhenDisabled
											aria-describedby={depositNotice ? depositUnavailableId : undefined}
											onClick={depositAvailability.available ? () => openDepositModal("deposit") : undefined}
											{...(depositAvailability.available ? depositModalIntentProps : undefined)}
											aria-label={t`Deposit`}
											className="min-h-11 w-full"
										>
											{t`Deposit`}
										</Button>
									</span>
								</Tooltip>
								<Tooltip content={withdrawDisabledReason} side="top">
									<span className="inline-flex w-full">
										<Button
											variant="outline"
											intent="neutral"
											size="md"
											disabled={!fundsActionAvailability.withdrawal.available}
											focusableWhenDisabled
											aria-describedby={withdrawDisabledReason ? withdrawUnavailableId : undefined}
											onClick={
												fundsActionAvailability.withdrawal.available ? () => openDepositModal("withdraw") : undefined
											}
											{...(fundsActionAvailability.withdrawal.available ? depositModalIntentProps : undefined)}
											aria-label={t`Withdraw`}
											className="min-h-11 w-full"
										>
											{t`Withdraw`}
										</Button>
									</span>
								</Tooltip>
							</div>
							{!usesSharedQuoteBalance ? (
								<Tooltip content={internalTransferDisabledReason} side="top">
									<span className="inline-flex w-full">
										<Button
											variant="outline"
											intent="neutral"
											size="md"
											onClick={
												fundsActionAvailability.internalTransfer.available
													? () => openTransferModal("toPerp")
													: undefined
											}
											iconLeft={<ArrowsLeftRightIcon className="size-4" />}
											disabled={!fundsActionAvailability.internalTransfer.available}
											focusableWhenDisabled
											aria-describedby={transferDescriptionIds}
											className="min-h-11 w-full"
										>
											{overviewLabels.perpsSpot}
										</Button>
									</span>
								</Tooltip>
							) : null}

							{hasWalletAccess && showBridgeEntry ? (
								<Button
									variant="outline"
									intent="neutral"
									size="md"
									onClick={() => openDepositModal("bridge")}
									{...depositModalIntentProps}
									aria-label={t`Bridge`}
									iconLeft={<ArrowsLeftRightIcon className="size-4" />}
									className="min-h-11 w-full"
								>
									{t`Bridge`}
								</Button>
							) : null}
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}

interface MetricRowProps {
	emphasized?: boolean;
	label: string;
	value: string;
	valueClassName?: string;
}

function MetricRow({ emphasized = false, label, value, valueClassName }: MetricRowProps) {
	return (
		<div className="flex min-h-11 items-center justify-between gap-4 py-2.5 text-sm">
			<span className="text-fg-muted">{label}</span>
			<span className={cn("font-medium tabular-nums text-fg", emphasized && "font-semibold", valueClassName)}>
				{value}
			</span>
		</div>
	);
}
