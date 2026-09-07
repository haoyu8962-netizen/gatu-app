import { Badge, Button, Tooltip } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { ArrowsLeftRightIcon, DownloadSimpleIcon, UploadSimpleIcon, WalletIcon } from "@phosphor-icons/react";
import { Suspense, useId, useState } from "react";
import { LIFI_BRIDGE_FEATURES, shouldShowLiFiBridgeTab } from "@/config/lifi-bridge";
import { getFundsAvailabilityNotice } from "@/domain/trade/data-presentation";
import { useAccountOverview } from "@/hooks/trade/use-account-overview";
import { useAccountOverviewLabels } from "@/hooks/trade/use-account-overview-labels";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { useFundsActionAvailability } from "@/hooks/trade/use-funds-action-availability";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatNumber, formatPercent, formatUSD } from "@/lib/format";
import { createLazyComponent } from "@/lib/lazy";
import { useHasExistingBridgeExecution } from "@/lib/lifi/bridge-execution-state";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { useDepositModalActions, useTransferModalActions } from "@/stores/use-global-modal-store";

const WalletModal = createLazyComponent(() => import("../components/wallet-modal"), "WalletModal");

interface MobileAccountViewProps {
	className?: string;
}

export function MobileAccountView({ className }: MobileAccountViewProps) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const overviewTitleId = useId();
	const transferDescriptionId = useId();
	const transferUnavailableId = useId();
	const withdrawUnavailableId = useId();
	const { hasWalletAccess, isConnected, walletAddress } = useWalletSession();
	const depositAvailability = useDepositAvailability();
	const depositNotice = getFundsAvailabilityNotice(depositAvailability);
	const {
		accountEquityValue,
		accountMode,
		accountModeReady,
		accountRisk,
		crossLeverage,
		fundsActionsReady,
		maintenanceMarginRatio,
		marginRatioReady,
		riskSummary,
		showSpotFundsNotice,
		snapshotReady: accountSummaryReady,
		spotFundsAvailable,
		status: accountOverviewStatus,
		unrealizedPnlTone,
		usesSharedQuoteBalance,
	} = useAccountOverview();
	const overviewLabels = useAccountOverviewLabels({ accountMode, usesSharedQuoteBalance });
	const metricLoading = accountOverviewStatus === "loading";

	const [walletModalOpen, setWalletModalOpen] = useState(false);
	const { open: openDepositModal } = useDepositModalActions();
	const { open: openTransferModal } = useTransferModalActions();
	const fundsActionAvailability = useFundsActionAvailability({
		accountDataReady: fundsActionsReady,
		accountModeReady,
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
	const showsFundsActions = hasWalletAccess || depositAvailability.path === "sponsored";
	const showsSecondaryFundsActions = !depositGeoBlocked && showsFundsActions;
	const showsTransferEntry = (showSpotFundsNotice && hasWalletAccess) || showsSecondaryFundsActions;

	if (!isConnected) {
		const showsEmailDeposit = depositAvailability.path === "sponsored";
		return (
			<div className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
				<div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
					<div className="flex size-20 items-center justify-center rounded-full bg-surface">
						<WalletIcon className="size-10 text-fg-muted" />
					</div>
					<div className="max-w-xs space-y-2 text-center">
						<h2 className="text-lg font-semibold">{showsEmailDeposit ? t`Deposit USDC` : t`Connect Wallet`}</h2>
						<p className="text-sm text-fg-muted">
							{showsEmailDeposit
								? (depositNotice ?? t`Open Deposit to prepare your email wallet.`)
								: t`Connect your wallet to view your account, positions, and start trading.`}
						</p>
					</div>
					<Button
						variant="outline"
						intent="brand"
						size="md"
						disabled={showsEmailDeposit && !depositAvailability.available}
						onClick={
							showsEmailDeposit
								? depositAvailability.available
									? () => openDepositModal("deposit")
									: undefined
								: () => setWalletModalOpen(true)
						}
						title={showsEmailDeposit ? (depositNotice ?? undefined) : undefined}
					>
						{showsEmailDeposit ? t`Deposit` : t`Connect Wallet`}
					</Button>
				</div>
				{walletModalOpen ? (
					<Suspense fallback={null}>
						<WalletModal open onOpenChange={setWalletModalOpen} />
					</Suspense>
				) : null}
			</div>
		);
	}

	const marginRatioLabel = formatPercent(marginRatioReady ? maintenanceMarginRatio : "0", {
		maximumFractionDigits: 2,
		signDisplay: "never",
	});
	const crossLeverageLabel = `${formatNumber(crossLeverage ?? "0", 2)}x`;

	return (
		<div className={cn("h-full min-h-0 overflow-y-auto overscroll-y-contain bg-grid-container", className)}>
			<div className="flex min-h-full flex-col gap-3 p-3">
				{showsTransferEntry ? (
					<span id={transferDescriptionId} className="sr-only">
						{overviewLabels.transferBetweenPerpsAndSpot}
					</span>
				) : null}
				{showsTransferEntry && internalTransferDisabledReason ? (
					<span id={transferUnavailableId} className="sr-only">
						{internalTransferDisabledReason}
					</span>
				) : null}
				{showsSecondaryFundsActions && withdrawDisabledReason ? (
					<span id={withdrawUnavailableId} className="sr-only">
						{withdrawDisabledReason}
					</span>
				) : null}

				<section className="rounded-12 bg-surface p-4" aria-labelledby={overviewTitleId} aria-busy={metricLoading}>
					<div className="mb-4 flex items-start justify-between gap-3">
						<div className="min-w-0">
							<h2 id={overviewTitleId} className="text-base font-semibold text-fg">
								{overviewLabels.accountMode} · {overviewLabels.overview}
							</h2>
							<p className="mt-1 text-xs text-fg-muted">{overviewLabels.summaryDescription}</p>
						</div>
						<div className="shrink-0">
							<Badge tone="neutral" size="sm">
								{overviewLabels.accountMode}
							</Badge>
						</div>
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
							label={overviewLabels.crossMaintenanceMargin}
							value={
								accountSummaryReady && riskSummary
									? formatUSD(riskSummary.crossMaintenanceMarginUsed, { compact: false })
									: formatUSD("0", { compact: false })
							}
						/>
						<MetricRow label={overviewLabels.crossAccountLeverage} value={crossLeverageLabel} />
					</div>
				</section>

				{showSpotFundsNotice ? (
					<div
						data-slot="account-spot-funds-notice"
						className="rounded-8 border border-stroke-warning-weak bg-warning-soft p-3 text-sm text-warning"
					>
						<div className="tabular-nums">
							{overviewLabels.availableFundsInSpot}:{" "}
							{spotFundsAvailable === null ? "—" : formatUSD(spotFundsAvailable, { compact: false })}
						</div>
						{hasWalletAccess ? (
							<Button
								variant="link"
								intent="brand"
								size="xs"
								className="mt-1 h-auto p-0"
								disabled={!fundsActionAvailability.internalTransfer.available}
								focusableWhenDisabled
								aria-describedby={transferDescriptionIds}
								title={internalTransferDisabledReason ?? undefined}
								onClick={
									fundsActionAvailability.internalTransfer.available ? () => openTransferModal("toPerp") : undefined
								}
							>
								{overviewLabels.perpsSpot}
							</Button>
						) : null}
					</div>
				) : null}

				<div data-slot="mobile-account-actions" className="mt-auto pt-3">
					{depositGeoBlocked ? (
						depositNotice ? (
							<p className="text-center text-sm text-fg-muted">{depositNotice}</p>
						) : null
					) : !showsFundsActions ? null : (
						<div className="space-y-2">
							{depositNotice ? <output className="text-center text-xs text-fg-muted">{depositNotice}</output> : null}
							<Button
								variant="filled"
								intent="brand"
								size="md"
								disabled={!depositAvailability.available}
								onClick={depositAvailability.available ? () => openDepositModal("deposit") : undefined}
								aria-label={t`Deposit`}
								title={depositNotice ?? undefined}
								iconLeft={<DownloadSimpleIcon className="size-4" />}
								className="min-h-11 w-full"
							>
								{t`Deposit`}
							</Button>
							<div className="grid grid-cols-2 gap-2">
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
											aria-label={t`Withdraw`}
											iconLeft={<UploadSimpleIcon className="size-4" />}
											className="min-h-11 w-full"
										>
											{t`Withdraw`}
										</Button>
									</span>
								</Tooltip>
							</div>
							{hasWalletAccess && showBridgeEntry ? (
								<Button
									variant="outline"
									intent="neutral"
									size="md"
									onClick={() => openDepositModal("bridge")}
									aria-label={t`Bridge`}
									iconLeft={<ArrowsLeftRightIcon className="size-4" />}
									className="min-h-11 w-full"
								>
									{t`Bridge`}
								</Button>
							) : null}
						</div>
					)}
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
