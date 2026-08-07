import { Badge, Button, Tooltip } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import {
	ArrowsLeftRightIcon,
	DownloadSimpleIcon,
	SpinnerGapIcon,
	UploadSimpleIcon,
	WalletIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { Skeleton } from "boneyard-js/react";
import { Suspense, useId, useState } from "react";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { LIFI_BRIDGE_FEATURES, shouldShowLiFiBridgeTab } from "@/config/lifi-bridge";
import {
	getAccountBalanceSummary,
	getAccountEquityValue,
	getPerpRiskSummaryValue,
	getUnifiedAccountMarginRatioValue,
	isQuoteBalanceSharedWithPerps,
} from "@/domain/trade/balances";
import {
	getToolbarAccountLeverage,
	getToolbarAccountMarginRatio,
	getToolbarAccountRiskPresentation,
	getToolbarSignedValueTone,
} from "@/domain/trade/trading-toolbar-metrics";
import { useDefaultDexBalances, useSelectedDexBalances } from "@/hooks/trade/use-account-balances";
import { useSpotTokenUsdPrices } from "@/hooks/trade/use-spot-token-usd-prices";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatNumber, formatPercent, formatUSD } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import { useHasExistingBridgeExecution } from "@/lib/lifi/bridge-execution-state";
import { useDepositModalActions, useTransferModalActions } from "@/stores/use-global-modal-store";

const WalletModal = createLazyComponent(() => import("../components/wallet-modal"), "WalletModal");

interface MobileAccountViewProps {
	className?: string;
}

export function MobileAccountView({ className }: MobileAccountViewProps) {
	const { t } = useLingui();
	const overviewTitleId = useId();
	const { isConnected, sessionMode, walletAddress } = useWalletSession();
	const markets = useMarkets();
	const selectedBalances = useSelectedDexBalances();
	const defaultBalances = useDefaultDexBalances();
	const accountAbstraction = selectedBalances.accountAbstraction;
	const usesSharedQuoteBalance = isQuoteBalanceSharedWithPerps(accountAbstraction);
	const summaryBalances = usesSharedQuoteBalance ? defaultBalances : selectedBalances;
	const {
		marginSummary,
		perpSummary,
		spotBalances,
		spotAvailableAfterMaintenance,
		withdrawable,
		isSpotStateStale,
		isLoading,
		hasError,
	} = summaryBalances;
	const tokenUsdPrices = useSpotTokenUsdPrices(isConnected);
	const accountSummary = getAccountBalanceSummary({
		accountAbstraction,
		marginSummary,
		perpSummary,
		withdrawable,
		spotBalances,
		spotAvailableAfterMaintenance,
		tokenUsdPrices,
	});
	const accountEquityValue = getAccountEquityValue({
		accountAbstraction,
		marginSummary,
		perpSummary,
		spotBalances,
		tokenUsdPrices,
	});
	const riskSummary = getPerpRiskSummaryValue(
		usesSharedQuoteBalance
			? selectedBalances.allDexClearinghouseStates.map(([, state]) => state)
			: [
					{
						marginSummary: summaryBalances.marginSummary,
						crossMaintenanceMarginUsed: summaryBalances.crossMaintenanceMarginUsed,
						assetPositions: summaryBalances.perpPositions,
					},
				],
	);
	const defaultCollateralToken = markets.getToken(DEFAULT_QUOTE_TOKEN);
	const maintenanceMarginRatio =
		accountAbstraction === "unifiedAccount"
			? getUnifiedAccountMarginRatioValue({
					states: selectedBalances.allDexClearinghouseStates.map(([dex, state]) => ({ dex, ...state })),
					collaterals: [
						...(defaultCollateralToken ? [{ dex: "", token: defaultCollateralToken.index }] : []),
						...markets.builderPerp.flatMap((market) =>
							market.quoteToken ? [{ dex: market.dex, token: market.quoteToken.index }] : [],
						),
					],
					spotBalances: summaryBalances.spotBalances,
				})
			: accountAbstraction === "portfolioMargin"
				? null
				: getToolbarAccountMarginRatio({
						crossMaintenanceMarginUsed: riskSummary.crossMaintenanceMarginUsed,
						accountEquity: accountEquityValue,
					});
	const accountSummaryReady =
		isConnected &&
		accountAbstraction !== null &&
		!summaryBalances.hasError &&
		summaryBalances.hasAllDexsSnapshot &&
		(!usesSharedQuoteBalance || summaryBalances.hasSpotStateSnapshot);
	const accountRisk = getToolbarAccountRiskPresentation(accountSummaryReady ? maintenanceMarginRatio : null);
	const crossLeverage = accountSummaryReady
		? getToolbarAccountLeverage({
				totalNtlPos: riskSummary.totalNtlPos,
				accountEquity: accountEquityValue,
			})
		: null;
	const unrealizedPnlTone = getToolbarSignedValueTone(riskSummary.unrealizedPnl);
	const metricLoading = isLoading || accountAbstraction === null;

	const [walletModalOpen, setWalletModalOpen] = useState(false);
	const { open: openDepositModal } = useDepositModalActions();
	const { open: openTransferModal } = useTransferModalActions();
	const { tradeRestricted } = useGeoRestriction();
	const hasWalletAccess = sessionMode === "wallet";
	const hasExistingBridgeExecution = useHasExistingBridgeExecution(walletAddress);
	const showBridgeEntry = shouldShowLiFiBridgeTab({
		isEmbeddedDeposit: false,
		hasExistingExecution: hasExistingBridgeExecution,
		createNewRoute: LIFI_BRIDGE_FEATURES.createNewRoute,
	});
	const accountModeLabel =
		accountSummary.mode === "unified"
			? t`Unified Account`
			: accountSummary.mode === "portfolioMargin"
				? t`Portfolio Margin`
				: t`Separate Accounts`;
	const showSpotFundsNotice =
		!accountSummary.usesSpotStateForPerps &&
		selectedBalances.dex === "" &&
		accountSummary.hasSpotFundsWhenPerpWithdrawableZero;
	const internalTransferDisabledReason = usesSharedQuoteBalance
		? t`Transfers between Spot and Perps are unavailable in unified account mode.`
		: null;

	if (!isConnected) {
		return (
			<div className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
				<div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
					<div className="flex size-20 items-center justify-center rounded-full bg-surface">
						<WalletIcon className="size-10 text-fg-muted" />
					</div>
					<div className="max-w-xs space-y-2 text-center">
						<h2 className="text-lg font-semibold">{t`Connect Wallet`}</h2>
						<p className="text-sm text-fg-muted">
							{t`Connect your wallet to view your account, positions, and start trading.`}
						</p>
					</div>
					<Button variant="outline" intent="brand" size="md" onClick={() => setWalletModalOpen(true)}>
						{t`Connect Wallet`}
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

	const marginRatioLabel =
		accountSummaryReady && maintenanceMarginRatio !== null ? formatPercent(maintenanceMarginRatio) : "—";
	const crossLeverageLabel = crossLeverage === null ? "—" : `${formatNumber(crossLeverage, 2)}x`;

	return (
		<div className={cn("h-full min-h-0 overflow-y-auto overscroll-y-contain bg-grid-container", className)}>
			<div className="flex min-h-full flex-col gap-3 p-3">
				{hasError ? (
					<div
						role="alert"
						className="flex items-center gap-2 rounded-8 border border-stroke-error-weak bg-error-soft px-3 py-2 text-xs text-error"
					>
						<WarningCircleIcon className="size-4 shrink-0" />
						<span>{t`Failed to load balances.`}</span>
					</div>
				) : null}

				<section className="rounded-12 bg-surface p-4" aria-labelledby={overviewTitleId}>
					<div className="mb-4 flex items-start justify-between gap-3">
						<div className="min-w-0">
							<h2 id={overviewTitleId} className="text-base font-semibold text-fg">
								{accountModeLabel} · {t`Overview`}
							</h2>
							<p className="mt-1 text-xs text-fg-muted">{t`Margin and account risk at a glance`}</p>
						</div>
						<div className="flex shrink-0 items-center gap-1.5">
							<Badge tone="neutral" size="sm">
								{accountModeLabel}
							</Badge>
							{isSpotStateStale && !hasError ? (
								<SpinnerGapIcon className="size-3.5 animate-spin text-warning" aria-label={t`Loading...`} />
							) : null}
						</div>
					</div>

					<div className="space-y-2 pb-4">
						<MetricRow label={t`Account Margin Ratio`} value={marginRatioLabel} loading={metricLoading} emphasized />
						<div
							role="progressbar"
							aria-label={t`Account Margin Ratio`}
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={accountRisk.progressPercent === null ? undefined : Number(accountRisk.progressPercent)}
							aria-valuetext={marginRatioLabel}
							className="h-1.5 overflow-hidden rounded-full bg-fill-weak"
						>
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
						</div>
					</div>

					<div className="divide-y divide-stroke-weak/60 border-t border-stroke-weak/60">
						<MetricRow
							label={t`Portfolio Value`}
							value={accountSummaryReady ? formatUSD(accountEquityValue, { compact: false }) : "—"}
							loading={metricLoading}
						/>
						<MetricRow
							label={t`Unrealized PNL`}
							value={accountSummaryReady ? formatUSD(riskSummary.unrealizedPnl, { compact: false }) : "—"}
							valueClassName={
								unrealizedPnlTone === "positive"
									? "text-success"
									: unrealizedPnlTone === "negative"
										? "text-error"
										: undefined
							}
							loading={metricLoading}
						/>
						<MetricRow
							label={t`Maintenance Margin`}
							value={accountSummaryReady ? formatUSD(riskSummary.crossMaintenanceMarginUsed, { compact: false }) : "—"}
							loading={metricLoading}
						/>
						<MetricRow label={t`Cross Account Leverage`} value={crossLeverageLabel} loading={metricLoading} />
					</div>
				</section>

				{showSpotFundsNotice ? (
					<div className="rounded-8 border border-stroke-warning-weak bg-warning-soft p-3 text-sm text-warning">
						<div className="tabular-nums">
							{t`Available funds are in Spot`}: {formatUSD(accountSummary.spotUsdcAvailable, { compact: false })}
						</div>
						{hasWalletAccess ? (
							<Button
								variant="link"
								intent="brand"
								size="xs"
								className="mt-1 h-auto p-0"
								onClick={() => openTransferModal("toPerp")}
							>
								{t`Perps / Spot`}
							</Button>
						) : null}
					</div>
				) : null}

				<div data-slot="mobile-account-actions" className="mt-auto pt-3">
					{tradeRestricted || !hasWalletAccess ? (
						<p className="text-center text-sm text-fg-muted">{t`Deposits and withdrawals are not allowed.`}</p>
					) : (
						<div className="space-y-2">
							<Button
								variant="filled"
								intent="brand"
								size="md"
								onClick={() => openDepositModal("deposit")}
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
											onClick={() => openTransferModal("toPerp")}
											iconLeft={<ArrowsLeftRightIcon className="size-4" />}
											disabled={!!internalTransferDisabledReason}
											className="min-h-11 w-full"
										>
											{t`Perps / Spot`}
										</Button>
									</span>
								</Tooltip>
								<Button
									variant="outline"
									intent="neutral"
									size="md"
									onClick={() => openDepositModal("withdraw")}
									iconLeft={<UploadSimpleIcon className="size-4" />}
									className="min-h-11"
								>
									{t`Withdraw`}
								</Button>
							</div>
							{showBridgeEntry ? (
								<Button
									variant="outline"
									intent="neutral"
									size="md"
									onClick={() => openDepositModal("bridge")}
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
	loading: boolean;
	value: string;
	valueClassName?: string;
}

function MetricRow({ emphasized = false, label, loading, value, valueClassName }: MetricRowProps) {
	return (
		<div className="flex min-h-11 items-center justify-between gap-4 py-2.5 text-sm">
			<span className="text-fg-muted">{label}</span>
			<Skeleton name="mobile-account-overview-metric" loading={loading}>
				<span className={cn("font-medium tabular-nums text-fg", emphasized && "font-semibold", valueClassName)}>
					{value}
				</span>
			</Skeleton>
		</div>
	);
}
