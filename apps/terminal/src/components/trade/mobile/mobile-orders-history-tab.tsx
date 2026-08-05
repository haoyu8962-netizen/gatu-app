import { Select } from "@gatu/ui";
import { Plural, useLingui } from "@lingui/react/macro";
import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import { Skeleton } from "boneyard-js/react";
import { useState } from "react";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { isCanceledOrderStatus } from "@/domain/trade/order-tracking";
import { matchesToolbarOrderFilters, type ToolbarOrderDirectionFilter } from "@/domain/trade/trading-toolbar-metrics";
import { useHistoricalOrders } from "@/hooks/trade/use-historical-orders";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useOrderDisplayLabels } from "@/hooks/trade/use-order-display-labels";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { buildCsvRows, downloadCsv } from "@/lib/csv";
import { formatDateTime, formatToken, formatUSD } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
import { HistoricalOrderPrice } from "../components/historical-order-price";
import { MobileDisclosureHeader } from "./mobile-disclosure-header";
import type { MobileDataScrollMode } from "./mobile-positions-view";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

type HistoricalOrderStatus = HistoricalOrdersResponse[number]["status"];
type HistoricalOrderType = HistoricalOrdersResponse[number]["order"]["orderType"];
type OrderHistoryTypeFilter = "all" | HistoricalOrderType;
type OrderHistoryStatusFilter = "all" | "open" | "filled" | "triggered" | "canceled" | "rejected" | "other";

const filterTriggerClassName =
	"relative h-[27px] min-h-0 !rounded-[7px] border-market-close-stroke-card bg-modal text-xs leading-4 text-market-close-muted after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] focus-visible:border-market-close-control focus-visible:outline-none active:not-data-disabled:scale-100 data-popup-open:border-market-close-control data-popup-open:text-market-close-fg";
const filterActionClassName =
	"relative inline-flex h-[27px] min-h-0 items-center whitespace-nowrap text-xs after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-market-close-control active:scale-100";
const footerActionClassName =
	"relative inline-flex h-[38px] min-h-0 items-center text-xs text-market-close-muted transition-colors duration-[120ms] after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] active:text-market-close-fg focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:text-market-close-subtle";

function getOrderHistoryStatusFilter(status: HistoricalOrderStatus): Exclude<OrderHistoryStatusFilter, "all"> {
	if (isCanceledOrderStatus(status)) return "canceled";
	if (status === "open" || status === "filled" || status === "triggered") return status;
	if (status === "rejected" || status.endsWith("Rejected")) return "rejected";
	return "other";
}

function isOrderHistoryStatusFilter(value: string | null): value is OrderHistoryStatusFilter {
	return (
		value === "all" ||
		value === "open" ||
		value === "filled" ||
		value === "triggered" ||
		value === "canceled" ||
		value === "rejected" ||
		value === "other"
	);
}

function isOrderHistoryDirectionFilter(value: string | null): value is ToolbarOrderDirectionFilter {
	return value === "all" || value === "buy" || value === "sell";
}

function isHistoricalOrderType(value: string | null, orders: HistoricalOrdersResponse): value is HistoricalOrderType {
	return value !== null && orders.some((entry) => entry.order.orderType === value);
}

function hasTriggerPrice(order: HistoricalOrdersResponse[number]["order"]): boolean {
	return order.isTrigger || order.orderType.startsWith("Stop ") || order.orderType.startsWith("Take Profit ");
}

interface Props {
	className?: string;
	scrollMode?: MobileDataScrollMode;
}

export function MobileOrdersHistoryTab(props: Props) {
	const { address, isConnected } = useWalletSession();
	const ownerKey = isConnected && address ? address.toLowerCase() : "disconnected";

	return <MobileOrdersHistoryTabContent key={ownerKey} {...props} />;
}

function MobileOrdersHistoryTabContent({ className, scrollMode = "contained" }: Props) {
	const { t } = useLingui();
	const { getHistoricalOrderStatusLabel, getOrderSideLabel, getOrderTypeLabel } = useOrderDisplayLabels();
	const { error, isConnected, orders, status } = useHistoricalOrders();
	const navigateToMarket = useMarketNavigation();
	const { setActiveTab } = useMobileTerminalTab();
	const markets = useMarkets();
	const [expandedByKey, setExpandedByKey] = useState<Record<string, boolean>>({});
	const [typeFilter, setTypeFilter] = useState<OrderHistoryTypeFilter>("all");
	const [directionFilter, setDirectionFilter] = useState<ToolbarOrderDirectionFilter>("all");
	const [statusFilter, setStatusFilter] = useState<OrderHistoryStatusFilter>("all");

	const filteredOrders = orders.filter(
		(entry) =>
			(typeFilter === "all" || entry.order.orderType === typeFilter) &&
			matchesToolbarOrderFilters(entry.order, "all", directionFilter) &&
			(statusFilter === "all" || getOrderHistoryStatusFilter(entry.status) === statusFilter),
	);
	const availableTypeFilters = new Set<HistoricalOrderType>(orders.map((entry) => entry.order.orderType));
	if (typeFilter !== "all") availableTypeFilters.add(typeFilter);
	const typeOptions = [
		{ value: "all", label: t`All types` },
		...Array.from(availableTypeFilters).map((value) => ({
			value,
			label: getOrderTypeLabel(value),
		})),
	];
	const availableStatusFilters = new Set(orders.map((entry) => getOrderHistoryStatusFilter(entry.status)));
	if (statusFilter !== "all") availableStatusFilters.add(statusFilter);
	const statusOptions = [
		{ value: "all", label: t`All statuses` },
		...(["open", "filled", "triggered", "canceled", "rejected", "other"] as const)
			.filter((value) => availableStatusFilters.has(value))
			.map((value) => ({ value, label: getStatusFilterLabel(value) })),
	];

	const headerCount = isConnected ? (
		<Plural value={filteredOrders.length} one="# order" other="# orders" />
	) : (
		FALLBACK_VALUE_PLACEHOLDER
	);
	const isPageScroll = scrollMode === "page";

	function handleSelectMarket(name: string) {
		navigateToMarket(name, undefined, { displayedContent: "trade" });
		setActiveTab("trade");
	}

	function handleSetAllExpanded(expanded: boolean) {
		setExpandedByKey(
			Object.fromEntries(filteredOrders.map((entry) => [`${entry.order.oid}-${entry.statusTimestamp}`, expanded])),
		);
	}

	function getStatusFilterLabel(filter: Exclude<OrderHistoryStatusFilter, "all">) {
		if (filter === "open") return t`Open`;
		if (filter === "filled") return t`Filled`;
		if (filter === "triggered") return t`Triggered`;
		if (filter === "canceled") return t`Canceled`;
		if (filter === "rejected") return t`Rejected`;
		return t`Other`;
	}

	function handleExportCsv() {
		downloadCsv(
			"order_history.csv",
			buildCsvRows(filteredOrders, [
				{
					header: t`Time`,
					getValue: (entry) => formatDateTime(entry.order.timestamp, { dateStyle: "short", timeStyle: "short" }),
				},
				{ header: t`Asset`, getValue: (entry) => entry.order.coin },
				{
					header: t`Direction`,
					getValue: (entry) => getOrderSideLabel(entry.order.side, entry.order.reduceOnly),
				},
				{ header: t`Type`, getValue: (entry) => getOrderTypeLabel(entry.order.orderType) },
				{ header: t`Price`, getValue: (entry) => formatUSD(entry.order.limitPx, { compact: false }) },
				{
					header: t`Trigger Price`,
					getValue: (entry) =>
						hasTriggerPrice(entry.order)
							? formatUSD(entry.order.triggerPx, { compact: false })
							: FALLBACK_VALUE_PLACEHOLDER,
				},
				{
					header: t`Size`,
					getValue: (entry) => formatToken(entry.order.origSz, markets.getMarket(entry.order.coin)?.szDecimals),
				},
				{ header: t`Status`, getValue: (entry) => getHistoricalOrderStatusLabel(entry.status) },
				{
					header: t`Updated`,
					getValue: (entry) => formatDateTime(entry.statusTimestamp, { dateStyle: "short", timeStyle: "short" }),
				},
			]),
		);
	}

	if (!isConnected) {
		return (
			<div className="flex flex-1 items-center justify-center p-6 text-sm text-market-close-muted">
				{t`Connect your wallet to view order history.`}
			</div>
		);
	}

	if (status === "error") {
		return (
			<div className="flex flex-1 flex-col items-center justify-center p-6 text-sm text-market-close-danger">
				<span>{t`Failed to load order history.`}</span>
				{error instanceof Error && <span className="mt-1 text-xs text-market-close-muted">{error.message}</span>}
			</div>
		);
	}

	if (status === "ready" && orders.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center p-6 text-sm text-market-close-muted">
				{t`No order history found.`}
			</div>
		);
	}

	return (
		<Skeleton name="orders-history-tab" loading={status === "loading" || status === "idle"}>
			<div className={cn("font-market-close min-h-0 flex flex-col", isPageScroll ? "min-h-0" : "flex-1", className)}>
				<div
					data-testid="mobile-order-history-filter-row"
					className="flex h-12 shrink-0 items-center overflow-x-auto border-b border-market-close-stroke-card px-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				>
					<span className="sr-only" aria-live="polite">
						{headerCount}
					</span>
					<div className="flex shrink-0 items-center gap-1.5">
						<Select
							size="xxs"
							label={t`Order type`}
							value={typeFilter}
							onValueChange={(value) => {
								if (value === "all") setTypeFilter("all");
								else if (isHistoricalOrderType(value, orders)) setTypeFilter(value);
							}}
							options={typeOptions}
							className="w-24 shrink-0 [&>label]:sr-only"
							triggerClassName={filterTriggerClassName}
						/>
						<Select
							size="xxs"
							label={t`Direction`}
							value={directionFilter}
							onValueChange={(value) => {
								if (isOrderHistoryDirectionFilter(value)) setDirectionFilter(value);
							}}
							options={[
								{ value: "all", label: t`All Directions` },
								{ value: "buy", label: t`Buy` },
								{ value: "sell", label: t`Sell` },
							]}
							className="w-24 shrink-0 [&>label]:sr-only"
							triggerClassName={filterTriggerClassName}
						/>
						<Select
							size="xxs"
							label={t`Order status`}
							value={statusFilter}
							onValueChange={(value) => {
								if (isOrderHistoryStatusFilter(value)) setStatusFilter(value);
							}}
							options={statusOptions}
							className="w-24 shrink-0 [&>label]:sr-only"
							triggerClassName={filterTriggerClassName}
						/>
					</div>
					<div className="ml-auto flex shrink-0 items-center gap-3 pl-3">
						<button
							type="button"
							onClick={() => handleSetAllExpanded(true)}
							className={cn(filterActionClassName, "font-semibold text-market-close-fg")}
						>
							{t`Expand all`}
						</button>
						<button
							type="button"
							onClick={() => handleSetAllExpanded(false)}
							className={cn(filterActionClassName, "text-market-close-muted")}
						>
							{t`Collapse all`}
						</button>
					</div>
				</div>
				<div className={cn("min-h-0", !isPageScroll && "flex-1 overflow-y-auto overscroll-y-contain")}>
					<div className="flex flex-col gap-2.5 px-3.5 pt-3">
						{filteredOrders.length === 0 ? (
							<div className="flex min-h-28 items-center justify-center text-center text-sm text-market-close-muted">
								{t`No orders match these filters.`}
							</div>
						) : null}
						{filteredOrders.map((entry, index) => {
							const { order } = entry;
							const marketName = order.coin;
							const cardKey = `${order.oid}-${entry.statusTimestamp}`;
							const detailsId = `mobile-order-history-${order.oid}-${entry.statusTimestamp}`;
							const isExpanded = expandedByKey[cardKey] ?? index === 0;
							const market = markets.getMarket(order.coin);
							const isBuy = order.side === "B";
							const orderTypeLabel = getOrderTypeLabel(order.orderType);
							const sideLabel = getOrderSideLabel(order.side, order.reduceOnly);

							function handleToggle() {
								setExpandedByKey((current) => ({ ...current, [cardKey]: !isExpanded }));
							}

							return (
								<article
									key={cardKey}
									className="overflow-hidden rounded-[14px] border border-market-close-stroke-card bg-modal"
								>
									<MobileDisclosureHeader
										expanded={isExpanded}
										label={
											isExpanded ? t`Collapse ${marketName} history details` : t`Expand ${marketName} history details`
										}
										controls={detailsId}
										onToggle={handleToggle}
										className="h-[54px] grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_16px] gap-2.5 px-3.5"
									>
										<button
											type="button"
											onClick={() => handleSelectMarket(marketName)}
											aria-label={t`Switch to ${marketName} market, ${sideLabel} order`}
											className="pointer-events-auto relative z-10 flex min-h-11 min-w-0 flex-col justify-center text-left focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-market-close-control"
										>
											<span className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Market`}</span>
											<span className="truncate text-xs font-bold leading-[17px] text-market-close-fg">
												{marketName}
											</span>
										</button>
										<div className="min-w-0">
											<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Time`}</div>
											<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
												{formatDateTime(order.timestamp, { dateStyle: "short", timeStyle: "short" })}
											</div>
										</div>
										<div className="min-w-0">
											<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Type`}</div>
											<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg">
												{orderTypeLabel}
											</div>
										</div>
									</MobileDisclosureHeader>

									{isExpanded ? (
										<div id={detailsId} className="flex flex-col gap-2.5 px-3.5 py-3">
											<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-x-2.5 gap-y-3">
												<div className="min-w-0">
													<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">
														{t`Direction`}
													</div>
													<div
														className={cn(
															"truncate whitespace-nowrap text-xs font-semibold leading-[17px]",
															isBuy ? "text-market-close-success" : "text-market-close-danger",
														)}
													>
														{sideLabel}
													</div>
												</div>
												<div className="min-w-0">
													<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Price`}</div>
													<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
														<HistoricalOrderPrice align="start" order={order} />
													</div>
												</div>
												<div className="min-w-0">
													<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Size`}</div>
													<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
														{formatToken(order.origSz, market?.szDecimals)}
													</div>
												</div>
												<div className="min-w-0">
													<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Status`}</div>
													<div
														className={cn(
															"inline-flex max-w-full truncate rounded-[4px] px-[7px] py-0.5 text-[10px] font-bold",
															entry.status === "filled"
																? "bg-success-soft text-success"
																: isCanceledOrderStatus(entry.status)
																	? "bg-error-soft text-error"
																	: "bg-market-close-hover text-market-close-muted",
														)}
													>
														{getHistoricalOrderStatusLabel(entry.status)}
													</div>
												</div>
												<div className="col-span-2 min-w-0">
													<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Updated`}</div>
													<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
														{formatDateTime(entry.statusTimestamp, { dateStyle: "short", timeStyle: "short" })}
													</div>
												</div>
											</div>
											<div className="flex min-h-11 items-center justify-end border-t border-market-close-stroke-card">
												<button
													type="button"
													aria-label={t`Collapse ${marketName} history details`}
													aria-controls={detailsId}
													onClick={handleToggle}
													className="-mr-3.5 inline-flex size-11 shrink-0 items-center justify-center rounded-xs text-market-close-subtle focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-market-close-control"
												>
													<svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
														<path
															d="M3.5 10 8 5.5l4.5 4.5"
															stroke="currentColor"
															strokeWidth="2"
															strokeLinecap="round"
															strokeLinejoin="round"
														/>
													</svg>
												</button>
											</div>
										</div>
									) : null}
								</article>
							);
						})}
					</div>
					<div className="flex h-[38px] shrink-0 items-center gap-4 px-3.5" data-testid="mobile-order-history-footer">
						<button
							type="button"
							disabled={filteredOrders.length === 0}
							onClick={handleExportCsv}
							className={footerActionClassName}
						>
							{t`Export CSV`}
						</button>
					</div>
				</div>
			</div>
		</Skeleton>
	);
}
