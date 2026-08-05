import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { MAX_HISTORY_ROWS } from "@/config/trade";
import { getToolbarAbsoluteSize, getToolbarFundingTotal } from "@/domain/trade/trading-toolbar-metrics";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { buildCsvRows, downloadCsv } from "@/lib/csv";
import { formatDateTimeShort, formatPercent, formatToken, formatUSD } from "@/lib/format";
import { useMarkets, useSubscription } from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import { getMarketCloseValueColorClass } from "@/lib/ui/value-color";
import { AssetBadge } from "../components/asset-badge";
import { Placeholder } from "./placeholder";
import {
	positionsPanelTableBodyClass,
	positionsPanelTableCellClass,
	positionsPanelTableHeaderRowClass,
	positionsPanelTableShellClass,
	positionsPanelTabRootClass,
} from "./positions-panel-table-styles";

const fundingTableHeadClass =
	"sticky top-0 z-[1] h-[33px] bg-surface px-2 py-0 text-[11px] leading-4 font-semibold normal-case tracking-normal text-market-close-subtle";
const fundingTableCellClass = "h-10 px-2 py-0 text-[13px] leading-[18px]";
const fundingAssetClass =
	"h-auto min-h-0 rounded-[4px] border-0 bg-transparent p-0 shadow-none hover:bg-transparent active:not-data-disabled:scale-100";
const fundingFooterButtonClass =
	"h-auto min-h-0 rounded-none p-0 text-xs font-normal text-market-close-muted shadow-none transition-colors duration-[120ms] hover:bg-transparent hover:text-market-close-fg active:not-data-disabled:scale-100 data-disabled:text-market-close-subtle";

export function FundingTab() {
	const { address, isConnected } = useWalletSession();
	const navigateToMarket = useMarketNavigation();
	const {
		data: fundingEvent,
		status,
		error,
	} = useSubscription("userFundings", { user: address ?? "0x0" }, { enabled: isConnected && !!address });
	const markets = useMarkets();

	const updates = fundingEvent?.fundings?.slice(0, MAX_HISTORY_ROWS).sort((a, b) => b.time - a.time) ?? [];
	const totalFunding = getToolbarFundingTotal(updates);

	const headerTotal = formatUSD(totalFunding, { signDisplay: "exceptZero" });
	const headerClass = totalFunding === null ? "text-market-close-subtle" : getMarketCloseValueColorClass(totalFunding);

	function handleExportCsv() {
		downloadCsv(
			"funding_history.csv",
			buildCsvRows(updates, [
				{ header: t`Time`, getValue: (update) => formatDateTimeShort(update.time) },
				{ header: t`Asset`, getValue: (update) => update.coin },
				{
					header: t`Position`,
					getValue: (update) => {
						const market = markets.getMarket(update.coin);
						return formatToken(getToolbarAbsoluteSize(update.szi), {
							decimals: market?.szDecimals,
							symbol: market?.shortName,
						});
					},
				},
				{
					header: t`Rate`,
					getValue: (update) =>
						formatPercent(update.fundingRate, { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
				},
				{ header: t`Payment`, getValue: (update) => formatToken(update.usdc, { symbol: "USDC" }) },
			]),
		);
	}

	function renderPlaceholder() {
		if (!isConnected) return <Placeholder>{t`Connect your wallet to view funding payments.`}</Placeholder>;
		if (status === "subscribing" || status === "idle")
			return <Placeholder>{t`Loading funding history...`}</Placeholder>;
		if (status === "error") {
			return (
				<Placeholder variant="error">
					<span>{t`Failed to load funding history.`}</span>
					{error instanceof Error && <span className="mt-1 text-xs text-fg-muted">{error.message}</span>}
				</Placeholder>
			);
		}
		if (updates.length === 0) return <Placeholder>{t`No funding payments found.`}</Placeholder>;
		return null;
	}

	const placeholder = renderPlaceholder();

	return (
		<div className={positionsPanelTabRootClass}>
			<div className="flex h-[38px] shrink-0 items-center justify-end border-b border-market-close-stroke-card px-5 font-market-close">
				{isConnected && status === "active" ? (
					<span className="whitespace-nowrap text-xs text-market-close-muted">
						{t`Cumulative funding`} <span className={cn("font-bold tabular-nums", headerClass)}>{headerTotal}</span>
					</span>
				) : null}
			</div>
			<div className={positionsPanelTableShellClass}>
				{placeholder ?? (
					<ScrollArea className="h-full w-full">
						<Table className="table-fixed min-w-[1280px] w-full font-market-close tabular-nums">
							<colgroup>
								<col className="w-[138px]" />
								<col />
								<col className="w-[146px]" />
								<col className="w-[166px]" />
								<col className="w-[178px]" />
							</colgroup>
							<TableHeader className="bg-surface [&_tr]:border-market-close-stroke-card [&_tr]:border-t-0">
								<TableRow className={positionsPanelTableHeaderRowClass}>
									<TableHead scope="col" size="dense" className={cn(fundingTableHeadClass, "pl-5 text-left")}>
										{t`Asset`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(fundingTableHeadClass, "text-right")}>
										{t`Position`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(fundingTableHeadClass, "text-right")}>
										{t`Rate`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(fundingTableHeadClass, "text-right")}>
										{t`Payment`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(fundingTableHeadClass, "pr-5 text-right")}>
										{t`Time`}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className={cn(positionsPanelTableBodyClass, "[&_tr]:border-market-close-stroke-card/60")}>
								{updates.map((update, index) => {
									const market = markets.getMarket(update.coin);
									const positionSize = getToolbarAbsoluteSize(update.szi);
									const paymentClass = toBig(update.usdc)
										? getMarketCloseValueColorClass(update.usdc)
										: "text-market-close-subtle";

									return (
										<TableRow
											key={`${update.coin}-${update.time}-${index}`}
											className="transition-colors duration-[120ms] hover:bg-market-close-card"
										>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, fundingTableCellClass, "pl-5 font-bold")}
											>
												<AssetBadge
													coin={update.coin}
													onClick={() => navigateToMarket(update.coin)}
													aria-label={t`Switch to ${update.coin} market`}
													className={fundingAssetClass}
													nameClassName="text-[13px] leading-[18px] font-bold text-market-close-fg"
													fit
												/>
											</TableCell>
											<TableCell
												size="dense"
												className={cn(
													positionsPanelTableCellClass,
													fundingTableCellClass,
													"text-right text-market-close-fg",
												)}
											>
												{formatToken(positionSize, { decimals: market?.szDecimals, symbol: market?.shortName })}
											</TableCell>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, fundingTableCellClass, "text-right")}
											>
												<span className="text-market-close-muted">
													{formatPercent(update.fundingRate, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
												</span>
											</TableCell>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, fundingTableCellClass, "text-right font-semibold")}
											>
												<span className={paymentClass}>{formatToken(update.usdc, { symbol: "USDC" })}</span>
											</TableCell>

											<TableCell
												size="dense"
												className={cn(
													positionsPanelTableCellClass,
													fundingTableCellClass,
													"pr-5 text-right text-xs text-market-close-muted",
												)}
											>
												<div className="flex flex-col items-end">
													<span>{formatDateTimeShort(update.time)}</span>
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
			{isConnected && status === "active" ? (
				<div className="flex h-[38px] shrink-0 items-center gap-4 px-5" data-testid="funding-history-footer">
					<Button
						variant="ghost"
						intent="neutral"
						size="xxs"
						className={fundingFooterButtonClass}
						disabled={updates.length === 0}
						onClick={handleExportCsv}
					>
						{t`Export CSV`}
					</Button>
				</div>
			) : null}
		</div>
	);
}
