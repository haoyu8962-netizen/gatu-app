import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { ArrowSquareOutIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAccountLedger } from "@/hooks/trade/use-account-ledger";
import { useAccountLedgerCsv } from "@/hooks/trade/use-account-ledger-csv";
import { useAccountLedgerLabels } from "@/hooks/trade/use-account-ledger-labels";
import { cn } from "@/lib/cn";
import { formatDateTimeShort } from "@/lib/format";
import { formatAccountLedgerAmount, formatAccountLedgerFee } from "@/lib/trade/account-ledger-format";
import { getAccountLedgerExplorerUrl } from "@/lib/trade/account-ledger-links";
import { isIncompleteHistorySnapshotError } from "@/lib/trade/history-pagination";
import { toNumber } from "@/lib/trade/numbers";
import { getValueColorClass } from "@/lib/ui/value-color";
import { useIsTestnet } from "@/stores/use-global-settings-store";
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

export function AccountTransfersTab() {
	const { t } = useLingui();
	const { error, isConnected, retry, rows, status } = useAccountLedger();
	const { getActionLabel, getLocationLabel } = useAccountLedgerLabels();
	const { exportCsv, isExporting } = useAccountLedgerCsv();
	const isTestnet = useIsTestnet();
	const historyLimitReached = isIncompleteHistorySnapshotError(error);

	function renderPlaceholder() {
		if (!isConnected) return <Placeholder>{t`Connect your wallet to view deposits and withdrawals.`}</Placeholder>;
		if (status === "loading" || status === "idle") {
			return <Placeholder>{t`Loading deposits and withdrawals...`}</Placeholder>;
		}
		if (status === "error") {
			return (
				<Placeholder variant="error">
					<span>{t`Failed to load deposits and withdrawals.`}</span>
					{historyLimitReached ? (
						<span className="mt-1 text-xs text-fg-muted">
							{t`Recent history exceeds the safe display limit. Export CSV to retrieve a larger range.`}
						</span>
					) : (
						<Button variant="outline" intent="neutral" size="xxs" className="mt-2" onClick={retry}>
							{t`Retry`}
						</Button>
					)}
				</Placeholder>
			);
		}
		if (rows.length === 0) return <Placeholder>{t`No deposits or withdrawals found.`}</Placeholder>;
		return null;
	}

	const placeholder = renderPlaceholder();

	return (
		<div className={positionsPanelTabRootClass}>
			<div className={cn(positionsPanelTableCaptionRowClass, "justify-between")}>
				<span className="tabular-nums text-3xs text-fg-muted">{isConnected ? rows.length : null}</span>
				<Button
					variant="ghost"
					intent="neutral"
					size="xxs"
					disabled={!isConnected || isExporting}
					onClick={() => void exportCsv()}
					iconLeft={<DownloadSimpleIcon className={cn("size-3", isExporting && "animate-pulse")} aria-hidden="true" />}
				>
					{t`Export CSV`}
				</Button>
			</div>
			<div className={positionsPanelTableShellClass}>
				{placeholder ?? (
					<ScrollArea className="h-full w-full">
						<Table className="table-fixed min-w-[58rem] w-full">
							<TableHeader className={positionsPanelTableHeaderClass}>
								<TableRow className={positionsPanelTableHeaderRowClass}>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[18%]")}
									>{t`Time`}</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[14%]")}
									>{t`Status`}</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[14%]")}
									>{t`Action`}</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[13%]")}
									>{t`Source`}</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[13%]")}
									>{t`Destination`}</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[14%]")}
									>{t`Account Value Change`}</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[14%]")}
									>{t`Fee`}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className={positionsPanelTableBodyClass}>
								{rows.map((row, index) => {
									const explorerUrl = getAccountLedgerExplorerUrl(row, isTestnet);
									const amount = toNumber(row.amount);

									return (
										<TableRow
											key={row.id}
											className={cn(positionsPanelRowHoverClass, index % 2 === 1 && positionsPanelRowStripeClass)}
										>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, "text-fg-muted tabular-nums")}
											>
												<a
													href={explorerUrl ?? undefined}
													target="_blank"
													rel="noopener noreferrer"
													className="inline-flex items-center gap-1 underline decoration-dashed decoration-fg-muted/30 hover:text-fg"
												>
													{formatDateTimeShort(row.time)}
													<ArrowSquareOutIcon className="size-2.5" aria-hidden="true" />
												</a>
											</TableCell>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, "text-success")}
											>{t`Completed`}</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, "text-fg")}>
												{getActionLabel(row.action, row.rawType)}
											</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, "text-fg-muted")}>
												{getLocationLabel(row.source)}
											</TableCell>
											<TableCell size="dense" className={cn(positionsPanelTableCellClass, "text-fg-muted")}>
												{getLocationLabel(row.destination)}
											</TableCell>
											<TableCell
												size="dense"
												className={cn(
													positionsPanelTableCellClass,
													"tabular-nums",
													amount !== null && getValueColorClass(amount),
												)}
											>
												{formatAccountLedgerAmount(row)}
											</TableCell>
											<TableCell
												size="dense"
												className={cn(positionsPanelTableCellClass, "tabular-nums", row.fee && "text-error")}
											>
												{formatAccountLedgerFee(row)}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</ScrollArea>
				)}
			</div>
		</div>
	);
}
