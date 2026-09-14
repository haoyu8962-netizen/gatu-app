import { Button, Select } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import Big from "big.js";
import { useState } from "react";
import {
	calculateFourteenDayVolume,
	getLatestHistoryValue,
	getPortfolioSnapshot,
	type PortfolioPeriod,
	type PortfolioScope,
} from "@/domain/portfolio";
import { applyReferralDiscountToFeeRate } from "@/domain/trade/fees";
import { usePortfolioData } from "@/hooks/portfolio/use-portfolio-data";
import { cn } from "@/lib/cn";
import { formatPercent, formatUSD } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { PortfolioPerformanceChart } from "./portfolio-performance-chart";

type FeeMarket = "perps" | "spot";

export function PortfolioOverview() {
	useNumberFormatRevision();
	const { t } = useLingui();
	const data = usePortfolioData();
	const [scope, setScope] = useState<PortfolioScope>("combined");
	const [period, setPeriod] = useState<PortfolioPeriod>("month");
	const [feeMarket, setFeeMarket] = useState<FeeMarket>("perps");
	const snapshot = getPortfolioSnapshot(data.portfolio, scope, period);
	const perpsSnapshot = getPortfolioSnapshot(data.portfolio, "perps", period);
	const fourteenDayVolume = calculateFourteenDayVolume(data.fees?.dailyUserVlm);
	const pnl = getLatestHistoryValue(snapshot?.pnlHistory);
	const isPortfolioLoading = data.portfolioStatus === "loading";
	const isPortfolioUnavailable =
		data.isConnected && !isPortfolioLoading && (snapshot === null || perpsSnapshot === null);
	const isFeesLoading = data.feesStatus === "loading";
	const activeReferralDiscount = data.fees?.activeReferralDiscount;
	const takerFee = applyReferralDiscountToFeeRate(
		feeMarket === "perps" ? data.fees?.userCrossRate : data.fees?.userSpotCrossRate,
		activeReferralDiscount,
	);
	const makerFee = applyReferralDiscountToFeeRate(
		feeMarket === "perps" ? data.fees?.userAddRate : data.fees?.userSpotAddRate,
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
					value={formatUSD(isFeesLoading ? "0" : (fourteenDayVolume ?? "0"))}
				/>
				<MetricCard
					label={<Trans>Fees (Taker / Maker)</Trans>}
					value={`${formatPercent(isFeesLoading ? "0" : (takerFee ?? "0"), {
						minimumFractionDigits: 4,
						maximumFractionDigits: 4,
						signDisplay: "auto",
					})} / ${formatPercent(isFeesLoading ? "0" : (makerFee ?? "0"), {
						minimumFractionDigits: 4,
						maximumFractionDigits: 4,
						signDisplay: "auto",
					})}`}
					control={
						<Select
							value={feeMarket}
							onValueChange={(value) => value && setFeeMarket(value as FeeMarket)}
							options={feeMarketOptions}
							triggerAriaLabel={t`Fee market for taker and maker rates`}
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
						triggerAriaLabel={t`Portfolio account scope`}
						size="xxs"
						className="min-w-0 flex-1"
						triggerClassName="border-0 bg-transparent shadow-none"
					/>
					<Select
						value={period}
						onValueChange={(value) => value && setPeriod(value as PortfolioPeriod)}
						options={periodOptions}
						triggerAriaLabel={t`Portfolio performance period`}
						size="xxs"
						className="w-22 shrink-0"
						triggerClassName="border-0 bg-transparent shadow-none"
					/>
				</div>
				<div className="flex flex-1 flex-col justify-center px-3 py-2 text-xs">
					<SummaryRow
						label={<Trans>PNL</Trans>}
						value={formatUSD(pnl ?? "0", { compact: false, signDisplay: "exceptZero" })}
						tone={pnl ?? undefined}
					/>
					<SummaryRow label={<Trans>Volume</Trans>} value={formatUSD(snapshot?.vlm ?? "0")} />
					<SummaryRow label={<Trans>Max Drawdown</Trans>} value="—" />
					<SummaryRow
						label={<Trans>Total Equity</Trans>}
						value={formatUSD(data.totalEquity ?? "0", { compact: false })}
					/>
					{!data.usesSharedQuoteBalance ? (
						<SummaryRow
							label={<Trans>Perps Account Equity</Trans>}
							value={formatUSD(data.perpEquity ?? "0", { compact: false })}
						/>
					) : null}
					<SummaryRow
						label={<Trans>Spot Account Equity</Trans>}
						value={formatUSD(data.spotEquity ?? "0", { compact: false })}
					/>
					<SummaryRow
						label={<Trans>Lending Net Balance</Trans>}
						value={formatUSD(data.earnBalance ?? "0", { compact: false })}
					/>
				</div>
			</section>

			<div className="min-[1001px]:col-span-2">
				<PortfolioPerformanceChart
					accountValueHistory={snapshot?.accountValueHistory ?? []}
					pnlHistory={snapshot?.pnlHistory ?? []}
					perpsPnlHistory={perpsSnapshot?.pnlHistory ?? []}
					period={period}
					isLoading={isPortfolioLoading}
					isUnavailable={isPortfolioUnavailable}
					hasConfirmedHistory={data.portfolioStatus === "ready" && snapshot !== null && perpsSnapshot !== null}
					onRetry={data.retry}
				/>
			</div>
			<div className="col-span-full hidden space-y-1 px-1 text-2xs text-fg-muted min-[1001px]:block" aria-live="polite">
				<p>
					<Trans>Max drawdown is unavailable until cash-flow-adjusted history can be verified.</Trans>
				</p>
				{data.isConnected && data.totalEquity === null ? (
					<p>
						{data.hasUnresolvedLendingOverlap ? (
							<Trans>Total equity is unavailable because lending and trading balances may overlap.</Trans>
						) : (
							<Trans>Some balances cannot be valued with current data.</Trans>
						)}
					</p>
				) : null}
				{data.isConnected && data.totalEquity === null && !data.hasUnresolvedLendingOverlap ? (
					<Button variant="outline" intent="neutral" size="xs" onClick={data.retry}>
						<Trans>Retry</Trans>
					</Button>
				) : null}
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
	const toneClassName = getMarketToneClass(tone);
	return (
		<div className="flex min-h-6 items-center justify-between gap-3">
			<span className="min-w-0 text-fg-muted">{label}</span>
			<span className={cn("shrink-0 font-medium tabular-nums", toneClassName)}>{value}</span>
		</div>
	);
}

function getMarketToneClass(value: string | null | undefined): "text-fg" | "text-market-down" | "text-market-up" {
	if (!value) return "text-fg";
	try {
		const parsed = Big(value);
		if (parsed.gt(0)) return "text-market-up";
		if (parsed.lt(0)) return "text-market-down";
	} catch {
		return "text-fg";
	}
	return "text-fg";
}
