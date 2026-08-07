import { useLingui } from "@lingui/react/macro";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { getMarketQuoteToken } from "@/domain/trade/balances";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useTwapSliceFills } from "@/hooks/trade/use-twap-slice-fills";
import { cn } from "@/lib/cn";
import { formatDateTimeShort, formatNumber, formatPrice, formatToken } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
import { getUserFillNotional } from "@/lib/trade/user-fills";
import { getMarketCloseValueColorClass } from "@/lib/ui/value-color";
import { Placeholder } from "./placeholder";
import { positionsPanelTableShellClass } from "./positions-panel-table-styles";

const twapFillGridClass =
	"grid min-w-[1230px] grid-cols-[150px_120px_130px_130px_150px_170px_150px_150px] gap-x-4 px-5";

export function TwapFillHistoryTable() {
	const { t } = useLingui();
	const { error, fills, isConnected, status } = useTwapSliceFills();
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
		if (status === "loading" || status === "idle") {
			return <Placeholder>{t`Loading TWAP fill history...`}</Placeholder>;
		}
		if (status === "error") {
			return (
				<Placeholder variant="error">
					<span>{t`Failed to load TWAP fill history.`}</span>
					{error instanceof Error && <span className="mt-1 text-xs text-fg-muted">{error.message}</span>}
				</Placeholder>
			);
		}
		if (fills.length === 0) return <Placeholder>{t`No TWAP fills found.`}</Placeholder>;
		return null;
	}

	const placeholder = renderPlaceholder();

	return (
		<div className={positionsPanelTableShellClass}>
			{placeholder ?? (
				<ScrollArea className="h-full w-full">
					<table aria-label={t`TWAP fill history`} className="block min-w-[1230px] border-collapse">
						<thead className="block">
							<tr
								className={cn(
									twapFillGridClass,
									"h-[33px] items-center border-b border-market-close-stroke-card text-[11px] font-semibold text-market-close-subtle",
								)}
							>
								<th scope="col" className="p-0 text-left font-semibold">{t`Time`}</th>
								<th scope="col" className="p-0 text-left font-semibold">{t`Market`}</th>
								<th scope="col" className="p-0 text-left font-semibold">{t`Direction`}</th>
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
												className="rounded-[4px] font-bold text-market-close-fg outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control"
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
					<ScrollBar orientation="horizontal" />
				</ScrollArea>
			)}
		</div>
	);
}
