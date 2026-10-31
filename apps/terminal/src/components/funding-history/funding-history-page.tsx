import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowClockwiseIcon, ArrowLeftIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Button, Pagination, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@sairn/ui";
import { Link } from "@tanstack/react-router";
import { type ReactNode, Suspense, useMemo, useState } from "react";
import { DashboardHeader, FooterBar, GlobalModals } from "@/components/dashboard/dashboard-chrome";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import { AssetBadge } from "@/components/trade/components/asset-badge";
import { HistoryPageUnavailable } from "@/components/ui/history-page-unavailable";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";
import { getToolbarAbsoluteSize } from "@/domain/trade/trading-toolbar-metrics";
import { useFundingHistory } from "@/hooks/trade/use-funding-history";
import { useFundingHistoryCsvExport } from "@/hooks/trade/use-history-csv-export";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { buildCsvRows } from "@/lib/csv";
import { formatDateTime, formatDateTimeShort, shortenAddress, useNumberFormat } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
import { getFundingCollateralSymbol } from "@/lib/trade/collateral-amount";
import {
	DEFAULT_FUNDING_HISTORY_PAGE_SIZE,
	FUNDING_HISTORY_PAGE_SIZES,
	FUNDING_HISTORY_WINDOW_DAYS,
	type FundingHistoryPageSize,
	type FundingHistorySideFilter,
	filterFundingHistory,
	getFundingHistoryMarkets,
	getFundingHistoryPage,
	isFundingHistoryAddress,
	isFundingHistoryPageSize,
	isFundingHistorySideFilter,
} from "@/lib/trade/funding-history";
import { getFundingPositionPresentation, getFundingSideLabel } from "@/lib/trade/funding-position";
import { getUserFundingKey } from "@/lib/trade/user-funding";
import { getMarketCloseValueColorClass } from "@/lib/ui/value-color";
import { useIsTestnet } from "@/stores/use-global-settings-store";

const FUNDING_HISTORY_SKELETON_ROWS = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"] as const;
const ALL_FUNDING_MARKETS_VALUE = "__all_funding_markets__";

interface Props {
	address: string;
}

export function FundingHistoryPage({ address }: Props) {
	const { formatPercent, formatToken } = useNumberFormat();
	const { i18n, t } = useLingui();
	const locale = i18n.locale;
	const isMobile = useIsMobile();
	const isTestnet = useIsTestnet();
	const markets = useMarkets();
	const navigateToMarket = useMarketNavigation();
	const history = useFundingHistory(address);
	const exportAddress = isFundingHistoryAddress(address) ? address : undefined;
	const [requestedPage, setRequestedPage] = useState(1);
	const [rowsPerPage, setRowsPerPage] = useState<FundingHistoryPageSize>(DEFAULT_FUNDING_HISTORY_PAGE_SIZE);
	const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
	const [selectedSide, setSelectedSide] = useState<FundingHistorySideFilter>("all");
	const availableMarkets = useMemo(() => {
		const markets = getFundingHistoryMarkets(history.fundings);
		if (selectedMarket && !markets.includes(selectedMarket)) markets.push(selectedMarket);
		return markets.sort();
	}, [history.fundings, selectedMarket]);
	const filteredFundings = useMemo(
		() => filterFundingHistory(history.fundings, selectedMarket, selectedSide),
		[history.fundings, selectedMarket, selectedSide],
	);
	const pagination = getFundingHistoryPage(filteredFundings, requestedPage, rowsPerPage);
	const rangeLabel =
		history.rangeStartTime === null || history.rangeEndTime === null
			? null
			: `${formatDateTimeShort(history.rangeStartTime, { locale })} – ${formatDateTimeShort(history.rangeEndTime, { locale })}`;
	const { exportCsv, isExporting } = useFundingHistoryCsvExport({
		address: exportAddress,
		filename: "funding_history.csv",
		buildRows: (fundings) =>
			buildCsvRows(fundings, [
				{
					header: t`Time`,
					getValue: (funding) =>
						formatDateTime(funding.time, { locale: i18n.locale, dateStyle: "short", timeStyle: "short" }),
				},
				{ header: t`Asset`, getValue: (funding) => funding.coin },
				{
					header: t`Side`,
					getValue: (funding) =>
						getFundingSideLabel(funding.szi, (descriptor) => t(descriptor)) ?? FALLBACK_VALUE_PLACEHOLDER,
				},
				{ header: t`Size`, getValue: (funding) => getToolbarAbsoluteSize(funding.szi) ?? funding.szi },
				{ header: t`Rate`, getValue: (funding) => funding.fundingRate },
				{ header: t`Payment`, getValue: (funding) => funding.usdc },
				{
					header: t`Payment Token`,
					getValue: (funding) =>
						getFundingCollateralSymbol(funding.coin, markets.getMarket(funding.coin)) ?? FALLBACK_VALUE_PLACEHOLDER,
				},
			]),
	});

	function changeRowsPerPage(value: string | null) {
		if (value === null) return;
		const nextRowsPerPage = Number(value);
		if (!isFundingHistoryPageSize(nextRowsPerPage)) return;
		setRowsPerPage(nextRowsPerPage);
		setRequestedPage(1);
	}

	function changeMarket(value: string | null) {
		setSelectedMarket(value === null || value === ALL_FUNDING_MARKETS_VALUE ? null : value);
		setRequestedPage(1);
	}

	function changeSide(value: string | null) {
		if (!isFundingHistorySideFilter(value)) return;
		setSelectedSide(value);
		setRequestedPage(1);
	}

	function getUnconfirmedEmptyDescription() {
		if (history.isOffline) return t`You are offline. Funding payments will load when the connection returns.`;
		if (history.isRefreshing) return t`Loading funding payments`;
		return t`The requested 30-day window could not be verified. No partial history is shown.`;
	}

	let content: ReactNode;
	if (history.status === "disabled") {
		content = (
			<div role="alert" className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
				<WarningCircleIcon className="size-9 text-error" weight="fill" />
				<h2 className="mt-3 text-lg font-bold text-fg">
					<Trans>Invalid account address</Trans>
				</h2>
				<p className="mt-1 max-w-lg text-xs leading-5 text-fg-muted">
					<Trans>Enter a valid 0x account address to view funding payments.</Trans>
				</p>
			</div>
		);
	} else if (history.status === "offline") {
		content = (
			<HistoryPageUnavailable
				offline
				refreshing={false}
				description={t`You are offline. Funding payments will load when the connection returns.`}
				onRetry={history.refresh}
			/>
		);
	} else if (history.status === "loading") {
		content = (
			<div aria-busy="true" className="min-h-80 overflow-hidden">
				<output aria-live="polite" className="sr-only">
					<Trans>Loading funding payments</Trans>
				</output>
				<div className="h-9 border-b border-stroke-weak bg-fill-weak/40" />
				{FUNDING_HISTORY_SKELETON_ROWS.map((key) => (
					<div key={key} className="mx-4 h-12 animate-pulse border-b border-stroke-weak motion-reduce:animate-none">
						<div className="mt-4 h-4 rounded-4 bg-fill-weak" />
					</div>
				))}
			</div>
		);
	} else if (history.status === "error") {
		content = (
			<HistoryPageUnavailable
				offline={false}
				refreshing={false}
				description={t`The requested 30-day window could not be verified. No partial history is shown.`}
				onRetry={history.refresh}
			/>
		);
	} else if (history.fundings.length === 0 && (history.error || history.isOffline || history.isRefreshing)) {
		content = (
			<HistoryPageUnavailable
				offline={history.isOffline}
				refreshing={history.isRefreshing}
				description={getUnconfirmedEmptyDescription()}
				onRetry={history.refresh}
			/>
		);
	} else if (history.fundings.length === 0) {
		content = (
			<div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
				<output aria-live="polite" className="sr-only">
					<Trans>No funding payments found in the confirmed 30-day window.</Trans>
				</output>
				<h2 className="text-lg font-bold text-fg">
					<Trans>No funding payments found</Trans>
				</h2>
				<p className="mt-1 max-w-lg text-xs leading-5 text-fg-muted">
					<Trans>The account has no funding payments in the confirmed 30-day window.</Trans>
				</p>
			</div>
		);
	} else {
		content = (
			<>
				<div className="flex flex-wrap gap-3 border-b border-stroke-weak px-4 py-3">
					<Select
						size="sm"
						label={t`Market`}
						value={selectedMarket ?? ALL_FUNDING_MARKETS_VALUE}
						onValueChange={changeMarket}
						options={[
							{ label: t`All markets`, value: ALL_FUNDING_MARKETS_VALUE },
							...availableMarkets.map((market) => ({ label: market, value: market })),
						]}
						triggerAriaLabel={t`Filter funding payments by market`}
						className="w-44"
					/>
					<Select
						size="sm"
						label={t`Side`}
						value={selectedSide}
						onValueChange={changeSide}
						options={[
							{ label: t`All sides`, value: "all" },
							{ label: t`Long`, value: "long" },
							{ label: t`Short`, value: "short" },
						]}
						triggerAriaLabel={t`Filter funding payments by side`}
						className="w-36"
					/>
				</div>
				{filteredFundings.length === 0 ? (
					<div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
						<output aria-live="polite" className="sr-only">
							<Trans>No funding payments match the selected filters.</Trans>
						</output>
						<h2 className="text-base font-bold text-fg">
							<Trans>No matching funding payments</Trans>
						</h2>
						<p className="mt-1 text-xs text-fg-muted">
							<Trans>Choose another market or side.</Trans>
						</p>
					</div>
				) : (
					<>
						<div className="divide-y divide-stroke-weak min-[1001px]:hidden">
							{pagination.rows.map((funding) => {
								const market = markets.getMarket(funding.coin);
								const position = getFundingPositionPresentation(funding.szi, market, formatToken, (descriptor) =>
									t(descriptor),
								);
								return (
									<article key={getUserFundingKey(funding)} className="px-4 py-3">
										<div className="flex min-w-0 items-center justify-between gap-3">
											<AssetBadge
												coin={funding.coin}
												onClick={() => navigateToMarket(funding.coin)}
												aria-label={t`Switch to ${funding.coin} market`}
												className="h-auto min-h-0 border-0 bg-transparent p-0 shadow-none hover:bg-transparent"
												fit
											/>
											<time className="shrink-0 text-xs tabular-nums text-fg-muted">
												{formatDateTime(funding.time, { locale, dateStyle: "short", timeStyle: "short" })}
											</time>
										</div>
										<dl className="mt-3 grid grid-cols-3 gap-3">
											<div className="min-w-0">
												<dt className="text-2xs text-fg-muted">
													<Trans>Position</Trans>
												</dt>
												<dd className="mt-0.5 truncate text-xs font-semibold tabular-nums text-fg">
													{position.sideLabel ? (
														<span
															className={cn(
																"me-1",
																position.side === "long" ? "text-market-close-success" : "text-market-close-danger",
															)}
														>
															{position.sideLabel}
														</span>
													) : null}
													<bdi dir="ltr">{position.size}</bdi>
												</dd>
											</div>
											<div className="min-w-0">
												<dt className="text-2xs text-fg-muted">
													<Trans>Rate</Trans>
												</dt>
												<dd className="mt-0.5 truncate text-xs font-semibold tabular-nums text-fg">
													<bdi dir="ltr">
														{formatPercent(funding.fundingRate, {
															maximumFractionDigits: 4,
															minimumFractionDigits: 4,
														})}
													</bdi>
												</dd>
											</div>
											<div className="min-w-0 text-right">
												<dt className="text-2xs text-fg-muted">
													<Trans>Payment</Trans>
												</dt>
												<dd
													className={cn(
														"mt-0.5 truncate text-xs font-semibold tabular-nums",
														getMarketCloseValueColorClass(funding.usdc),
													)}
												>
													<bdi dir="ltr">
														{formatToken(funding.usdc, {
															symbol: getFundingCollateralSymbol(funding.coin, market) ?? undefined,
														})}
													</bdi>
												</dd>
											</div>
										</dl>
									</article>
								);
							})}
						</div>
						<div className="hidden overflow-x-auto min-[1001px]:block">
							<Table
								scrollableRegionLabel={t`Funding payments`}
								className="min-w-[52rem] table-fixed font-market-close tabular-nums"
							>
								<caption className="sr-only">
									<Trans>
										Funding payments for <bdi dir="ltr">{shortenAddress(address, 8, 6)}</bdi>
									</Trans>
								</caption>
								<colgroup>
									<col className="w-[136px]" />
									<col className="w-[176px]" />
									<col className="w-[144px]" />
									<col className="w-[160px]" />
									<col className="w-[216px]" />
								</colgroup>
								<TableHeader>
									<TableRow className="h-9 border-stroke-weak bg-fill-weak/40 hover:bg-fill-weak/40">
										<TableHead scope="col" className="px-5 text-start text-xs font-semibold text-fg-muted">
											<Trans>Asset</Trans>
										</TableHead>
										<TableHead scope="col" className="px-3 text-right text-xs font-semibold text-fg-muted">
											<Trans>Position</Trans>
										</TableHead>
										<TableHead scope="col" className="px-3 text-right text-xs font-semibold text-fg-muted">
											<Trans>Rate</Trans>
										</TableHead>
										<TableHead scope="col" className="px-3 text-right text-xs font-semibold text-fg-muted">
											<Trans>Payment</Trans>
										</TableHead>
										<TableHead scope="col" className="px-5 text-right text-xs font-semibold text-fg-muted">
											<Trans>Time</Trans>
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{pagination.rows.map((funding) => {
										const market = markets.getMarket(funding.coin);
										const position = getFundingPositionPresentation(funding.szi, market, formatToken, (descriptor) =>
											t(descriptor),
										);
										return (
											<TableRow
												key={getUserFundingKey(funding)}
												className="h-12 border-stroke-weak hover:bg-fill-hover"
											>
												<TableCell className="px-5 py-0 font-semibold">
													<AssetBadge
														coin={funding.coin}
														onClick={() => navigateToMarket(funding.coin)}
														aria-label={t`Switch to ${funding.coin} market`}
														className="h-auto min-h-0 border-0 bg-transparent p-0 shadow-none hover:bg-transparent"
														fit
													/>
												</TableCell>
												<TableCell className="px-3 py-0 text-right text-fg">
													{position.sideLabel ? (
														<span
															className={cn(
																"me-1",
																position.side === "long" ? "text-market-close-success" : "text-market-close-danger",
															)}
														>
															{position.sideLabel}
														</span>
													) : null}
													<bdi dir="ltr">{position.size}</bdi>
												</TableCell>
												<TableCell className="px-3 py-0 text-right text-fg-muted">
													<bdi dir="ltr">
														{formatPercent(funding.fundingRate, {
															maximumFractionDigits: 4,
															minimumFractionDigits: 4,
														})}
													</bdi>
												</TableCell>
												<TableCell
													className={cn(
														"px-3 py-0 text-right font-semibold",
														getMarketCloseValueColorClass(funding.usdc),
													)}
												>
													<bdi dir="ltr">
														{formatToken(funding.usdc, {
															symbol: getFundingCollateralSymbol(funding.coin, market) ?? undefined,
														})}
													</bdi>
												</TableCell>
												<TableCell className="px-5 py-0 text-right text-xs text-fg-muted">
													{formatDateTime(funding.time, { locale, dateStyle: "short", timeStyle: "short" })}
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</div>
						<div className="flex flex-col gap-3 border-t border-stroke-weak px-4 py-3 min-[1001px]:flex-row min-[1001px]:items-center min-[1001px]:justify-between">
							<div className="flex items-center gap-2">
								<span className="text-xs text-fg-muted">
									<Trans>Rows per page</Trans>
								</span>
								<Select
									size="xs"
									value={String(rowsPerPage)}
									onValueChange={changeRowsPerPage}
									options={FUNDING_HISTORY_PAGE_SIZES.map((pageSize) => ({
										label: String(pageSize),
										value: String(pageSize),
									}))}
									triggerAriaLabel={t`Rows per page`}
									className="w-20"
								/>
								<span className="text-xs tabular-nums text-fg-muted">
									{pagination.startIndex + 1}–{pagination.endIndex} / {filteredFundings.length}
								</span>
							</div>
							<Pagination
								currentPage={pagination.currentPage}
								totalPages={pagination.totalPages}
								onPageChange={setRequestedPage}
								variant={isMobile ? "mobile" : "desktop"}
								navigationLabel={t`Funding payments pagination`}
								previousPageLabel={t`Previous funding payments page`}
								nextPageLabel={t`Next funding payments page`}
								previousText={t`Previous`}
								nextText={t`Next`}
								getPageLabel={(page) => t`Page ${page}`}
								mobilePageSummary={t`${pagination.currentPage} of ${pagination.totalPages}`}
								className="min-w-0 flex-1 min-[1001px]:justify-end min-[1001px]:gap-8"
							/>
						</div>
					</>
				)}
			</>
		);
	}

	return (
		<>
			<DashboardFrameView
				{...DASHBOARD_FRAMES["/funding-history"]}
				isMobile={isMobile}
				bannerOffset={isTestnet}
				testnet={isTestnet}
				header={<DashboardHeader isMobile={isMobile} />}
				main={
					<>
						<div className="mb-4 flex flex-wrap items-start justify-between gap-4">
							<div>
								<Button
									nativeButton={false}
									variant="ghost"
									intent="neutral"
									size="xs"
									className="-ms-2 mb-2"
									iconLeft={<ArrowLeftIcon className="size-3.5 rtl:rotate-180" />}
									render={<Link to="/trade" search={{ scope: "all" }} />}
								>
									<Trans>Back to trade</Trans>
								</Button>
								<h1 className="text-2xl font-bold tracking-tight text-fg">
									<Trans>Funding payments</Trans>
								</h1>
								<p className="mt-1 text-xs text-fg-muted">
									<bdi dir="ltr">{shortenAddress(address, 8, 6)}</bdi> ·{" "}
									<Trans>{FUNDING_HISTORY_WINDOW_DAYS}-day API window</Trans>
								</p>
								{rangeLabel ? <p className="mt-1 text-2xs text-fg-muted">{rangeLabel}</p> : null}
							</div>
							<div className="flex items-center gap-2">
								{exportAddress ? (
									<Button
										variant="outline"
										intent="neutral"
										size="xs"
										disabled={isExporting || history.isRefreshing || history.isOffline || history.status === "loading"}
										onClick={() => void exportCsv()}
									>
										<Trans>Export CSV</Trans>
									</Button>
								) : null}
								<Button
									variant="outline"
									intent="neutral"
									size="xs"
									disabled={
										history.isRefreshing ||
										history.isOffline ||
										history.status === "disabled" ||
										history.status === "loading"
									}
									onClick={history.refresh}
									iconLeft={<ArrowClockwiseIcon className={cn("size-3.5", history.isRefreshing && "animate-spin")} />}
								>
									<Trans>Refresh</Trans>
								</Button>
							</div>
						</div>
						<p className="mb-3 text-xs leading-5 text-fg-muted">
							<Trans>
								Only this requested time window is shown. Older payments have not been loaded and are not included in
								this count.
							</Trans>
						</p>
						<section
							data-testid="funding-history-page"
							data-state={history.status}
							className="overflow-hidden rounded-24 bg-surface shadow-raised"
						>
							{content}
						</section>
					</>
				}
				footer={
					!isMobile ? (
						<Suspense fallback={null}>
							<FooterBar />
						</Suspense>
					) : null
				}
			/>
			<Suspense fallback={null}>
				<GlobalModals enableLegalGate />
			</Suspense>
		</>
	);
}
