import { useLingui } from "@lingui/react/macro";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@sairn/ui";
import { Link } from "@tanstack/react-router";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { RECENT_ACCOUNT_HISTORY_ROWS } from "@/config/trade";
import { getToolbarNonZeroPnl } from "@/domain/trade/trading-toolbar-metrics";
import { useUserFillsCsvExport } from "@/hooks/trade/use-history-csv-export";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useUserFills } from "@/hooks/trade/use-user-fills";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { buildCsvRows } from "@/lib/csv";
import { formatDateTimeShort, useNumberFormat } from "@/lib/format";
import { getExplorerTxUrl, useMarkets } from "@/lib/hyperliquid";
import { getUserFillKey, hasUserFillExplorerTransaction } from "@/lib/trade/user-fills";
import { getMarketCloseValueColorClass } from "@/lib/ui/value-color";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { AssetBadge } from "../components/asset-badge";
import { PassiveDataPlaceholder } from "./passive-data-placeholder";
import { Placeholder } from "./placeholder";
import {
	positionsPanelTableBodyClass,
	positionsPanelTableCellClass,
	positionsPanelTableHeaderRowClass,
	positionsPanelTableShellClass,
	positionsPanelTabRootClass,
} from "./positions-panel-table-styles";

const historyTableHeadClass =
	"sticky top-0 z-[1] h-[33px] bg-surface px-2 py-0 text-2xs leading-4 font-semibold normal-case tracking-normal text-market-close-subtle";
const historyTableCellClass = "h-[43px] px-2 py-0 text-2sm leading-[18px]";
const historyAssetClass =
	"h-auto min-h-0 rounded-[4px] border-0 bg-transparent p-0 shadow-none hover:bg-transparent active:not-data-disabled:scale-100";
const historyFooterButtonClass =
	"h-auto min-h-0 rounded-none p-0 text-xs font-normal text-market-close-muted shadow-none transition-colors duration-[120ms] hover:bg-transparent hover:text-market-close-fg active:not-data-disabled:scale-100 data-disabled:text-market-close-subtle";

export function HistoryTab() {
	const { i18n, t } = useLingui();
	const locale = i18n.locale;
	const { formatNumber, formatToken, formatUSD } = useNumberFormat();
	const { error, fills, isConnected, isOffline, isStale, status } = useUserFills();
	const { address } = useWalletSession();
	const navigateToMarket = useMarketNavigation();
	const markets = useMarkets();
	const isTestnet = useIsTestnet();
	const visibleFills = fills.slice(0, RECENT_ACCOUNT_HISTORY_ROWS);

	function getDirectionLabel(direction: string) {
		if (direction === "Open Long") return t`Open Long`;
		if (direction === "Close Long") return t`Close Long`;
		if (direction === "Open Short") return t`Open Short`;
		if (direction === "Close Short") return t`Close Short`;
		return direction;
	}

	const { exportCsv, isExporting } = useUserFillsCsvExport({
		filename: "trade_history.csv",
		buildRows: (exportFills) =>
			buildCsvRows(exportFills, [
				{ header: t`Time`, getValue: (fill) => formatDateTimeShort(fill.time, { locale: i18n.locale }) },
				{ header: t`Asset`, getValue: (fill) => fill.coin },
				{ header: t`Direction`, getValue: (fill) => (fill.liquidation ? t`Liquidated` : getDirectionLabel(fill.dir)) },
				{ header: t`Type`, getValue: () => t`Trade` },
				{ header: t`Price`, getValue: (fill) => formatUSD(fill.px) },
				{ header: t`Size`, getValue: (fill) => formatNumber(fill.sz, markets.getSzDecimals(fill.coin)) },
				{ header: t`Fee`, getValue: (fill) => formatToken(fill.fee, { symbol: fill.feeToken }) },
				{
					header: t`PNL`,
					getValue: (fill) => {
						const closedPnl = getToolbarNonZeroPnl(fill.closedPnl);
						return closedPnl ? formatUSD(closedPnl, { signDisplay: "exceptZero" }) : FALLBACK_VALUE_PLACEHOLDER;
					},
				},
				{
					header: t`Transaction`,
					getValue: (fill) => (hasUserFillExplorerTransaction(fill) ? fill.hash : FALLBACK_VALUE_PLACEHOLDER),
				},
			]),
	});

	function renderPlaceholder() {
		if (!isConnected) return <Placeholder>{t`Connect your wallet to view trade history.`}</Placeholder>;
		if (status === "loading" || status === "idle") return <PassiveDataPlaceholder busy />;
		if (status !== "ready" || (fills.length === 0 && (error || isOffline || isStale)))
			return <PassiveDataPlaceholder />;
		if (fills.length === 0) return <Placeholder>{t`No fills found.`}</Placeholder>;
		return null;
	}

	const placeholder = renderPlaceholder();

	return (
		<div className={positionsPanelTabRootClass}>
			<div className={positionsPanelTableShellClass}>
				{placeholder ?? (
					<ScrollArea className="h-full w-full">
						<Table
							containerClassName="overflow-visible"
							className="table-fixed min-w-[53rem] w-full font-market-close tabular-nums"
						>
							<colgroup>
								<col className="w-[132px]" />
								<col className="w-[116px]" />
								<col className="w-[72px]" />
								<col className="w-[100px]" />
								<col className="w-[100px]" />
								<col className="w-[100px]" />
								<col className="w-[100px]" />
								<col className="w-[128px]" />
							</colgroup>
							<TableHeader className="bg-surface [&_tr]:border-market-close-stroke-card [&_tr]:border-t-0">
								<TableRow className={positionsPanelTableHeaderRowClass}>
									<TableHead scope="col" size="dense" className={cn(historyTableHeadClass, "ps-5 text-start")}>
										{t`Asset`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(historyTableHeadClass, "text-start")}>
										{t`Direction`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(historyTableHeadClass, "text-start")}>
										{t`Type`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(historyTableHeadClass, "text-right")}>
										{t`Price`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(historyTableHeadClass, "text-right")}>
										{t`Size`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(historyTableHeadClass, "text-right")}>
										{t`Fee`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(historyTableHeadClass, "text-right")}>
										{t`PNL`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(historyTableHeadClass, "pe-5 text-right")}>
										{t`Time`}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className={cn(positionsPanelTableBodyClass, "[&_tr]:border-market-close-stroke-card/60")}>
								{visibleFills.map((fill) => {
									const closedPnl = getToolbarNonZeroPnl(fill.closedPnl);
									const directionLabel = getDirectionLabel(fill.dir);
									const hasExplorerTransaction = hasUserFillExplorerTransaction(fill);

									return (
										<TableRow
											key={getUserFillKey(fill)}
											className="transition-colors duration-[120ms] hover:bg-market-close-card"
										>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, historyTableCellClass, "ps-5 font-bold")}
											>
												<AssetBadge
													coin={fill.coin}
													side={fill.side === "B" ? "buy" : "sell"}
													onClick={() => navigateToMarket(fill.coin)}
													aria-label={t`Switch to ${fill.coin} market`}
													className={historyAssetClass}
													nameClassName="text-2sm leading-[18px] font-bold text-market-close-fg"
													fit
												/>
											</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, historyTableCellClass)}>
												<span
													className={cn(
														"inline-flex w-fit whitespace-nowrap rounded-[4px] px-2 py-0.5 text-2xs leading-[14px] font-semibold",
														fill.liquidation
															? "bg-error-soft text-market-close-danger"
															: fill.dir === "Open Long" || fill.dir === "Open Short"
																? "bg-success-soft text-market-close-success"
																: "bg-market-close-hover text-market-close-muted",
													)}
												>
													{fill.liquidation ? t`Liquidated` : directionLabel}
												</span>
											</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, historyTableCellClass)}>
												<span className="text-xs font-semibold text-market-close-muted">{t`Trade`}</span>
											</TableCell>
											<TableCell
												size="dense"
												className={cn(
													positionsPanelTableCellClass,
													historyTableCellClass,
													"text-right text-market-close-fg",
												)}
											>
												{formatUSD(fill.px)}
											</TableCell>
											<TableCell
												size="dense"
												className={cn(
													positionsPanelTableCellClass,
													historyTableCellClass,
													"text-right text-market-close-fg",
												)}
											>
												{formatNumber(fill.sz, markets.getSzDecimals(fill.coin))}
											</TableCell>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, historyTableCellClass, "text-right text-xs")}
											>
												<span className="text-market-close-muted">
													{formatToken(fill.fee, {
														symbol: fill.feeToken,
													})}
												</span>
											</TableCell>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, historyTableCellClass, "text-right font-semibold")}
											>
												{closedPnl ? (
													<span className={getMarketCloseValueColorClass(closedPnl)}>
														{formatUSD(closedPnl, {
															signDisplay: "exceptZero",
														})}
													</span>
												) : (
													<span className="text-market-close-subtle">{FALLBACK_VALUE_PLACEHOLDER}</span>
												)}
											</TableCell>
											<TableCell
												size="dense"
												className={cn(
													positionsPanelTableCellClass,
													historyTableCellClass,
													"pe-5 text-right text-xs text-market-close-muted",
												)}
											>
												<div className="flex flex-col items-end">
													{hasExplorerTransaction ? (
														<a
															className="flex items-center gap-1 transition-colors duration-[120ms] hover:text-market-close-fg"
															href={getExplorerTxUrl(fill.hash, isTestnet)}
															target="_blank"
															rel="noopener noreferrer"
														>
															<span>{formatDateTimeShort(fill.time, { locale })}</span>
															<ArrowSquareOutIcon
																className="size-2.5 text-market-close-stroke-control"
																aria-hidden="true"
															/>
														</a>
													) : (
														<span>{formatDateTimeShort(fill.time, { locale })}</span>
													)}
												</div>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</ScrollArea>
				)}
			</div>
			{isConnected && address ? (
				<div className="flex h-[38px] shrink-0 items-center gap-4 px-5" data-testid="trade-history-footer">
					<Button
						nativeButton={false}
						variant="ghost"
						intent="neutral"
						size="xxs"
						className={historyFooterButtonClass}
						render={<Link to="/tradeHistory/$address" params={{ address }} />}
					>
						{t`View all`}
					</Button>
					<Button
						variant="ghost"
						intent="neutral"
						size="xxs"
						className={historyFooterButtonClass}
						disabled={isExporting}
						onClick={() => void exportCsv()}
					>
						{t`Export CSV`}
					</Button>
				</div>
			) : null}
		</div>
	);
}
