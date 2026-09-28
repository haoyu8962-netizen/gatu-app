import { Button } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { TwapHistoryLoadMore, TwapRealtimeRetry } from "@/components/trade/twap-history-feedback";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getMarketQuoteToken } from "@/domain/trade/balances";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useTwapFillHistoryCsv } from "@/hooks/trade/use-twap-fill-history-csv";
import { useTwapSliceFills } from "@/hooks/trade/use-twap-slice-fills";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatDateTimeShort, formatNumber, formatPrice, formatToken } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { getUserFillNotional } from "@/lib/trade/user-fills";
import { getMarketCloseValueColorClass } from "@/lib/ui/value-color";
import { PassiveDataPlaceholder } from "./passive-data-placeholder";
import { Placeholder } from "./placeholder";
import { positionsPanelTableShellClass } from "./positions-panel-table-styles";

const twapFillGridClass =
	"grid min-w-[1230px] grid-cols-[150px_120px_130px_130px_150px_170px_150px_150px] gap-x-4 px-5";
const twapFillFooterButtonClass =
	"h-auto min-h-0 rounded-none p-0 text-xs font-normal text-market-close-muted shadow-none transition-colors duration-[120ms] hover:bg-transparent hover:text-market-close-fg active:not-data-disabled:scale-100 data-disabled:text-market-close-subtle";

export function TwapFillHistoryTable() {
	useNumberFormatRevision();
	const { t } = useLingui();
	const { fills, hasMore, isConnected, isRealtimeDegraded, loadMore, retryRealtime, status } = useTwapSliceFills();
	const { address } = useWalletSession();
	const { exportCsv, isExporting } = useTwapFillHistoryCsv();
	const navigateToMarket = useMarketNavigation();
	const markets = useMarkets();

	function getDirectionLabel(direction: string) {
		if (direction === "Open Long") return t`Open Long`;
		if (direction === "Close Long") return t`Close Long`;
		if (direction === "Open Short") return t`Open Short`;
		if (direction === "Close Short") return t`Close Short`;
		return direction;
	}

	function renderPlaceholder() {
		if (!isConnected) return <Placeholder>{t`Connect your wallet to view TWAP fill history.`}</Placeholder>;
		if (status === "loading" || status === "idle") return <PassiveDataPlaceholder busy />;
		if (status !== "ready" || (fills.length === 0 && isRealtimeDegraded)) return <PassiveDataPlaceholder />;
		if (fills.length === 0) return <Placeholder>{t`No TWAP fills found.`}</Placeholder>;
		return null;
	}

	const placeholder = renderPlaceholder();

	return (
		<>
			<div className={positionsPanelTableShellClass}>
				{isRealtimeDegraded ? <TwapRealtimeRetry onRetry={retryRealtime} /> : null}
				{placeholder ?? (
					<ScrollArea className="min-h-0 flex-1 w-full">
						<table aria-label={t`TWAP fill history`} className="block min-w-[1230px] border-collapse">
							<thead className="block">
								<tr
									className={cn(
										twapFillGridClass,
										"h-[33px] items-center border-b border-market-close-stroke-card text-[11px] font-semibold text-market-close-subtle",
									)}
								>
									<th scope="col" className="p-0 text-start font-semibold">{t`Time`}</th>
									<th scope="col" className="p-0 text-start font-semibold">{t`Market`}</th>
									<th scope="col" className="p-0 text-start font-semibold">{t`Direction`}</th>
									<th scope="col" className="p-0 text-right font-semibold">{t`Price`}</th>
									<th scope="col" className="p-0 text-right font-semibold">{t`Size`}</th>
									<th scope="col" className="p-0 text-right font-semibold">{t`Trade Value`}</th>
									<th scope="col" className="p-0 text-right font-semibold">{t`Fee`}</th>
									<th scope="col" className="p-0 text-right font-semibold">{t`Closed PNL`}</th>
								</tr>
							</thead>
							<tbody className="block">
								{fills.map((fill) => {
									const market = markets.getMarket(fill.coin);
									const marketLabel = market?.shortName ?? fill.coin;
									const szDecimals = markets.getSzDecimals(fill.coin);
									const isBuy = fill.side === "B";
									const notional = getUserFillNotional(fill);
									const quoteToken = getMarketQuoteToken(market);

									return (
										<tr
											key={`${fill.twapId}:${fill.tid}:${fill.oid}:${fill.time}`}
											className={cn(
												twapFillGridClass,
												"h-[43px] items-center border-b border-market-close-stroke-card/60 text-[13px] transition-colors duration-[120ms] hover:bg-market-close-hover",
											)}
										>
											<td className="p-0 whitespace-nowrap text-market-close-muted tabular-nums">
												{formatDateTimeShort(fill.time)}
											</td>
											<td className="p-0">
												<button
													type="button"
													onClick={() => navigateToMarket(fill.coin)}
													aria-label={t`Switch to ${marketLabel} market`}
													className="rounded-[4px] font-bold text-market-close-fg outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus"
												>
													{marketLabel}
												</button>
											</td>
											<td
												className={cn(
													"p-0 whitespace-nowrap font-semibold",
													isBuy ? "text-market-close-success" : "text-market-close-danger",
												)}
											>
												{getDirectionLabel(fill.dir)}
											</td>
											<td className="p-0 text-right text-market-close-fg tabular-nums">
												{formatPrice(fill.px, {
													szDecimals,
													marketType: market?.kind === "spot" ? "spot" : "perp",
												})}
											</td>
											<td className="p-0 text-right text-market-close-fg tabular-nums">
												{formatNumber(fill.sz, szDecimals)} {marketLabel}
											</td>
											<td className="p-0 text-right text-market-close-fg tabular-nums">
												{formatToken(notional, { compact: false, decimals: 2, symbol: quoteToken })}
											</td>
											<td className="p-0 text-right text-market-close-fg tabular-nums">
												{formatToken(fill.fee, { compact: false, symbol: fill.feeToken })}
											</td>
											<td
												className={cn(
													"p-0 text-right font-semibold tabular-nums",
													getMarketCloseValueColorClass(fill.closedPnl),
												)}
											>
												{formatToken(fill.closedPnl, {
													compact: false,
													decimals: 2,
													signDisplay: "exceptZero",
													symbol: fill.feeToken,
												})}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
						{hasMore ? <TwapHistoryLoadMore className="min-w-[1230px]" onLoadMore={loadMore} /> : null}
					</ScrollArea>
				)}
			</div>
			{isConnected && address ? (
				<div className="flex h-[38px] shrink-0 items-center gap-4 px-5" data-testid="twap-fill-history-footer">
					<Button
						variant="ghost"
						intent="neutral"
						size="xxs"
						className={twapFillFooterButtonClass}
						disabled={isExporting}
						onClick={() => void exportCsv()}
					>
						{t`Export CSV`}
					</Button>
				</div>
			) : null}
		</>
	);
}
