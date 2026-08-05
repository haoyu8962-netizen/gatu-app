import { Button, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gatu/ui";
import { Plural, useLingui } from "@lingui/react/macro";
import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import { useState } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { isCanceledOrderStatus } from "@/domain/trade/order-tracking";
import { useHistoricalOrders } from "@/hooks/trade/use-historical-orders";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useOrderDisplayLabels } from "@/hooks/trade/use-order-display-labels";
import { cn } from "@/lib/cn";
import { buildCsvRows, downloadCsv } from "@/lib/csv";
import { formatDateTime, formatToken, formatUSD } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
import { AssetBadge } from "../components/asset-badge";
import { HistoricalOrderPrice } from "../components/historical-order-price";
import { DesktopTabToolbarPortal } from "./desktop-tab-toolbar-portal";
import { Placeholder } from "./placeholder";
import {
	positionsPanelTableBodyClass,
	positionsPanelTableCellClass,
	positionsPanelTableHeaderRowClass,
	positionsPanelTableShellClass,
	positionsPanelTabRootClass,
} from "./positions-panel-table-styles";

type HistoricalOrderStatus = HistoricalOrdersResponse[number]["status"];
type OrderHistoryStatusFilter = "all" | "open" | "filled" | "triggered" | "canceled" | "rejected" | "other";

const orderHistoryTableHeadClass =
	"sticky top-0 z-[1] h-[33px] bg-surface px-2 py-0 text-[11px] leading-4 font-semibold normal-case tracking-normal text-market-close-subtle";
const orderHistoryTableCellClass = "h-[58px] px-2 py-0 text-[13px] leading-[18px]";
const orderHistoryAssetClass =
	"h-auto min-h-0 rounded-[4px] border-0 bg-transparent p-0 shadow-none hover:bg-transparent active:not-data-disabled:scale-100";
const orderHistoryToolbarButtonClass =
	"h-[27px] min-h-0 rounded-none p-0 text-xs font-normal text-market-close-muted shadow-none transition-colors duration-[120ms] hover:bg-transparent hover:text-market-close-fg active:not-data-disabled:scale-100 data-disabled:text-market-close-subtle";

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

function hasTriggerPrice(order: HistoricalOrdersResponse[number]["order"]): boolean {
	return order.isTrigger || order.orderType.startsWith("Stop ") || order.orderType.startsWith("Take Profit ");
}

function getOrderHistoryStatusBadgeClass(status: HistoricalOrderStatus): string {
	return status === "filled" || status === "triggered"
		? "bg-success-soft text-market-close-success"
		: "bg-market-close-hover text-market-close-subtle";
}

interface Props {
	toolbarTarget?: HTMLElement | null;
}

export function OrdersHistoryTab({ toolbarTarget }: Props = {}) {
	const { t } = useLingui();
	const { getHistoricalOrderStatusLabel, getOrderSideLabel, getOrderTypeLabel } = useOrderDisplayLabels();
	const { error, isConnected, orders, status } = useHistoricalOrders();
	const navigateToMarket = useMarketNavigation();
	const markets = useMarkets();
	const [typeFilter, setTypeFilter] = useState("all");
	const [statusFilter, setStatusFilter] = useState<OrderHistoryStatusFilter>("all");

	const filteredOrders = orders.filter(
		(entry) =>
			(typeFilter === "all" || entry.order.orderType === typeFilter) &&
			(statusFilter === "all" || getOrderHistoryStatusFilter(entry.status) === statusFilter),
	);
	const typeOptions = [
		{ value: "all", label: t`All types` },
		...Array.from(new Set(orders.map((entry) => entry.order.orderType))).map((value) => ({
			value,
			label: getOrderTypeLabel(value),
		})),
	];
	const availableStatusFilters = new Set(orders.map((entry) => getOrderHistoryStatusFilter(entry.status)));
	const statusOptions = [
		{ value: "all", label: t`All statuses` },
		...(["open", "filled", "triggered", "canceled", "rejected", "other"] as const)
			.filter((value) => availableStatusFilters.has(value))
			.map((value) => ({ value, label: getStatusFilterLabel(value) })),
	];

	const headerCount = isConnected ? <Plural value={filteredOrders.length} one="# order" other="# orders" /> : null;

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

	function renderPlaceholder() {
		if (!isConnected) return <Placeholder>{t`Connect your wallet to view order history.`}</Placeholder>;
		if (status === "loading" || status === "idle") return <Placeholder>{t`Loading order history...`}</Placeholder>;
		if (status === "error") {
			return (
				<Placeholder variant="error">
					<span>{t`Failed to load order history.`}</span>
					{error instanceof Error && <span className="mt-1 text-xs text-fg-muted">{error.message}</span>}
				</Placeholder>
			);
		}
		if (orders.length === 0) return <Placeholder>{t`No order history found.`}</Placeholder>;
		return null;
	}

	const placeholder =
		renderPlaceholder() ??
		(filteredOrders.length === 0 ? <Placeholder>{t`No orders match these filters.`}</Placeholder> : null);

	return (
		<div className={positionsPanelTabRootClass}>
			<DesktopTabToolbarPortal target={toolbarTarget}>
				<div className="flex min-w-0 shrink-0 items-center gap-2 font-market-close" data-testid="order-history-filters">
					<Select
						size="xxs"
						label={t`Order type`}
						value={typeFilter}
						onValueChange={(value) => setTypeFilter(value ?? "all")}
						options={typeOptions}
						className="min-w-[7rem] [&>label]:sr-only"
						triggerClassName="h-[27px] !rounded-[7px] border-market-close-stroke-card bg-modal px-2.5 text-xs text-market-close-muted hover:border-market-close-control focus-visible:border-market-close-control"
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
						triggerClassName="h-[27px] !rounded-[7px] border-market-close-stroke-card bg-modal px-2.5 text-xs text-market-close-muted hover:border-market-close-control focus-visible:border-market-close-control"
					/>
					{headerCount ? (
						<span className="shrink-0 text-xs text-market-close-subtle tabular-nums">{headerCount}</span>
					) : null}
					{isConnected && status === "ready" ? (
						<Button
							variant="ghost"
							intent="neutral"
							size="xxs"
							className={orderHistoryToolbarButtonClass}
							disabled={filteredOrders.length === 0}
							onClick={handleExportCsv}
						>
							{t`Export CSV`}
						</Button>
					) : null}
				</div>
			</DesktopTabToolbarPortal>
			<div className={positionsPanelTableShellClass}>
				{placeholder ?? (
					<ScrollArea className="h-full w-full">
						<Table className="table-fixed min-w-[1280px] w-full font-market-close tabular-nums">
							<colgroup>
								<col className="w-[158px]" />
								<col className="w-[126px]" />
								<col />
								<col className="w-[166px]" />
								<col className="w-[146px]" />
								<col className="w-[126px]" />
								<col className="w-[178px]" />
							</colgroup>
							<TableHeader className="bg-surface [&_tr]:border-market-close-stroke-card [&_tr]:border-t-0">
								<TableRow className={positionsPanelTableHeaderRowClass}>
									<TableHead scope="col" size="dense" className={cn(orderHistoryTableHeadClass, "pl-5 text-left")}>
										{t`Time`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(orderHistoryTableHeadClass, "text-left")}>
										{t`Asset`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(orderHistoryTableHeadClass, "text-left")}>
										{t`Type`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(orderHistoryTableHeadClass, "text-right")}>
										{t`Price`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(orderHistoryTableHeadClass, "text-right")}>
										{t`Size`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(orderHistoryTableHeadClass, "text-left")}>
										{t`Status`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(orderHistoryTableHeadClass, "pr-5 text-right")}>
										{t`Updated`}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className={cn(positionsPanelTableBodyClass, "[&_tr]:border-market-close-stroke-card/60")}>
								{filteredOrders.map((entry) => {
									const { order } = entry;
									const market = markets.getMarket(order.coin);
									const isBuy = order.side === "B";
									const sideLabel = getOrderSideLabel(order.side, order.reduceOnly);

									return (
										<TableRow
											key={`${order.oid}-${entry.statusTimestamp}`}
											className="transition-colors duration-[120ms] hover:bg-market-close-card"
										>
											<TableCell
												size="dense"
												className={cn(
													positionsPanelTableCellClass,
													orderHistoryTableCellClass,
													"whitespace-nowrap pl-5 text-xs text-market-close-muted",
												)}
											>
												{formatDateTime(order.timestamp, { dateStyle: "short", timeStyle: "short" })}
											</TableCell>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, orderHistoryTableCellClass, "font-bold")}
											>
												<AssetBadge
													coin={order.coin}
													side={isBuy ? "buy" : "sell"}
													onClick={() => navigateToMarket(order.coin)}
													aria-label={t`Switch to ${order.coin} market, ${sideLabel} order`}
													className={orderHistoryAssetClass}
													nameClassName="text-[13px] leading-[18px] font-bold text-market-close-fg"
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
												{getOrderTypeLabel(order.orderType)}
											</TableCell>
											<TableCell
												size="dense"
												className={cn(
													positionsPanelTableCellClass,
													orderHistoryTableCellClass,
													"text-right text-market-close-fg",
												)}
											>
												<HistoricalOrderPrice order={order} />
											</TableCell>
											<TableCell
												size="dense"
												className={cn(
													positionsPanelTableCellClass,
													orderHistoryTableCellClass,
													"text-right text-market-close-fg",
												)}
											>
												{formatToken(order.origSz, market?.szDecimals)}
											</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, orderHistoryTableCellClass)}>
												<span
													className={cn(
														"inline-flex w-fit whitespace-nowrap rounded-[4px] px-2 py-0.5 text-[11px] leading-[14px] font-semibold capitalize",
														getOrderHistoryStatusBadgeClass(entry.status),
													)}
												>
													{getHistoricalOrderStatusLabel(entry.status)}
												</span>
											</TableCell>
											<TableCell
												size="dense"
												className={cn(
													positionsPanelTableCellClass,
													orderHistoryTableCellClass,
													"whitespace-nowrap pr-5 text-right text-xs text-market-close-muted",
												)}
											>
												{formatDateTime(entry.statusTimestamp, { dateStyle: "short", timeStyle: "short" })}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
						<ScrollBar orientation="horizontal" />
					</ScrollArea>
				)}
			</div>
		</div>
	);
}
