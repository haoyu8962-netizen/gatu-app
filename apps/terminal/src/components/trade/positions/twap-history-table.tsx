import { useLingui } from "@lingui/react/macro";
import { TwapHistoryLoadMore, TwapRealtimeWarning } from "@/components/trade/twap-history-feedback";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useOrderDisplayLabels } from "@/hooks/trade/use-order-display-labels";
import { useTwapHistory } from "@/hooks/trade/use-twap-history";
import { cn } from "@/lib/cn";
import { formatClockDuration, formatDateTimeShort, formatNumber, formatPrice } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { getTwapAverageFillPrice, getTwapHistoryDurationMs, getTwapHistoryTimeMs } from "@/lib/trade/order-history";
import { Placeholder } from "./placeholder";
import { positionsPanelTableShellClass } from "./positions-panel-table-styles";

const twapHistoryGridClass =
	"grid min-w-[1570px] grid-cols-[150px_120px_140px_140px_130px_120px_130px_150px_90px_90px_110px] gap-x-4 px-5";

export function TwapHistoryTable() {
	useNumberFormatRevision();
	const { t } = useLingui();
	const { error, hasMore, history, isConnected, isRealtimeDegraded, loadMore, realtimeError, retryRealtime, status } =
		useTwapHistory();
	const { getTwapHistoryStatusLabel } = useOrderDisplayLabels();
	const navigateToMarket = useMarketNavigation();
	const markets = useMarkets();

	function renderPlaceholder() {
		if (!isConnected) return <Placeholder>{t`Connect your wallet to view TWAP history.`}</Placeholder>;
		if (status === "loading" || status === "idle") return <Placeholder>{t`Loading TWAP history...`}</Placeholder>;
		if (status === "error") {
			return (
				<Placeholder variant="error">
					<span>{t`Failed to load TWAP history.`}</span>
					{error instanceof Error && <span className="mt-1 text-xs text-fg-muted">{error.message}</span>}
				</Placeholder>
			);
		}
		if (history.length === 0) return <Placeholder>{t`No TWAP history found.`}</Placeholder>;
		return null;
	}

	const placeholder = renderPlaceholder();

	return (
		<div className={positionsPanelTableShellClass}>
			{isRealtimeDegraded ? <TwapRealtimeWarning error={realtimeError} onRetry={retryRealtime} /> : null}
			{placeholder ?? (
				<ScrollArea className="min-h-0 flex-1 w-full">
					<table aria-label={t`TWAP history`} className="block min-w-[1570px] border-collapse">
						<thead className="block">
							<tr
								className={cn(
									twapHistoryGridClass,
									"h-[33px] items-center border-b border-market-close-stroke-card text-[11px] font-semibold text-market-close-subtle",
								)}
							>
								<th scope="col" className="p-0 text-left font-semibold">{t`Time`}</th>
								<th scope="col" className="p-0 text-left font-semibold">{t`Market`}</th>
								<th scope="col" className="p-0 text-right font-semibold">{t`Total Size`}</th>
								<th scope="col" className="p-0 text-right font-semibold">{t`Executed Size`}</th>
								<th scope="col" className="p-0 text-right font-semibold">{t`Average Price`}</th>
								<th scope="col" className="p-0 text-right font-semibold">{t`Total Run Time`}</th>
								<th scope="col" className="p-0 text-right font-semibold">{t`Trigger Price`}</th>
								<th scope="col" className="p-0 text-right font-semibold">{t`Highest / Lowest Price`}</th>
								<th scope="col" className="p-0 text-center font-semibold">{t`Reduce Only`}</th>
								<th scope="col" className="p-0 text-center font-semibold">{t`Randomized`}</th>
								<th scope="col" className="p-0 text-right font-semibold">{t`Status`}</th>
							</tr>
						</thead>
						<tbody className="block">
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
								const statusDescription = entry.status.status === "error" ? entry.status.description : undefined;
								const eventKey = `${entry.twapId ?? entry.state.timestamp}:${entry.time}:${entry.status.status}`;

								return (
									<tr
										key={eventKey}
										className={cn(
											twapHistoryGridClass,
											"h-[43px] items-center border-b border-market-close-stroke-card/60 text-[13px] transition-colors duration-[120ms] hover:bg-market-close-hover",
										)}
									>
										<td className="p-0 whitespace-nowrap text-market-close-muted tabular-nums">
											{formatDateTimeShort(getTwapHistoryTimeMs(entry))}
										</td>
										<td className="p-0">
											<button
												type="button"
												onClick={() => navigateToMarket(entry.state.coin)}
												aria-label={t`Switch to ${marketLabel} market`}
												className="rounded-[4px] font-bold text-market-close-fg outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control"
											>
												{marketLabel}
											</button>
										</td>
										<td className="p-0 text-right text-market-close-fg tabular-nums">
											{formatNumber(entry.state.sz, szDecimals)} {marketLabel}
										</td>
										<td className="p-0 text-right text-market-close-fg tabular-nums">
											{averageFillPrice === null
												? FALLBACK_VALUE_PLACEHOLDER
												: `${formatNumber(entry.state.executedSz, szDecimals)} ${marketLabel}`}
										</td>
										<td className="p-0 text-right text-market-close-fg tabular-nums">
											{formatPrice(averageFillPrice, priceOptions)}
										</td>
										<td className="p-0 text-right text-market-close-fg tabular-nums">
											{formatClockDuration(getTwapHistoryDurationMs(entry))}
										</td>
										<td className="p-0 text-right text-market-close-fg tabular-nums">
											{formatPrice(entry.state.trigger?.px, priceOptions)}
										</td>
										<td className="p-0 text-right text-market-close-fg tabular-nums">
											{formatPrice(entry.state.stopPx, priceOptions)}
										</td>
										<td className="p-0 text-center text-market-close-muted">
											{entry.state.reduceOnly ? t`Yes` : t`No`}
										</td>
										<td className="p-0 text-center text-market-close-muted">
											{entry.state.randomize ? t`Yes` : t`No`}
										</td>
										<td
											title={statusDescription}
											className={cn(
												"p-0 text-right font-semibold",
												entry.status.status === "finished" && "text-market-close-success",
												entry.status.status === "error" && "text-market-close-danger",
												entry.status.status !== "finished" &&
													entry.status.status !== "error" &&
													"text-market-close-muted",
											)}
										>
											{statusLabel}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
					{hasMore ? <TwapHistoryLoadMore className="min-w-[1570px]" onLoadMore={loadMore} /> : null}
				</ScrollArea>
			)}
		</div>
	);
}
