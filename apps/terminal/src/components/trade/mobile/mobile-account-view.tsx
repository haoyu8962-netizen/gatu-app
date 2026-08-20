import { Badge, Button, Tooltip } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import {
	ArrowsLeftRightIcon,
	DownloadSimpleIcon,
	UploadSimpleIcon,
	WalletIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { Suspense, useId, useState } from "react";
import { Skeleton, SkeletonValue } from "@/components/ui/skeleton";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { LIFI_BRIDGE_FEATURES, shouldShowLiFiBridgeTab } from "@/config/lifi-bridge";
import {
	accountOverviewNeedsTokenUsdPrices,
	getAccountBalanceSummary,
	getPerpRiskSummaryUsdValue,
	getSpotAccountValueUsdValue,
	getTokenAmountUsdValue,
	getUnifiedAccountMarginRatioValue,
	isQuoteBalanceSharedWithPerps,
} from "@/domain/trade/balances";
import {
	getToolbarAccountLeverage,
	getToolbarAccountMarginRatio,
	getToolbarAccountRiskPresentation,
	getToolbarSignedValueTone,
} from "@/domain/trade/trading-toolbar-metrics";
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
import { formatNumber, formatPercent, formatUSD } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
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
	const transferUnavailableId = useId();
	const withdrawUnavailableId = useId();
	const { hasWalletAccess, isConnected, walletAddress } = useWalletSession();
	const depositAvailability = useDepositAvailability();
	const markets = useMarkets();
	const selectedBalances = useSelectedDexBalances();
	const defaultBalances = useDefaultDexBalances();
	const accountAbstraction = selectedBalances.accountAbstraction;
	const accountModeReady = isSupportedAccountAbstraction(accountAbstraction);
	const usesSharedQuoteBalance = isQuoteBalanceSharedWithPerps(accountAbstraction);
	const summaryBalances = usesSharedQuoteBalance ? defaultBalances : selectedBalances;
	const { marginSummary, perpSummary, spotBalances, spotAvailableAfterMaintenance, withdrawable } = summaryBalances;
	const tokenUsdPriceState = useSpotTokenUsdPriceState(isConnected);
	const tokenUsdPrices = tokenUsdPriceState.prices;
	const collateralTokenByDex = new Map<string, string>([
		["", DEFAULT_QUOTE_TOKEN],
		...markets.builderPerp.flatMap(
			(market): Array<[string, string]> => (market.quoteToken ? [[market.dex, market.quoteToken.name]] : []),
		),
	]);
	const selectedCollateralToken = collateralTokenByDex.get(summaryBalances.dex) ?? null;
	const accountSummary = getAccountBalanceSummary({
		accountAbstraction,
		marginSummary,
		perpSummary,
		withdrawable,
		spotBalances,
		spotAvailableAfterMaintenance,
		tokenUsdPrices,
	});
	const accountEquityValue = usesSharedQuoteBalance
		? getSpotAccountValueUsdValue(spotBalances, tokenUsdPrices)
		: getTokenAmountUsdValue(marginSummary?.accountValue, selectedCollateralToken, tokenUsdPrices);
	const crossAccountEquityValue = usesSharedQuoteBalance
		? accountEquityValue
		: getTokenAmountUsdValue(perpSummary?.accountValue, selectedCollateralToken, tokenUsdPrices);
	const perpRiskStates = usesSharedQuoteBalance
		? selectedBalances.allDexClearinghouseStates.map(([dex, state]) => ({
				collateralToken: collateralTokenByDex.get(dex) ?? null,
				marginSummary: state.crossMarginSummary,
				crossMaintenanceMarginUsed: state.crossMaintenanceMarginUsed,
				assetPositions: state.assetPositions,
			}))
		: [
				{
					collateralToken: selectedCollateralToken,
					marginSummary: summaryBalances.perpSummary,
					crossMaintenanceMarginUsed: summaryBalances.crossMaintenanceMarginUsed,
					assetPositions: summaryBalances.perpPositions,
				},
			];
	const riskSummary = getPerpRiskSummaryUsdValue(perpRiskStates, tokenUsdPrices);
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
				? summaryBalances.portfolioMarginRatio
				: getToolbarAccountMarginRatio({
						crossMaintenanceMarginUsed: summaryBalances.crossMaintenanceMarginUsed,
						accountEquity: summaryBalances.perpSummary?.accountValue ?? "0",
					});
	const requiresUsdPrices = accountOverviewNeedsTokenUsdPrices({
		accountValues: usesSharedQuoteBalance
			? []
			: [
					{ token: selectedCollateralToken, value: marginSummary?.accountValue },
					{ token: selectedCollateralToken, value: perpSummary?.accountValue },
				],
		spotBalances: usesSharedQuoteBalance ? spotBalances : [],
		perpRiskStates,
	});
	const accountSummaryReady =
		isConnected &&
		accountModeReady &&
		summaryBalances.perpStateStatus === "success" &&
		!summaryBalances.isPerpStateStale &&
		(!requiresUsdPrices || tokenUsdPriceState.status === "success") &&
		(!usesSharedQuoteBalance ||
			(!summaryBalances.hasError &&
				!summaryBalances.isDataStale &&
				summaryBalances.hasAllDexsSnapshot &&
				summaryBalances.spotStateStatus === "success" &&
				summaryBalances.hasSpotStateSnapshot));
	const fundsActionsReady =
		accountModeReady &&
		!defaultBalances.hasError &&
		!defaultBalances.isDataStale &&
		defaultBalances.perpStateStatus === "success" &&
		defaultBalances.spotStateStatus === "success";
	const marginRatioReady = accountSummaryReady && maintenanceMarginRatio !== null;
	const accountRisk = getToolbarAccountRiskPresentation(marginRatioReady ? maintenanceMarginRatio : null);
	const crossLeverage =
		accountSummaryReady && riskSummary && crossAccountEquityValue
			? getToolbarAccountLeverage({
					totalNtlPos: riskSummary.totalNtlPos,
					accountEquity: crossAccountEquityValue,
				})
			: null;
	const unrealizedPnlTone =
		accountSummaryReady && riskSummary ? getToolbarSignedValueTone(riskSummary.unrealizedPnl) : "neutral";
	const metricLoading =
		accountAbstraction === null ||
		summaryBalances.perpStateStatus === "loading" ||
		(usesSharedQuoteBalance && summaryBalances.spotStateStatus === "loading") ||
		(requiresUsdPrices && tokenUsdPriceState.status === "loading");
	const metricsHaveError =
		summaryBalances.perpStateStatus === "error" ||
		(usesSharedQuoteBalance && summaryBalances.spotStateStatus === "error") ||
		(requiresUsdPrices && tokenUsdPriceState.status === "error");
	const metricsAreStale =
		summaryBalances.isPerpStateStale ||
		(usesSharedQuoteBalance && summaryBalances.isSpotStateStale) ||
		(requiresUsdPrices && tokenUsdPriceState.status === "stale");
	const valuationUnavailable =
		accountSummaryReady && (accountEquityValue === null || riskSummary === null || maintenanceMarginRatio === null);

	const [walletModalOpen, setWalletModalOpen] = useState(false);
	const { open: openDepositModal } = useDepositModalActions();
	const { open: openTransferModal } = useTransferModalActions();
	const { actionsBlocked: tradeRestricted } = useGeoRestriction();
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
				: accountSummary.mode === "separate"
					? t`Separate Accounts`
					: t`Select mode`;
	const showSpotFundsNotice =
		accountSummaryReady &&
		summaryBalances.spotStateStatus === "success" &&
		!summaryBalances.isSpotStateStale &&
		!accountSummary.usesSpotStateForPerps &&
		selectedBalances.dex === "" &&
		accountSummary.hasSpotFundsWhenPerpWithdrawableZero;
	const internalTransferDisabledReason = !hasWalletAccess
		? t`Connect the owner wallet before moving funds.`
		: !accountModeReady
			? t`Select a supported account mode before moving funds.`
			: usesSharedQuoteBalance
				? t`Transfers between Spot and Perps are unavailable in shared-balance account modes.`
				: !fundsActionsReady
					? t`Balance data is unavailable. Try again after the connection recovers.`
					: null;
	const withdrawDisabledReason = !hasWalletAccess
		? t`Connect the owner wallet before moving funds.`
		: !accountModeReady
			? t`Select a supported account mode before moving funds.`
			: !fundsActionsReady
				? t`Balance data is unavailable. Try again after the connection recovers.`
				: null;
	const depositGeoBlocked =
		depositAvailability.reason === "geo-restricted" || depositAvailability.reason === "geo-unresolved";
	const showsFundsActions = hasWalletAccess || depositAvailability.path === "sponsored";

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
								? (depositAvailability.unavailableReason ?? t`Open Deposit to prepare your email wallet.`)
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
						title={showsEmailDeposit ? (depositAvailability.unavailableReason ?? undefined) : undefined}
					>
						{showsEmailDeposit
							? depositAvailability.available
								? t`Deposit`
								: depositAvailability.unavailableLabel
							: t`Connect Wallet`}
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

	const marginRatioLabel = marginRatioReady ? formatPercent(maintenanceMarginRatio, { signDisplay: "never" }) : "—";
	const crossLeverageLabel = crossLeverage === null ? "—" : `${formatNumber(crossLeverage, 2)}x`;
	const accountValueLabel = usesSharedQuoteBalance ? t`Portfolio Value` : t`Account Value`;
	const crossMaintenanceMarginLabel = t`Cross Maintenance Margin`;

	return (
		<div className={cn("h-full min-h-0 overflow-y-auto overscroll-y-contain bg-grid-container", className)}>
			<div className="flex min-h-full flex-col gap-3 p-3">
				{metricsHaveError ? (
					<div
						role="alert"
						className="flex items-center gap-2 rounded-8 border border-stroke-error-weak bg-error-soft px-3 py-2 text-xs text-error"
					>
						<WarningCircleIcon className="size-4 shrink-0" />
						<span>{t`Failed to load balances.`}</span>
					</div>
				) : null}
				{metricsAreStale && !metricsHaveError ? (
					<output className="flex items-center gap-2 rounded-8 border border-stroke-warning-weak bg-warning-soft px-3 py-2 text-xs text-warning">
						<WarningCircleIcon className="size-4 shrink-0" />
						<span>
							{fundsActionsReady
								? t`Balance data is stale.`
								: t`Balance data is stale. Actions are temporarily unavailable.`}
						</span>
					</output>
				) : null}
				{valuationUnavailable && !metricsHaveError && !metricsAreStale ? (
					<output className="flex items-center gap-2 rounded-8 border border-stroke-warning-weak bg-warning-soft px-3 py-2 text-xs text-warning">
						<WarningCircleIcon className="size-4 shrink-0" />
						<span>{t`Balance data is unavailable. Try again after the connection recovers.`}</span>
					</output>
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
							{metricsAreStale && !metricsHaveError ? (
								<WarningCircleIcon className="size-3.5 text-warning" aria-label={t`Balance data is stale.`} />
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
							label={accountValueLabel}
							value={
								accountSummaryReady && accountEquityValue !== null
									? formatUSD(accountEquityValue, { compact: false })
									: "—"
							}
							loading={metricLoading}
						/>
						<MetricRow
							label={t`Unrealized PNL`}
							value={
								accountSummaryReady && riskSummary
									? formatUSD(riskSummary.unrealizedPnl, { compact: false, signDisplay: "exceptZero" })
									: "—"
							}
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
							label={crossMaintenanceMarginLabel}
							value={
								accountSummaryReady && riskSummary
									? formatUSD(riskSummary.crossMaintenanceMarginUsed, { compact: false })
									: "—"
							}
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
					{depositGeoBlocked ? (
						<p className="text-center text-sm text-fg-muted">{depositAvailability.unavailableReason}</p>
					) : tradeRestricted || !showsFundsActions ? (
						<p className="text-center text-sm text-fg-muted">{t`Deposits and withdrawals are not allowed.`}</p>
					) : (
						<div className="space-y-2">
							{depositAvailability.unavailableReason ? (
								<output className="text-center text-xs text-fg-muted">{depositAvailability.unavailableReason}</output>
							) : null}
							<Button
								variant="filled"
								intent="brand"
								size="md"
								disabled={!depositAvailability.available}
								onClick={depositAvailability.available ? () => openDepositModal("deposit") : undefined}
								title={depositAvailability.unavailableReason ?? undefined}
								iconLeft={<DownloadSimpleIcon className="size-4" />}
								className="min-h-11 w-full"
							>
								{depositAvailability.available ? t`Deposit` : depositAvailability.unavailableLabel}
							</Button>
							<div className="grid grid-cols-2 gap-2">
								{internalTransferDisabledReason ? (
									<span id={transferUnavailableId} className="sr-only">
										{internalTransferDisabledReason}
									</span>
								) : null}
								{withdrawDisabledReason ? (
									<span id={withdrawUnavailableId} className="sr-only">
										{withdrawDisabledReason}
									</span>
								) : null}
								<Tooltip content={internalTransferDisabledReason} side="top">
									<span className="inline-flex w-full">
										<Button
											variant="outline"
											intent="neutral"
											size="md"
											onClick={() => openTransferModal("toPerp")}
											iconLeft={<ArrowsLeftRightIcon className="size-4" />}
											disabled={!!internalTransferDisabledReason}
											focusableWhenDisabled
											aria-describedby={internalTransferDisabledReason ? transferUnavailableId : undefined}
											className="min-h-11 w-full"
										>
											{t`Perps / Spot`}
										</Button>
									</span>
								</Tooltip>
								<Tooltip content={withdrawDisabledReason} side="top">
									<span className="inline-flex w-full">
										<Button
											variant="outline"
											intent="neutral"
											size="md"
											disabled={!!withdrawDisabledReason}
											focusableWhenDisabled
											aria-describedby={withdrawDisabledReason ? withdrawUnavailableId : undefined}
											onClick={() => openDepositModal("withdraw")}
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
			<Skeleton name="mobile-account-overview-metric" loading={loading} fallback={<SkeletonValue className="w-20" />}>
				<span className={cn("font-medium tabular-nums text-fg", emphasized && "font-semibold", valueClassName)}>
					{value}
				</span>
			</Skeleton>
		</div>
	);
}
