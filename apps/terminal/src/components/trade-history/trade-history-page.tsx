import { Button, Pagination, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import type { UserFillsResponse } from "@nktkas/hyperliquid";
import { ArrowClockwiseIcon, ArrowLeftIcon, ArrowSquareOutIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { type ReactNode, Suspense, useMemo, useState } from "react";
import { AssetBadge } from "@/components/trade/components/asset-badge";
import { TopNav } from "@/components/trade/header/top-nav";
import { MobileHeader } from "@/components/trade/mobile/mobile-header";
import { TestnetBanner } from "@/components/trade/testnet-banner";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { APP_HEADER_OFFSET_CLASS, APP_HEADER_PLUS_BANNER_OFFSET_CLASS } from "@/config/layout";
import { getToolbarNonZeroPnl } from "@/domain/trade/trading-toolbar-metrics";
import { useUserFillsCsvExport } from "@/hooks/trade/use-history-csv-export";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useTradeHistory } from "@/hooks/trade/use-trade-history";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { buildCsvRows } from "@/lib/csv";
import { formatDateTimeShort, formatNumber, formatToken, formatUSD, shortenAddress } from "@/lib/format";
import { getExplorerTxUrl, useMarkets } from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import {
	ACCOUNT_HISTORY_PAGE_SIZES,
	type AccountHistoryPageSize,
	DEFAULT_ACCOUNT_HISTORY_PAGE_SIZE,
	getAccountHistoryPage,
	isAccountHistoryAddress,
	isAccountHistoryPageSize,
} from "@/lib/trade/account-history";
import {
	filterTradeHistory,
	getTradeHistoryMarkets,
	getTradeHistoryType,
	isTradeHistoryDirectionFilter,
	isTradeHistoryRoleFilter,
	isTradeHistoryTypeFilter,
	TRADE_HISTORY_SNAPSHOT_LIMIT,
	type TradeHistoryDirectionFilter,
	type TradeHistoryRoleFilter,
	type TradeHistoryTypeFilter,
} from "@/lib/trade/trade-history";
import { getUserFillKey, hasUserFillExplorerTransaction } from "@/lib/trade/user-fills";
import { getMarketCloseValueColorClass } from "@/lib/ui/value-color";
import { useIsTestnet } from "@/stores/use-global-settings-store";

const FooterBar = createLazyComponent(() => import("@/components/trade/footer/footer-bar"), "FooterBar");
const GlobalModals = createLazyComponent(() => import("@/components/trade/components/global-modals"), "GlobalModals");
const TRADE_HISTORY_SKELETON_ROWS = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"] as const;
const ALL_TRADE_MARKETS_VALUE = "__all_trade_markets__";

interface Props {
	address: string;
}

type UserFill = UserFillsResponse[number];

function getDirectionColorClass(fill: UserFill) {
	if (fill.liquidation) return "text-error";
	if (fill.side === "B") return "text-success";
	return "text-error";
}

export function TradeHistoryPage({ address }: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const isTestnet = useIsTestnet();
	const markets = useMarkets();
	const navigateToMarket = useMarketNavigation();
	const history = useTradeHistory(address);
	const exportAddress = isAccountHistoryAddress(address) ? address : undefined;
	const [requestedPage, setRequestedPage] = useState(1);
	const [rowsPerPage, setRowsPerPage] = useState<AccountHistoryPageSize>(DEFAULT_ACCOUNT_HISTORY_PAGE_SIZE);
	const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
	const [selectedDirection, setSelectedDirection] = useState<TradeHistoryDirectionFilter>("all");
	const [selectedRole, setSelectedRole] = useState<TradeHistoryRoleFilter>("all");
	const [selectedType, setSelectedType] = useState<TradeHistoryTypeFilter>("all");
	const availableMarkets = useMemo(() => {
		const markets = getTradeHistoryMarkets(history.fills);
		if (selectedMarket && !markets.includes(selectedMarket)) markets.push(selectedMarket);
		return markets.sort();
	}, [history.fills, selectedMarket]);
	const filteredFills = useMemo(
		() =>
			filterTradeHistory(
				history.fills,
				selectedMarket,
				selectedDirection,
				selectedRole,
				selectedType,
				(coin) => markets.getMarket(coin)?.kind,
			),
		[history.fills, markets, selectedMarket, selectedDirection, selectedRole, selectedType],
	);
	const pagination = getAccountHistoryPage(filteredFills, requestedPage, rowsPerPage);

	function getDirectionLabel(direction: string) {
		if (direction === "Open Long") return t`Open Long`;
		if (direction === "Close Long") return t`Close Long`;
		if (direction === "Open Short") return t`Open Short`;
		if (direction === "Close Short") return t`Close Short`;
		return direction;
	}

	function getTypeLabel(fill: UserFill) {
		const type = getTradeHistoryType(fill, (coin) => markets.getMarket(coin)?.kind);
		if (type === "spot") return t`Spot`;
		if (type === "perp") return t`Perp`;
		return FALLBACK_VALUE_PLACEHOLDER;
	}

	function getRoleLabel(fill: UserFill) {
		return fill.crossed ? t`Taker` : t`Maker`;
	}

	const { exportCsv, isExporting } = useUserFillsCsvExport({
		address: exportAddress,
		filename: "trade_history.csv",
		buildRows: (fills) =>
			buildCsvRows(
				filterTradeHistory(
					fills,
					selectedMarket,
					selectedDirection,
					selectedRole,
					selectedType,
					(coin) => markets.getMarket(coin)?.kind,
				),
				[
					{ header: t`Time`, getValue: (fill) => formatDateTimeShort(fill.time) },
					{ header: t`Asset`, getValue: (fill) => fill.coin },
					{ header: t`Direction`, getValue: (fill) => getDirectionLabel(fill.dir) },
					{ header: t`Type`, getValue: getTypeLabel },
					{ header: t`Role`, getValue: getRoleLabel },
					{ header: t`Price`, getValue: (fill) => formatUSD(fill.px) },
					{ header: t`Size`, getValue: (fill) => formatNumber(fill.sz, markets.getSzDecimals(fill.coin)) },
					{ header: t`Fee`, getValue: (fill) => formatToken(fill.fee, { symbol: fill.feeToken }) },
					{
						header: t`PNL`,
						getValue: (fill) => {
							const closedPnl = getToolbarNonZeroPnl(fill.closedPnl);
							return closedPnl ? formatUSD(closedPnl, { signDisplay: "exceptZero" }) : FALLBACK_VALUE_PLACEHOLDER;
						},
					},
					{
						header: t`Transaction`,
						getValue: (fill) => (hasUserFillExplorerTransaction(fill) ? fill.hash : FALLBACK_VALUE_PLACEHOLDER),
					},
				],
			),
	});

	function changeRowsPerPage(value: string | null) {
		if (value === null) return;
		const nextRowsPerPage = Number(value);
		if (!isAccountHistoryPageSize(nextRowsPerPage)) return;
		setRowsPerPage(nextRowsPerPage);
		setRequestedPage(1);
	}

	function changeMarket(value: string | null) {
		setSelectedMarket(value === null || value === ALL_TRADE_MARKETS_VALUE ? null : value);
		setRequestedPage(1);
	}

	function changeDirection(value: string | null) {
		if (!isTradeHistoryDirectionFilter(value)) return;
		setSelectedDirection(value);
		setRequestedPage(1);
	}

	function changeRole(value: string | null) {
		if (!isTradeHistoryRoleFilter(value)) return;
		setSelectedRole(value);
		setRequestedPage(1);
	}

	function changeType(value: string | null) {
		if (!isTradeHistoryTypeFilter(value)) return;
		setSelectedType(value);
		setRequestedPage(1);
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
					<Trans>Enter a valid 0x account address to view trade history.</Trans>
				</p>
			</div>
		);
	} else if (history.status === "offline") {
		content = (
			<div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
				<output aria-live="polite" className="sr-only">
					<Trans>You are offline. Trade history will load when the connection returns.</Trans>
				</output>
				<WarningCircleIcon className="size-9 text-warning" weight="fill" />
				<h2 className="mt-3 text-lg font-bold text-fg">
					<Trans>You are offline</Trans>
				</h2>
				<p className="mt-1 max-w-lg text-xs leading-5 text-fg-muted">
					<Trans>Trade history will load automatically when the connection returns.</Trans>
				</p>
			</div>
		);
	} else if (history.status === "loading") {
		content = (
			<div aria-busy="true" className="min-h-80 overflow-hidden">
				<output aria-live="polite" className="sr-only">
					<Trans>Loading trade history</Trans>
				</output>
				<div className="h-9 border-b border-stroke-weak bg-fill-weak/40" />
				{TRADE_HISTORY_SKELETON_ROWS.map((key) => (
					<div key={key} className="mx-4 h-12 animate-pulse border-b border-stroke-weak motion-reduce:animate-none">
						<div className="mt-4 h-4 rounded-4 bg-fill-weak" />
					</div>
				))}
			</div>
		);
	} else if (history.status === "error") {
		content = (
			<div role="alert" className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
				<WarningCircleIcon className="size-9 text-error" weight="fill" />
				<h2 className="mt-3 text-lg font-bold text-fg">
					<Trans>Trade history is unavailable</Trans>
				</h2>
				<p className="mt-1 max-w-lg text-xs leading-5 text-fg-muted">
					<Trans>The recent trade snapshot could not be loaded or validated.</Trans>
				</p>
				<Button className="mt-4" onClick={history.refresh}>
					<Trans>Retry</Trans>
				</Button>
			</div>
		);
	} else if (history.fills.length === 0) {
		content = (
			<div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
				<output aria-live="polite" className="sr-only">
					<Trans>No fills found in the recent trade snapshot.</Trans>
				</output>
				<h2 className="text-lg font-bold text-fg">
					<Trans>No fills found</Trans>
				</h2>
				<p className="mt-1 max-w-lg text-xs leading-5 text-fg-muted">
					<Trans>The account has no fills in the public API snapshot.</Trans>
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
						value={selectedMarket ?? ALL_TRADE_MARKETS_VALUE}
						onValueChange={changeMarket}
						options={[
							{ label: t`All markets`, value: ALL_TRADE_MARKETS_VALUE },
							...availableMarkets.map((market) => ({ label: market, value: market })),
						]}
						triggerAriaLabel={t`Filter trade history by market`}
						className="w-40"
					/>
					<Select
						size="sm"
						label={t`Direction`}
						value={selectedDirection}
						onValueChange={changeDirection}
						options={[
							{ label: t`All directions`, value: "all" },
							{ label: t`Buy`, value: "buy" },
							{ label: t`Sell`, value: "sell" },
						]}
						triggerAriaLabel={t`Filter trade history by direction`}
						className="w-36"
					/>
					<Select
						size="sm"
						label={t`Role`}
						value={selectedRole}
						onValueChange={changeRole}
						options={[
							{ label: t`All roles`, value: "all" },
							{ label: t`Maker`, value: "maker" },
							{ label: t`Taker`, value: "taker" },
						]}
						triggerAriaLabel={t`Filter trade history by role`}
						className="w-36"
					/>
					<Select
						size="sm"
						label={t`Type`}
						value={selectedType}
						onValueChange={changeType}
						options={[
							{ label: t`All types`, value: "all" },
							{ label: t`Perp`, value: "perp" },
							{ label: t`Spot`, value: "spot" },
						]}
						triggerAriaLabel={t`Filter trade history by type`}
						className="w-36"
					/>
				</div>
				{filteredFills.length === 0 ? (
					<div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
						<output aria-live="polite" className="sr-only">
							<Trans>No fills match the selected filters.</Trans>
						</output>
						<h2 className="text-base font-bold text-fg">
							<Trans>No matching fills</Trans>
						</h2>
						<p className="mt-1 text-xs text-fg-muted">
							<Trans>Choose another market, direction, role, or type.</Trans>
						</p>
					</div>
				) : (
					<>
						<div className="divide-y divide-stroke-weak min-[1001px]:hidden">
							{pagination.rows.map((fill) => {
								const closedPnl = getToolbarNonZeroPnl(fill.closedPnl);
								return (
									<article key={getUserFillKey(fill)} className="px-4 py-3">
										<div className="flex min-w-0 items-center justify-between gap-3">
											<AssetBadge
												coin={fill.coin}
												side={fill.side === "B" ? "buy" : "sell"}
												onClick={() => navigateToMarket(fill.coin)}
												aria-label={t`Switch to ${fill.coin} market`}
												className="h-auto min-h-0 border-0 bg-transparent p-0 shadow-none hover:bg-transparent"
												fit
											/>
											<time className="shrink-0 text-xs tabular-nums text-fg-muted">
												{formatDateTimeShort(fill.time)}
											</time>
										</div>
										<div className="mt-2 flex items-center gap-2 text-2xs font-semibold">
											<span className={getDirectionColorClass(fill)}>
												{fill.liquidation ? t`Liquidated` : getDirectionLabel(fill.dir)}
											</span>
											<span className="text-fg-muted">{getRoleLabel(fill)}</span>
										</div>
										<dl className="mt-3 grid grid-cols-3 gap-3">
											<div className="min-w-0">
												<dt className="text-2xs text-fg-muted">
													<Trans>Price</Trans>
												</dt>
												<dd className="mt-0.5 truncate text-xs font-semibold tabular-nums text-fg">
													{formatUSD(fill.px)}
												</dd>
											</div>
											<div className="min-w-0">
												<dt className="text-2xs text-fg-muted">
													<Trans>Size</Trans>
												</dt>
												<dd className="mt-0.5 truncate text-xs font-semibold tabular-nums text-fg">
													{formatNumber(fill.sz, markets.getSzDecimals(fill.coin))}
												</dd>
											</div>
											<div className="min-w-0 text-right">
												<dt className="text-2xs text-fg-muted">
													<Trans>PNL</Trans>
												</dt>
												<dd
													className={cn(
														"mt-0.5 truncate text-xs font-semibold tabular-nums",
														closedPnl ? getMarketCloseValueColorClass(closedPnl) : "text-fg-muted",
													)}
												>
													<bdi dir="ltr">
														{closedPnl
															? formatUSD(closedPnl, { signDisplay: "exceptZero" })
															: FALLBACK_VALUE_PLACEHOLDER}
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
								scrollableRegionLabel={t`Trade history`}
								className="min-w-[68rem] table-fixed font-market-close tabular-nums"
							>
								<caption className="sr-only">
									<Trans>Trade history for {shortenAddress(address, 8, 6)}</Trans>
								</caption>
								<colgroup>
									<col className="w-[120px]" />
									<col className="w-[124px]" />
									<col className="w-[92px]" />
									<col className="w-[80px]" />
									<col className="w-[112px]" />
									<col className="w-[112px]" />
									<col className="w-[128px]" />
									<col className="w-[112px]" />
									<col className="w-[196px]" />
								</colgroup>
								<TableHeader>
									<TableRow className="h-9 border-stroke-weak bg-fill-weak/40 hover:bg-fill-weak/40">
										<TableHead scope="col" className="px-5 text-left text-xs font-semibold text-fg-muted">
											<Trans>Asset</Trans>
										</TableHead>
										<TableHead scope="col" className="px-3 text-left text-xs font-semibold text-fg-muted">
											<Trans>Direction</Trans>
										</TableHead>
										<TableHead scope="col" className="px-3 text-left text-xs font-semibold text-fg-muted">
											<Trans>Type</Trans>
										</TableHead>
										<TableHead scope="col" className="px-3 text-left text-xs font-semibold text-fg-muted">
											<Trans>Role</Trans>
										</TableHead>
										<TableHead scope="col" className="px-3 text-right text-xs font-semibold text-fg-muted">
											<Trans>Price</Trans>
										</TableHead>
										<TableHead scope="col" className="px-3 text-right text-xs font-semibold text-fg-muted">
											<Trans>Size</Trans>
										</TableHead>
										<TableHead scope="col" className="px-3 text-right text-xs font-semibold text-fg-muted">
											<Trans>Fee</Trans>
										</TableHead>
										<TableHead scope="col" className="px-3 text-right text-xs font-semibold text-fg-muted">
											<Trans>PNL</Trans>
										</TableHead>
										<TableHead scope="col" className="px-5 text-right text-xs font-semibold text-fg-muted">
											<Trans>Time</Trans>
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{pagination.rows.map((fill) => {
										const closedPnl = getToolbarNonZeroPnl(fill.closedPnl);
										const hasExplorerTransaction = hasUserFillExplorerTransaction(fill);
										return (
											<TableRow key={getUserFillKey(fill)} className="h-12 border-stroke-weak hover:bg-fill-hover">
												<TableCell className="px-5 py-0 font-semibold">
													<AssetBadge
														coin={fill.coin}
														side={fill.side === "B" ? "buy" : "sell"}
														onClick={() => navigateToMarket(fill.coin)}
														aria-label={t`Switch to ${fill.coin} market`}
														className="h-auto min-h-0 border-0 bg-transparent p-0 shadow-none hover:bg-transparent"
														fit
													/>
												</TableCell>
												<TableCell className={cn("px-3 py-0 font-semibold", getDirectionColorClass(fill))}>
													{fill.liquidation ? t`Liquidated` : getDirectionLabel(fill.dir)}
												</TableCell>
												<TableCell className="px-3 py-0 text-fg-muted">{getTypeLabel(fill)}</TableCell>
												<TableCell className="px-3 py-0 text-fg-muted">{getRoleLabel(fill)}</TableCell>
												<TableCell className="px-3 py-0 text-right text-fg">{formatUSD(fill.px)}</TableCell>
												<TableCell className="px-3 py-0 text-right text-fg">
													{formatNumber(fill.sz, markets.getSzDecimals(fill.coin))}
												</TableCell>
												<TableCell className="px-3 py-0 text-right text-fg-muted">
													{formatToken(fill.fee, { symbol: fill.feeToken })}
												</TableCell>
												<TableCell
													className={cn(
														"px-3 py-0 text-right font-semibold",
														closedPnl ? getMarketCloseValueColorClass(closedPnl) : "text-fg-muted",
													)}
												>
													<bdi dir="ltr">
														{closedPnl
															? formatUSD(closedPnl, { signDisplay: "exceptZero" })
															: FALLBACK_VALUE_PLACEHOLDER}
													</bdi>
												</TableCell>
												<TableCell className="px-5 py-0 text-right text-xs text-fg-muted">
													{hasExplorerTransaction ? (
														<a
															className="inline-flex items-center gap-1 hover:text-fg"
															href={getExplorerTxUrl(fill.hash, isTestnet)}
															target="_blank"
															rel="noopener noreferrer"
														>
															<span>{formatDateTimeShort(fill.time)}</span>
															<ArrowSquareOutIcon className="size-3" aria-hidden="true" />
														</a>
													) : (
														formatDateTimeShort(fill.time)
													)}
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
									options={ACCOUNT_HISTORY_PAGE_SIZES.map((pageSize) => ({
										label: String(pageSize),
										value: String(pageSize),
									}))}
									triggerAriaLabel={t`Rows per page`}
									className="w-20"
								/>
								<span className="text-xs tabular-nums text-fg-muted">
									{pagination.startIndex + 1}–{pagination.endIndex} / {filteredFills.length}
								</span>
							</div>
							<Pagination
								currentPage={pagination.currentPage}
								totalPages={pagination.totalPages}
								onPageChange={setRequestedPage}
								variant={isMobile ? "mobile" : "desktop"}
								navigationLabel={t`Trade history pagination`}
								previousPageLabel={t`Previous trade history page`}
								nextPageLabel={t`Next trade history page`}
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
			<div
				className={cn(
					"min-h-dvh bg-grid-container font-sans text-fg",
					!isMobile && "pb-8",
					!isMobile && (isTestnet ? APP_HEADER_PLUS_BANNER_OFFSET_CLASS : APP_HEADER_OFFSET_CLASS),
					isTestnet && "testnet-bg",
				)}
			>
				{isMobile ? (
					<MobileHeader />
				) : (
					<>
						<TestnetBanner />
						<TopNav />
					</>
				)}
				<main className="mx-auto w-full max-w-[1440px] px-4 py-5 min-[1001px]:px-10 min-[1001px]:py-6">
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
								<Trans>Trade history</Trans>
							</h1>
							<p className="mt-1 text-xs text-fg-muted">
								{shortenAddress(address, 8, 6)} · <Trans>Up to {TRADE_HISTORY_SNAPSHOT_LIMIT} most recent fills</Trans>
							</p>
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
						<Trans>The page loads one recent-fill snapshot. Export CSV to request a broader accessible history.</Trans>
					</p>
					<section
						data-testid="trade-history-page"
						data-state={history.status}
						className="overflow-hidden rounded-12 bg-surface shadow-raised"
					>
						{history.status === "ready" && (history.error || history.isOffline) ? (
							<div role="alert" className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning">
								{history.isOffline ? (
									<Trans>You are offline. Previously loaded trade history remains visible.</Trans>
								) : (
									<Trans>Refresh failed. Previously loaded trade history remains visible.</Trans>
								)}
							</div>
						) : null}
						{history.status === "ready" && history.reachedLimit ? (
							<output className="block w-full border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning">
								<Trans>
									This account reached the {TRADE_HISTORY_SNAPSHOT_LIMIT}-fill snapshot limit. Older fills may exist and
									are not included in this page count.
								</Trans>
							</output>
						) : null}
						{content}
					</section>
				</main>
				{!isMobile ? (
					<Suspense fallback={null}>
						<FooterBar />
					</Suspense>
				) : null}
			</div>
			<Suspense fallback={null}>
				<GlobalModals enableLegalGate />
			</Suspense>
		</>
	);
}
