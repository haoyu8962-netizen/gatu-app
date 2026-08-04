import { Button, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gatu/ui";
import { Plural, useLingui } from "@lingui/react/macro";
import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
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
import { Placeholder } from "./placeholder";
import {
	positionsPanelRowHoverClass,
	positionsPanelRowStripeClass,
	positionsPanelTableBodyClass,
	positionsPanelTableCaptionRowClass,
	positionsPanelTableCellClass,
	positionsPanelTableHeadClass,
	positionsPanelTableHeaderClass,
	positionsPanelTableHeaderRowClass,
	positionsPanelTableShellClass,
	positionsPanelTabRootClass,
} from "./positions-panel-table-styles";

type HistoricalOrderStatus = HistoricalOrdersResponse[number]["status"];
type OrderHistoryStatusFilter = "all" | "open" | "filled" | "triggered" | "canceled" | "rejected" | "other";

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

export function OrdersHistoryTab() {
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
			<div className={cn(positionsPanelTableCaptionRowClass, "justify-between px-5 py-2")}>
				<div className="flex min-w-0 items-center gap-2">
					<Select
						size="xxs"
						label={t`Order type`}
						value={typeFilter}
						onValueChange={(value) => setTypeFilter(value ?? "all")}
						options={typeOptions}
						className="w-32 [&>label]:sr-only"
						triggerClassName="rounded-[7px] border-market-close-stroke-card bg-modal"
					/>
					<Select
						size="xxs"
						label={t`Order status`}
						value={statusFilter}
						onValueChange={(value) => {
							if (isOrderHistoryStatusFilter(value)) setStatusFilter(value);
						}}
						options={statusOptions}
						className="w-32 [&>label]:sr-only"
						triggerClassName="rounded-[7px] border-market-close-stroke-card bg-modal"
					/>
				</div>
				{headerCount ? <span className="tabular-nums text-3xs text-fg-muted">{headerCount}</span> : null}
			</div>
			<div className={positionsPanelTableShellClass}>
				{placeholder ?? (
					<ScrollArea className="h-full w-full">
						<Table className="table-fixed min-w-[52rem] w-full">
							<TableHeader className={positionsPanelTableHeaderClass}>
								<TableRow className={positionsPanelTableHeaderRowClass}>
									<TableHead scope="col" size="dense" className={cn(positionsPanelTableHeadClass, "w-[14%] text-left")}>
										{t`Time`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(positionsPanelTableHeadClass, "w-[18%] text-left")}>
										{t`Asset`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(positionsPanelTableHeadClass, "w-[12%] text-left")}>
										{t`Type`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[14%] text-right")}
									>
										{t`Price`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[14%] text-right")}
									>
										{t`Size`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(positionsPanelTableHeadClass, "w-[12%] text-left")}>
										{t`Status`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[16%] text-right")}
									>
										{t`Updated`}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className={positionsPanelTableBodyClass}>
								{filteredOrders.map((entry, i) => {
									const { order } = entry;
									const market = markets.getMarket(order.coin);
									const isBuy = order.side === "B";
									const sideLabel = getOrderSideLabel(order.side, order.reduceOnly);

									return (
										<TableRow
											key={`${order.oid}-${entry.statusTimestamp}`}
											className={cn(positionsPanelRowHoverClass, i % 2 === 1 && positionsPanelRowStripeClass)}
										>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, "whitespace-nowrap text-fg-muted")}
											>
												{formatDateTime(order.timestamp, { dateStyle: "short", timeStyle: "short" })}
											</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, "font-medium text-fg")}>
												<AssetBadge
													coin={order.coin}
													side={isBuy ? "buy" : "sell"}
													onClick={() => navigateToMarket(order.coin)}
													aria-label={t`Switch to ${order.coin} market, ${sideLabel} order`}
												/>
											</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, "capitalize text-fg")}>
												{getOrderTypeLabel(order.orderType)}
											</TableCell>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, "text-right tabular-nums text-fg")}
											>
												<HistoricalOrderPrice order={order} />
											</TableCell>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, "text-right tabular-nums text-fg")}
											>
												{formatToken(order.origSz, market?.szDecimals)}
											</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, "capitalize text-fg")}>
												{getHistoricalOrderStatusLabel(entry.status)}
											</TableCell>
											<TableCell
												size="dense"
												className={cn(
													positionsPanelTableCellClass,
													"whitespace-nowrap text-right tabular-nums text-fg-muted",
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
			{isConnected && status === "ready" ? (
				<div className="flex shrink-0 items-center gap-4 px-5 py-2.5" data-testid="order-history-footer">
					<Button
						variant="ghost"
						intent="neutral"
						size="xxs"
						disabled={filteredOrders.length === 0}
						onClick={handleExportCsv}
						iconLeft={<DownloadSimpleIcon className="size-3" aria-hidden="true" />}
					>
						{t`Export CSV`}
					</Button>
				</div>
			) : null}
		</div>
	);
}
