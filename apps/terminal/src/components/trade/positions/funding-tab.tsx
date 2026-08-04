import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
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
import { getValueColorClass } from "@/lib/ui/value-color";
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
	const headerClass = totalFunding === null ? "text-fg-muted" : getValueColorClass(totalFunding);

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
			<div className={positionsPanelTableCaptionRowClass}>
				{isConnected && status === "active" ? (
					<span className="text-3xs text-fg-muted">
						{t`Cumulative funding`} <span className={cn("font-medium tabular-nums", headerClass)}>{headerTotal}</span>
					</span>
				) : null}
			</div>
			<div className={positionsPanelTableShellClass}>
				{placeholder ?? (
					<ScrollArea className="h-full w-full">
						<Table className="table-fixed min-w-[38rem] w-full">
							<TableHeader className={positionsPanelTableHeaderClass}>
								<TableRow className={positionsPanelTableHeaderRowClass}>
									<TableHead scope="col" size="dense" className={cn(positionsPanelTableHeadClass, "w-[22%] text-left")}>
										{t`Asset`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[18%] text-right")}
									>
										{t`Position`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[18%] text-right")}
									>
										{t`Rate`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[22%] text-right")}
									>
										{t`Payment`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[20%] text-right")}
									>
										{t`Time`}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className={positionsPanelTableBodyClass}>
								{updates.map((update, index) => {
									const market = markets.getMarket(update.coin);
									const positionSize = getToolbarAbsoluteSize(update.szi);
									const paymentClass = toBig(update.usdc) ? getValueColorClass(update.usdc) : "text-fg-muted";

									return (
										<TableRow
											key={`${update.coin}-${update.time}-${index}`}
											className={cn(positionsPanelRowHoverClass, index % 2 === 1 && positionsPanelRowStripeClass)}
										>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, "font-medium text-fg")}>
												<AssetBadge
													coin={update.coin}
													onClick={() => navigateToMarket(update.coin)}
													aria-label={t`Switch to ${update.coin} market`}
												/>
											</TableCell>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, "text-right tabular-nums text-fg")}
											>
												{formatToken(positionSize, { decimals: market?.szDecimals, symbol: market?.shortName })}
											</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, "text-right tabular-nums")}>
												<span className="text-fg-muted">
													{formatPercent(update.fundingRate, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
												</span>
											</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, "text-right tabular-nums")}>
												<span className={paymentClass}>{formatToken(update.usdc, { symbol: "USDC" })}</span>
											</TableCell>

											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, "text-right tabular-nums text-fg-muted")}
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
				<div className="flex shrink-0 items-center gap-4 px-5 py-2.5" data-testid="funding-history-footer">
					<Button
						variant="ghost"
						intent="neutral"
						size="xxs"
						disabled={updates.length === 0}
						onClick={handleExportCsv}
						iconLeft={<DownloadSimpleIcon className="size-3" aria-hidden="true" />}
					>
						{t`Export CSV`}
					</Button>
				</div>
			) : null}
		</div>
	);
}
