import { Button, Pagination, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowClockwiseIcon, ArrowLeftIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { type ReactNode, Suspense, useMemo, useState } from "react";
import { AssetBadge } from "@/components/trade/components/asset-badge";
import { HistoricalOrderPrice } from "@/components/trade/components/historical-order-price";
import { TopNav } from "@/components/trade/header/top-nav";
import { MobileHeader } from "@/components/trade/mobile/mobile-header";
import { TestnetBanner } from "@/components/trade/testnet-banner";
import { APP_HEADER_OFFSET_CLASS, APP_HEADER_PLUS_BANNER_OFFSET_CLASS } from "@/config/layout";
import { useHistoricalOrdersCsvExport } from "@/hooks/trade/use-history-csv-export";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useOrderDisplayLabels } from "@/hooks/trade/use-order-display-labels";
import { useOrderHistory } from "@/hooks/trade/use-order-history";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { buildCsvRows } from "@/lib/csv";
import { formatDateTime, formatToken, shortenAddress } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { getOrderHistoryStatusCategory, getOrderHistoryTriggerPrice } from "@/lib/trade/order-history";
import {
	DEFAULT_ORDER_HISTORY_PAGE_SIZE,
	filterOrderHistory,
	getOrderHistoryMarkets,
	getOrderHistoryPage,
	getOrderHistoryTypes,
	isOrderHistoryAddress,
	isOrderHistoryPageSize,
	isOrderHistorySideFilter,
	isOrderHistoryStatusFilter,
	matchesOrderHistoryFilters,
	ORDER_HISTORY_API_LIMIT,
	ORDER_HISTORY_PAGE_SIZES,
	type OrderHistoryPageSize,
	type OrderHistorySideFilter,
	type OrderHistoryStatusFilter,
	type OrdinaryOrderHistoryEntry,
} from "@/lib/trade/order-history-page";
import { useIsTestnet } from "@/stores/use-global-settings-store";

const FooterBar = createLazyComponent(() => import("@/components/trade/footer/footer-bar"), "FooterBar");
const GlobalModals = createLazyComponent(() => import("@/components/trade/components/global-modals"), "GlobalModals");
const ORDER_HISTORY_SKELETON_ROWS = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"] as const;
const ALL_ORDER_MARKETS_VALUE = "__all_order_markets__";
const ALL_ORDER_TYPES_VALUE = "__all_order_types__";

interface Props {
	address: string;
}

function getOrderHistoryStatusBadgeClass(status: Exclude<OrderHistoryStatusFilter, "all">): string {
	return status === "filled" || status === "triggered"
		? "bg-success-soft text-success"
		: status === "rejected"
			? "bg-error-soft text-error"
			: "bg-fill-weak text-fg-muted";
}

export function HistoricalOrdersPage({ address }: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const isTestnet = useIsTestnet();
	const markets = useMarkets();
	const navigateToMarket = useMarketNavigation();
	const { getHistoricalOrderStatusLabel, getOrderSideLabel, getOrderTypeLabel } = useOrderDisplayLabels();
	const history = useOrderHistory(address);
	const exportAddress = isOrderHistoryAddress(address) ? address : undefined;
	const [requestedPage, setRequestedPage] = useState(1);
	const [rowsPerPage, setRowsPerPage] = useState<OrderHistoryPageSize>(DEFAULT_ORDER_HISTORY_PAGE_SIZE);
	const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
	const [selectedSide, setSelectedSide] = useState<OrderHistorySideFilter>("all");
	const [selectedType, setSelectedType] = useState<OrdinaryOrderHistoryEntry["type"] | null>(null);
	const [selectedStatus, setSelectedStatus] = useState<OrderHistoryStatusFilter>("all");
	const availableMarkets = useMemo(() => {
		const markets = getOrderHistoryMarkets(history.entries);
		if (selectedMarket && !markets.includes(selectedMarket)) markets.push(selectedMarket);
		return markets.sort();
	}, [history.entries, selectedMarket]);
	const availableTypes = useMemo(() => {
		const types = getOrderHistoryTypes(history.entries);
		if (selectedType && !types.includes(selectedType)) types.push(selectedType);
		return types.sort();
	}, [history.entries, selectedType]);
	const filteredEntries = useMemo(
		() =>
			filterOrderHistory(history.entries, {
				market: selectedMarket,
				side: selectedSide,
				status: selectedStatus,
				type: selectedType,
			}),
		[history.entries, selectedMarket, selectedSide, selectedStatus, selectedType],
	);
	const pagination = getOrderHistoryPage(filteredEntries, requestedPage, rowsPerPage);

	function getStatusFilterLabel(status: Exclude<OrderHistoryStatusFilter, "all">) {
		if (status === "open") return t`Open`;
		if (status === "filled") return t`Filled`;
		if (status === "triggered") return t`Triggered`;
		if (status === "canceled") return t`Canceled`;
		if (status === "rejected") return t`Rejected`;
		return t`Other`;
	}

	function matchesFilters(entry: OrdinaryOrderHistoryEntry) {
		return matchesOrderHistoryFilters(entry, {
			market: selectedMarket,
			side: selectedSide,
			status: selectedStatus,
			type: selectedType,
		});
	}

	const { exportCsv, isExporting } = useHistoricalOrdersCsvExport({
		address: exportAddress,
		filename: "order_history.csv",
		buildRows: (exportEntries) =>
			buildCsvRows(exportEntries.filter(matchesFilters), [
				{
					header: t`Time`,
					getValue: (entry) => formatDateTime(entry.createdAt, { dateStyle: "short", timeStyle: "short" }),
				},
				{ header: t`Asset`, getValue: (entry) => entry.coin },
				{
					header: t`Direction`,
					getValue: (entry) => getOrderSideLabel(entry.side, entry.reduceOnly),
				},
				{ header: t`Type`, getValue: (entry) => getOrderTypeLabel(entry.type) },
				{ header: t`Price`, getValue: (entry) => entry.order.order.limitPx },
				{
					header: t`Trigger Price`,
					getValue: (entry) => getOrderHistoryTriggerPrice(entry) ?? "",
				},
				{
					header: t`Size`,
					getValue: (entry) => formatToken(entry.size, markets.getMarket(entry.coin)?.szDecimals),
				},
				{ header: t`Status`, getValue: (entry) => getHistoricalOrderStatusLabel(entry.order.status) },
				{
					header: t`Updated`,
					getValue: (entry) => formatDateTime(entry.updatedAt, { dateStyle: "short", timeStyle: "short" }),
				},
			]),
	});

	function changeRowsPerPage(value: string | null) {
		if (value === null) return;
		const nextRowsPerPage = Number(value);
		if (!isOrderHistoryPageSize(nextRowsPerPage)) return;
		setRowsPerPage(nextRowsPerPage);
		setRequestedPage(1);
	}

	function changeMarket(value: string | null) {
		setSelectedMarket(value === null || value === ALL_ORDER_MARKETS_VALUE ? null : value);
		setRequestedPage(1);
	}

	function changeSide(value: string | null) {
		if (!isOrderHistorySideFilter(value)) return;
		setSelectedSide(value);
		setRequestedPage(1);
	}

	function changeType(value: string | null) {
		if (value === null || value === ALL_ORDER_TYPES_VALUE) {
			setSelectedType(null);
		} else {
			const nextType = value as OrdinaryOrderHistoryEntry["type"];
			if (!availableTypes.includes(nextType)) return;
			setSelectedType(nextType);
		}
		setRequestedPage(1);
	}

	function changeStatus(value: string | null) {
		if (!isOrderHistoryStatusFilter(value)) return;
		setSelectedStatus(value);
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
					<Trans>Enter a valid 0x account address to view ordinary order history.</Trans>
				</p>
			</div>
		);
	} else if (history.status === "offline") {
		content = (
			<div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
				<output aria-live="polite" className="sr-only">
					<Trans>You are offline. Order history will load when the connection returns.</Trans>
				</output>
				<WarningCircleIcon className="size-9 text-warning" weight="fill" />
				<h2 className="mt-3 text-lg font-bold text-fg">
					<Trans>You are offline</Trans>
				</h2>
				<p className="mt-1 max-w-lg text-xs leading-5 text-fg-muted">
					<Trans>Order history will load automatically when the connection returns.</Trans>
				</p>
			</div>
		);
	} else if (history.status === "loading") {
		content = (
			<div aria-busy="true" className="min-h-80 overflow-hidden">
				<output aria-live="polite" className="sr-only">
					<Trans>Loading order history</Trans>
				</output>
				<div className="h-9 border-b border-stroke-weak bg-fill-weak/40" />
				{ORDER_HISTORY_SKELETON_ROWS.map((key) => (
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
					<Trans>Order history is unavailable</Trans>
				</h2>
				<p className="mt-1 max-w-lg text-xs leading-5 text-fg-muted">
					<Trans>The response could not be verified. No partial order history is shown.</Trans>
				</p>
				<Button className="mt-4" onClick={history.refresh}>
					<Trans>Retry</Trans>
				</Button>
			</div>
		);
	} else if (history.entries.length === 0) {
		content = (
			<div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
				<output aria-live="polite" className="sr-only">
					<Trans>No ordinary orders found.</Trans>
				</output>
				<h2 className="text-lg font-bold text-fg">
					<Trans>No order history found</Trans>
				</h2>
				<p className="mt-1 max-w-lg text-xs leading-5 text-fg-muted">
					<Trans>The account has no ordinary orders in the available history.</Trans>
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
						value={selectedMarket ?? ALL_ORDER_MARKETS_VALUE}
						onValueChange={changeMarket}
						options={[
							{ label: t`All markets`, value: ALL_ORDER_MARKETS_VALUE },
							...availableMarkets.map((market) => ({ label: market, value: market })),
						]}
						triggerAriaLabel={t`Filter order history by market`}
						className="w-44"
					/>
					<Select
						size="sm"
						label={t`Direction`}
						value={selectedSide}
						onValueChange={changeSide}
						options={[
							{ label: t`All directions`, value: "all" },
							{ label: t`Buy`, value: "buy" },
							{ label: t`Sell`, value: "sell" },
						]}
						triggerAriaLabel={t`Filter order history by direction`}
						className="w-36"
					/>
					<Select
						size="sm"
						label={t`Type`}
						value={selectedType ?? ALL_ORDER_TYPES_VALUE}
						onValueChange={changeType}
						options={[
							{ label: t`All types`, value: ALL_ORDER_TYPES_VALUE },
							...availableTypes.map((type) => ({ label: getOrderTypeLabel(type), value: type })),
						]}
						triggerAriaLabel={t`Filter order history by type`}
						className="w-44"
					/>
					<Select
						size="sm"
						label={t`Status`}
						value={selectedStatus}
						onValueChange={changeStatus}
						options={[
							{ label: t`All statuses`, value: "all" },
							...(["open", "filled", "triggered", "canceled", "rejected", "other"] as const).map((status) => ({
								label: getStatusFilterLabel(status),
								value: status,
							})),
						]}
						triggerAriaLabel={t`Filter order history by status`}
						className="w-40"
					/>
				</div>
				{filteredEntries.length === 0 ? (
					<div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
						<output aria-live="polite" className="sr-only">
							<Trans>No orders match the selected filters.</Trans>
						</output>
						<h2 className="text-base font-bold text-fg">
							<Trans>No matching orders</Trans>
						</h2>
						<p className="mt-1 text-xs text-fg-muted">
							<Trans>Choose different market, direction, type, or status filters.</Trans>
						</p>
					</div>
				) : (
					<>
						<div className="divide-y divide-stroke-weak min-[1001px]:hidden">
							{pagination.rows.map((entry) => {
								const market = markets.getMarket(entry.coin);
								const status = getOrderHistoryStatusCategory(entry);
								return (
									<article key={entry.key} className="px-4 py-3">
										<div className="flex min-w-0 items-center justify-between gap-3">
											<AssetBadge
												coin={entry.coin}
												side={entry.side === "B" ? "buy" : "sell"}
												onClick={() => navigateToMarket(entry.coin)}
												aria-label={t`Switch to ${entry.coin} market`}
												className="h-auto min-h-0 border-0 bg-transparent p-0 shadow-none hover:bg-transparent"
												fit
											/>
											<time className="shrink-0 text-xs tabular-nums text-fg-muted">
												{formatDateTime(entry.createdAt, { dateStyle: "short", timeStyle: "short" })}
											</time>
										</div>
										<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
											<div>
												<dt className="text-2xs text-fg-muted">
													<Trans>Direction</Trans>
												</dt>
												<dd className="mt-0.5 text-xs font-semibold text-fg">
													{getOrderSideLabel(entry.side, entry.reduceOnly)}
												</dd>
											</div>
											<div className="text-right">
												<dt className="text-2xs text-fg-muted">
													<Trans>Type</Trans>
												</dt>
												<dd className="mt-0.5 text-xs font-semibold text-fg">{getOrderTypeLabel(entry.type)}</dd>
											</div>
											<div>
												<dt className="text-2xs text-fg-muted">
													<Trans>Price</Trans>
												</dt>
												<dd className="mt-0.5 text-xs font-semibold tabular-nums text-fg">
													<HistoricalOrderPrice align="start" order={entry.order.order} />
												</dd>
											</div>
											<div className="text-right">
												<dt className="text-2xs text-fg-muted">
													<Trans>Size</Trans>
												</dt>
												<dd className="mt-0.5 text-xs font-semibold tabular-nums text-fg">
													<bdi dir="ltr">{formatToken(entry.size, market?.szDecimals)}</bdi>
												</dd>
											</div>
											<div>
												<dt className="text-2xs text-fg-muted">
													<Trans>Status</Trans>
												</dt>
												<dd
													className={cn(
														"mt-0.5 inline-flex rounded-4 px-2 py-0.5 text-2xs font-semibold",
														getOrderHistoryStatusBadgeClass(status),
													)}
												>
													{getHistoricalOrderStatusLabel(entry.order.status)}
												</dd>
											</div>
											<div className="text-right">
												<dt className="text-2xs text-fg-muted">
													<Trans>Updated</Trans>
												</dt>
												<dd className="mt-0.5 text-xs tabular-nums text-fg-muted">
													{formatDateTime(entry.updatedAt, { dateStyle: "short", timeStyle: "short" })}
												</dd>
											</div>
										</dl>
									</article>
								);
							})}
						</div>
						<div className="hidden overflow-x-auto min-[1001px]:block">
							<Table
								scrollableRegionLabel={t`Order history`}
								className="min-w-[72rem] table-fixed font-market-close tabular-nums"
							>
								<caption className="sr-only">
									<Trans>
										Ordinary order history for <bdi dir="ltr">{shortenAddress(address, 8, 6)}</bdi>
									</Trans>
								</caption>
								<colgroup>
									<col className="w-[180px]" />
									<col className="w-[120px]" />
									<col className="w-[120px]" />
									<col className="w-[160px]" />
									<col className="w-[160px]" />
									<col className="w-[140px]" />
									<col className="w-[130px]" />
									<col className="w-[180px]" />
								</colgroup>
								<TableHeader>
									<TableRow className="h-9 border-stroke-weak bg-fill-weak/40 hover:bg-fill-weak/40">
										<TableHead scope="col" className="px-5 text-start text-xs font-semibold text-fg-muted">
											<Trans>Time</Trans>
										</TableHead>
										<TableHead scope="col" className="px-3 text-start text-xs font-semibold text-fg-muted">
											<Trans>Asset</Trans>
										</TableHead>
										<TableHead scope="col" className="px-3 text-start text-xs font-semibold text-fg-muted">
											<Trans>Direction</Trans>
										</TableHead>
										<TableHead scope="col" className="px-3 text-start text-xs font-semibold text-fg-muted">
											<Trans>Type</Trans>
										</TableHead>
										<TableHead scope="col" className="px-3 text-right text-xs font-semibold text-fg-muted">
											<Trans>Price</Trans>
										</TableHead>
										<TableHead scope="col" className="px-3 text-right text-xs font-semibold text-fg-muted">
											<Trans>Size</Trans>
										</TableHead>
										<TableHead scope="col" className="px-3 text-start text-xs font-semibold text-fg-muted">
											<Trans>Status</Trans>
										</TableHead>
										<TableHead scope="col" className="px-5 text-right text-xs font-semibold text-fg-muted">
											<Trans>Updated</Trans>
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{pagination.rows.map((entry) => {
										const market = markets.getMarket(entry.coin);
										const status = getOrderHistoryStatusCategory(entry);
										return (
											<TableRow key={entry.key} className="h-12 border-stroke-weak hover:bg-fill-hover">
												<TableCell className="px-5 py-0 text-xs text-fg-muted">
													{formatDateTime(entry.createdAt, { dateStyle: "short", timeStyle: "short" })}
												</TableCell>
												<TableCell className="px-3 py-0 font-semibold">
													<AssetBadge
														coin={entry.coin}
														side={entry.side === "B" ? "buy" : "sell"}
														onClick={() => navigateToMarket(entry.coin)}
														aria-label={t`Switch to ${entry.coin} market`}
														className="h-auto min-h-0 border-0 bg-transparent p-0 shadow-none hover:bg-transparent"
														fit
													/>
												</TableCell>
												<TableCell className="px-3 py-0 text-fg">
													{getOrderSideLabel(entry.side, entry.reduceOnly)}
												</TableCell>
												<TableCell className="px-3 py-0 text-fg">{getOrderTypeLabel(entry.type)}</TableCell>
												<TableCell className="px-3 py-0 text-right text-fg">
													<HistoricalOrderPrice order={entry.order.order} />
												</TableCell>
												<TableCell className="px-3 py-0 text-right text-fg">
													<bdi dir="ltr">{formatToken(entry.size, market?.szDecimals)}</bdi>
												</TableCell>
												<TableCell className="px-3 py-0">
													<span
														className={cn(
															"inline-flex rounded-4 px-2 py-0.5 text-2xs font-semibold",
															getOrderHistoryStatusBadgeClass(status),
														)}
													>
														{getHistoricalOrderStatusLabel(entry.order.status)}
													</span>
												</TableCell>
												<TableCell className="px-5 py-0 text-right text-xs text-fg-muted">
													{formatDateTime(entry.updatedAt, { dateStyle: "short", timeStyle: "short" })}
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
									options={ORDER_HISTORY_PAGE_SIZES.map((pageSize) => ({
										label: String(pageSize),
										value: String(pageSize),
									}))}
									triggerAriaLabel={t`Rows per page`}
									className="w-20"
								/>
								<span className="text-xs tabular-nums text-fg-muted">
									{pagination.startIndex + 1}–{pagination.endIndex} / {filteredEntries.length}
								</span>
							</div>
							<Pagination
								currentPage={pagination.currentPage}
								totalPages={pagination.totalPages}
								onPageChange={setRequestedPage}
								variant={isMobile ? "mobile" : "desktop"}
								navigationLabel={t`Order history pagination`}
								previousPageLabel={t`Previous order history page`}
								nextPageLabel={t`Next order history page`}
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
								<Trans>Order history</Trans>
							</h1>
							<p className="mt-1 text-xs text-fg-muted">
								<bdi dir="ltr">{shortenAddress(address, 8, 6)}</bdi> ·{" "}
								<Trans>Up to {ORDER_HISTORY_API_LIMIT} most recent ordinary orders</Trans>
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
						<Trans>
							Hyperliquid returns at most the most recent {ORDER_HISTORY_API_LIMIT} ordinary orders. TWAP history is
							separate and is not included.
						</Trans>
					</p>
					<section
						data-testid="historical-orders-page"
						data-state={history.status}
						className="overflow-hidden rounded-12 bg-surface shadow-raised"
					>
						{history.status === "ready" && (history.error || history.isOffline) ? (
							<div role="alert" className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning">
								{history.isOffline ? (
									<Trans>You are offline. Previously loaded order history remains visible.</Trans>
								) : (
									<Trans>Refresh failed. Previously loaded order history remains visible.</Trans>
								)}
							</div>
						) : null}
						{history.status === "ready" && history.reachedLimit ? (
							<output className="block border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning">
								<Trans>
									This account reached the {ORDER_HISTORY_API_LIMIT}-order API limit. Older orders are not available
									from this endpoint.
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
