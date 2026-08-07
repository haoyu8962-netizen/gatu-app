import { useLingui } from "@lingui/react/macro";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useOrderDisplayLabels } from "@/hooks/trade/use-order-display-labels";
import { useTwapHistory } from "@/hooks/trade/use-twap-history";
import { cn } from "@/lib/cn";
import { formatClockDuration, formatDateTimeShort, formatNumber, formatPrice } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
import { getTwapAverageFillPrice, getTwapHistoryDurationMs, getTwapHistoryTimeMs } from "@/lib/trade/order-history";
import type { MobileDataScrollMode } from "./mobile-positions-view";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

interface Props {
	className?: string;
	scrollMode?: MobileDataScrollMode;
}

export function MobileTwapHistoryList({ className, scrollMode = "contained" }: Props) {
	const { t } = useLingui();
	const { error, history, isConnected, status } = useTwapHistory();
	const { getTwapHistoryStatusLabel } = useOrderDisplayLabels();
	const navigateToMarket = useMarketNavigation();
	const { setActiveTab } = useMobileTerminalTab();
	const markets = useMarkets();
	const isPageScroll = scrollMode === "page";

	function handleSelectMarket(name: string) {
		navigateToMarket(name, undefined, { displayedContent: "trade" });
		setActiveTab("trade");
	}

	if (!isConnected) {
		return (
			<div className="flex flex-1 items-center justify-center p-6 text-sm text-market-close-muted">{t`Connect your wallet to view TWAP history.`}</div>
		);
	}

	if (status === "error") {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-sm text-market-close-danger">
				<span>{t`Failed to load TWAP history.`}</span>
				{error instanceof Error && <span className="text-xs text-market-close-muted">{error.message}</span>}
			</div>
		);
	}

	if (status === "loading" || status === "idle") {
		return (
			<div className="flex flex-1 items-center justify-center p-6 text-sm text-market-close-muted">{t`Loading TWAP history...`}</div>
		);
	}

	if (history.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center p-6 text-sm text-market-close-muted">{t`No TWAP history found.`}</div>
		);
	}

	return (
		<div
			className={cn(
				"font-market-close flex min-h-0 flex-col gap-2.5 px-3.5 py-3",
				!isPageScroll && "flex-1 overflow-y-auto overscroll-y-contain",
				className,
			)}
		>
			{history.map((entry) => {
				const market = markets.getMarket(entry.state.coin);
				const marketLabel = market?.shortName ?? entry.state.coin;
				const szDecimals = markets.getSzDecimals(entry.state.coin);
				const priceOptions = {
					szDecimals,
					marketType: market?.kind === "spot" ? ("spot" as const) : ("perp" as const),
				};
				const averageFillPrice = getTwapAverageFillPrice(entry);
				const statusLabel = getTwapHistoryStatusLabel(entry.status.status);
				const eventKey = `${entry.twapId ?? entry.state.timestamp}:${entry.time}:${entry.status.status}`;

				return (
					<article
						key={eventKey}
						className="flex flex-col gap-3 rounded-[14px] border border-market-close-stroke-card bg-modal px-3.5 py-3"
					>
						<div className="flex min-w-0 items-start justify-between gap-3">
							<button
								type="button"
								onClick={() => handleSelectMarket(entry.state.coin)}
								aria-label={t`Switch to ${marketLabel} market`}
								className="-my-2 min-h-11 min-w-0 truncate rounded-[4px] text-sm font-bold text-market-close-fg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control"
							>
								{marketLabel}
							</button>
							<div className="flex shrink-0 flex-col items-end gap-0.5">
								<span
									className={cn(
										"text-xs font-semibold",
										entry.status.status === "finished" && "text-market-close-success",
										entry.status.status === "error" && "text-market-close-danger",
										entry.status.status !== "finished" && entry.status.status !== "error" && "text-market-close-muted",
									)}
								>
									{statusLabel}
								</span>
								<span className="text-[10px] text-market-close-subtle tabular-nums">
									{formatDateTimeShort(getTwapHistoryTimeMs(entry))}
								</span>
							</div>
						</div>

						<div className="grid grid-cols-3 gap-x-2.5 gap-y-3">
							<div className="min-w-0">
								<div className="truncate text-[10px] text-market-close-subtle">{t`Total Size`}</div>
								<div className="truncate text-xs font-semibold text-market-close-fg tabular-nums">
									{formatNumber(entry.state.sz, szDecimals)} {marketLabel}
								</div>
							</div>
							<div className="min-w-0">
								<div className="truncate text-[10px] text-market-close-subtle">{t`Executed Size`}</div>
								<div className="truncate text-xs font-semibold text-market-close-fg tabular-nums">
									{averageFillPrice === null
										? FALLBACK_VALUE_PLACEHOLDER
										: `${formatNumber(entry.state.executedSz, szDecimals)} ${marketLabel}`}
								</div>
							</div>
							<div className="min-w-0">
								<div className="truncate text-[10px] text-market-close-subtle">{t`Average Price`}</div>
								<div className="truncate text-xs font-semibold text-market-close-fg tabular-nums">
									{formatPrice(averageFillPrice, priceOptions)}
								</div>
							</div>
							<div className="min-w-0">
								<div className="truncate text-[10px] text-market-close-subtle">{t`Total Run Time`}</div>
								<div className="truncate text-xs font-semibold text-market-close-fg tabular-nums">
									{formatClockDuration(getTwapHistoryDurationMs(entry))}
								</div>
							</div>
							<div className="min-w-0">
								<div className="truncate text-[10px] text-market-close-subtle">{t`Trigger Price`}</div>
								<div className="truncate text-xs font-semibold text-market-close-fg tabular-nums">
									{formatPrice(entry.state.trigger?.px, priceOptions)}
								</div>
							</div>
							<div className="min-w-0">
								<div className="truncate text-[10px] text-market-close-subtle">{t`Highest / Lowest Price`}</div>
								<div className="truncate text-xs font-semibold text-market-close-fg tabular-nums">
									{formatPrice(entry.state.stopPx, priceOptions)}
								</div>
							</div>
							<div className="min-w-0">
								<div className="truncate text-[10px] text-market-close-subtle">{t`Reduce Only`}</div>
								<div className="text-xs font-semibold text-market-close-fg">
									{entry.state.reduceOnly ? t`Yes` : t`No`}
								</div>
							</div>
							<div className="min-w-0">
								<div className="truncate text-[10px] text-market-close-subtle">{t`Randomized`}</div>
								<div className="text-xs font-semibold text-market-close-fg">
									{entry.state.randomize ? t`Yes` : t`No`}
								</div>
							</div>
						</div>

						{entry.status.status === "error" ? (
							<p className="border-t border-market-close-stroke-card pt-2.5 text-xs text-market-close-danger">
								{entry.status.description}
							</p>
						) : null}
					</article>
				);
			})}
		</div>
	);
}
