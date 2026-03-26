import { t } from "@lingui/core/macro";
import { TimerIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useConnection } from "wagmi";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TimeTicker } from "@/components/ui/time-ticker";
import { FALLBACK_VALUE_PLACEHOLDER, HL_ALL_DEXS } from "@/config/constants";
import { getAvgPrice } from "@/domain/market";
import { cn } from "@/lib/cn";
import { formatDateTime, formatDuration, formatNumber, formatPrice } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
import { useSubTwapStates } from "@/lib/hyperliquid/hooks/subscription";
import { toBig } from "@/lib/trade/numbers";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useMarketActions } from "@/stores/use-market-store";
import { AssetDisplay } from "../components/asset-display";

interface Props {
	className?: string;
}

export function MobileTwapTab({ className }: Props) {
	const { address, isConnected } = useConnection();
	const { scope } = useExchangeScope();
	const { setSelectedMarket } = useMarketActions();
	const { data: twapStatesEvent } = useSubTwapStates(
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);
	const markets = useMarkets();

	const twapStates = twapStatesEvent?.states ?? [];
	const activeOrders = useMemo(
		() =>
			twapStates.map(([twapId, state]) => ({ twapId, state })).sort((a, b) => b.state.timestamp - a.state.timestamp),
		[twapStates],
	);

	const headerCount = isConnected ? `${activeOrders.length}` : FALLBACK_VALUE_PLACEHOLDER;
	const twapStatesStatus = twapStatesEvent ? "active" : "loading";

	if (!isConnected) {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-text-500">
				{t`Connect your wallet to view TWAP orders.`}
			</div>
		);
	}

	if (twapStatesStatus === "loading") {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Spinner className="size-4 text-text-500" />
			</div>
		);
	}

	if (activeOrders.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-text-500">
				{t`No active TWAP orders.`}
			</div>
		);
	}

	return (
		<div className={cn("flex-1 min-h-0 flex flex-col", className)}>
			<div className="px-3 py-2 flex items-center gap-2 text-3xs uppercase tracking-wider text-text-500">
				<TimerIcon className="size-3" />
				{t`TWAP Orders`}
				<span className="font-semibold text-primary-default ml-auto tabular-nums">{headerCount}</span>
			</div>
			<div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-2">
				{activeOrders.map(({ twapId, state }) => {
					const isBuy = state.side === "B";
					const totalSize = toBig(state.sz)?.toNumber() ?? Number.NaN;
					const executedSize = toBig(state.executedSz)?.toNumber() ?? 0;
					const avgPrice = getAvgPrice(state.executedNtl, state.executedSz);
					const szDecimals = markets.getSzDecimals(state.coin);
					const creationTime = state.timestamp;
					const totalMinutes = state.minutes;

					return (
						<div
							key={twapId}
							className={cn(
								"rounded-sm border bg-surface-base/50",
								isBuy ? "border-market-up-600/30" : "border-market-down-600/30",
							)}
						>
							<div className="flex items-center justify-between px-3 py-2.5 border-b border-border/40">
								<Button
									variant="text"
									size="none"
									onClick={() => setSelectedMarket(scope, state.coin)}
									className="gap-2"
								>
									<AssetDisplay
										coin={state.coin}
										nameClassName="text-sm font-semibold"
										subtitle={
											<span
												className={cn(
													"text-3xs font-medium uppercase",
													isBuy ? "text-market-up-600" : "text-market-down-600",
												)}
											>
												{isBuy ? t`Buy` : t`Sell`}
											</span>
										}
									/>
								</Button>
								<div className="flex items-center gap-2">
									{state.reduceOnly && (
										<span className="text-3xs px-1.5 py-0.5 rounded-sm bg-primary-muted/20 text-primary-default uppercase">
											{t`RO`}
										</span>
									)}
									<Button
										variant="outlined"
										size="sm"
										className={cn(
											"min-h-[36px] text-xs",
											"border-market-down-600/60 text-market-down-600 hover:bg-market-down-600/10",
										)}
									>
										{t`Cancel`}
									</Button>
								</div>
							</div>

							<div className="grid grid-cols-3 gap-px bg-border/20">
								<MetricCell label={t`Size`} value={formatNumber(totalSize, szDecimals)} />
								<MetricCell
									label={t`Executed`}
									value={formatNumber(executedSize, szDecimals)}
									valueClass={isBuy ? "text-market-up-600" : "text-market-down-600"}
								/>
								<MetricCell label={t`Avg Price`} value={formatPrice(avgPrice, { szDecimals })} />
							</div>

							<div className="flex items-center justify-between px-3 py-2.5">
								<div className="text-xs tabular-nums text-text-500">
									<TimeTicker startTime={creationTime} durationMs={totalMinutes * 60 * 1000} isActive={true} />
									{" / "}
									{formatDuration(totalMinutes)}
								</div>
								<span className="text-3xs text-text-500 tabular-nums">
									{formatDateTime(creationTime, { dateStyle: "short", timeStyle: "short" })}
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
	valueClass?: string;
}

function MetricCell({ label, value, valueClass }: MetricCellProps) {
	return (
		<div className="px-3 py-2 bg-surface-base/50">
			<div className="text-3xs text-text-500 mb-0.5">{label}</div>
			<div className={cn("text-xs tabular-nums font-medium", valueClass)}>{value}</div>
		</div>
	);
}
