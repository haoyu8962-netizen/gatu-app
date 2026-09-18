import { Select } from "@gatu/ui";
import { Plural, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { MOBILE_FILTER_CHIP_CLASS } from "@/components/trade/mobile/mobile-filter-chip";
import { DataPendingState } from "@/components/ui/data-pending-state";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { RECENT_ACCOUNT_HISTORY_ROWS } from "@/config/trade";
import type { ToolbarOrderDirectionFilter } from "@/domain/trade/trading-toolbar-metrics";
import { useHistoricalOrders } from "@/hooks/trade/use-historical-orders";
import { useHistoricalOrdersCsvExport } from "@/hooks/trade/use-history-csv-export";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useOrderDisplayLabels } from "@/hooks/trade/use-order-display-labels";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { buildCsvRows } from "@/lib/csv";
import { formatDateTime, formatToken, formatUSD } from "@/lib/format";
import { useHyperliquid, useMarkets } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import {
	getOrderHistoryStatusCategory,
	getOrderHistoryTriggerPrice,
	type OrderHistoryStatusCategory,
	type OrdinaryOrderHistoryEntry,
} from "@/lib/trade/order-history";
import { HistoricalOrderPrice } from "../components/historical-order-price";
import { MobileBulkDisclosureActions } from "./mobile-bulk-disclosure-actions";
import { MobileDisclosureHeader } from "./mobile-disclosure-header";
import type { MobileDataScrollMode } from "./mobile-positions-view";
import { MobileProgressiveList } from "./mobile-progressive-list";
import { type MobileDisclosureSetState, useMobileDisclosureSet } from "./use-mobile-disclosure-set";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

type OrderHistoryType = OrdinaryOrderHistoryEntry["type"];
type OrderHistoryTypeFilter = "all" | OrderHistoryType;
type OrderHistoryStatusFilter = "all" | OrderHistoryStatusCategory;

const filterTriggerClassName = MOBILE_FILTER_CHIP_CLASS;
const footerActionClassName =
	"relative inline-flex h-[38px] min-h-0 items-center text-xs text-market-close-muted transition-colors duration-[120ms] after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] active:text-market-close-fg focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus disabled:cursor-not-allowed disabled:text-market-close-subtle";

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

function isOrderHistoryType(
	value: string | null,
	availableTypes: ReadonlySet<OrderHistoryType>,
): value is OrderHistoryType {
	return value !== null && availableTypes.has(value as OrderHistoryType);
}

function getOrderHistoryDisclosureKey(entry: OrdinaryOrderHistoryEntry): string {
	return String(entry.order.order.oid);
}

interface Props {
	className?: string;
	disclosureState?: MobileDisclosureSetState;
	scrollMode?: MobileDataScrollMode;
}

export function MobileOrdersHistoryTab(props: Props) {
	const { address, isConnected } = useWalletSession();
	const { env } = useHyperliquid();
	const ownerKey = isConnected && address ? address.toLowerCase() : "disconnected";

	return (
		<MobileOrdersHistoryTabContent
			key={ownerKey}
			address={address}
			disclosureIdentity={`${env}:${ownerKey}`}
			{...props}
		/>
	);
}

interface MobileOrdersHistoryTabContentProps extends Props {
	address?: `0x${string}`;
	disclosureIdentity: string;
}

function MobileOrdersHistoryTabContent({
	address,
	className,
	disclosureIdentity,
	disclosureState,
	scrollMode = "contained",
}: MobileOrdersHistoryTabContentProps) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const { getHistoricalOrderStatusLabel, getOrderSideLabel, getOrderTypeLabel } = useOrderDisplayLabels();
	const { entries, error, isConnected, isOffline, isStale, status } = useHistoricalOrders();
	const navigateToMarket = useMarketNavigation();
	const { setActiveTab } = useMobileTerminalTab();
	const markets = useMarkets();
	const [typeFilter, setTypeFilter] = useState<OrderHistoryTypeFilter>("all");
	const [directionFilter, setDirectionFilter] = useState<ToolbarOrderDirectionFilter>("all");
	const [statusFilter, setStatusFilter] = useState<OrderHistoryStatusFilter>("all");

	const filteredEntries = entries
		.filter(
			(entry) =>
				(typeFilter === "all" || entry.type === typeFilter) &&
				(directionFilter === "all" || (directionFilter === "buy") === (entry.side === "B")) &&
				(statusFilter === "all" || getOrderHistoryStatusCategory(entry) === statusFilter),
		)
		.slice(0, RECENT_ACCOUNT_HISTORY_ROWS);
	const filteredOrderKeys = filteredEntries.map(getOrderHistoryDisclosureKey);
	const disclosure = useMobileDisclosureSet(disclosureIdentity, filteredOrderKeys, disclosureState);
	const { expandedKeys, setExpanded } = disclosure;
	const availableTypeFilters = new Set(entries.map((entry) => entry.type));
	if (typeFilter !== "all") availableTypeFilters.add(typeFilter);
	const typeOptions = [
		{ value: "all", label: t`Type` },
		...Array.from(availableTypeFilters).map((value) => ({
			value,
			label: getOrderTypeLabel(value),
		})),
	];
	const availableStatusFilters = new Set(entries.map(getOrderHistoryStatusCategory));
	if (statusFilter !== "all") availableStatusFilters.add(statusFilter);
	const statusOptions = [
		{ value: "all", label: t`Status` },
		...(["open", "filled", "triggered", "canceled", "rejected", "other"] as const)
			.filter((value) => availableStatusFilters.has(value))
			.map((value) => ({ value, label: getStatusFilterLabel(value) })),
	];

	const headerCount = isConnected ? (
		<Plural value={filteredEntries.length} one="# order" other="# orders" />
	) : (
		FALLBACK_VALUE_PLACEHOLDER
	);
	const isPageScroll = scrollMode === "page";

	function handleSelectMarket(name: string) {
		navigateToMarket(name, undefined, { displayedContent: "trade" });
		setActiveTab("trade");
	}

	function getStatusFilterLabel(filter: Exclude<OrderHistoryStatusFilter, "all">) {
		if (filter === "open") return t`Open`;
		if (filter === "filled") return t`Filled`;
		if (filter === "triggered") return t`Triggered`;
		if (filter === "canceled") return t`Canceled`;
		if (filter === "rejected") return t`Rejected`;
		return t`Other`;
	}

	function getEntryTypeLabel(entry: OrdinaryOrderHistoryEntry) {
		return getOrderTypeLabel(entry.type);
	}

	function getEntryStatusLabel(entry: OrdinaryOrderHistoryEntry) {
		return getHistoricalOrderStatusLabel(entry.order.status);
	}

	const { exportCsv, isExporting } = useHistoricalOrdersCsvExport({
		filename: "order_history.csv",
		buildRows: (exportOrders) =>
			buildCsvRows(
				exportOrders.filter(
					(entry) =>
						(typeFilter === "all" || entry.type === typeFilter) &&
						(directionFilter === "all" || (directionFilter === "buy") === (entry.side === "B")) &&
						(statusFilter === "all" || getOrderHistoryStatusCategory(entry) === statusFilter),
				),
				[
					{
						header: t`Time`,
						getValue: (entry) => formatDateTime(entry.createdAt, { dateStyle: "short", timeStyle: "short" }),
					},
					{ header: t`Asset`, getValue: (entry) => entry.coin },
					{
						header: t`Direction`,
						getValue: (entry) => getOrderSideLabel(entry.side, entry.reduceOnly),
					},
					{ header: t`Type`, getValue: getEntryTypeLabel },
					{
						header: t`Price`,
						getValue: (entry) => formatUSD(entry.order.order.limitPx, { compact: false }),
					},
					{
						header: t`Trigger Price`,
						getValue: (entry) => {
							const triggerPrice = getOrderHistoryTriggerPrice(entry);
							return triggerPrice ? formatUSD(triggerPrice, { compact: false }) : FALLBACK_VALUE_PLACEHOLDER;
						},
					},
					{
						header: t`Size`,
						getValue: (entry) => formatToken(entry.size, markets.getMarket(entry.coin)?.szDecimals),
					},
					{ header: t`Status`, getValue: getEntryStatusLabel },
					{
						header: t`Updated`,
						getValue: (entry) => formatDateTime(entry.updatedAt, { dateStyle: "short", timeStyle: "short" }),
					},
				],
			),
	});
	const exportFooter = (
		<div className="flex h-[38px] shrink-0 items-center gap-4 px-3.5" data-testid="mobile-order-history-footer">
			{address ? (
				<Link to="/historicalOrders/$address" params={{ address }} className={footerActionClassName}>
					{t`View all`}
				</Link>
			) : null}
			<button type="button" disabled={isExporting} onClick={() => void exportCsv()} className={footerActionClassName}>
				{t`Export CSV`}
			</button>
		</div>
	);

	function renderFilterRow(disabled: boolean) {
		return (
			<div
				data-testid="mobile-order-history-filter-row"
				className="flex h-9 shrink-0 items-center overflow-x-auto border-b border-market-close-stroke-card px-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				<span className="sr-only" aria-live="polite">
					{headerCount}
				</span>
				<div className="flex shrink-0 items-center gap-1.5">
					<Select
						disabled={disabled}
						size="xxs"
						label={t`Order type`}
						value={typeFilter}
						onValueChange={(value) => {
							if (value === "all") setTypeFilter("all");
							else if (isOrderHistoryType(value, availableTypeFilters)) setTypeFilter(value);
						}}
						options={typeOptions}
						className="w-auto shrink-0 [&>label]:sr-only"
						triggerClassName={filterTriggerClassName}
					/>
					<Select
						disabled={disabled}
						size="xxs"
						label={t`Direction`}
						value={directionFilter}
						onValueChange={(value) => {
							if (isOrderHistoryDirectionFilter(value)) setDirectionFilter(value);
						}}
						options={[
							{ value: "all", label: t`Direction` },
							{ value: "buy", label: t`Buy` },
							{ value: "sell", label: t`Sell` },
						]}
						className="w-auto shrink-0 [&>label]:sr-only"
						triggerClassName={filterTriggerClassName}
					/>
					<Select
						disabled={disabled}
						size="xxs"
						label={t`Order status`}
						value={statusFilter}
						onValueChange={(value) => {
							if (isOrderHistoryStatusFilter(value)) setStatusFilter(value);
						}}
						options={statusOptions}
						className="w-auto shrink-0 [&>label]:sr-only"
						triggerClassName={filterTriggerClassName}
					/>
				</div>
				<MobileBulkDisclosureActions
					keys={disabled ? [] : filteredOrderKeys}
					controller={disclosure}
					className="ms-auto ps-3"
				/>
			</div>
		);
	}

	if (!isConnected) {
		return (
			<div className={cn("font-market-close min-h-0 flex flex-col", isPageScroll ? "min-h-0" : "flex-1", className)}>
				{renderFilterRow(true)}
				<div className={cn("min-h-0", !isPageScroll && "flex-1")} />
			</div>
		);
	}

	if (status !== "ready" || ((error || isOffline || isStale) && entries.length === 0)) {
		return (
			<div className={cn("flex min-h-0 flex-1 flex-col", className)}>
				<DataPendingState loading={status === "loading" || status === "idle"} />
				{exportFooter}
			</div>
		);
	}

	if (status === "ready" && entries.length === 0) {
		return (
			<div className={cn("font-market-close min-h-0 flex flex-1 flex-col", className)}>
				<div className="flex flex-1 items-center justify-center p-6 text-sm text-market-close-muted">
					{t`No order history found.`}
				</div>
				{exportFooter}
			</div>
		);
	}

	return (
		<div className={cn("font-market-close min-h-0 flex flex-col", isPageScroll ? "min-h-0" : "flex-1", className)}>
			{renderFilterRow(false)}
			<div className={cn("min-h-0", !isPageScroll && "flex-1 overflow-y-auto overscroll-y-contain")}>
				<div className="flex flex-col gap-2.5 px-3.5 pt-3">
					{filteredEntries.length === 0 ? (
						<div className="flex min-h-28 items-center justify-center text-center text-sm text-market-close-muted">
							{t`No orders match these filters.`}
						</div>
					) : null}
					<MobileProgressiveList key={`${typeFilter}:${directionFilter}:${statusFilter}`} items={filteredEntries}>
						{(visibleEntries) =>
							visibleEntries.map((entry) => {
								const marketName = entry.coin;
								const cardKey = getOrderHistoryDisclosureKey(entry);
								const detailsId = `mobile-order-history-${entry.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
								const isExpanded = expandedKeys.has(cardKey);
								const market = markets.getMarket(entry.coin);
								const isBuy = entry.side === "B";
								const orderTypeLabel = getEntryTypeLabel(entry);
								const sideLabel = getOrderSideLabel(entry.side, entry.reduceOnly);
								const statusCategory = getOrderHistoryStatusCategory(entry);
								function handleToggle() {
									setExpanded(cardKey, !isExpanded);
								}

								return (
									<article
										key={cardKey}
										className="overflow-hidden rounded-[14px] border border-market-close-stroke-card bg-surface"
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
												className="pointer-events-auto relative z-10 flex min-h-11 min-w-0 flex-col justify-center text-left focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-market-close-focus"
											>
												<span className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Market`}</span>
												<span className="truncate text-xs font-bold leading-[17px] text-market-close-fg">
													{marketName}
												</span>
											</button>
											<div className="min-w-0">
												<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Time`}</div>
												<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
													{formatDateTime(entry.createdAt, { dateStyle: "short", timeStyle: "short" })}
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
															<HistoricalOrderPrice align="start" order={entry.order.order} />
														</div>
													</div>
													<div className="min-w-0">
														<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Size`}</div>
														<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
															{formatToken(entry.size, market?.szDecimals)}
														</div>
													</div>
													<div className="min-w-0">
														<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Status`}</div>
														<div
															className={cn(
																"inline-flex max-w-full truncate rounded-[4px] px-[7px] py-0.5 text-[10px] font-bold",
																statusCategory === "filled"
																	? "bg-success-soft text-success"
																	: statusCategory === "canceled" || statusCategory === "rejected"
																		? "bg-error-soft text-error"
																		: "bg-market-close-hover text-market-close-muted",
															)}
														>
															{getEntryStatusLabel(entry)}
														</div>
													</div>
													<div className="col-span-2 min-w-0">
														<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Updated`}</div>
														<div className="truncate whitespace-nowrap text-xs font-semibold leading-[17px] text-market-close-fg tabular-nums">
															{formatDateTime(entry.updatedAt, { dateStyle: "short", timeStyle: "short" })}
														</div>
													</div>
												</div>
											</div>
										) : null}
									</article>
								);
							})
						}
					</MobileProgressiveList>
				</div>
				{exportFooter}
			</div>
		</div>
	);
}
