import { FireIcon } from "@phosphor-icons/react";
import { Skeleton } from "boneyard-js/react";
import { UI_TEXT } from "@/config/ui-text";
import { get24hChange, getOiUsd } from "@/domain/market";
import { cn } from "@/lib/cn";
import { formatPercent, formatUSD } from "@/lib/format";
import { useSelectedMarketInfo } from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import { getValueColorClass } from "@/lib/ui/value-color";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useMarketActions } from "@/stores/use-market-store";
import { TokenSelector } from "../chart/token-selector";

const overviewText = UI_TEXT.MARKET_OVERVIEW;

interface Props {
	className?: string;
}

export function MobileMarketBar({ className }: Props) {
	const { data: market, isLoading } = useSelectedMarketInfo();
	const { scope } = useExchangeScope();
	const { setSelectedMarket } = useMarketActions();

	const fundingNum = toBig(market?.funding)?.toNumber() ?? 0;
	const change24h = get24hChange(market?.prevDayPx, market?.markPx);
	const oiUsd = getOiUsd(market?.openInterest, market?.markPx);
	const hasLeverage = typeof market?.maxLeverage === "number" && market.maxLeverage > 0;

	return (
		<div className={cn("shrink-0 bg-surface border-b border-stroke-weak/60", className)}>
			<div className="px-3 py-2 flex items-center justify-between gap-3">
				<div className="flex items-center gap-2 min-w-0">
					<TokenSelector selectedMarket={market} onValueChange={(name) => setSelectedMarket(scope, name)} />
					{hasLeverage && (
						<span className="shrink-0 rounded-xs bg-fill-weak px-1.5 py-0.5 text-2xs font-medium tabular-nums text-fg-muted">
							{market?.maxLeverage}x
						</span>
					)}
				</div>

				<Skeleton name="market-price" loading={isLoading}>
					<div className="text-right shrink-0">
						<div
							className={cn(
								"text-sm font-semibold tabular-nums",
								change24h !== null ? getValueColorClass(change24h) : "text-fg",
							)}
						>
							{formatUSD(market?.markPx ?? null)}
						</div>
						{typeof change24h === "number" && (
							<div className={cn("text-xs tabular-nums", getValueColorClass(change24h))}>
								{change24h >= 0 ? "+" : ""}
								{change24h.toFixed(2)}%
							</div>
						)}
					</div>
				</Skeleton>
			</div>

			<div className="px-3 py-1.5 border-t border-stroke-weak/40 bg-background overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				<Skeleton name="market-stats" loading={isLoading}>
					<div className="flex items-center gap-4 text-xs min-w-max">
						<StatPill label={overviewText.LABEL_ORACLE} value={formatUSD(market?.oraclePx)} />
						<StatPill
							label={overviewText.LABEL_VOLUME}
							value={formatUSD(market?.dayNtlVlm, { notation: "compact", compactDisplay: "short" })}
						/>
						<StatPill
							label={overviewText.LABEL_OPEN_INTEREST}
							value={formatUSD(oiUsd, { notation: "compact", compactDisplay: "short" })}
						/>
						<div className="flex items-center gap-1">
							<FireIcon className={cn("size-3", getValueColorClass(fundingNum))} />
							<span className={cn("tabular-nums font-medium", getValueColorClass(fundingNum))}>
								{formatPercent(fundingNum, { minimumFractionDigits: 4, signDisplay: "exceptZero" })}
							</span>
						</div>
					</div>
				</Skeleton>
			</div>
		</div>
	);
}

function StatPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center gap-1.5">
			<span className="text-fg-muted text-xs">{label}</span>
			<span className="tabular-nums text-fg text-xs">{value}</span>
		</div>
	);
}
