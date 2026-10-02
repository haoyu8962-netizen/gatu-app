import { Plural, useLingui } from "@lingui/react/macro";
import { Button, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@sairn/ui";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { RECENT_ACCOUNT_HISTORY_ROWS } from "@/config/trade";
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
import { AssetBadge } from "../components/asset-badge";
import { HistoricalOrderPrice } from "../components/historical-order-price";
import { DesktopTabToolbarPortal } from "./desktop-tab-toolbar-portal";
import { PassiveDataPlaceholder } from "./passive-data-placeholder";
import { Placeholder } from "./placeholder";
import {
	positionsPanelTableBodyClass,
	positionsPanelTableCellClass,
	positionsPanelTableHeaderRowClass,
	positionsPanelTableShellClass,
	positionsPanelTabRootClass,
} from "./positions-panel-table-styles";

type OrderHistoryType = OrdinaryOrderHistoryEntry["type"];
type OrderHistoryTypeFilter = "all" | OrderHistoryType;
type OrderHistoryStatusFilter = "all" | OrderHistoryStatusCategory;

const orderHistoryTableHeadClass =
	"sticky top-0 z-[1] h-[33px] bg-surface px-2 py-0 text-2xs leading-4 font-semibold normal-case tracking-normal text-market-close-subtle";
const orderHistoryTableCellClass = "h-[58px] px-2 py-0 text-2sm leading-[18px]";
const orderHistoryAssetClass =
	"h-auto min-h-0 rounded-[4px] border-0 bg-transparent p-0 shadow-none hover:bg-transparent active:not-data-disabled:scale-100";
const orderHistoryToolbarButtonClass =
	"h-[27px] min-h-0 rounded-none p-0 text-xs font-normal text-market-close-muted shadow-none transition-colors duration-[120ms] hover:bg-transparent hover:text-market-close-fg active:not-data-disabled:scale-100 data-disabled:text-market-close-subtle";
const orderHistoryFooterButtonClass =
	"h-auto min-h-0 rounded-none p-0 text-xs font-normal text-market-close-muted shadow-none transition-colors duration-[120ms] hover:bg-transparent hover:text-market-close-fg active:not-data-disabled:scale-100 data-disabled:text-market-close-subtle";

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

function isOrderHistoryType(
	value: string | null,
	availableTypes: ReadonlySet<OrderHistoryType>,
): value is OrderHistoryType {
	return value !== null && availableTypes.has(value as OrderHistoryType);
}

function getOrderHistoryStatusBadgeClass(status: OrderHistoryStatusCategory): string {
	return status === "filled" || status === "triggered"
		? "bg-success-soft text-market-close-success"
		: "bg-market-close-hover text-market-close-subtle";
}

interface Props {
	toolbarTarget?: HTMLElement | null;
}

export function OrdersHistoryTab(props: Props = {}) {
	const { address, isConnected } = useWalletSession();
	const { env } = useHyperliquid();
	const ownerKey = isConnected && address ? address.toLowerCase() : "disconnected";

	return <OrdersHistoryTabContent key={`${env}:${ownerKey}`} address={address} {...props} />;
}

interface OrdersHistoryTabContentProps extends Props {
	address?: `0x${string}`;
}

function OrdersHistoryTabContent({ address, toolbarTarget }: OrdersHistoryTabContentProps) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const { getHistoricalOrderStatusLabel, getOrderSideLabel, getOrderTypeLabel } = useOrderDisplayLabels();
	const { entries, error, isConnected, isOffline, isStale, status } = useHistoricalOrders();
	const navigateToMarket = useMarketNavigation();
	const markets = useMarkets();
	const [typeFilter, setTypeFilter] = useState<OrderHistoryTypeFilter>("all");
	const [statusFilter, setStatusFilter] = useState<OrderHistoryStatusFilter>("all");

	const filteredEntries = entries
		.filter(
			(entry) =>
				(typeFilter === "all" || entry.type === typeFilter) &&
				(statusFilter === "all" || getOrderHistoryStatusCategory(entry) === statusFilter),
		)
		.slice(0, RECENT_ACCOUNT_HISTORY_ROWS);
	const availableTypeFilters = new Set(entries.map((entry) => entry.type));
	if (typeFilter !== "all") availableTypeFilters.add(typeFilter);
	const typeOptions = [
		{ value: "all", label: t`All types` },
		...Array.from(availableTypeFilters).map((value) => ({
			value,
			label: getOrderTypeLabel(value),
		})),
	];
	const availableStatusFilters = new Set(entries.map(getOrderHistoryStatusCategory));
	if (statusFilter !== "all") availableStatusFilters.add(statusFilter);
	const statusOptions = [
		{ value: "all", label: t`All statuses` },
		...(["open", "filled", "triggered", "canceled", "rejected", "other"] as const)
			.filter((value) => availableStatusFilters.has(value))
			.map((value) => ({ value, label: getStatusFilterLabel(value) })),
	];

	const headerCount = isConnected ? <Plural value={filteredEntries.length} one="# order" other="# orders" /> : null;

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

	function renderPlaceholder() {
		if (!isConnected) return <Placeholder>{t`Connect your wallet to view order history.`}</Placeholder>;
		if (status === "loading" || status === "idle") return <PassiveDataPlaceholder busy />;
		if (status !== "ready" || (entries.length === 0 && (error || isOffline || isStale)))
			return <PassiveDataPlaceholder />;
		if (entries.length === 0) return <Placeholder>{t`No order history found.`}</Placeholder>;
		return null;
	}

	const placeholder =
		renderPlaceholder() ??
		(filteredEntries.length === 0 ? <Placeholder>{t`No orders match these filters.`}</Placeholder> : null);

	return (
		<div className={positionsPanelTabRootClass}>
			<DesktopTabToolbarPortal target={toolbarTarget}>
				<div className="flex min-w-0 shrink-0 items-center gap-2 font-market-close" data-testid="order-history-filters">
					<Select
						size="xxs"
						label={t`Order type`}
						value={typeFilter}
						onValueChange={(value) => {
							if (value === "all" || isOrderHistoryType(value, availableTypeFilters)) setTypeFilter(value);
						}}
						options={typeOptions}
						className="min-w-[7rem] [&>label]:sr-only"
						triggerClassName="h-[27px] !rounded-[7px] border-market-close-stroke-card bg-surface px-2.5 text-xs text-market-close-muted hover:border-market-close-control focus-visible:border-market-close-focus"
					/>
					<Select
						size="xxs"
						label={t`Order status`}
						value={statusFilter}
						onValueChange={(value) => {
							if (isOrderHistoryStatusFilter(value)) setStatusFilter(value);
						}}
						options={statusOptions}
						className="min-w-[7rem] [&>label]:sr-only"
						triggerClassName="h-[27px] !rounded-[7px] border-market-close-stroke-card bg-surface px-2.5 text-xs text-market-close-muted hover:border-market-close-control focus-visible:border-market-close-focus"
					/>
					{headerCount ? (
						<span className="shrink-0 text-xs text-market-close-subtle tabular-nums">{headerCount}</span>
					) : null}
					{isConnected ? (
						<Button
							variant="ghost"
							intent="neutral"
							size="xxs"
							className={orderHistoryToolbarButtonClass}
							disabled={isExporting}
							onClick={() => void exportCsv()}
						>
							{t`Export CSV`}
						</Button>
					) : null}
				</div>
			</DesktopTabToolbarPortal>
			<div className={positionsPanelTableShellClass}>
				{placeholder ?? (
					<ScrollArea className="h-full w-full">
						<Table
							containerClassName="overflow-visible"
							className="table-fixed min-w-[62rem] w-full font-market-close tabular-nums"
						>
							<colgroup>
								<col className="w-[144px]" />
								<col className="w-[116px]" />
								<col />
								<col className="w-[136px]" />
								<col className="w-[120px]" />
								<col className="w-[112px]" />
								<col className="w-[160px]" />
							</colgroup>
							<TableHeader className="bg-surface [&_tr]:border-market-close-stroke-card [&_tr]:border-t-0">
								<TableRow className={positionsPanelTableHeaderRowClass}>
									<TableHead scope="col" size="dense" className={cn(orderHistoryTableHeadClass, "ps-5 text-start")}>
										{t`Time`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(orderHistoryTableHeadClass, "text-start")}>
										{t`Asset`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(orderHistoryTableHeadClass, "text-start")}>
										{t`Type`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(orderHistoryTableHeadClass, "text-right")}>
										{t`Price`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(orderHistoryTableHeadClass, "text-right")}>
										{t`Size`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(orderHistoryTableHeadClass, "text-start")}>
										{t`Status`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(orderHistoryTableHeadClass, "pe-5 text-right")}>
										{t`Updated`}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className={cn(positionsPanelTableBodyClass, "[&_tr]:border-market-close-stroke-card/60")}>
								{filteredEntries.map((entry) => {
									const market = markets.getMarket(entry.coin);
									const isBuy = entry.side === "B";
									const sideLabel = getOrderSideLabel(entry.side, entry.reduceOnly);
									const statusCategory = getOrderHistoryStatusCategory(entry);
									return (
										<TableRow key={entry.key} className="transition-colors duration-[120ms] hover:bg-market-close-card">
											<TableCell
												size="dense"
												className={cn(
													positionsPanelTableCellClass,
													orderHistoryTableCellClass,
													"whitespace-nowrap ps-5 text-xs text-market-close-muted",
												)}
											>
												{formatDateTime(entry.createdAt, { dateStyle: "short", timeStyle: "short" })}
											</TableCell>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, orderHistoryTableCellClass, "font-bold")}
											>
												<AssetBadge
													coin={entry.coin}
													side={isBuy ? "buy" : "sell"}
													onClick={() => navigateToMarket(entry.coin)}
													aria-label={t`Switch to ${entry.coin} market, ${sideLabel} order`}
													className={orderHistoryAssetClass}
													nameClassName="text-2sm leading-[18px] font-bold text-market-close-fg"
													fit
												/>
											</TableCell>
											<TableCell
												size="dense"
												className={cn(
													positionsPanelTableCellClass,
													orderHistoryTableCellClass,
													"whitespace-nowrap capitalize text-market-close-fg",
												)}
											>
												{getEntryTypeLabel(entry)}
											</TableCell>
											<TableCell
												size="dense"
												className={cn(
													positionsPanelTableCellClass,
													orderHistoryTableCellClass,
													"text-right text-market-close-fg",
												)}
											>
												<HistoricalOrderPrice order={entry.order.order} />
											</TableCell>
											<TableCell
												size="dense"
												className={cn(
													positionsPanelTableCellClass,
													orderHistoryTableCellClass,
													"text-right text-market-close-fg",
												)}
											>
												{formatToken(entry.size, market?.szDecimals)}
											</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, orderHistoryTableCellClass)}>
												<span
													className={cn(
														"inline-flex w-fit whitespace-nowrap rounded-[4px] px-2 py-0.5 text-2xs leading-[14px] font-semibold capitalize",
														getOrderHistoryStatusBadgeClass(statusCategory),
													)}
												>
													{getEntryStatusLabel(entry)}
												</span>
											</TableCell>
											<TableCell
												size="dense"
												className={cn(
													positionsPanelTableCellClass,
													orderHistoryTableCellClass,
													"whitespace-nowrap pe-5 text-right text-xs text-market-close-muted",
												)}
											>
												{formatDateTime(entry.updatedAt, { dateStyle: "short", timeStyle: "short" })}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</ScrollArea>
				)}
			</div>
			{isConnected && address ? (
				<div className="flex h-[38px] shrink-0 items-center gap-4 px-5" data-testid="order-history-footer">
					<Button
						nativeButton={false}
						variant="ghost"
						intent="neutral"
						size="xxs"
						className={orderHistoryFooterButtonClass}
						render={<Link to="/historicalOrders/$address" params={{ address }} />}
					>
						{t`View all`}
					</Button>
				</div>
			) : null}
		</div>
	);
}
