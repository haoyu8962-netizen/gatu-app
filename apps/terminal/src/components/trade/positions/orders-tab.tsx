import {
	Button,
	Checkbox,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
	Tooltip,
} from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { useCallback, useEffect, useState } from "react";
import { useConnection } from "wagmi";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { FALLBACK_VALUE_PLACEHOLDER, HL_ALL_DEXS } from "@/config/constants";
import { cn } from "@/lib/cn";
import { formatDateTime, formatPrice, formatToken, formatUSD } from "@/lib/format";
import { useExchange, useMarkets, useSubscription } from "@/lib/hyperliquid";
import {
	getOrderTypeConfig,
	getOrderValue,
	isClosePositionOrder,
	isMarketTriggerOrder,
	type OpenOrder,
} from "@/lib/trade/open-orders";
import type { Side } from "@/lib/trade/types";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useMarketActions } from "@/stores/use-market-store";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
import { AssetDisplay } from "../components/asset-display";
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

interface PlaceholderProps {
	children: React.ReactNode;
	variant?: "error";
}

function Placeholder({ children, variant }: PlaceholderProps) {
	return (
		<div
			className={cn(
				"h-full w-full flex flex-col items-center justify-center px-2 py-6 text-xs",
				variant === "error" ? "text-error" : "text-fg-muted",
			)}
		>
			{children}
		</div>
	);
}

export function OrdersTab() {
	const { address, isConnected } = useConnection();
	const { scope } = useExchangeScope();
	const { setSelectedMarket } = useMarketActions();
	const { setSide } = useOrderEntryActions();

	function handleSelectMarket(name: string, side: Side) {
		setSelectedMarket(scope, name);
		setSide(side);
	}
	const {
		data: openOrdersEvent,
		status,
		error,
	} = useSubscription(
		"openOrders",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);
	const markets = useMarkets();
	const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(() => new Set());

	const {
		mutate: cancelOrders,
		isPending: isCancelling,
		error: cancelError,
		reset: resetCancelError,
	} = useExchange("cancel");

	const openOrders = openOrdersEvent?.orders ?? [];

	useEffect(() => {
		if (selectedOrderIds.size === 0) return;
		const openIds = new Set(openOrders.map((order) => order.oid));
		let changed = false;
		for (const id of selectedOrderIds) {
			if (!openIds.has(id)) {
				changed = true;
				break;
			}
		}
		if (!changed) return;

		setSelectedOrderIds((prev) => {
			const next = new Set<number>();
			for (const id of prev) {
				if (openIds.has(id)) {
					next.add(id);
				}
			}
			return next;
		});
	}, [openOrders, selectedOrderIds]);

	const selectedCount = selectedOrderIds.size;
	const allSelected = selectedCount > 0 && selectedCount === openOrders.length;
	const someSelected = selectedCount > 0 && selectedCount < openOrders.length;

	const handleToggleAll = useCallback(
		(value: boolean | "indeterminate") => {
			if (value === true) {
				setSelectedOrderIds(new Set(openOrders.map((order) => order.oid)));
			} else {
				setSelectedOrderIds(new Set());
			}
		},
		[openOrders],
	);

	const handleToggleOrder = useCallback((orderId: number, value: boolean | "indeterminate") => {
		setSelectedOrderIds((prev) => {
			const next = new Set(prev);
			if (value === true) {
				next.add(orderId);
			} else {
				next.delete(orderId);
			}
			return next;
		});
	}, []);

	const handleCancelOrders = useCallback(
		(ordersToCancel: OpenOrder[]) => {
			if (isCancelling || ordersToCancel.length === 0) return;

			const cancels = ordersToCancel.reduce<{ a: number; o: number }[]>((acc, order) => {
				const assetId = markets.getAssetId(order.coin);
				if (typeof assetId !== "number") return acc;
				acc.push({ a: assetId, o: order.oid });
				return acc;
			}, []);

			if (cancels.length === 0) return;

			resetCancelError();
			cancelOrders(
				{ cancels },
				{
					onSuccess: () => {
						setSelectedOrderIds((prev) => {
							const next = new Set(prev);
							for (const order of ordersToCancel) {
								next.delete(order.oid);
							}
							return next;
						});
					},
				},
			);
		},
		[isCancelling, markets, cancelOrders, resetCancelError],
	);

	const handleCancelSelected = useCallback(() => {
		const ordersToCancel = openOrders.filter((order) => selectedOrderIds.has(order.oid));
		handleCancelOrders(ordersToCancel);
	}, [handleCancelOrders, openOrders, selectedOrderIds]);

	const handleCancelAll = useCallback(() => {
		handleCancelOrders(openOrders);
	}, [handleCancelOrders, openOrders]);

	const canCancel = !isCancelling;
	const disableCancelSelected = !canCancel || selectedCount === 0;
	const disableCancelAll = !canCancel || openOrders.length === 0;
	const actionError = cancelError?.message;

	function renderPlaceholder() {
		if (!isConnected) return <Placeholder>{t`Connect your wallet to view open orders.`}</Placeholder>;
		if (status === "subscribing" || status === "idle") return <Placeholder>{t`Loading open orders...`}</Placeholder>;
		if (status === "error") {
			return (
				<Placeholder variant="error">
					<span>{t`Failed to load open orders.`}</span>
					{error instanceof Error && <span className="mt-1 text-xs text-fg-muted">{error.message}</span>}
				</Placeholder>
			);
		}
		if (openOrders.length === 0) return <Placeholder>{t`No open orders.`}</Placeholder>;
		return null;
	}

	const placeholder = renderPlaceholder();

	return (
		<div className={positionsPanelTabRootClass}>
			<div className={positionsPanelTableCaptionRowClass}>
				{isConnected ? (
					<span className="tabular-nums text-3xs text-fg-muted">
						{openOrders.length} {t`orders`}
					</span>
				) : null}
				{isConnected && selectedCount > 0 ? (
					<span className="tabular-nums text-3xs text-fg-muted">
						{selectedCount} {t`selected`}
					</span>
				) : null}
				<Button
					variant="link"
					size="xs"
					aria-label={t`Cancel selected orders`}
					onClick={handleCancelSelected}
					disabled={disableCancelSelected}
				>
					{isCancelling ? t`Canceling...` : t`Cancel selected`}
				</Button>
				<Button
					variant="link"
					size="xs"
					aria-label={t`Cancel all orders`}
					onClick={handleCancelAll}
					disabled={disableCancelAll}
				>
					{isCancelling ? t`Canceling...` : t`Cancel all`}
				</Button>
			</div>
			{actionError ? <div className="px-2.5 py-1 text-2xs text-error">{actionError}</div> : null}
			<div className={positionsPanelTableShellClass}>
				{placeholder ?? (
					<ScrollArea className="h-full w-full">
						<Table className="table-fixed min-w-[60rem] w-full">
							<TableHeader className={positionsPanelTableHeaderClass}>
								<TableRow className={positionsPanelTableHeaderRowClass}>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[3%] text-center")}>
										<Checkbox
											checked={allSelected}
											indeterminate={someSelected && !allSelected}
											onCheckedChange={handleToggleAll}
											aria-label={t`Select all orders`}
											disabled={openOrders.length === 0 || isCancelling}
										/>
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[11%] text-left")}>
										{t`Time`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[17%] text-left")}>
										{t`Asset`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[10%] text-left")}>
										{t`Type`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[12%] text-right")}>
										{t`Price`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[14%] text-right")}>
										{t`Size`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[11%] text-left")}>
										{t`Trigger`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[8%] text-left")}>
										{t`Reduce`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[13%] text-right")}>
										{t`Actions`}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className={positionsPanelTableBodyClass}>
								{openOrders.map((order, i) => {
									return (
										<OrderRow
											key={order.oid}
											order={order}
											szDecimals={markets.getSzDecimals(order.coin)}
											isSelected={selectedOrderIds.has(order.oid)}
											isCancelling={isCancelling}
											canCancel={canCancel}
											isEven={i % 2 === 1}
											onToggle={handleToggleOrder}
											onCancel={handleCancelOrders}
											onSelectMarket={handleSelectMarket}
										/>
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

interface OrderRowProps {
	order: OpenOrder;
	szDecimals: number;
	isSelected: boolean;
	isCancelling: boolean;
	canCancel: boolean;
	isEven: boolean;
	onToggle: (orderId: number, value: boolean | "indeterminate") => void;
	onCancel: (orders: OpenOrder[]) => void;
	onSelectMarket: (marketName: string, side: Side) => void;
}

function OrderRow({
	order,
	szDecimals,
	isSelected,
	isCancelling,
	canCancel,
	isEven,
	onToggle,
	onCancel,
	onSelectMarket,
}: OrderRowProps) {
	const typeConfig = getOrderTypeConfig(order);
	const isLong = order.side === "B";

	return (
		<TableRow className={cn(positionsPanelRowHoverClass, isEven && positionsPanelRowStripeClass)}>
			<TableCell className={cn(positionsPanelTableCellClass, "text-center")}>
				<Checkbox
					checked={isSelected}
					onCheckedChange={(value) => onToggle(order.oid, value)}
					aria-label={`${t`Select order`} ${order.coin}`}
					disabled={isCancelling}
				/>
			</TableCell>
			<TableCell className={cn(positionsPanelTableCellClass, "whitespace-nowrap text-fg-muted")}>
				{formatDateTime(order.timestamp, { dateStyle: "short", timeStyle: "short" })}
			</TableCell>
			<TableCell className={cn(positionsPanelTableCellClass, "font-medium text-fg")}>
				<div className="flex items-center gap-1.5">
					<span
						className={cn("h-4 w-0.5 shrink-0 rounded-full", isLong ? "bg-success" : "bg-error")}
						aria-hidden="true"
					/>
					<Button
						variant="link"
						onClick={() => onSelectMarket(order.coin, isLong ? "buy" : "sell")}
						className="gap-1.5"
						aria-label={
							isLong ? t`Switch to ${order.coin} market, long order` : t`Switch to ${order.coin} market, short order`
						}
					>
						<AssetDisplay coin={order.coin} />
					</Button>
				</div>
			</TableCell>
			<TableCell className={cn(positionsPanelTableCellClass, "text-fg")}>
				<Tooltip content={typeConfig.fullLabel}>
					<span className={cn("text-2xs uppercase whitespace-nowrap", typeConfig.class)}>{typeConfig.shortLabel}</span>
				</Tooltip>
			</TableCell>
			<TableCell className={cn(positionsPanelTableCellClass, "text-right tabular-nums text-fg")}>
				<span className="text-xs font-semibold tabular-nums leading-tight">
					{isMarketTriggerOrder(order) ? t`Market` : formatPrice(order.limitPx, { szDecimals })}
				</span>
			</TableCell>
			<TableCell className={cn(positionsPanelTableCellClass, "text-right text-fg")}>
				{isClosePositionOrder(order) ? (
					<span className="text-xs font-semibold text-fg-muted">{t`Close Position`}</span>
				) : (
					<div className="flex flex-col items-end gap-px">
						<span className="text-xs font-semibold tabular-nums leading-tight">
							{formatToken(order.origSz, { decimals: szDecimals, symbol: order.coin })}
						</span>
						<span className="text-2xs text-fg-muted tabular-nums leading-tight">
							({formatUSD(getOrderValue(order), { compact: true })})
						</span>
					</div>
				)}
			</TableCell>
			<TableCell className={cn(positionsPanelTableCellClass, "text-fg-muted")}>
				{order.triggerCondition || FALLBACK_VALUE_PLACEHOLDER}
			</TableCell>
			<TableCell className={cn(positionsPanelTableCellClass, "text-fg")}>
				{order.reduceOnly ? (
					<span className="text-brand">{t`Yes`}</span>
				) : (
					<span className="text-fg-muted">{t`No`}</span>
				)}
			</TableCell>
			<TableCell className={cn(positionsPanelTableCellClass, "text-right")}>
				<Button
					variant="link"
					size="sm"
					aria-label={t`Cancel order`}
					onClick={() => onCancel([order])}
					disabled={!canCancel}
				>
					{isCancelling ? t`Canceling...` : t`Cancel`}
				</Button>
			</TableCell>
		</TableRow>
	);
}
