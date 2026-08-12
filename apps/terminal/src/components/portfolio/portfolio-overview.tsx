import { Select } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import {
	calculateAllDexPerpEquityUsd,
	calculateCoreAccountEquity,
	calculateEarnBalance,
	calculateFourteenDayVolume,
	calculateMaxDrawdown,
	calculateVaultEquity,
	getLatestHistoryValue,
	getPortfolioSnapshot,
	type PortfolioPeriod,
	type PortfolioScope,
	resolveCurrentTotalEquity,
} from "@/domain/portfolio";
import { getAccountBalanceSummary } from "@/domain/trade/balances";
import { applyReferralDiscountToFeeRate } from "@/domain/trade/fees";
import { isSupportedAccountAbstraction, useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useSpotTokenUsdPrices } from "@/hooks/trade/use-spot-token-usd-prices";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatPercent, formatUSD } from "@/lib/format";
import { useInfo, useMarkets } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { PortfolioPerformanceChart } from "./portfolio-performance-chart";

type FeeMarket = "perps" | "spot";

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export function PortfolioOverview() {
	useNumberFormatRevision();
	const { t } = useLingui();
	const { address, isConnected } = useWalletSession();
	const [scope, setScope] = useState<PortfolioScope>("combined");
	const [period, setPeriod] = useState<PortfolioPeriod>("month");
	const [feeMarket, setFeeMarket] = useState<FeeMarket>("perps");
	const user = address ?? EMPTY_ADDRESS;
	const queryOptions = {
		enabled: isConnected && !!address,
		staleTime: 30_000,
		refetchInterval: 60_000,
		retry: 1,
	} as const;

	const portfolioQuery = useInfo("portfolio", { user }, queryOptions);
	const feesQuery = useInfo("userFees", { user }, queryOptions);
	const vaultsQuery = useInfo("userVaultEquities", { user }, queryOptions);
	const borrowLendQuery = useInfo("borrowLendUserState", { user }, queryOptions);
	const reserveStatesQuery = useInfo("allBorrowLendReserveStates", undefined, queryOptions);
	const balances = useDefaultDexBalances();
	const markets = useMarkets();
	const tokenUsdPrices = useSpotTokenUsdPrices(isConnected);

	const accountSummary = useMemo(
		() =>
			getAccountBalanceSummary({
				accountAbstraction: balances.accountAbstraction,
				marginSummary: balances.marginSummary,
				perpSummary: balances.perpSummary,
				withdrawable: balances.withdrawable,
				spotBalances: balances.spotBalances,
				spotAvailableAfterMaintenance: balances.spotAvailableAfterMaintenance,
				tokenUsdPrices,
			}),
		[
			balances.accountAbstraction,
			balances.marginSummary,
			balances.perpSummary,
			balances.spotAvailableAfterMaintenance,
			balances.spotBalances,
			balances.withdrawable,
			tokenUsdPrices,
		],
	);

	const snapshot = getPortfolioSnapshot(portfolioQuery.data, scope, period);
	const combinedSnapshot = getPortfolioSnapshot(portfolioQuery.data, "combined", period);
	const perpsSnapshot = getPortfolioSnapshot(portfolioQuery.data, "perps", period);
	const earnBalance = calculateEarnBalance(borrowLendQuery.data, reserveStatesQuery.data);
	const vaultEquity = calculateVaultEquity(vaultsQuery.data);
	const accountModeReady = isSupportedAccountAbstraction(balances.accountAbstraction);
	let perpAccountEquity: string | null = null;
	if (!accountSummary.usesSpotStateForPerps && accountModeReady && balances.hasAllDexsSnapshot) {
		perpAccountEquity =
			balances.accountAbstraction === "disabled"
				? calculateAllDexPerpEquityUsd({
						accounts: balances.allDexClearinghouseStates.map(([dex, state]) => ({
							dex,
							accountValue: state.marginSummary.accountValue,
						})),
						collaterals: markets.builderPerp.map((market) => ({
							dex: market.dex,
							collateralToken: market.quoteToken?.name,
						})),
						tokenUsdPrices,
					})
				: accountSummary.perpAccountValue.toString();
	}
	const coreEquity = calculateCoreAccountEquity({
		spotEquity: accountSummary.spotAccountValue,
		perpEquity: perpAccountEquity ?? 0,
		usesSharedQuoteBalance: accountSummary.usesSpotStateForPerps,
	});
	const hasResolvedBalanceSources =
		isConnected &&
		accountModeReady &&
		balances.hasSpotStateSnapshot &&
		(accountSummary.usesSpotStateForPerps || (balances.hasAllDexsSnapshot && perpAccountEquity !== null));
	const currentEquitySourcesAvailable =
		hasResolvedBalanceSources &&
		vaultsQuery.data !== undefined &&
		borrowLendQuery.data !== undefined &&
		reserveStatesQuery.data !== undefined;
	const totalEquity = isConnected
		? resolveCurrentTotalEquity({
				portfolioValue: getLatestHistoryValue(combinedSnapshot?.accountValueHistory),
				coreEquity,
				vaultEquity,
				earnBalance,
				currentSourcesAvailable: currentEquitySourcesAvailable,
			})
		: null;
	const spotAccountEquity =
		isConnected && accountModeReady && balances.hasSpotStateSnapshot ? accountSummary.spotAccountValue : null;
	const displayedEarnBalance =
		isConnected && borrowLendQuery.data !== undefined && reserveStatesQuery.data !== undefined ? earnBalance : null;
	const fourteenDayVolume = calculateFourteenDayVolume(feesQuery.data?.dailyUserVlm);
	const pnl = getLatestHistoryValue(snapshot?.pnlHistory);
	const maxDrawdown = calculateMaxDrawdown(snapshot?.accountValueHistory);
	const isPortfolioLoading = isConnected && !snapshot && (portfolioQuery.isPending || portfolioQuery.isFetching);
	const isPortfolioUnavailable = isConnected && !isPortfolioLoading && (snapshot === null || perpsSnapshot === null);
	const isFeesLoading = isConnected && !feesQuery.data && (feesQuery.isPending || feesQuery.isFetching);
	const activeReferralDiscount = feesQuery.data?.activeReferralDiscount;
	const takerFee = applyReferralDiscountToFeeRate(
		feeMarket === "perps" ? feesQuery.data?.userCrossRate : feesQuery.data?.userSpotCrossRate,
		activeReferralDiscount,
	);
	const makerFee = applyReferralDiscountToFeeRate(
		feeMarket === "perps" ? feesQuery.data?.userAddRate : feesQuery.data?.userSpotAddRate,
		activeReferralDiscount,
	);

	const scopeOptions = [
		{ value: "combined", label: t`Perps + Spot + Vaults` },
		{ value: "perps", label: t`Perps` },
	];
	const periodOptions = [
		{ value: "day", label: t`24H` },
		{ value: "week", label: t`7D` },
		{ value: "month", label: t`30D` },
		{ value: "allTime", label: t`All Time` },
	];
	const feeMarketOptions = [
		{ value: "perps", label: t`Perps` },
		{ value: "spot", label: t`Spot` },
	];

	return (
		<div className="grid gap-2 min-[1001px]:grid-cols-4">
			<div className="grid grid-cols-2 gap-2 min-[1001px]:grid-cols-1">
				<MetricCard
					label={<Trans>14 Day Volume</Trans>}
					value={isFeesLoading || fourteenDayVolume === null ? "—" : formatUSD(fourteenDayVolume)}
				/>
				<MetricCard
					label={<Trans>Fees (Taker / Maker)</Trans>}
					value={
						isFeesLoading || takerFee == null || makerFee == null
							? "—"
							: `${formatPercent(takerFee, {
									minimumFractionDigits: 4,
									maximumFractionDigits: 4,
									signDisplay: "auto",
								})} / ${formatPercent(makerFee, {
									minimumFractionDigits: 4,
									maximumFractionDigits: 4,
									signDisplay: "auto",
								})}`
					}
					control={
						<Select
							value={feeMarket}
							onValueChange={(value) => value && setFeeMarket(value as FeeMarket)}
							options={feeMarketOptions}
							size="xxs"
							className="w-20"
							triggerClassName="border-0 bg-transparent px-1 shadow-none"
						/>
					}
				/>
			</div>

			<section
				className="flex h-60 flex-col rounded-12 bg-surface min-[1001px]:h-[249px]"
				aria-label={t`Portfolio summary`}
			>
				<div className="flex min-h-10 items-center justify-between gap-2 border-b border-stroke-weak px-2">
					<Select
						value={scope}
						onValueChange={(value) => value && setScope(value as PortfolioScope)}
						options={scopeOptions}
						size="xxs"
						className="min-w-0 flex-1"
						triggerClassName="border-0 bg-transparent shadow-none"
					/>
					<Select
						value={period}
						onValueChange={(value) => value && setPeriod(value as PortfolioPeriod)}
						options={periodOptions}
						size="xxs"
						className="w-22 shrink-0"
						triggerClassName="border-0 bg-transparent shadow-none"
					/>
				</div>
				<div className="flex flex-1 flex-col justify-center px-3 py-2 text-xs">
					<SummaryRow
						label={<Trans>PNL</Trans>}
						value={pnl === null ? "—" : formatUSD(pnl, { compact: false, signDisplay: "exceptZero" })}
						tone={pnl ?? undefined}
					/>
					<SummaryRow label={<Trans>Volume</Trans>} value={snapshot === null ? "—" : formatUSD(snapshot.vlm)} />
					<SummaryRow
						label={<Trans>Max Drawdown</Trans>}
						value={maxDrawdown === null ? "—" : formatPercent(maxDrawdown)}
						tone={maxDrawdown ?? undefined}
					/>
					<SummaryRow
						label={<Trans>Total Equity</Trans>}
						value={totalEquity === null ? "—" : formatUSD(totalEquity, { compact: false })}
					/>
					{!accountSummary.usesSpotStateForPerps ? (
						<SummaryRow
							label={<Trans>Perps Account Equity</Trans>}
							value={perpAccountEquity === null ? "—" : formatUSD(perpAccountEquity, { compact: false })}
						/>
					) : null}
					<SummaryRow
						label={<Trans>Spot Account Equity</Trans>}
						value={spotAccountEquity === null ? "—" : formatUSD(spotAccountEquity, { compact: false })}
					/>
					<SummaryRow
						label={<Trans>Earn Balance</Trans>}
						value={displayedEarnBalance === null ? "—" : formatUSD(displayedEarnBalance, { compact: false })}
					/>
				</div>
			</section>

			<div className="min-[1001px]:col-span-2">
				<PortfolioPerformanceChart
					accountValueHistory={snapshot?.accountValueHistory ?? []}
					pnlHistory={snapshot?.pnlHistory ?? []}
					perpsPnlHistory={perpsSnapshot?.pnlHistory ?? []}
					isLoading={isPortfolioLoading}
					isUnavailable={isPortfolioUnavailable}
					onRetry={() => {
						void portfolioQuery.refetch();
						void feesQuery.refetch();
					}}
				/>
			</div>
		</div>
	);
}

function MetricCard({ label, value, control }: { label: React.ReactNode; value: string; control?: React.ReactNode }) {
	return (
		<section className="flex min-h-30 flex-col rounded-12 bg-surface p-3">
			<div className="flex items-start justify-between gap-2 text-xs text-fg-muted">
				<span>{label}</span>
				{control}
			</div>
			<p className="flex flex-1 items-center break-words text-lg font-normal leading-tight text-fg tabular-nums min-[1200px]:text-xl">
				{value}
			</p>
		</section>
	);
}

function SummaryRow({ label, value, tone }: { label: React.ReactNode; value: string; tone?: string }) {
	const numericTone = tone ? Number(tone) : 0;
	return (
		<div className="flex min-h-6 items-center justify-between gap-3">
			<span className="min-w-0 text-fg-muted">{label}</span>
			<span
				className={cn(
					"shrink-0 font-medium tabular-nums text-fg",
					numericTone > 0 && "text-success",
					numericTone < 0 && "text-error",
				)}
			>
				{value}
			</span>
		</div>
	);
}
