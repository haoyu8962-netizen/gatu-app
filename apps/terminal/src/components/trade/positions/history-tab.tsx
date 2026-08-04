import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { getToolbarNonZeroPnl } from "@/domain/trade/trading-toolbar-metrics";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useUserFills } from "@/hooks/trade/use-user-fills";
import { cn } from "@/lib/cn";
import { formatDateTimeShort, formatNumber, formatToken, formatUSD } from "@/lib/format";
import { getExplorerTxUrl, useMarkets } from "@/lib/hyperliquid";
import { getValueColorClass } from "@/lib/ui/value-color";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { AssetBadge } from "../components/asset-badge";
import { Placeholder } from "./placeholder";
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

export function HistoryTab() {
	const { error, fills, isConnected, status } = useUserFills();
	const navigateToMarket = useMarketNavigation();
	const markets = useMarkets();
	const isTestnet = useIsTestnet();

	const headerCount = isConnected ? `${fills.length} ${t`trades`}` : null;

	function renderPlaceholder() {
		if (!isConnected) return <Placeholder>{t`Connect your wallet to view trade history.`}</Placeholder>;
		if (status === "loading" || status === "idle") return <Placeholder>{t`Loading trade history...`}</Placeholder>;
		if (status === "error") {
			return (
				<Placeholder variant="error">
					<span>{t`Failed to load trade history.`}</span>
					{error instanceof Error && <span className="mt-1 text-xs text-fg-muted">{error.message}</span>}
				</Placeholder>
			);
		}
		if (fills.length === 0) return <Placeholder>{t`No fills found.`}</Placeholder>;
		return null;
	}

	const placeholder = renderPlaceholder();

	return (
		<div className={positionsPanelTabRootClass}>
			<div className={positionsPanelTableCaptionRowClass}>
				{headerCount ? <span className="tabular-nums text-3xs text-fg-muted">{headerCount}</span> : null}
			</div>
			<div className={positionsPanelTableShellClass}>
				{placeholder ?? (
					<ScrollArea className="h-full w-full">
						<Table className="table-fixed min-w-[50rem] w-full">
							<TableHeader className={positionsPanelTableHeaderClass}>
								<TableRow className={positionsPanelTableHeaderRowClass}>
									<TableHead scope="col" size="dense" className={cn(positionsPanelTableHeadClass, "w-[14%] text-left")}>
										{t`Asset`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(positionsPanelTableHeadClass, "w-[12%] text-left")}>
										{t`Type`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[14%] text-right")}
									>
										{t`Price`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[14%] text-right")}
									>
										{t`Size`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[14%] text-right")}
									>
										{t`Fee`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[14%] text-right")}
									>
										{t`PNL`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[18%] text-right")}
									>
										{t`Time`}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className={positionsPanelTableBodyClass}>
								{fills.map((fill, i) => {
									const closedPnl = getToolbarNonZeroPnl(fill.closedPnl);
									const directionLabel =
										fill.dir === "Open Long"
											? t`Open Long`
											: fill.dir === "Close Long"
												? t`Close Long`
												: fill.dir === "Open Short"
													? t`Open Short`
													: fill.dir === "Close Short"
														? t`Close Short`
														: fill.dir;

									return (
										<TableRow
											key={`${fill.hash}-${fill.tid}`}
											className={cn(positionsPanelRowHoverClass, i % 2 === 1 && positionsPanelRowStripeClass)}
										>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, "font-medium text-fg")}>
												<AssetBadge
													coin={fill.coin}
													side={fill.side === "B" ? "buy" : "sell"}
													onClick={() => navigateToMarket(fill.coin)}
													aria-label={t`Switch to ${fill.coin} market`}
												/>
											</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, "text-fg")}>
												<span
													className={cn(
														"text-xs px-1 py-0.5 rounded-8 uppercase",
														fill.liquidation ? "bg-error-soft text-error" : "bg-surface/50",
													)}
												>
													{fill.liquidation ? t`Liquidated` : directionLabel}
												</span>
											</TableCell>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, "text-right tabular-nums text-fg")}
											>
												{formatUSD(fill.px)}
											</TableCell>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, "text-right tabular-nums text-fg")}
											>
												{formatNumber(fill.sz, markets.getSzDecimals(fill.coin))}
											</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, "text-right tabular-nums")}>
												<span className="text-fg-muted">
													{formatToken(fill.fee, {
														symbol: fill.feeToken,
													})}
												</span>
											</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, "text-right tabular-nums")}>
												{closedPnl ? (
													<span className={getValueColorClass(closedPnl)}>
														{formatUSD(closedPnl, {
															signDisplay: "exceptZero",
														})}
													</span>
												) : (
													<span className="text-fg-muted">{FALLBACK_VALUE_PLACEHOLDER}</span>
												)}
											</TableCell>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, "text-right tabular-nums text-fg-muted")}
											>
												<div className="flex flex-col items-end underline decoration-dashed decoration-fg-muted/30">
													<a
														className="flex items-center gap-1"
														href={getExplorerTxUrl(fill.hash, isTestnet)}
														target="_blank"
														rel="noopener noreferrer"
													>
														<span>{formatDateTimeShort(fill.time)}</span>
														<ArrowSquareOutIcon className="size-2.5 opacity-100 hover:opacity-80" aria-hidden="true" />
													</a>
												</div>
											</TableCell>
										</TableRow>
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
