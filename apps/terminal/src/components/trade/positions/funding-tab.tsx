import { useLingui } from "@lingui/react/macro";
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@sairn/ui";
import { Link } from "@tanstack/react-router";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getToolbarAbsoluteSize, getToolbarFundingTotal } from "@/domain/trade/trading-toolbar-metrics";
import { useFundingHistoryCsvExport } from "@/hooks/trade/use-history-csv-export";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useUserFunding } from "@/hooks/trade/use-user-funding";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { buildCsvRows } from "@/lib/csv";
import { formatDateTimeShort, useNumberFormat } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import { getMarketCloseValueColorClass } from "@/lib/ui/value-color";
import { AssetBadge } from "../components/asset-badge";
import { DesktopTabToolbarPortal } from "./desktop-tab-toolbar-portal";
import { PassiveDataPlaceholder } from "./passive-data-placeholder";
import { Placeholder } from "./placeholder";
import {
	positionsPanelTableBodyClass,
	positionsPanelTableCellClass,
	positionsPanelTableHeaderRowClass,
	positionsPanelTableShellClass,
	positionsPanelTabRootClass,
} from "./positions-panel-table-styles";

const fundingTableHeadClass =
	"sticky top-0 z-[1] h-[33px] bg-surface px-2 py-0 text-2xs leading-4 font-semibold normal-case tracking-normal text-market-close-subtle";
const fundingTableCellClass = "h-10 px-2 py-0 text-2sm leading-[18px]";
const fundingAssetClass =
	"h-auto min-h-0 rounded-[4px] border-0 bg-transparent p-0 shadow-none hover:bg-transparent active:not-data-disabled:scale-100";
const fundingFooterActionClass =
	"h-auto min-h-0 rounded-none p-0 text-xs font-normal text-market-close-muted shadow-none transition-colors duration-[120ms] hover:bg-transparent hover:text-market-close-fg active:not-data-disabled:scale-100 data-disabled:text-market-close-subtle";
interface Props {
	toolbarTarget?: HTMLElement | null;
}

function FundingLoadingPlaceholder() {
	const { t } = useLingui();

	return (
		<div className="flex h-full w-full flex-col">
			<output aria-live="polite" className="sr-only">
				{t`Loading funding payments.`}
			</output>
			<PassiveDataPlaceholder busy />
		</div>
	);
}

export function FundingTab({ toolbarTarget }: Props = {}) {
	const { i18n, t } = useLingui();
	const locale = i18n.locale;
	const { formatPercent, formatToken, formatUSD } = useNumberFormat();
	const navigateToMarket = useMarketNavigation();
	const { error, fundings: updates, isConnected, isOffline, isStale, status } = useUserFunding();
	const { address } = useWalletSession();
	const markets = useMarkets();
	const totalFunding = getToolbarFundingTotal(updates);

	const headerTotal = formatUSD(totalFunding, { signDisplay: "exceptZero" });
	const headerClass = totalFunding === null ? "text-market-close-subtle" : getMarketCloseValueColorClass(totalFunding);

	const { exportCsv, isExporting } = useFundingHistoryCsvExport({
		filename: "funding_history.csv",
		buildRows: (fundings) =>
			buildCsvRows(fundings, [
				{ header: t`Time`, getValue: (update) => formatDateTimeShort(update.time, { locale: i18n.locale }) },
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
	});

	function renderPlaceholder() {
		if (!isConnected) return <Placeholder>{t`Connect your wallet to view funding payments.`}</Placeholder>;
		if (status === "loading" || status === "idle") return <FundingLoadingPlaceholder />;
		if (status !== "ready" || (updates.length === 0 && (error || isOffline || isStale)))
			return <PassiveDataPlaceholder />;
		if (updates.length === 0) return <Placeholder>{t`No funding payments found.`}</Placeholder>;
		return null;
	}

	const placeholder = renderPlaceholder();

	return (
		<div className={positionsPanelTabRootClass}>
			<DesktopTabToolbarPortal target={toolbarTarget}>
				<div data-testid="funding-history-toolbar" className="flex shrink-0 items-center gap-3 font-market-close">
					{isConnected && status === "ready" ? (
						<span className="whitespace-nowrap text-xs text-market-close-muted">
							{t`Funding shown`} <span className={cn("font-bold tabular-nums", headerClass)}>{headerTotal}</span>
						</span>
					) : null}
				</div>
			</DesktopTabToolbarPortal>
			<div className={positionsPanelTableShellClass}>
				{placeholder ?? (
					<ScrollArea className="h-full w-full">
						<Table
							containerClassName="overflow-visible"
							className="table-fixed min-w-[52rem] w-full font-market-close tabular-nums"
						>
							<colgroup>
								<col className="w-[136px]" />
								<col className="w-[176px]" />
								<col className="w-[144px]" />
								<col className="w-[160px]" />
								<col className="w-[216px]" />
							</colgroup>
							<TableHeader className="bg-surface [&_tr]:border-market-close-stroke-card [&_tr]:border-t-0">
								<TableRow className={positionsPanelTableHeaderRowClass}>
									<TableHead scope="col" size="dense" className={cn(fundingTableHeadClass, "ps-5 text-start")}>
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
									<TableHead scope="col" size="dense" className={cn(fundingTableHeadClass, "pe-5 text-right")}>
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
												className={cn(positionsPanelTableCellClass, fundingTableCellClass, "ps-5 font-bold")}
											>
												<AssetBadge
													coin={update.coin}
													onClick={() => navigateToMarket(update.coin)}
													aria-label={t`Switch to ${update.coin} market`}
													className={fundingAssetClass}
													nameClassName="text-2sm leading-[18px] font-bold text-market-close-fg"
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
													"pe-5 text-right text-xs text-market-close-muted",
												)}
											>
												<div className="flex flex-col items-end">
													<span>{formatDateTimeShort(update.time, { locale })}</span>
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
				<div className="flex h-[38px] shrink-0 items-center gap-4 px-5" data-testid="funding-history-footer">
					<Button
						nativeButton={false}
						variant="ghost"
						intent="neutral"
						size="xxs"
						className={fundingFooterActionClass}
						render={<Link to="/fundingHistory/$address" params={{ address }} />}
					>
						{t`View all`}
					</Button>
					<Button
						variant="ghost"
						intent="neutral"
						size="xxs"
						className={fundingFooterActionClass}
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
