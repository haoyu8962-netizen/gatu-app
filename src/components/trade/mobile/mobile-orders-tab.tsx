import { t } from "@lingui/core/macro";
import { ListNumbersIcon, XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { useConnection } from "wagmi";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/constants";
import { cn } from "@/lib/cn";
import { formatDateTime, formatPrice, formatToken, formatUSD } from "@/lib/format";
import { useExchange, useMarkets, useSubscription } from "@/lib/hyperliquid";
import type { MarketKind } from "@/lib/hyperliquid/markets/types";
import { getOrderTypeConfig, getOrderValue, getSideLabel, type OpenOrder } from "@/lib/trade/open-orders";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useMarketActions } from "@/stores/use-market-store";
import { AssetDisplay } from "../components/asset-display";
import { OrdersTabSkeleton } from "./mobile-card-skeleton";

interface Props {
	className?: string;
}

export function MobileOrdersTab({ className }: Props) {
	const { address, isConnected } = useConnection();
	const { scope } = useExchangeScope();
	const { setSelectedMarket } = useMarketActions();
	const markets = useMarkets();

	const {
		data: openOrdersEvent,
		status,
		error,
	} = useSubscription("openOrders", { user: address ?? "0x0" }, { enabled: isConnected && !!address });

	const {
		mutate: cancelOrders,
		isPending: isCancelling,
		error: cancelError,
		reset: resetCancelError,
	} = useExchange("cancel");

	const openOrders = openOrdersEvent?.orders ?? [];
	const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(() => new Set());

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
				if (openIds.has(id)) next.add(id);
			}
			return next;
		});
	}, [openOrders, selectedOrderIds]);

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
							for (const order of ordersToCancel) next.delete(order.oid);
							return next;
						});
					},
				},
			);
		},
		[isCancelling, markets, cancelOrders, resetCancelError],
	);

	const handleCancelAll = useCallback(() => {
		handleCancelOrders(openOrders);
	}, [handleCancelOrders, openOrders]);

	const headerCount = isConnected ? openOrders.length : FALLBACK_VALUE_PLACEHOLDER;
	const actionError = cancelError?.message;

	if (!isConnected) {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-text-500">
				{t`Connect your wallet to view open orders.`}
			</div>
		);
	}

	if (status === "subscribing" || status === "idle") {
		return <OrdersTabSkeleton />;
	}

	if (status === "error") {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-market-down">
				<span>{t`Failed to load open orders.`}</span>
				{error instanceof Error && <span className="mt-1 text-3xs text-text-500">{error.message}</span>}
			</div>
		);
	}

	if (openOrders.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-text-500">{t`No open orders.`}</div>
		);
	}

	return (
		<div className={cn("flex-1 min-h-0 flex flex-col", className)}>
			<div className="px-3 py-2 flex items-center gap-2 text-3xs uppercase tracking-wider text-text-500">
				<ListNumbersIcon className="size-3" />
				{t`Open Orders`}
				<span className="font-semibold text-primary-default tabular-nums">{headerCount}</span>
				<Button
					variant="text"
					size="sm"
					className="ml-auto text-market-down"
					onClick={handleCancelAll}
					disabled={isCancelling || openOrders.length === 0}
				>
					{isCancelling ? t`Canceling...` : t`Cancel All`}
				</Button>
			</div>
			{actionError && <div className="px-3 pb-1 text-3xs text-market-down">{actionError}</div>}
			<div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-2">
				{openOrders.map((order) => (
					<MobileOrderCard
						key={order.oid}
						order={order}
						szDecimals={markets.getSzDecimals(order.coin)}
						kind={markets.getMarket(order.coin)?.kind}
						isCancelling={isCancelling}
						onCancel={handleCancelOrders}
						onSelectMarket={(name) => setSelectedMarket(scope, name)}
					/>
				))}
			</div>
		</div>
	);
}

interface MobileOrderCardProps {
	order: OpenOrder;
	szDecimals: number;
	kind: MarketKind | undefined;
	isCancelling: boolean;
	onCancel: (orders: OpenOrder[]) => void;
	onSelectMarket: (marketName: string) => void;
}

function MobileOrderCard({ order, szDecimals, kind, isCancelling, onCancel, onSelectMarket }: MobileOrderCardProps) {
	const typeConfig = getOrderTypeConfig(order);
	const sideLabel = getSideLabel(order.side, kind);
	const isLong = order.side === "B";
	const orderValue = getOrderValue(order);

	return (
		<div
			className={cn(
				"rounded-sm border bg-surface-base/50",
				isLong ? "border-market-up-600/30" : "border-market-down-600/30",
			)}
		>
			<div className="flex items-center justify-between px-3 py-2.5 border-b border-border/40">
				<Button variant="text" size="none" onClick={() => onSelectMarket(order.coin)} className="gap-2">
					<AssetDisplay
						coin={order.coin}
						nameClassName="text-sm font-semibold"
						subtitle={
							<span
								className={cn("text-3xs font-medium uppercase", isLong ? "text-market-up-600" : "text-market-down-600")}
							>
								{sideLabel}
							</span>
						}
					/>
				</Button>
				<div className="flex items-center gap-2">
					<span className={cn("text-3xs px-1.5 py-0.5 rounded-sm uppercase", typeConfig.class)}>
						{typeConfig.label}
					</span>
					{order.reduceOnly && (
						<span className="text-3xs px-1.5 py-0.5 rounded-sm bg-primary-muted/20 text-primary-default uppercase">
							{t`RO`}
						</span>
					)}
				</div>
			</div>

			<div className="grid grid-cols-3 gap-px bg-border/20">
				<MetricCell label={t`Price`} value={formatPrice(order.limitPx, { szDecimals })} />
				<MetricCell
					label={t`Size`}
					value={formatToken(order.origSz, { decimals: szDecimals, symbol: order.coin })}
					sub={orderValue != null ? formatUSD(orderValue, { compact: true }) : undefined}
				/>
				<MetricCell label={t`Trigger`} value={order.triggerCondition || FALLBACK_VALUE_PLACEHOLDER} />
			</div>

			<div className="flex items-center justify-between px-3 py-2.5">
				<span className="text-3xs text-text-500 tabular-nums">
					{formatDateTime(order.timestamp, { dateStyle: "short", timeStyle: "short" })}
				</span>
				<Button
					variant="outlined"
					size="sm"
					onClick={() => onCancel([order])}
					disabled={isCancelling}
					className={cn(
						"min-h-[36px] text-xs gap-1",
						"border-market-down-600/60 text-market-down-600 hover:bg-market-down-600/10",
					)}
				>
					{isCancelling ? <Spinner className="size-3" /> : <XIcon className="size-3.5" />}
					{t`Cancel`}
				</Button>
			</div>
		</div>
	);
}

interface MetricCellProps {
	label: string;
	value: string;
	sub?: string;
}

function MetricCell({ label, value, sub }: MetricCellProps) {
	return (
		<div className="px-3 py-2 bg-surface-base/50">
			<div className="text-3xs text-text-500 mb-0.5">{label}</div>
			<div className="text-xs tabular-nums font-medium">{value}</div>
			{sub && <div className="text-3xs text-text-500 tabular-nums">{sub}</div>}
		</div>
	);
}
