import { t } from "@lingui/core/macro";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import { useConnection } from "wagmi";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/constants";
import { cn } from "@/lib/cn";
import { formatDateTime, formatToken, formatUSD } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
import { useSubUserHistoricalOrders } from "@/lib/hyperliquid/hooks/subscription";
import { getSideClass, getSideLabel } from "@/lib/trade/open-orders";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useMarketActions } from "@/stores/use-market-store";
import { AssetDisplay } from "../components/asset-display";

interface Props {
	className?: string;
}

export function MobileOrdersHistoryTab({ className }: Props) {
	const { address, isConnected } = useConnection();
	const { scope } = useExchangeScope();
	const { setSelectedMarket } = useMarketActions();
	const markets = useMarkets();
	const {
		data: historicalOrdersEvent,
		status,
		error,
	} = useSubUserHistoricalOrders({ user: address ?? "0x0" }, { enabled: isConnected && !!address });

	const orders =
		historicalOrdersEvent?.orderHistory
			?.slice()
			.sort((a, b) => b.statusTimestamp - a.statusTimestamp)
			.slice(0, 200) ?? [];

	const headerCount = isConnected ? `${orders.length}` : FALLBACK_VALUE_PLACEHOLDER;

	if (!isConnected) {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-text-500">
				{t`Connect your wallet to view order history.`}
			</div>
		);
	}

	if (status === "subscribing" || status === "idle") {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Spinner className="size-4 text-text-500" />
			</div>
		);
	}

	if (status === "error") {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-market-down">
				<span>{t`Failed to load order history.`}</span>
				{error instanceof Error && <span className="mt-1 text-3xs text-text-500">{error.message}</span>}
			</div>
		);
	}

	if (orders.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-text-500">
				{t`No order history found.`}
			</div>
		);
	}

	return (
		<div className={cn("flex-1 min-h-0 flex flex-col", className)}>
			<div className="px-3 py-2 flex items-center gap-2 text-3xs uppercase tracking-wider text-text-500">
				<ClockCounterClockwiseIcon className="size-3" />
				{t`Order History`}
				<span className="font-semibold text-primary-default ml-auto tabular-nums">{headerCount}</span>
			</div>
			<div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-2">
				{orders.map((entry) => {
					const { order } = entry;
					const market = markets.getMarket(order.coin);
					const isLong = order.side === "B";

					return (
						<div
							key={`${order.oid}-${entry.statusTimestamp}`}
							className={cn(
								"rounded-sm border bg-surface-base/50",
								isLong ? "border-market-up/30" : "border-market-down/30",
							)}
						>
							<div className="flex items-center justify-between px-3 py-2.5 border-b border-border/40">
								<Button
									variant="text"
									size="none"
									onClick={() => setSelectedMarket(scope, order.coin)}
									className="gap-2"
								>
									<AssetDisplay
										coin={order.coin}
										nameClassName="text-sm font-semibold"
										subtitle={
											<span className={cn("text-3xs font-medium uppercase", getSideClass(order.side))}>
												{getSideLabel(order.side, market?.kind)}
											</span>
										}
									/>
								</Button>
								<span
									className={cn(
										"text-xs px-1.5 py-0.5 rounded-sm capitalize",
										entry.status === "filled"
											? "bg-market-up/10 text-market-up"
											: entry.status === "canceled"
												? "bg-market-down/10 text-market-down"
												: "bg-surface-analysis text-text-500",
									)}
								>
									{entry.status}
								</span>
							</div>

							<div className="grid grid-cols-3 gap-px bg-border/20">
								<MetricCell label={t`Type`} value={order.orderType} />
								<MetricCell label={t`Price`} value={formatUSD(order.limitPx, { compact: false })} />
								<MetricCell label={t`Size`} value={formatToken(order.origSz, market?.szDecimals)} />
							</div>

							<div className="flex items-center justify-between px-3 py-2.5">
								<span className="text-3xs text-text-500 tabular-nums">
									{formatDateTime(order.timestamp, { dateStyle: "short", timeStyle: "short" })}
								</span>
								<span className="text-3xs text-text-500 tabular-nums">
									{t`Updated`} {formatDateTime(entry.statusTimestamp, { dateStyle: "short", timeStyle: "short" })}
								</span>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

interface MetricCellProps {
	label: string;
	value: string;
}

function MetricCell({ label, value }: MetricCellProps) {
	return (
		<div className="px-3 py-2 bg-surface-base/50">
			<div className="text-3xs text-text-500 mb-0.5">{label}</div>
			<div className="text-xs tabular-nums font-medium">{value}</div>
		</div>
	);
}
