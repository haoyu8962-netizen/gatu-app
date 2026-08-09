import { Button, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gatu/ui";
import { Plural, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { useHistoricalOrders } from "@/hooks/trade/use-historical-orders";
import { useHistoricalOrdersCsvExport } from "@/hooks/trade/use-history-csv-export";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useOrderDisplayLabels } from "@/hooks/trade/use-order-display-labels";
import { cn } from "@/lib/cn";
import { buildCsvRows } from "@/lib/csv";
import { formatDateTime, formatToken, formatUSD } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
import { isMalformedHistoryPageError } from "@/lib/trade/history-pagination";
import {
	getOrderHistoryStatusCategory,
	getOrderHistoryTriggerPrice,
	getTwapAverageFillPrice,
	type OrderHistoryEntry,
	type OrderHistoryStatusCategory,
} from "@/lib/trade/order-history";
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

type OrderHistoryStatusFilter = "all" | OrderHistoryStatusCategory;

const orderHistoryTableHeadClass =
	"sticky top-0 z-[1] h-[33px] bg-surface px-2 py-0 text-[11px] leading-4 font-semibold normal-case tracking-normal text-market-close-subtle";
const orderHistoryTableCellClass = "h-[58px] px-2 py-0 text-[13px] leading-[18px]";
const orderHistoryAssetClass =
	"h-auto min-h-0 rounded-[4px] border-0 bg-transparent p-0 shadow-none hover:bg-transparent active:not-data-disabled:scale-100";
const orderHistoryToolbarButtonClass =
	"h-[27px] min-h-0 rounded-none p-0 text-xs font-normal text-market-close-muted shadow-none transition-colors duration-[120ms] hover:bg-transparent hover:text-market-close-fg active:not-data-disabled:scale-100 data-disabled:text-market-close-subtle";

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

function getOrderHistoryStatusBadgeClass(status: OrderHistoryStatusCategory): string {
	return status === "filled" || status === "triggered"
		? "bg-success-soft text-market-close-success"
		: "bg-market-close-hover text-market-close-subtle";
}

interface Props {
	toolbarTarget?: HTMLElement | null;
}

export function OrdersHistoryTab({ toolbarTarget }: Props = {}) {
	const { t } = useLingui();
	const { getHistoricalOrderStatusLabel, getOrderSideLabel, getOrderTypeLabel, getTwapHistoryStatusLabel } =
		useOrderDisplayLabels();
	const { entries, error, isConnected, status } = useHistoricalOrders();
	const malformedHistory = isMalformedHistoryPageError(error);
	const navigateToMarket = useMarketNavigation();
	const markets = useMarkets();
	const [typeFilter, setTypeFilter] = useState("all");
	const [statusFilter, setStatusFilter] = useState<OrderHistoryStatusFilter>("all");

	const filteredEntries = entries.filter(
		(entry) =>
			(typeFilter === "all" || entry.type === typeFilter) &&
			(statusFilter === "all" || getOrderHistoryStatusCategory(entry) === statusFilter),
	);
	const typeOptions = [
		{ value: "all", label: t`All types` },
		...Array.from(new Set(entries.map((entry) => entry.type))).map((value) => ({
			value,
			label: value === "twap" ? t`TWAP` : getOrderTypeLabel(value),
		})),
	];
	const availableStatusFilters = new Set(entries.map(getOrderHistoryStatusCategory));
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

	function getEntryTypeLabel(entry: OrderHistoryEntry) {
		return entry.kind === "twap" ? t`TWAP` : getOrderTypeLabel(entry.type);
	}

	function getEntryStatusLabel(entry: OrderHistoryEntry) {
		return entry.kind === "twap"
			? getTwapHistoryStatusLabel(entry.twap.status.status)
			: getHistoricalOrderStatusLabel(entry.order.status);
	}

	function getEntryPrice(entry: OrderHistoryEntry) {
		return entry.kind === "twap" ? getTwapAverageFillPrice(entry.twap) : entry.order.order.limitPx;
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
						getValue: (entry) => {
							const price = getEntryPrice(entry);
							return price ? formatUSD(price, { compact: false }) : FALLBACK_VALUE_PLACEHOLDER;
						},
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
		if (status === "loading" || status === "idle") return <Placeholder>{t`Loading order history...`}</Placeholder>;
		if (status === "error") {
			return (
				<Placeholder variant="error">
					<span>{t`Failed to load order history.`}</span>
					{malformedHistory ? (
						<span className="mt-1 text-xs text-fg-muted">
							{t`History data could not be validated. Refresh and try again.`}
						</span>
					) : (
						error instanceof Error && <span className="mt-1 text-xs text-fg-muted">{error.message}</span>
					)}
				</Placeholder>
			);
		}
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
								{filteredEntries.map((entry) => {
									const market = markets.getMarket(entry.coin);
									const isBuy = entry.side === "B";
									const sideLabel = getOrderSideLabel(entry.side, entry.reduceOnly);
									const statusCategory = getOrderHistoryStatusCategory(entry);
									const twapAveragePrice = entry.kind === "twap" ? getTwapAverageFillPrice(entry.twap) : null;

									return (
										<TableRow key={entry.key} className="transition-colors duration-[120ms] hover:bg-market-close-card">
											<TableCell
												size="dense"
												className={cn(
													positionsPanelTableCellClass,
													orderHistoryTableCellClass,
													"whitespace-nowrap pl-5 text-xs text-market-close-muted",
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
												{entry.kind === "order" ? (
													<HistoricalOrderPrice order={entry.order.order} />
												) : twapAveragePrice ? (
													formatUSD(twapAveragePrice, { compact: false })
												) : (
													FALLBACK_VALUE_PLACEHOLDER
												)}
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
														"inline-flex w-fit whitespace-nowrap rounded-[4px] px-2 py-0.5 text-[11px] leading-[14px] font-semibold capitalize",
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
													"whitespace-nowrap pr-5 text-right text-xs text-market-close-muted",
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
		</div>
	);
}
